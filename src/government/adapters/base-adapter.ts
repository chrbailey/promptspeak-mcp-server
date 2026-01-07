/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOVERNMENT DATA ADAPTER - BASE CLASS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstract base class for government data API adapters.
 * Provides common functionality:
 *   - Rate limiting (sliding window algorithm)
 *   - Caching (LRU with TTL)
 *   - Retry with exponential backoff
 *   - Circuit breaker pattern (prevents cascading failures)
 *   - Error handling and logging
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { DirectiveSymbol } from '../../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limit configuration for an adapter.
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Maximum requests per hour (optional) */
  requestsPerHour?: number;
  /** Maximum requests per day (optional) */
  requestsPerDay?: number;
  /** Minimum delay between requests in milliseconds */
  minDelayMs?: number;
}

/**
 * Cache configuration for an adapter.
 */
export interface CacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Maximum number of cached entries */
  maxSize: number;
}

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial backoff delay in milliseconds */
  initialDelayMs: number;
  /** Maximum backoff delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier (e.g., 2 for exponential) */
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes: number[];
}

/**
 * Base adapter configuration.
 */
export interface BaseAdapterConfig {
  /** Base URL for the API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Rate limiting configuration */
  rateLimit: RateLimitConfig;
  /** Cache configuration */
  cache: CacheConfig;
  /** Retry configuration */
  retry: RetryConfig;
  /** API key (if required) */
  apiKey?: string;
  /** Header name for API key */
  apiKeyHeader?: string;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 60 * 60 * 1000, // 1 hour
  maxSize: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a lookup operation.
 */
export interface LookupResult<T> {
  /** Whether the lookup was successful */
  success: boolean;
  /** The fetched data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Timestamp of the data */
  timestamp: string;
  /** Source API endpoint */
  source: string;
}

/**
 * Result of a batch lookup operation.
 */
export interface BatchLookupResult<T> {
  /** Successfully fetched results */
  results: Map<string, T>;
  /** Failed lookups with error messages */
  errors: Map<string, string>;
  /** Total items requested */
  totalRequested: number;
  /** Total items successfully fetched */
  totalSucceeded: number;
  /** Whether some results came from cache */
  partialCache: boolean;
}

/**
 * Adapter statistics for monitoring.
 */
export interface AdapterStats {
  /** Total number of requests made */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Requests that were rate limited */
  rateLimitedRequests: number;
  /** Total retries performed */
  totalRetries: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Custom error class for adapter-specific errors.
 */
export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly code: AdapterErrorCode,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export type AdapterErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'CIRCUIT_OPEN'
  | 'UNKNOWN';

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Circuit breaker state tracking.
 */
export interface CircuitBreakerState {
  /** Current state of the circuit breaker */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  /** Number of consecutive failures */
  failureCount: number;
  /** Number of successes in HALF_OPEN state */
  successCount: number;
  /** Timestamp of last failure */
  lastFailureTime: number;
  /** Timestamp of last state change */
  lastStateChange: number;
}

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes in HALF_OPEN before closing the circuit */
  successThreshold: number;
  /** Duration to stay in OPEN state before trying HALF_OPEN (milliseconds) */
  openDurationMs: number;
  /** Error codes that should trigger the circuit breaker */
  monitoredErrors: string[];
}

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  openDurationMs: 60000, // 1 minute
  monitoredErrors: ['SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER (SLIDING WINDOW)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sliding window rate limiter implementation.
 */
export class SlidingWindowRateLimiter {
  private minuteWindow: number[] = [];
  private hourWindow: number[] = [];
  private dayWindow: number[] = [];
  private lastRequestTime: number = 0;

  constructor(private config: RateLimitConfig) {}

  /**
   * Check if a request can be made without exceeding rate limits.
   */
  canMakeRequest(): boolean {
    this.cleanupWindows();

    // Check minute limit
    if (this.minuteWindow.length >= this.config.requestsPerMinute) {
      return false;
    }

    // Check hour limit if configured
    if (
      this.config.requestsPerHour &&
      this.hourWindow.length >= this.config.requestsPerHour
    ) {
      return false;
    }

    // Check day limit if configured
    if (
      this.config.requestsPerDay &&
      this.dayWindow.length >= this.config.requestsPerDay
    ) {
      return false;
    }

    // Check minimum delay
    if (this.config.minDelayMs) {
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.config.minDelayMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record a request in the rate limiter.
   */
  recordRequest(): void {
    const now = Date.now();
    this.minuteWindow.push(now);
    this.hourWindow.push(now);
    this.dayWindow.push(now);
    this.lastRequestTime = now;
  }

  /**
   * Get time until next request is allowed (in milliseconds).
   */
  getWaitTime(): number {
    this.cleanupWindows();

    const now = Date.now();
    let waitTime = 0;

    // Check minute window
    if (this.minuteWindow.length >= this.config.requestsPerMinute) {
      const oldestInMinute = this.minuteWindow[0];
      const minuteWait = oldestInMinute + 60000 - now;
      waitTime = Math.max(waitTime, minuteWait);
    }

    // Check hour window
    if (
      this.config.requestsPerHour &&
      this.hourWindow.length >= this.config.requestsPerHour
    ) {
      const oldestInHour = this.hourWindow[0];
      const hourWait = oldestInHour + 3600000 - now;
      waitTime = Math.max(waitTime, hourWait);
    }

    // Check day window
    if (
      this.config.requestsPerDay &&
      this.dayWindow.length >= this.config.requestsPerDay
    ) {
      const oldestInDay = this.dayWindow[0];
      const dayWait = oldestInDay + 86400000 - now;
      waitTime = Math.max(waitTime, dayWait);
    }

    // Check minimum delay
    if (this.config.minDelayMs) {
      const delayWait = this.lastRequestTime + this.config.minDelayMs - now;
      waitTime = Math.max(waitTime, delayWait);
    }

    return Math.max(0, waitTime);
  }

  /**
   * Get remaining requests in each window.
   */
  getRemainingRequests(): {
    minute: number;
    hour: number | null;
    day: number | null;
  } {
    this.cleanupWindows();
    return {
      minute: Math.max(0, this.config.requestsPerMinute - this.minuteWindow.length),
      hour: this.config.requestsPerHour
        ? Math.max(0, this.config.requestsPerHour - this.hourWindow.length)
        : null,
      day: this.config.requestsPerDay
        ? Math.max(0, this.config.requestsPerDay - this.dayWindow.length)
        : null,
    };
  }

  /**
   * Clean up expired entries from all windows.
   */
  private cleanupWindows(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    this.minuteWindow = this.minuteWindow.filter((t) => t > oneMinuteAgo);
    this.hourWindow = this.hourWindow.filter((t) => t > oneHourAgo);
    this.dayWindow = this.dayWindow.filter((t) => t > oneDayAgo);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LRU CACHE WITH TTL
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * LRU cache with TTL support.
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];

  constructor(private config: CacheConfig) {}

  /**
   * Get an item from the cache.
   */
  get(key: string): T | null {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    // Update access order (LRU)
    this.updateAccessOrder(key);

    return entry.data;
  }

  /**
   * Set an item in the cache.
   */
  set(key: string, data: T): void {
    if (!this.config.enabled) return;

    // Evict if at capacity
    while (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + this.config.ttlMs,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Delete an item from the cache.
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    return existed;
  }

  /**
   * Check if an item exists in the cache.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }

  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    this.accessOrder.push(key);
  }

  private evictOldest(): void {
    if (this.accessOrder.length === 0) return;
    const oldest = this.accessOrder.shift();
    if (oldest) {
      this.cache.delete(oldest);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABSTRACT BASE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class for government data adapters.
 */
export abstract class BaseGovernmentAdapter<TConfig extends BaseAdapterConfig, TRecord> {
  protected rateLimiter: SlidingWindowRateLimiter;
  protected cache: LRUCache<TRecord>;
  protected stats: AdapterStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    rateLimitedRequests: 0,
    totalRetries: 0,
    avgResponseTimeMs: 0,
  };
  private totalResponseTime: number = 0;

  /**
   * Circuit breaker configuration.
   * Can be overridden by subclasses.
   */
  protected readonly circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    openDurationMs: 60000, // 1 minute
    monitoredErrors: ['SERVER_ERROR', 'NETWORK_ERROR', 'TIMEOUT'],
  };

  /**
   * Circuit breaker state.
   */
  protected circuitBreaker: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    lastStateChange: Date.now(),
  };

  constructor(protected config: TConfig) {
    this.rateLimiter = new SlidingWindowRateLimiter(config.rateLimit);
    this.cache = new LRUCache(config.cache);
  }

  /**
   * Abstract method to get the adapter name (for logging).
   */
  protected abstract getAdapterName(): string;

  /**
   * Abstract method to generate a cache key from lookup parameters.
   */
  protected abstract getCacheKey(params: Record<string, unknown>): string;

  /**
   * Abstract method to convert API response to the record type.
   */
  protected abstract parseResponse(data: unknown): TRecord;

  /**
   * Abstract method to convert a record to a PromptSpeak symbol.
   */
  public abstract toSymbol(record: TRecord): DirectiveSymbol;

  /**
   * Abstract lookup method to be implemented by subclasses.
   */
  public abstract lookup(params: Record<string, unknown>): Promise<LookupResult<TRecord>>;

  /**
   * Abstract batch lookup method to be implemented by subclasses.
   */
  public abstract lookupBatch(
    paramsList: Record<string, unknown>[]
  ): Promise<BatchLookupResult<TRecord>>;

  // ═══════════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Check the circuit breaker state before making a request.
   * Throws AdapterError with CIRCUIT_OPEN code if circuit is open.
   * Transitions from OPEN to HALF_OPEN if enough time has passed.
   */
  protected checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === 'OPEN') {
      const now = Date.now();
      if (now - this.circuitBreaker.lastStateChange >= this.circuitBreakerConfig.openDurationMs) {
        // Transition to HALF_OPEN
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.successCount = 0;
        this.circuitBreaker.lastStateChange = now;
        console.log(`[${this.getAdapterName()}] Circuit breaker: OPEN -> HALF_OPEN`);
      } else {
        throw new AdapterError(
          `Circuit breaker is OPEN - ${this.getAdapterName()} temporarily unavailable`,
          'CIRCUIT_OPEN',
          503,
          false
        );
      }
    }
  }

  /**
   * Record a successful request for circuit breaker state management.
   * In HALF_OPEN state, transitions to CLOSED after enough successes.
   * In CLOSED state, resets the failure count.
   */
  protected recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= this.circuitBreakerConfig.successThreshold) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.lastStateChange = Date.now();
        console.log(`[${this.getAdapterName()}] Circuit breaker: HALF_OPEN -> CLOSED`);
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount = 0; // Reset on success
    }
  }

  /**
   * Record a failed request for circuit breaker state management.
   * Only counts failures for monitored error codes.
   * In HALF_OPEN state, immediately transitions back to OPEN.
   * In CLOSED state, transitions to OPEN after threshold is reached.
   */
  protected recordFailure(errorCode: string): void {
    if (!this.circuitBreakerConfig.monitoredErrors.includes(errorCode)) {
      return; // Don't count non-monitored errors
    }

    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN goes back to OPEN
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.lastStateChange = Date.now();
      console.log(`[${this.getAdapterName()}] Circuit breaker: HALF_OPEN -> OPEN`);
    } else if (this.circuitBreaker.failureCount >= this.circuitBreakerConfig.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.lastStateChange = Date.now();
      console.log(`[${this.getAdapterName()}] Circuit breaker: CLOSED -> OPEN (${this.circuitBreaker.failureCount} failures)`);
    }
  }

  /**
   * Get the current circuit breaker status for monitoring.
   */
  public getCircuitBreakerStatus(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // REQUEST METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Make an HTTP request with rate limiting, caching, circuit breaker, and retry logic.
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      cacheKey?: string;
      skipCache?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, cacheKey, skipCache = false } = options;

    // Check cache first
    if (!skipCache && cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached !== null) {
        this.stats.cacheHits++;
        return cached as T;
      }
      this.stats.cacheMisses++;
    }

    // Check circuit breaker before making request
    this.checkCircuitBreaker();

    // Wait for rate limit if necessary
    await this.waitForRateLimit();

    const startTime = Date.now();
    this.stats.totalRequests++;

    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount <= this.config.retry.maxRetries) {
      try {
        const result = await this.executeRequest<T>(endpoint, method, body, headers);

        // Record successful request
        this.rateLimiter.recordRequest();
        this.stats.successfulRequests++;
        this.recordResponseTime(Date.now() - startTime);
        this.recordSuccess(); // Update circuit breaker

        // Cache the result
        if (cacheKey) {
          this.cache.set(cacheKey, result as TRecord);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (error instanceof AdapterError && error.retryable && retryCount < this.config.retry.maxRetries) {
          retryCount++;
          this.stats.totalRetries++;
          const delay = this.calculateBackoff(retryCount);
          console.warn(
            `[${this.getAdapterName()}] Retry ${retryCount}/${this.config.retry.maxRetries} after ${delay}ms: ${error.message}`
          );
          await this.sleep(delay);
          continue;
        }

        // Non-retryable error or max retries exceeded
        break;
      }
    }

    this.stats.failedRequests++;

    // Update circuit breaker with failure
    if (lastError instanceof AdapterError) {
      this.recordFailure(lastError.code);
    }

    throw lastError;
  }

  /**
   * Execute the actual HTTP request.
   */
  private async executeRequest<T>(
    endpoint: string,
    method: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseUrl}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    };

    // Add API key if configured
    if (this.config.apiKey && this.config.apiKeyHeader) {
      requestHeaders[this.config.apiKeyHeader] = this.config.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle HTTP errors
      if (!response.ok) {
        const errorCode = this.mapHttpStatusToErrorCode(response.status);
        const retryable = this.config.retry.retryableStatusCodes.includes(response.status);

        if (response.status === 429) {
          this.stats.rateLimitedRequests++;
        }

        throw new AdapterError(
          `HTTP ${response.status}: ${response.statusText}`,
          errorCode,
          response.status,
          retryable
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof AdapterError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AdapterError('Request timed out', 'TIMEOUT', undefined, true, error);
        }
        throw new AdapterError(`Network error: ${error.message}`, 'NETWORK_ERROR', undefined, true, error);
      }

      throw new AdapterError('Unknown error', 'UNKNOWN', undefined, false);
    }
  }

  /**
   * Wait for rate limit to allow a request.
   */
  protected async waitForRateLimit(): Promise<void> {
    const waitTime = this.rateLimiter.getWaitTime();
    if (waitTime > 0) {
      console.log(`[${this.getAdapterName()}] Rate limited, waiting ${waitTime}ms...`);
      await this.sleep(waitTime);
    }
  }

  /**
   * Calculate exponential backoff delay.
   */
  private calculateBackoff(retryCount: number): number {
    const delay =
      this.config.retry.initialDelayMs *
      Math.pow(this.config.retry.backoffMultiplier, retryCount - 1);
    return Math.min(delay, this.config.retry.maxDelayMs);
  }

  /**
   * Map HTTP status code to adapter error code.
   */
  private mapHttpStatusToErrorCode(status: number): AdapterErrorCode {
    if (status === 401 || status === 403) return 'AUTH_FAILED';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVER_ERROR';
    return 'UNKNOWN';
  }

  /**
   * Record response time for statistics.
   */
  private recordResponseTime(timeMs: number): void {
    this.totalResponseTime += timeMs;
    this.stats.avgResponseTimeMs = this.totalResponseTime / this.stats.successfulRequests;
  }

  /**
   * Sleep for a specified duration.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get adapter statistics.
   */
  public getStats(): AdapterStats {
    return { ...this.stats };
  }

  /**
   * Get rate limit status.
   */
  public getRateLimitStatus(): ReturnType<SlidingWindowRateLimiter['getRemainingRequests']> {
    return this.rateLimiter.getRemainingRequests();
  }

  /**
   * Clear the cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics.
   */
  public getCacheStats(): ReturnType<LRUCache<TRecord>['getStats']> {
    return this.cache.getStats();
  }

  /**
   * Update configuration.
   */
  public updateConfig(updates: Partial<TConfig>): void {
    this.config = { ...this.config, ...updates };
    if (updates.rateLimit) {
      this.rateLimiter = new SlidingWindowRateLimiter(this.config.rateLimit);
    }
    if (updates.cache) {
      this.cache = new LRUCache(this.config.cache);
    }
  }
}
