/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Database Layer
 *
 * SQLite database operations for campaigns, agents, data sources, and proposals.
 * Follows the pattern established in src/symbols/database.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  AcquisitionCampaign,
  AgentDefinition,
  AgentInstance,
  AgentProposal,
  DataSourceSpec,
  AgentStatus,
  CampaignStatus,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

let db: Database.Database | null = null;

/**
 * Initialize the agent database with all required tables.
 */
export function initializeAgentDatabase(dbPath?: string): Database.Database {
  if (db) {
    db.close();
  }
  const resolvedPath = dbPath || join(__dirname, '../../data/agents.db');

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);
  createIndexes(db);

  return db;
}

/**
 * Get the database instance.
 */
export function getAgentDatabase(): Database.Database {
  if (!db) {
    throw new Error('Agent database not initialized. Call initializeAgentDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection.
 */
export function closeAgentDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA CREATION
// ═══════════════════════════════════════════════════════════════════════════════

function createTables(db: Database.Database): void {
  // Acquisition Campaigns
  db.exec(`
    CREATE TABLE IF NOT EXISTS acquisition_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT UNIQUE NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'active', 'paused', 'completed', 'failed', 'aborted'
      )),
      scope_constraints TEXT,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      completed_at TEXT,

      -- Metrics
      agents_spawned INTEGER DEFAULT 0,
      agents_completed INTEGER DEFAULT 0,
      agents_failed INTEGER DEFAULT 0,
      symbols_created INTEGER DEFAULT 0,

      -- Circuit breaker
      circuit_breaker_state TEXT DEFAULT 'closed' CHECK (circuit_breaker_state IN (
        'closed', 'open', 'half-open'
      )),
      consecutive_failures INTEGER DEFAULT 0,
      last_failure_at TEXT,

      CONSTRAINT valid_campaign_id CHECK (campaign_id LIKE 'camp_%')
    )
  `);

  // Agent Definitions
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      purpose TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (
        'data_acquisition', 'data_processing', 'analysis', 'monitoring', 'integration'
      )),
      data_sources TEXT NOT NULL,
      required_capabilities TEXT NOT NULL,
      optional_capabilities TEXT,
      expected_output_symbols TEXT NOT NULL,
      resource_limits TEXT NOT NULL,
      success_criteria TEXT,
      dependencies TEXT,
      governing_frame TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
      requires_approval INTEGER NOT NULL DEFAULT 1,
      namespace TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      created_by TEXT NOT NULL,
      tags TEXT,
      template_id TEXT,

      CONSTRAINT valid_agent_id CHECK (agent_id LIKE 'agent.%')
    )
  `);

  // Agent Instances
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instance_id TEXT UNIQUE NOT NULL,
      definition_id TEXT NOT NULL,
      campaign_id TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'proposed', 'pending_approval', 'approved', 'spawning', 'running',
        'paused', 'reporting', 'completed', 'failed', 'abandoned', 'archived'
      )),
      status_message TEXT,
      scope TEXT NOT NULL,
      resource_usage TEXT NOT NULL,

      -- Lifecycle
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      approved_by TEXT,
      approved_at TEXT,

      -- Approval
      hold_id TEXT,
      proposal_id TEXT,

      -- Delegation
      delegation_id TEXT,
      delegation_chain TEXT,

      -- Metrics
      metrics TEXT NOT NULL,

      -- Governance
      governing_frame TEXT NOT NULL,

      -- Control
      enabled INTEGER NOT NULL DEFAULT 1,
      paused_reason TEXT,

      -- Results
      result_summary TEXT,
      error_details TEXT,

      FOREIGN KEY (definition_id) REFERENCES agent_definitions(agent_id),
      FOREIGN KEY (campaign_id) REFERENCES acquisition_campaigns(campaign_id),
      CONSTRAINT valid_instance_id CHECK (instance_id LIKE 'inst_%')
    )
  `);

  // Agent Proposals
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT UNIQUE NOT NULL,
      agent_definition TEXT NOT NULL,
      campaign_id TEXT,
      justification TEXT NOT NULL,
      risk_assessment TEXT NOT NULL,
      resource_estimate TEXT NOT NULL,
      data_access_summary TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'expired')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      hold_id TEXT,
      decision TEXT,
      approved_at TEXT,
      approved_by TEXT,
      rejection_reason TEXT,

      FOREIGN KEY (campaign_id) REFERENCES acquisition_campaigns(campaign_id),
      CONSTRAINT valid_proposal_id CHECK (proposal_id LIKE 'prop_%')
    )
  `);

  // Data Sources Registry
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT UNIQUE NOT NULL,
      symbol_id TEXT,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN (
        'rest_api', 'graphql', 'soap', 'web_page', 'rss_feed', 'file', 'database', 'github', 'huggingface'
      )),
      endpoint TEXT NOT NULL,
      auth_config TEXT,
      rate_limit_config TEXT,
      schema_definition TEXT,

      -- Quality metrics
      quality_score REAL CHECK (quality_score >= 0 AND quality_score <= 1),
      last_validated TEXT,
      validation_status TEXT CHECK (validation_status IN (
        'unknown', 'valid', 'degraded', 'invalid', 'offline'
      )) DEFAULT 'unknown',

      -- Discovery provenance
      discovered_by TEXT,
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),

      -- Usage tracking
      times_used INTEGER DEFAULT 0,
      last_used TEXT,
      symbols_extracted INTEGER DEFAULT 0,

      -- Metadata
      metadata TEXT,

      CONSTRAINT valid_source_id CHECK (source_id LIKE 'src_%')
    )
  `);

  // Government Entities Cache (for SAM.gov data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS government_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uei TEXT UNIQUE NOT NULL,
      cage_code TEXT,
      legal_business_name TEXT NOT NULL,
      dba_name TEXT,
      entity_type TEXT,
      sam_registration_date TEXT,
      sam_expiration_date TEXT,
      sam_status TEXT,
      sdvosb_verified INTEGER DEFAULT 0,
      vosb_verified INTEGER DEFAULT 0,
      certifications TEXT,
      naics_codes TEXT,
      psc_codes TEXT,
      address_data TEXT,
      poc_data TEXT,
      symbol_id TEXT,
      last_fetched TEXT NOT NULL,
      data TEXT NOT NULL,

      CONSTRAINT valid_uei CHECK (length(uei) = 12),
      CONSTRAINT valid_cage CHECK (cage_code IS NULL OR length(cage_code) = 5)
    )
  `);

  // Government Awards Cache (for USASpending data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS government_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      award_id TEXT UNIQUE NOT NULL,
      piid TEXT,
      recipient_uei TEXT,
      awarding_agency TEXT,
      naics_code TEXT,
      psc_code TEXT,
      award_type TEXT,
      award_date TEXT,
      period_of_performance_start TEXT,
      period_of_performance_end TEXT,
      total_obligation REAL,
      base_and_all_options_value REAL,
      place_of_performance TEXT,
      symbol_id TEXT,
      last_fetched TEXT NOT NULL,
      data TEXT NOT NULL,

      FOREIGN KEY (recipient_uei) REFERENCES government_entities(uei)
    )
  `);

  // Opportunity Alerts
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunity_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT UNIQUE NOT NULL,
      subscription_id TEXT,
      opportunity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agency TEXT,
      set_aside_type TEXT,
      naics_code TEXT,
      posted_date TEXT,
      response_deadline TEXT,
      match_score REAL,
      match_reasons TEXT,
      status TEXT DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'dismissed', 'actioned')),
      viewed_at TEXT,
      symbol_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      CONSTRAINT valid_alert_id CHECK (alert_id LIKE 'alert_%')
    )
  `);

  // API Credentials Storage (encrypted references only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credential_id TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      credential_type TEXT NOT NULL CHECK (credential_type IN (
        'api_key', 'oauth2_client', 'oauth2_token', 'bearer', 'basic'
      )),
      -- We store an encrypted reference, not the actual secret
      encrypted_reference TEXT NOT NULL,
      key_prefix TEXT,
      rate_limit_tier TEXT,
      scopes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      expires_at TEXT,

      CONSTRAINT valid_credential_id CHECK (credential_id LIKE 'cred_%')
    )
  `);

  // Webhook Channels Configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT UNIQUE NOT NULL,
      channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'discord', 'email', 'custom')),
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      last_used_at TEXT,

      CONSTRAINT valid_channel_id CHECK (channel_id LIKE 'chan_%')
    )
  `);

  // Agent Audit Log
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      agent_id TEXT,
      instance_id TEXT,
      campaign_id TEXT,
      proposal_id TEXT,
      operator_id TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      details TEXT,

      CONSTRAINT valid_event_id CHECK (event_id LIKE 'evt_%')
    )
  `);
}

