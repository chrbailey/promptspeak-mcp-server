/**
 * Verb Registry — SQLite Backend
 *
 * Stores the 30+ core verbs and domain extensions with full
 * lifecycle management (proposed -> active -> deprecated -> revoked).
 * Schema follows the v0.2 Design Specification Section 4.2.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export type VerbStatus = 'proposed' | 'active' | 'deprecated' | 'revoked';
export type SafetyClass = 'unrestricted' | 'monitored' | 'restricted' | 'blocked';
export type VerbCategory = 'verb' | 'modifier' | 'pattern' | 'primitive';

export interface VerbEntry {
  symbol_id: string;
  symbol: string;
  namespace: string;
  category: VerbCategory;
  definition: string;
  version: string;
  status: VerbStatus;
  safety_class: SafetyClass;
  revocation_auth: string[];
  aliases: string[];
  supersedes?: string;
  registered_by: string;
  registered_at: string;
}

export interface RegisterInput {
  symbol: string;
  namespace: string;
  category: VerbCategory;
  definition: string;
  safety_class: SafetyClass;
  registered_by: string;
  revocation_auth?: string[];
  aliases?: string[];
}

// Valid lifecycle transitions (spec Section 4.4)
const VALID_TRANSITIONS: Record<VerbStatus, VerbStatus[]> = {
  proposed: ['active', 'revoked'],
  active: ['deprecated', 'revoked'],
  deprecated: ['revoked'],
  revoked: [],
};

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS verbs (
    symbol_id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL UNIQUE,
    namespace TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('verb', 'modifier', 'pattern', 'primitive')),
    definition TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '0.1.0',
    status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed', 'active', 'deprecated', 'revoked')),
    safety_class TEXT NOT NULL CHECK(safety_class IN ('unrestricted', 'monitored', 'restricted', 'blocked')),
    revocation_auth TEXT DEFAULT '[]',
    aliases TEXT DEFAULT '[]',
    supersedes TEXT,
    registered_by TEXT NOT NULL,
    registered_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verb_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    event TEXT NOT NULL,
    details TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_verbs_namespace ON verbs(namespace);
  CREATE INDEX IF NOT EXISTS idx_verbs_status ON verbs(status);
  CREATE INDEX IF NOT EXISTS idx_verb_audit_symbol ON verb_audit(symbol);
`;

export class VerbRegistryDB {
  private db: DatabaseInstance;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    // Note: using db.exec for DDL — this is better-sqlite3's API, not child_process
    this.db['exec'](CREATE_TABLES_SQL);
  }

  register(input: RegisterInput): string {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO verbs (symbol_id, symbol, namespace, category, definition, safety_class, revocation_auth, aliases, registered_by, registered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.symbol,
      input.namespace,
      input.category,
      input.definition,
      input.safety_class,
      JSON.stringify(input.revocation_auth ?? ['PSR']),
      JSON.stringify(input.aliases ?? []),
      input.registered_by,
      now,
    );

    this.audit(input.symbol, 'registered', { registered_by: input.registered_by });
    return id;
  }

  lookup(symbol: string): VerbEntry | undefined {
    const row = this.db.prepare('SELECT * FROM verbs WHERE symbol = ?').get(symbol) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : undefined;
  }

  resolve(aliasOrSymbol: string): VerbEntry | undefined {
    const direct = this.lookup(aliasOrSymbol);
    if (direct) return direct;

    const rows = this.db.prepare('SELECT * FROM verbs').all() as Record<string, unknown>[];
    for (const row of rows) {
      const aliases: string[] = JSON.parse((row.aliases as string) || '[]');
      if (aliases.includes(aliasOrSymbol)) {
        return this.rowToEntry(row);
      }
    }
    return undefined;
  }

  listByNamespace(namespace: string): VerbEntry[] {
    const rows = this.db.prepare('SELECT * FROM verbs WHERE namespace = ? ORDER BY symbol').all(namespace) as Record<string, unknown>[];
    return rows.map(r => this.rowToEntry(r));
  }

  listByStatus(status: VerbStatus): VerbEntry[] {
    const rows = this.db.prepare('SELECT * FROM verbs WHERE status = ? ORDER BY symbol').all(status) as Record<string, unknown>[];
    return rows.map(r => this.rowToEntry(r));
  }

  transition(symbol: string, newStatus: VerbStatus, opts?: { superseded_by?: string; reason?: string; authority?: string }): void {
    const verb = this.lookup(symbol);
    if (!verb) throw new Error(`Verb not found: ${symbol}`);

    const validNext = VALID_TRANSITIONS[verb.status];
    if (!validNext.includes(newStatus)) {
      throw new Error(`Invalid transition: ${verb.status} -> ${newStatus} for ${symbol}`);
    }

    const updates: string[] = ['status = ?'];
    const params: (string | null)[] = [newStatus];

    if (opts?.superseded_by) {
      updates.push('supersedes = ?');
      params.push(opts.superseded_by);
    }

    params.push(symbol);
    this.db.prepare(`UPDATE verbs SET ${updates.join(', ')} WHERE symbol = ?`).run(...params);

    this.audit(symbol, 'transition', {
      from: verb.status,
      to: newStatus,
      reason: opts?.reason,
      authority: opts?.authority,
    });
  }

  updateDefinition(symbol: string, newDefinition: string): void {
    const verb = this.lookup(symbol);
    if (!verb) throw new Error(`Verb not found: ${symbol}`);

    const parts = verb.version.split('.').map(Number);
    const newVersion = `${parts[0]}.${parts[1] + 1}.${parts[2]}`;

    this.db.prepare('UPDATE verbs SET definition = ?, version = ? WHERE symbol = ?')
      .run(newDefinition, newVersion, symbol);

    this.audit(symbol, 'definition_updated', { version: newVersion });
  }

  getAuditHistory(symbol: string): Array<{ event: string; details: unknown; timestamp: string }> {
    const rows = this.db.prepare('SELECT * FROM verb_audit WHERE symbol = ? ORDER BY timestamp')
      .all(symbol) as Record<string, unknown>[];
    return rows.map(r => ({
      event: r.event as string,
      details: r.details ? JSON.parse(r.details as string) : null,
      timestamp: r.timestamp as string,
    }));
  }

  getStats(): { total: number; byNamespace: Record<string, number>; byStatus: Record<string, number> } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM verbs').get() as { count: number }).count;
    const nsRows = this.db.prepare('SELECT namespace, COUNT(*) as count FROM verbs GROUP BY namespace').all() as { namespace: string; count: number }[];
    const statusRows = this.db.prepare('SELECT status, COUNT(*) as count FROM verbs GROUP BY status').all() as { status: string; count: number }[];

    return {
      total,
      byNamespace: Object.fromEntries(nsRows.map(r => [r.namespace, r.count])),
      byStatus: Object.fromEntries(statusRows.map(r => [r.status, r.count])),
    };
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: Record<string, unknown>): VerbEntry {
    return {
      symbol_id: row.symbol_id as string,
      symbol: row.symbol as string,
      namespace: row.namespace as string,
      category: row.category as VerbCategory,
      definition: row.definition as string,
      version: row.version as string,
      status: row.status as VerbStatus,
      safety_class: row.safety_class as SafetyClass,
      revocation_auth: JSON.parse((row.revocation_auth as string) || '[]'),
      aliases: JSON.parse((row.aliases as string) || '[]'),
      supersedes: (row.supersedes as string) || undefined,
      registered_by: row.registered_by as string,
      registered_at: row.registered_at as string,
    };
  }

  private audit(symbol: string, event: string, details?: unknown): void {
    this.db.prepare('INSERT INTO verb_audit (symbol, event, details, timestamp) VALUES (?, ?, ?, ?)')
      .run(symbol, event, details ? JSON.stringify(details) : null, new Date().toISOString());
  }
}
