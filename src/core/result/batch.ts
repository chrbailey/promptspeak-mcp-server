/**
 * ===============================================================================
 * BATCH OPERATION UTILITIES
 * ===============================================================================
 *
 * Utilities for running batch operations that return Results.
 * Provides consistent handling of multiple operations with timing
 * metadata and summary statistics.
 *
 * ===============================================================================
 */

import type {
  Result,
  BatchResult,
  BatchResultEntry,
  BatchSummary,
} from './types.js';
import { isSuccess, isFailure, success } from './builders.js';

// -----------------------------------------------------------------------------
// BATCH RESULT CREATION
// -----------------------------------------------------------------------------

/**
 * Creates a BatchResult from an array of keyed results.
 *
 * @param results - Array of keyed results
 * @param startTime - Start timestamp for calculating execution time
 * @returns A complete BatchResult with summary statistics
 *
 * @example
 * ```typescript
 * const startTime = Date.now();
 * const results = items.map(item => ({
 *   key: item.id,
 *   result: processItem(item)
 * }));
 * const batchResult = createBatchResult(results, startTime);
 * ```
 */
export function createBatchResult<T>(
  results: Array<BatchResultEntry<T>>,
  startTime: number
): BatchResult<T> {
  const endTime = Date.now();
  const executionTimeMs = endTime - startTime;

  const succeeded = results.filter(r => isSuccess(r.result));
  const failed = results.filter(r => isFailure(r.result));

  const summary: BatchSummary = {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    executionTimeMs,
    averageTimePerItemMs: results.length > 0 ? executionTimeMs / results.length : 0,
    startedAt: startTime,
    completedAt: endTime,
  };

  return {
    results,
    summary,
    allSucceeded: failed.length === 0 && results.length > 0,
    allFailed: succeeded.length === 0 && results.length > 0,
    failedKeys: failed.map(r => r.key),
    succeededKeys: succeeded.map(r => r.key),
  };
}

// -----------------------------------------------------------------------------
// BATCH EXECUTION
// -----------------------------------------------------------------------------

/**
 * Options for batch execution.
 */
export interface BatchExecutionOptions {
  /** Stop processing on first failure */
  stopOnFirstError?: boolean;

  /** Maximum number of concurrent operations (default: no limit) */
  concurrency?: number;

  /** Timeout for each individual operation in ms */
  operationTimeoutMs?: number;

  /** Continue processing even if some operations fail */
  continueOnError?: boolean;
}

/**
 * Runs a batch operation over an array of items.
 *
 * @param items - Array of items to process
 * @param keyFn - Function to extract a unique key from each item
 * @param operation - Async function that processes each item and returns a Result
 * @param options - Batch execution options
 * @returns A BatchResult containing all individual results and summary
 *
 * @example
 * ```typescript
 * const batchResult = await runBatch(
 *   users,
 *   user => user.id,
 *   async user => validateUser(user)
 * );
 *
 * if (batchResult.allSucceeded) {
 *   console.log('All users validated');
 * } else {
 *   console.log(`Failed: ${batchResult.failedKeys.join(', ')}`);
 * }
 * ```
 */
export async function runBatch<T, R>(
  items: T[],
  keyFn: (item: T) => string,
  operation: (item: T) => Promise<Result<R>>,
  options: BatchExecutionOptions = {}
): Promise<BatchResult<R>> {
  const startTime = Date.now();
  const { stopOnFirstError = false, concurrency, operationTimeoutMs } = options;

  const results: Array<BatchResultEntry<R>> = [];

  if (concurrency && concurrency > 0) {
    // Concurrent execution with limit
    const chunks = chunkArray(items, concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (item) => {
          const key = keyFn(item);
          const result = await executeWithTimeout(
            operation(item),
            operationTimeoutMs,
            key
          );
          return { key, result };
        })
      );

      results.push(...chunkResults);

      // Check for early termination
      if (stopOnFirstError) {
        const hasFailure = chunkResults.some(r => isFailure(r.result));
        if (hasFailure) {
          break;
        }
      }
    }
  } else {
    // Sequential or fully parallel execution
    if (stopOnFirstError) {
      // Sequential to allow early termination
      for (const item of items) {
        const key = keyFn(item);
        const result = await executeWithTimeout(
          operation(item),
          operationTimeoutMs,
          key
        );
        results.push({ key, result });

        if (isFailure(result)) {
          break;
        }
      }
    } else {
      // Fully parallel execution
      const allResults = await Promise.all(
        items.map(async (item) => {
          const key = keyFn(item);
          const result = await executeWithTimeout(
            operation(item),
            operationTimeoutMs,
            key
          );
          return { key, result };
        })
      );
      results.push(...allResults);
    }
  }

  return createBatchResult(results, startTime);
}

