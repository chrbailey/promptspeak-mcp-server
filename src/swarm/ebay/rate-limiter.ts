/**
 * eBay API Rate Limiter
 *
 * Token bucket rate limiter with exponential backoff for eBay API compliance.
 * Tracks usage across multiple time windows (per minute, per day).
 */

import { getRateLimits } from './sandbox-config.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * API category for rate limiting.
 */
export type ApiCategory = 'browse' | 'offer' | 'order';

/**
 * Rate limit configuration.
 */
interface RateLimitConfig {
  perMinute: number;
  perDay: number;
}

/**
 * Rate limiter state for a category.
 */
interface RateLimiterState {
  // Per-minute tracking
  minuteWindowStart: number;
  minuteTokens: number;

  // Per-day tracking
  dayWindowStart: number;
  dayTokens: number;

  // Backoff state
  backoffUntil: number;
  consecutiveFailures: number;
}

/**
 * Rate limit status for a single category.
 */
export interface RateLimitStatus {
  minuteTokens: number;
  minuteLimit: number;
  dayTokens: number;
  dayLimit: number;
  inBackoff: boolean;
  backoffRemainingMs: number;
}

/**
 * Rate limit status for all categories.
 */
export type RateLimitAllStatus = Record<ApiCategory, RateLimitStatus>;

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Token bucket rate limiter for eBay API.
 */
export class EbayRateLimiter {
  private state: Map<ApiCategory, RateLimiterState> = new Map();
  private limits: ReturnType<typeof getRateLimits>;

  // Backoff configuration
  private readonly baseBackoffMs = 1000;
  private readonly maxBackoffMs = 60000;
  private readonly backoffMultiplier = 2;

  constructor() {
    this.limits = getRateLimits();
    this.initializeState();
  }

