/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK SYMBOL MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages storage, retrieval, and validation of directive symbols.
 * Now backed by SQLite for ACID transactions, concurrent safety, and performance.
 *
 * Migration from JSON to SQLite provides:
 * - Atomic commits (no partial writes)
 * - WAL mode for concurrent read/write
 * - Indexed queries (O(log n) vs O(n))
 * - Built-in integrity constraints
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type {
  DirectiveSymbol,
  SymbolCategory,
  SymbolRegistry,
  SymbolIdValidation,
  CreateSymbolRequest,
  CreateSymbolResponse,
  GetSymbolRequest,
  GetSymbolResponse,
  UpdateSymbolRequest,
  UpdateSymbolResponse,
  ListSymbolsRequest,
  ListSymbolsResponse,
  DeleteSymbolRequest,
  DeleteSymbolResponse,
  ImportSymbolsRequest,
  ImportSymbolsResponse,
  SymbolListEntry,
} from './types.js';

import { CATEGORY_PREFIX } from './types.js';
import { validateSymbolContent, type FullValidationResult } from './sanitizer.js';
import { getAuditLogger, initializeAuditLogger } from './audit.js';
import { initializeDatabase, getDatabase, type SymbolDatabase } from './database.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SYMBOL_PREFIX = 'Ξ';
const DATABASE_FILE = 'promptspeak.db';

// ═══════════════════════════════════════════════════════════════════════════════
// LRU CACHE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple LRU cache with maximum size and eviction
 */
class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SymbolManager {
  private symbolsRoot: string;
  private db: SymbolDatabase;
  private cache: LRUCache<string, DirectiveSymbol>;

