/**
 * Market Agent Swarm - Database Layer
 *
 * SQLite database for persisting swarm configurations, agent state,
 * and the immutable event stream that powers computed insights.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  SwarmConfig,
  SwarmState,
  SwarmStatus,
  MarketAgentConfig,
  MarketAgentStatus,
  SwarmEvent,
  SwarmInsights,
  BiddingStrategy,
  Currency,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let db: Database.Database | null = null;

/**
 * Get the database path from environment or use default.
 */
function getDatabasePath(): string {
  const envPath = process.env.SWARM_DB_PATH;
  if (envPath) {
    return envPath;
  }
  // Default path relative to project root
  return path.join(process.cwd(), 'data', 'swarm', 'market-agents.db');
}

/**
 * Initialize the swarm database.
 */
export function initializeSwarmDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getDatabasePath();

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  createTables(db);
  createIndexes(db);

  return db;
}

/**
 * Get the database instance.
 */
export function getSwarmDatabase(): Database.Database {
  if (!db) {
    return initializeSwarmDatabase();
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeSwarmDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

function createTables(db: Database.Database): void {
  // ─────────────────────────────────────────────────────────────────────────────
  // Swarm Configurations
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      swarm_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      total_budget REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      agent_count INTEGER NOT NULL,
      strategy_distribution TEXT NOT NULL,
      campaign_start TEXT NOT NULL,
      campaign_end TEXT NOT NULL,
      target_criteria TEXT NOT NULL,
      sandbox_mode INTEGER NOT NULL DEFAULT 1,
      fee_reserve_percent REAL NOT NULL DEFAULT 5,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- Runtime state
      status TEXT NOT NULL DEFAULT 'configuring'
        CHECK (status IN ('configuring', 'ready', 'active', 'paused', 'completed', 'terminated')),
      total_spent REAL NOT NULL DEFAULT 0,
      total_acquired INTEGER NOT NULL DEFAULT 0,
      active_agents INTEGER NOT NULL DEFAULT 0,
      last_activity_at TEXT,
      status_message TEXT,

      CONSTRAINT valid_swarm_id CHECK (swarm_id LIKE 'swarm_%'),
      CONSTRAINT valid_budget CHECK (total_budget > 0),
      CONSTRAINT valid_agent_count CHECK (agent_count > 0 AND agent_count <= 100)
    )
  `);

  // ─────────────────────────────────────────────────────────────────────────────
  // Market Agents
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      swarm_id TEXT NOT NULL,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL
        CHECK (strategy IN ('SNIPER', 'EARLY_AGGRESSIVE', 'NEGOTIATOR', 'HYBRID', 'PASSIVE')),

      -- Budget tracking
      budget_allocated REAL NOT NULL,
      budget_spent REAL NOT NULL DEFAULT 0,
      budget_reserved REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      max_per_item REAL NOT NULL,

      -- Constraints
      max_concurrent_listings INTEGER NOT NULL DEFAULT 10,
      max_bids_per_hour INTEGER NOT NULL DEFAULT 20,
      max_offers_per_hour INTEGER NOT NULL DEFAULT 10,
      require_approval_above REAL,

      -- Time window
      time_window_start TEXT NOT NULL,
      time_window_end TEXT NOT NULL,

      -- State
      status TEXT NOT NULL DEFAULT 'idle'
        CHECK (status IN ('idle', 'searching', 'monitoring', 'bidding', 'negotiating',
                          'won', 'outbid', 'depleted', 'paused', 'terminated')),
      status_message TEXT,

      -- Metrics (denormalized for quick access, computed from events)
      items_won INTEGER NOT NULL DEFAULT 0,
      items_lost INTEGER NOT NULL DEFAULT 0,
      total_bids_placed INTEGER NOT NULL DEFAULT 0,
      total_offers_made INTEGER NOT NULL DEFAULT 0,

      -- Timestamps
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      last_activity_at TEXT,
      completed_at TEXT,

      FOREIGN KEY (swarm_id) REFERENCES swarm_configs(swarm_id) ON DELETE CASCADE,
      CONSTRAINT valid_agent_id CHECK (agent_id LIKE 'mkt_agent_%'),
      CONSTRAINT valid_budget CHECK (budget_allocated > 0)
    )
  `);

  // ─────────────────────────────────────────────────────────────────────────────
  // Bid Events (Immutable Audit Trail)
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      agent_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),

      -- Event-specific data stored as JSON
      item_id TEXT,
      item_title TEXT,
      amount REAL,
      currency TEXT,
      metadata TEXT,

      -- Source verification (for anti-gaming)
      source_uri TEXT,
      source_verified INTEGER DEFAULT 0,

      FOREIGN KEY (swarm_id) REFERENCES swarm_configs(swarm_id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES market_agents(agent_id) ON DELETE SET NULL,
      CONSTRAINT valid_event_id CHECK (event_id LIKE 'evt_%')
    )
  `);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tracked Listings
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,

      -- Listing details
      title TEXT NOT NULL,
      list_price REAL NOT NULL,
      current_bid REAL,
      buy_it_now_price REAL,
      listing_format TEXT NOT NULL,
      condition TEXT,
      end_time TEXT NOT NULL,

      -- Seller info
      seller_id TEXT,
      seller_username TEXT,
      seller_feedback_score INTEGER,
      seller_feedback_percent REAL,

      -- Tracking state
      tracking_agents TEXT NOT NULL DEFAULT '[]',
      our_highest_bid REAL,
      our_max_bid REAL,
      is_winning INTEGER DEFAULT 0,

      -- Status
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'won', 'lost', 'ended', 'removed')),

      -- Timestamps
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),

      FOREIGN KEY (swarm_id) REFERENCES swarm_configs(swarm_id) ON DELETE CASCADE,
      UNIQUE (item_id, swarm_id)
    )
  `);

  // ─────────────────────────────────────────────────────────────────────────────
  // Computed Insights (Periodic Snapshots)
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insight_id TEXT UNIQUE NOT NULL,
      swarm_id TEXT NOT NULL,
      computation_time TEXT NOT NULL DEFAULT (datetime('now')),

      -- Computed data (JSON)
      agent_effectiveness TEXT NOT NULL,
      strategy_rankings TEXT NOT NULL,
      seller_patterns TEXT,
      concentration_risks TEXT,
      summary TEXT NOT NULL,
      data_quality TEXT NOT NULL,

      -- Metrics for quick access
      total_spent REAL NOT NULL,
      total_acquired INTEGER NOT NULL,
      overall_win_rate REAL NOT NULL,
      overall_efficiency REAL NOT NULL,
      top_strategy TEXT,
      top_agent TEXT,

      -- Data quality
      total_events INTEGER NOT NULL,
      confidence_score REAL NOT NULL,

      FOREIGN KEY (swarm_id) REFERENCES swarm_configs(swarm_id) ON DELETE CASCADE
    )
  `);

  // ─────────────────────────────────────────────────────────────────────────────
  // Audit Log (for compliance and debugging)
  // ─────────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      swarm_id TEXT,
      agent_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT
    )
  `);
}