  /**
   * Initialize rate limiter state for all categories.
   */
  private initializeState(): void {
    const categories: ApiCategory[] = ['browse', 'offer', 'order'];
    const now = Date.now();

    for (const category of categories) {
      const config = this.limits[category];
      this.state.set(category, {
        minuteWindowStart: now,
        minuteTokens: config.perMinute,
        dayWindowStart: now,
        dayTokens: config.perDay,
        backoffUntil: 0,
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Check if a request can proceed.
   * Returns true if request is allowed, false if rate limited.
   */
  canProceed(category: ApiCategory): boolean {
    this.refreshWindows(category);
    const state = this.state.get(category)!;

    // Check backoff
    if (Date.now() < state.backoffUntil) {
      return false;
    }

    // Check tokens
    return state.minuteTokens > 0 && state.dayTokens > 0;
  }

  /**
   * Acquire a token for making a request.
   * Returns time to wait in ms if rate limited, 0 if request can proceed.
   */
  acquire(category: ApiCategory): number {
    this.refreshWindows(category);
    const state = this.state.get(category)!;

    // Check backoff first
    if (Date.now() < state.backoffUntil) {
      return state.backoffUntil - Date.now();
    }

    // Check per-minute limit
    if (state.minuteTokens <= 0) {
      const waitTime = 60000 - (Date.now() - state.minuteWindowStart);
      return Math.max(0, waitTime);
    }

    // Check per-day limit
    if (state.dayTokens <= 0) {
      const waitTime = 86400000 - (Date.now() - state.dayWindowStart);
      return Math.max(0, waitTime);
    }

    // Consume tokens
    state.minuteTokens--;
    state.dayTokens--;

    return 0;
  }

  /**
   * Acquire with automatic waiting.
   * Returns a promise that resolves when the request can proceed.
   */
  async acquireWithWait(category: ApiCategory, maxWaitMs: number = 30000): Promise<void> {
    const waitTime = this.acquire(category);

    if (waitTime === 0) {
      return;
    }

    if (waitTime > maxWaitMs) {
      throw new EbayRateLimitError(
        `Rate limit would require waiting ${waitTime}ms, exceeds max wait of ${maxWaitMs}ms`,
        category,
        waitTime
      );
    }

    await this.sleep(waitTime);

    // Try again after waiting
    return this.acquireWithWait(category, maxWaitMs - waitTime);
  }

  /**
   * Record a successful request.
   * Resets backoff state.
   */
  recordSuccess(category: ApiCategory): void {
    const state = this.state.get(category)!;
    state.consecutiveFailures = 0;
    state.backoffUntil = 0;
  }

  /**
   * Record a failed request.
   * Applies exponential backoff.
   */
  recordFailure(category: ApiCategory, statusCode?: number): void {
    const state = this.state.get(category)!;

    // Only apply backoff for rate limit errors (429) or server errors (5xx)
    if (statusCode && statusCode !== 429 && statusCode < 500) {
      return;
    }

    state.consecutiveFailures++;

    // Calculate backoff time with exponential increase
    const backoffMs = Math.min(
      this.baseBackoffMs * Math.pow(this.backoffMultiplier, state.consecutiveFailures - 1),
      this.maxBackoffMs
    );

    // Add jitter (±10%)
    const jitter = backoffMs * 0.1 * (Math.random() * 2 - 1);
    state.backoffUntil = Date.now() + backoffMs + jitter;
  }

  /**
   * Refresh token windows if they've expired.
   */
  private refreshWindows(category: ApiCategory): void {
    const state = this.state.get(category)!;
    const config = this.limits[category];
    const now = Date.now();

    // Refresh per-minute window
    if (now - state.minuteWindowStart >= 60000) {
      state.minuteWindowStart = now;
      state.minuteTokens = config.perMinute;
    }

    // Refresh per-day window
    if (now - state.dayWindowStart >= 86400000) {
      state.dayWindowStart = now;
      state.dayTokens = config.perDay;
    }
  }

  /**
   * Get current rate limiter status.
   */
  getStatus(category: ApiCategory): RateLimitStatus {
    this.refreshWindows(category);
    const state = this.state.get(category)!;
    const config = this.limits[category];
    const now = Date.now();

    return {
      minuteTokens: state.minuteTokens,
      minuteLimit: config.perMinute,
      dayTokens: state.dayTokens,
      dayLimit: config.perDay,
      inBackoff: now < state.backoffUntil,
      backoffRemainingMs: Math.max(0, state.backoffUntil - now),
    };
  }

  /**
   * Get status for all categories.
   */
  getAllStatus(): RateLimitAllStatus {
    return {
      browse: this.getStatus('browse'),
      offer: this.getStatus('offer'),
      order: this.getStatus('order'),
    };
  }

  /**
   * Reset rate limiter (for testing).
   */
  reset(): void {
    this.initializeState();
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay-specific rate limit error.
 * Contains category and wait time information specific to eBay API rate limiting.
 *
 * Note: For general rate limit errors, use RateLimitError from core/errors.
 * This class is specifically for eBay API rate limiting with category tracking.
 */
export class EbayRateLimitError extends Error {
  constructor(
    message: string,
    public readonly category: ApiCategory,
    public readonly waitTimeMs: number
  ) {
    super(message);
    this.name = 'EbayRateLimitError';
  }
}

/**
 * @deprecated Use EbayRateLimitError instead. This alias exists for backwards compatibility.
 */
export const RateLimitError = EbayRateLimitError;

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let rateLimiterInstance: EbayRateLimiter | null = null;

/**
 * Get the rate limiter singleton.
 */
export function getEbayRateLimiter(): EbayRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new EbayRateLimiter();
  }
  return rateLimiterInstance;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECORATOR FOR RATE LIMITED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decorator to rate limit a function.
 * Usage: @rateLimited('browse')
 */
export function rateLimited(category: ApiCategory) {
  return function <T extends (...args: any[]) => Promise<any>>(
    _target: any,
    _propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;

    descriptor.value = async function (this: any, ...args: any[]) {
      const limiter = getEbayRateLimiter();

      await limiter.acquireWithWait(category);

      try {
        const result = await originalMethod.apply(this, args);
        limiter.recordSuccess(category);
        return result;
      } catch (error: any) {
        limiter.recordFailure(category, error?.status || error?.statusCode);
        throw error;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Wrap a function with rate limiting.
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  category: ApiCategory
): T {
  return (async (...args: Parameters<T>) => {
    const limiter = getEbayRateLimiter();

    await limiter.acquireWithWait(category);

    try {
      const result = await fn(...args);
      limiter.recordSuccess(category);
      return result;
    } catch (error: any) {
      limiter.recordFailure(category, error?.status || error?.statusCode);
      throw error;
    }
  }) as T;
}
