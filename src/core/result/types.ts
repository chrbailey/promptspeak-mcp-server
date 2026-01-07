/**
 * ===============================================================================
 * RESULT TYPE DEFINITIONS
 * ===============================================================================
 *
 * Unified result type for operations that can fail.
 * Replaces inconsistent { success, error?, data? } patterns with a type-safe
 * discriminated union that enables proper type narrowing.
 *
 * Usage:
 *   const result = await someOperation();
 *   if (isSuccess(result)) {
 *     console.log(result.data);  // TypeScript knows data exists
 *   } else {
 *     console.error(result.error.message);  // TypeScript knows error exists
 *   }
 *
 * ===============================================================================
 */

// -----------------------------------------------------------------------------
// RESULT METADATA
// -----------------------------------------------------------------------------

/**
 * Optional metadata attached to any result.
 * Useful for performance tracking, caching, and correlation.
 */
export interface ResultMetadata {
  /** Execution time in milliseconds */
  executionTimeMs?: number;

  /** Whether the result came from cache */
  cacheHit?: boolean;

  /** Number of retry attempts before success/failure */
  retryCount?: number;

  /** Correlation ID for distributed tracing */
  correlationId?: string;

  /** Timestamp when the result was created */
  timestamp?: number;

  /** Additional context-specific metadata */
  context?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// ERROR STRUCTURE
// -----------------------------------------------------------------------------

/**
 * Structured error information for failed operations.
 * Provides consistent error handling across the codebase.
 */
export interface ResultError {
  /** Machine-readable error code (e.g., 'VALIDATION_FAILED', 'NOT_FOUND') */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Additional error details for debugging */
  details?: Record<string, unknown>;

  /** Whether the operation can be retried */
  retryable?: boolean;

  /** Suggested retry delay in milliseconds */
  retryAfterMs?: number;

  /** Stack trace (only in development) */
  stack?: string;

  /** Nested cause error */
  cause?: ResultError;
}

// -----------------------------------------------------------------------------
// SUCCESS TYPE
// -----------------------------------------------------------------------------

/**
 * Represents a successful operation result.
 * The `success: true` literal enables TypeScript type narrowing.
 */
export interface Success<T> {
  /** Discriminant for type narrowing - always true for Success */
  success: true;

  /** The successful result data */
  data: T;

  /** Optional metadata about the operation */
  metadata?: ResultMetadata;
}

// -----------------------------------------------------------------------------
// FAILURE TYPE
// -----------------------------------------------------------------------------

/**
 * Represents a failed operation result.
 * The `success: false` literal enables TypeScript type narrowing.
 */
export interface Failure {
  /** Discriminant for type narrowing - always false for Failure */
  success: false;

  /** Structured error information */
  error: ResultError;

  /** Optional metadata about the operation */
  metadata?: ResultMetadata;
}

// -----------------------------------------------------------------------------
// RESULT UNION TYPE
// -----------------------------------------------------------------------------

/**
 * Unified result type representing either success or failure.
 *
 * This is a discriminated union on the `success` property, enabling
 * TypeScript to narrow the type correctly:
 *
 * ```typescript
 * function handle(result: Result<User>): void {
 *   if (result.success) {
 *     // TypeScript knows: result is Success<User>
 *     console.log(result.data.name);
 *   } else {
 *     // TypeScript knows: result is Failure
 *     console.error(result.error.message);
 *   }
 * }
 * ```
 */
export type Result<T> = Success<T> | Failure;

// -----------------------------------------------------------------------------
// BATCH RESULT TYPES
// -----------------------------------------------------------------------------

/**
 * Result entry for batch operations.
 * Associates a key with its result for tracking individual items.
 */
export interface BatchResultEntry<T> {
  /** Unique key identifying this item in the batch */
  key: string;

  /** The result for this item */
  result: Result<T>;
}

/**
 * Summary statistics for batch operations.
 */
export interface BatchSummary {
  /** Total number of items processed */
  total: number;

  /** Number of successful operations */
  succeeded: number;

  /** Number of failed operations */
  failed: number;

  /** Total execution time in milliseconds */
  executionTimeMs: number;

  /** Average execution time per item */
  averageTimePerItemMs?: number;

  /** Timestamp when batch started */
  startedAt?: number;

  /** Timestamp when batch completed */
  completedAt?: number;
}

/**
 * Result type for batch operations.
 * Contains individual results keyed by identifier plus summary statistics.
 */
export interface BatchResult<T> {
  /** Individual results for each item in the batch */
  results: Array<BatchResultEntry<T>>;

  /** Summary statistics for the batch operation */
  summary: BatchSummary;

  /** Whether all operations succeeded */
  allSucceeded: boolean;

  /** Whether all operations failed */
  allFailed: boolean;

  /** List of keys that failed (for easy error handling) */
  failedKeys: string[];

  /** List of keys that succeeded (for easy result extraction) */
  succeededKeys: string[];
}

// -----------------------------------------------------------------------------
// ASYNC RESULT TYPES
// -----------------------------------------------------------------------------

/**
 * Promise that resolves to a Result.
 * Convenience type for async operations.
 */
export type AsyncResult<T> = Promise<Result<T>>;

/**
 * Promise that resolves to a BatchResult.
 * Convenience type for async batch operations.
 */
export type AsyncBatchResult<T> = Promise<BatchResult<T>>;

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY TYPES
// -----------------------------------------------------------------------------

/**
 * Legacy result format found in existing codebase.
 * Used for migration utilities.
 *
 * @deprecated Use Result<T> instead
 */
export interface LegacyResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
  [key: string]: unknown;
}
