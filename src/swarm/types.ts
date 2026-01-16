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
 * Simple monetary value (for tracking amounts).
 * Used internally for budget tracking where full MonetaryBudget config isn't needed.
 */
export interface Money {
  /** The monetary value */
  value: number;
  /** Currency code */
  currency: Currency;
}

/**
 * Monetary budget configuration for an agent.
 * Includes configuration limits in addition to the amount.
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
  /** Start timestamp (Date or string) */
  start: Date | string;
  /** End timestamp (Date or string) */
  end: Date | string;
  /** ISO 8601 start timestamp (alias for compatibility) */
  startAt?: string;
  /** ISO 8601 end timestamp (alias for compatibility) */
  endAt?: string;
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
  /** Primary search query (e.g., "gold bars", "silver coins") */
  searchQuery?: string;
  /** Search terms for the swarm (array of keywords) */
  searchTerms?: string[];
  /** Additional search queries to expand coverage */
  additionalQueries?: string[];
  /** eBay category IDs to search within */
  categoryIds?: string[];
  /** Minimum price filter */
  minPrice?: number;
  /** Maximum price filter */
  maxPrice?: number;
  /** Price range filter (alternative to minPrice/maxPrice) */
  priceRange?: {
    min: number;
    max: number;
  };
  /** Acceptable item conditions */
  conditions?: ItemCondition[] | string[];
  /** Preferred listing formats */
  listingFormats?: ListingFormat[];
  /** Seller IDs to exclude (known problematic sellers) */
  excludeSellers?: string[];
  /** Preferred seller IDs */
  preferredSellers?: string[];
  /** Minimum seller feedback score */
  minSellerFeedback?: number;
  /** Geographic restrictions (shipping locations) */
  shipToLocations?: string[];
}

/**
 * Default target criteria for gold & silver precious metals acquisition.
 */
