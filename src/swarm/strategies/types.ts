/**
 * Bidding Strategy Types and Interface
 *
 * Defines the contract for all bidding strategies in the swarm.
 * Each strategy encapsulates decision-making logic for different market conditions.
 */

import type {
  BiddingStrategy,
  MarketAgentConfig,
  MonetaryBudget,
  NormalizedListing,
  SwarmEvent,
} from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Possible actions a strategy can recommend.
 */
export type StrategyAction =
  | 'BID'           // Place auction bid
  | 'OFFER'         // Submit best offer
  | 'WATCH'         // Add to watchlist, wait for better opportunity
  | 'SKIP'          // Do not engage with this listing
  | 'COUNTER'       // Counter an offer
  | 'ACCEPT'        // Accept current terms
  | 'DECLINE';      // Decline and move on

/**
 * Decision output from a strategy evaluation.
 */
export interface StrategyDecision {
  /** Recommended action */
  action: StrategyAction;

  /** Amount to bid/offer (if action is BID or OFFER) */
  amount?: number;

  /** Currency for the amount */
  currency?: string;

  /** Delay before executing (for timing-sensitive strategies like sniping) */
  delayMs?: number;

  /** Confidence score (0-1) for this decision */
  confidence: number;

  /** Human-readable reasoning */
  reasoning: string;

  /** Additional metadata for logging/analysis */
  metadata?: Record<string, unknown>;
}

/**
 * Context provided to strategy for decision-making.
 */
export interface StrategyContext {
  /** The listing being evaluated */
  listing: NormalizedListing;

  /** Agent's current configuration */
  agentConfig: MarketAgentConfig;

  /** Remaining budget for this agent */
  remainingBudget: MonetaryBudget;

  /** Historical events for this agent */
  agentHistory: SwarmEvent[];

  /** Current time (for auction timing calculations) */
  currentTime: Date;

  /** Previous interactions with this listing (if any) */
  listingHistory?: SwarmEvent[];

  /** Market context - average prices for similar items */
  marketContext?: MarketContext;
}

/**
 * Market context for informed decision-making.
 */
export interface MarketContext {
  /** Average price for similar completed sales */
  averagePrice: number;

  /** Price range (min, max) for similar items */
  priceRange: { min: number; max: number };

  /** Number of similar items currently available */
  supplyCount: number;

  /** Historical win rate at various price points */
  priceWinRates?: Array<{ price: number; winRate: number }>;

  /** Seller reputation score (if available) */
  sellerReputation?: number;
}

/**
 * Counter-offer context for negotiation strategies.
 */
export interface CounterOfferContext extends StrategyContext {
  /** The counter-offer amount from seller */
  counterAmount: number;

  /** Original offer amount we submitted */
  originalOffer: number;

  /** Number of negotiation rounds so far */
  negotiationRound: number;

  /** Seller's message (if any) */
  sellerMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strategy capability flags.
 */
export interface StrategyCapabilities {
  /** Can participate in auctions */
  supportsAuctions: boolean;

  /** Can submit best offers */
  supportsOffers: boolean;

  /** Can handle counter-offers */
  supportsNegotiation: boolean;

  /** Can buy it now */
  supportsBuyItNow: boolean;

  /** Requires precise timing (e.g., sniping) */
  requiresPreciseTiming: boolean;
}

/**
 * Strategy configuration options.
 */
export interface StrategyConfig {
  /** Maximum percentage above market average to pay */
  maxPremiumPercent?: number;

  /** Minimum discount below market to require (for passive strategy) */
  minDiscountPercent?: number;

  /** Snipe timing: seconds before auction end */
  snipeWindowSeconds?: number;

  /** Opening bid as percentage of max budget */
  openingBidPercent?: number;

  /** Negotiation starting offer as percentage of asking price */
  initialOfferPercent?: number;

  /** Maximum negotiation rounds before walking away */
  maxNegotiationRounds?: number;

  /** Concession rate per round (percentage to increase offer) */
  concessionRatePercent?: number;

  /** Custom parameters for hybrid strategies */
  customParams?: Record<string, unknown>;
}

/**
 * Interface that all bidding strategies must implement.
 */
export interface BiddingStrategyInterface {
  /** Strategy identifier */
  readonly strategyType: BiddingStrategy;

  /** Human-readable name */
  readonly name: string;

  /** Strategy description */
  readonly description: string;

  /** Capability flags */
  readonly capabilities: StrategyCapabilities;

  /**
   * Evaluate a listing and decide whether/how to engage.
   */
  evaluate(context: StrategyContext): Promise<StrategyDecision>;

  /**
   * Handle a counter-offer from a seller.
   * Returns null if strategy doesn't support negotiation.
   */
  handleCounterOffer?(context: CounterOfferContext): Promise<StrategyDecision | null>;

  /**
   * Calculate optimal bid amount for an auction.
   */
  calculateBidAmount(context: StrategyContext): number;

  /**
   * Calculate optimal offer amount for best offer.
   */
  calculateOfferAmount(context: StrategyContext): number;