  constructor(symbolsRoot: string) {
    this.symbolsRoot = symbolsRoot;
    this.cache = new LRUCache<string, DirectiveSymbol>(1000);

    // Ensure directories exist
    if (!fs.existsSync(symbolsRoot)) {
      fs.mkdirSync(symbolsRoot, { recursive: true });
    }

    // Initialize SQLite database
    const dbPath = path.join(symbolsRoot, DATABASE_FILE);
    this.db = initializeDatabase(dbPath);

    // Initialize audit logger
    const logsDir = path.join(symbolsRoot, '..', 'logs');
    initializeAuditLogger(logsDir);

    // Migrate from JSON if needed
    this.migrateFromJsonIfNeeded();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JSON MIGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  private migrateFromJsonIfNeeded(): void {
    const registryPath = path.join(this.symbolsRoot, 'registry.json');

    if (!fs.existsSync(registryPath)) {
      return; // No JSON registry to migrate
    }

    // Check if we already have symbols in SQLite
    const stats = this.db.getStats();
    if (stats.totalSymbols > 0) {
      // Rename old registry to indicate migration complete
      const backupPath = path.join(this.symbolsRoot, 'registry.json.migrated');
      if (!fs.existsSync(backupPath)) {
        fs.renameSync(registryPath, backupPath);
        console.log('[SymbolManager] JSON registry backed up to registry.json.migrated');
      }
      return;
    }

    console.log('[SymbolManager] Migrating from JSON to SQLite...');

    try {
      const registryData = fs.readFileSync(registryPath, 'utf-8');
      const registry: SymbolRegistry = JSON.parse(registryData);
      let migrated = 0;
      let failed = 0;

      // Use transaction for atomic migration
      this.db.transaction(() => {
        for (const [symbolId, entry] of Object.entries(registry.symbols)) {
          try {
            // Load symbol file
            const symbolPath = path.join(this.symbolsRoot, entry.path);
            if (fs.existsSync(symbolPath)) {
              const symbolData = fs.readFileSync(symbolPath, 'utf-8');
              const symbol: DirectiveSymbol = JSON.parse(symbolData);

              const result = this.db.insertSymbol(symbol);
              if (result.success) {
                migrated++;
              } else {
                console.warn(`[Migration] Failed to migrate ${symbolId}: ${result.error}`);
                failed++;
              }
            }
          } catch (err) {
            console.warn(`[Migration] Error migrating ${symbolId}:`, err);
            failed++;
          }
        }
      });

      console.log(`[SymbolManager] Migration complete: ${migrated} symbols migrated, ${failed} failed`);

      // Backup the old registry
      const backupPath = path.join(this.symbolsRoot, 'registry.json.migrated');
      fs.renameSync(registryPath, backupPath);
      console.log('[SymbolManager] JSON registry backed up to registry.json.migrated');

    } catch (err) {
      console.error('[SymbolManager] Migration failed:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYMBOL ID VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  validateSymbolId(symbolId: string): SymbolIdValidation {
    // Check prefix
    if (!symbolId.startsWith(`${SYMBOL_PREFIX}.`)) {
      return {
        valid: false,
        symbolId,
        error: `Must start with ${SYMBOL_PREFIX}.`,
      };
    }

    const parts = symbolId.slice(2).split('.');

    if (parts.length < 2) {
      return {
        valid: false,
        symbolId,
        error: `Must have at least 2 segments after ${SYMBOL_PREFIX}.`,
      };
    }

    // Check for namespace (lowercase first segment) - v2.0 feature
    let namespace: string | undefined;
    let categoryIndex = 0;

    if (parts[0] && /^[a-z][a-z0-9_]*$/.test(parts[0])) {
      namespace = parts[0];
      categoryIndex = 1;

      // Must have category + entity after namespace
      if (parts.length < categoryIndex + 2) {
        return {
          valid: false,
          symbolId,
          error: `Must have category and entity after namespace.`,
        };
      }
    }

    // Validate segments (skip namespace if present)
    for (let i = categoryIndex; i < parts.length; i++) {
      const part = parts[i];
      if (!/^[A-Z0-9_]+$/.test(part)) {
        return {
          valid: false,
          symbolId,
          error: `Segment "${part}" contains invalid characters. Use A-Z, 0-9, _ only.`,
        };
      }
      if (part.length === 0 || part.length > 50) {
        return {
          valid: false,
          symbolId,
          error: `Segment "${part}" must be 1-50 characters.`,
        };
      }
    }

    const categoryPart = parts[categoryIndex];

    // Check for 2-letter category prefix first (v2.0 subcategories)
    if (categoryPart.length === 2 && CATEGORY_PREFIX[categoryPart]) {
      return {
        valid: true,
        symbolId,
        category: CATEGORY_PREFIX[categoryPart],
        namespace,
        inferred: false,
        segments: parts.slice(categoryIndex),
      };
    }

    // Check for 1-letter category prefix
    if (categoryPart.length === 1 && CATEGORY_PREFIX[categoryPart]) {
      return {
        valid: true,
        symbolId,
        category: CATEGORY_PREFIX[categoryPart],
        namespace,
        inferred: false,
        segments: parts.slice(categoryIndex),
      };
    }

    // Check if it looks like a ticker (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(categoryPart)) {
      return {
        valid: true,
        symbolId,
        category: 'COMPANY',
        namespace,
        inferred: true,
        segments: parts.slice(categoryIndex),
      };
    }

    // List available prefixes for error message
    const validPrefixes = Object.keys(CATEGORY_PREFIX).sort().join('/');

    return {
      valid: false,
      symbolId,
      error: `First segment "${categoryPart}" is not a valid category prefix (${validPrefixes}) or ticker.`,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HASH CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════

  calculateHash(symbol: Partial<DirectiveSymbol>): string {
    // Include only semantic content, not metadata
    const content = {
      who: symbol.who,
      what: symbol.what,
      why: symbol.why,
      where: symbol.where,
      when: symbol.when,
      how: symbol.how,
      commanders_intent: symbol.commanders_intent,
      requirements: symbol.requirements,
      anti_requirements: symbol.anti_requirements,
      key_terms: symbol.key_terms,
    };

    const json = JSON.stringify(content, Object.keys(content).sort());
    return createHash('sha256').update(json).digest('hex').substring(0, 16);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  create(request: CreateSymbolRequest): CreateSymbolResponse {
    // Validate symbol ID
    const validation = this.validateSymbolId(request.symbolId);
    if (!validation.valid) {
      return {
        success: false,
        symbolId: request.symbolId,
        version: 0,
        hash: '',
        path: '',
        error: validation.error,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECURITY: Validate and sanitize content before creation
    // ─────────────────────────────────────────────────────────────────────────
    const securityValidation = validateSymbolContent(request);
    const auditLogger = getAuditLogger();

    if (securityValidation.blocked) {
      // Log injection attempt
      if (auditLogger) {
        const violations = Array.from(securityValidation.fieldResults.values())
          .flatMap(r => r.violations);
        auditLogger.logInjectionAttempt(
          request.symbolId,
          violations,
          securityValidation.totalRiskScore,
          true
        );
      }

      // Also log to SQLite audit
      this.db.insertAuditEntry({
        eventType: 'SYMBOL_CREATE_BLOCKED',
        symbolId: request.symbolId,
        riskScore: securityValidation.totalRiskScore,
        violations: Array.from(securityValidation.fieldResults.values())
          .flatMap(r => r.violations),
      });

      return {
        success: false,
        symbolId: request.symbolId,
        version: 0,
        hash: '',
        path: '',
        error: `Symbol rejected: ${securityValidation.summary}. Content contains injection patterns.`,
      };
    }

    // Log warning if there are non-critical violations
    if (securityValidation.totalViolations > 0 && auditLogger) {
      const violations = Array.from(securityValidation.fieldResults.values())
        .flatMap(r => r.violations);
      auditLogger.logValidationWarning(
        request.symbolId,
        violations,
        securityValidation.totalRiskScore
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Check if already exists
    if (this.db.symbolExists(request.symbolId)) {
      return {
        success: false,
        symbolId: request.symbolId,
        version: 0,
        hash: '',
        path: '',
        error: `Symbol ${request.symbolId} already exists. Use update instead.`,
      };
    }

    const category = request.category || validation.category!;
    const now = new Date().toISOString();

    // Build symbol
    const symbol: DirectiveSymbol = {
      symbolId: request.symbolId,
      version: 1,
      hash: '', // Calculated below
      category,
      subcategory: request.subcategory,
      tags: request.tags,
      who: request.who,
      what: request.what,
      why: request.why,
      where: request.where,
      when: request.when,
      how: request.how,
      commanders_intent: request.commanders_intent,
      requirements: request.requirements,
      anti_requirements: request.anti_requirements,
      key_terms: request.key_terms,
      created_at: now,
      created_by: request.created_by,
      parent_symbol: request.parent_symbol,
      related_symbols: request.related_symbols,
      source_dataset: request.source_dataset,
      source_id: request.source_id,
      source_data: request.source_data,
      changelog: [{
        version: 1,
        change: 'Initial creation',
        timestamp: now,
        changed_by: request.created_by,
      }],
    };

    // Calculate hash
    symbol.hash = this.calculateHash(symbol);

    // Insert into database
    const result = this.db.insertSymbol(symbol);

    if (!result.success) {
      return {
        success: false,
        symbolId: request.symbolId,
        version: 0,
        hash: '',
        path: '',
        error: result.error || 'Failed to insert symbol',
      };
    }

    // Update cache
    this.cache.set(request.symbolId, symbol);

    // Log successful creation
    if (auditLogger) {
      auditLogger.logCreate(request.symbolId, true, securityValidation, {
        category,
        hash: symbol.hash,
      });
    }

    this.db.insertAuditEntry({
      eventType: 'SYMBOL_CREATE',
      symbolId: request.symbolId,
      details: { category, hash: symbol.hash },
    });

    return {
      success: true,
      symbolId: request.symbolId,
      version: 1,
      hash: symbol.hash,
      path: `sqlite:${request.symbolId}`, // Indicate SQLite storage
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  get(request: GetSymbolRequest): GetSymbolResponse {
    // Check cache first (O(1) lookup)
    const cached = this.cache.get(request.symbolId);
    if (cached) {
      if (!request.version || cached.version === request.version) {
        return {
          found: true,
          symbol: request.include_changelog === false
            ? { ...cached, changelog: undefined }
            : cached,
        };
      }
    }

    // Query database
    const symbol = this.db.getSymbol(request.symbolId);

    if (!symbol) {
      return {
        found: false,
        error: `Symbol ${request.symbolId} not found`,
      };
    }

    // Check version if requested
    if (request.version && symbol.version !== request.version) {
      return {
        found: false,
        error: `Version ${request.version} not found. Current version is ${symbol.version}`,
      };
    }

    // Update cache
    this.cache.set(request.symbolId, symbol);

    return {
      found: true,
      symbol: request.include_changelog === false
        ? { ...symbol, changelog: undefined }
        : symbol,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  update(request: UpdateSymbolRequest): UpdateSymbolResponse {
    // Get existing symbol
    const existing = this.get({ symbolId: request.symbolId });
    if (!existing.found || !existing.symbol) {
      return {
        success: false,
        symbolId: request.symbolId,
        old_version: 0,
        new_version: 0,
        old_hash: '',
        new_hash: '',
        error: existing.error || `Symbol ${request.symbolId} not found`,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECURITY: Validate update changes before applying
    // ─────────────────────────────────────────────────────────────────────────
    const auditLogger = getAuditLogger();

    // Build a mock request to validate the changed fields
    const mockRequest = {
      symbolId: request.symbolId,
      who: request.changes.who || existing.symbol.who,
      what: request.changes.what || existing.symbol.what,
      why: request.changes.why || existing.symbol.why,
      where: request.changes.where || existing.symbol.where,
      when: request.changes.when || existing.symbol.when,
      how: request.changes.how || existing.symbol.how,
      commanders_intent: request.changes.commanders_intent || existing.symbol.commanders_intent,
      requirements: request.changes.requirements || existing.symbol.requirements,
      anti_requirements: request.changes.anti_requirements || existing.symbol.anti_requirements,
    } as CreateSymbolRequest;

    const securityValidation = validateSymbolContent(mockRequest);

    if (securityValidation.blocked) {
      // Log injection attempt
      if (auditLogger) {
        const violations = Array.from(securityValidation.fieldResults.values())
          .flatMap(r => r.violations);
        auditLogger.logInjectionAttempt(
          request.symbolId,
          violations,
          securityValidation.totalRiskScore,
          true
        );
      }

      this.db.insertAuditEntry({
        eventType: 'SYMBOL_UPDATE_BLOCKED',
        symbolId: request.symbolId,
        riskScore: securityValidation.totalRiskScore,
        violations: Array.from(securityValidation.fieldResults.values())
          .flatMap(r => r.violations),
      });

      return {
        success: false,
        symbolId: request.symbolId,
        old_version: existing.symbol.version,
        new_version: 0,
        old_hash: existing.symbol.hash,
        new_hash: '',
        error: `Update rejected: ${securityValidation.summary}. Content contains injection patterns.`,
      };
    }

    // Log warning if there are non-critical violations
    if (securityValidation.totalViolations > 0 && auditLogger) {
      const violations = Array.from(securityValidation.fieldResults.values())
        .flatMap(r => r.violations);
      auditLogger.logValidationWarning(
        request.symbolId,
        violations,
        securityValidation.totalRiskScore
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const oldSymbol = existing.symbol;
    const now = new Date().toISOString();

    // Build updated symbol
    const updated: DirectiveSymbol = {
      ...oldSymbol,
      ...request.changes,
      symbolId: oldSymbol.symbolId, // Cannot change ID
      version: oldSymbol.version + 1,
      hash: '', // Recalculated below
      created_at: oldSymbol.created_at, // Cannot change
      updated_at: now,
      changelog: [
        ...(oldSymbol.changelog || []),
        {
          version: oldSymbol.version + 1,
          change: request.change_description,
          timestamp: now,
          changed_by: request.changed_by,
        },
      ],
    };

    // Recalculate hash
    updated.hash = this.calculateHash(updated);

    // Update in database
    const result = this.db.updateSymbol(updated);

    if (!result.success) {
      return {
        success: false,
        symbolId: request.symbolId,
        old_version: oldSymbol.version,
        new_version: 0,
        old_hash: oldSymbol.hash,
        new_hash: '',
        error: result.error || 'Failed to update symbol',
      };
    }

    // Update cache
    this.cache.set(request.symbolId, updated);

    this.db.insertAuditEntry({
      eventType: 'SYMBOL_UPDATE',
      symbolId: request.symbolId,
      details: {
        oldVersion: oldSymbol.version,
        newVersion: updated.version,
        change: request.change_description,
      },
    });

    return {
      success: true,
      symbolId: request.symbolId,
      old_version: oldSymbol.version,
      new_version: updated.version,
      old_hash: oldSymbol.hash,
      new_hash: updated.hash,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST SYMBOLS
  // ═══════════════════════════════════════════════════════════════════════════

  list(request: ListSymbolsRequest): ListSymbolsResponse {
    const result = this.db.listSymbols({
      category: request.category,
      search: request.search,
      createdAfter: request.created_after,
      createdBefore: request.created_before,
      limit: request.limit || 50,
      offset: request.offset || 0,
    });

    // Convert to expected format
    const symbols: SymbolListEntry[] = result.symbols.map(entry => ({
      symbolId: entry.symbolId,
      category: entry.category,
      version: entry.version,
      hash: entry.hash,
      commanders_intent: entry.commanders_intent_preview || '',
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    }));

    return {
      symbols,
      total: result.total,
      has_more: result.hasMore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE SYMBOL
  // ═══════════════════════════════════════════════════════════════════════════

  delete(request: DeleteSymbolRequest): DeleteSymbolResponse {
    // Check if exists
    if (!this.db.symbolExists(request.symbolId)) {
      return {
        success: false,
        deleted: false,
        error: `Symbol ${request.symbolId} not found`,
      };
    }

    // Delete from database
    const result = this.db.deleteSymbol(request.symbolId);

    if (result.deleted) {
      // Remove from cache
      this.cache.delete(request.symbolId);

      this.db.insertAuditEntry({
        eventType: 'SYMBOL_DELETE',
        symbolId: request.symbolId,
        details: { reason: request.reason },
      });
    }

    return {
      success: true,
      deleted: result.deleted,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT SYMBOLS
  // ═══════════════════════════════════════════════════════════════════════════

  import(request: ImportSymbolsRequest): ImportSymbolsResponse {
    const symbolsCreated: string[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    let imported = 0;

    // Parse data based on source
    let rows: unknown[] = [];

    if (request.source === 'json') {
      if (Array.isArray(request.data)) {
        rows = request.data;
      } else {
        return {
          success: false,
          imported: 0,
          failed: 0,
          symbols_created: [],
          errors: [{ index: -1, error: 'JSON data must be an array' }],
        };
      }
    } else if (request.source === 'huggingface') {
      // HuggingFace format: { rows: [{ row: {...} }, ...] }
      const hfData = request.data as { rows?: Array<{ row: unknown }> };
      if (hfData.rows && Array.isArray(hfData.rows)) {
        rows = hfData.rows.map(r => r.row);
      } else {
        return {
          success: false,
          imported: 0,
          failed: 0,
          symbols_created: [],
          errors: [{ index: -1, error: 'Invalid HuggingFace data format' }],
        };
      }
    }

    // Use transaction for atomic import
    this.db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as Record<string, unknown>;

        try {
          // Generate symbol ID
          const symbolId = `${request.id_prefix}.${String(i + 1).padStart(3, '0')}`;

          // Apply transforms or use defaults
          const transform = request.transform || {};
          const defaults = request.defaults || {};

          const getValue = (field: keyof typeof transform, fallback: string): string => {
            const t = transform[field];
            if (typeof t === 'function') {
              const result = t(row);
              return Array.isArray(result) ? result[0] || fallback : String(result);
            }
            if (typeof t === 'string' && row[t] !== undefined) return String(row[t]);
            if ((defaults as Record<string, unknown>)[field]) return String((defaults as Record<string, unknown>)[field]);
            return fallback;
          };

          const getArrayValue = (field: keyof typeof transform, fallback: string[]): string[] => {
            const t = transform[field];
            if (typeof t === 'function') return t(row) as string[];
            if (typeof t === 'string' && row[t] !== undefined) {
              const val = row[t];
              if (Array.isArray(val)) return val.map(String);
              if (typeof val === 'string') return [val];
            }
            if ((defaults as Record<string, unknown>)[field]) {
              const def = (defaults as Record<string, unknown>)[field];
              return Array.isArray(def) ? def.map(String) : [String(def)];
            }
            return fallback;
          };

          // Build create request
          const createRequest: CreateSymbolRequest = {
            symbolId,
            category: request.category,
            who: getValue('who', 'Benchmark System'),
            what: getValue('what', String(row['question'] || row['query'] || 'Unknown')),
            why: getValue('why', 'Benchmark evaluation'),
            where: getValue('where', request.id_prefix),
            when: getValue('when', new Date().toISOString().split('T')[0]),
            how: {
              focus: getArrayValue('requirements', ['accuracy', 'completeness']),
              constraints: ['cite_sources'],
            },
            commanders_intent: getValue('commanders_intent', 'Provide accurate answer'),
            requirements: getArrayValue('requirements', ['Answer the question']),
            key_terms: getArrayValue('key_terms', []),
            source_dataset: request.id_prefix.replace(`${SYMBOL_PREFIX}.Q.`, '').toLowerCase(),
            source_id: String(i + 1),
            source_data: row,
          };

          const result = this.create(createRequest);

          if (result.success) {
            imported++;
            symbolsCreated.push(symbolId);
          } else {
            errors.push({ index: i, error: result.error || 'Unknown error' });
          }
        } catch (e) {
          errors.push({ index: i, error: String(e) });
        }
      }
    });

    return {
      success: errors.length === 0,
      imported,
      failed: errors.length,
      symbols_created: symbolsCreated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT SYMBOLS (NEW - for JSON backup)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export all symbols to JSON format for backup/portability
   */
  exportToJson(outputPath?: string): { success: boolean; path?: string; count: number; error?: string } {
    try {
      const symbols = this.db.getAllSymbols();
      const stats = this.db.getStats();

      const exportData = {
        version: '2.0.0',
        exported_at: new Date().toISOString(),
        format: 'sqlite-export',
        stats: {
          total_symbols: stats.totalSymbols,
          by_category: stats.byCategory,
        },
        symbols,
      };

      const exportPath = outputPath || path.join(this.symbolsRoot, 'symbols-export.json');
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

      return {
        success: true,
        path: exportPath,
        count: symbols.length,
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  getStats(): SymbolRegistry['stats'] {
    const dbStats = this.db.getStats();
    return {
      total_symbols: dbStats.totalSymbols,
      by_category: dbStats.byCategory,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  reload(): void {
    this.cache.clear();
  }

  /**
   * Get database-specific stats
   */
  getDatabaseStats() {
    return this.db.getStats();
  }

  /**
   * Optimize the database
   */
  optimizeDatabase(): void {
    this.db.optimize();
  }

  /**
   * Check database integrity
   */
  checkIntegrity(): { ok: boolean; errors: string[] } {
    return this.db.checkIntegrity();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let symbolManager: SymbolManager | null = null;

export function initializeSymbolManager(symbolsRoot: string): SymbolManager {
  symbolManager = new SymbolManager(symbolsRoot);
  return symbolManager;
}

export function getSymbolManager(): SymbolManager {
  if (!symbolManager) {
    throw new Error('SymbolManager not initialized. Call initializeSymbolManager first.');
  }
  return symbolManager;
}