/**
 * Runs a synchronous batch operation over an array of items.
 *
 * @param items - Array of items to process
 * @param keyFn - Function to extract a unique key from each item
 * @param operation - Sync function that processes each item and returns a Result
 * @param options - Batch execution options
 * @returns A BatchResult containing all individual results and summary
 */
export function runBatchSync<T, R>(
  items: T[],
  keyFn: (item: T) => string,
  operation: (item: T) => Result<R>,
  options: Pick<BatchExecutionOptions, 'stopOnFirstError'> = {}
): BatchResult<R> {
  const startTime = Date.now();
  const { stopOnFirstError = false } = options;

  const results: Array<BatchResultEntry<R>> = [];

  for (const item of items) {
    const key = keyFn(item);
    const result = operation(item);
    results.push({ key, result });

    if (stopOnFirstError && isFailure(result)) {
      break;
    }
  }

  return createBatchResult(results, startTime);
}

// -----------------------------------------------------------------------------
// BATCH RESULT UTILITIES
// -----------------------------------------------------------------------------

/**
 * Extracts all successful results from a BatchResult.
 *
 * @param batchResult - The batch result to extract from
 * @returns Array of successful data values with their keys
 */
export function extractSuccesses<T>(
  batchResult: BatchResult<T>
): Array<{ key: string; data: T }> {
  return batchResult.results
    .filter(r => isSuccess(r.result))
    .map(r => ({
      key: r.key,
      data: (r.result as { success: true; data: T }).data,
    }));
}

/**
 * Extracts all failures from a BatchResult.
 *
 * @param batchResult - The batch result to extract from
 * @returns Array of failure errors with their keys
 */
export function extractFailures<T>(
  batchResult: BatchResult<T>
): Array<{ key: string; error: { code: string; message: string } }> {
  return batchResult.results
    .filter(r => isFailure(r.result))
    .map(r => ({
      key: r.key,
      error: (r.result as { success: false; error: { code: string; message: string } }).error,
    }));
}

/**
 * Gets a specific result by key from a BatchResult.
 *
 * @param batchResult - The batch result to search
 * @param key - The key to find
 * @returns The result for the given key, or undefined if not found
 */
export function getResultByKey<T>(
  batchResult: BatchResult<T>,
  key: string
): Result<T> | undefined {
  const entry = batchResult.results.find(r => r.key === key);
  return entry?.result;
}

/**
 * Converts a BatchResult to a Map for easy lookup.
 *
 * @param batchResult - The batch result to convert
 * @returns A Map from key to Result
 */
export function toResultMap<T>(
  batchResult: BatchResult<T>
): Map<string, Result<T>> {
  return new Map(batchResult.results.map(r => [r.key, r.result]));
}

/**
 * Filters a BatchResult to only include certain keys.
 *
 * @param batchResult - The batch result to filter
 * @param keys - Keys to include
 * @returns A new BatchResult with only the specified keys
 */
export function filterByKeys<T>(
  batchResult: BatchResult<T>,
  keys: string[]
): BatchResult<T> {
  const keySet = new Set(keys);
  const filteredResults = batchResult.results.filter(r => keySet.has(r.key));

  return createBatchResult(
    filteredResults,
    batchResult.summary.startedAt ?? Date.now()
  );
}

/**
 * Merges multiple BatchResults into a single BatchResult.
 *
 * @param batchResults - Array of batch results to merge
 * @returns A combined BatchResult
 */
export function mergeBatchResults<T>(
  batchResults: Array<BatchResult<T>>
): BatchResult<T> {
  if (batchResults.length === 0) {
    return createBatchResult([], Date.now());
  }

  const allResults: Array<BatchResultEntry<T>> = [];
  let earliestStart = Date.now();

  for (const batch of batchResults) {
    allResults.push(...batch.results);
    if (batch.summary.startedAt && batch.summary.startedAt < earliestStart) {
      earliestStart = batch.summary.startedAt;
    }
  }

  return createBatchResult(allResults, earliestStart);
}