function createIndexes(db: Database.Database): void {
  // Campaign indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON acquisition_campaigns(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaigns_topic ON acquisition_campaigns(topic)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON acquisition_campaigns(created_at)`);

  // Agent definition indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_definitions_category ON agent_definitions(category)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_definitions_risk ON agent_definitions(risk_level)`);

  // Agent instance indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_instances_campaign ON agent_instances(campaign_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_instances_status ON agent_instances(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_instances_definition ON agent_instances(definition_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_instances_hold ON agent_instances(hold_id)`);

  // Proposal indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_state ON agent_proposals(state)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_campaign ON agent_proposals(campaign_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proposals_expires ON agent_proposals(expires_at)`);

  // Data source indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sources_type ON data_sources(source_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sources_status ON data_sources(validation_status)`);

  // Government entity indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_cage ON government_entities(cage_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_name ON government_entities(legal_business_name)`);

  // Government award indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_awards_recipient ON government_awards(recipient_uei)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_awards_agency ON government_awards(awarding_agency)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_awards_naics ON government_awards(naics_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_awards_date ON government_awards(award_date)`);

  // Opportunity alert indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON opportunity_alerts(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_deadline ON opportunity_alerts(response_deadline)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_naics ON opportunity_alerts(naics_code)`);

  // Audit log indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_type ON agent_audit_log(event_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_agent ON agent_audit_log(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON agent_audit_log(timestamp)`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new acquisition campaign.
 */
export function createCampaign(campaign: Omit<AcquisitionCampaign, 'id'>): AcquisitionCampaign {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    INSERT INTO acquisition_campaigns (
      campaign_id, topic, status, scope_constraints, priority, created_by,
      created_at, agents_spawned, agents_completed, agents_failed, symbols_created,
      circuit_breaker_state, consecutive_failures
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    campaign.campaignId,
    campaign.topic,
    campaign.status,
    JSON.stringify(campaign.scopeConstraints),
    campaign.priority,
    campaign.createdBy,
    campaign.createdAt,
    campaign.agentsSpawned,
    campaign.agentsCompleted,
    campaign.agentsFailed,
    campaign.symbolsCreated,
    campaign.circuitBreakerState,
    campaign.consecutiveFailures
  );

  return campaign as AcquisitionCampaign;
}

/**
 * Get a campaign by ID.
 */
export function getCampaign(campaignId: string): AcquisitionCampaign | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM acquisition_campaigns WHERE campaign_id = ?`);
  const row = stmt.get(campaignId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToCampaign(row);
}

/**
 * Update campaign status and metrics.
 */
export function updateCampaign(
  campaignId: string,
  updates: Partial<AcquisitionCampaign>
): boolean {
  const db = getAgentDatabase();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.agentsSpawned !== undefined) {
    setClauses.push('agents_spawned = ?');
    values.push(updates.agentsSpawned);
  }
  if (updates.agentsCompleted !== undefined) {
    setClauses.push('agents_completed = ?');
    values.push(updates.agentsCompleted);
  }
  if (updates.agentsFailed !== undefined) {
    setClauses.push('agents_failed = ?');
    values.push(updates.agentsFailed);
  }
  if (updates.symbolsCreated !== undefined) {
    setClauses.push('symbols_created = ?');
    values.push(updates.symbolsCreated);
  }
  if (updates.circuitBreakerState !== undefined) {
    setClauses.push('circuit_breaker_state = ?');
    values.push(updates.circuitBreakerState);
  }
  if (updates.consecutiveFailures !== undefined) {
    setClauses.push('consecutive_failures = ?');
    values.push(updates.consecutiveFailures);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    values.push(updates.completedAt);
  }

  setClauses.push('updated_at = datetime("now")');
  values.push(campaignId);

  const stmt = db.prepare(`
    UPDATE acquisition_campaigns
    SET ${setClauses.join(', ')}
    WHERE campaign_id = ?
  `);

  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * List campaigns with optional filters.
 */
export function listCampaigns(filters?: {
  status?: CampaignStatus;
  topic?: string;
  limit?: number;
  offset?: number;
}): AcquisitionCampaign[] {
  const db = getAgentDatabase();
  let query = 'SELECT * FROM acquisition_campaigns WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters?.topic) {
    query += ' AND topic LIKE ?';
    params.push(`%${filters.topic}%`);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }
  if (filters?.offset) {
    query += ' OFFSET ?';
    params.push(filters.offset);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  return rows.map(rowToCampaign);
}

function rowToCampaign(row: Record<string, unknown>): AcquisitionCampaign {
  return {
    campaignId: row.campaign_id as string,
    topic: row.topic as string,
    status: row.status as CampaignStatus,
    scopeConstraints: JSON.parse((row.scope_constraints as string) || '{}'),
    priority: row.priority as 'low' | 'medium' | 'high',
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    agentsSpawned: row.agents_spawned as number,
    agentsCompleted: row.agents_completed as number,
    agentsFailed: row.agents_failed as number,
    symbolsCreated: row.symbols_created as number,
    circuitBreakerState: row.circuit_breaker_state as 'closed' | 'open' | 'half-open',
    consecutiveFailures: row.consecutive_failures as number,
    lastFailureAt: row.last_failure_at as string | undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEFINITION OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register a new agent definition.
 */
export function createAgentDefinition(definition: AgentDefinition): AgentDefinition {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    INSERT INTO agent_definitions (
      agent_id, name, version, purpose, category, data_sources,
      required_capabilities, optional_capabilities, expected_output_symbols,
      resource_limits, success_criteria, dependencies, governing_frame,
      risk_level, requires_approval, namespace, created_at, created_by,
      tags, template_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    definition.agentId,
    definition.name,
    definition.version,
    definition.purpose,
    definition.category,
    JSON.stringify(definition.dataSources),
    JSON.stringify(definition.requiredCapabilities),
    JSON.stringify(definition.optionalCapabilities || []),
    JSON.stringify(definition.expectedOutputSymbols),
    JSON.stringify(definition.resourceLimits),
    JSON.stringify(definition.successCriteria || {}),
    JSON.stringify(definition.dependencies || []),
    definition.governingFrame,
    definition.riskLevel,
    definition.requiresApproval ? 1 : 0,
    definition.namespace,
    definition.createdAt,
    definition.createdBy,
    JSON.stringify(definition.tags || []),
    definition.templateId
  );

  return definition;
}

/**
 * Get an agent definition by ID.
 */
export function getAgentDefinition(agentId: string): AgentDefinition | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM agent_definitions WHERE agent_id = ?`);
  const row = stmt.get(agentId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToDefinition(row);
}