function createIndexes(db: Database.Database): void {
  // Swarm configs
  db.exec(`CREATE INDEX IF NOT EXISTS idx_swarm_status ON swarm_configs(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_swarm_created_by ON swarm_configs(created_by)`);

  // Market agents
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_swarm ON market_agents(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_status ON market_agents(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_strategy ON market_agents(strategy)`);

  // Events (critical for insight computation)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_swarm ON swarm_events(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_agent ON swarm_events(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_type ON swarm_events(event_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_timestamp ON swarm_events(timestamp)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_item ON swarm_events(item_id)`);

  // Tracked listings
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_swarm ON tracked_listings(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_status ON tracked_listings(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_end_time ON tracked_listings(end_time)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_seller ON tracked_listings(seller_id)`);

  // Insights
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_swarm ON swarm_insights(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_insights_time ON swarm_insights(computation_time)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWARM CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new swarm configuration.
 */
export function createSwarm(config: SwarmConfig): SwarmConfig {
  const db = getSwarmDatabase();

  const stmt = db.prepare(`
    INSERT INTO swarm_configs (
      swarm_id, name, total_budget, currency, agent_count,
      strategy_distribution, campaign_start, campaign_end,
      target_criteria, sandbox_mode, fee_reserve_percent,
      created_by, created_at, status
    ) VALUES (
      @swarmId, @name, @totalBudget, @currency, @agentCount,
      @strategyDistribution, @campaignStart, @campaignEnd,
      @targetCriteria, @sandboxMode, @feeReservePercent,
      @createdBy, @createdAt, 'configuring'
    )
  `);

  stmt.run({
    swarmId: config.swarmId,
    name: config.name,
    totalBudget: config.totalBudget,
    currency: config.currency,
    agentCount: config.agentCount,
    strategyDistribution: JSON.stringify(config.strategyDistribution),
    campaignStart: config.campaignWindow.startAt,
    campaignEnd: config.campaignWindow.endAt,
    targetCriteria: JSON.stringify(config.targetCriteria),
    sandboxMode: config.sandboxMode ? 1 : 0,
    feeReservePercent: config.feeReservePercent,
    createdBy: config.createdBy,
    createdAt: config.createdAt,
  });

  // Record audit event
  recordAuditEvent({
    eventType: 'SWARM_CREATED',
    swarmId: config.swarmId,
    action: 'create',
    details: JSON.stringify({ name: config.name, budget: config.totalBudget }),
  });

  return config;
}

/**
 * Get a swarm configuration by ID.
 */
export function getSwarm(swarmId: string): (SwarmConfig & SwarmState) | null {
  const db = getSwarmDatabase();

  const row = db.prepare(`
    SELECT * FROM swarm_configs WHERE swarm_id = ?
  `).get(swarmId) as any;

  if (!row) return null;

  return {
    swarmId: row.swarm_id,
    name: row.name,
    totalBudget: row.total_budget,
    currency: row.currency as Currency,
    agentCount: row.agent_count,
    strategyDistribution: JSON.parse(row.strategy_distribution),
    campaignWindow: {
      startAt: row.campaign_start,
      endAt: row.campaign_end,
    },
    targetCriteria: JSON.parse(row.target_criteria),
    sandboxMode: row.sandbox_mode === 1,
    feeReservePercent: row.fee_reserve_percent,
    createdBy: row.created_by,
    createdAt: row.created_at,
    // State
    status: row.status as SwarmStatus,
    totalSpent: row.total_spent,
    totalAcquired: row.total_acquired,
    activeAgents: row.active_agents,
    lastActivityAt: row.last_activity_at,
    statusMessage: row.status_message,
  };
}

/**
 * Update swarm state.
 */
export function updateSwarmState(
  swarmId: string,
  updates: Partial<SwarmState>
): boolean {
  const db = getSwarmDatabase();

  const setClauses: string[] = [];
  const params: Record<string, any> = { swarmId };

  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    params.status = updates.status;
  }
  if (updates.totalSpent !== undefined) {
    setClauses.push('total_spent = @totalSpent');
    params.totalSpent = updates.totalSpent;
  }
  if (updates.totalAcquired !== undefined) {
    setClauses.push('total_acquired = @totalAcquired');
    params.totalAcquired = updates.totalAcquired;
  }
  if (updates.activeAgents !== undefined) {
    setClauses.push('active_agents = @activeAgents');
    params.activeAgents = updates.activeAgents;
  }
  if (updates.lastActivityAt !== undefined) {
    setClauses.push('last_activity_at = @lastActivityAt');
    params.lastActivityAt = updates.lastActivityAt;
  }
  if (updates.statusMessage !== undefined) {
    setClauses.push('status_message = @statusMessage');
    params.statusMessage = updates.statusMessage;
  }

  if (setClauses.length === 0) return false;

  const result = db.prepare(`
    UPDATE swarm_configs SET ${setClauses.join(', ')} WHERE swarm_id = @swarmId
  `).run(params);

  return result.changes > 0;
}

/**
 * List swarms with optional filters.
 */
export function listSwarms(filters?: {
  status?: SwarmStatus;
  createdBy?: string;
  limit?: number;
}): (SwarmConfig & SwarmState)[] {
  const db = getSwarmDatabase();

  let query = 'SELECT * FROM swarm_configs WHERE 1=1';
  const params: Record<string, any> = {};

  if (filters?.status) {
    query += ' AND status = @status';
    params.status = filters.status;
  }
  if (filters?.createdBy) {
    query += ' AND created_by = @createdBy';
    params.createdBy = filters.createdBy;
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT @limit';
    params.limit = filters.limit;
  }

  const rows = db.prepare(query).all(params) as any[];

  return rows.map(row => ({
    swarmId: row.swarm_id,
    name: row.name,
    totalBudget: row.total_budget,
    currency: row.currency as Currency,
    agentCount: row.agent_count,
    strategyDistribution: JSON.parse(row.strategy_distribution),
    campaignWindow: {
      startAt: row.campaign_start,
      endAt: row.campaign_end,
    },
    targetCriteria: JSON.parse(row.target_criteria),
    sandboxMode: row.sandbox_mode === 1,
    feeReservePercent: row.fee_reserve_percent,
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status as SwarmStatus,
    totalSpent: row.total_spent,
    totalAcquired: row.total_acquired,
    activeAgents: row.active_agents,
    lastActivityAt: row.last_activity_at,
    statusMessage: row.status_message,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new market agent.
 */
export function createAgent(config: MarketAgentConfig): MarketAgentConfig {
  const db = getSwarmDatabase();

  const stmt = db.prepare(`
    INSERT INTO market_agents (
      agent_id, swarm_id, name, strategy,
      budget_allocated, currency, max_per_item,
      max_concurrent_listings, max_bids_per_hour, max_offers_per_hour,
      require_approval_above, time_window_start, time_window_end,
      status, created_at
    ) VALUES (
      @agentId, @swarmId, @name, @strategy,
      @budgetAllocated, @currency, @maxPerItem,
      @maxConcurrentListings, @maxBidsPerHour, @maxOffersPerHour,
      @requireApprovalAbove, @timeWindowStart, @timeWindowEnd,
      'idle', datetime('now')
    )
  `);

  stmt.run({
    agentId: config.agentId,
    swarmId: config.swarmId,
    name: config.name,
    strategy: config.strategy,
    budgetAllocated: config.budget.amount,
    currency: config.budget.currency,
    maxPerItem: config.budget.maxPerItem,
    maxConcurrentListings: config.constraints.maxConcurrentListings,
    maxBidsPerHour: config.constraints.maxBidsPerHour,
    maxOffersPerHour: config.constraints.maxOffersPerHour,
    requireApprovalAbove: config.constraints.requireApprovalAbove ?? null,
    timeWindowStart: config.timeWindow.startAt,
    timeWindowEnd: config.timeWindow.endAt,
  });

  return config;
}

/**
 * Get an agent by ID.
 */
export function getAgent(agentId: string): (MarketAgentConfig & {
  status: MarketAgentStatus;
  budgetSpent: number;
  budgetReserved: number;
  itemsWon: number;
  itemsLost: number;
}) | null {
  const db = getSwarmDatabase();

  const row = db.prepare(`
    SELECT * FROM market_agents WHERE agent_id = ?
  `).get(agentId) as any;

  if (!row) return null;

  return {
    agentId: row.agent_id,
    swarmId: row.swarm_id,
    name: row.name,
    strategy: row.strategy as BiddingStrategy,
    budget: {
      amount: row.budget_allocated,
      currency: row.currency as Currency,
      maxPerItem: row.max_per_item,
      reservePercent: 5, // Default
    },
    timeWindow: {
      startAt: row.time_window_start,
      endAt: row.time_window_end,
    },
    targetCriteria: { searchQuery: '' } as any, // From swarm
    constraints: {
      maxConcurrentListings: row.max_concurrent_listings,
      maxBidsPerHour: row.max_bids_per_hour,
      maxOffersPerHour: row.max_offers_per_hour,
      minActionIntervalMs: 5000,
      requireApprovalAbove: row.require_approval_above,
    },
    status: row.status as MarketAgentStatus,
    budgetSpent: row.budget_spent,
    budgetReserved: row.budget_reserved,
    itemsWon: row.items_won,
    itemsLost: row.items_lost,
  };
}

/**
 * Update agent state.
 */
export function updateAgentState(
  agentId: string,
  updates: Partial<{
    status: MarketAgentStatus;
    statusMessage: string;
    budgetSpent: number;
    budgetReserved: number;
    itemsWon: number;
    itemsLost: number;
    totalBidsPlaced: number;
    totalOffersMade: number;
    lastActivityAt: string;
    startedAt: string;
    completedAt: string;
  }>
): boolean {
  const db = getSwarmDatabase();

  const setClauses: string[] = [];
  const params: Record<string, any> = { agentId };

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClauses.push(`${snakeKey} = @${key}`);
      params[key] = value;
    }
  });

  if (setClauses.length === 0) return false;

  const result = db.prepare(`
    UPDATE market_agents SET ${setClauses.join(', ')} WHERE agent_id = @agentId
  `).run(params);

  return result.changes > 0;
}

/**
 * List agents for a swarm.
 */
export function listAgents(swarmId: string, filters?: {
  status?: MarketAgentStatus;
  strategy?: BiddingStrategy;
}): any[] {
  const db = getSwarmDatabase();

  let query = 'SELECT * FROM market_agents WHERE swarm_id = @swarmId';
  const params: Record<string, any> = { swarmId };

  if (filters?.status) {
    query += ' AND status = @status';
    params.status = filters.status;
  }
  if (filters?.strategy) {
    query += ' AND strategy = @strategy';
    params.strategy = filters.strategy;
  }

  query += ' ORDER BY created_at ASC';

  return db.prepare(query).all(params) as any[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT OPERATIONS (Immutable)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a swarm event (immutable).
 */
export function recordEvent(event: SwarmEvent): void {
  const db = getSwarmDatabase();

  db.prepare(`
    INSERT INTO swarm_events (
      event_id, event_type, swarm_id, agent_id, timestamp,
      item_id, item_title, amount, currency, metadata, source_uri
    ) VALUES (
      @eventId, @eventType, @swarmId, @agentId, @timestamp,
      @itemId, @itemTitle, @amount, @currency, @metadata, @sourceUri
    )
  `).run({
    eventId: event.eventId,
    eventType: event.eventType,
    swarmId: event.swarmId,
    agentId: event.agentId ?? null,
    timestamp: event.timestamp,
    itemId: (event as any).itemId ?? null,
    itemTitle: (event as any).itemTitle ?? null,
    amount: (event as any).bidAmount ?? (event as any).offerAmount ?? (event as any).finalPrice ?? null,
    currency: (event as any).currency ?? null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    sourceUri: (event as any).sourceUri ?? null,
  });
}

/**
 * Query events for insight computation.
 */
export function queryEvents(filters: {
  swarmId: string;
  agentId?: string;
  eventTypes?: string[];
  since?: string;
  until?: string;
  itemId?: string;
  limit?: number;
}): SwarmEvent[] {
  const db = getSwarmDatabase();

  let query = 'SELECT * FROM swarm_events WHERE swarm_id = @swarmId';
  const params: Record<string, any> = { swarmId: filters.swarmId };

  if (filters.agentId) {
    query += ' AND agent_id = @agentId';
    params.agentId = filters.agentId;
  }
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    query += ` AND event_type IN (${filters.eventTypes.map((_, i) => `@eventType${i}`).join(',')})`;
    filters.eventTypes.forEach((et, i) => {
      params[`eventType${i}`] = et;
    });
  }
  if (filters.since) {
    query += ' AND timestamp >= @since';
    params.since = filters.since;
  }
  if (filters.until) {
    query += ' AND timestamp <= @until';
    params.until = filters.until;
  }
  if (filters.itemId) {
    query += ' AND item_id = @itemId';
    params.itemId = filters.itemId;
  }

  query += ' ORDER BY timestamp ASC';

  if (filters.limit) {
    query += ' LIMIT @limit';
    params.limit = filters.limit;
  }

  const rows = db.prepare(query).all(params) as any[];

  return rows.map(row => ({
    eventId: row.event_id,
    eventType: row.event_type,
    swarmId: row.swarm_id,
    agentId: row.agent_id,
    timestamp: row.timestamp,
    itemId: row.item_id,
    itemTitle: row.item_title,
    amount: row.amount,
    currency: row.currency,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  })) as SwarmEvent[];
}

/**
 * Get event counts by type for a swarm.
 */
export function getEventCounts(swarmId: string): Record<string, number> {
  const db = getSwarmDatabase();

  const rows = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM swarm_events
    WHERE swarm_id = ?
    GROUP BY event_type
  `).all(swarmId) as any[];

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.event_type] = row.count;
  }
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKED LISTINGS OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add or update a tracked listing.
 */
export function upsertTrackedListing(listing: {
  itemId: string;
  swarmId: string;
  title: string;
  listPrice: number;
  currentBid?: number;
  buyItNowPrice?: number;
  listingFormat: string;
  condition?: string;
  endTime: string;
  sellerId?: string;
  sellerUsername?: string;
  sellerFeedbackScore?: number;
  sellerFeedbackPercent?: number;
}): void {
  const db = getSwarmDatabase();

  db.prepare(`
    INSERT INTO tracked_listings (
      item_id, swarm_id, title, list_price, current_bid, buy_it_now_price,
      listing_format, condition, end_time, seller_id, seller_username,
      seller_feedback_score, seller_feedback_percent
    ) VALUES (
      @itemId, @swarmId, @title, @listPrice, @currentBid, @buyItNowPrice,
      @listingFormat, @condition, @endTime, @sellerId, @sellerUsername,
      @sellerFeedbackScore, @sellerFeedbackPercent
    )
    ON CONFLICT (item_id, swarm_id) DO UPDATE SET
      current_bid = @currentBid,
      last_updated_at = datetime('now')
  `).run({
    itemId: listing.itemId,
    swarmId: listing.swarmId,
    title: listing.title,
    listPrice: listing.listPrice,
    currentBid: listing.currentBid ?? null,
    buyItNowPrice: listing.buyItNowPrice ?? null,
    listingFormat: listing.listingFormat,
    condition: listing.condition ?? null,
    endTime: listing.endTime,
    sellerId: listing.sellerId ?? null,
    sellerUsername: listing.sellerUsername ?? null,
    sellerFeedbackScore: listing.sellerFeedbackScore ?? null,
    sellerFeedbackPercent: listing.sellerFeedbackPercent ?? null,
  });
}

/**
 * Get active listings for a swarm.
 */
export function getActiveListings(swarmId: string): any[] {
  const db = getSwarmDatabase();

  return db.prepare(`
    SELECT * FROM tracked_listings
    WHERE swarm_id = ? AND status = 'active'
    ORDER BY end_time ASC
  `).all(swarmId) as any[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHTS OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Store computed insights.
 */
export function storeInsights(insights: SwarmInsights): void {
  const db = getSwarmDatabase();

  const insightId = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  db.prepare(`
    INSERT INTO swarm_insights (
      insight_id, swarm_id, computation_time,
      agent_effectiveness, strategy_rankings, seller_patterns,
      concentration_risks, summary, data_quality,
      total_spent, total_acquired, overall_win_rate, overall_efficiency,
      top_strategy, top_agent, total_events, confidence_score
    ) VALUES (
      @insightId, @swarmId, @computedAt,
      @agentEffectiveness, @strategyRankings, @sellerPatterns,
      @concentrationRisks, @summary, @dataQuality,
      @totalSpent, @totalAcquired, @overallWinRate, @overallEfficiency,
      @topStrategy, @topAgent, @totalEvents, @confidenceScore
    )
  `).run({
    insightId,
    swarmId: insights.swarmId,
    computedAt: insights.computedAt,
    agentEffectiveness: JSON.stringify(insights.agentEffectiveness),
    strategyRankings: JSON.stringify(insights.strategyRankings),
    sellerPatterns: JSON.stringify(insights.sellerPatterns),
    concentrationRisks: JSON.stringify(insights.concentrationRisks),
    summary: JSON.stringify(insights.summary),
    dataQuality: JSON.stringify(insights.dataQuality),
    totalSpent: insights.summary.totalSpent,
    totalAcquired: insights.summary.totalAcquired,
    overallWinRate: insights.summary.overallWinRate,
    overallEfficiency: insights.summary.overallEfficiency,
    topStrategy: insights.summary.topPerformingStrategy,
    topAgent: insights.summary.topPerformingAgent,
    totalEvents: insights.dataQuality.totalEvents,
    confidenceScore: insights.dataQuality.confidenceScore,
  });
}

/**
 * Get latest insights for a swarm.
 */
export function getLatestInsights(swarmId: string): SwarmInsights | null {
  const db = getSwarmDatabase();

  const row = db.prepare(`
    SELECT * FROM swarm_insights
    WHERE swarm_id = ?
    ORDER BY computation_time DESC
    LIMIT 1
  `).get(swarmId) as any;

  if (!row) return null;

  return {
    swarmId: row.swarm_id,
    computedAt: row.computation_time,
    agentEffectiveness: JSON.parse(row.agent_effectiveness),
    strategyRankings: JSON.parse(row.strategy_rankings),
    sellerPatterns: JSON.parse(row.seller_patterns || '[]'),
    concentrationRisks: JSON.parse(row.concentration_risks || '[]'),
    summary: JSON.parse(row.summary),
    dataQuality: JSON.parse(row.data_quality),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record an audit event.
 */
export function recordAuditEvent(event: {
  eventType: string;
  swarmId?: string;
  agentId?: string;
  userId?: string;
  action: string;
  details?: string;
}): void {
  const db = getSwarmDatabase();

  db.prepare(`
    INSERT INTO swarm_audit_log (
      event_type, swarm_id, agent_id, user_id, action, details
    ) VALUES (
      @eventType, @swarmId, @agentId, @userId, @action, @details
    )
  `).run({
    eventType: event.eventType,
    swarmId: event.swarmId ?? null,
    agentId: event.agentId ?? null,
    userId: event.userId ?? null,
    action: event.action,
    details: event.details ?? null,
  });
}
