/**
 * Bidding Strategies Module
 *
 * Exports all bidding strategies and the factory function for creating them.
 */

export * from './types.js';
export { SniperStrategy } from './sniper.js';
export { EarlyAggressiveStrategy } from './early-aggressive.js';
export { NegotiatorStrategy } from './negotiator.js';
export { HybridStrategy } from './hybrid.js';
export { PassiveStrategy } from './passive.js';

import type { BiddingStrategy } from '../types.js';
import type { BiddingStrategyInterface, StrategyConfig } from './types.js';
import { SniperStrategy } from './sniper.js';
import { EarlyAggressiveStrategy } from './early-aggressive.js';
import { NegotiatorStrategy } from './negotiator.js';
import { HybridStrategy } from './hybrid.js';
import { PassiveStrategy } from './passive.js';

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGY FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a strategy instance from strategy type.
 */
export function createStrategy(
  type: BiddingStrategy,
  config?: StrategyConfig
): BiddingStrategyInterface {
  switch (type) {
    case 'SNIPER':
      return new SniperStrategy(config);

    case 'EARLY_AGGRESSIVE':
      return new EarlyAggressiveStrategy(config);

    case 'NEGOTIATOR':
      return new NegotiatorStrategy(config);

    case 'HYBRID':
      return new HybridStrategy(config);

    case 'PASSIVE':
      return new PassiveStrategy(config);

    default:
      throw new Error(`Unknown strategy type: ${type}`);
  }
}

/**
 * Get all available strategy types.
 */
export function getAvailableStrategies(): BiddingStrategy[] {
  return ['SNIPER', 'EARLY_AGGRESSIVE', 'NEGOTIATOR', 'HYBRID', 'PASSIVE'];
}

/**
 * Get strategy description by type.
 */
export function getStrategyDescription(type: BiddingStrategy): string {
  const strategy = createStrategy(type);
  return strategy.description;
}

/**
 * Get recommended strategy distribution for a swarm.
 *
 * Returns a balanced mix based on swarm size:
 * - Small swarm (3-5): Focus on core strategies
 * - Medium swarm (6-10): Include all strategies
 * - Large swarm (10+): Weight towards proven strategies
 */
export function getRecommendedDistribution(
  agentCount: number
): Map<BiddingStrategy, number> {
  const distribution = new Map<BiddingStrategy, number>();

  if (agentCount <= 2) {
    // Very small - hybrid covers most bases
    distribution.set('HYBRID', 2);
  } else if (agentCount <= 5) {
    // Small - core strategies
    distribution.set('SNIPER', 1);
    distribution.set('EARLY_AGGRESSIVE', 1);
    distribution.set('NEGOTIATOR', 1);
    distribution.set('HYBRID', Math.max(1, agentCount - 3));
    distribution.set('PASSIVE', agentCount >= 5 ? 1 : 0);
  } else if (agentCount <= 10) {
    // Medium - all strategies represented
    distribution.set('SNIPER', 2);
    distribution.set('EARLY_AGGRESSIVE', 1);
    distribution.set('NEGOTIATOR', 2);
    distribution.set('HYBRID', 2);
    distribution.set('PASSIVE', agentCount - 7);
  } else {
    // Large - weight towards flexible strategies
    const baseCount = 10;
    const extra = agentCount - baseCount;

    distribution.set('SNIPER', 2);
    distribution.set('EARLY_AGGRESSIVE', 2);
    distribution.set('NEGOTIATOR', 2);
    distribution.set('HYBRID', 3 + Math.floor(extra / 2));
    distribution.set('PASSIVE', 1 + Math.ceil(extra / 2));
  }

  return distribution;
}
