/**
 * Unit tests for the core/result module
 *
 * Tests the Result pattern implementation including builders, type guards,
 * utilities, and batch operations.
 */

import { describe, it, expect, vi } from 'vitest';
import {
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

  // Batch operations
  createBatchResult,
  runBatch,
  runBatchSync,
  extractSuccesses,
  extractFailures,
  getResultByKey,
  toResultMap,
  filterByKeys,
  mergeBatchResults,
  retryFailed,
  batchBuilder,
} from '../../../src/core/result/index.js';

import type { Result, Failure, BatchResultEntry } from '../../../src/core/result/index.js';

// =============================================================================
// BUILDERS TESTS
// =============================================================================

describe('Core Result Module', () => {
  describe('Builders', () => {
    describe('success()', () => {
      it('should create success result with data', () => {
        const result = success({ id: 1, name: 'test' });
        expect(result.success).toBe(true);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.id).toBe(1);
          expect(result.data.name).toBe('test');
        }
      });

      it('should include metadata when provided', () => {
        const result = success('data', { executionTimeMs: 100, cacheHit: true });
        expect(result.metadata?.executionTimeMs).toBe(100);
        expect(result.metadata?.cacheHit).toBe(true);
      });

      it('should set timestamp in metadata when provided', () => {
        const timestamp = Date.now();
        const result = success('data', { timestamp });
        expect(result.metadata?.timestamp).toBe(timestamp);
      });

      it('should auto-set timestamp when metadata provided without timestamp', () => {
        const before = Date.now();
        const result = success('data', { executionTimeMs: 50 });
        const after = Date.now();
        expect(result.metadata?.timestamp).toBeGreaterThanOrEqual(before);
        expect(result.metadata?.timestamp).toBeLessThanOrEqual(after);
      });

      it('should handle undefined metadata', () => {
        const result = success('data');
        expect(result.metadata).toBeUndefined();
      });

      it('should work with various data types', () => {
        expect(success(42).data).toBe(42);
        expect(success('string').data).toBe('string');
        expect(success(null).data).toBe(null);
        expect(success([1, 2, 3]).data).toEqual([1, 2, 3]);
        expect(success({ nested: { value: true } }).data).toEqual({ nested: { value: true } });
      });
    });

    describe('failure()', () => {
      it('should create failure result with error', () => {
        const result = failure('NOT_FOUND', 'Resource not found');
        expect(result.success).toBe(false);
        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.code).toBe('NOT_FOUND');
          expect(result.error.message).toBe('Resource not found');
        }
      });

      it('should include error details when provided', () => {
        const result = failure('VALIDATION_ERROR', 'Invalid input', {
          details: { field: 'email', reason: 'invalid format' },
        });
        expect(result.error.details).toEqual({ field: 'email', reason: 'invalid format' });
      });

      it('should include retryable flag when provided', () => {
        const result = failure('TIMEOUT', 'Request timed out', { retryable: true });
        expect(result.error.retryable).toBe(true);
      });

      it('should include retryAfterMs when provided', () => {
        const result = failure('RATE_LIMITED', 'Too many requests', {
          retryable: true,
          retryAfterMs: 1000,
        });
        expect(result.error.retryAfterMs).toBe(1000);
      });

      it('should include cause when provided', () => {
        const causeError = { code: 'INNER', message: 'Inner error' };
        const result = failure('OUTER', 'Outer error', { cause: causeError });
        expect(result.error.cause).toEqual(causeError);
      });

      it('should include metadata when provided', () => {
        const result = failure('ERROR', 'An error', {
          metadata: { correlationId: 'abc123' },
        });
        expect(result.metadata?.correlationId).toBe('abc123');
      });

      it('should always set timestamp in metadata', () => {
        const before = Date.now();
        const result = failure('ERROR', 'An error');
        const after = Date.now();
        expect(result.metadata?.timestamp).toBeGreaterThanOrEqual(before);
        expect(result.metadata?.timestamp).toBeLessThanOrEqual(after);
      });
    });

    describe('fromError()', () => {
      it('should convert Error to Failure', () => {
        const error = new Error('Something went wrong');
        const result = fromError(error);
        expect(result.success).toBe(false);
        expect(result.error.code).toBe('UNKNOWN_ERROR');
        expect(result.error.message).toBe('Something went wrong');
      });

      it('should use custom error code', () => {
        const error = new Error('Network error');
        const result = fromError(error, 'NETWORK_ERROR');
        expect(result.error.code).toBe('NETWORK_ERROR');
      });

      it('should extract code from coded error', () => {
        const codedError = Object.assign(new Error('Custom error'), {
          code: 'CUSTOM_CODE',
        });
        const result = fromError(codedError);
        expect(result.error.code).toBe('CUSTOM_CODE');
      });

      it('should extract details from coded error', () => {
        const codedError = Object.assign(new Error('Validation error'), {
          code: 'VALIDATION',
          details: { field: 'username' },
        });
        const result = fromError(codedError);
        expect(result.error.details).toEqual({ field: 'username' });
      });

      it('should extract retryable from coded error', () => {
        const codedError = Object.assign(new Error('Retryable error'), {
          retryable: true,
        });
        const result = fromError(codedError);
        expect(result.error.retryable).toBe(true);
      });

      it('should handle non-Error values', () => {
        const result = fromError('string error');
        expect(result.error.message).toBe('string error');
        expect(result.error.code).toBe('UNKNOWN_ERROR');
      });

      it('should handle null/undefined values', () => {
        expect(fromError(null).error.message).toBe('null');
        expect(fromError(undefined).error.message).toBe('undefined');
      });
    });

    describe('fromPromise()', () => {
      it('should wrap resolved promise in success', async () => {
        const promise = Promise.resolve({ value: 42 });
        const result = await fromPromise(promise);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data).toEqual({ value: 42 });
        }
      });

      it('should wrap rejected promise in failure', async () => {
        const promise = Promise.reject(new Error('Async error'));
        const result = await fromPromise(promise);
        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.message).toBe('Async error');
        }
      });

      it('should use custom error code for rejection', async () => {
        const promise = Promise.reject(new Error('Failed'));
        const result = await fromPromise(promise, 'FETCH_ERROR');
        expect(result.error.code).toBe('FETCH_ERROR');
      });

      it('should include execution time metadata', async () => {
        const promise = new Promise((resolve) => setTimeout(() => resolve('done'), 50));
        const result = await fromPromise(promise);
        expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(50);
      });

      it('should include execution time on failure', async () => {
        const promise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 50)
        );
        const result = await fromPromise(promise);
        expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(50);
      });
    });

    describe('fromThrowable()', () => {
      it('should wrap successful function in success', () => {
        const result = fromThrowable(() => JSON.parse('{"key": "value"}'));
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data).toEqual({ key: 'value' });
        }
      });

      it('should wrap throwing function in failure', () => {
        const result = fromThrowable(() => JSON.parse('invalid json'));
        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.code).toBe('EXECUTION_FAILED');
        }
      });

      it('should use custom error code', () => {
        const result = fromThrowable(() => {
          throw new Error('Parse error');
        }, 'PARSE_ERROR');
        expect(result.error.code).toBe('PARSE_ERROR');
      });

      it('should include execution time metadata on success', () => {
        const result = fromThrowable(() => 'result');
        expect(result.metadata?.executionTimeMs).toBeDefined();
        expect(result.metadata?.executionTimeMs).toBeGreaterThanOrEqual(0);
      });

      it('should include execution time metadata on failure', () => {
        const result = fromThrowable(() => {
          throw new Error('error');
        });
        expect(result.metadata?.executionTimeMs).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // TYPE GUARDS TESTS
  // ===========================================================================

  describe('Type Guards', () => {
    describe('isSuccess()', () => {
      it('should return true for success result', () => {
        const result = success('data');
        expect(isSuccess(result)).toBe(true);
      });

      it('should return false for failure result', () => {
        const result = failure('ERROR', 'message');
        expect(isSuccess(result)).toBe(false);
      });

      it('should enable type narrowing', () => {
        const result: Result<number> = success(42);
        if (isSuccess(result)) {
          // TypeScript should know result.data is number
          const value: number = result.data;
          expect(value).toBe(42);
        }
      });
    });

    describe('isFailure()', () => {
      it('should return true for failure result', () => {
        const result = failure('ERROR', 'message');
        expect(isFailure(result)).toBe(true);
      });

      it('should return false for success result', () => {
        const result = success('data');
        expect(isFailure(result)).toBe(false);
      });

      it('should enable type narrowing', () => {
        const result: Result<string> = failure('ERROR', 'test error');
        if (isFailure(result)) {
          // TypeScript should know result.error exists
          expect(result.error.message).toBe('test error');
        }
      });
    });

    describe('isRetryable()', () => {
      it('should return true when retryable is true', () => {
        const result = failure('ERROR', 'message', { retryable: true });
        expect(isRetryable(result)).toBe(true);
      });

      it('should return false when retryable is false', () => {
        const result = failure('ERROR', 'message', { retryable: false });
        expect(isRetryable(result)).toBe(false);
      });

      it('should return false when retryable is undefined', () => {
        const result = failure('ERROR', 'message');
        expect(isRetryable(result)).toBe(false);
      });
    });
  });

  // ===========================================================================
  // UNWRAP UTILITIES TESTS
  // ===========================================================================

  describe('Unwrap Utilities', () => {
    describe('unwrap()', () => {
      it('should return data for success', () => {
        const result = success(42);
        expect(unwrap(result)).toBe(42);
      });

      it('should throw UnwrapError for failure', () => {
        const result = failure('ERROR', 'Something failed');
        expect(() => unwrap(result)).toThrow(UnwrapError);
      });

      it('should include error info in UnwrapError', () => {
        const result = failure('CUSTOM_CODE', 'Custom message');
        try {
          unwrap(result);
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(UnwrapError);
          const unwrapErr = err as UnwrapError;
          expect(unwrapErr.error.code).toBe('CUSTOM_CODE');
          expect(unwrapErr.error.message).toBe('Custom message');
        }
      });
    });

    describe('unwrapOr()', () => {
      it('should return data for success', () => {
        const result = success(42);
        expect(unwrapOr(result, 0)).toBe(42);
      });

      it('should return default value for failure', () => {
        const result = failure('ERROR', 'fail');
        expect(unwrapOr(result, 0)).toBe(0);
      });

      it('should work with complex default values', () => {
        const result: Result<{ name: string }> = failure('ERROR', 'fail');
        const defaultVal = { name: 'default' };
        expect(unwrapOr(result, defaultVal)).toEqual(defaultVal);
      });
    });

    describe('unwrapOrElse()', () => {
      it('should return data for success', () => {
        const result = success(42);
        const factory = vi.fn(() => 0);
        expect(unwrapOrElse(result, factory)).toBe(42);
        expect(factory).not.toHaveBeenCalled();
      });

      it('should call factory for failure', () => {
        const result = failure('ERROR', 'fail');
        const factory = vi.fn(() => 100);
        expect(unwrapOrElse(result, factory)).toBe(100);
        expect(factory).toHaveBeenCalledTimes(1);
      });

      it('should lazily evaluate default', () => {
        const result = success('value');
        let evaluated = false;
        unwrapOrElse(result, () => {
          evaluated = true;
          return 'default';
        });
        expect(evaluated).toBe(false);
      });
    });

    describe('unwrapError()', () => {
      it('should return error for failure', () => {
        const result = failure('CODE', 'message');
        const error = unwrapError(result);
        expect(error.code).toBe('CODE');
        expect(error.message).toBe('message');
      });

      it('should throw for success', () => {
        const result = success('data');
        expect(() => unwrapError(result)).toThrow('Cannot unwrapError on a Success result');
      });
    });
  });

  // ===========================================================================
  // TRANSFORMATION UTILITIES TESTS
  // ===========================================================================

  describe('Transformation Utilities', () => {
    describe('map()', () => {
      it('should transform success data', () => {
        const result = success(5);
        const mapped = map(result, (x) => x * 2);
        expect(unwrap(mapped)).toBe(10);
      });

      it('should pass through failure', () => {
        const result: Result<number> = failure('ERROR', 'fail');
        const mapped = map(result, (x) => x * 2);
        expect(isFailure(mapped)).toBe(true);
        if (isFailure(mapped)) {
          expect(mapped.error.code).toBe('ERROR');
        }
      });

      it('should preserve metadata', () => {
        const result = success(5, { executionTimeMs: 100 });
        const mapped = map(result, (x) => x * 2);
        expect(mapped.metadata?.executionTimeMs).toBe(100);
      });

      it('should allow type transformation', () => {
        const result = success({ value: 42 });
        const mapped = map(result, (obj) => obj.value.toString());
        expect(unwrap(mapped)).toBe('42');
      });
    });

    describe('mapError()', () => {
      it('should transform failure error', () => {
        const result = failure('OLD_CODE', 'old message');
        const mapped = mapError(result, (error) => ({
          ...error,
          code: 'NEW_CODE',
          message: 'new message',
        }));
        expect(isFailure(mapped)).toBe(true);
        if (isFailure(mapped)) {
          expect(mapped.error.code).toBe('NEW_CODE');
          expect(mapped.error.message).toBe('new message');
        }
      });

      it('should pass through success', () => {
        const result = success('data');
        const mapped = mapError(result, (error) => ({
          ...error,
          code: 'CHANGED',
        }));
        expect(isSuccess(mapped)).toBe(true);
        expect(unwrap(mapped)).toBe('data');
      });
    });

    describe('flatMap()', () => {
      it('should chain success results', () => {
        const result = success(5);
        const chained = flatMap(result, (x) => success(x * 2));
        expect(unwrap(chained)).toBe(10);
      });

      it('should short-circuit on first failure', () => {
        const result: Result<number> = failure('FIRST', 'first error');
        const chained = flatMap(result, (x) => success(x * 2));
        expect(isFailure(chained)).toBe(true);
        if (isFailure(chained)) {
          expect(chained.error.code).toBe('FIRST');
        }
      });

      it('should propagate failure from chained function', () => {
        const result = success(5);
        const chained = flatMap(result, () => failure('SECOND', 'second error'));
        expect(isFailure(chained)).toBe(true);
        if (isFailure(chained)) {
          expect(chained.error.code).toBe('SECOND');
        }
      });

      it('should allow multiple chains', () => {
        const result = success(1);
        const final = flatMap(
          flatMap(result, (x) => success(x + 1)),
          (x) => success(x * 10)
        );
        expect(unwrap(final)).toBe(20);
      });
    });

    describe('flatMapAsync()', () => {
      it('should chain async success results', async () => {
        const result = success(5);
        const chained = await flatMapAsync(result, async (x) => success(x * 2));
        expect(unwrap(chained)).toBe(10);
      });

      it('should short-circuit on failure', async () => {
        const result: Result<number> = failure('ERROR', 'fail');
        const chained = await flatMapAsync(result, async (x) => success(x * 2));
        expect(isFailure(chained)).toBe(true);
      });

      it('should propagate async failure', async () => {
        const result = success(5);
        const chained = await flatMapAsync(result, async () =>
          failure('ASYNC_ERROR', 'async fail')
        );
        expect(isFailure(chained)).toBe(true);
        if (isFailure(chained)) {
          expect(chained.error.code).toBe('ASYNC_ERROR');
        }
      });
    });

    describe('match()', () => {
      it('should call onSuccess for success result', () => {
        const result = success({ name: 'Alice' });
        const message = match(
          result,
          (data) => `Hello, ${data.name}!`,
          (error) => `Error: ${error.message}`
        );
        expect(message).toBe('Hello, Alice!');
      });

      it('should call onFailure for failure result', () => {
        const result = failure('NOT_FOUND', 'User not found');
        const message = match(
          result,
          (data) => `Hello, ${data}!`,
          (error) => `Error: ${error.message}`
        );
        expect(message).toBe('Error: User not found');
      });

      it('should allow different return types', () => {
        const successResult = success(42);
        const count = match(
          successResult,
          (data) => data,
          () => 0
        );
        expect(count).toBe(42);
      });
    });
  });

  // ===========================================================================
  // COMBINATION UTILITIES TESTS
  // ===========================================================================

  describe('Combination Utilities', () => {
    describe('all()', () => {
      it('should combine all successes', () => {
        const results = [success(1), success(2), success(3)];
        const combined = all(results);
        expect(isSuccess(combined)).toBe(true);
        if (isSuccess(combined)) {
          expect(combined.data).toEqual([1, 2, 3]);
        }
      });

      it('should fail fast on first failure', () => {
        const results: Result<number>[] = [
          success(1),
          failure('ERR', 'fail'),
          success(3),
        ];
        const combined = all(results);
        expect(isFailure(combined)).toBe(true);
        if (isFailure(combined)) {
          expect(combined.error.code).toBe('ERR');
        }
      });

      it('should return first failure when multiple failures exist', () => {
        const results: Result<number>[] = [
          failure('FIRST', 'first'),
          failure('SECOND', 'second'),
        ];
        const combined = all(results);
        expect(isFailure(combined)).toBe(true);
        if (isFailure(combined)) {
          expect(combined.error.code).toBe('FIRST');
        }
      });

      it('should handle empty array', () => {
        const combined = all([]);
        expect(isSuccess(combined)).toBe(true);
        if (isSuccess(combined)) {
          expect(combined.data).toEqual([]);
        }
      });

      it('should preserve order', () => {
        const results = [success('a'), success('b'), success('c')];
        const combined = all(results);
        if (isSuccess(combined)) {
          expect(combined.data).toEqual(['a', 'b', 'c']);
        }
      });
    });

    describe('partition()', () => {
      it('should separate successes and failures', () => {
        const results: Result<number>[] = [
          success(1),
          failure('E1', 'error 1'),
          success(2),
          failure('E2', 'error 2'),
          success(3),
        ];
        const { successes, failures } = partition(results);
        expect(successes).toEqual([1, 2, 3]);
        expect(failures).toHaveLength(2);
        expect(failures[0].error.code).toBe('E1');
        expect(failures[1].error.code).toBe('E2');
      });

      it('should handle all successes', () => {
        const results = [success(1), success(2)];
        const { successes, failures } = partition(results);
        expect(successes).toEqual([1, 2]);
        expect(failures).toHaveLength(0);
      });

      it('should handle all failures', () => {
        const results: Result<number>[] = [
          failure('E1', 'error 1'),
          failure('E2', 'error 2'),
        ];
        const { successes, failures } = partition(results);
        expect(successes).toHaveLength(0);
        expect(failures).toHaveLength(2);
      });

      it('should handle empty array', () => {
        const { successes, failures } = partition([]);
        expect(successes).toHaveLength(0);
        expect(failures).toHaveLength(0);
      });
    });
  });

  // ===========================================================================
  // LEGACY COMPATIBILITY TESTS
  // ===========================================================================

  describe('Legacy Compatibility', () => {
    describe('fromLegacy()', () => {
      it('should convert legacy success to Result', () => {
        const legacy = { success: true, data: { id: 1 } };
        const result = fromLegacy(legacy);
        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data).toEqual({ id: 1 });
        }
      });

      it('should convert legacy error to Result', () => {
        const legacy = { success: false, error: 'Something went wrong' };
        const result = fromLegacy(legacy);
        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.message).toBe('Something went wrong');
          expect(result.error.code).toBe('LEGACY_ERROR');
        }
      });

      it('should extract data from custom key', () => {
        const legacy = { success: true, user: { name: 'Alice' } };
        const result = fromLegacy(legacy, 'user');
        if (isSuccess(result)) {
          expect(result.data).toEqual({ name: 'Alice' });
        }
      });

      it('should fall back to data key if custom key not found', () => {
        const legacy = { success: true, data: 'fallback' };
        const result = fromLegacy(legacy, 'nonexistent');
        if (isSuccess(result)) {
          expect(result.data).toBe('fallback');
        }
      });

      it('should handle missing error message', () => {
        const legacy = { success: false };
        const result = fromLegacy(legacy);
        if (isFailure(result)) {
          expect(result.error.message).toBe('Unknown error');
        }
      });

      it('should include original result in details', () => {
        const legacy = { success: false, error: 'fail', extra: 'info' };
        const result = fromLegacy(legacy);
        if (isFailure(result)) {
          expect(result.error.details?.originalResult).toEqual(legacy);
        }
      });
    });

    describe('toLegacy()', () => {
      it('should convert success to legacy format', () => {
        const result = success({ id: 1, name: 'test' });
        const legacy = toLegacy(result);
        expect(legacy.success).toBe(true);
        expect(legacy.data).toEqual({ id: 1, name: 'test' });
        expect(legacy.error).toBeUndefined();
      });

      it('should convert failure to legacy format', () => {
        const result = failure('NOT_FOUND', 'Resource not found');
        const legacy = toLegacy(result);
        expect(legacy.success).toBe(false);
        expect(legacy.error).toBe('Resource not found');
        expect(legacy.data).toBeUndefined();
      });

      it('should round-trip success', () => {
        const original = success({ value: 42 });
        const legacy = toLegacy(original);
        const restored = fromLegacy(legacy);
        expect(unwrap(restored)).toEqual({ value: 42 });
      });

      it('should round-trip failure message', () => {
        const original = failure('CODE', 'Error message');
        const legacy = toLegacy(original);
        const restored = fromLegacy(legacy);
        if (isFailure(restored)) {
          expect(restored.error.message).toBe('Error message');
        }
      });
    });
  });

  // ===========================================================================
  // BATCH OPERATIONS TESTS
  // ===========================================================================

  describe('Batch Operations', () => {
    describe('createBatchResult()', () => {
      it('should create batch result with timing', () => {
        const startTime = Date.now() - 100;
        const results: BatchResultEntry<string>[] = [
          { key: 'a', result: success('value-a') },
          { key: 'b', result: success('value-b') },
        ];
        const batch = createBatchResult(results, startTime);

        expect(batch.results).toHaveLength(2);
        expect(batch.summary.total).toBe(2);
        expect(batch.summary.succeeded).toBe(2);
        expect(batch.summary.failed).toBe(0);
        expect(batch.summary.executionTimeMs).toBeGreaterThanOrEqual(100);
        expect(batch.allSucceeded).toBe(true);
        expect(batch.allFailed).toBe(false);
      });

      it('should track failed keys', () => {
        const results: BatchResultEntry<string>[] = [
          { key: 'a', result: success('value-a') },
          { key: 'b', result: failure('ERR', 'failed') },
          { key: 'c', result: failure('ERR', 'failed') },
        ];
        const batch = createBatchResult(results, Date.now());

        expect(batch.summary.succeeded).toBe(1);
        expect(batch.summary.failed).toBe(2);
        expect(batch.failedKeys).toEqual(['b', 'c']);
        expect(batch.succeededKeys).toEqual(['a']);
        expect(batch.allSucceeded).toBe(false);
        expect(batch.allFailed).toBe(false);
      });

      it('should handle all failures', () => {
        const results: BatchResultEntry<string>[] = [
          { key: 'a', result: failure('ERR', 'failed') },
          { key: 'b', result: failure('ERR', 'failed') },
        ];
        const batch = createBatchResult(results, Date.now());

        expect(batch.allSucceeded).toBe(false);
        expect(batch.allFailed).toBe(true);
      });

      it('should handle empty results', () => {
        const batch = createBatchResult([], Date.now());

        expect(batch.summary.total).toBe(0);
        expect(batch.allSucceeded).toBe(false);
        expect(batch.allFailed).toBe(false);
        expect(batch.summary.averageTimePerItemMs).toBe(0);
      });

      it('should calculate average time per item', () => {
        const startTime = Date.now() - 300;
        const results: BatchResultEntry<string>[] = [
          { key: 'a', result: success('a') },
          { key: 'b', result: success('b') },
          { key: 'c', result: success('c') },
        ];
        const batch = createBatchResult(results, startTime);

        expect(batch.summary.averageTimePerItemMs).toBeGreaterThanOrEqual(100);
      });
    });

    describe('runBatch()', () => {
      it('should execute batch operations', async () => {
        const items = [
          { id: '1', value: 10 },
          { id: '2', value: 20 },
        ];
        const batch = await runBatch(
          items,
          (item) => item.id,
          async (item) => success(item.value * 2)
        );

        expect(batch.summary.total).toBe(2);
        expect(batch.allSucceeded).toBe(true);
        expect(batch.succeededKeys).toEqual(['1', '2']);
      });

      it('should handle mixed success and failure', async () => {
        const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
        const batch = await runBatch(
          items,
          (item) => item.id,
          async (item) =>
            item.id === '2' ? failure('ERR', 'Item 2 failed') : success(item.id)
        );

        expect(batch.summary.succeeded).toBe(2);
        expect(batch.summary.failed).toBe(1);
        expect(batch.failedKeys).toEqual(['2']);
      });

      it('should stop on first error when option enabled', async () => {
        const processed: string[] = [];
        const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
        const batch = await runBatch(
          items,
          (item) => item.id,
          async (item) => {
            processed.push(item.id);
            if (item.id === '2') {
              return failure('ERR', 'Stop here');
            }
            return success(item.id);
          },
          { stopOnFirstError: true }
        );

        expect(batch.summary.total).toBe(2); // Only 2 processed
        expect(processed).toEqual(['1', '2']);
      });

      it('should respect concurrency limit', async () => {
        const concurrent: Set<string> = new Set();
        let maxConcurrent = 0;

        const items = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
        await runBatch(
          items,
          (item) => item.id,
          async (item) => {
            concurrent.add(item.id);
            maxConcurrent = Math.max(maxConcurrent, concurrent.size);
            await new Promise((resolve) => setTimeout(resolve, 10));
            concurrent.delete(item.id);
            return success(item.id);
          },
          { concurrency: 3 }
        );

        expect(maxConcurrent).toBeLessThanOrEqual(3);
      });
    });

    describe('runBatchSync()', () => {
      it('should execute sync batch operations', () => {
        const items = [1, 2, 3];
        const batch = runBatchSync(
          items,
          (item) => String(item),
          (item) => success(item * 2)
        );

        expect(batch.allSucceeded).toBe(true);
        expect(batch.summary.total).toBe(3);
      });

      it('should stop on first error when option enabled', () => {
        const processed: number[] = [];
        const items = [1, 2, 3, 4, 5];
        const batch = runBatchSync(
          items,
          (item) => String(item),
          (item) => {
            processed.push(item);
            if (item === 3) return failure('ERR', 'Stop');
            return success(item);
          },
          { stopOnFirstError: true }
        );

        expect(processed).toEqual([1, 2, 3]);
        expect(batch.summary.total).toBe(3);
      });
    });

    describe('extractSuccesses()', () => {
      it('should extract successful results', () => {
        const batch = createBatchResult<number>(
          [
            { key: 'a', result: success(1) },
            { key: 'b', result: failure('ERR', 'fail') },
            { key: 'c', result: success(3) },
          ],
          Date.now()
        );

        const successes = extractSuccesses(batch);
        expect(successes).toEqual([
          { key: 'a', data: 1 },
          { key: 'c', data: 3 },
        ]);
      });

      it('should return empty array when all failed', () => {
        const batch = createBatchResult<number>(
          [{ key: 'a', result: failure('ERR', 'fail') }],
          Date.now()
        );

        expect(extractSuccesses(batch)).toEqual([]);
      });
    });

    describe('extractFailures()', () => {
      it('should extract failed results', () => {
        const batch = createBatchResult<number>(
          [
            { key: 'a', result: success(1) },
            { key: 'b', result: failure('ERR1', 'fail 1') },
            { key: 'c', result: failure('ERR2', 'fail 2') },
          ],
          Date.now()
        );

        const failures = extractFailures(batch);
        expect(failures).toHaveLength(2);
        expect(failures[0].key).toBe('b');
        expect(failures[0].error.code).toBe('ERR1');
        expect(failures[1].key).toBe('c');
        expect(failures[1].error.code).toBe('ERR2');
      });

      it('should return empty array when all succeeded', () => {
        const batch = createBatchResult<number>(
          [{ key: 'a', result: success(1) }],
          Date.now()
        );

        expect(extractFailures(batch)).toEqual([]);
      });
    });

    describe('getResultByKey()', () => {
      it('should find result by key', () => {
        const batch = createBatchResult<string>(
          [
            { key: 'a', result: success('value-a') },
            { key: 'b', result: success('value-b') },
          ],
          Date.now()
        );

        const result = getResultByKey(batch, 'b');
        expect(result).toBeDefined();
        expect(isSuccess(result!)).toBe(true);
        if (isSuccess(result!)) {
          expect(result!.data).toBe('value-b');
        }
      });

      it('should return undefined for missing key', () => {
        const batch = createBatchResult<string>(
          [{ key: 'a', result: success('value-a') }],
          Date.now()
        );

        expect(getResultByKey(batch, 'nonexistent')).toBeUndefined();
      });
    });

    describe('toResultMap()', () => {
      it('should convert to map', () => {
        const batch = createBatchResult<number>(
          [
            { key: 'a', result: success(1) },
            { key: 'b', result: success(2) },
          ],
          Date.now()
        );

        const map = toResultMap(batch);
        expect(map.size).toBe(2);
        expect(map.get('a')).toBeDefined();
        expect(unwrap(map.get('a')!)).toBe(1);
      });
    });

    describe('filterByKeys()', () => {
      it('should filter to specified keys', () => {
        const batch = createBatchResult<string>(
          [
            { key: 'a', result: success('a') },
            { key: 'b', result: success('b') },
            { key: 'c', result: success('c') },
          ],
          Date.now()
        );

        const filtered = filterByKeys(batch, ['a', 'c']);
        expect(filtered.results).toHaveLength(2);
        expect(filtered.succeededKeys).toEqual(['a', 'c']);
      });

      it('should handle non-existent keys', () => {
        const batch = createBatchResult<string>(
          [{ key: 'a', result: success('a') }],
          Date.now()
        );

        const filtered = filterByKeys(batch, ['x', 'y']);
        expect(filtered.results).toHaveLength(0);
      });
    });

    describe('mergeBatchResults()', () => {
      it('should merge multiple batch results', () => {
        const batch1 = createBatchResult<number>(
          [{ key: 'a', result: success(1) }],
          Date.now() - 200
        );
        const batch2 = createBatchResult<number>(
          [{ key: 'b', result: success(2) }],
          Date.now() - 100
        );

        const merged = mergeBatchResults([batch1, batch2]);
        expect(merged.results).toHaveLength(2);
        expect(merged.summary.total).toBe(2);
      });

      it('should handle empty array', () => {
        const merged = mergeBatchResults([]);
        expect(merged.results).toHaveLength(0);
        expect(merged.summary.total).toBe(0);
      });

      it('should use earliest start time', () => {
        const earlyStart = Date.now() - 1000;
        const lateStart = Date.now() - 100;

        const batch1 = createBatchResult<number>(
          [{ key: 'a', result: success(1) }],
          earlyStart
        );
        const batch2 = createBatchResult<number>(
          [{ key: 'b', result: success(2) }],
          lateStart
        );

        const merged = mergeBatchResults([batch1, batch2]);
        expect(merged.summary.startedAt).toBe(earlyStart);
      });
    });

    describe('retryFailed()', () => {
      it('should retry failed operations', async () => {
        const attempts = new Map<string, number>();

        // Initial batch with one failure
        const initialBatch = createBatchResult<number>(
          [
            { key: 'a', result: success(1) },
            { key: 'b', result: failure('ERR', 'temporary failure') },
          ],
          Date.now()
        );

        const items = [{ id: 'a' }, { id: 'b' }];

        const retried = await retryFailed(
          initialBatch,
          items,
          (item) => item.id,
          async (item) => {
            const count = (attempts.get(item.id) || 0) + 1;
            attempts.set(item.id, count);
            // Succeed on second attempt
            if (count >= 2) {
              return success(100);
            }
            return failure('ERR', 'still failing');
          },
          3
        );

        expect(retried.allSucceeded).toBe(true);
        expect(retried.summary.succeeded).toBe(2);
      });

      it('should keep successes from original batch', async () => {
        const initialBatch = createBatchResult<string>(
          [
            { key: 'a', result: success('original') },
            { key: 'b', result: failure('ERR', 'fail') },
          ],
          Date.now()
        );

        const items = [{ id: 'a' }, { id: 'b' }];

        const retried = await retryFailed(
          initialBatch,
          items,
          (item) => item.id,
          async () => success('retried'),
          1
        );

        const successes = extractSuccesses(retried);
        const originalSuccess = successes.find((s) => s.key === 'a');
        expect(originalSuccess?.data).toBe('original');
      });

      it('should handle max retries exceeded', async () => {
        const initialBatch = createBatchResult<number>(
          [{ key: 'a', result: failure('ERR', 'fail') }],
          Date.now()
        );

        const items = [{ id: 'a' }];
        let attempts = 0;

        const retried = await retryFailed(
          initialBatch,
          items,
          (item) => item.id,
          async () => {
            attempts++;
            return failure('ERR', 'persistent failure');
          },
          3
        );

        expect(attempts).toBe(3);
        expect(retried.allFailed).toBe(true);
      });
    });

    describe('batchBuilder()', () => {
      it('should provide fluent API for batch operations', async () => {
        const items = [{ id: '1', value: 10 }, { id: '2', value: 20 }];

        const batch = await batchBuilder(items)
          .keyBy((item) => item.id)
          .run(async (item) => success(item.value * 2));

        expect(batch.allSucceeded).toBe(true);
        const successes = extractSuccesses(batch);
        expect(successes).toEqual([
          { key: '1', data: 20 },
          { key: '2', data: 40 },
        ]);
      });

      it('should support stopOnFirstError', async () => {
        const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
        const processed: string[] = [];

        const batch = await batchBuilder(items)
          .keyBy((item) => item.id)
          .stopOnFirstError()
          .run(async (item) => {
            processed.push(item.id);
            if (item.id === '2') return failure('ERR', 'stop');
            return success(item.id);
          });

        expect(processed).toEqual(['1', '2']);
        expect(batch.summary.total).toBe(2);
      });

      it('should support sync operations', () => {
        const items = [1, 2, 3];

        const batch = batchBuilder(items)
          .keyBy((item) => String(item))
          .runSync((item) => success(item * 10));

        expect(batch.allSucceeded).toBe(true);
        expect(batch.summary.total).toBe(3);
      });

      it('should use index as key when no keyBy specified', async () => {
        const items = ['a', 'b', 'c'];

        const batch = await batchBuilder(items).run(async (item) => success(item));

        expect(batch.succeededKeys).toEqual(['0', '1', '2']);
      });

      it('should support concurrency setting', async () => {
        const concurrent: Set<number> = new Set();
        let maxConcurrent = 0;

        const items = Array.from({ length: 10 }, (_, i) => i);

        await batchBuilder(items)
          .keyBy((item) => String(item))
          .withConcurrency(2)
          .run(async (item) => {
            concurrent.add(item);
            maxConcurrent = Math.max(maxConcurrent, concurrent.size);
            await new Promise((resolve) => setTimeout(resolve, 10));
            concurrent.delete(item);
            return success(item);
          });

        expect(maxConcurrent).toBeLessThanOrEqual(2);
      });

      it('should support timeout setting', async () => {
        const items = [{ id: 'fast' }, { id: 'slow' }];

        const batch = await batchBuilder(items)
          .keyBy((item) => item.id)
          .withTimeout(50)
          .run(async (item) => {
            if (item.id === 'slow') {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
            return success(item.id);
          });

        expect(batch.failedKeys).toContain('slow');
        const failures = extractFailures(batch);
        const slowFailure = failures.find((f) => f.key === 'slow');
        expect(slowFailure?.error.code).toBe('OPERATION_TIMEOUT');
      });
    });
  });
});
