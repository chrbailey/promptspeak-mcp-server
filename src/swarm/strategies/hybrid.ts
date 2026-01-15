/**
 * Hybrid Bidding Strategy
 *
 * Dynamically combines multiple strategies based on listing characteristics.
 * Adapts approach based on time remaining, competition level, and listing type.
 *
 * Key characteristics:
 * - Analyzes listing to determine optimal approach
 * - Can switch between sniping, aggressive, and negotiation
 * - Uses contextual scoring to select strategy
 * - Best for: versatile agents, diverse market conditions
 */

import {
  BaseStrategy,
  StrategyCapabilities,
  StrategyConfig,
  StrategyContext,
  StrategyDecision,
  CounterOfferContext,
} from './types.js';
import { SniperStrategy } from './sniper.js';
import { EarlyAggressiveStrategy } from './early-aggressive.js';
import { NegotiatorStrategy } from './negotiator.js';
import { PassiveStrategy } from './passive.js';
import type { BiddingStrategy, NormalizedListing } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SubStrategy = 'SNIPER' | 'AGGRESSIVE' | 'NEGOTIATOR' | 'PASSIVE' | 'BUY_NOW';

interface StrategyScore {
  strategy: SubStrategy;
  score: number;
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_HYBRID_CONFIG: StrategyConfig = {
  maxPremiumPercent: 20,
  snipeWindowSeconds: 15,
  initialOfferPercent: 70,
  maxNegotiationRounds: 3,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════

export class HybridStrategy extends BaseStrategy {
  readonly strategyType: BiddingStrategy = 'HYBRID';
  readonly name = 'Hybrid';
  readonly description =
    'Dynamically selects the optimal approach based on listing characteristics. ' +
    'Combines sniping, aggressive bidding, and negotiation for maximum flexibility.';

  readonly capabilities: StrategyCapabilities = {
    supportsAuctions: true,
    supportsOffers: true,
    supportsNegotiation: true,
    supportsBuyItNow: true,
    requiresPreciseTiming: true, // Inherits from sniper
  };

  // Sub-strategies
  private sniper: SniperStrategy;
  private aggressive: EarlyAggressiveStrategy;
  private negotiator: NegotiatorStrategy;
  private passive: PassiveStrategy;

  constructor(config?: Partial<StrategyConfig>) {
    super({ ...DEFAULT_HYBRID_CONFIG, ...config });

    // Initialize sub-strategies with shared config
    this.sniper = new SniperStrategy(this.config);
    this.aggressive = new EarlyAggressiveStrategy(this.config);
    this.negotiator = new NegotiatorStrategy(this.config);
    this.passive = new PassiveStrategy(this.config);
  }

  /**
   * Evaluate listing and delegate to optimal sub-strategy.
   */
  async evaluate(context: StrategyContext): Promise<StrategyDecision> {
    const { listing, agentConfig, remainingBudget } = context;

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
    // STRATEGY SELECTION
    // ═══════════════════════════════════════════════════════════════════════

    const scores = this.scoreStrategies(context);
    const bestStrategy = this.selectBestStrategy(scores);

    // ═══════════════════════════════════════════════════════════════════════
    // DELEGATE TO SELECTED STRATEGY
    // ═══════════════════════════════════════════════════════════════════════

    let decision: StrategyDecision;

    switch (bestStrategy.strategy) {
      case 'SNIPER':
        decision = await this.sniper.evaluate(context);
        break;

      case 'AGGRESSIVE':
        decision = await this.aggressive.evaluate(context);
        break;

      case 'NEGOTIATOR':
        decision = await this.negotiator.evaluate(context);
        break;

      case 'PASSIVE':
        decision = await this.passive.evaluate(context);
        break;

      case 'BUY_NOW':
        decision = this.createBuyNowDecision(context);
        break;

      default:
        decision = this.skipDecision('No suitable strategy found');
    }

    // Enhance decision with hybrid metadata
    return {
      ...decision,
      metadata: {
        ...decision.metadata,
        hybridStrategy: {
          selectedStrategy: bestStrategy.strategy,
          selectionScore: bestStrategy.score,
          selectionReasoning: bestStrategy.reasoning,
          allScores: scores,
        },
      },
    };
  }

  /**
   * Handle counter-offer - delegate to negotiator.
   */
  async handleCounterOffer(context: CounterOfferContext): Promise<StrategyDecision> {
    return this.negotiator.handleCounterOffer(context);
  }

  /**
   * Score each strategy for this listing.
   */
  private scoreStrategies(context: StrategyContext): StrategyScore[] {
    const { listing, currentTime, marketContext } = context;
    const scores: StrategyScore[] = [];

    // ═══════════════════════════════════════════════════════════════════════
    // SNIPER SCORE
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.isAuction && listing.auctionEndTime) {
      const timeRemainingMs = this.getTimeRemainingMs(listing, currentTime);
      const hoursRemaining = timeRemainingMs / (1000 * 60 * 60);

      let sniperScore = 0;

      if (hoursRemaining <= 0.5) {
        // Last 30 minutes - sniper is ideal
        sniperScore = 90;
      } else if (hoursRemaining <= 2) {
        // 30 min to 2 hours - sniper is good
        sniperScore = 70;
      } else if (hoursRemaining <= 12) {
        // 2-12 hours - could snipe later
        sniperScore = 40;
      } else {
        // More than 12 hours - not ideal for sniping yet
        sniperScore = 20;
      }

      // Bonus for low bid count (less competition)
      if ((listing.bidCount ?? 0) <= 2) sniperScore += 10;

      scores.push({
        strategy: 'SNIPER',
        score: sniperScore,
        reasoning: `Auction with ${hoursRemaining.toFixed(1)}h remaining, ${listing.bidCount ?? 0} bids`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // AGGRESSIVE SCORE
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.isAuction) {
      let aggressiveScore = 0;
      const timeRemainingMs = this.getTimeRemainingMs(listing, currentTime);
      const hoursRemaining = timeRemainingMs / (1000 * 60 * 60);

      if (hoursRemaining > 12) {
        // Early in auction - aggressive can work
        aggressiveScore = 50;
      } else if (hoursRemaining > 2) {
        // Mid-auction - aggressive might scare off bidders
        aggressiveScore = 40;
      } else {
        // Late - prefer sniping
        aggressiveScore = 20;
      }

      // High competition favors aggressive early bid
      if ((listing.bidCount ?? 0) >= 5) aggressiveScore += 15;

      scores.push({
        strategy: 'AGGRESSIVE',
        score: aggressiveScore,
        reasoning: `Auction approach - ${(listing.bidCount ?? 0) >= 5 ? 'high' : 'low'} competition`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NEGOTIATOR SCORE
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.bestOfferEnabled && !listing.isAuction) {
      let negotiatorScore = 60; // Base score for Best Offer listings

      // Higher score if price seems negotiable
      if (marketContext && listing.currentPrice > marketContext.averagePrice) {
        negotiatorScore += 20; // Overpriced = room to negotiate
      }

      scores.push({
        strategy: 'NEGOTIATOR',
        score: negotiatorScore,
        reasoning: 'Best Offer enabled - negotiation opportunity',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PASSIVE SCORE
    // ═══════════════════════════════════════════════════════════════════════

    if (marketContext) {
      const valueScore = this.calculateValueScore(listing, marketContext);
      let passiveScore = 0;

      if (valueScore >= 0.7) {
        // Good value - passive strategy might work
        passiveScore = 80;
      } else if (valueScore >= 0.5) {
        passiveScore = 40;
      } else {
        passiveScore = 10;
      }

      scores.push({
        strategy: 'PASSIVE',
        score: passiveScore,
        reasoning: `Value score ${(valueScore * 100).toFixed(0)}% - ${valueScore >= 0.7 ? 'good value' : 'fair/poor value'}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUY NOW SCORE
    // ═══════════════════════════════════════════════════════════════════════

    if (listing.buyItNowPrice) {
      let buyNowScore = 0;

      if (marketContext) {
        const binRatio = listing.buyItNowPrice / marketContext.averagePrice;

        if (binRatio <= 0.75) {
          // 25%+ below market - excellent deal
          buyNowScore = 95;
        } else if (binRatio <= 0.9) {
          // 10-25% below market - good deal
          buyNowScore = 70;
        } else if (binRatio <= 1.0) {
          // At market - reasonable
          buyNowScore = 50;
        } else {
          // Above market - only if urgent
          buyNowScore = 20;
        }
      } else {
        // Without market data, moderate score
        buyNowScore = 45;
      }

      scores.push({
        strategy: 'BUY_NOW',
        score: buyNowScore,
        reasoning: marketContext
          ? `BIN ${Math.round((listing.buyItNowPrice / marketContext.averagePrice) * 100)}% of market`
          : 'BIN available, market data unknown',
      });
    }

    return scores;
  }

  /**
   * Select the best strategy based on scores.
   */
  private selectBestStrategy(scores: StrategyScore[]): StrategyScore {
    if (scores.length === 0) {
      return {
        strategy: 'PASSIVE',
        score: 0,
        reasoning: 'No strategies scored - defaulting to passive',
      };
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Return highest score, but require minimum threshold
    const best = scores[0];

    if (best.score < 30) {
      return {
        strategy: 'PASSIVE',
        score: best.score,
        reasoning: `Best score (${best.score}) below threshold - using passive approach`,
      };
    }

    return best;
  }

  /**
   * Create a Buy It Now decision.
   */
  private createBuyNowDecision(context: StrategyContext): StrategyDecision {
    const { listing, remainingBudget, marketContext } = context;

    if (!listing.buyItNowPrice || listing.buyItNowPrice > remainingBudget.value) {
      return this.skipDecision('BIN price exceeds budget');
    }

    return {
      action: 'BID',
      amount: listing.buyItNowPrice,
      currency: remainingBudget.currency,
      confidence: 0.85,
      reasoning: marketContext
        ? `Buy It Now at ${Math.round((listing.buyItNowPrice / marketContext.averagePrice) * 100)}% of market average - good value`
        : 'Buy It Now selected by hybrid strategy',
      metadata: {
        purchaseType: 'BUY_IT_NOW',
        marketAverage: marketContext?.averagePrice,
      },
    };
  }

  /**
   * Update configuration for all sub-strategies.
   */
  configure(config: Partial<StrategyConfig>): void {
    super.configure(config);
    this.sniper.configure(config);
    this.aggressive.configure(config);
    this.negotiator.configure(config);
    this.passive.configure(config);
  }

  /**
   * Calculate bid amount - delegates to most appropriate sub-strategy.
   */
  calculateBidAmount(context: StrategyContext): number {
    const scores = this.scoreStrategies(context);
    const best = this.selectBestStrategy(scores);

    switch (best.strategy) {
      case 'SNIPER':
        return this.sniper.calculateBidAmount(context);
      case 'AGGRESSIVE':
        return this.aggressive.calculateBidAmount(context);
      default:
        return super.calculateBidAmount(context);
    }
  }

  /**
   * Calculate offer amount - delegates to negotiator.
   */
  calculateOfferAmount(context: StrategyContext): number {
    return this.negotiator.calculateOfferAmount(context);
  }
}
