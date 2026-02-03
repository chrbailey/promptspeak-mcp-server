/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON PERSISTENCE TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for the Marine Recon symbol persistence layer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ReconMissionStatus, AlertLevel } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A lightweight summary of a stored symbol for listing operations.
 * Contains just enough information to identify and filter symbols
 * without loading the full symbol data.
 */
export interface SymbolSummary {
  /** The symbol ID (e.g., "Ξ.RECON.CUSTOMER_SERVICE_001") */
  id: string;

  /** Current mission status */
  status: ReconMissionStatus;

  /** Current alert level */
  alert_level: AlertLevel;

  /** ISO 8601 timestamp when the symbol was created */
  created_at: string;

  /** ISO 8601 timestamp when the symbol was last updated */
  updated_at?: string;

  /** Total number of messages in the conversation */
  message_count: number;

  /** Symbol version number */
  version: number;

  /** Target organization (if known) */
  target_organization?: string;

  /** Primary goal summary */
  primary_goal: string;

  /** Associated tags */
  tags?: string[];

  /** Namespace for isolation */
  namespace?: string;

  /** File path where the symbol is stored */
  file_path: string;

  /** File size in bytes */
  file_size: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE OPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for configuring the ReconSymbolStorage.
 */
export interface StorageOptions {
  /**
   * Whether to create the storage directory if it doesn't exist.
   * @default true
   */
  createIfMissing?: boolean;

  /**
   * Whether to use atomic writes (write to temp file, then rename).
   * This prevents corruption from partial writes.
   * @default true
   */
  atomicWrites?: boolean;

  /**
   * Whether to pretty-print JSON (for readability) or minify (for space).
   * @default true
   */
  prettyPrint?: boolean;

  /**
   * File extension for symbol files.
   * @default '.json'
   */
  fileExtension?: string;

  /**
   * Maximum number of backup versions to keep per symbol.
   * Set to 0 to disable backups.
   * @default 3
   */
  maxBackups?: number;

  /**
   * Whether to validate symbols on load.
   * @default true
   */
  validateOnLoad?: boolean;

  /**
   * Lock timeout in milliseconds for file operations.
   * @default 5000
   */
  lockTimeoutMs?: number;

  /**
   * Whether to cache symbols in memory for faster repeated access.
   * @default false
   */
  enableCache?: boolean;

  /**
   * Maximum number of symbols to keep in cache.
   * @default 100
   */
  cacheMaxSize?: number;
}

/**
 * Default storage options.
 */
export const DEFAULT_STORAGE_OPTIONS: Required<StorageOptions> = {
  createIfMissing: true,
  atomicWrites: true,
  prettyPrint: true,
  fileExtension: '.json',
  maxBackups: 3,
  validateOnLoad: true,
  lockTimeoutMs: 5000,
  enableCache: false,
  cacheMaxSize: 100,
};

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error codes for storage operations.
 */
export enum StorageErrorCode {
  /** Symbol not found */
  NOT_FOUND = 'NOT_FOUND',

  /** Symbol already exists (for create operations) */
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  /** Invalid symbol data */
  INVALID_SYMBOL = 'INVALID_SYMBOL',

  /** File system error */
  FS_ERROR = 'FS_ERROR',

  /** Permission denied */
  PERMISSION_DENIED = 'PERMISSION_DENIED',

  /** Lock acquisition failed */
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',

  /** Storage directory not found */
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',

  /** Serialization/deserialization error */
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',

  /** Version conflict */
  VERSION_CONFLICT = 'VERSION_CONFLICT',

  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class for storage operations.
 */
export class StorageError extends Error {
  constructor(
    public readonly code: StorageErrorCode,
    message: string,
    public readonly symbolId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StorageError);
    }
  }

  /**
   * Create a NOT_FOUND error.
   */
  static notFound(symbolId: string): StorageError {
    return new StorageError(
      StorageErrorCode.NOT_FOUND,
      `Symbol not found: ${symbolId}`,
      symbolId
    );
  }

  /**
   * Create an ALREADY_EXISTS error.
   */
  static alreadyExists(symbolId: string): StorageError {
    return new StorageError(
      StorageErrorCode.ALREADY_EXISTS,
      `Symbol already exists: ${symbolId}`,
      symbolId
    );
  }

