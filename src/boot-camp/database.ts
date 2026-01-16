/**
 * Boot Camp Database Layer
 *
 * SQLite database for persisting Boot Camp configurations, recruit records,
 * training progress, and certification status.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  BootCampConfig,
  BootCampState,
  RecruitRecord,
  RecruitStatus,
  TrainingPhase,
  PhaseEvaluation,
  DrillInstructor,
  DIReviewRequest,
  BootCampEvent,
  MarksmanshipQualification,
} from './types.js';
import type { BiddingStrategy, Currency } from '../swarm/types.js';

// =============================================================================
// DATABASE INITIALIZATION
// =============================================================================

let db: Database.Database | null = null;

/**
 * Get the database path from environment or use default.
 */
function getDatabasePath(): string {
  const envPath = process.env.BOOTCAMP_DB_PATH;
  if (envPath) {
    return envPath;
  }
  return path.join(process.cwd(), 'data', 'boot-camp', 'boot-camp.db');
}

/**
 * Initialize the Boot Camp database.
 */
export function initializeBootCampDatabase(): Database.Database {
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
export function getBootCampDatabase(): Database.Database {
  if (!db) {
    return initializeBootCampDatabase();
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeBootCampDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

function createTables(db: Database.Database): void {
  // ---------------------------------------------------------------------------
  // Boot Camp Configurations
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS boot_camp_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      boot_camp_id TEXT UNIQUE NOT NULL,
      swarm_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phase_configs TEXT NOT NULL,
      training_budget_per_recruit REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      require_di_approval INTEGER NOT NULL DEFAULT 1,
      allow_recycling INTEGER NOT NULL DEFAULT 1,
      max_total_recyclings INTEGER NOT NULL DEFAULT 3,
      auto_advance INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- State
      status TEXT NOT NULL DEFAULT 'PREPARING'
        CHECK (status IN ('PREPARING', 'RECEIVING', 'ACTIVE', 'GRADUATED', 'TERMINATED')),
      total_recruits INTEGER NOT NULL DEFAULT 0,
      in_training INTEGER NOT NULL DEFAULT 0,
      graduated INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      last_activity_at TEXT,

      CONSTRAINT valid_boot_camp_id CHECK (boot_camp_id LIKE 'bc_%')
    )
  `);

  // ---------------------------------------------------------------------------
  // Recruit Records
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS recruit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recruit_id TEXT UNIQUE NOT NULL,
      agent_id TEXT NOT NULL,
      swarm_id TEXT NOT NULL,
      boot_camp_id TEXT NOT NULL,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL
        CHECK (strategy IN ('SNIPER', 'EARLY_AGGRESSIVE', 'NEGOTIATOR', 'HYBRID', 'PASSIVE')),

      -- Status
      status TEXT NOT NULL DEFAULT 'ENLISTED'
        CHECK (status IN ('ENLISTED', 'IN_TRAINING', 'PHASE_COMPLETE', 'RECYCLED',
                          'MEDICAL_HOLD', 'DROPPED', 'GRADUATED', 'COMBAT_READY')),
      current_phase TEXT NOT NULL DEFAULT 'RECEIVING'
        CHECK (current_phase IN ('RECEIVING', 'CONDITIONING', 'MARKSMANSHIP',
                                  'COMBAT', 'CRUCIBLE', 'GRADUATION')),

      -- Budget
      training_budget REAL NOT NULL,
      training_budget_spent REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',

      -- Progress
      current_attempt INTEGER NOT NULL DEFAULT 1,
      total_recyclings INTEGER NOT NULL DEFAULT 0,

      -- Qualifications
      marksmanship_qual TEXT
        CHECK (marksmanship_qual IS NULL OR marksmanship_qual IN
               ('UNQUALIFIED', 'MARKSMAN', 'SHARPSHOOTER', 'EXPERT')),
      expert_badges TEXT NOT NULL DEFAULT '[]',
      merits TEXT NOT NULL DEFAULT '[]',
      demerits TEXT NOT NULL DEFAULT '[]',

      -- Timestamps
      enlisted_at TEXT NOT NULL DEFAULT (datetime('now')),
      training_started_at TEXT,
      graduated_at TEXT,
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- DI assignment
      assigned_di TEXT,
      requires_di_approval INTEGER NOT NULL DEFAULT 1,
      di_notes TEXT NOT NULL DEFAULT '[]',

      FOREIGN KEY (boot_camp_id) REFERENCES boot_camp_configs(boot_camp_id) ON DELETE CASCADE,
      CONSTRAINT valid_recruit_id CHECK (recruit_id LIKE 'rct_%')
    )
  `);

  // ---------------------------------------------------------------------------
  // Phase Evaluations
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS phase_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id TEXT UNIQUE NOT NULL,
      recruit_id TEXT NOT NULL,
      phase TEXT NOT NULL
        CHECK (phase IN ('RECEIVING', 'CONDITIONING', 'MARKSMANSHIP',
                         'COMBAT', 'CRUCIBLE', 'GRADUATION')),
      score INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      attempt_number INTEGER NOT NULL,
      exercise_results TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      certified_by TEXT,
      notes TEXT,

      FOREIGN KEY (recruit_id) REFERENCES recruit_records(recruit_id) ON DELETE CASCADE
    )
  `);

  // ---------------------------------------------------------------------------
  // Drill Instructors
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS drill_instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      di_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      user_id TEXT,
      is_automated INTEGER NOT NULL DEFAULT 0,
      specialties TEXT NOT NULL DEFAULT '[]',
      assigned_recruits TEXT NOT NULL DEFAULT '[]',
      total_graduated INTEGER NOT NULL DEFAULT 0,
      total_dropped INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      CONSTRAINT valid_di_id CHECK (di_id LIKE 'di_%')
    )
  `);

  // ---------------------------------------------------------------------------
  // DI Review Requests
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS di_review_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      recruit_id TEXT NOT NULL,
      phase TEXT NOT NULL,
      evaluation_id TEXT NOT NULL,
      assigned_di TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RECYCLED')),
      review_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,

      FOREIGN KEY (recruit_id) REFERENCES recruit_records(recruit_id) ON DELETE CASCADE,
      CONSTRAINT valid_request_id CHECK (request_id LIKE 'drv_%')
    )
  `);

  // ---------------------------------------------------------------------------
  // Boot Camp Events (Audit Trail)
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS boot_camp_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      boot_camp_id TEXT NOT NULL,
      recruit_id TEXT,
      di_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      event_data TEXT,

      FOREIGN KEY (boot_camp_id) REFERENCES boot_camp_configs(boot_camp_id) ON DELETE CASCADE,
      CONSTRAINT valid_event_id CHECK (event_id LIKE 'bc_evt_%')
    )
  `);

  // ---------------------------------------------------------------------------
  // Certification Records
  // ---------------------------------------------------------------------------
  db.exec(`
    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certification_id TEXT UNIQUE NOT NULL,
      agent_id TEXT NOT NULL,
      recruit_id TEXT NOT NULL,
      boot_camp_id TEXT NOT NULL,
      strategy TEXT NOT NULL,
      certification_level TEXT NOT NULL,
      marksmanship_qual TEXT,
      expert_badges TEXT NOT NULL DEFAULT '[]',
      avg_score REAL NOT NULL,
      total_recyclings INTEGER NOT NULL,
      phases_completed INTEGER NOT NULL,
      graduated_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      revoked_reason TEXT,

      FOREIGN KEY (recruit_id) REFERENCES recruit_records(recruit_id) ON DELETE CASCADE,
      FOREIGN KEY (boot_camp_id) REFERENCES boot_camp_configs(boot_camp_id) ON DELETE CASCADE,
      UNIQUE (agent_id)
    )
  `);
}

