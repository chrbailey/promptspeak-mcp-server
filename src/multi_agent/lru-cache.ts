/**
 * ===============================================================================
 * LRU CACHE WITH TTL SUPPORT
 * ===============================================================================
 *
 * LRU Cache with TTL support for multi-agent state management.
 * Prevents unbounded memory growth from stored intents, bindings, and missions.
 *
 * Features:
 * - Least Recently Used eviction when capacity is reached
 * - Time-To-Live (TTL) for automatic expiration
 * - Optional eviction callback for cleanup
 * - Efficient O(1) get/set operations using Map ordering
 *
 * ===============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for LRU Cache.
 */
export interface LRUCacheConfig {
  /** Maximum number of entries before eviction occurs */
  maxSize: number;
  /** Time-to-live in milliseconds (optional, defaults to Infinity) */
  ttlMs?: number;
  /** Callback invoked when an entry is evicted (optional) */
  onEvict?: (key: string, value: unknown) => void;
}

/**
 * Internal cache entry with metadata.
 */
interface CacheEntry<T> {
  value: T;
  lastAccess: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU CACHE CLASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LRU Cache with TTL support.
 *
 * Uses Map's insertion order to track recency efficiently.
 * When an item is accessed, it's deleted and re-inserted to move it to the end.
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: Required<LRUCacheConfig>;

  constructor(config: LRUCacheConfig) {
    if (config.maxSize <= 0) {
      throw new Error('LRUCache maxSize must be greater than 0');
    }

    this.config = {
      maxSize: config.maxSize,
      ttlMs: config.ttlMs ?? Infinity,
      onEvict: config.onEvict ?? (() => {}),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CORE OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set a value in the cache.
   * Evicts LRU entry if at capacity and key doesn't exist.
   */
  set(key: string, value: T): void {
    // If key exists, delete first to reset position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.config.maxSize) {
      // Evict LRU (first entry in Map)
      this.evictLRU();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      lastAccess: now,
      createdAt: now,
    });
  }

  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   * Updates access time and position for LRU tracking.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.createdAt > this.config.ttlMs) {
      this.delete(key);
      return undefined;
    }

    // Update access time and move to end (most recently used)
    entry.lastAccess = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete an entry from the cache.
   * Invokes the onEvict callback if entry exists.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.config.onEvict(key, entry.value);
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries from the cache.
   * Invokes onEvict callback for each entry.
   */
  clear(): void {
    this.cache.forEach((entry, key) => {
      this.config.onEvict(key, entry.value);
    });
    this.cache.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EVICTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Evict the least recently used entry.
   * Uses Map iteration order (oldest first).
   */
  private evictLRU(): void {
    // Find the oldest entry by lastAccess time
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Clean up expired entries.
   * Returns the number of entries evicted.
   */
  cleanup(): number {
    const now = Date.now();
    let evicted = 0;

    // Collect keys to delete (avoid modifying during iteration)
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt > this.config.ttlMs) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.delete(key);
      evicted++;
    });

    return evicted;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESSORS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all values in the cache (excluding expired).
   */
  values(): T[] {
    const now = Date.now();
    const result: T[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt <= this.config.ttlMs) {
        result.push(entry.value);
      }
    });

    return result;
  }

  /**
   * Get all keys in the cache (excluding expired).
   */
  keys(): string[] {
    const now = Date.now();
    const result: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt <= this.config.ttlMs) {
        result.push(key);
      }
    });

    return result;
  }

  /**
   * Get all entries as [key, value] pairs (excluding expired).
   */
  entries(): [string, T][] {
    const now = Date.now();
    const result: [string, T][] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt <= this.config.ttlMs) {
        result.push([key, entry.value]);
      }
    });

    return result;
  }

  /**
   * Get the current number of entries (may include expired entries).
   * Use cleanup() first for accurate count.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  stats(): {
    size: number;
    maxSize: number;
    ttlMs: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ITERATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Iterate over cache entries with forEach.
   * Excludes expired entries.
   */
  forEach(callback: (value: T, key: string) => void): void {
    const now = Date.now();

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt <= this.config.ttlMs) {
        callback(entry.value, key);
      }
    });
  }

  /**
   * Filter entries matching a predicate.
   * Excludes expired entries.
   */
  filter(predicate: (value: T, key: string) => boolean): T[] {
    const now = Date.now();
    const result: T[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.createdAt <= this.config.ttlMs && predicate(entry.value, key)) {
        result.push(entry.value);
      }
    });

    return result;
  }

  /**
   * Find first entry matching a predicate.
   * Excludes expired entries.
   * Note: Uses Array.from for early exit support.
   */
  find(predicate: (value: T, key: string) => boolean): T | undefined {
    const now = Date.now();
    const entriesArray = Array.from(this.cache.entries());

    for (let i = 0; i < entriesArray.length; i++) {
      const [key, entry] = entriesArray[i];
      if (now - entry.createdAt <= this.config.ttlMs && predicate(entry.value, key)) {
        return entry.value;
      }
    }

    return undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TTL MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update the TTL for a specific entry.
   * Useful for extending the life of active items.
   */
  touch(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Reset creation time to extend TTL
    entry.createdAt = Date.now();
    entry.lastAccess = Date.now();

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return true;
  }

  /**
   * Get the remaining TTL for an entry in milliseconds.
   * Returns 0 if expired or not found.
   */
  ttlRemaining(key: string): number {
    const entry = this.cache.get(key);
    if (!entry) return 0;

    const remaining = this.config.ttlMs - (Date.now() - entry.createdAt);
    return Math.max(0, remaining);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an LRU cache with common presets.
 */
export function createLRUCache<T>(
  maxSize: number,
  options?: {
    ttlMs?: number;
    onEvict?: (key: string, value: unknown) => void;
  }
): LRUCache<T> {
  return new LRUCache<T>({
    maxSize,
    ttlMs: options?.ttlMs,
    onEvict: options?.onEvict,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** One hour in milliseconds */
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** 12 hours in milliseconds */
export const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS;

/** 24 hours in milliseconds */
export const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

/** 7 days in milliseconds */
export const SEVEN_DAYS_MS = 7 * TWENTY_FOUR_HOURS_MS;