export const DEFAULT_TARGET_CRITERIA: TargetCriteria = {
  searchQuery: 'gold silver bullion',
  searchTerms: ['gold bars', 'silver bars', 'gold coins', 'silver coins', 'gold bullion', 'silver bullion'],
  additionalQueries: ['1 oz gold', '1 oz silver', 'gold rounds', 'silver rounds', 'junk silver', 'silver eagle', 'gold maple leaf'],
  minPrice: 25,      // Small silver pieces start around $25
  maxPrice: 3000,    // 1oz gold bar range
  priceRange: { min: 25, max: 3000 },
  conditions: ['NEW', 'LIKE_NEW'],  // Precious metals should be pristine condition
  listingFormats: ['AUCTION', 'FIXED_PRICE', 'BEST_OFFER'],
  minSellerFeedback: 98,  // Higher trust requirement for precious metals
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
  | 'terminated'    // Permanently stopped
  | 'ACTIVE';       // Agent actively operating

/**
 * Active bid tracking.
 */
export interface ActiveBid {
  listingId: string;
  amount: number;
  placedAt?: Date;
  timestamp?: Date;
}

/**
 * Active offer tracking.
 */
export interface ActiveOffer {
  listingId: string;
  amount: number;
  placedAt?: Date;
  timestamp?: Date;
  offerId?: string;
}

/**
 * Runtime state of a market agent (tracked during operation).
 */
export interface MarketAgentState {
  /** Current operational status */
  status: MarketAgentStatus;
  /** Remaining budget for this agent */
  remainingBudget: Money;
  /** Currently active auction bids */
  activeBids: ActiveBid[];
  /** Currently active Best Offer negotiations */
  activeOffers: ActiveOffer[];
  /** Number of successful acquisitions */
  wins: number;
  /** Number of lost auctions */
  losses: number;
  /** Total amount spent */
  totalSpent: Money;
}

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
  name?: string;
  /** Assigned bidding strategy */
  strategy: BiddingStrategy;
  /** Budget allocation (Money type for runtime) */
  budgetAllocation?: Money;
  /** Budget configuration */
  budget?: MonetaryBudget;
  /** Operating time window */
  timeWindow: TimeWindow;
  /** What to search for */
  targetCriteria: TargetCriteria;
  /** Behavioral constraints */
  constraints?: AgentConstraints;
  /** Parent swarm ID */
  swarmId: string;
  /** Creation timestamp */
  createdAt?: Date;
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
  | 'terminated'   // Manually stopped
  | 'CREATED'      // Just created
  | 'RUNNING'      // Running
  | 'PAUSED'       // Paused
  | 'TERMINATED';  // Terminated

/**
 * Complete swarm configuration.
 */
export interface SwarmConfig {
  /** Unique swarm identifier (format: swarm_XXXXX) */
  swarmId: string;
  /** Human-readable name */
  name?: string;
  /** Operating mode: COMBAT (autonomous) or RECONNAISSANCE (observe only) */
  mode?: AgentMode;
  /** Total budget for entire swarm (MonetaryBudget or number) */
  totalBudget: MonetaryBudget | number;
  /** Currency for budget */
  currency?: Currency;
  /** Number of agents to spawn */
  agentCount: number;
  /** Strategy distribution weights (Record or Map) */
  strategyDistribution: Record<BiddingStrategy, number> | Map<BiddingStrategy, number>;
  /** Campaign time window (alias for timeWindow) */
  campaignWindow?: TimeWindow;
  /** Time window for swarm operations */
  timeWindow?: TimeWindow;
  /** Target criteria (shared by all agents) */
  targetCriteria: TargetCriteria;
  /** Alert configuration (for RECONNAISSANCE mode) */
  alertConfig?: AlertConfig;
  /** Whether running in sandbox mode */
  sandboxMode?: boolean;
  /** Fee reserve percentage */
  feeReservePercent?: number;
  /** Created by (user identifier) */
  createdBy?: string;
  /** Creation timestamp */
  createdAt?: Date | string;
}

/**
 * Runtime state of a swarm.
 */
export interface SwarmState {
  /** Current status */
  status: SwarmStatus;
  /** Total budget spent across all agents */
  totalSpent: Money | number;
  /** Total items acquired */
  totalAcquired?: number;
  /** Active agent count */
  activeAgents: number;
  /** Total bids placed */
  totalBids?: number;
  /** Total offers submitted */
  totalOffers?: number;
  /** Won auctions count */
  wonAuctions?: number;
  /** Accepted offers count */
  acceptedOffers?: number;
  /** Items acquired count */
  itemsAcquired?: number;
  /** Last activity timestamp */
  lastActivityAt?: string;
  /** Last activity (Date type) */
  lastActivity?: Date;
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
  | 'LISTING_EVALUATED'
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
  | 'CHECKOUT_INITIATED'
  | 'PAYMENT_INITIATED'
  | 'PAYMENT_COMPLETED'
  // Agent lifecycle
  | 'AGENT_SPAWNED'
  | 'AGENT_STARTED'
  | 'AGENT_PAUSED'
  | 'AGENT_RESUMED'
  | 'AGENT_DEPLETED'
  | 'AGENT_TERMINATED'
  | 'AGENT_BUDGET_EXHAUSTED'
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
  | 'BUDGET_EXHAUSTED'
  | 'SWARM_BUDGET_REALLOCATED'
  // Error events
  | 'ERROR'
  | 'RATE_LIMITED'
  // Additional offer events
  | 'OFFER_DECLINED'
  | 'OFFER_COUNTERED';

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
  /** ISO 8601 timestamp or Date */
  timestamp: string | Date;
  /** Additional event-specific data */
  metadata?: Record<string, unknown>;
  /** Event data (alias for metadata) */
  data?: Record<string, unknown>;
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
// RECONNAISSANCE MODE (Market Intelligence)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Swarm operating mode.
 * - COMBAT: Autonomous bidding and purchasing (original mode)
 * - RECONNAISSANCE: Price intelligence gathering, no autonomous execution
 */
export type AgentMode = 'COMBAT' | 'RECONNAISSANCE';

/**
 * Agent roles in RECONNAISSANCE mode.
 * Maps from combat strategies to intelligence-gathering missions.
 */
export type ReconRole =
  | 'SCOUT'       // Search and discover listings (was SNIPER)
  | 'ANALYST'     // Evaluate pricing patterns (was EARLY_AGGRESSIVE)
  | 'NEGOTIATOR'  // Probe seller flexibility, human-approved only (was NEGOTIATOR)
  | 'SENTRY'      // Monitor tracked listings for changes (was PASSIVE)
  | 'COORDINATOR'; // Aggregate observations, trigger alerts (was HYBRID)

/**
 * Maps combat strategies to reconnaissance roles.
 */
export const STRATEGY_TO_RECON_ROLE: Record<BiddingStrategy, ReconRole> = {
  SNIPER: 'SCOUT',
  EARLY_AGGRESSIVE: 'ANALYST',
  NEGOTIATOR: 'NEGOTIATOR',
  PASSIVE: 'SENTRY',
  HYBRID: 'COORDINATOR',
};

/**
 * Types of observations generated in reconnaissance mode.
 * These replace actions - agents observe and report rather than execute.
 */
export type ObservationType =
  | 'LISTING_DISCOVERED'          // New listing found matching criteria
  | 'PRICE_OBSERVED'              // Price data point recorded
  | 'MARKET_CONDITION_DETECTED'   // Market trend or anomaly identified
  | 'OPPORTUNITY_IDENTIFIED'      // High-confidence acquisition opportunity
  | 'SELLER_BEHAVIOR_OBSERVED'    // Seller pattern data point
  | 'PROBE_REQUESTED'             // Agent wants to probe seller (needs human approval)
  | 'PROBE_EXECUTED'              // Human-approved probe was executed
  | 'ALERT_TRIGGERED';            // Alert condition met

/**
 * Market condition assessment.
 */
export type MarketCondition = 'UNDERPRICED' | 'FAIR' | 'OVERPRICED' | 'UNKNOWN';

/**
 * Competition level for a listing.
 */
export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Recommended action that an agent would take (in COMBAT mode).
 */
export type RecommendedAction = 'BID' | 'OFFER' | 'WATCH' | 'SKIP';

/**
 * Observation record - the core data structure for reconnaissance mode.
 * Captures what an agent observed and what it would have done.
 */
export interface Observation {
  /** Unique observation identifier */
  observationId: string;
  /** Type of observation */
  observationType: ObservationType;
  /** Agent that made this observation */
  agentId: string;
  /** Parent swarm */
  swarmId: string;
  /** Related listing ID (if applicable) */
  listingId?: string;

  // What the agent would have done in COMBAT mode
  /** Recommended action */
  recommendedAction: RecommendedAction;
  /** Recommended amount for bid/offer */
  recommendedAmount?: number;

  // Intelligence gathered
  /** Market condition assessment */
  marketCondition: MarketCondition;
  /** Confidence in the assessment (0-1) */
  confidenceScore: number;
  /** Agent's reasoning for the recommendation */
  reasoning: string;

  // Context
  /** Current price of the listing */
  currentPrice: number;
  /** Computed market average for similar items */
  marketAverage?: number;
  /** Discount percentage vs market average */
  discountPercent?: number;
  /** Competition level */
  competitionLevel: CompetitionLevel;

  // Listing snapshot (for historical reference)
  /** Item title at time of observation */
  itemTitle?: string;
  /** Seller ID */
  sellerId?: string;
  /** Time remaining in auction (seconds) */
  timeRemaining?: number;

  // Metadata
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Generate a unique observation ID.
 */
export function generateObservationId(): string {
  return `obs_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of alerts that can be triggered.
 */
export type AlertType =
  | 'PRICE_ANOMALY'         // Listing significantly below market
  | 'PATTERN_MATCH'         // Seller/listing matches saved criteria
  | 'MULTI_AGENT_CONSENSUS'; // Multiple agents flagged same opportunity

/**
 * Alert severity levels.
 */
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Alert status in the approval workflow.
 */
export type AlertStatus =
  | 'PENDING'   // Awaiting human review
  | 'APPROVED'  // Human approved action
  | 'REJECTED'  // Human rejected action
  | 'EXPIRED'   // Approval deadline passed
  | 'EXECUTED'; // Action was taken

/**
 * Pattern matching rule for alert triggers.
 */
export interface PatternRule {
  /** Unique rule identifier */
  ruleId: string;
  /** Human-readable name */
  name: string;
  /** Rule description */
  description?: string;
  /** Whether rule is active */
  enabled: boolean;
  /** Conditions to match */
  conditions: {
    /** Price discount threshold (%) */
    minDiscountPercent?: number;
    /** Minimum seller feedback score */
    minSellerFeedback?: number;
    /** Maximum seller feedback score (for new sellers) */
    maxSellerFeedback?: number;
    /** Listing formats to match */
    listingFormats?: ListingFormat[];
    /** Keywords to match in title */
    titleKeywords?: string[];
    /** Categories to match */
    categoryIds?: string[];
    /** Time window (hours until auction end) */
    maxTimeRemaining?: number;
    /** Minimum confidence score from agent */
    minConfidence?: number;
  };
  /** Action to take when pattern matches */
  action: 'ALERT' | 'PROBE_REQUEST' | 'LOG_ONLY';
  /** Priority (higher = more important) */
  priority: number;
}

/**
 * Alert configuration for a swarm.
 */
export interface AlertConfig {
  /** Price anomaly threshold (% below market to trigger) */
  priceAnomalyThreshold: number;
  /** Confidence threshold for multi-agent consensus */
  confidenceThreshold: number;
  /** Minimum agents required for consensus */
  minAgentsForConsensus: number;
  /** Pattern matching rules */
  patternMatchRules: PatternRule[];
  /** Whether to send webhook notifications */
  webhookEnabled: boolean;
  /** Webhook URL for notifications */
  webhookUrl?: string;
  /** Alert expiry time (hours) */
  alertExpiryHours: number;
}

/**
 * Default alert configuration.
 */
export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  priceAnomalyThreshold: 15,     // 15% below market triggers alert
  confidenceThreshold: 0.75,     // 75% confidence required
  minAgentsForConsensus: 3,      // 3 agents must agree
  patternMatchRules: [],
  webhookEnabled: false,
  alertExpiryHours: 24,
};

/**
 * Alert record - represents an actionable intelligence item.
 */
export interface Alert {
  /** Unique alert identifier */
  alertId: string;
  /** Type of alert */
  alertType: AlertType;
  /** Severity level */
  severity: AlertSeverity;
  /** Parent swarm */
  swarmId: string;

  // Trigger information
  /** Observation IDs that triggered this alert */
  triggerObservationIds: string[];
  /** Full observations (for convenience) */
  triggerObservations?: Observation[];
  /** Listing ID this alert concerns */
  listingId: string;

  // Recommendation
  /** Recommended action */
  recommendedAction: RecommendedAction;
  /** Recommended amount */
  recommendedAmount?: number;
  /** Estimated value of the opportunity */
  estimatedValue: number;
  /** Combined confidence score */
  confidence: number;
  /** Human-readable summary */
  summary: string;

  // Approval workflow
  /** Whether human approval is required */
  requiresApproval: boolean;
  /** Deadline for approval */
  approvalDeadline?: string;
  /** Current status */
  status: AlertStatus;
  /** Who resolved the alert */
  resolvedBy?: string;
  /** Resolution timestamp */
  resolvedAt?: string;
  /** Resolution notes */
  resolutionNotes?: string;

  // Timestamps
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Generate a unique alert ID.
 */
export function generateAlertId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Negotiation style observed from seller behavior.
 */
export type NegotiationStyle =
  | 'FIRM'           // Rarely accepts offers below ask
  | 'FLEXIBLE'       // Often accepts reasonable offers
  | 'COUNTER_HAPPY'  // Prefers to counter rather than accept/reject
  | 'UNKNOWN';       // Insufficient data

/**
 * Risk level assessment for a seller.
 */
export type SellerRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

/**
 * Seller profile built from observations.
 */
export interface SellerProfile {
  /** eBay seller ID */
  sellerId: string;
  /** eBay feedback score */
  feedbackScore?: number;
  /** eBay feedback percentage */
  feedbackPercent?: number;

  // Computed from observations (anti-gaming)
  /** Total interactions observed */
  totalInteractions: number;
  /** Successful acquisitions from this seller */
  successfulAcquisitions: number;
  /** Average discount achieved */
  avgDiscountAchieved?: number;
  /** Observed negotiation style */
  negotiationStyle: NegotiationStyle;
  /** Best Offer acceptance rate */
  bestOfferAcceptanceRate?: number;
  /** Average response time to offers (hours) */
  avgOfferResponseTime?: number;
  /** Computed risk level */
  riskLevel: SellerRiskLevel;

  // Timestamps
  /** First observed */
  firstSeenAt: string;
  /** Last updated */
  lastUpdatedAt: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Generate a seller profile ID.
 */
export function generateSellerProfileId(sellerId: string): string {
  return `seller_${sellerId}`;
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// RE-EXPORTS FROM EBAY MODULE
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export eBay types for convenience - strategies and controller import from here
export type { NormalizedListing, SearchQuery } from './ebay/types.js';