function createIndexes(db: Database.Database): void {
  // Boot Camp configs
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bootcamp_swarm ON boot_camp_configs(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bootcamp_status ON boot_camp_configs(status)`);

  // Recruit records
  db.exec(`CREATE INDEX IF NOT EXISTS idx_recruit_bootcamp ON recruit_records(boot_camp_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_recruit_swarm ON recruit_records(swarm_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_recruit_agent ON recruit_records(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_recruit_status ON recruit_records(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_recruit_phase ON recruit_records(current_phase)`);

  // Phase evaluations
  db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_recruit ON phase_evaluations(recruit_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_phase ON phase_evaluations(phase)`);

  // DI review requests
  db.exec(`CREATE INDEX IF NOT EXISTS idx_review_recruit ON di_review_requests(recruit_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_review_di ON di_review_requests(assigned_di)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_review_status ON di_review_requests(status)`);

  // Events
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_bootcamp ON boot_camp_events(boot_camp_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_recruit ON boot_camp_events(recruit_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_type ON boot_camp_events(event_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_timestamp ON boot_camp_events(timestamp)`);

  // Certifications
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cert_agent ON certifications(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cert_bootcamp ON certifications(boot_camp_id)`);
}

// =============================================================================
// BOOT CAMP CRUD OPERATIONS
// =============================================================================

/**
 * Save Boot Camp configuration.
 */
export function saveBootCamp(config: BootCampConfig, state: BootCampState): void {
  const db = getBootCampDatabase();

  db.prepare(`
    INSERT OR REPLACE INTO boot_camp_configs (
      boot_camp_id, swarm_id, name, phase_configs,
      training_budget_per_recruit, currency, require_di_approval,
      allow_recycling, max_total_recyclings, auto_advance,
      created_by, created_at, status, total_recruits, in_training,
      graduated, dropped, started_at, completed_at, last_activity_at
    ) VALUES (
      @bootCampId, @swarmId, @name, @phaseConfigs,
      @trainingBudgetPerRecruit, @currency, @requireDIApproval,
      @allowRecycling, @maxTotalRecyclings, @autoAdvance,
      @createdBy, @createdAt, @status, @totalRecruits, @inTraining,
      @graduated, @dropped, @startedAt, @completedAt, @lastActivityAt
    )
  `).run({
    bootCampId: config.bootCampId,
    swarmId: config.swarmId,
    name: config.name,
    phaseConfigs: JSON.stringify(config.phaseConfigs),
    trainingBudgetPerRecruit: config.trainingBudgetPerRecruit.value,
    currency: config.trainingBudgetPerRecruit.currency,
    requireDIApproval: config.requireDIApproval ? 1 : 0,
    allowRecycling: config.allowRecycling ? 1 : 0,
    maxTotalRecyclings: config.maxTotalRecyclings,
    autoAdvance: config.autoAdvance ? 1 : 0,
    createdBy: config.createdBy,
    createdAt: config.createdAt,
    status: state.status,
    totalRecruits: state.totalRecruits,
    inTraining: state.inTraining,
    graduated: state.graduated,
    dropped: state.dropped,
    startedAt: state.startedAt ?? null,
    completedAt: state.completedAt ?? null,
    lastActivityAt: state.lastActivityAt,
  });
}

/**
 * Get Boot Camp by ID.
 */
export function getBootCampById(bootCampId: string): (BootCampConfig & BootCampState) | null {
  const db = getBootCampDatabase();

  const row = db.prepare(`
    SELECT * FROM boot_camp_configs WHERE boot_camp_id = ?
  `).get(bootCampId) as any;

  if (!row) return null;

  return {
    bootCampId: row.boot_camp_id,
    swarmId: row.swarm_id,
    name: row.name,
    phaseConfigs: JSON.parse(row.phase_configs),
    trainingBudgetPerRecruit: {
      value: row.training_budget_per_recruit,
      currency: row.currency as Currency,
    },
    requireDIApproval: row.require_di_approval === 1,
    allowRecycling: row.allow_recycling === 1,
    maxTotalRecyclings: row.max_total_recyclings,
    autoAdvance: row.auto_advance === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    status: row.status,
    totalRecruits: row.total_recruits,
    inTraining: row.in_training,
    graduated: row.graduated,
    dropped: row.dropped,
    phaseBreakdown: { RECEIVING: 0, CONDITIONING: 0, MARKSMANSHIP: 0, COMBAT: 0, CRUCIBLE: 0, GRADUATION: 0 },
    totalTrainingBudget: { value: row.training_budget_per_recruit * row.total_recruits, currency: row.currency },
    trainingBudgetSpent: { value: 0, currency: row.currency },
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastActivityAt: row.last_activity_at,
  };
}

// =============================================================================
// RECRUIT CRUD OPERATIONS
// =============================================================================

/**
 * Save recruit record.
 */
export function saveRecruit(recruit: RecruitRecord): void {
  const db = getBootCampDatabase();

  db.prepare(`
    INSERT OR REPLACE INTO recruit_records (
      recruit_id, agent_id, swarm_id, boot_camp_id, name, strategy,
      status, current_phase, training_budget, training_budget_spent, currency,
      current_attempt, total_recyclings, marksmanship_qual, expert_badges,
      merits, demerits, enlisted_at, training_started_at, graduated_at,
      last_activity_at, assigned_di, requires_di_approval, di_notes
    ) VALUES (
      @recruitId, @agentId, @swarmId, @bootCampId, @name, @strategy,
      @status, @currentPhase, @trainingBudget, @trainingBudgetSpent, @currency,
      @currentAttempt, @totalRecyclings, @marksmanshipQual, @expertBadges,
      @merits, @demerits, @enlistedAt, @trainingStartedAt, @graduatedAt,
      @lastActivityAt, @assignedDI, @requiresDIApproval, @diNotes
    )
  `).run({
    recruitId: recruit.recruitId,
    agentId: recruit.agentId,
    swarmId: recruit.swarmId,
    bootCampId: recruit.swarmId, // Using swarmId as bootCampId reference
    name: recruit.name,
    strategy: recruit.strategy,
    status: recruit.status,
    currentPhase: recruit.currentPhase,
    trainingBudget: recruit.trainingBudget.value,
    trainingBudgetSpent: recruit.trainingBudgetSpent.value,
    currency: recruit.trainingBudget.currency,
    currentAttempt: recruit.currentAttempt,
    totalRecyclings: recruit.totalRecyclings,
    marksmanshipQual: recruit.marksmanshipQual ?? null,
    expertBadges: JSON.stringify(recruit.expertBadges),
    merits: JSON.stringify(recruit.merits),
    demerits: JSON.stringify(recruit.demerits),
    enlistedAt: recruit.enlistedAt,
    trainingStartedAt: recruit.trainingStartedAt ?? null,
    graduatedAt: recruit.graduatedAt ?? null,
    lastActivityAt: recruit.lastActivityAt,
    assignedDI: recruit.assignedDI ?? null,
    requiresDIApproval: recruit.requiresDIApproval ? 1 : 0,
    diNotes: JSON.stringify(recruit.diNotes),
  });
}

/**
 * Get recruit by ID.
 */
export function getRecruitById(recruitId: string): RecruitRecord | null {
  const db = getBootCampDatabase();

  const row = db.prepare(`
    SELECT * FROM recruit_records WHERE recruit_id = ?
  `).get(recruitId) as any;

  if (!row) return null;

  return {
    recruitId: row.recruit_id,
    agentId: row.agent_id,
    swarmId: row.swarm_id,
    name: row.name,
    strategy: row.strategy as BiddingStrategy,
    status: row.status as RecruitStatus,
    currentPhase: row.current_phase as TrainingPhase,
    trainingBudget: { value: row.training_budget, currency: row.currency as Currency },
    trainingBudgetSpent: { value: row.training_budget_spent, currency: row.currency as Currency },
    phaseHistory: [], // Load separately if needed
    currentAttempt: row.current_attempt,
    totalRecyclings: row.total_recyclings,
    marksmanshipQual: row.marksmanship_qual as MarksmanshipQualification | undefined,
    expertBadges: JSON.parse(row.expert_badges),
    merits: JSON.parse(row.merits),
    demerits: JSON.parse(row.demerits),
    enlistedAt: row.enlisted_at,
    trainingStartedAt: row.training_started_at,
    graduatedAt: row.graduated_at,
    lastActivityAt: row.last_activity_at,
    assignedDI: row.assigned_di,
    requiresDIApproval: row.requires_di_approval === 1,
    diNotes: JSON.parse(row.di_notes),
  };
}

/**
 * Get recruit by agent ID.
 */
export function getRecruitByAgentId(agentId: string): RecruitRecord | null {
  const db = getBootCampDatabase();

  const row = db.prepare(`
    SELECT * FROM recruit_records WHERE agent_id = ?
  `).get(agentId) as any;

  if (!row) return null;

  return getRecruitById(row.recruit_id);
}

/**
 * List recruits for a swarm.
 */
export function listRecruitsForSwarm(swarmId: string): RecruitRecord[] {
  const db = getBootCampDatabase();

  const rows = db.prepare(`
    SELECT recruit_id FROM recruit_records WHERE swarm_id = ?
  `).all(swarmId) as any[];

  return rows
    .map(row => getRecruitById(row.recruit_id))
    .filter((r): r is RecruitRecord => r !== null);
}

// =============================================================================
// CERTIFICATION OPERATIONS
// =============================================================================

/**
 * Save certification record.
 */
export function saveCertification(certification: {
  certificationId: string;
  agentId: string;
  recruitId: string;
  bootCampId: string;
  strategy: BiddingStrategy;
  certificationLevel: string;
  marksmanshipQual?: MarksmanshipQualification;
  expertBadges: string[];
  avgScore: number;
  totalRecyclings: number;
  phasesCompleted: number;
  graduatedAt: string;
}): void {
  const db = getBootCampDatabase();

  db.prepare(`
    INSERT OR REPLACE INTO certifications (
      certification_id, agent_id, recruit_id, boot_camp_id, strategy,
      certification_level, marksmanship_qual, expert_badges, avg_score,
      total_recyclings, phases_completed, graduated_at
    ) VALUES (
      @certificationId, @agentId, @recruitId, @bootCampId, @strategy,
      @certificationLevel, @marksmanshipQual, @expertBadges, @avgScore,
      @totalRecyclings, @phasesCompleted, @graduatedAt
    )
  `).run({
    certificationId: certification.certificationId,
    agentId: certification.agentId,
    recruitId: certification.recruitId,
    bootCampId: certification.bootCampId,
    strategy: certification.strategy,
    certificationLevel: certification.certificationLevel,
    marksmanshipQual: certification.marksmanshipQual ?? null,
    expertBadges: JSON.stringify(certification.expertBadges),
    avgScore: certification.avgScore,
    totalRecyclings: certification.totalRecyclings,
    phasesCompleted: certification.phasesCompleted,
    graduatedAt: certification.graduatedAt,
  });
}

/**
 * Check if an agent is certified.
 */
export function isAgentCertified(agentId: string): boolean {
  const db = getBootCampDatabase();

  const row = db.prepare(`
    SELECT 1 FROM certifications WHERE agent_id = ? AND revoked = 0
  `).get(agentId);

  return !!row;
}

/**
 * Get certification by agent ID.
 */
export function getCertificationByAgentId(agentId: string): any | null {
  const db = getBootCampDatabase();

  const row = db.prepare(`
    SELECT * FROM certifications WHERE agent_id = ? AND revoked = 0
  `).get(agentId) as any;

  if (!row) return null;

  return {
    certificationId: row.certification_id,
    agentId: row.agent_id,
    recruitId: row.recruit_id,
    bootCampId: row.boot_camp_id,
    strategy: row.strategy,
    certificationLevel: row.certification_level,
    marksmanshipQual: row.marksmanship_qual,
    expertBadges: JSON.parse(row.expert_badges),
    avgScore: row.avg_score,
    totalRecyclings: row.total_recyclings,
    phasesCompleted: row.phases_completed,
    graduatedAt: row.graduated_at,
  };
}

// =============================================================================
// EVENT RECORDING
// =============================================================================

/**
 * Record a Boot Camp event.
 */
export function recordBootCampEvent(event: BootCampEvent): void {
  const db = getBootCampDatabase();

  db.prepare(`
    INSERT INTO boot_camp_events (
      event_id, event_type, boot_camp_id, recruit_id, di_id, timestamp, event_data
    ) VALUES (
      @eventId, @eventType, @bootCampId, @recruitId, @diId, @timestamp, @eventData
    )
  `).run({
    eventId: event.eventId,
    eventType: event.eventType,
    bootCampId: event.bootCampId,
    recruitId: event.recruitId ?? null,
    diId: event.diId ?? null,
    timestamp: event.timestamp,
    eventData: event.data ? JSON.stringify(event.data) : null,
  });
}

/**
 * Query events for a Boot Camp.
 */
export function queryBootCampEvents(bootCampId: string, limit: number = 100): BootCampEvent[] {
  const db = getBootCampDatabase();

  const rows = db.prepare(`
    SELECT * FROM boot_camp_events WHERE boot_camp_id = ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(bootCampId, limit) as any[];

  return rows.map(row => ({
    eventId: row.event_id,
    eventType: row.event_type,
    bootCampId: row.boot_camp_id,
    recruitId: row.recruit_id,
    diId: row.di_id,
    timestamp: row.timestamp,
    data: row.event_data ? JSON.parse(row.event_data) : undefined,
  }));
}
