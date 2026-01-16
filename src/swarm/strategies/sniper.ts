/**
 * Sniper Bidding Strategy
 *
 * Waits until the final seconds of an auction to place a bid,
 * minimizing bid wars and competitor response time.
 *
 * Key characteristics:
 * - Watches auctions without bidding until snipe window
 * - Places single, decisive bid at the last moment
 * - Calculates max bid based on market value, not current price
 * - Best for: experienced bidders, price-sensitive purchases
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

const DEFAULT_SNIPER_CONFIG: StrategyConfig = {
  /** Bid within the last 10 seconds */
  snipeWindowSeconds: 10,

  /** Maximum premium above market average */
  maxPremiumPercent: 15,

  /** Bid at 95% of our max to leave room for increment */
  openingBidPercent: 95,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SNIPER STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

export class SniperStrategy extends BaseStrategy {
  readonly strategyType: BiddingStrategy = 'SNIPER';
  readonly name = 'Sniper';
  readonly description =
    'Waits until the final seconds of an auction to place a single, decisive bid. ' +
    'Minimizes bid wars by leaving competitors no time to respond.';

  readonly capabilities: StrategyCapabilities = {
    supportsAuctions: true,
    supportsOffers: false, // Sniping doesn't apply to offers
    supportsNegotiation: false,
    supportsBuyItNow: false, // Snipers want auction deals
    requiresPreciseTiming: true,
  };

  constructor(config?: Partial<StrategyConfig>) {
    super({ ...DEFAULT_SNIPER_CONFIG, ...config });
  }

  /**
   * Evaluate whether to snipe this auction.
   */
  async evaluate(context: StrategyContext): Promise<StrategyDecision> {
    const { listing, remainingBudget, currentTime } = context;

    // ═══════════════════════════════════════════════════════════════════════
    // PRE-FLIGHT CHECKS (using inherited helper)
    // ═══════════════════════════════════════════════════════════════════════

    const preFlightFailed = this.runPreFlightChecks(context, {
      requireAuction: true,
      requireAuctionEndTime: true,
    });
    if (preFlightFailed) return preFlightFailed;

    // ═══════════════════════════════════════════════════════════════════════
    // TIMING ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════

    const timeRemainingMs = this.getTimeRemainingMs(listing, currentTime);

    // Auction has ended (using inherited helper)
    const auctionEnded = this.checkAuctionEnded(listing, currentTime);
    if (auctionEnded) return auctionEnded;

    // Calculate our max bid
    const maxBid = this.calculateBidAmount(context);

    // Current price is already above our max (using inherited helper)
    const priceExceeded = this.checkPriceExceedsMax(listing, maxBid);
    if (priceExceeded) return priceExceeded;

    // ═══════════════════════════════════════════════════════════════════════
    // SNIPE WINDOW CHECK
    // ═══════════════════════════════════════════════════════════════════════

    const snipeWindowMs = (this.config.snipeWindowSeconds ?? 10) * 1000;

    if (timeRemainingMs > snipeWindowMs) {
      // Not yet in snipe window - watch and wait
      const minutesRemaining = Math.floor(timeRemainingMs / 60000);
      return {
        action: 'WATCH',
        confidence: 0.8,
        reasoning: `Watching auction - ${minutesRemaining} minutes until snipe window`,
        metadata: {
          timeRemainingMs,
          snipeWindowMs,
          scheduledSnipeTime: new Date(Date.now() + timeRemainingMs - snipeWindowMs).toISOString(),
          maxBid,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXECUTE SNIPE
    // ═══════════════════════════════════════════════════════════════════════

    // We're in the snipe window - calculate optimal bid timing
    const bidDelayMs = this.calculateOptimalSnipeDelay(timeRemainingMs);

    // Calculate bid amount (slightly below max to account for increments)
    const bidPercent = this.config.openingBidPercent ?? 95;
    const bidAmount = Math.min(maxBid * (bidPercent / 100), remainingBudget.value);

    return {
      action: 'BID',
      amount: bidAmount,
      currency: remainingBudget.currency,
      delayMs: bidDelayMs,
      confidence: 0.85,
      reasoning: `Sniping with $${bidAmount.toFixed(2)} in ${Math.floor(bidDelayMs / 1000)} seconds ` +
        `(${Math.floor(timeRemainingMs / 1000)}s remaining on auction)`,
      metadata: {
        currentPrice: listing.currentPrice,
        maxBid,
        timeRemainingMs,
        bidDelayMs,
        snipeWindowMs,
      },
    };
  }

  /**
   * Calculate max bid based on value analysis.
   */
  calculateBidAmount(context: StrategyContext): number {
    const { listing, remainingBudget, marketContext } = context;

    let maxBid: number;

    if (marketContext) {
      // Use market data to determine fair value
      const fairValue = marketContext.averagePrice;
      const maxPremium = this.config.maxPremiumPercent ?? 15;
      maxBid = fairValue * (1 + maxPremium / 100);
    } else {
      // No market data - use listing price with conservative premium
      const basePrice = listing.buyItNowPrice ?? listing.currentPrice * 1.5;
      maxBid = basePrice * 0.85; // Target 15% below BIN/estimated value
    }

    // Never exceed remaining budget
    return Math.min(maxBid, remainingBudget.value);
  }

  /**
   * Not used for sniper strategy.
   */
  calculateOfferAmount(): number {
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate optimal delay for snipe bid.
   * Aims to place bid 3-5 seconds before auction end.
   */
  private calculateOptimalSnipeDelay(timeRemainingMs: number): number {
    // Target: bid lands 3-5 seconds before end
    const targetSecondsBeforeEnd = 4;
    const targetDelayMs = timeRemainingMs - (targetSecondsBeforeEnd * 1000);

    // Account for network latency (estimate 500ms)
    const latencyBufferMs = 500;

    // Ensure we don't wait too long
    const delay = Math.max(0, targetDelayMs - latencyBufferMs);

    // Add small random jitter to avoid detection patterns
    const jitterMs = Math.random() * 500;

    return Math.floor(delay + jitterMs);
  }

  /**
   * Assess risk of being outbid even with snipe timing.
   */
  assessSnipeRisk(listing: NormalizedListing): 'LOW' | 'MEDIUM' | 'HIGH' {
    const bidCount = listing.bidCount ?? 0;

    if (bidCount === 0) {
      return 'LOW'; // No competition yet
    } else if (bidCount <= 5) {
      return 'MEDIUM'; // Some interest
    } else {
      return 'HIGH'; // Hot item, likely other snipers
    }
  }
}
