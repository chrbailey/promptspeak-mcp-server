/**
 * Negotiator Bidding Strategy
 *
 * Specializes in Best Offer negotiations with calculated concessions.
 * Uses a multi-round approach to find the seller's true floor price.
 *
 * Key characteristics:
 * - Opens with low but reasonable offer (60-70% of asking)
 * - Makes calculated concessions each round
 * - Knows when to walk away vs. accept
 * - Best for: patient bidders, negotiable listings
 */

import {
  BaseStrategy,
  StrategyCapabilities,
  StrategyConfig,
  StrategyContext,
  StrategyDecision,
  CounterOfferContext,
} from './types.js';
import type { BiddingStrategy } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_NEGOTIATOR_CONFIG: StrategyConfig = {
  /** Maximum premium above market average */
  maxPremiumPercent: 10,

  /** Start offers at 65% of asking price */
  initialOfferPercent: 65,

  /** Maximum number of negotiation rounds */
  maxNegotiationRounds: 4,

  /** Increase offer by 8% each round */
  concessionRatePercent: 8,
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEGOTIATOR STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

export class NegotiatorStrategy extends BaseStrategy {
  readonly strategyType: BiddingStrategy = 'NEGOTIATOR';
  readonly name = 'Negotiator';
  readonly description =
    'Expert at Best Offer negotiations. Opens with strategic low offers and makes ' +
    'calculated concessions to find the seller\'s true floor price.';

  readonly capabilities: StrategyCapabilities = {
    supportsAuctions: false, // Doesn't participate in auctions
    supportsOffers: true,
    supportsNegotiation: true, // Core competency
    supportsBuyItNow: true, // If price drops low enough
    requiresPreciseTiming: false,
  };

  constructor(config?: Partial<StrategyConfig>) {
    super({ ...DEFAULT_NEGOTIATOR_CONFIG, ...config });
  }

  /**
   * Evaluate whether to negotiate on this listing.
   */
  async evaluate(context: StrategyContext): Promise<StrategyDecision> {
    const { listing, remainingBudget, agentConfig, marketContext } = context;

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS
    // ═══════════════════════════════════════════════════════════════════════

    if (!this.meetsListingCriteria(listing, agentConfig)) {
      return this.skipDecision('Listing does not meet target criteria');
    }

    if (remainingBudget.value <= 0) {
      return this.skipDecision('No budget remaining');
    }

    // Negotiator prefers Best Offer listings
    if (!listing.bestOfferEnabled) {
      // If not Best Offer, check if BIN is worth it
      if (listing.buyItNowPrice && this.isBuyItNowWorthIt(listing, marketContext)) {
        return {
          action: 'BID',
          amount: listing.buyItNowPrice,
          currency: remainingBudget.currency,
          confidence: 0.8,
          reasoning: 'Buy It Now price is below target - purchasing immediately',
          metadata: { purchaseType: 'BUY_IT_NOW' },
        };
      }

      return this.skipDecision('Negotiator strategy requires Best Offer enabled listings');
    }

    // Skip auctions
    if (listing.isAuction) {
      return this.skipDecision('Negotiator does not participate in auctions');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INITIAL OFFER CALCULATION
    // ═══════════════════════════════════════════════════════════════════════

    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    const maxWillingToPay = this.calculateMaxPrice(context);

    // Don't waste time if asking price exceeds our ceiling
    if (askingPrice > maxWillingToPay * 1.5) {
      return this.skipDecision(
        `Asking price ($${askingPrice}) too far above our max ($${maxWillingToPay.toFixed(2)})`
      );
    }

    // Calculate opening offer
    const openingOffer = this.calculateOfferAmount(context);

    // Check for existing negotiations on this listing
    const existingNegotiations = context.listingHistory?.filter(
      e => e.eventType === 'OFFER_SUBMITTED' || e.eventType === 'OFFER_COUNTERED'
    );

    if (existingNegotiations?.length) {
      // We're already in negotiation - defer to handleCounterOffer
      return this.watchDecision('Existing negotiation in progress - awaiting seller response');
    }

    return {
      action: 'OFFER',
      amount: openingOffer,
      currency: remainingBudget.currency,
      confidence: 0.75,
      reasoning: this.generateOpeningOfferReasoning(openingOffer, askingPrice, marketContext),
      metadata: {
        askingPrice,
        offerPercent: (openingOffer / askingPrice) * 100,
        maxWillingToPay,
        negotiationRound: 1,
        expectedRounds: this.estimateRoundsNeeded(openingOffer, maxWillingToPay),
      },
    };
  }

  /**
   * Handle counter-offer from seller.
   */
  async handleCounterOffer(context: CounterOfferContext): Promise<StrategyDecision> {
    const {
      listing,
      remainingBudget,
      counterAmount,
      originalOffer,
      negotiationRound,
      sellerMessage,
    } = context;

    const maxRounds = this.config.maxNegotiationRounds ?? 4;
    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    const maxWillingToPay = this.calculateMaxPrice(context);

    // ═══════════════════════════════════════════════════════════════════════
    // ANALYZE COUNTER-OFFER
    // ═══════════════════════════════════════════════════════════════════════

    const counterAnalysis = this.analyzeCounterOffer(
      originalOffer,
      counterAmount,
      askingPrice,
      maxWillingToPay
    );

    // Counter is at or below our max - accept!
    if (counterAmount <= maxWillingToPay) {
      return {
        action: 'ACCEPT',
        amount: counterAmount,
        currency: remainingBudget.currency,
        confidence: 0.9,
        reasoning: `Counter-offer of $${counterAmount.toFixed(2)} is within our target - accepting`,
        metadata: {
          originalOffer,
          negotiationRound,
          savingsFromAsking: askingPrice - counterAmount,
          ...counterAnalysis,
        },
      };
    }

    // Check if we've exceeded max rounds
    if (negotiationRound >= maxRounds) {
      return {
        action: 'DECLINE',
        confidence: 0.8,
        reasoning: `Max negotiation rounds (${maxRounds}) reached. ` +
          `Counter-offer $${counterAmount.toFixed(2)} exceeds max $${maxWillingToPay.toFixed(2)}`,
        metadata: {
          negotiationRound,
          maxRounds,
          counterAmount,
          maxWillingToPay,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CALCULATE COUNTER-COUNTER
    // ═══════════════════════════════════════════════════════════════════════

    const nextOffer = this.calculateNextOffer(
      originalOffer,
      counterAmount,
      maxWillingToPay,
      negotiationRound
    );

    // If our next offer would exceed max or match counter, stop
    if (nextOffer >= counterAmount) {
      if (counterAmount <= maxWillingToPay * 1.05) {
        // Within 5% of max - accept
        return {
          action: 'ACCEPT',
          amount: counterAmount,
          currency: remainingBudget.currency,
          confidence: 0.75,
          reasoning: `Counter $${counterAmount.toFixed(2)} is close to our max - accepting to close deal`,
        };
      }
      return {
        action: 'DECLINE',
        confidence: 0.7,
        reasoning: `Cannot improve on counter-offer of $${counterAmount.toFixed(2)}`,
      };
    }

    return {
      action: 'COUNTER',
      amount: nextOffer,
      currency: remainingBudget.currency,
      confidence: 0.7,
      reasoning: this.generateCounterReasoning(nextOffer, counterAmount, negotiationRound, sellerMessage),
      metadata: {
        previousOffer: originalOffer,
        sellerCounter: counterAmount,
        negotiationRound: negotiationRound + 1,
        concessionAmount: nextOffer - originalOffer,
        ...counterAnalysis,
      },
    };
  }

  /**
   * Calculate maximum price willing to pay.
   */
  private calculateMaxPrice(context: StrategyContext): number {
    const { remainingBudget, marketContext } = context;

    if (marketContext) {
      const maxPremium = this.config.maxPremiumPercent ?? 10;
      const marketMax = marketContext.averagePrice * (1 + maxPremium / 100);
      return Math.min(marketMax, remainingBudget.value);
    }

    // Without market data, use budget
    return remainingBudget.value;
  }

  /**
   * Calculate opening offer.
   */
  calculateOfferAmount(context: StrategyContext): number {
    const { listing, remainingBudget, marketContext } = context;

    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    let targetPercent = this.config.initialOfferPercent ?? 65;

    // Adjust based on market data
    if (marketContext) {
      const priceRatio = askingPrice / marketContext.averagePrice;

      if (priceRatio > 1.2) {
        // Overpriced - offer lower
        targetPercent = 55;
      } else if (priceRatio < 0.9) {
        // Already good deal - offer higher to win
        targetPercent = 80;
      }
    }

    const offerAmount = askingPrice * (targetPercent / 100);
    return Math.min(offerAmount, remainingBudget.value);
  }

  /**
   * Calculate bid amount (not used much by negotiator).
   */
  calculateBidAmount(context: StrategyContext): number {
    return this.calculateMaxPrice(context);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze seller's counter-offer behavior.
   */
  private analyzeCounterOffer(
    ourOffer: number,
    theirCounter: number,
    askingPrice: number,
    ourMax: number
  ): {
    sellerConcession: number;
    sellerConcessionPercent: number;
    gap: number;
    gapPercent: number;
    sellerFlexibility: 'RIGID' | 'MODERATE' | 'FLEXIBLE';
  } {
    const sellerConcession = askingPrice - theirCounter;
    const sellerConcessionPercent = (sellerConcession / askingPrice) * 100;
    const gap = theirCounter - ourOffer;
    const gapPercent = (gap / askingPrice) * 100;

    let sellerFlexibility: 'RIGID' | 'MODERATE' | 'FLEXIBLE';
    if (sellerConcessionPercent < 5) {
      sellerFlexibility = 'RIGID';
    } else if (sellerConcessionPercent < 15) {
      sellerFlexibility = 'MODERATE';
    } else {
      sellerFlexibility = 'FLEXIBLE';
    }

    return {
      sellerConcession,
      sellerConcessionPercent,
      gap,
      gapPercent,
      sellerFlexibility,
    };
  }

  /**
   * Calculate next offer in negotiation.
   */
  private calculateNextOffer(
    previousOffer: number,
    counterAmount: number,
    maxWilling: number,
    round: number
  ): number {
    const concessionRate = this.config.concessionRatePercent ?? 8;

    // Diminishing concessions as rounds progress
    const roundMultiplier = 1 - (round * 0.15);
    const concession = previousOffer * (concessionRate / 100) * Math.max(0.3, roundMultiplier);

    const nextOffer = previousOffer + concession;

    // Split the difference approach for later rounds
    if (round >= 2) {
      const splitDiff = previousOffer + (counterAmount - previousOffer) * 0.3;
      return Math.min(Math.max(nextOffer, splitDiff), maxWilling);
    }

    return Math.min(nextOffer, maxWilling);
  }

  /**
   * Estimate rounds needed to reach agreement.
   */
  private estimateRoundsNeeded(openingOffer: number, maxPrice: number): number {
    const concessionRate = this.config.concessionRatePercent ?? 8;
    const gap = maxPrice - openingOffer;
    const avgConcession = openingOffer * (concessionRate / 100);

    return Math.min(Math.ceil(gap / avgConcession), this.config.maxNegotiationRounds ?? 4);
  }

  /**
   * Check if BIN price is worth immediate purchase.
   */
  private isBuyItNowWorthIt(
    listing: { buyItNowPrice?: number },
    marketContext?: { averagePrice: number }
  ): boolean {
    if (!listing.buyItNowPrice) return false;

    if (marketContext) {
      // Buy if BIN is 20%+ below market
      return listing.buyItNowPrice <= marketContext.averagePrice * 0.8;
    }

    return false;
  }

  /**
   * Generate reasoning for opening offer.
   */
  private generateOpeningOfferReasoning(
    offer: number,
    askingPrice: number,
    marketContext?: { averagePrice: number }
  ): string {
    const parts: string[] = [];
    const offerPercent = Math.round((offer / askingPrice) * 100);

    parts.push(`Opening negotiation with $${offer.toFixed(2)} (${offerPercent}% of asking)`);

    if (marketContext) {
      const marketComparison = (offer / marketContext.averagePrice) * 100;
      parts.push(`- ${Math.round(marketComparison)}% of market average`);

      if (askingPrice > marketContext.averagePrice) {
        parts.push('- asking price above market, room to negotiate');
      }
    }

    return parts.join(' ');
  }

  /**
   * Generate reasoning for counter-offer.
   */
  private generateCounterReasoning(
    ourOffer: number,
    theirCounter: number,
    round: number,
    sellerMessage?: string
  ): string {
    const parts: string[] = [];

    parts.push(`Round ${round + 1}: Countering with $${ourOffer.toFixed(2)}`);
    parts.push(`(vs seller's $${theirCounter.toFixed(2)})`);

    if (sellerMessage) {
      parts.push(`- seller mentioned: "${sellerMessage.substring(0, 50)}..."`);
    }

    return parts.join(' ');
  }
}