/**
 * List agent definitions with optional filters.
 */
export function listAgentDefinitions(filters?: {
  category?: string;
  riskLevel?: string;
  limit?: number;
}): AgentDefinition[] {
  const db = getAgentDatabase();
  let query = 'SELECT * FROM agent_definitions WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.category) {
    query += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters?.riskLevel) {
    query += ' AND risk_level = ?';
    params.push(filters.riskLevel);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  return rows.map(rowToDefinition);
}

function rowToDefinition(row: Record<string, unknown>): AgentDefinition {
  return {
    agentId: row.agent_id as string,
    name: row.name as string,
    version: row.version as string,
    purpose: row.purpose as string,
    category: row.category as AgentDefinition['category'],
    dataSources: JSON.parse(row.data_sources as string),
    requiredCapabilities: JSON.parse(row.required_capabilities as string),
    optionalCapabilities: JSON.parse((row.optional_capabilities as string) || '[]'),
    expectedOutputSymbols: JSON.parse(row.expected_output_symbols as string),
    resourceLimits: JSON.parse(row.resource_limits as string),
    successCriteria: JSON.parse((row.success_criteria as string) || '{}'),
    dependencies: JSON.parse((row.dependencies as string) || '[]'),
    governingFrame: row.governing_frame as string,
    riskLevel: row.risk_level as AgentDefinition['riskLevel'],
    requiresApproval: (row.requires_approval as number) === 1,
    namespace: row.namespace as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string | undefined,
    createdBy: row.created_by as string,
    tags: JSON.parse((row.tags as string) || '[]'),
    templateId: row.template_id as string | undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT INSTANCE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new agent instance.
 */
export function createAgentInstance(instance: AgentInstance): AgentInstance {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    INSERT INTO agent_instances (
      instance_id, definition_id, campaign_id, status, status_message,
      scope, resource_usage, created_at, hold_id, proposal_id,
      delegation_chain, metrics, governing_frame, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    instance.instanceId,
    instance.definitionId,
    instance.campaignId,
    instance.status,
    instance.statusMessage,
    JSON.stringify(instance.scope),
    JSON.stringify(instance.resourceUsage),
    instance.createdAt,
    instance.holdId,
    instance.proposalId,
    JSON.stringify(instance.delegationChain),
    JSON.stringify(instance.metrics),
    instance.governingFrame,
    instance.enabled ? 1 : 0
  );

  return instance;
}

/**
 * Get an agent instance by ID.
 */
export function getAgentInstance(instanceId: string): AgentInstance | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM agent_instances WHERE instance_id = ?`);
  const row = stmt.get(instanceId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToInstance(row);
}

/**
 * Update agent instance status and metrics.
 */
export function updateAgentInstance(
  instanceId: string,
  updates: Partial<AgentInstance>
): boolean {
  const db = getAgentDatabase();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    values.push(updates.status);
  }
  if (updates.statusMessage !== undefined) {
    setClauses.push('status_message = ?');
    values.push(updates.statusMessage);
  }
  if (updates.resourceUsage !== undefined) {
    setClauses.push('resource_usage = ?');
    values.push(JSON.stringify(updates.resourceUsage));
  }
  if (updates.startedAt !== undefined) {
    setClauses.push('started_at = ?');
    values.push(updates.startedAt);
  }
  if (updates.completedAt !== undefined) {
    setClauses.push('completed_at = ?');
    values.push(updates.completedAt);
  }
  if (updates.approvedBy !== undefined) {
    setClauses.push('approved_by = ?');
    values.push(updates.approvedBy);
  }
  if (updates.approvedAt !== undefined) {
    setClauses.push('approved_at = ?');
    values.push(updates.approvedAt);
  }
  if (updates.metrics !== undefined) {
    setClauses.push('metrics = ?');
    values.push(JSON.stringify(updates.metrics));
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.pausedReason !== undefined) {
    setClauses.push('paused_reason = ?');
    values.push(updates.pausedReason);
  }
  if (updates.resultSummary !== undefined) {
    setClauses.push('result_summary = ?');
    values.push(updates.resultSummary);
  }
  if (updates.errorDetails !== undefined) {
    setClauses.push('error_details = ?');
    values.push(JSON.stringify(updates.errorDetails));
  }
  if (updates.delegationId !== undefined) {
    setClauses.push('delegation_id = ?');
    values.push(updates.delegationId);
  }

  if (setClauses.length === 0) return false;

  values.push(instanceId);

  const stmt = db.prepare(`
    UPDATE agent_instances
    SET ${setClauses.join(', ')}
    WHERE instance_id = ?
  `);

  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * List agent instances with optional filters.
 */
export function listAgentInstances(filters?: {
  campaignId?: string;
  definitionId?: string;
  status?: AgentStatus;
  limit?: number;
}): AgentInstance[] {
  const db = getAgentDatabase();
  let query = 'SELECT * FROM agent_instances WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.campaignId) {
    query += ' AND campaign_id = ?';
    params.push(filters.campaignId);
  }
  if (filters?.definitionId) {
    query += ' AND definition_id = ?';
    params.push(filters.definitionId);
  }
  if (filters?.status) {
    query += ' AND status = ?';
    params.push(filters.status);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  return rows.map(rowToInstance);
}

function rowToInstance(row: Record<string, unknown>): AgentInstance {
  return {
    instanceId: row.instance_id as string,
    definitionId: row.definition_id as string,
    campaignId: row.campaign_id as string | undefined,
    status: row.status as AgentStatus,
    statusMessage: row.status_message as string | undefined,
    scope: JSON.parse(row.scope as string),
    resourceUsage: JSON.parse(row.resource_usage as string),
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | undefined,
    completedAt: row.completed_at as string | undefined,
    approvedBy: row.approved_by as string | undefined,
    approvedAt: row.approved_at as string | undefined,
    holdId: row.hold_id as string | undefined,
    proposalId: row.proposal_id as string | undefined,
    delegationId: row.delegation_id as string | undefined,
    delegationChain: JSON.parse((row.delegation_chain as string) || '[]'),
    metrics: JSON.parse(row.metrics as string),
    governingFrame: row.governing_frame as string,
    enabled: (row.enabled as number) === 1,
    pausedReason: row.paused_reason as string | undefined,
    resultSummary: row.result_summary as string | undefined,
    errorDetails: row.error_details ? JSON.parse(row.error_details as string) : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA SOURCE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register a new data source.
 */
export function createDataSource(source: DataSourceSpec & {
  sourceId: string;
  symbolId?: string;
  discoveredBy?: string;
  qualityScore?: number;
  validationStatus?: string;
}): void {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    INSERT INTO data_sources (
      source_id, symbol_id, name, source_type, endpoint, auth_config,
      rate_limit_config, schema_definition, quality_score, validation_status,
      discovered_by, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    source.sourceId,
    source.symbolId,
    source.name,
    source.type,
    source.endpoint,
    JSON.stringify(source.auth || {}),
    JSON.stringify(source.rateLimit || {}),
    JSON.stringify(source.schema || {}),
    source.qualityScore,
    source.validationStatus || 'unknown',
    source.discoveredBy,
    JSON.stringify(source.metadata || {})
  );
}

/**
 * Get a data source by ID.
 */
export function getDataSource(sourceId: string): (DataSourceSpec & { sourceId: string }) | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM data_sources WHERE source_id = ?`);
  const row = stmt.get(sourceId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    sourceId: row.source_id as string,
    id: row.source_id as string,
    name: row.name as string,
    type: row.source_type as DataSourceSpec['type'],
    endpoint: row.endpoint as string,
    auth: JSON.parse((row.auth_config as string) || '{}'),
    rateLimit: JSON.parse((row.rate_limit_config as string) || '{}'),
    schema: JSON.parse((row.schema_definition as string) || '{}'),
    metadata: JSON.parse((row.metadata as string) || '{}'),
  };
}