/**
 * Retries failed operations in a BatchResult.
 *
 * @param batchResult - The original batch result
 * @param items - Original items array (needed to re-run failed operations)
 * @param keyFn - Function to extract key from item
 * @param operation - The operation to retry
 * @param maxRetries - Maximum number of retry attempts per item
 * @returns A new BatchResult with retried operations
 */
export async function retryFailed<T, R>(
  batchResult: BatchResult<R>,
  items: T[],
  keyFn: (item: T) => string,
  operation: (item: T) => Promise<Result<R>>,
  maxRetries: number = 3
): Promise<BatchResult<R>> {
  const startTime = Date.now();
  const failedKeys = new Set(batchResult.failedKeys);

  // Build map of items by key
  const itemsByKey = new Map<string, T>();
  for (const item of items) {
    itemsByKey.set(keyFn(item), item);
  }

  // Start with succeeded results
  const results: Array<BatchResultEntry<R>> = batchResult.results
    .filter(r => isSuccess(r.result));

  // Retry failed items
  for (const failedKey of failedKeys) {
    const item = itemsByKey.get(failedKey);
    if (!item) continue;

    let lastResult: Result<R> | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      lastResult = await operation(item);
      if (isSuccess(lastResult)) {
        break;
      }
    }

    if (lastResult) {
      results.push({ key: failedKey, result: lastResult });
    }
  }

  return createBatchResult(results, startTime);
}

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Splits an array into chunks of the specified size.
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Executes a promise with an optional timeout.
 */
async function executeWithTimeout<R>(
  promise: Promise<Result<R>>,
  timeoutMs: number | undefined,
  key: string
): Promise<Result<R>> {
  if (!timeoutMs) {
    return promise;
  }

  const timeoutPromise = new Promise<Result<R>>((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        error: {
          code: 'OPERATION_TIMEOUT',
          message: `Operation timed out after ${timeoutMs}ms`,
          details: { key, timeoutMs },
          retryable: true,
        },
      });
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// -----------------------------------------------------------------------------
// BATCH BUILDER (FLUENT API)
// -----------------------------------------------------------------------------

/**
 * Fluent builder for batch operations.
 * Provides a more readable way to configure and run batch operations.
 *
 * @example
 * ```typescript
 * const result = await batchBuilder(users)
 *   .keyBy(user => user.id)
 *   .withConcurrency(5)
 *   .stopOnFirstError()
 *   .run(async user => validateUser(user));
 * ```
 */
export function batchBuilder<T>(items: T[]): BatchBuilder<T> {
  return new BatchBuilder(items);
}

/**
 * Fluent builder class for batch operations.
 */
export class BatchBuilder<T> {
  private items: T[];
  private options: BatchExecutionOptions = {};
  private keyFunction?: (item: T) => string;

  constructor(items: T[]) {
    this.items = items;
  }

  /**
   * Sets the function to extract keys from items.
   */
  keyBy(fn: (item: T) => string): this {
    this.keyFunction = fn;
    return this;
  }

  /**
   * Sets the maximum concurrency for parallel execution.
   */
  withConcurrency(limit: number): this {
    this.options.concurrency = limit;
    return this;
  }

  /**
   * Enables stopping on the first error.
   */
  stopOnFirstError(enabled: boolean = true): this {
    this.options.stopOnFirstError = enabled;
    return this;
  }

  /**
   * Sets a timeout for each individual operation.
   */
  withTimeout(ms: number): this {
    this.options.operationTimeoutMs = ms;
    return this;
  }

  /**
   * Runs the batch operation.
   */
  async run<R>(operation: (item: T) => Promise<Result<R>>): Promise<BatchResult<R>> {
    // If no key function provided, use index
    const actualKeyFn = this.keyFunction
      ? this.keyFunction
      : (item: T) => {
          const index = this.items.indexOf(item);
          return String(index);
        };

    return runBatch(this.items, actualKeyFn, operation, this.options);
  }

  /**
   * Runs a synchronous batch operation.
   */
  runSync<R>(operation: (item: T) => Result<R>): BatchResult<R> {
    const actualKeyFn = this.keyFunction
      ? this.keyFunction
      : (item: T) => {
          const index = this.items.indexOf(item);
          return String(index);
        };

    return runBatchSync(this.items, actualKeyFn, operation, this.options);
  }
}