  /**
   * Create an INVALID_SYMBOL error.
   */
  static invalidSymbol(symbolId: string, reason: string): StorageError {
    return new StorageError(
      StorageErrorCode.INVALID_SYMBOL,
      `Invalid symbol ${symbolId}: ${reason}`,
      symbolId
    );
  }

  /**
   * Create a FS_ERROR error.
   */
  static fsError(operation: string, path: string, cause?: Error): StorageError {
    return new StorageError(
      StorageErrorCode.FS_ERROR,
      `File system error during ${operation}: ${path}`,
      undefined,
      cause
    );
  }

  /**
   * Create a LOCK_TIMEOUT error.
   */
  static lockTimeout(symbolId: string): StorageError {
    return new StorageError(
      StorageErrorCode.LOCK_TIMEOUT,
      `Failed to acquire lock for symbol: ${symbolId}`,
      symbolId
    );
  }

  /**
   * Create a SERIALIZATION_ERROR error.
   */
  static serializationError(symbolId: string, cause?: Error): StorageError {
    return new StorageError(
      StorageErrorCode.SERIALIZATION_ERROR,
      `Failed to serialize/deserialize symbol: ${symbolId}`,
      symbolId,
      cause
    );
  }

  /**
   * Create a VERSION_CONFLICT error.
   */
  static versionConflict(symbolId: string, expected: number, actual: number): StorageError {
    return new StorageError(
      StorageErrorCode.VERSION_CONFLICT,
      `Version conflict for ${symbolId}: expected ${expected}, found ${actual}`,
      symbolId
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER AND QUERY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter criteria for listing symbols.
 */
export interface SymbolFilter {
  /** Filter by status */
  status?: ReconMissionStatus | ReconMissionStatus[];

  /** Filter by alert level */
  alertLevel?: AlertLevel | AlertLevel[];

  /** Filter by namespace */
  namespace?: string;

  /** Filter by tags (any match) */
  tags?: string[];

  /** Filter by creation date range */
  createdAfter?: Date | string;
  createdBefore?: Date | string;

  /** Filter by update date range */
  updatedAfter?: Date | string;
  updatedBefore?: Date | string;

  /** Search in primary goal */
  goalContains?: string;

  /** Filter by target organization */
  targetOrganization?: string;
}

/**
 * Sort options for listing symbols.
 */
export interface SymbolSort {
  /** Field to sort by */
  field: 'created_at' | 'updated_at' | 'status' | 'message_count' | 'version' | 'id';

  /** Sort direction */
  direction: 'asc' | 'desc';
}

/**
 * Pagination options for listing symbols.
 */
export interface SymbolPagination {
  /** Number of items per page */
  limit: number;

  /** Number of items to skip */
  offset: number;
}

/**
 * Complete query options for listing symbols.
 */
export interface ListOptions {
  /** Filter criteria */
  filter?: SymbolFilter;

  /** Sort options */
  sort?: SymbolSort;

  /** Pagination options */
  pagination?: SymbolPagination;
}

/**
 * Result of a list operation with pagination metadata.
 */
export interface ListResult {
  /** Symbol summaries matching the query */
  symbols: SymbolSummary[];

  /** Total number of symbols matching the filter (before pagination) */
  total: number;

  /** Whether there are more results */
  hasMore: boolean;

  /** Current offset */
  offset: number;

  /** Current limit */
  limit: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STORAGE EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events emitted by the storage layer.
 */
export enum StorageEvent {
  SYMBOL_SAVED = 'symbol:saved',
  SYMBOL_LOADED = 'symbol:loaded',
  SYMBOL_DELETED = 'symbol:deleted',
  SYMBOL_BACKED_UP = 'symbol:backed_up',
  STORAGE_ERROR = 'storage:error',
  CACHE_HIT = 'cache:hit',
  CACHE_MISS = 'cache:miss',
}

/**
 * Payload for storage events.
 */
export interface StorageEventPayload {
  event: StorageEvent;
  symbolId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Event listener type.
 */
export type StorageEventListener = (payload: StorageEventPayload) => void;
