/**
 * Early Aggressive Bidding Strategy
 *
 * Places high bids early in the auction to discourage competition.
 * The theory: a strong opening bid signals serious intent and can
 * scare away casual bidders.
 *
 * Key characteristics:
 * - Bids early, often as opening bid or early in auction
 * - Bids at or near maximum willingness to pay
 * - Aims to win with single bid, avoiding bid wars
 * - Best for: time-constrained bidders, must-have items
 */

import {
  BaseStrategy,
  StrategyCapabilities,
  StrategyConfig,
  StrategyContext,
  StrategyDecision,
} from './types.js';
import type { BiddingStrategy } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_AGGRESSIVE_CONFIG: StrategyConfig = {
  /** Bid up to 25% above market average if needed */
  maxPremiumPercent: 25,

  /** Open with 85% of max bid to show strength */
  openingBidPercent: 85,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EARLY AGGRESSIVE STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

export class EarlyAggressiveStrategy extends BaseStrategy {
  readonly strategyType: BiddingStrategy = 'EARLY_AGGRESSIVE';
  readonly name = 'Early Aggressive';
  readonly description =
    'Places strong bids early in auctions to discourage competition. ' +
    'Shows serious intent with near-maximum opening bids.';

  readonly capabilities: StrategyCapabilities = {
    supportsAuctions: true,
    supportsOffers: true, // Can make strong opening offers too
    supportsNegotiation: false, // Doesn't negotiate - take it or leave it
    supportsBuyItNow: true, // Will use BIN if price is right
    requiresPreciseTiming: false,
  };

  constructor(config?: Partial<StrategyConfig>) {
    super({ ...DEFAULT_AGGRESSIVE_CONFIG, ...config });
  }

  /**
   * Evaluate whether to bid aggressively on this listing.
   */
  async evaluate(context: StrategyContext): Promise<StrategyDecision> {
    const { listing, remainingBudget, agentConfig, currentTime, marketContext } = context;

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS
    // ═══════════════════════════════════════════════════════════════════════

    if (!this.meetsListingCriteria(listing, agentConfig)) {
      return this.skipDecision('Listing does not meet target criteria');
    }

    if (remainingBudget.value <= 0) {
      return this.skipDecision('No budget remaining');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUY IT NOW OPPORTUNITY
    // ═══════════════════════════════════════════════════════════════════════

    // Check if Buy It Now is available and worth it
    if (listing.buyItNowPrice && listing.buyItNowPrice <= remainingBudget.value) {
      const binValue = this.assessBuyItNowValue(listing, marketContext);

      if (binValue === 'GOOD_DEAL') {
        return {
          action: 'BID', // Use BID action for BIN purchases
          amount: listing.buyItNowPrice,
          currency: remainingBudget.currency,
          confidence: 0.9,
          reasoning: `Buy It Now at $${listing.buyItNowPrice} is a good deal - ` +
            `${marketContext ? `${Math.round((1 - listing.buyItNowPrice / marketContext.averagePrice) * 100)}% below market average` : 'acting quickly to secure item'}`,
          metadata: {
            purchaseType: 'BUY_IT_NOW',
            marketAverage: marketContext?.averagePrice,
          },
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AUCTION BIDDING
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.isAuction) {
      return this.evaluateAuction(context);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BEST OFFER
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.bestOfferEnabled) {
      return this.evaluateOffer(context);
    }

    // Fixed price, no offers - either buy or skip
    if (listing.buyItNowPrice && listing.buyItNowPrice <= remainingBudget.value) {
      return {
        action: 'BID',
        amount: listing.buyItNowPrice,
        currency: remainingBudget.currency,
        confidence: 0.6,
        reasoning: 'Fixed price listing within budget - purchasing to secure item',
        metadata: { purchaseType: 'FIXED_PRICE' },
      };
    }

    return this.skipDecision('Fixed price exceeds budget');
  }

  /**
   * Evaluate auction opportunity.
   */
  private evaluateAuction(context: StrategyContext): StrategyDecision {
    const { listing, remainingBudget, currentTime, marketContext } = context;

    // Check if auction has ended
    if (listing.auctionEndTime) {
      const endTime = new Date(listing.auctionEndTime);
      if (currentTime >= endTime) {
        return this.skipDecision('Auction has ended');
      }
    }

    // Calculate our aggressive bid
    const maxBid = this.calculateBidAmount(context);

    // Current price already exceeds our max
    if (listing.currentPrice >= maxBid) {
      return this.skipDecision(
        `Current price ($${listing.currentPrice}) exceeds max bid ($${maxBid.toFixed(2)})`
      );
    }

    // Check if we're already the high bidder (would need bid history)
    // For now, bid if price is below our max

    // Calculate our opening bid (aggressive but not maximum)
    const openingPercent = this.config.openingBidPercent ?? 85;
    const bidAmount = Math.max(
      listing.currentPrice * 1.1, // At least 10% above current
      maxBid * (openingPercent / 100)
    );

    const finalBid = Math.min(bidAmount, remainingBudget.value, maxBid);

    // Determine confidence based on market position
    const confidence = this.calculateConfidence(listing, finalBid, marketContext);

    return {
      action: 'BID',
      amount: finalBid,
      currency: remainingBudget.currency,
      confidence,
      reasoning: this.generateBidReasoning(listing, finalBid, marketContext),
      metadata: {
        strategy: 'early_aggressive',
        maxBid,
        currentPrice: listing.currentPrice,
        bidCount: listing.bidCount,
        competitionLevel: this.assessCompetition(listing),
      },
    };
  }

  /**
   * Evaluate Best Offer opportunity.
   */
  private evaluateOffer(context: StrategyContext): StrategyDecision {
    const { listing, remainingBudget, marketContext } = context;

    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    const offerAmount = this.calculateOfferAmount(context);

    // Make sure we're not offering more than asking
    if (offerAmount >= askingPrice) {
      return {
        action: 'BID',
        amount: askingPrice,
        currency: remainingBudget.currency,
        confidence: 0.8,
        reasoning: 'Calculated offer exceeds asking price - purchasing at listed price',
      };
    }

    return {
      action: 'OFFER',
      amount: offerAmount,
      currency: remainingBudget.currency,
      confidence: 0.7,
      reasoning: `Making strong opening offer of $${offerAmount.toFixed(2)} ` +
        `(${Math.round((offerAmount / askingPrice) * 100)}% of asking price)`,
      metadata: {
        askingPrice,
        offerPercent: (offerAmount / askingPrice) * 100,
        marketAverage: marketContext?.averagePrice,
      },
    };
  }

  /**
   * Calculate bid amount - aggressive strategy bids near maximum.
   */
  calculateBidAmount(context: StrategyContext): number {
    const { listing, remainingBudget, marketContext } = context;

    let maxBid: number;

    if (marketContext) {
      const fairValue = marketContext.averagePrice;
      const maxPremium = this.config.maxPremiumPercent ?? 25;
      maxBid = fairValue * (1 + maxPremium / 100);
    } else {
      // Without market data, use listing price with premium allowance
      const basePrice = listing.buyItNowPrice ?? listing.currentPrice * 2;
      maxBid = basePrice * 0.9; // Willing to go up to 90% of BIN
    }

    return Math.min(maxBid, remainingBudget.value);
  }

  /**
   * Calculate offer amount - aggressive offers are higher (75-85% of asking).
   */
  calculateOfferAmount(context: StrategyContext): number {
    const { listing, remainingBudget, marketContext } = context;

    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    let offerPercent: number;

    if (marketContext && askingPrice <= marketContext.averagePrice * 0.9) {
      // Already below market - offer closer to asking
      offerPercent = 90;
    } else if (marketContext && askingPrice <= marketContext.averagePrice) {
      // At market value - offer 80%
      offerPercent = 80;
    } else {
      // Above market or unknown - offer 75%
      offerPercent = 75;
    }

    const offerAmount = askingPrice * (offerPercent / 100);
    return Math.min(offerAmount, remainingBudget.value);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Assess Buy It Now value.
   */
  private assessBuyItNowValue(
    listing: { buyItNowPrice?: number },
    marketContext?: { averagePrice: number }
  ): 'GOOD_DEAL' | 'FAIR' | 'OVERPRICED' {
    if (!listing.buyItNowPrice) return 'FAIR';

    if (!marketContext) {
      // Without market data, be more conservative
      return 'FAIR';
    }

    const priceRatio = listing.buyItNowPrice / marketContext.averagePrice;

    if (priceRatio <= 0.85) return 'GOOD_DEAL';
    if (priceRatio <= 1.1) return 'FAIR';
    return 'OVERPRICED';
  }

  /**
   * Assess competition level based on bid activity.
   */
  private assessCompetition(listing: { bidCount?: number }): 'LOW' | 'MEDIUM' | 'HIGH' {
    const bidCount = listing.bidCount ?? 0;
    if (bidCount <= 2) return 'LOW';
    if (bidCount <= 8) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Calculate confidence based on market position.
   */
  private calculateConfidence(
    listing: { currentPrice: number; bidCount?: number },
    bidAmount: number,
    marketContext?: { averagePrice: number }
  ): number {
    let confidence = 0.7; // Base confidence

    // Higher confidence if bidding below market
    if (marketContext && bidAmount < marketContext.averagePrice) {
      confidence += 0.1;
    }

    // Lower confidence with high competition
    const competition = this.assessCompetition(listing);
    if (competition === 'HIGH') confidence -= 0.15;
    else if (competition === 'MEDIUM') confidence -= 0.05;

    return Math.max(0.3, Math.min(0.95, confidence));
  }

  /**
   * Generate human-readable bid reasoning.
   */
  private generateBidReasoning(
    listing: { currentPrice: number; bidCount?: number },
    bidAmount: number,
    marketContext?: { averagePrice: number }
  ): string {
    const parts: string[] = [];

    parts.push(`Placing aggressive bid of $${bidAmount.toFixed(2)}`);

    if (marketContext) {
      const percentOfMarket = (bidAmount / marketContext.averagePrice) * 100;
      parts.push(`(${percentOfMarket.toFixed(0)}% of market average)`);
    }

    const competition = this.assessCompetition(listing);
    if (competition === 'LOW') {
      parts.push('- low competition, strong position');
    } else if (competition === 'HIGH') {
      parts.push(`- high competition (${listing.bidCount} bids), showing strength`);
    }

    return parts.join(' ');
  }
}
