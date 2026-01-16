/**
 * Symbol Mapper
 *
 * Maps swarm events and entities to PromptSpeak registry symbols.
 * Follows the Ξ (Xi) notation standard.
 *
 * Symbol Structure:
 * - Ξ.E.* - Events (immutable facts)
 * - Ξ.A.* - Agents (entities that act)
 * - Ξ.R.* - Resources (things being acquired)
 * - Ξ.F.* - Flows (processes/workflows)
 * - Ξ.L.* - Rules (constraints/policies)
 * - Ξ.U.* - Units (measurements)
 * - Ξ.I.* - Insights (computed metrics)
 */

import type { SwarmEventType, BiddingStrategy } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL PREFIXES
// ═══════════════════════════════════════════════════════════════════════════════

export const SYMBOL_PREFIXES = {
  EVENT: 'Ξ.E.SWARM',
  AGENT: 'Ξ.A.BUYER',
  RESOURCE: 'Ξ.R.PELT',
  FLOW: 'Ξ.F.ACQUISITION',
  RULE: 'Ξ.L.BUDGET',
  UNIT: 'Ξ.U.CURRENCY',
  INSIGHT: 'Ξ.I.SWARM',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const EVENT_SYMBOL_MAP: Partial<Record<SwarmEventType, string>> = {
  // Bid events
  BID_PLACED: `${SYMBOL_PREFIXES.EVENT}.BID_PLACED`,
  BID_WON: `${SYMBOL_PREFIXES.EVENT}.BID_WON`,
  BID_LOST: `${SYMBOL_PREFIXES.EVENT}.BID_LOST`,
  BID_OUTBID: `${SYMBOL_PREFIXES.EVENT}.BID_OUTBID`,
  BID_CONFIRMED: `${SYMBOL_PREFIXES.EVENT}.BID_CONFIRMED`,
  BID_CANCELLED: `${SYMBOL_PREFIXES.EVENT}.BID_CANCELLED`,

  // Offer events
  OFFER_SUBMITTED: `${SYMBOL_PREFIXES.EVENT}.OFFER_SUBMITTED`,
  OFFER_ACCEPTED: `${SYMBOL_PREFIXES.EVENT}.OFFER_ACCEPTED`,
  OFFER_DECLINED: `${SYMBOL_PREFIXES.EVENT}.OFFER_DECLINED`,
  OFFER_COUNTERED: `${SYMBOL_PREFIXES.EVENT}.OFFER_COUNTERED`,
  OFFER_EXPIRED: `${SYMBOL_PREFIXES.EVENT}.OFFER_EXPIRED`,
  OFFER_REJECTED: `${SYMBOL_PREFIXES.EVENT}.OFFER_REJECTED`,

  // Acquisition events
  ITEM_ACQUIRED: `${SYMBOL_PREFIXES.EVENT}.ITEM_ACQUIRED`,
  CHECKOUT_INITIATED: `${SYMBOL_PREFIXES.EVENT}.CHECKOUT_INITIATED`,
  PAYMENT_INITIATED: `${SYMBOL_PREFIXES.EVENT}.PAYMENT_INITIATED`,
  PAYMENT_COMPLETED: `${SYMBOL_PREFIXES.EVENT}.PAYMENT_COMPLETED`,

  // Agent lifecycle events
  AGENT_SPAWNED: `${SYMBOL_PREFIXES.EVENT}.AGENT_SPAWNED`,
  AGENT_STARTED: `${SYMBOL_PREFIXES.EVENT}.AGENT_STARTED`,
  AGENT_PAUSED: `${SYMBOL_PREFIXES.EVENT}.AGENT_PAUSED`,
  AGENT_RESUMED: `${SYMBOL_PREFIXES.EVENT}.AGENT_RESUMED`,
  AGENT_DEPLETED: `${SYMBOL_PREFIXES.EVENT}.AGENT_DEPLETED`,
  AGENT_TERMINATED: `${SYMBOL_PREFIXES.EVENT}.AGENT_TERMINATED`,
  AGENT_BUDGET_EXHAUSTED: `${SYMBOL_PREFIXES.EVENT}.AGENT_BUDGET_EXHAUSTED`,

  // Swarm lifecycle events
  SWARM_CREATED: `${SYMBOL_PREFIXES.EVENT}.SWARM_CREATED`,
  SWARM_STARTED: `${SYMBOL_PREFIXES.EVENT}.SWARM_STARTED`,
  SWARM_PAUSED: `${SYMBOL_PREFIXES.EVENT}.SWARM_PAUSED`,
  SWARM_COMPLETED: `${SYMBOL_PREFIXES.EVENT}.SWARM_COMPLETED`,
  SWARM_TERMINATED: `${SYMBOL_PREFIXES.EVENT}.SWARM_TERMINATED`,
  SWARM_BUDGET_REALLOCATED: `${SYMBOL_PREFIXES.EVENT}.SWARM_BUDGET_REALLOCATED`,

  // Budget events
  BUDGET_ALLOCATED: `${SYMBOL_PREFIXES.EVENT}.BUDGET_ALLOCATED`,
  BUDGET_SPENT: `${SYMBOL_PREFIXES.EVENT}.BUDGET_SPENT`,
  BUDGET_REALLOCATED: `${SYMBOL_PREFIXES.EVENT}.BUDGET_REALLOCATED`,
  BUDGET_EXHAUSTED: `${SYMBOL_PREFIXES.EVENT}.BUDGET_EXHAUSTED`,

  // Search events
  SEARCH_EXECUTED: `${SYMBOL_PREFIXES.EVENT}.SEARCH_EXECUTED`,
  LISTING_DISCOVERED: `${SYMBOL_PREFIXES.EVENT}.LISTING_DISCOVERED`,
  LISTING_EVALUATED: `${SYMBOL_PREFIXES.EVENT}.LISTING_EVALUATED`,
  LISTING_TRACKED: `${SYMBOL_PREFIXES.EVENT}.LISTING_TRACKED`,
  LISTING_UNTRACKED: `${SYMBOL_PREFIXES.EVENT}.LISTING_UNTRACKED`,

  // Error events
  ERROR: `${SYMBOL_PREFIXES.EVENT}.ERROR`,
  RATE_LIMITED: `${SYMBOL_PREFIXES.EVENT}.RATE_LIMITED`,
};

/**
 * Map event type to PromptSpeak symbol.
 */
export function mapEventToSymbol(eventType: SwarmEventType): string {
  return EVENT_SYMBOL_MAP[eventType] ?? `${SYMBOL_PREFIXES.EVENT}.UNKNOWN`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const STRATEGY_SYMBOL_MAP: Record<BiddingStrategy, string> = {
  SNIPER: `${SYMBOL_PREFIXES.AGENT}.SNIPER`,
  EARLY_AGGRESSIVE: `${SYMBOL_PREFIXES.AGENT}.AGGRESSIVE`,
  NEGOTIATOR: `${SYMBOL_PREFIXES.AGENT}.NEGOTIATOR`,
  HYBRID: `${SYMBOL_PREFIXES.AGENT}.HYBRID`,
  PASSIVE: `${SYMBOL_PREFIXES.AGENT}.PASSIVE`,
};

/**
 * Map agent strategy to symbol.
 */
export function mapAgentToSymbol(strategy: BiddingStrategy): string {
  return STRATEGY_SYMBOL_MAP[strategy] ?? `${SYMBOL_PREFIXES.AGENT}.UNKNOWN`;
}

/**
 * Create agent instance symbol.
 */
export function createAgentSymbol(strategy: BiddingStrategy, agentId: string): string {
  const base = mapAgentToSymbol(strategy);
  return `${base}:${agentId.slice(0, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map listing to resource symbol.
 */
export function mapListingToSymbol(listingId: string, category?: string): string {
  const categoryPart = category ? `.${category.toUpperCase().replace(/\s+/g, '_')}` : '';
  return `${SYMBOL_PREFIXES.RESOURCE}${categoryPart}:${listingId.slice(0, 12)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

export const INSIGHT_SYMBOLS = {
  /** Agent success rate (wins / total attempts) */
  AGENT_SUCCESS_RATE: `${SYMBOL_PREFIXES.INSIGHT}.AGENT_SUCCESS_RATE`,

  /** Agent cost efficiency (value acquired / budget spent) */
  AGENT_COST_EFFICIENCY: `${SYMBOL_PREFIXES.INSIGHT}.AGENT_COST_EFFICIENCY`,

  /** Strategy ranking by effectiveness */
  STRATEGY_RANKING: `${SYMBOL_PREFIXES.INSIGHT}.STRATEGY_RANKING`,

  /** Swarm overall performance */
  SWARM_PERFORMANCE: `${SYMBOL_PREFIXES.INSIGHT}.SWARM_PERFORMANCE`,

  /** Market price trends */
  MARKET_PRICE_TREND: `${SYMBOL_PREFIXES.INSIGHT}.MARKET_PRICE_TREND`,

  /** Seller pattern analysis */
  SELLER_PATTERNS: `${SYMBOL_PREFIXES.INSIGHT}.SELLER_PATTERNS`,

  /** Budget utilization rate */
  BUDGET_UTILIZATION: `${SYMBOL_PREFIXES.INSIGHT}.BUDGET_UTILIZATION`,

  /** Time-based activity patterns */
  ACTIVITY_PATTERNS: `${SYMBOL_PREFIXES.INSIGHT}.ACTIVITY_PATTERNS`,

  /** Concentration risk (SPOF detection) */
  CONCENTRATION_RISK: `${SYMBOL_PREFIXES.INSIGHT}.CONCENTRATION_RISK`,
} as const;

/**
 * Create insight symbol with context.
 */
export function createInsightSymbol(
  insightType: keyof typeof INSIGHT_SYMBOLS,
  context?: { swarmId?: string; agentId?: string; timeframe?: string }
): string {
  const base = INSIGHT_SYMBOLS[insightType];

  const parts: string[] = [base];

  if (context?.swarmId) {
    parts.push(`swarm:${context.swarmId.slice(0, 8)}`);
  }
  if (context?.agentId) {
    parts.push(`agent:${context.agentId.slice(0, 8)}`);
  }
  if (context?.timeframe) {
    parts.push(`tf:${context.timeframe}`);
  }

  return parts.join(':');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

export const RULE_SYMBOLS = {
  /** Maximum budget per agent */
  MAX_AGENT_BUDGET: `${SYMBOL_PREFIXES.RULE}.MAX_AGENT_BUDGET`,

  /** Fee reserve percentage */
  FEE_RESERVE: `${SYMBOL_PREFIXES.RULE}.FEE_RESERVE`,

  /** Maximum bid as percentage of budget */
  MAX_BID_PERCENT: `${SYMBOL_PREFIXES.RULE}.MAX_BID_PERCENT`,

  /** Minimum required discount for passive strategy */
  MIN_DISCOUNT: `${SYMBOL_PREFIXES.RULE}.MIN_DISCOUNT`,

  /** Rate limit rules */
  RATE_LIMIT: `${SYMBOL_PREFIXES.RULE}.RATE_LIMIT`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW SYMBOL MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

export const FLOW_SYMBOLS = {
  /** Auction bidding flow */
  AUCTION_BID: `${SYMBOL_PREFIXES.FLOW}.AUCTION_BID`,

  /** Best offer negotiation flow */
  NEGOTIATION: `${SYMBOL_PREFIXES.FLOW}.NEGOTIATION`,

  /** Buy it now purchase flow */
  BUY_NOW: `${SYMBOL_PREFIXES.FLOW}.BUY_NOW`,

  /** Snipe bidding flow (timed) */
  SNIPE: `${SYMBOL_PREFIXES.FLOW}.SNIPE`,

  /** Budget reallocation flow */
  REALLOCATION: `${SYMBOL_PREFIXES.FLOW}.REALLOCATION`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// UNIT SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════

export const UNIT_SYMBOLS = {
  USD: `${SYMBOL_PREFIXES.UNIT}.USD`,
  EUR: `${SYMBOL_PREFIXES.UNIT}.EUR`,
  GBP: `${SYMBOL_PREFIXES.UNIT}.GBP`,
  PERCENT: `${SYMBOL_PREFIXES.UNIT}.PERCENT`,
  COUNT: `${SYMBOL_PREFIXES.UNIT}.COUNT`,
  SECONDS: `${SYMBOL_PREFIXES.UNIT}.SECONDS`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL PARSING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a symbol into its components.
 */
export function parseSymbol(symbol: string): {
  prefix: string;
  category: string;
  type: string;
  instance?: string;
} {
  const parts = symbol.split('.');
  const instancePart = parts[parts.length - 1];
  const hasInstance = instancePart.includes(':');

  return {
    prefix: parts[0], // Ξ
    category: parts[1], // E, A, R, etc.
    type: hasInstance
      ? parts.slice(2, -1).join('.') + '.' + instancePart.split(':')[0]
      : parts.slice(2).join('.'),
    instance: hasInstance ? instancePart.split(':')[1] : undefined,
  };
}

/**
 * Check if symbol matches a pattern.
 */
export function symbolMatches(symbol: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return symbol.startsWith(pattern.slice(0, -1));
  }
  return symbol === pattern;
}
