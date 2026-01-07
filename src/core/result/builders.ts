/**
 * ===============================================================================
 * RESULT BUILDERS AND UTILITIES
 * ===============================================================================
 *
 * Fluent builders for creating Result types, type guards, and utility functions
 * for working with Result values.
 *
 * ===============================================================================
 */

import type {
  Result,
  Success,
  Failure,
  ResultMetadata,
  ResultError,
  LegacyResult,
} from './types.js';

// -----------------------------------------------------------------------------
// RESULT BUILDERS
// -----------------------------------------------------------------------------

/**
 * Creates a Success result with the given data.
 *
 * @param data - The successful result data
 * @param metadata - Optional metadata about the operation
 * @returns A Success result
 *
 * @example
 * ```typescript
 * const result = success({ id: 1, name: 'Alice' });
 * // result.success === true
 * // result.data === { id: 1, name: 'Alice' }
 * ```
 */
export function success<T>(data: T, metadata?: ResultMetadata): Success<T> {
  return {
    success: true,
    data,
    metadata: metadata ? { ...metadata, timestamp: metadata.timestamp ?? Date.now() } : undefined,
  };
}

/**
 * Creates a Failure result with the given error information.
 *
 * @param code - Machine-readable error code
 * @param message - Human-readable error message
 * @param options - Additional error options
 * @returns A Failure result
 *
 * @example
 * ```typescript
 * const result = failure('NOT_FOUND', 'User not found', { details: { userId: 123 } });
 * // result.success === false
 * // result.error.code === 'NOT_FOUND'
 * ```
 */
export function failure(
  code: string,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    retryable?: boolean;
    retryAfterMs?: number;
    cause?: ResultError;
    metadata?: ResultMetadata;
  }
): Failure {
  return {
    success: false,
    error: {
      code,
      message,
      details: options?.details,
      retryable: options?.retryable,
      retryAfterMs: options?.retryAfterMs,
      cause: options?.cause,
    },
    metadata: options?.metadata
      ? { ...options.metadata, timestamp: options.metadata.timestamp ?? Date.now() }
      : { timestamp: Date.now() },
  };
}

/**
 * Interface for errors that have a code property.
 * Used by fromError to extract structured error information.
 */
interface CodedError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

/**
 * Creates a Failure result from an Error object.
 * Extracts code and details if available (e.g., from PromptSpeakError).
 *
 * @param error - The error to convert
 * @param defaultCode - Default error code if none is present on the error
 * @returns A Failure result
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   return fromError(err);
 * }
 * ```
 */
export function fromError(
  error: Error | CodedError | unknown,
  defaultCode: string = 'UNKNOWN_ERROR'
): Failure {
  if (error instanceof Error) {
    const codedError = error as CodedError;
    return failure(
      codedError.code ?? defaultCode,
      error.message,
      {
        details: codedError.details,
        retryable: codedError.retryable,
      }
    );
  }

  // Handle non-Error values
  return failure(defaultCode, String(error));
}

/**
 * Wraps a Promise to return a Result instead of throwing.
 *
 * @param promise - The promise to wrap
 * @param errorCode - Error code to use if the promise rejects
 * @returns A Promise that resolves to a Result
 *
 * @example
 * ```typescript
 * const result = await fromPromise(fetchUser(id), 'FETCH_USER_FAILED');
 * if (isSuccess(result)) {
 *   console.log(result.data);
 * }
 * ```
 */
export async function fromPromise<T>(
  promise: Promise<T>,
  errorCode: string = 'PROMISE_REJECTED'
): Promise<Result<T>> {
  const startTime = Date.now();
  try {
    const data = await promise;
    return success(data, { executionTimeMs: Date.now() - startTime });
  } catch (error) {
    const result = fromError(error, errorCode);
    result.metadata = {
      ...result.metadata,
      executionTimeMs: Date.now() - startTime,
    };
    return result;
  }
}

/**
 * Wraps a synchronous function to return a Result instead of throwing.
 *
 * @param fn - The function to wrap
 * @param errorCode - Error code to use if the function throws
 * @returns A Result
 *
 * @example
 * ```typescript
 * const result = fromThrowable(() => JSON.parse(jsonString), 'PARSE_FAILED');
 * ```
 */