/**
 * Update data source usage statistics.
 */
export function updateDataSourceUsage(
  sourceId: string,
  symbolsExtracted: number
): boolean {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    UPDATE data_sources
    SET times_used = times_used + 1,
        last_used = datetime('now'),
        symbols_extracted = symbols_extracted + ?
    WHERE source_id = ?
  `);

  const result = stmt.run(symbolsExtracted, sourceId);
  return result.changes > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record an audit event.
 */
export function recordAgentAuditEvent(event: {
  eventType: string;
  agentId?: string;
  instanceId?: string;
  campaignId?: string;
  proposalId?: string;
  operatorId?: string;
  details?: Record<string, unknown>;
}): string {
  const db = getAgentDatabase();
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

  const stmt = db.prepare(`
    INSERT INTO agent_audit_log (
      event_id, event_type, agent_id, instance_id, campaign_id,
      proposal_id, operator_id, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    eventId,
    event.eventType,
    event.agentId,
    event.instanceId,
    event.campaignId,
    event.proposalId,
    event.operatorId,
    JSON.stringify(event.details || {})
  );

  return eventId;
}

/**
 * Query audit log.
 */
export function queryAgentAuditLog(filters: {
  eventType?: string;
  agentId?: string;
  instanceId?: string;
  campaignId?: string;
  since?: string;
  limit?: number;
}): Array<{
  eventId: string;
  eventType: string;
  agentId?: string;
  instanceId?: string;
  campaignId?: string;
  proposalId?: string;
  operatorId?: string;
  timestamp: string;
  details: Record<string, unknown>;
}> {
  const db = getAgentDatabase();
  let query = 'SELECT * FROM agent_audit_log WHERE 1=1';
  const params: unknown[] = [];

  if (filters.eventType) {
    query += ' AND event_type = ?';
    params.push(filters.eventType);
  }
  if (filters.agentId) {
    query += ' AND agent_id = ?';
    params.push(filters.agentId);
  }
  if (filters.instanceId) {
    query += ' AND instance_id = ?';
    params.push(filters.instanceId);
  }
  if (filters.campaignId) {
    query += ' AND campaign_id = ?';
    params.push(filters.campaignId);
  }
  if (filters.since) {
    query += ' AND timestamp >= ?';
    params.push(filters.since);
  }

  query += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];

  return rows.map(row => ({
    eventId: row.event_id as string,
    eventType: row.event_type as string,
    agentId: row.agent_id as string | undefined,
    instanceId: row.instance_id as string | undefined,
    campaignId: row.campaign_id as string | undefined,
    proposalId: row.proposal_id as string | undefined,
    operatorId: row.operator_id as string | undefined,
    timestamp: row.timestamp as string,
    details: JSON.parse((row.details as string) || '{}'),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new proposal in the database.
 */
export function createProposal(proposal: AgentProposal): void {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    INSERT INTO agent_proposals (
      proposal_id, campaign_id, agent_definition, justification,
      risk_assessment, resource_estimate, data_access_summary,
      state, created_at, expires_at, hold_id, decision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    proposal.proposalId,
    proposal.campaignId || null,
    JSON.stringify(proposal.agentDefinition),
    JSON.stringify(proposal.justification),
    JSON.stringify(proposal.riskAssessment),
    JSON.stringify(proposal.resourceEstimate),
    JSON.stringify(proposal.dataAccessSummary),
    proposal.state,
    proposal.createdAt,
    proposal.expiresAt,
    proposal.holdId || null,
    proposal.decision ? JSON.stringify(proposal.decision) : null
  );
}

/**
 * Get a proposal by ID.
 */
export function getProposal(proposalId: string): AgentProposal | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM agent_proposals WHERE proposal_id = ?`);
  const row = stmt.get(proposalId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToProposal(row);
}

/**
 * Get a proposal by hold ID.
 */
export function getProposalByHoldId(holdId: string): AgentProposal | null {
  const db = getAgentDatabase();
  const stmt = db.prepare(`SELECT * FROM agent_proposals WHERE hold_id = ?`);
  const row = stmt.get(holdId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return rowToProposal(row);
}

/**
 * Update proposal state and optionally set approval/rejection details.
 */
export function updateProposalState(
  proposalId: string,
  state: AgentProposal['state'],
  options?: {
    approvedBy?: string;
    approvedAt?: string;
    rejectionReason?: string;
    holdId?: string;
    decision?: AgentProposal['decision'];
  }
): boolean {
  const db = getAgentDatabase();
  const setClauses: string[] = ['state = ?'];
  const values: unknown[] = [state];

  if (options?.approvedBy !== undefined) {
    setClauses.push('approved_by = ?');
    values.push(options.approvedBy);
  }
  if (options?.approvedAt !== undefined) {
    setClauses.push('approved_at = ?');
    values.push(options.approvedAt);
  }
  if (options?.rejectionReason !== undefined) {
    setClauses.push('rejection_reason = ?');
    values.push(options.rejectionReason);
  }
  if (options?.holdId !== undefined) {
    setClauses.push('hold_id = ?');
    values.push(options.holdId);
  }
  if (options?.decision !== undefined) {
    setClauses.push('decision = ?');
    values.push(JSON.stringify(options.decision));
  }

  values.push(proposalId);

  const stmt = db.prepare(`
    UPDATE agent_proposals
    SET ${setClauses.join(', ')}
    WHERE proposal_id = ?
  `);

  const result = stmt.run(...values);
  return result.changes > 0;
}

/**
 * List pending proposals.
 */
export function listPendingProposals(): AgentProposal[] {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    SELECT * FROM agent_proposals
    WHERE state = 'pending'
    ORDER BY created_at DESC
  `);
  const rows = stmt.all() as Record<string, unknown>[];
  return rows.map(rowToProposal);
}

/**
 * List proposals with optional filters.
 */
export function listProposals(filters?: {
  state?: AgentProposal['state'];
  campaignId?: string;
  limit?: number;
}): AgentProposal[] {
  const db = getAgentDatabase();
  let query = 'SELECT * FROM agent_proposals WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.state) {
    query += ' AND state = ?';
    params.push(filters.state);
  }
  if (filters?.campaignId) {
    query += ' AND campaign_id = ?';
    params.push(filters.campaignId);
  }

  query += ' ORDER BY created_at DESC';

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Record<string, unknown>[];
  return rows.map(rowToProposal);
}

