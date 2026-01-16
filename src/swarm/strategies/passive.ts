/**
 * Passive Bidding Strategy
 *
 * Only engages with significantly underpriced listings.
 * Waits for exceptional deals rather than competing actively.
 *
 * Key characteristics:
 * - Requires large discount from market value (30%+)
 * - Minimal bidding activity
 * - Low risk, low effort, lower volume
 * - Best for: patient value seekers, large portfolios
 */

import {
  BaseStrategy,
  StrategyCapabilities,
  StrategyConfig,
  StrategyContext,
  StrategyDecision,
} from './types.js';
import type { BiddingStrategy, NormalizedListing } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PASSIVE_CONFIG: StrategyConfig = {
  /** Only buy at 30%+ below market */
  minDiscountPercent: 30,

  /** Maximum premium - passive never pays premium */
  maxPremiumPercent: 0,

  /** Conservative opening offer */
  initialOfferPercent: 50,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PASSIVE STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

export class PassiveStrategy extends BaseStrategy {
  readonly strategyType: BiddingStrategy = 'PASSIVE';
  readonly name = 'Passive';
  readonly description =
    'Only engages with significantly underpriced listings (30%+ below market). ' +
    'Patient approach that waits for exceptional deals rather than competing.';

  readonly capabilities: StrategyCapabilities = {
    supportsAuctions: true, // Will bid on underpriced auctions
    supportsOffers: true,   // Will make offers on underpriced items
    supportsNegotiation: false, // Doesn't negotiate - price must already be good
    supportsBuyItNow: true, // Primary method - snap up deals
    requiresPreciseTiming: false,
  };

  constructor(config?: Partial<StrategyConfig>) {
    super({ ...DEFAULT_PASSIVE_CONFIG, ...config });
  }

  /**
   * Evaluate whether listing meets passive strategy criteria.
   */
  async evaluate(context: StrategyContext): Promise<StrategyDecision> {
    const { listing, remainingBudget, agentConfig, marketContext, currentTime } = context;

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
    // VALUE ASSESSMENT (CRITICAL FOR PASSIVE)
    // ═══════════════════════════════════════════════════════════════════════

    // Passive strategy REQUIRES market context to assess value
    if (!marketContext) {
      return this.watchDecision(
        'Insufficient market data - passive strategy requires price comparison'
      );
    }

    const valueAssessment = this.assessValue(listing, marketContext);

    // Must meet minimum discount threshold
    if (!valueAssessment.meetsThreshold) {
      return {
        action: 'SKIP',
        confidence: 0.9,
        reasoning: valueAssessment.reasoning,
        metadata: {
          discountPercent: valueAssessment.discountPercent,
          requiredDiscount: this.config.minDiscountPercent ?? 30,
          currentPrice: listing.currentPrice,
          marketAverage: marketContext.averagePrice,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OPPORTUNITY DETECTED - DETERMINE BEST APPROACH
    // ═══════════════════════════════════════════════════════════════════════

    // Priority 1: Buy It Now (instant acquisition)
    if (listing.buyItNowPrice && listing.buyItNowPrice <= remainingBudget.value) {
      const binDiscount = this.calculateDiscount(listing.buyItNowPrice, marketContext.averagePrice);

      if (binDiscount >= (this.config.minDiscountPercent ?? 30)) {
        return {
          action: 'BID',
          amount: listing.buyItNowPrice,
          currency: remainingBudget.currency,
          confidence: 0.95,
          reasoning: `Exceptional value! Buy It Now at $${listing.buyItNowPrice} is ` +
            `${binDiscount.toFixed(0)}% below market average - acquiring immediately`,
          metadata: {
            purchaseType: 'BUY_IT_NOW',
            discountPercent: binDiscount,
            marketAverage: marketContext.averagePrice,
            savingsAmount: marketContext.averagePrice - listing.buyItNowPrice,
          },
        };
      }
    }

    // Priority 2: Auction with good current price
    if (listing.isAuction) {
      return this.evaluateAuction(context, valueAssessment);
    }

    // Priority 3: Best Offer on good deal
    if (listing.bestOfferEnabled) {
      return this.evaluateOffer(context, valueAssessment);
    }

    // Fixed price that meets our criteria but no BIN (shouldn't happen often)
    return this.watchDecision('Fixed price listing - watching for price drop');
  }

  /**
   * Evaluate auction opportunity.
   */
  private evaluateAuction(
    context: StrategyContext,
    valueAssessment: ValueAssessment
  ): StrategyDecision {
    const { listing, remainingBudget, currentTime, marketContext } = context;

    // Check if auction has ended
    if (listing.auctionEndTime) {
      const endTime = new Date(listing.auctionEndTime);
      if (currentTime >= endTime) {
        return this.skipDecision('Auction has ended');
      }
    }

    // For passive strategy, we set max bid at our discount threshold
    const maxBid = this.calculateMaxBid(marketContext!);

    // Current price already exceeds our max
    if (listing.currentPrice >= maxBid) {
      return this.skipDecision(
        `Current price ($${listing.currentPrice}) exceeds passive max ($${maxBid.toFixed(2)})`
      );
    }

    // Bid conservatively - at current price plus minimum increment
    const bidAmount = Math.min(
      listing.currentPrice * 1.05, // 5% above current
      maxBid,
      remainingBudget.value
    );

    return {
      action: 'BID',
      amount: bidAmount,
      currency: remainingBudget.currency,
      confidence: 0.8,
      reasoning: `Underpriced auction at ${valueAssessment.discountPercent.toFixed(0)}% below market - ` +
        `bidding conservatively at $${bidAmount.toFixed(2)}`,
      metadata: {
        currentPrice: listing.currentPrice,
        maxBid,
        discountPercent: valueAssessment.discountPercent,
        bidCount: listing.bidCount,
      },
    };
  }

  /**
   * Evaluate Best Offer opportunity.
   */
  private evaluateOffer(
    context: StrategyContext,
    valueAssessment: ValueAssessment
  ): StrategyDecision {
    const { listing, remainingBudget, marketContext } = context;

    // For passive strategy, offer at our target discount level
    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    const targetPrice = marketContext!.averagePrice * (1 - (this.config.minDiscountPercent ?? 30) / 100);
    const offerAmount = Math.min(targetPrice, remainingBudget.value);

    // Don't bother if our offer would be insulting (less than 40% of asking)
    if (offerAmount < askingPrice * 0.4) {
      return this.skipDecision('Target price too far below asking - unlikely to be accepted');
    }

    return {
      action: 'OFFER',
      amount: offerAmount,
      currency: remainingBudget.currency,
      confidence: 0.6, // Lower confidence - passive offers often rejected
      reasoning: `Submitting value-seeking offer of $${offerAmount.toFixed(2)} ` +
        `(${Math.round((offerAmount / askingPrice) * 100)}% of asking, ` +
        `${Math.round((1 - offerAmount / marketContext!.averagePrice) * 100)}% below market)`,
      metadata: {
        askingPrice,
        targetPrice,
        marketAverage: marketContext!.averagePrice,
        offerPercent: (offerAmount / askingPrice) * 100,
      },
    };
  }

  /**
   * Calculate bid amount - passive bids conservatively.
   */
  calculateBidAmount(context: StrategyContext): number {
    const { marketContext, remainingBudget } = context;

    if (!marketContext) {
      return 0; // Passive doesn't bid without market data
    }

    const maxBid = this.calculateMaxBid(marketContext);
    return Math.min(maxBid, remainingBudget.value);
  }

  /**
   * Calculate offer amount - targets significant discount.
   */
  calculateOfferAmount(context: StrategyContext): number {
    const { marketContext, remainingBudget } = context;

    if (!marketContext) {
      return 0;
    }

    const minDiscount = this.config.minDiscountPercent ?? 30;
    const targetPrice = marketContext.averagePrice * (1 - minDiscount / 100);

    return Math.min(targetPrice, remainingBudget.value);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate maximum bid based on discount requirement.
   */
  private calculateMaxBid(marketContext: { averagePrice: number }): number {
    const minDiscount = this.config.minDiscountPercent ?? 30;
    return marketContext.averagePrice * (1 - minDiscount / 100);
  }

  // Note: calculateDiscount() is inherited from BaseStrategy

  /**
   * Assess value of listing against market.
   */
  private assessValue(
    listing: NormalizedListing,
    marketContext: { averagePrice: number }
  ): ValueAssessment {
    const currentPrice = listing.currentPrice;
    const discountPercent = this.calculateDiscount(currentPrice, marketContext.averagePrice);
    const requiredDiscount = this.config.minDiscountPercent ?? 30;
    const meetsThreshold = discountPercent >= requiredDiscount;

    let reasoning: string;
    if (meetsThreshold) {
      reasoning = `Listing is ${discountPercent.toFixed(0)}% below market - meets passive threshold`;
    } else if (discountPercent > 0) {
      reasoning = `Listing is ${discountPercent.toFixed(0)}% below market - ` +
        `requires ${requiredDiscount}%+ discount`;
    } else {
      reasoning = `Listing is at or above market average - passive strategy skipping`;
    }

    return {
      discountPercent,
      meetsThreshold,
      reasoning,
      marketAverage: marketContext.averagePrice,
      currentPrice,
    };
  }

  /**
   * Check for exceptional opportunity (very rare, very underpriced).
   */
  isExceptionalOpportunity(listing: NormalizedListing, marketContext: { averagePrice: number }): boolean {
    const discount = this.calculateDiscount(listing.currentPrice, marketContext.averagePrice);
    return discount >= 50; // 50%+ discount is exceptional
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ValueAssessment {
  discountPercent: number;
  meetsThreshold: boolean;
  reasoning: string;
  marketAverage: number;
  currentPrice: number;
}