export function fromThrowable<T>(
  fn: () => T,
  errorCode: string = 'EXECUTION_FAILED'
): Result<T> {
  const startTime = Date.now();
  try {
    const data = fn();
    return success(data, { executionTimeMs: Date.now() - startTime });
  } catch (error) {
    const result = fromError(error, errorCode);
    result.metadata = {
      ...result.metadata,
      executionTimeMs: Date.now() - startTime,
    };
    return result;
  }
}

// -----------------------------------------------------------------------------
// TYPE GUARDS
// -----------------------------------------------------------------------------

/**
 * Type guard to check if a Result is a Success.
 *
 * @param result - The result to check
 * @returns True if the result is a Success
 *
 * @example
 * ```typescript
 * if (isSuccess(result)) {
 *   // TypeScript knows result.data exists
 *   console.log(result.data);
 * }
 * ```
 */
export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.success === true;
}

/**
 * Type guard to check if a Result is a Failure.
 *
 * @param result - The result to check
 * @returns True if the result is a Failure
 *
 * @example
 * ```typescript
 * if (isFailure(result)) {
 *   // TypeScript knows result.error exists
 *   console.error(result.error.message);
 * }
 * ```
 */
export function isFailure<T>(result: Result<T>): result is Failure {
  return result.success === false;
}

/**
 * Type guard to check if an error is retryable.
 *
 * @param result - The failure result to check
 * @returns True if the operation can be retried
 */
export function isRetryable(result: Failure): boolean {
  return result.error.retryable === true;
}

// -----------------------------------------------------------------------------
// UNWRAP UTILITIES
// -----------------------------------------------------------------------------

/**
 * Error thrown when unwrapping a Failure result.
 */
export class UnwrapError extends Error {
  public readonly error: ResultError;

  constructor(error: ResultError) {
    super(`Unwrap failed: ${error.code} - ${error.message}`);
    this.name = 'UnwrapError';
    this.error = error;
  }
}

/**
 * Extracts the data from a Success result.
 * Throws UnwrapError if the result is a Failure.
 *
 * @param result - The result to unwrap
 * @returns The success data
 * @throws UnwrapError if the result is a Failure
 *
 * @example
 * ```typescript
 * const user = unwrap(result);  // Throws if result is Failure
 * ```
 */
export function unwrap<T>(result: Result<T>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw new UnwrapError(result.error);
}

/**
 * Extracts the data from a Success result, or returns a default value.
 *
 * @param result - The result to unwrap
 * @param defaultValue - Value to return if result is Failure
 * @returns The success data or the default value
 *
 * @example
 * ```typescript
 * const user = unwrapOr(result, defaultUser);
 * ```
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Extracts the data from a Success result, or computes a default lazily.
 *
 * @param result - The result to unwrap
 * @param defaultFn - Function that returns the default value
 * @returns The success data or the computed default value
 *
 * @example
 * ```typescript
 * const user = unwrapOrElse(result, () => createDefaultUser());
 * ```
 */
export function unwrapOrElse<T>(result: Result<T>, defaultFn: () => T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultFn();
}

/**
 * Extracts the error from a Failure result.
 * Throws if the result is a Success.
 *
 * @param result - The result to unwrap
 * @returns The error
 * @throws Error if the result is a Success
 */
export function unwrapError<T>(result: Result<T>): ResultError {
  if (isFailure(result)) {
    return result.error;
  }
  throw new Error('Cannot unwrapError on a Success result');
}

// -----------------------------------------------------------------------------
// TRANSFORMATION UTILITIES
// -----------------------------------------------------------------------------

/**
 * Maps a Success value to a new value using the provided function.
 * If the result is a Failure, returns the Failure unchanged.
 *
 * @param result - The result to map
 * @param fn - Function to transform the success data
 * @returns A new Result with the transformed data
 *
 * @example
 * ```typescript
 * const nameResult = map(userResult, user => user.name);
 * ```
 */
export function map<T, U>(result: Result<T>, fn: (data: T) => U): Result<U> {
  if (isSuccess(result)) {
    return success(fn(result.data), result.metadata);
  }
  return result;
}

