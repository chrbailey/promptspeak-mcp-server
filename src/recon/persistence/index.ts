/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON PERSISTENCE MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Persistence layer for Marine Recon symbols. This module provides filesystem-based
 * storage for MarineReconSymbol objects with features including:
 *
 * - Atomic writes to prevent corruption
 * - File locking for concurrent access safety
 * - Automatic backup creation
 * - Symbol validation on load
 * - Flexible filtering and pagination for listing
 * - Optional in-memory caching
 *
 * @example Basic Usage
 * ```typescript
 * import { ReconSymbolStorage } from './persistence';
 *
 * const storage = new ReconSymbolStorage('/path/to/symbols');
 * await storage.initialize();
 *
 * // Save a symbol
 * await storage.save(mySymbol);
 *
 * // Load a symbol
 * const symbol = await storage.load('Ξ.RECON.MY_MISSION');
 *
 * // List all symbols
 * const result = await storage.list();
 * console.log(result.symbols);
 *
 * // Delete a symbol
 * await storage.delete('Ξ.RECON.MY_MISSION');
 * ```
 *
 * @example With Options
 * ```typescript
 * const storage = new ReconSymbolStorage('/path/to/symbols', {
 *   atomicWrites: true,
 *   maxBackups: 5,
 *   enableCache: true,
 *   cacheMaxSize: 50,
 * });
 * ```
 *
 * @example Filtering and Pagination
 * ```typescript
 * const result = await storage.list({
 *   filter: {
 *     status: ['active', 'paused'],
 *     namespace: 'production',
 *     createdAfter: '2025-01-01',
 *   },
 *   sort: {
 *     field: 'created_at',
 *     direction: 'desc',
 *   },
 *   pagination: {
 *     limit: 10,
 *     offset: 0,
 *   },
 * });
 * ```
 *
 * @example Event Handling
 * ```typescript
 * storage.on(StorageEvent.SYMBOL_SAVED, (payload) => {
 *   console.log(`Symbol saved: ${payload.symbolId}`);
 * });
 *
 * storage.on(StorageEvent.STORAGE_ERROR, (payload) => {
 *   console.error('Storage error:', payload.details);
 * });
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// Main storage class
export { ReconSymbolStorage } from './storage';

// Types
export {
  // Summary and options
  SymbolSummary,
  StorageOptions,
  DEFAULT_STORAGE_OPTIONS,

  // Error handling
  StorageError,
  StorageErrorCode,

  // Filtering and querying
  SymbolFilter,
  SymbolSort,
  SymbolPagination,
  ListOptions,
  ListResult,

  // Events
  StorageEvent,
  StorageEventPayload,
  StorageEventListener,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

import { ReconSymbolStorage } from './storage';
import { StorageOptions } from './types';

/**
 * Create and initialize a ReconSymbolStorage instance.
 * This is a convenience function that handles initialization.
 *
 * @param basePath - Base directory for storing symbol files
 * @param options - Storage configuration options
 * @returns Initialized storage instance
 *
 * @example
 * ```typescript
 * const storage = await createStorage('/path/to/symbols');
 * // Storage is ready to use immediately
 * ```
 */
export async function createStorage(
  basePath: string,
  options?: StorageOptions
): Promise<ReconSymbolStorage> {
  const storage = new ReconSymbolStorage(basePath, options);
  await storage.initialize();
  return storage;
}

/**
 * Default storage location relative to the project.
 * Used when no explicit path is provided.
 */
export const DEFAULT_STORAGE_PATH = '.recon-symbols';
