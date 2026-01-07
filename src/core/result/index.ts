/**
 * ===============================================================================
 * RESULT MODULE - UNIFIED RESULT PATTERN
 * ===============================================================================
 *
 * This module provides a type-safe Result<T> pattern for operations that can fail.
 * It replaces inconsistent { success, error?, data? } patterns throughout the
 * codebase with a properly typed discriminated union.
 *
 * Key Features:
 * - Type-safe success/failure discrimination via `success` discriminant
 * - Fluent builders for creating results
 * - Type guards for narrowing (isSuccess, isFailure)
 * - Utility functions for unwrapping, mapping, and chaining
 * - Batch operation support with timing and summary statistics
 * - Legacy compatibility for gradual migration
 *
 * Usage:
 * ```typescript
 * import { success, failure, isSuccess, Result } from './core/result/index.js';
 *
 * async function fetchUser(id: string): Promise<Result<User>> {
 *   try {
 *     const user = await db.findUser(id);
 *     if (!user) {
 *       return failure('NOT_FOUND', `User ${id} not found`);
 *     }
 *     return success(user);
 *   } catch (err) {
 *     return fromError(err, 'FETCH_FAILED');
 *   }
 * }
 *
 * // Usage
 * const result = await fetchUser('123');
 * if (isSuccess(result)) {
 *   console.log(result.data.name);  // TypeScript knows data exists
 * } else {
 *   console.error(result.error.message);  // TypeScript knows error exists
 * }
 * ```
 *
 * ===============================================================================
 */

// -----------------------------------------------------------------------------
// TYPE EXPORTS
// -----------------------------------------------------------------------------

export type {
  // Core result types
  Result,
  Success,
  Failure,
  ResultMetadata,
  ResultError,

  // Batch types
  BatchResult,
  BatchResultEntry,
  BatchSummary,

  // Async convenience types
  AsyncResult,
  AsyncBatchResult,

  // Legacy compatibility
  LegacyResult,
} from './types.js';

// -----------------------------------------------------------------------------
// BUILDER EXPORTS
// -----------------------------------------------------------------------------

export {
  // Result constructors
  success,
  failure,
  fromError,
  fromPromise,
  fromThrowable,

  // Type guards
  isSuccess,
  isFailure,
  isRetryable,

  // Unwrap utilities
  unwrap,
  unwrapOr,
  unwrapOrElse,
  unwrapError,
  UnwrapError,

  // Transformation utilities
  map,
  mapError,
  flatMap,
  flatMapAsync,
  match,

  // Combination utilities
  all,
  partition,

  // Legacy compatibility
  fromLegacy,
  toLegacy,
} from './builders.js';

// -----------------------------------------------------------------------------
// BATCH EXPORTS
// -----------------------------------------------------------------------------

export {
  // Batch creation
  createBatchResult,

  // Batch execution
  runBatch,
  runBatchSync,

  // Batch utilities
  extractSuccesses,
  extractFailures,
  getResultByKey,
  toResultMap,
  filterByKeys,
  mergeBatchResults,
  retryFailed,

  // Fluent builder
  batchBuilder,
  BatchBuilder,
} from './batch.js';

export type { BatchExecutionOptions } from './batch.js';
