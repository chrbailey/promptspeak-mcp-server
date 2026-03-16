// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK GOVERNANCE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════
// SQLite persistence for holds, hold decisions, and circuit breaker state.
// Follows the same patterns as symbols/database.ts:
// - WAL mode, prepared statements, singleton pattern
// - In-memory maps remain the hot cache; SQLite is the durable store
// ═══════════════════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import type { Database as DatabaseInstance, Statement } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  HoldRequest,
  HoldDecision,
  HoldDecider,
  HoldReason,
  HoldState,
  CircuitBreakerState,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const SCHEMA_SQL = `
-- Holds table: pending + resolved holds
CREATE TABLE IF NOT EXISTS holds (
  hold_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  frame TEXT NOT NULL,
  tool TEXT NOT NULL,
  arguments TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'expired')),
  created_at INTEGER NOT NULL,
  expires_at REAL NOT NULL,
  drift_score REAL,
  predicted_drift REAL,
  evidence TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_holds_state ON holds(state);
CREATE INDEX IF NOT EXISTS idx_holds_agent ON holds(agent_id);
CREATE INDEX IF NOT EXISTS idx_holds_reason ON holds(reason);
CREATE INDEX IF NOT EXISTS idx_holds_created ON holds(created_at DESC);

-- Hold decisions (audit trail of approve/reject/expire)
-- No FK constraint: decisions are an immutable audit trail and may reference
-- holds from before persistence was enabled, or holds that were cleared.
CREATE TABLE IF NOT EXISTS hold_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('approved', 'rejected', 'expired')),
  decided_by TEXT NOT NULL CHECK (decided_by IN ('human', 'system', 'timeout')),
  decided_at INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  modified_frame TEXT,
  modified_args TEXT
);

CREATE INDEX IF NOT EXISTS idx_decisions_hold ON hold_decisions(hold_id);
CREATE INDEX IF NOT EXISTS idx_decisions_decided ON hold_decisions(decided_at DESC);

-- Governance audit log (operator-level action tracking)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- Circuit breaker state (per agent)
CREATE TABLE IF NOT EXISTS circuit_breakers (
  agent_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('closed', 'open', 'half-open')),
  reason TEXT,
  opened_at INTEGER,
  last_failure TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cb_state ON circuit_breakers(state);
`;

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class GovernanceDatabase {
  private db: DatabaseInstance;
  private dbPath: string;

  // Hold statements
  private stmtInsertHold!: Statement;
  private stmtUpdateHoldState!: Statement;
  private stmtGetHold!: Statement;
  private stmtGetPendingHolds!: Statement;
  private stmtGetHoldsByAgent!: Statement;
  private stmtDeleteHold!: Statement;

  // Hold decision statements
  private stmtInsertDecision!: Statement;
  private stmtGetDecisions!: Statement;
  private stmtGetDecisionsByHold!: Statement;

  // Audit log statements
  private stmtInsertAuditEntry!: Statement;
  private stmtGetAuditEntries!: Statement;
  private stmtGetAuditByAction!: Statement;
  private stmtGetAuditSince!: Statement;

  // Circuit breaker statements
  private stmtUpsertCircuitBreaker!: Statement;
  private stmtGetCircuitBreaker!: Statement;
  private stmtGetAllCircuitBreakers!: Statement;
  private stmtDeleteCircuitBreaker!: Statement;
  private stmtClearAllCircuitBreakers!: Statement;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);

    // Same pragmas as symbols/database.ts
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456');

    this.db.exec(SCHEMA_SQL);
    this.prepareStatements();
  }

  private prepareStatements(): void {
    // ─── Holds ───────────────────────────────────────────────────────────
    this.stmtInsertHold = this.db.prepare(`
      INSERT OR REPLACE INTO holds (
        hold_id, agent_id, frame, tool, arguments, reason, severity,
        state, created_at, expires_at, drift_score, predicted_drift,
        evidence, updated_at
      ) VALUES (
        @hold_id, @agent_id, @frame, @tool, @arguments, @reason, @severity,
        @state, @created_at, @expires_at, @drift_score, @predicted_drift,
        @evidence, @updated_at
      )
    `);

    this.stmtUpdateHoldState = this.db.prepare(`
      UPDATE holds SET state = @state, updated_at = @updated_at WHERE hold_id = @hold_id
    `);

    this.stmtGetHold = this.db.prepare(`
      SELECT * FROM holds WHERE hold_id = ?
    `);

    this.stmtGetPendingHolds = this.db.prepare(`
      SELECT * FROM holds WHERE state = 'pending' ORDER BY created_at ASC
    `);

    this.stmtGetHoldsByAgent = this.db.prepare(`
      SELECT * FROM holds WHERE agent_id = ? AND state = 'pending' ORDER BY created_at ASC
    `);

    this.stmtDeleteHold = this.db.prepare(`
      DELETE FROM holds WHERE hold_id = ?
    `);

    // ─── Hold Decisions ──────────────────────────────────────────────────
    this.stmtInsertDecision = this.db.prepare(`
      INSERT INTO hold_decisions (
        hold_id, state, decided_by, decided_at, reason, modified_frame, modified_args
      ) VALUES (
        @hold_id, @state, @decided_by, @decided_at, @reason, @modified_frame, @modified_args
      )
    `);

    this.stmtGetDecisions = this.db.prepare(`
      SELECT * FROM hold_decisions ORDER BY decided_at DESC LIMIT ?
    `);

    this.stmtGetDecisionsByHold = this.db.prepare(`
      SELECT * FROM hold_decisions WHERE hold_id = ? ORDER BY decided_at DESC
    `);

    // ─── Audit Log ────────────────────────────────────────────────────────
    this.stmtInsertAuditEntry = this.db.prepare(`
      INSERT INTO audit_log (timestamp, action, actor, details)
      VALUES (@timestamp, @action, @actor, @details)
    `);

    this.stmtGetAuditEntries = this.db.prepare(`
      SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?
    `);

    this.stmtGetAuditByAction = this.db.prepare(`
      SELECT * FROM audit_log WHERE action = @action ORDER BY timestamp DESC LIMIT @limit
    `);

    this.stmtGetAuditSince = this.db.prepare(`
      SELECT * FROM audit_log WHERE timestamp >= @since ORDER BY timestamp DESC LIMIT @limit
    `);

    // ─── Circuit Breakers ────────────────────────────────────────────────
    this.stmtUpsertCircuitBreaker = this.db.prepare(`
      INSERT OR REPLACE INTO circuit_breakers (
        agent_id, state, reason, opened_at, last_failure,
        failure_count, success_count, updated_at
      ) VALUES (
        @agent_id, @state, @reason, @opened_at, @last_failure,
        @failure_count, @success_count, @updated_at
      )
    `);

    this.stmtGetCircuitBreaker = this.db.prepare(`
      SELECT * FROM circuit_breakers WHERE agent_id = ?
    `);

    this.stmtGetAllCircuitBreakers = this.db.prepare(`
      SELECT * FROM circuit_breakers
    `);

    this.stmtDeleteCircuitBreaker = this.db.prepare(`
      DELETE FROM circuit_breakers WHERE agent_id = ?
    `);

    this.stmtClearAllCircuitBreakers = this.db.prepare(`
      DELETE FROM circuit_breakers
    `);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HOLD OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  saveHold(hold: HoldRequest): void {
    this.stmtInsertHold.run({
      hold_id: hold.holdId,
      agent_id: hold.agentId,
      frame: hold.frame,
      tool: hold.tool,
      arguments: JSON.stringify(hold.arguments),
      reason: hold.reason,
      severity: hold.severity,
      state: hold.state,
      created_at: hold.createdAt,
      expires_at: hold.expiresAt === Infinity ? 9999999999999 : hold.expiresAt,
      drift_score: hold.driftScore ?? null,
      predicted_drift: hold.predictedDrift ?? null,
      evidence: JSON.stringify(hold.evidence),
      updated_at: Date.now(),
    });
  }

  updateHoldState(holdId: string, state: HoldState): void {
    this.stmtUpdateHoldState.run({
      hold_id: holdId,
      state,
      updated_at: Date.now(),
    });
  }

  getHold(holdId: string): HoldRequest | null {
    const row = this.stmtGetHold.get(holdId) as HoldRow | undefined;
    return row ? this.rowToHold(row) : null;
  }

  getPendingHolds(): HoldRequest[] {
    const rows = this.stmtGetPendingHolds.all() as HoldRow[];
    return rows.map(r => this.rowToHold(r));
  }

  getHoldsByAgent(agentId: string): HoldRequest[] {
    const rows = this.stmtGetHoldsByAgent.all(agentId) as HoldRow[];
    return rows.map(r => this.rowToHold(r));
  }

  deleteHold(holdId: string): void {
    this.stmtDeleteHold.run(holdId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HOLD DECISION OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  saveDecision(decision: HoldDecision): void {
    this.stmtInsertDecision.run({
      hold_id: decision.holdId,
      state: decision.state,
      decided_by: decision.decidedBy,
      decided_at: decision.decidedAt,
      reason: decision.reason,
      modified_frame: decision.modifiedFrame ?? null,
      modified_args: decision.modifiedArgs ? JSON.stringify(decision.modifiedArgs) : null,
    });
  }

  getDecisions(limit: number = 100): HoldDecision[] {
    const rows = this.stmtGetDecisions.all(limit) as DecisionRow[];
    return rows.map(r => this.rowToDecision(r));
  }

  getDecisionsByHold(holdId: string): HoldDecision[] {
    const rows = this.stmtGetDecisionsByHold.all(holdId) as DecisionRow[];
    return rows.map(r => this.rowToDecision(r));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AUDIT LOG OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  saveAuditEntry(entry: { timestamp: number; action: string; actor: string; details: Record<string, unknown> }): void {
    this.stmtInsertAuditEntry.run({
      timestamp: entry.timestamp,
      action: entry.action,
      actor: entry.actor,
      details: JSON.stringify(entry.details),
    });
  }

  getAuditEntries(limit: number = 100): Array<{ timestamp: number; action: string; actor: string; details: Record<string, unknown> }> {
    const rows = this.stmtGetAuditEntries.all(limit) as AuditRow[];
    return rows.map(r => ({
      timestamp: r.timestamp,
      action: r.action,
      actor: r.actor,
      details: JSON.parse(r.details),
    }));
  }

  getAuditEntriesByAction(action: string, limit: number = 100): Array<{ timestamp: number; action: string; actor: string; details: Record<string, unknown> }> {
    const rows = this.stmtGetAuditByAction.all({ action, limit }) as AuditRow[];
    return rows.map(r => ({
      timestamp: r.timestamp,
      action: r.action,
      actor: r.actor,
      details: JSON.parse(r.details),
    }));
  }

  getAuditEntriesSince(since: number, limit: number = 100): Array<{ timestamp: number; action: string; actor: string; details: Record<string, unknown> }> {
    const rows = this.stmtGetAuditSince.all({ since, limit }) as AuditRow[];
    return rows.map(r => ({
      timestamp: r.timestamp,
      action: r.action,
      actor: r.actor,
      details: JSON.parse(r.details),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  saveCircuitBreaker(state: CircuitBreakerState): void {
    this.stmtUpsertCircuitBreaker.run({
      agent_id: state.agentId,
      state: state.state,
      reason: state.reason ?? null,
      opened_at: state.openedAt ?? null,
      last_failure: state.lastFailure ?? null,
      failure_count: state.failureCount,
      success_count: state.successCount,
      updated_at: Date.now(),
    });
  }

  getCircuitBreaker(agentId: string): CircuitBreakerState | null {
    const row = this.stmtGetCircuitBreaker.get(agentId) as CBRow | undefined;
    return row ? this.rowToCB(row) : null;
  }

  getAllCircuitBreakers(): CircuitBreakerState[] {
    const rows = this.stmtGetAllCircuitBreakers.all() as CBRow[];
    return rows.map(r => this.rowToCB(r));
  }

  deleteCircuitBreaker(agentId: string): void {
    this.stmtDeleteCircuitBreaker.run(agentId);
  }

  clearAllCircuitBreakers(): void {
    this.stmtClearAllCircuitBreakers.run();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ROW CONVERSION
  // ═══════════════════════════════════════════════════════════════════════

  private rowToHold(row: HoldRow): HoldRequest {
    return {
      holdId: row.hold_id,
      agentId: row.agent_id,
      frame: row.frame,
      tool: row.tool,
      arguments: JSON.parse(row.arguments),
      reason: row.reason as HoldReason,
      severity: row.severity as HoldRequest['severity'],
      state: row.state as HoldState,
      createdAt: row.created_at,
      expiresAt: row.expires_at >= 9999999999000 ? Infinity : row.expires_at,
      driftScore: row.drift_score ?? undefined,
      predictedDrift: row.predicted_drift ?? undefined,
      evidence: JSON.parse(row.evidence),
    };
  }

  private rowToDecision(row: DecisionRow): HoldDecision {
    return {
      holdId: row.hold_id,
      state: row.state as HoldState,
      decidedBy: row.decided_by as HoldDecider,
      decidedAt: row.decided_at,
      reason: row.reason,
      modifiedFrame: row.modified_frame ?? undefined,
      modifiedArgs: row.modified_args ? JSON.parse(row.modified_args) : undefined,
    };
  }

  private rowToCB(row: CBRow): CircuitBreakerState {
    return {
      agentId: row.agent_id,
      state: row.state,
      reason: row.reason ?? undefined,
      openedAt: row.opened_at ?? undefined,
      lastFailure: row.last_failure ?? undefined,
      failureCount: row.failure_count,
      successCount: row.success_count,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  close(): void {
    this.db.close();
  }

  /** Wrap multiple operations in a transaction */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROW TYPES (internal)
// ═══════════════════════════════════════════════════════════════════════════

interface HoldRow {
  hold_id: string;
  agent_id: string;
  frame: string;
  tool: string;
  arguments: string;
  reason: string;
  severity: string;
  state: string;
  created_at: number;
  expires_at: number;
  drift_score: number | null;
  predicted_drift: number | null;
  evidence: string;
  updated_at: number | null;
}

interface DecisionRow {
  id: number;
  hold_id: string;
  state: string;
  decided_by: string;
  decided_at: number;
  reason: string;
  modified_frame: string | null;
  modified_args: string | null;
}

interface AuditRow {
  id: number;
  timestamp: number;
  action: string;
  actor: string;
  details: string;
}

interface CBRow {
  agent_id: string;
  state: string;
  reason: string | null;
  opened_at: number | null;
  last_failure: string | null;
  failure_count: number;
  success_count: number;
  updated_at: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

let governanceDb: GovernanceDatabase | null = null;

export function initializeGovernanceDb(dbPath: string): GovernanceDatabase {
  if (governanceDb) {
    governanceDb.close();
  }
  governanceDb = new GovernanceDatabase(dbPath);
  return governanceDb;
}

export function getGovernanceDb(): GovernanceDatabase | null {
  return governanceDb;
}

export function closeGovernanceDb(): void {
  if (governanceDb) {
    governanceDb.close();
    governanceDb = null;
  }
}
