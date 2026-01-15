/**
 * Market Agent Swarm - Core Types
 *
 * Type definitions for the autonomous bidding agent swarm system.
 * Integrates with PromptSpeak Registry for anti-gaming outcome tracking.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BIDDING STRATEGIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Available bidding strategies for market agents.
 * Strategy effectiveness is computed from outcomes, never self-reported.
 */
export type BiddingStrategy =
  | 'SNIPER'           // Wait until final seconds of auction
  | 'EARLY_AGGRESSIVE' // Bid high early to discourage competition
  | 'NEGOTIATOR'       // Best Offer flow with calculated concessions
  | 'HYBRID'           // Combines multiple strategies based on context
  | 'PASSIVE';         // Only bids on significantly underpriced listings

/**
 * Default strategy distribution weights for swarm initialization.
 */
export const DEFAULT_STRATEGY_WEIGHTS: Record<BiddingStrategy, number> = {
  SNIPER: 3,
  EARLY_AGGRESSIVE: 2,
  NEGOTIATOR: 2,
  HYBRID: 2,
  PASSIVE: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MONETARY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported currencies.
 */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

/**
 * Monetary budget configuration for an agent.
 */
export interface MonetaryBudget {
  /** Total budget allocated to this agent */
  amount: number;
  /** Currency code */
  currency: Currency;
  /** Maximum amount to spend on a single item */
  maxPerItem: number;
  /** Percentage of budget to reserve for fees (default 5%) */
  reservePercent: number;
}

/**
 * Default budget configuration.
 */
export const DEFAULT_BUDGET: Omit<MonetaryBudget, 'amount'> = {
  currency: 'USD',
  maxPerItem: 200,
  reservePercent: 5,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIME CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Time window for agent operations.
 */
export interface TimeWindow {
  /** ISO 8601 start timestamp */
  startAt: string;
  /** ISO 8601 end timestamp */
  endAt: string;
  /** Optional operating hours restriction (24h format) */
  operatingHours?: {
    start: number; // 0-23
    end: number;   // 0-23
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TARGET CRITERIA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Item condition types supported by eBay.
 */
export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE' | 'ANY';

/**
 * Listing format types.
 */
export type ListingFormat = 'AUCTION' | 'FIXED_PRICE' | 'BEST_OFFER' | 'ANY';

/**
 * Target criteria for what items agents should pursue.
 */
export interface TargetCriteria {
  /** Primary search query (e.g., "mink pelts") */
  searchQuery: string;
  /** Additional search queries to expand coverage */
  additionalQueries?: string[];
  /** eBay category IDs to search within */
  categoryIds?: string[];
  /** Price range filter */
  priceRange: {
    min: number;
    max: number;
  };
  /** Acceptable item conditions */
  conditions: ItemCondition[];
  /** Preferred listing formats */
  listingFormats: ListingFormat[];
  /** Seller IDs to exclude (known problematic sellers) */
  excludeSellers?: string[];
  /** Minimum seller feedback score */
  minSellerFeedback?: number;
  /** Geographic restrictions (shipping locations) */
  shipToLocations?: string[];
}

/**
 * Default target criteria for mink pelt acquisition.
 */
export const DEFAULT_TARGET_CRITERIA: TargetCriteria = {
  searchQuery: 'mink pelts',
  additionalQueries: ['mink fur pelt', 'mink hide tanned', 'mink skin crafting'],
  priceRange: { min: 10, max: 200 },
  conditions: ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ANY'],
  listingFormats: ['AUCTION', 'FIXED_PRICE', 'BEST_OFFER'],
  minSellerFeedback: 95,
  shipToLocations: ['US'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent status in the swarm lifecycle.
 */
export type MarketAgentStatus =
  | 'idle'          // Created but not yet active
  | 'searching'     // Actively searching for listings
  | 'monitoring'    // Watching specific listings
  | 'bidding'       // Actively participating in auction
  | 'negotiating'   // In Best Offer negotiation
  | 'won'           // Successfully acquired item
  | 'outbid'        // Lost auction to competitor
  | 'depleted'      // Budget exhausted
  | 'paused'        // Temporarily paused
  | 'terminated';   // Permanently stopped

/**
 * Constraints that limit agent behavior.
 */
export interface AgentConstraints {
  /** Maximum concurrent listings to track */
  maxConcurrentListings: number;
  /** Maximum bids per hour */
  maxBidsPerHour: number;
  /** Maximum offers per hour (for Best Offer) */
  maxOffersPerHour: number;
  /** Minimum time between actions (ms) */
  minActionIntervalMs: number;
  /** Whether agent requires approval for bids above threshold */
  requireApprovalAbove?: number;
}

/**
 * Default agent constraints.
 */
export const DEFAULT_AGENT_CONSTRAINTS: AgentConstraints = {
  maxConcurrentListings: 10,
  maxBidsPerHour: 20,
  maxOffersPerHour: 10,
  minActionIntervalMs: 5000,
};

/**
 * Complete configuration for a market agent.
 */
export interface MarketAgentConfig {
  /** Unique agent identifier (format: mkt_agent_XXXXX) */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Assigned bidding strategy */
  strategy: BiddingStrategy;
  /** Budget allocation */
  budget: MonetaryBudget;
  /** Operating time window */
  timeWindow: TimeWindow;
  /** What to search for */
  targetCriteria: TargetCriteria;
  /** Behavioral constraints */
  constraints: AgentConstraints;
  /** Parent swarm ID */
  swarmId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWARM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Swarm status.
 */
export type SwarmStatus =
  | 'configuring'  // Being set up
  | 'ready'        // Configured, not started
  | 'active'       // Agents running
  | 'paused'       // All agents paused
  | 'completed'    // Campaign ended successfully
  | 'terminated';  // Manually stopped

/**
 * Complete swarm configuration.
 */
export interface SwarmConfig {
  /** Unique swarm identifier (format: swarm_XXXXX) */
  swarmId: string;
  /** Human-readable name */
  name: string;
  /** Total budget for entire swarm */
  totalBudget: number;
  /** Currency for budget */
  currency: Currency;
  /** Number of agents to spawn */
  agentCount: number;
  /** Strategy distribution weights */
  strategyDistribution: Record<BiddingStrategy, number>;
  /** Campaign time window */
  campaignWindow: TimeWindow;
  /** Target criteria (shared by all agents) */
  targetCriteria: TargetCriteria;
  /** Whether running in sandbox mode */
  sandboxMode: boolean;
  /** Fee reserve percentage */
  feeReservePercent: number;
  /** Created by (user identifier) */
  createdBy: string;
  /** Creation timestamp */
  createdAt: string;
}

/**
 * Runtime state of a swarm.
 */
export interface SwarmState {
  /** Current status */
  status: SwarmStatus;
  /** Total budget spent across all agents */
  totalSpent: number;
  /** Total items acquired */
  totalAcquired: number;
  /** Active agent count */
  activeAgents: number;
  /** Last activity timestamp */
  lastActivityAt?: string;
  /** Status message */
  statusMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TYPES (for Registry tracking)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of events generated by the swarm.
 * All events are immutable and form the basis for computed insights.
 */
export type SwarmEventType =
  // Search events
  | 'SEARCH_EXECUTED'
  | 'LISTING_DISCOVERED'
  | 'LISTING_TRACKED'
  | 'LISTING_UNTRACKED'
  // Bid events
  | 'BID_PLACED'
  | 'BID_CONFIRMED'
  | 'BID_OUTBID'
  | 'BID_WON'
  | 'BID_LOST'
  | 'BID_CANCELLED'
  // Offer events (Best Offer)
  | 'OFFER_SUBMITTED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_COUNTERED'
  | 'OFFER_REJECTED'
  | 'OFFER_EXPIRED'
  // Acquisition events
  | 'ITEM_ACQUIRED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_COMPLETED'
  // Agent lifecycle
  | 'AGENT_SPAWNED'
  | 'AGENT_STARTED'
  | 'AGENT_PAUSED'
  | 'AGENT_RESUMED'
  | 'AGENT_DEPLETED'
  | 'AGENT_TERMINATED'
  // Swarm lifecycle
  | 'SWARM_CREATED'
  | 'SWARM_STARTED'
  | 'SWARM_PAUSED'
  | 'SWARM_COMPLETED'
  | 'SWARM_TERMINATED'
  // Budget events
  | 'BUDGET_ALLOCATED'
  | 'BUDGET_SPENT'
  | 'BUDGET_REALLOCATED'
  | 'BUDGET_EXHAUSTED';

/**
 * Base event structure for all swarm events.
 */
export interface SwarmEventBase {
  /** Unique event ID */
  eventId: string;
  /** Event type */
  eventType: SwarmEventType;
  /** Swarm that generated this event */
  swarmId: string;
  /** Agent that generated this event (if applicable) */
  agentId?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Additional event-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Bid event with specific fields.
 */
export interface BidEvent extends SwarmEventBase {
  eventType: 'BID_PLACED' | 'BID_CONFIRMED' | 'BID_OUTBID' | 'BID_WON' | 'BID_LOST' | 'BID_CANCELLED';
  /** eBay item ID */
  itemId: string;
  /** Item title */
  itemTitle: string;
  /** Bid amount */
  bidAmount: number;
  /** Currency */
  currency: Currency;
  /** Current leading bid at time of event */
  currentLeadingBid?: number;
  /** Our maximum bid (for proxy bidding) */
  ourMaxBid?: number;
  /** Number of competing bidders */
  competitorCount?: number;
  /** Time remaining when bid was placed (seconds) */
  timeRemainingSeconds?: number;
  /** Whether we are currently winning */
  isWinning?: boolean;
}

/**
 * Offer event for Best Offer negotiations.
 */
export interface OfferEvent extends SwarmEventBase {
  eventType: 'OFFER_SUBMITTED' | 'OFFER_ACCEPTED' | 'OFFER_COUNTERED' | 'OFFER_REJECTED' | 'OFFER_EXPIRED';
  /** eBay item ID */
  itemId: string;
  /** Item title */
  itemTitle: string;
  /** Listed price */
  listPrice: number;
  /** Our offer amount */
  offerAmount: number;
  /** Counter offer amount (if countered) */
  counterAmount?: number;
  /** Negotiation round number */
  roundNumber: number;
  /** Currency */
  currency: Currency;
}

/**
 * Acquisition event when item is successfully purchased.
 */
export interface AcquisitionEvent extends SwarmEventBase {
  eventType: 'ITEM_ACQUIRED';
  /** eBay item ID */
  itemId: string;
  /** Item title */
  itemTitle: string;
  /** Final acquisition price */
  finalPrice: number;
  /** Original list price */
  listPrice: number;
  /** Market value estimate at time of purchase */
  marketValueEstimate?: number;
  /** Currency */
  currency: Currency;
  /** Acquisition method */
  acquisitionMethod: 'AUCTION' | 'BUY_NOW' | 'BEST_OFFER';
  /** Seller ID */
  sellerId: string;
  /** Seller feedback score */
  sellerFeedbackScore?: number;
}

/**
 * Union type for all specific event types.
 */
export type SwarmEvent = SwarmEventBase | BidEvent | OfferEvent | AcquisitionEvent;

// ═══════════════════════════════════════════════════════════════════════════════
// COMPUTED INSIGHTS (Anti-Gaming)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent effectiveness metrics - computed from events only.
 * These values are NEVER self-reported by agents.
 */
export interface AgentEffectiveness {
  /** Agent ID */
  agentId: string;
  /** Total pursuits (listings tracked) */
  totalPursuits: number;
  /** Successful acquisitions */
  acquisitions: number;
  /** Lost bids/offers */
  losses: number;
  /** Timeouts (listing ended without action) */
  timeouts: number;
  /** Win rate (acquisitions / completed pursuits) */
  winRate: number;
  /** Total amount spent */
  totalSpent: number;
  /** Average acquisition cost */
  avgAcquisitionCost: number;
  /** Average savings vs list price */
  avgSavingsVsListPrice: number;
  /** Budget efficiency (value acquired / budget spent) */
  budgetEfficiency: number;
  /** Computation timestamp */
  computedAt: string;
  /** Confidence score (based on sample size) */
  confidenceScore: number;
}

/**
 * Strategy ranking based on cross-agent comparison.
 */
export interface StrategyRanking {
  /** Strategy type */
  strategy: BiddingStrategy;
  /** Average win rate across agents using this strategy */
  avgWinRate: number;
  /** Average cost efficiency */
  avgCostEfficiency: number;
  /** Average time to acquisition (hours) */
  avgTimeToAcquisition: number;
  /** Sample size (number of completed pursuits) */
  sampleSize: number;
  /** Statistical significance (p-value) */
  statisticalSignificance: number;
  /** Recommended budget share based on performance */
  recommendedBudgetShare: number;
  /** Rank (1 = best) */
  rank: number;
}

/**
 * Seller behavior pattern analysis.
 */
export interface SellerPattern {
  /** Seller ID */
  sellerId: string;
  /** Total interactions with this seller */
  totalInteractions: number;
  /** Success rate by strategy type */
  successByStrategy: Record<BiddingStrategy, { attempts: number; successes: number; rate: number }>;
  /** Average response time to offers (hours) */
  avgOfferResponseTime?: number;
  /** Counter offer rate */
  counterOfferRate?: number;
  /** Average concession per negotiation round */
  avgConcessionPercent?: number;
  /** Optimal strategy for this seller */
  optimalStrategy: BiddingStrategy;
  /** Difficulty score (0-1, higher = harder to win) */
  difficultyScore: number;
}

/**
 * Concentration risk analysis.
 */
export interface ConcentrationRisk {
  /** Risk type */
  riskType: 'STRATEGY' | 'SELLER' | 'CATEGORY' | 'TIME';
  /** Description of the concentration */
  description: string;
  /** Concentration metric (Herfindahl index or similar) */
  concentrationIndex: number;
  /** Severity level */
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Recommended action */
  recommendation: string;
}

/**
 * Complete swarm insights computed from event stream.
 */
export interface SwarmInsights {
  /** Swarm ID */
  swarmId: string;
  /** When insights were computed */
  computedAt: string;
  /** Agent effectiveness metrics */
  agentEffectiveness: AgentEffectiveness[];
  /** Strategy rankings */
  strategyRankings: StrategyRanking[];
  /** Seller patterns */
  sellerPatterns: SellerPattern[];
  /** Concentration risks */
  concentrationRisks: ConcentrationRisk[];
  /** Summary statistics */
  summary: {
    totalSpent: number;
    totalAcquired: number;
    overallWinRate: number;
    overallEfficiency: number;
    topPerformingStrategy: BiddingStrategy;
    topPerformingAgent: string;
  };
  /** Data quality metrics */
  dataQuality: {
    totalEvents: number;
    eventTimespan: { start: string; end: string };
    confidenceScore: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ID GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique swarm ID.
 */
export function generateSwarmId(): string {
  return `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate a unique agent ID.
 */
export function generateAgentId(): string {
  return `mkt_agent_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate a unique event ID.
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}
