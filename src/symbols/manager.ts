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
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('SymbolManager');

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
import { getClaimValidator } from './claim-validator.js';
import type { EpistemicMetadata } from './epistemic-types.js';
import {
  runValidationPipeline,
  runSecurityValidation,
  type ValidatableContent,
} from './validation-pipeline.js';
import { createDefaultEpistemicMetadata } from './epistemic-types.js';

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
        logger.info('JSON registry backed up to registry.json.migrated');
      }
      return;
    }

    logger.info('Migrating from JSON to SQLite...');

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
                logger.warn(`[Migration] Failed to migrate ${symbolId}: ${result.error}`);
                failed++;
              }
            }
          } catch (err) {
            logger.warn(`[Migration] Error migrating ${symbolId}`, undefined, err instanceof Error ? err : undefined);
            failed++;
          }
        }
      });

      logger.info(`Migration complete: ${migrated} symbols migrated, ${failed} failed`);

      // Backup the old registry
      const backupPath = path.join(this.symbolsRoot, 'registry.json.migrated');
      fs.renameSync(registryPath, backupPath);
      logger.info('JSON registry backed up to registry.json.migrated');

    } catch (err) {
      logger.error('Migration failed', err instanceof Error ? err : undefined);
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
    // VALIDATION PIPELINE: Security + Epistemic validation
    // ─────────────────────────────────────────────────────────────────────────
    const pipelineResult = runValidationPipeline(
      request as ValidatableContent,
      'CREATE',
      this.db,
      { runEpistemic: true }
    );

    if (!pipelineResult.passed) {
      return {
        success: false,
        symbolId: request.symbolId,
        version: 0,
        hash: '',
        path: '',
        error: pipelineResult.error!,
      };
    }

    // Get epistemic metadata from pipeline result
    const epistemicMetadata = pipelineResult.epistemic!.metadata;
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
      // v2.1: Epistemic uncertainty tracking
      epistemic: epistemicMetadata,
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
    const auditLogger = getAuditLogger();
    if (auditLogger) {
      auditLogger.logCreate(request.symbolId, true, pipelineResult.security.validation, {
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
    // Build content to validate (merged with existing values)
    const contentToValidate: ValidatableContent = {
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
    };

    const securityResult = runSecurityValidation(contentToValidate, 'UPDATE', this.db);

    if (!securityResult.passed) {
      return {
        success: false,
        symbolId: request.symbolId,
        old_version: existing.symbol.version,
        new_version: 0,
        old_hash: existing.symbol.hash,
        new_hash: '',
        error: securityResult.error!,
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

    const oldSymbol = existing.symbol;
    const now = new Date().toISOString();

    // Handle epistemic metadata merge separately to preserve full type
    const { epistemic: epistemicChanges, ...otherChanges } = request.changes;
    const mergedEpistemic: EpistemicMetadata | undefined = epistemicChanges
      ? {
          ...(oldSymbol.epistemic || createDefaultEpistemicMetadata()),
          ...epistemicChanges,
        } as EpistemicMetadata
      : oldSymbol.epistemic;

    // Build updated symbol
    const updated: DirectiveSymbol = {
      ...oldSymbol,
      ...otherChanges,
      epistemic: mergedEpistemic,
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
  // EPISTEMIC VERIFICATION METHODS (v2.1)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verify a symbol claim - update its epistemic status based on human review.
   * This is used to promote claims from INFERENCE → VERIFIED or mark as DISPUTED.
   */
  verifySymbol(request: {
    symbolId: string;
    new_status: 'VERIFIED' | 'DISPUTED' | 'CORROBORATED';
    new_confidence?: number;
    evidence_added?: string[];
    reviewer: string;
    notes?: string;
  }): { success: boolean; error?: string } {
    // Get existing symbol
    const existing = this.get({ symbolId: request.symbolId });
    if (!existing.found || !existing.symbol) {
      return {
        success: false,
        error: existing.error || `Symbol ${request.symbolId} not found`,
      };
    }

    const oldEpistemic = existing.symbol.epistemic;
    const oldStatus = oldEpistemic?.status || 'INFERENCE';
    const oldConfidence = oldEpistemic?.confidence ?? 0.5;

    // Determine new confidence
    let newConfidence = request.new_confidence;
    if (newConfidence === undefined) {
      // Auto-calculate based on new status
      switch (request.new_status) {
        case 'VERIFIED':
          newConfidence = Math.max(oldConfidence, 0.9);
          break;
        case 'CORROBORATED':
          newConfidence = Math.min(oldConfidence * 1.2, 0.85);
          break;
        case 'DISPUTED':
          newConfidence = Math.min(oldConfidence * 0.3, 0.2);
          break;
      }
    }

    // Build updated epistemic metadata
    const updatedEpistemic = {
      ...oldEpistemic,
      status: request.new_status,
      confidence: newConfidence,
      requires_human_review: request.new_status === 'DISPUTED', // Re-review disputed
      review_reason: request.new_status === 'DISPUTED'
        ? `Disputed by ${request.reviewer}: ${request.notes || 'No reason provided'}`
        : undefined,
      verification_history: [
        ...(oldEpistemic?.verification_history || []),
        {
          event_type: request.new_status === 'VERIFIED' ? 'VERIFIED' :
                     request.new_status === 'DISPUTED' ? 'DISPUTED' : 'CORROBORATED',
          timestamp: new Date().toISOString(),
          old_status: oldStatus,
          new_status: request.new_status,
          old_confidence: oldConfidence,
          new_confidence: newConfidence,
          reviewer: request.reviewer,
          evidence_added: request.evidence_added,
          notes: request.notes,
        },
      ],
    };

    // If evidence was added, update evidence basis
    if (request.evidence_added && request.evidence_added.length > 0) {
      updatedEpistemic.evidence_basis = {
        ...(oldEpistemic?.evidence_basis || {
          sources_consulted: [],
          sources_not_consulted: [],
          cross_references_performed: false,
          alternative_explanations: [],
          methodology: 'Unknown',
        }),
        sources_consulted: [
          ...(oldEpistemic?.evidence_basis?.sources_consulted || []),
          ...request.evidence_added,
        ],
      };
    }

    // Update the symbol
    const updateResult = this.update({
      symbolId: request.symbolId,
      changes: { epistemic: updatedEpistemic } as unknown as Partial<DirectiveSymbol>,
      change_description: `Status changed to ${request.new_status} by ${request.reviewer}`,
      changed_by: request.reviewer,
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error,
      };
    }

    // Log verification event to database
    this.db.insertVerificationEvent({
      symbolId: request.symbolId,
      eventType: request.new_status === 'VERIFIED' ? 'VERIFIED' :
                request.new_status === 'DISPUTED' ? 'DISPUTED' : 'CORROBORATED',
      oldStatus: oldStatus,
      newStatus: request.new_status,
      oldConfidence: oldConfidence,
      newConfidence: newConfidence,
      reviewer: request.reviewer,
      evidenceAdded: request.evidence_added,
      notes: request.notes,
    });

    // Log to audit
    const auditEventType = request.new_status === 'DISPUTED' ? 'SYMBOL_DISPUTED' : 'SYMBOL_VERIFIED';
    this.db.insertAuditEntry({
      eventType: auditEventType,
      symbolId: request.symbolId,
      details: {
        oldStatus,
        newStatus: request.new_status,
        oldConfidence,
        newConfidence,
        reviewer: request.reviewer,
        notes: request.notes,
      },
    });

    return { success: true };
  }

  /**
   * List symbols that require human review due to epistemic concerns.
   */
  listUnverifiedSymbols(request: {
    claim_type?: string;
    min_confidence?: number;
    max_confidence?: number;
    limit?: number;
    offset?: number;
  }): {
    symbols: Array<{
      symbolId: string;
      category: SymbolCategory;
      commanders_intent: string;
      epistemic_status: string;
      confidence: number;
      review_reason?: string;
      triggered_patterns?: string[];
      created_at: string;
    }>;
    total: number;
    has_more: boolean;
  } {
    const result = this.db.listSymbolsNeedingReview({
      claimType: request.claim_type,
      minConfidence: request.min_confidence,
      maxConfidence: request.max_confidence,
      limit: request.limit || 50,
      offset: request.offset || 0,
    });

    const symbols = result.symbols.map(row => {
      const symbol: DirectiveSymbol = JSON.parse(row.data);
      return {
        symbolId: symbol.symbolId,
        category: symbol.category,
        commanders_intent: symbol.commanders_intent,
        epistemic_status: symbol.epistemic?.status || 'INFERENCE',
        confidence: symbol.epistemic?.confidence ?? 0.5,
        review_reason: symbol.epistemic?.review_reason,
        triggered_patterns: undefined as string[] | undefined, // Would need to re-validate to get these
        created_at: symbol.created_at,
      };
    });

    return {
      symbols,
      total: result.total,
      has_more: (request.offset || 0) + symbols.length < result.total,
    };
  }

  /**
   * Add an alternative explanation to a symbol's evidence basis.
   * This is crucial for preventing false positives in accusatory findings.
   */
  addAlternativeExplanation(request: {
    symbolId: string;
    alternative: string;
    likelihood: number;
    reasoning?: string;
    added_by: string;
  }): { success: boolean; error?: string } {
    // Get existing symbol
    const existing = this.get({ symbolId: request.symbolId });
    if (!existing.found || !existing.symbol) {
      return {
        success: false,
        error: existing.error || `Symbol ${request.symbolId} not found`,
      };
    }

    const oldEpistemic = existing.symbol.epistemic;

    // Build new alternative explanation
    const newAlternative = {
      explanation: request.alternative,
      likelihood: Math.max(0, Math.min(1, request.likelihood)),
      reasoning: request.reasoning,
      investigated: false,
    };

    // Update evidence basis
    const updatedEvidenceBasis = {
      ...(oldEpistemic?.evidence_basis || {
        sources_consulted: [],
        sources_not_consulted: [],
        cross_references_performed: false,
        alternative_explanations: [],
        methodology: 'Unknown',
      }),
      alternative_explanations: [
        ...(oldEpistemic?.evidence_basis?.alternative_explanations || []),
        newAlternative,
      ],
    };

    // Recalculate confidence based on alternative explanations
    // If alternatives have high likelihood, reduce confidence in the original claim
    const totalAlternativeLikelihood = updatedEvidenceBasis.alternative_explanations
      .reduce((sum, alt) => sum + alt.likelihood, 0);
    const confidenceReduction = Math.min(totalAlternativeLikelihood * 0.3, 0.4);
    const newConfidence = Math.max(
      0.1,
      (oldEpistemic?.confidence ?? 0.5) - confidenceReduction
    );

    // Build updated epistemic metadata
    const updatedEpistemic = {
      ...oldEpistemic,
      evidence_basis: updatedEvidenceBasis,
      confidence: newConfidence,
      verification_history: [
        ...(oldEpistemic?.verification_history || []),
        {
          event_type: 'ALTERNATIVE_ADDED' as const,
          timestamp: new Date().toISOString(),
          old_confidence: oldEpistemic?.confidence ?? 0.5,
          new_confidence: newConfidence,
          reviewer: request.added_by,
          notes: `Added alternative: "${request.alternative}" (likelihood: ${request.likelihood})`,
        },
      ],
    };

    // Update the symbol
    const updateResult = this.update({
      symbolId: request.symbolId,
      changes: { epistemic: updatedEpistemic } as unknown as Partial<DirectiveSymbol>,
      change_description: `Alternative explanation added by ${request.added_by}`,
      changed_by: request.added_by,
    });

    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error,
      };
    }

    // Log verification event
    this.db.insertVerificationEvent({
      symbolId: request.symbolId,
      eventType: 'ALTERNATIVE_ADDED',
      oldConfidence: oldEpistemic?.confidence ?? 0.5,
      newConfidence: newConfidence,
      reviewer: request.added_by,
      notes: `Alternative: "${request.alternative}" (likelihood: ${request.likelihood})`,
    });

    return { success: true };
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