/**
 * Delete expired proposals and return the count of deleted proposals.
 */
export function deleteExpiredProposals(): number {
  const db = getAgentDatabase();

  // First mark expired proposals
  const markStmt = db.prepare(`
    UPDATE agent_proposals
    SET state = 'expired'
    WHERE state = 'pending' AND expires_at < datetime('now')
  `);
  const markResult = markStmt.run();

  // Optionally, delete old expired proposals (older than 30 days)
  const deleteStmt = db.prepare(`
    DELETE FROM agent_proposals
    WHERE state = 'expired' AND expires_at < datetime('now', '-30 days')
  `);
  deleteStmt.run();

  return markResult.changes;
}

/**
 * Load all active proposals (pending, approved but not yet completed).
 */
export function loadAllProposals(): AgentProposal[] {
  const db = getAgentDatabase();
  const stmt = db.prepare(`
    SELECT * FROM agent_proposals
    ORDER BY created_at DESC
  `);
  const rows = stmt.all() as Record<string, unknown>[];
  return rows.map(rowToProposal);
}

/**
 * Convert a database row to an AgentProposal object.
 */
function rowToProposal(row: Record<string, unknown>): AgentProposal {
  const proposal: AgentProposal = {
    proposalId: row.proposal_id as string,
    agentDefinition: JSON.parse(row.agent_definition as string),
    campaignId: row.campaign_id as string | undefined,
    justification: JSON.parse(row.justification as string),
    riskAssessment: JSON.parse(row.risk_assessment as string),
    resourceEstimate: JSON.parse(row.resource_estimate as string),
    dataAccessSummary: JSON.parse(row.data_access_summary as string),
    state: row.state as AgentProposal['state'],
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    holdId: row.hold_id as string | undefined,
    decision: row.decision ? JSON.parse(row.decision as string) : undefined,
  };

  return proposal;
}
