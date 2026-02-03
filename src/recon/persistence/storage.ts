/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON SYMBOL STORAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Persistence layer for Marine Recon symbols. Handles saving, loading, listing,
 * and deleting symbols from the filesystem.
 *
 * Features:
 * - Atomic writes to prevent corruption
 * - File locking for concurrent access safety
 * - Automatic backup creation
 * - Symbol validation on load
 * - Optional in-memory caching
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { constants as fsConstants } from 'fs';
import { MarineReconSymbol } from '../types';
import { serializeSymbol, deserializeSymbol } from '../symbol/schema';
import {
  SymbolSummary,
  StorageOptions,
  StorageError,
  StorageErrorCode,
  ListOptions,
  ListResult,
  SymbolFilter,
  SymbolSort,
  StorageEvent,
  StorageEventPayload,
  StorageEventListener,
  DEFAULT_STORAGE_OPTIONS,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// FILE LOCKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple file lock implementation using lock files.
 */
class FileLock {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire a lock for a file path.
   */
  async acquire(filePath: string, timeoutMs: number): Promise<() => Promise<void>> {
    const lockPath = `${filePath}.lock`;
    const startTime = Date.now();

    // Wait for existing lock
    while (this.locks.has(filePath)) {
      if (Date.now() - startTime > timeoutMs) {
        throw StorageError.lockTimeout(filePath);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Create lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    this.locks.set(filePath, lockPromise);

    // Try to create lock file
    try {
      await fs.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
    } catch (err) {
      // Lock file exists - check if stale (older than timeout)
      try {
        const lockContent = await fs.readFile(lockPath, 'utf-8');
        const lockTime = parseInt(lockContent, 10);
        if (Date.now() - lockTime > timeoutMs) {
          // Stale lock - remove and try again
          await fs.unlink(lockPath);
          await fs.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
        } else {
          // Active lock - wait and retry
          this.locks.delete(filePath);
          releaseLock!();
          return this.acquire(filePath, timeoutMs - (Date.now() - startTime));
        }
      } catch {
        // Ignore errors, proceed with operation
      }
    }

    // Return release function
    return async () => {
      try {
        await fs.unlink(lockPath);
      } catch {
        // Ignore unlock errors
      }
      this.locks.delete(filePath);
      releaseLock!();
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LRU CACHE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple LRU cache for symbols.
 */
class LRUCache<T> {
  private cache: Map<string, T> = new Map();

  constructor(private maxSize: number) {}

  get(key: string): T | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: T): void {
    // Remove if exists (to update position)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, value);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECON SYMBOL STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Storage class for persisting Marine Recon symbols to the filesystem.
 */
export class ReconSymbolStorage {
  private readonly basePath: string;
  private readonly options: Required<StorageOptions>;
  private readonly fileLock: FileLock;
  private readonly cache: LRUCache<MarineReconSymbol> | null;
  private readonly eventListeners: Map<StorageEvent, Set<StorageEventListener>> = new Map();
  private initialized: boolean = false;

  /**
   * Create a new ReconSymbolStorage instance.
   *
   * @param basePath - Base directory for storing symbol files
   * @param options - Storage configuration options
   */
  constructor(basePath: string, options: StorageOptions = {}) {
    this.basePath = path.resolve(basePath);
    this.options = { ...DEFAULT_STORAGE_OPTIONS, ...options };
    this.fileLock = new FileLock();
    this.cache = this.options.enableCache
      ? new LRUCache<MarineReconSymbol>(this.options.cacheMaxSize)
      : null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the storage, creating the directory if needed.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.access(this.basePath, fsConstants.R_OK | fsConstants.W_OK);
    } catch {
      if (this.options.createIfMissing) {
        await fs.mkdir(this.basePath, { recursive: true });
      } else {
        throw new StorageError(
          StorageErrorCode.DIRECTORY_NOT_FOUND,
          `Storage directory not found: ${this.basePath}`
        );
      }
    }

    // Create backups subdirectory if backups enabled
    if (this.options.maxBackups > 0) {
      const backupsPath = path.join(this.basePath, '.backups');
      await fs.mkdir(backupsPath, { recursive: true });
    }

    this.initialized = true;
  }

  /**
   * Ensure storage is initialized before operations.
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save a symbol to storage.
   *
   * @param symbol - The MarineReconSymbol to save
   * @throws StorageError if save fails
   */
  async save(symbol: MarineReconSymbol): Promise<void> {
    await this.ensureInitialized();

    const fileName = this.symbolIdToFileName(symbol.symbol_id);
    const filePath = path.join(this.basePath, fileName);

    // Acquire lock
    const releaseLock = await this.fileLock.acquire(filePath, this.options.lockTimeoutMs);

    try {
      // Create backup if file exists and backups enabled
      if (this.options.maxBackups > 0) {
        try {
          await fs.access(filePath);
          await this.createBackup(symbol.symbol_id, filePath);
        } catch {
          // File doesn't exist, no backup needed
        }
      }

      // Serialize symbol
      let content: string;
      try {
        content = this.options.prettyPrint
          ? serializeSymbol(symbol)
          : JSON.stringify(symbol);
      } catch (err) {
        throw StorageError.serializationError(symbol.symbol_id, err as Error);
      }

      // Write to file (atomic or direct)
      if (this.options.atomicWrites) {
        await this.atomicWrite(filePath, content);
      } else {
        await fs.writeFile(filePath, content, 'utf-8');
      }

      // Update cache
      if (this.cache) {
        this.cache.set(symbol.symbol_id, symbol);
      }

      // Emit event
      this.emitEvent(StorageEvent.SYMBOL_SAVED, symbol.symbol_id, {
        version: symbol.version,
        filePath,
      });
    } finally {
      await releaseLock();
    }
  }

  /**
   * Load a symbol from storage.
   *
   * @param symbolId - The symbol ID to load
   * @returns The loaded symbol or null if not found
   * @throws StorageError if load fails (other than not found)
   */
  async load(symbolId: string): Promise<MarineReconSymbol | null> {
    await this.ensureInitialized();

    // Check cache first
    if (this.cache) {
      const cached = this.cache.get(symbolId);
      if (cached) {
        this.emitEvent(StorageEvent.CACHE_HIT, symbolId);
        return cached;
      }
      this.emitEvent(StorageEvent.CACHE_MISS, symbolId);
    }

    const fileName = this.symbolIdToFileName(symbolId);
    const filePath = path.join(this.basePath, fileName);

    // Acquire lock
    const releaseLock = await this.fileLock.acquire(filePath, this.options.lockTimeoutMs);

    try {
      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return null;
        }
        throw StorageError.fsError('read', filePath, err as Error);
      }

      // Deserialize symbol
      let symbol: MarineReconSymbol;
      try {
        symbol = deserializeSymbol(content);
      } catch (err) {
        throw StorageError.serializationError(symbolId, err as Error);
      }

      // Validate if enabled
      if (this.options.validateOnLoad) {
        this.validateSymbol(symbol);
      }

      // Update cache
      if (this.cache) {
        this.cache.set(symbolId, symbol);
      }

      // Emit event
      this.emitEvent(StorageEvent.SYMBOL_LOADED, symbolId, {
        version: symbol.version,
      });

      return symbol;
    } finally {
      await releaseLock();
    }
  }

  /**
   * List all symbols in storage with optional filtering and pagination.
   *
   * @param options - List options (filter, sort, pagination)
   * @returns List result with symbols and metadata
   */
  async list(options: ListOptions = {}): Promise<ListResult> {
    await this.ensureInitialized();

    // Read all symbol files
    const files = await fs.readdir(this.basePath);
    const symbolFiles = files.filter(f => f.endsWith(this.options.fileExtension));

    // Load summaries
    const summaries: SymbolSummary[] = [];
    for (const fileName of symbolFiles) {
      const filePath = path.join(this.basePath, fileName);
      try {
        const summary = await this.loadSummary(filePath);
        if (summary && this.matchesFilter(summary, options.filter)) {
          summaries.push(summary);
        }
      } catch {
        // Skip invalid files
        continue;
      }
    }

    // Sort
    const sorted = this.sortSummaries(summaries, options.sort);

    // Paginate
    const pagination = options.pagination || { limit: 100, offset: 0 };
    const total = sorted.length;
    const paginated = sorted.slice(
      pagination.offset,
      pagination.offset + pagination.limit
    );

    return {
      symbols: paginated,
      total,
      hasMore: pagination.offset + pagination.limit < total,
      offset: pagination.offset,
      limit: pagination.limit,
    };
  }

  /**
   * Delete a symbol from storage.
   *
   * @param symbolId - The symbol ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(symbolId: string): Promise<boolean> {
    await this.ensureInitialized();

    const fileName = this.symbolIdToFileName(symbolId);
    const filePath = path.join(this.basePath, fileName);

    // Acquire lock
    const releaseLock = await this.fileLock.acquire(filePath, this.options.lockTimeoutMs);

    try {
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw StorageError.fsError('delete', filePath, err as Error);
      }

      // Remove from cache
      if (this.cache) {
        this.cache.delete(symbolId);
      }

      // Emit event
      this.emitEvent(StorageEvent.SYMBOL_DELETED, symbolId);

      return true;
    } finally {
      await releaseLock();
    }
  }

  /**
   * Check if a symbol exists in storage.
   *
   * @param symbolId - The symbol ID to check
   * @returns true if exists, false otherwise
   */
  async exists(symbolId: string): Promise<boolean> {
    await this.ensureInitialized();

    // Check cache first
    if (this.cache && this.cache.has(symbolId)) {
      return true;
    }

    const fileName = this.symbolIdToFileName(symbolId);
    const filePath = path.join(this.basePath, fileName);

    try {
      await fs.access(filePath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVANCED OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save a symbol only if it doesn't already exist.
   *
   * @param symbol - The symbol to save
   * @throws StorageError.ALREADY_EXISTS if symbol exists
   */
  async saveIfNotExists(symbol: MarineReconSymbol): Promise<void> {
    if (await this.exists(symbol.symbol_id)) {
      throw StorageError.alreadyExists(symbol.symbol_id);
    }
    await this.save(symbol);
  }

  /**
   * Update a symbol with optimistic locking (version check).
   *
   * @param symbol - The symbol to update
   * @param expectedVersion - Expected current version
   * @throws StorageError.VERSION_CONFLICT if versions don't match
   */
  async updateWithVersionCheck(
    symbol: MarineReconSymbol,
    expectedVersion: number
  ): Promise<void> {
    const existing = await this.load(symbol.symbol_id);
    if (!existing) {
      throw StorageError.notFound(symbol.symbol_id);
    }
    if (existing.version !== expectedVersion) {
      throw StorageError.versionConflict(
        symbol.symbol_id,
        expectedVersion,
        existing.version
      );
    }
    await this.save(symbol);
  }

  /**
   * Get symbol count matching optional filter.
   */
  async count(filter?: SymbolFilter): Promise<number> {
    const result = await this.list({ filter, pagination: { limit: 0, offset: 0 } });
    return result.total;
  }

  /**
   * Clear all symbols from storage.
   * USE WITH CAUTION!
   */
  async clear(): Promise<number> {
    await this.ensureInitialized();

    const files = await fs.readdir(this.basePath);
    const symbolFiles = files.filter(f => f.endsWith(this.options.fileExtension));

    let deleted = 0;
    for (const fileName of symbolFiles) {
      const filePath = path.join(this.basePath, fileName);
      try {
        await fs.unlink(filePath);
        deleted++;
      } catch {
        // Continue on errors
      }
    }

    // Clear cache
    if (this.cache) {
      this.cache.clear();
    }

    return deleted;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to storage events.
   */
  on(event: StorageEvent, listener: StorageEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Unsubscribe from storage events.
   */
  off(event: StorageEvent, listener: StorageEventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * Emit a storage event.
   */
  private emitEvent(
    event: StorageEvent,
    symbolId?: string,
    details?: Record<string, unknown>
  ): void {
    const payload: StorageEventPayload = {
      event,
      symbolId,
      timestamp: new Date().toISOString(),
      details,
    };

    this.eventListeners.get(event)?.forEach(listener => {
      try {
        listener(payload);
      } catch {
        // Ignore listener errors
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Convert a symbol ID to a safe file name.
   */
  private symbolIdToFileName(symbolId: string): string {
    // Replace problematic characters
    // Ξ.RECON.CUSTOMER_SERVICE_001 -> XI_RECON_CUSTOMER_SERVICE_001.json
    const safeName = symbolId
      .replace(/^Ξ\./, 'XI_')
      .replace(/\./g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 255 - this.options.fileExtension.length);

    return `${safeName}${this.options.fileExtension}`;
  }

  /**
   * Extract symbol ID from file name.
   */
  private fileNameToSymbolId(fileName: string): string {
    // XI_RECON_CUSTOMER_SERVICE_001.json -> Ξ.RECON.CUSTOMER_SERVICE_001
    const baseName = fileName.replace(this.options.fileExtension, '');

    // Attempt to reconstruct original ID
    if (baseName.startsWith('XI_RECON_')) {
      const parts = baseName.split('_');
      // XI_RECON_rest -> Ξ.RECON.rest
      return `Ξ.RECON.${parts.slice(2).join('_')}`;
    }

    return baseName;
  }

  /**
   * Perform an atomic write operation.
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, content, 'utf-8');

      // Sync to disk
      const fd = await fs.open(tempPath, 'r');
      await fd.sync();
      await fd.close();

      // Atomic rename
      await fs.rename(tempPath, filePath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw StorageError.fsError('write', filePath, err as Error);
    }
  }

  /**
   * Create a backup of a symbol file.
   */
  private async createBackup(symbolId: string, filePath: string): Promise<void> {
    const backupsPath = path.join(this.basePath, '.backups');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${this.symbolIdToFileName(symbolId)}.${timestamp}`;
    const backupPath = path.join(backupsPath, backupName);

    try {
      await fs.copyFile(filePath, backupPath);
      this.emitEvent(StorageEvent.SYMBOL_BACKED_UP, symbolId, { backupPath });

      // Clean old backups
      await this.cleanOldBackups(symbolId);
    } catch {
      // Backup failure is not fatal
    }
  }

  /**
   * Clean old backups beyond the maximum count.
   */
  private async cleanOldBackups(symbolId: string): Promise<void> {
    const backupsPath = path.join(this.basePath, '.backups');
    const prefix = this.symbolIdToFileName(symbolId);

    try {
      const files = await fs.readdir(backupsPath);
      const symbolBackups = files
        .filter(f => f.startsWith(prefix))
        .sort()
        .reverse();

      // Remove backups beyond max
      const toDelete = symbolBackups.slice(this.options.maxBackups);
      for (const fileName of toDelete) {
        await fs.unlink(path.join(backupsPath, fileName));
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Load a symbol summary from a file.
   */
  private async loadSummary(filePath: string): Promise<SymbolSummary | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const symbol = JSON.parse(content) as MarineReconSymbol;
      const stats = await fs.stat(filePath);

      return {
        id: symbol.symbol_id,
        status: symbol.state.engagement.status,
        alert_level: symbol.state.engagement.alert_level,
        created_at: symbol.created_at,
        updated_at: symbol.updated_at,
        message_count: symbol.state.engagement.conversation.message_count,
        version: symbol.version,
        target_organization: symbol.mission.target.organization,
        primary_goal: symbol.mission.objective.primary_goal,
        tags: symbol.tags,
        namespace: symbol.namespace,
        file_path: filePath,
        file_size: stats.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a summary matches filter criteria.
   */
  private matchesFilter(summary: SymbolSummary, filter?: SymbolFilter): boolean {
    if (!filter) {
      return true;
    }

    // Status filter
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      if (!statuses.includes(summary.status)) {
        return false;
      }
    }

    // Alert level filter
    if (filter.alertLevel) {
      const levels = Array.isArray(filter.alertLevel)
        ? filter.alertLevel
        : [filter.alertLevel];
      if (!levels.includes(summary.alert_level)) {
        return false;
      }
    }

    // Namespace filter
    if (filter.namespace && summary.namespace !== filter.namespace) {
      return false;
    }

    // Tags filter (any match)
    if (filter.tags && filter.tags.length > 0) {
      if (!summary.tags || !filter.tags.some(t => summary.tags!.includes(t))) {
        return false;
      }
    }

    // Date filters
    if (filter.createdAfter) {
      const after = new Date(filter.createdAfter);
      if (new Date(summary.created_at) < after) {
        return false;
      }
    }

    if (filter.createdBefore) {
      const before = new Date(filter.createdBefore);
      if (new Date(summary.created_at) > before) {
        return false;
      }
    }

    if (filter.updatedAfter && summary.updated_at) {
      const after = new Date(filter.updatedAfter);
      if (new Date(summary.updated_at) < after) {
        return false;
      }
    }

    if (filter.updatedBefore && summary.updated_at) {
      const before = new Date(filter.updatedBefore);
      if (new Date(summary.updated_at) > before) {
        return false;
      }
    }

    // Goal contains filter
    if (filter.goalContains) {
      const searchTerm = filter.goalContains.toLowerCase();
      if (!summary.primary_goal.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    // Target organization filter
    if (filter.targetOrganization) {
      if (summary.target_organization !== filter.targetOrganization) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sort summaries by specified field.
   */
  private sortSummaries(
    summaries: SymbolSummary[],
    sort?: SymbolSort
  ): SymbolSummary[] {
    if (!sort) {
      // Default sort by created_at descending
      return summaries.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    const { field, direction } = sort;
    const multiplier = direction === 'asc' ? 1 : -1;

    return summaries.sort((a, b) => {
      let aVal: string | number | Date;
      let bVal: string | number | Date;

      switch (field) {
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          aVal = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          bVal = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'message_count':
          aVal = a.message_count;
          bVal = b.message_count;
          break;
        case 'version':
          aVal = a.version;
          bVal = b.version;
          break;
        case 'id':
          aVal = a.id;
          bVal = b.id;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });
  }

  /**
   * Validate a symbol's basic structure.
   */
  private validateSymbol(symbol: MarineReconSymbol): void {
    if (!symbol.symbol_id) {
      throw StorageError.invalidSymbol('unknown', 'Missing symbol_id');
    }
    if (symbol.symbol_type !== 'RECON') {
      throw StorageError.invalidSymbol(
        symbol.symbol_id,
        `Invalid symbol_type: expected RECON, got ${symbol.symbol_type}`
      );
    }
    if (!symbol.mission) {
      throw StorageError.invalidSymbol(symbol.symbol_id, 'Missing mission');
    }
    if (!symbol.config) {
      throw StorageError.invalidSymbol(symbol.symbol_id, 'Missing config');
    }
    if (!symbol.state) {
      throw StorageError.invalidSymbol(symbol.symbol_id, 'Missing state');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the base storage path.
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Get the current storage options.
   */
  getOptions(): Readonly<Required<StorageOptions>> {
    return { ...this.options };
  }

  /**
   * Check if storage is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
