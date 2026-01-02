/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK SQLITE DATABASE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SQLite backend for PromptSpeak symbol storage.
 * Provides ACID transactions, concurrent safety, and efficient queries.
 *
 * Benefits over JSON files:
 * - Atomic commits (no partial writes)
 * - WAL mode for concurrent read/write
 * - Indexed queries (O(log n) vs O(n))
 * - Built-in integrity constraints
 * - Transaction support for multi-operation safety
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseInstance, Statement } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type {
  DirectiveSymbol,
  SymbolCategory,
  SymbolRegistryEntry,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SymbolRow {
  id: number;
  symbol_id: string;
  category: SymbolCategory;
  subcategory: string | null;
  version: number;
  content_hash: string;
  commanders_intent: string;
  data: string; // JSON blob
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  tags: string | null; // JSON array
  parent_symbol: string | null;
}

export interface AuditRow {
  id: number;
  timestamp: string;
  event_type: string;
  symbol_id: string | null;
  risk_score: number | null;
  details: string | null; // JSON
  violations: string | null; // JSON
}

export interface OpaqueRow {
  id: number;
  token: string;
  plaintext: string;
  symbol_id: string | null;
  field_name: string | null;
  created_at: string;
  expires_at: string | null;
  access_count: number;
  last_accessed: string | null;
}

export interface DatabaseStats {
  totalSymbols: number;
  byCategory: Record<SymbolCategory, number>;
  totalAuditEvents: number;
  databaseSizeBytes: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

const SCHEMA_SQL = `
-- ═══════════════════════════════════════════════════════════════════════════════
-- SYMBOLS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('COMPANY','PERSON','EVENT','SECTOR','TASK','KNOWLEDGE','QUERY')),
  subcategory TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  commanders_intent TEXT NOT NULL,
  data TEXT NOT NULL,  -- Full symbol as JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  created_by TEXT,
  tags TEXT,  -- JSON array
  parent_symbol TEXT,

  -- Constraints
  CONSTRAINT valid_symbol_id CHECK (symbol_id LIKE 'Ξ.%'),
  CONSTRAINT valid_hash CHECK (length(content_hash) = 16),
  CONSTRAINT positive_version CHECK (version > 0)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  event_type TEXT NOT NULL,
  symbol_id TEXT,
  risk_score INTEGER CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
  details TEXT,  -- JSON
  violations TEXT,  -- JSON

  CONSTRAINT valid_event CHECK (event_type IN (
    'SYMBOL_CREATE', 'SYMBOL_CREATE_BLOCKED',
    'SYMBOL_UPDATE', 'SYMBOL_UPDATE_BLOCKED',
    'SYMBOL_DELETE', 'SYMBOL_ACCESS', 'SYMBOL_FORMAT',
    'VALIDATION_WARNING', 'INJECTION_ATTEMPT', 'SECURITY_ALERT'
  ))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Symbol lookups
CREATE INDEX IF NOT EXISTS idx_symbols_category ON symbols(category);
CREATE INDEX IF NOT EXISTS idx_symbols_created_at ON symbols(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_symbols_hash ON symbols(content_hash);
CREATE INDEX IF NOT EXISTS idx_symbols_parent ON symbols(parent_symbol);

-- Audit lookups
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_symbol ON audit_log(symbol_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_risk ON audit_log(risk_score) WHERE risk_score >= 60;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FULL-TEXT SEARCH (for symbol content)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
  symbol_id,
  commanders_intent,
  content=symbols,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
  INSERT INTO symbols_fts(rowid, symbol_id, commanders_intent)
  VALUES (new.id, new.symbol_id, new.commanders_intent);
END;

CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, symbol_id, commanders_intent)
  VALUES ('delete', old.id, old.symbol_id, old.commanders_intent);
END;

CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
  INSERT INTO symbols_fts(symbols_fts, rowid, symbol_id, commanders_intent)
  VALUES ('delete', old.id, old.symbol_id, old.commanders_intent);
  INSERT INTO symbols_fts(rowid, symbol_id, commanders_intent)
  VALUES (new.id, new.symbol_id, new.commanders_intent);
END;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SYMBOL RELATIONSHIPS TABLE (Graph Edges)
-- Based on GraphRAG research and Neo4j patterns
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS symbol_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_symbol_id TEXT NOT NULL,
  to_symbol_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  category TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0 CHECK (weight >= 0.0 AND weight <= 1.0),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  properties TEXT,  -- JSON for additional attributes
  evidence TEXT,    -- Source/evidence for this relationship
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,

  -- Foreign keys with cascade delete
  FOREIGN KEY (from_symbol_id) REFERENCES symbols(symbol_id) ON DELETE CASCADE,
  FOREIGN KEY (to_symbol_id) REFERENCES symbols(symbol_id) ON DELETE CASCADE,

  -- Constraints
  CONSTRAINT no_self_reference CHECK (from_symbol_id != to_symbol_id),
  CONSTRAINT unique_typed_relationship UNIQUE (from_symbol_id, to_symbol_id, relationship_type),
  CONSTRAINT valid_relationship_type CHECK (relationship_type IN (
    'CAUSES', 'TRIGGERS', 'LEADS_TO', 'RESULTS_IN', 'ENABLES', 'PREVENTS',
    'PRECEDES', 'FOLLOWS', 'CONCURRENT_WITH', 'SUPERSEDES', 'SUPERSEDED_BY',
    'PARENT_OF', 'CHILD_OF', 'CONTAINS', 'PART_OF', 'ELABORATES', 'SUMMARIZES',
    'RELATED_TO', 'REFERENCES', 'SIMILAR_TO', 'CONTRASTS_WITH', 'COMPLEMENTS',
    'COMPETES_WITH', 'OUTPERFORMS', 'UNDERPERFORMS', 'DISRUPTS', 'CHALLENGES',
    'DEPENDS_ON', 'REQUIRES', 'SUPPORTS', 'BLOCKS', 'EXPOSED_TO',
    'OWNS', 'CONTROLS', 'SUBSIDIARY_OF', 'ACQUIRED_BY', 'MERGED_WITH', 'PARTNERS_WITH',
    'REGULATED_BY', 'COMPLIANT_WITH', 'SUBJECT_TO', 'FILED_WITH', 'AUDITED_BY'
  )),
  CONSTRAINT valid_category CHECK (category IN (
    'CAUSAL', 'TEMPORAL', 'HIERARCHICAL', 'ASSOCIATIVE',
    'COMPETITIVE', 'DEPENDENCY', 'OWNERSHIP', 'REGULATORY'
  ))
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RELATIONSHIP INDEXES (Critical for graph traversal performance)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Primary traversal indexes
CREATE INDEX IF NOT EXISTS idx_rel_from_symbol ON symbol_relationships(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_rel_to_symbol ON symbol_relationships(to_symbol_id);

-- Type and category filtering
CREATE INDEX IF NOT EXISTS idx_rel_type ON symbol_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_category ON symbol_relationships(category);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_rel_from_type ON symbol_relationships(from_symbol_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_to_type ON symbol_relationships(to_symbol_id, relationship_type);

-- Covering index for traversal (includes all columns needed for path queries)
CREATE INDEX IF NOT EXISTS idx_rel_traversal
ON symbol_relationships(from_symbol_id, to_symbol_id, relationship_type, weight, confidence);

-- Weight-filtered traversal (for high-confidence paths)
CREATE INDEX IF NOT EXISTS idx_rel_high_weight
ON symbol_relationships(from_symbol_id, to_symbol_id)
WHERE weight >= 0.5;

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPAQUE MAPPINGS TABLE (For Opacity Layer)
-- Stores encrypted content tokens for security/privacy
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS opaque_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,              -- "::10001"
  plaintext TEXT NOT NULL,                 -- The actual value (encrypted at rest)
  symbol_id TEXT,                          -- Which symbol this belongs to (optional)
  field_name TEXT,                         -- "who", "requirements[0]", etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,                         -- Optional TTL for temporary tokens
  access_count INTEGER NOT NULL DEFAULT 0, -- Track resolution frequency
  last_accessed TEXT,                      -- Last time this token was resolved

  -- Constraints
  CONSTRAINT valid_token CHECK (token LIKE '::%'),
  CONSTRAINT valid_plaintext CHECK (length(plaintext) > 0),

  -- Foreign key (optional - token can exist without symbol)
  FOREIGN KEY (symbol_id) REFERENCES symbols(symbol_id) ON DELETE SET NULL
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPAQUE MAPPINGS INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Primary lookup by token
CREATE INDEX IF NOT EXISTS idx_opaque_token ON opaque_mappings(token);

-- Lookup by symbol (for cleanup when symbol deleted)
CREATE INDEX IF NOT EXISTS idx_opaque_symbol ON opaque_mappings(symbol_id);

-- Expired token cleanup
CREATE INDEX IF NOT EXISTS idx_opaque_expires ON opaque_mappings(expires_at)
WHERE expires_at IS NOT NULL;

-- Frequently accessed tokens (for caching optimization)
CREATE INDEX IF NOT EXISTS idx_opaque_access ON opaque_mappings(access_count DESC);
`;


// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SymbolDatabase {
  private db: DatabaseInstance;
  private dbPath: string;

  // Prepared statements (cached for performance)
  private stmtInsertSymbol!: Statement;
  private stmtGetSymbol!: Statement;
  private stmtUpdateSymbol!: Statement;
  private stmtDeleteSymbol!: Statement;
  private stmtListSymbols!: Statement;
  private stmtCountByCategory!: Statement;
  private stmtInsertAudit!: Statement;
  private stmtSearchSymbols!: Statement;

  // Opacity layer statements
  private stmtInsertOpaque!: Statement;
  private stmtGetOpaque!: Statement;
  private stmtGetOpaqueMultiple!: Statement;
  private stmtUpdateOpaqueAccess!: Statement;
  private stmtDeleteExpiredOpaque!: Statement;
  private stmtGetMaxOpaqueId!: Statement;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database with WAL mode for better concurrency
    this.db = new Database(dbPath);

    // Enable WAL mode and other optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

    // Initialize schema
    this.db.exec(SCHEMA_SQL);

    // Prepare statements
    this.prepareStatements();
  }

  private prepareStatements(): void {
    // Insert symbol
    this.stmtInsertSymbol = this.db.prepare(`
      INSERT INTO symbols (
        symbol_id, category, subcategory, version, content_hash,
        commanders_intent, data, created_at, created_by, tags, parent_symbol
      ) VALUES (
        @symbol_id, @category, @subcategory, @version, @content_hash,
        @commanders_intent, @data, @created_at, @created_by, @tags, @parent_symbol
      )
    `);

    // Get symbol by ID
    this.stmtGetSymbol = this.db.prepare(`
      SELECT * FROM symbols WHERE symbol_id = ?
    `);

    // Update symbol
    this.stmtUpdateSymbol = this.db.prepare(`
      UPDATE symbols SET
        version = @version,
        content_hash = @content_hash,
        commanders_intent = @commanders_intent,
        data = @data,
        updated_at = @updated_at,
        tags = @tags
      WHERE symbol_id = @symbol_id
    `);

    // Delete symbol
    this.stmtDeleteSymbol = this.db.prepare(`
      DELETE FROM symbols WHERE symbol_id = ?
    `);

    // List symbols (base query - filtering done in method)
    this.stmtListSymbols = this.db.prepare(`
      SELECT symbol_id, category, version, content_hash, commanders_intent,
             created_at, updated_at
      FROM symbols
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    // Count by category
    this.stmtCountByCategory = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM symbols GROUP BY category
    `);

    // Insert audit entry
    this.stmtInsertAudit = this.db.prepare(`
      INSERT INTO audit_log (timestamp, event_type, symbol_id, risk_score, details, violations)
      VALUES (@timestamp, @event_type, @symbol_id, @risk_score, @details, @violations)
    `);

    // Full-text search
    this.stmtSearchSymbols = this.db.prepare(`
      SELECT s.symbol_id, s.category, s.version, s.content_hash,
             s.commanders_intent, s.created_at, s.updated_at
      FROM symbols s
      JOIN symbols_fts fts ON s.id = fts.rowid
      WHERE symbols_fts MATCH ?
      ORDER BY rank
      LIMIT ? OFFSET ?
    `);

    // ─────────────────────────────────────────────────────────────────────────
    // OPACITY LAYER STATEMENTS
    // ─────────────────────────────────────────────────────────────────────────

    // Insert opaque token
    this.stmtInsertOpaque = this.db.prepare(`
      INSERT INTO opaque_mappings (token, plaintext, symbol_id, field_name, created_at, expires_at)
      VALUES (@token, @plaintext, @symbol_id, @field_name, @created_at, @expires_at)
    `);

    // Get single opaque token
    this.stmtGetOpaque = this.db.prepare(`
      SELECT * FROM opaque_mappings WHERE token = ?
    `);

    // Update access count and timestamp
    this.stmtUpdateOpaqueAccess = this.db.prepare(`
      UPDATE opaque_mappings
      SET access_count = access_count + 1, last_accessed = datetime('now')
      WHERE token = ?
    `);

    // Delete expired tokens
    this.stmtDeleteExpiredOpaque = this.db.prepare(`
      DELETE FROM opaque_mappings
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `);

    // Get max token ID for counter initialization
    this.stmtGetMaxOpaqueId = this.db.prepare(`
      SELECT MAX(CAST(SUBSTR(token, 3) AS INTEGER)) as max_id FROM opaque_mappings
    `);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SYMBOL OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Insert a new symbol
   */
  insertSymbol(symbol: DirectiveSymbol): { success: boolean; error?: string } {
    try {
      this.stmtInsertSymbol.run({
        symbol_id: symbol.symbolId,
        category: symbol.category,
        subcategory: symbol.subcategory || null,
        version: symbol.version,
        content_hash: symbol.hash,
        commanders_intent: symbol.commanders_intent,
        data: JSON.stringify(symbol),
        created_at: symbol.created_at,
        created_by: symbol.created_by || null,
        tags: symbol.tags ? JSON.stringify(symbol.tags) : null,
        parent_symbol: symbol.parent_symbol || null,
      });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('UNIQUE constraint failed')) {
        return { success: false, error: `Symbol ${symbol.symbolId} already exists` };
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Get a symbol by ID
   */
  getSymbol(symbolId: string): DirectiveSymbol | null {
    const row = this.stmtGetSymbol.get(symbolId) as SymbolRow | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as DirectiveSymbol;
  }

  /**
   * Update an existing symbol
   */
  updateSymbol(symbol: DirectiveSymbol): { success: boolean; error?: string } {
    try {
      const result = this.stmtUpdateSymbol.run({
        symbol_id: symbol.symbolId,
        version: symbol.version,
        content_hash: symbol.hash,
        commanders_intent: symbol.commanders_intent,
        data: JSON.stringify(symbol),
        updated_at: symbol.updated_at || new Date().toISOString(),
        tags: symbol.tags ? JSON.stringify(symbol.tags) : null,
      });

      if (result.changes === 0) {
        return { success: false, error: `Symbol ${symbol.symbolId} not found` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Delete a symbol
   */
  deleteSymbol(symbolId: string): { success: boolean; deleted: boolean } {
    const result = this.stmtDeleteSymbol.run(symbolId);
    return { success: true, deleted: result.changes > 0 };
  }

  /**
   * Check if a symbol exists
   */
  symbolExists(symbolId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM symbols WHERE symbol_id = ?').get(symbolId);
    return row !== undefined;
  }

  /**
   * List symbols with filtering
   */
  listSymbols(options: {
    category?: SymbolCategory;
    search?: string;
    createdAfter?: string;
    createdBefore?: string;
    limit?: number;
    offset?: number;
  }): { symbols: Array<SymbolRegistryEntry & { symbolId: string }>; total: number; hasMore: boolean } {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Build dynamic query based on filters
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options.createdAfter) {
      conditions.push('created_at >= ?');
      params.push(options.createdAfter);
    }
    if (options.createdBefore) {
      conditions.push('created_at <= ?');
      params.push(options.createdBefore);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Use FTS for search if provided
    if (options.search) {
      const searchResults = this.stmtSearchSymbols.all(
        options.search,
        limit,
        offset
      ) as SymbolRow[];

      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM symbols_fts WHERE symbols_fts MATCH ?
      `);
      const countResult = countStmt.get(options.search) as { count: number };

      return {
        symbols: searchResults.map(row => ({
          symbolId: row.symbol_id,
          path: '', // Not used in SQLite mode
          category: row.category as SymbolCategory,
          version: row.version,
          hash: row.content_hash,
          created_at: row.created_at,
          updated_at: row.updated_at || undefined,
          commanders_intent_preview: row.commanders_intent.substring(0, 100),
        })),
        total: countResult.count,
        hasMore: offset + searchResults.length < countResult.count,
      };
    }

    // Regular filtered query
    const query = `
      SELECT symbol_id, category, version, content_hash, commanders_intent,
             created_at, updated_at
      FROM symbols
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) as count FROM symbols ${whereClause}`;

    const rows = this.db.prepare(query).all(...params, limit, offset) as SymbolRow[];
    const countResult = this.db.prepare(countQuery).get(...params) as { count: number };

    return {
      symbols: rows.map(row => ({
        symbolId: row.symbol_id,
        path: '',
        category: row.category as SymbolCategory,
        version: row.version,
        hash: row.content_hash,
        created_at: row.created_at,
        updated_at: row.updated_at || undefined,
        commanders_intent_preview: row.commanders_intent.substring(0, 100),
      })),
      total: countResult.count,
      hasMore: offset + rows.length < countResult.count,
    };
  }

  /**
   * Get all symbols (for export)
   */
  getAllSymbols(): DirectiveSymbol[] {
    const rows = this.db.prepare('SELECT data FROM symbols ORDER BY created_at').all() as { data: string }[];
    return rows.map(row => JSON.parse(row.data) as DirectiveSymbol);
  }

  /**
   * Search symbols using full-text search
   * Uses the symbols_fts FTS5 table to find symbols matching the query
   */
  search(query: string): SymbolRow[] {
    const stmt = this.db.prepare(`
      SELECT s.*
      FROM symbols s
      JOIN symbols_fts fts ON s.id = fts.rowid
      WHERE symbols_fts MATCH ?
      ORDER BY rank
    `);
    return stmt.all(query) as SymbolRow[];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUDIT OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Insert an audit entry
   */
  insertAuditEntry(entry: {
    eventType: string;
    symbolId?: string;
    riskScore?: number;
    details?: Record<string, unknown>;
    violations?: unknown[];
  }): void {
    this.stmtInsertAudit.run({
      timestamp: new Date().toISOString(),
      event_type: entry.eventType,
      symbol_id: entry.symbolId || null,
      risk_score: entry.riskScore ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
      violations: entry.violations ? JSON.stringify(entry.violations) : null,
    });
  }

  /**
   * Get recent audit entries
   */
  getRecentAuditEntries(limit: number = 100): AuditRow[] {
    return this.db.prepare(`
      SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as AuditRow[];
  }

  /**
   * Get injection attempts
   */
  getInjectionAttempts(): AuditRow[] {
    return this.db.prepare(`
      SELECT * FROM audit_log
      WHERE event_type IN ('INJECTION_ATTEMPT', 'SYMBOL_CREATE_BLOCKED', 'SYMBOL_UPDATE_BLOCKED')
      ORDER BY timestamp DESC
    `).all() as AuditRow[];
  }

  /**
   * Get audit entries for a symbol
   */
  getAuditForSymbol(symbolId: string): AuditRow[] {
    return this.db.prepare(`
      SELECT * FROM audit_log WHERE symbol_id = ? ORDER BY timestamp DESC
    `).all(symbolId) as AuditRow[];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPACITY LAYER OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current maximum token ID (for counter initialization)
   */
  getMaxOpaqueId(): number {
    const result = this.stmtGetMaxOpaqueId.get() as { max_id: number | null };
    return result?.max_id ?? 10000;
  }

  /**
   * Insert a new opaque token mapping
   */
  insertOpaqueToken(params: {
    token: string;
    plaintext: string;
    symbolId?: string;
    fieldName?: string;
    expiresAt?: string;
  }): { success: boolean; error?: string } {
    try {
      this.stmtInsertOpaque.run({
        token: params.token,
        plaintext: params.plaintext,
        symbol_id: params.symbolId || null,
        field_name: params.fieldName || null,
        created_at: new Date().toISOString(),
        expires_at: params.expiresAt || null,
      });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('UNIQUE constraint failed')) {
        return { success: false, error: `Token ${params.token} already exists` };
      }
      return { success: false, error: msg };
    }
  }

  /**
   * Get a single opaque token mapping
   */
  getOpaqueToken(token: string, updateAccess: boolean = true): OpaqueRow | null {
    const row = this.stmtGetOpaque.get(token) as OpaqueRow | undefined;
    if (!row) return null;

    // Update access tracking
    if (updateAccess) {
      this.stmtUpdateOpaqueAccess.run(token);
    }

    return row;
  }

  /**
   * Resolve multiple opaque tokens at once
   */
  resolveOpaqueTokens(tokens: string[], updateAccess: boolean = true): Record<string, string> {
    const resolved: Record<string, string> = {};

    // Use a transaction for efficiency
    this.transaction(() => {
      for (const token of tokens) {
        const row = this.getOpaqueToken(token, updateAccess);
        if (row) {
          resolved[token] = row.plaintext;
        }
      }
    });

    return resolved;
  }

  /**
   * Get all opaque tokens for a symbol
   */
  getOpaqueTokensForSymbol(symbolId: string): OpaqueRow[] {
    return this.db.prepare(`
      SELECT * FROM opaque_mappings WHERE symbol_id = ? ORDER BY created_at
    `).all(symbolId) as OpaqueRow[];
  }

  /**
   * Delete expired opaque tokens
   */
  cleanupExpiredOpaqueTokens(): number {
    const result = this.stmtDeleteExpiredOpaque.run();
    return result.changes;
  }

  /**
   * Delete all opaque tokens for a symbol
   */
  deleteOpaqueTokensForSymbol(symbolId: string): number {
    const result = this.db.prepare(`
      DELETE FROM opaque_mappings WHERE symbol_id = ?
    `).run(symbolId);
    return result.changes;
  }

  /**
   * Get opacity statistics
   */
  getOpaqueStats(): {
    totalTokens: number;
    totalAccesses: number;
    tokensWithSymbol: number;
    expiredTokens: number;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_tokens,
        SUM(access_count) as total_accesses,
        SUM(CASE WHEN symbol_id IS NOT NULL THEN 1 ELSE 0 END) as tokens_with_symbol,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at < datetime('now') THEN 1 ELSE 0 END) as expired_tokens
      FROM opaque_mappings
    `).get() as {
      total_tokens: number;
      total_accesses: number;
      tokens_with_symbol: number;
      expired_tokens: number;
    };

    return {
      totalTokens: stats.total_tokens || 0,
      totalAccesses: stats.total_accesses || 0,
      tokensWithSymbol: stats.tokens_with_symbol || 0,
      expiredTokens: stats.expired_tokens || 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get database statistics
   */
  getStats(): DatabaseStats {
    const categoryRows = this.stmtCountByCategory.all() as { category: SymbolCategory; count: number }[];

    const byCategory: Record<SymbolCategory, number> = {
      // AGENT family
      COMPANY: 0,
      PERSON: 0,
      SYSTEM: 0,
      // RESOURCE family
      DOCUMENT: 0,
      KNOWLEDGE: 0,
      ASSET: 0,
      // EVENT family
      EVENT: 0,
      MILESTONE: 0,
      REGULATORY_EVENT: 0,
      // FLOW family
      TASK: 0,
      WORKFLOW: 0,
      TRANSACTION: 0,
      // RULE family
      REGULATORY: 0,
      POLICY: 0,
      CONSTRAINT: 0,
      // UNIT family
      METRIC: 0,
      GEOGRAPHY: 0,
      SECTOR: 0,
      // QUERY family
      QUERY: 0,
    };

    let totalSymbols = 0;
    for (const row of categoryRows) {
      byCategory[row.category] = row.count;
      totalSymbols += row.count;
    }

    const auditCount = this.db.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number };

    // Get database file size
    let databaseSizeBytes = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      databaseSizeBytes = stats.size;
    } catch {
      // File might not exist yet
    }

    return {
      totalSymbols,
      byCategory,
      totalAuditEvents: auditCount.count,
      databaseSizeBytes,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TRANSACTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Run multiple operations in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAINTENANCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Optimize the database (run periodically)
   */
  optimize(): void {
    this.db.pragma('optimize');
    this.db.exec('VACUUM');
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check database integrity
   */
  checkIntegrity(): { ok: boolean; errors: string[] } {
    const result = this.db.pragma('integrity_check') as { integrity_check: string }[];
    const errors = result
      .map(r => r.integrity_check)
      .filter(msg => msg !== 'ok');
    return { ok: errors.length === 0, errors };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RAW SQL ACCESS (for extension modules like API keys)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute raw SQL (for DDL statements, migrations, etc.)
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a statement for execution
   */
  prepare(sql: string): Statement {
    return this.db.prepare(sql);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let symbolDatabase: SymbolDatabase | null = null;

export function initializeDatabase(dbPath: string): SymbolDatabase {
  if (symbolDatabase) {
    symbolDatabase.close();
  }
  symbolDatabase = new SymbolDatabase(dbPath);
  return symbolDatabase;
}

export function getDatabase(): SymbolDatabase {
  if (!symbolDatabase) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return symbolDatabase;
}

export function closeDatabase(): void {
  if (symbolDatabase) {
    symbolDatabase.close();
    symbolDatabase = null;
  }
}