  /**
   * Determine if listing meets strategy's criteria.
   */
  meetsListingCriteria(listing: NormalizedListing, config: MarketAgentConfig): boolean;

  /**
   * Update configuration at runtime.
   */
  configure(config: Partial<StrategyConfig>): void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE STRATEGY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class with common strategy logic.
 */
export abstract class BaseStrategy implements BiddingStrategyInterface {
  abstract readonly strategyType: BiddingStrategy;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: StrategyCapabilities;

  protected config: StrategyConfig = {};

  constructor(config?: StrategyConfig) {
    if (config) {
      this.config = { ...config };
    }
  }

  abstract evaluate(context: StrategyContext): Promise<StrategyDecision>;

  handleCounterOffer?(context: CounterOfferContext): Promise<StrategyDecision | null>;

  /**
   * Default bid calculation: bid up to remaining budget or listing price.
   */
  calculateBidAmount(context: StrategyContext): number {
    const { listing, remainingBudget, marketContext } = context;

    // Don't bid more than we have
    const maxBid = remainingBudget.value;

    // Use market context if available
    if (marketContext) {
      const fairValue = marketContext.averagePrice;
      const maxPremium = this.config.maxPremiumPercent ?? 20;
      const maxFairBid = fairValue * (1 + maxPremium / 100);
      return Math.min(maxBid, maxFairBid);
    }

    // Fall back to listing price with buffer
    const currentPrice = listing.currentPrice;
    return Math.min(maxBid, currentPrice * 1.1);
  }

  /**
   * Default offer calculation: percentage of asking price.
   */
  calculateOfferAmount(context: StrategyContext): number {
    const { listing, remainingBudget } = context;

    const askingPrice = listing.buyItNowPrice ?? listing.currentPrice;
    const offerPercent = this.config.initialOfferPercent ?? 70;
    const calculatedOffer = askingPrice * (offerPercent / 100);

    return Math.min(remainingBudget.value, calculatedOffer);
  }

  /**
   * Check if listing meets agent's target criteria.
   */
  meetsListingCriteria(listing: NormalizedListing, config: MarketAgentConfig): boolean {
    const { targetCriteria } = config;

    // Check price range
    if (targetCriteria.maxPrice !== undefined && listing.currentPrice > targetCriteria.maxPrice) {
      return false;
    }
    if (targetCriteria.minPrice !== undefined && listing.currentPrice < targetCriteria.minPrice) {
      return false;
    }

    // Check condition
    if (targetCriteria.conditions?.length) {
      const normalizedCondition = listing.condition?.toLowerCase() ?? '';
      const matchesCondition = targetCriteria.conditions.some(
        c => normalizedCondition.includes(c.toLowerCase())
      );
      if (!matchesCondition) {
        return false;
      }
    }

    // Check excluded sellers
    if (targetCriteria.excludeSellers?.includes(listing.sellerId)) {
      return false;
    }

    // Check preferred sellers (if specified, must match)
    if (targetCriteria.preferredSellers?.length) {
      if (!targetCriteria.preferredSellers.includes(listing.sellerId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Update configuration.
   */
  configure(config: Partial<StrategyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate time remaining until auction end.
   */
  protected getTimeRemainingMs(listing: NormalizedListing, currentTime: Date): number {
    if (!listing.auctionEndTime) {
      return Infinity;
    }
    return new Date(listing.auctionEndTime).getTime() - currentTime.getTime();
  }

  /**
   * Check if within snipe window.
   */
  protected isInSnipeWindow(listing: NormalizedListing, currentTime: Date): boolean {
    const snipeSeconds = this.config.snipeWindowSeconds ?? 10;
    const remainingMs = this.getTimeRemainingMs(listing, currentTime);
    return remainingMs > 0 && remainingMs <= snipeSeconds * 1000;
  }

  /**
   * Calculate value score for a listing (0-1).
   * Higher score = better value.
   */
  protected calculateValueScore(listing: NormalizedListing, marketContext?: MarketContext): number {
    if (!marketContext) {
      return 0.5; // Unknown value
    }

    const currentPrice = listing.currentPrice;
    const avgPrice = marketContext.averagePrice;

    if (currentPrice >= avgPrice) {
      // At or above average - score decreases
      const premium = (currentPrice - avgPrice) / avgPrice;
      return Math.max(0, 0.5 - premium);
    } else {
      // Below average - score increases
      const discount = (avgPrice - currentPrice) / avgPrice;
      return Math.min(1, 0.5 + discount);
    }
  }

  /**
   * Check if price represents good value.
   */
  protected isGoodValue(listing: NormalizedListing, marketContext?: MarketContext): boolean {
    return this.calculateValueScore(listing, marketContext) >= 0.6;
  }

  /**
   * Create a skip decision with reasoning.
   */
  protected skipDecision(reason: string): StrategyDecision {
    return {
      action: 'SKIP',
      confidence: 0.9,
      reasoning: reason,
    };
  }

  /**
   * Create a watch decision with reasoning.
   */
  protected watchDecision(reason: string): StrategyDecision {
    return {
      action: 'WATCH',
      confidence: 0.7,
      reasoning: reason,
    };
  }
}