/**
 * Maps a Failure error to a new error using the provided function.
 * If the result is a Success, returns the Success unchanged.
 *
 * @param result - The result to map
 * @param fn - Function to transform the error
 * @returns A new Result with the transformed error
 */
export function mapError<T>(
  result: Result<T>,
  fn: (error: ResultError) => ResultError
): Result<T> {
  if (isFailure(result)) {
    return { ...result, error: fn(result.error) };
  }
  return result;
}

/**
 * Chains a Result with a function that returns another Result.
 * Also known as flatMap or bind.
 *
 * @param result - The result to chain
 * @param fn - Function that takes the success data and returns a new Result
 * @returns The chained Result
 *
 * @example
 * ```typescript
 * const result = flatMap(userResult, user => fetchPosts(user.id));
 * ```
 */
export function flatMap<T, U>(
  result: Result<T>,
  fn: (data: T) => Result<U>
): Result<U> {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Async version of flatMap for chaining async operations.
 *
 * @param result - The result to chain
 * @param fn - Async function that takes the success data and returns a new Result
 * @returns A Promise that resolves to the chained Result
 */
export async function flatMapAsync<T, U>(
  result: Result<T>,
  fn: (data: T) => Promise<Result<U>>
): Promise<Result<U>> {
  if (isSuccess(result)) {
    return fn(result.data);
  }
  return result;
}

/**
 * Applies one of two functions depending on success/failure.
 *
 * @param result - The result to match
 * @param onSuccess - Function to call with success data
 * @param onFailure - Function to call with error
 * @returns The return value of the matched function
 *
 * @example
 * ```typescript
 * const message = match(
 *   result,
 *   user => `Hello, ${user.name}!`,
 *   error => `Error: ${error.message}`
 * );
 * ```
 */
export function match<T, U>(
  result: Result<T>,
  onSuccess: (data: T) => U,
  onFailure: (error: ResultError) => U
): U {
  if (isSuccess(result)) {
    return onSuccess(result.data);
  }
  return onFailure(result.error);
}

// -----------------------------------------------------------------------------
// COMBINATION UTILITIES
// -----------------------------------------------------------------------------

/**
 * Combines multiple Results into a single Result containing an array.
 * If any Result is a Failure, returns the first Failure.
 *
 * @param results - Array of Results to combine
 * @returns A Result containing an array of all success values
 *
 * @example
 * ```typescript
 * const combined = all([result1, result2, result3]);
 * if (isSuccess(combined)) {
 *   const [a, b, c] = combined.data;
 * }
 * ```
 */
export function all<T>(results: Array<Result<T>>): Result<T[]> {
  const data: T[] = [];

  for (const result of results) {
    if (isFailure(result)) {
      return result;
    }
    data.push(result.data);
  }

  return success(data);
}

/**
 * Combines multiple Results, collecting all successes and failures.
 * Unlike `all`, this processes all results even if some fail.
 *
 * @param results - Array of Results to partition
 * @returns Object containing arrays of successes and failures
 */
export function partition<T>(
  results: Array<Result<T>>
): { successes: T[]; failures: Failure[] } {
  const successes: T[] = [];
  const failures: Failure[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      successes.push(result.data);
    } else {
      failures.push(result);
    }
  }

  return { successes, failures };
}

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY
// -----------------------------------------------------------------------------

/**
 * Converts a legacy result format to the new Result type.
 *
 * @param legacy - Legacy result object
 * @param dataKey - Key to extract data from (default: 'data')
 * @returns A proper Result type
 *
 * @example
 * ```typescript
 * const legacyResult = { success: true, user: { id: 1 } };
 * const result = fromLegacy(legacyResult, 'user');
 * ```
 */
export function fromLegacy<T>(
  legacy: LegacyResult<T>,
  dataKey: string = 'data'
): Result<T> {
  if (legacy.success) {
    const data = (legacy[dataKey] ?? legacy.data) as T;
    return success(data);
  }

  return failure(
    'LEGACY_ERROR',
    legacy.error ?? 'Unknown error',
    { details: { originalResult: legacy } }
  );
}

/**
 * Converts a Result to the legacy format for backward compatibility.
 *
 * @param result - The Result to convert
 * @returns A legacy result object
 */
export function toLegacy<T>(result: Result<T>): LegacyResult<T> {
  if (isSuccess(result)) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
