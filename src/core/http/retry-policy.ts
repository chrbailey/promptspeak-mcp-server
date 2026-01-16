/**
 * ===============================================================================
 * RETRY POLICY
 * ===============================================================================
 *
 * Reusable retry logic with exponential backoff and jitter.
 * Extracts common retry patterns from across the codebase.
 *
 * Usage:
 *   const policy = createRetryPolicy({ maxRetries: 3 });
 *   const result = await policy.execute(() => fetch(url));
 *
 * ===============================================================================
 */

import { isPromptSpeakError } from '../errors/index.js';

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial backoff delay in milliseconds (default: 1000) */
  initialDelayMs: number;
  /** Maximum backoff delay in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier for exponential growth (default: 2) */
  backoffMultiplier: number;
  /** Whether to add jitter to prevent thundering herd (default: true) */
  jitter: boolean;
  /** Jitter factor (0-1, default: 0.1 = ±10%) */
  jitterFactor: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.1,
};

// -----------------------------------------------------------------------------
// RETRY POLICY
// -----------------------------------------------------------------------------

/**
 * Determines if an error should be retried.
 */
export type ShouldRetryFn = (error: Error, attempt: number) => boolean;

/**
 * Called before each retry attempt.
 */
export type OnRetryFn = (error: Error, attempt: number, delayMs: number) => void;

/**
 * Retry policy options.
 */
export interface RetryPolicyOptions extends Partial<RetryConfig> {
  /** Custom function to determine if error is retryable */
  shouldRetry?: ShouldRetryFn;
  /** Callback before each retry */
  onRetry?: OnRetryFn;
}

/**
 * Retry policy for executing operations with automatic retries.
 */
export class RetryPolicy {
  private readonly config: RetryConfig;
  private readonly shouldRetry: ShouldRetryFn;
  private readonly onRetry?: OnRetryFn;

  constructor(options: RetryPolicyOptions = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...options };
    this.shouldRetry = options.shouldRetry ?? defaultShouldRetry;
    this.onRetry = options.onRetry;
  }

  /**
   * Execute an operation with retry logic.
   *
   * @param operation - Async function to execute
   * @returns Result of the operation
   * @throws Last error if all retries exhausted
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        // Check if we should retry
        if (attempt > this.config.maxRetries || !this.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Calculate backoff delay
        const delayMs = this.calculateDelay(attempt);

        // Notify callback
        if (this.onRetry) {
          this.onRetry(lastError, attempt, delayMs);
        }

        // Wait before retry
        await sleep(delayMs);
      }
    }

    throw lastError ?? new Error('Retry exhausted');
  }

  /**
   * Calculate delay for a given attempt using exponential backoff.
   */
  calculateDelay(attempt: number): number {
    const baseDelay = this.config.initialDelayMs *
      Math.pow(this.config.backoffMultiplier, attempt - 1);

    let delay = Math.min(baseDelay, this.config.maxDelayMs);

    // Add jitter if enabled
    if (this.config.jitter) {
      const jitterRange = delay * this.config.jitterFactor;
      const jitter = (Math.random() * 2 - 1) * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }
}

// -----------------------------------------------------------------------------
// FACTORY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Create a retry policy with the given options.
 */
export function createRetryPolicy(options?: RetryPolicyOptions): RetryPolicy {
  return new RetryPolicy(options);
}

/**
 * Create a retry policy that never retries.
 */
export function noRetry(): RetryPolicy {
  return new RetryPolicy({ maxRetries: 0 });
}

/**
 * Create a retry policy for transient failures only.
 */
export function retryTransient(maxRetries: number = 3): RetryPolicy {
  return new RetryPolicy({
    maxRetries,
    shouldRetry: (error) => {
      if (isPromptSpeakError(error)) {
        return error.retryable ?? false;
      }
      // Retry network-like errors by default
      return error.name === 'TypeError' || error.message.includes('network');
    },
  });
}

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Default retry decision function.
 * Uses PromptSpeakError's retryable flag when available.
 */
function defaultShouldRetry(error: Error): boolean {
  if (isPromptSpeakError(error)) {
    return error.retryable ?? false;
  }
  // Default: retry on network-like errors
  return error.name === 'TypeError' ||
         error.message.toLowerCase().includes('network') ||
         error.message.toLowerCase().includes('timeout');
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with a simple retry loop.
 * Convenience function for one-off retry needs.
 *
 * @param operation - Async function to execute
 * @param options - Retry options
 * @returns Result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryPolicyOptions
): Promise<T> {
  const policy = createRetryPolicy(options);
  return policy.execute(operation);
}
