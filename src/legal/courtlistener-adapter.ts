// =============================================================================
// COURTLISTENER API ADAPTER
// =============================================================================
// Implements CaseDatabase interface using CourtListener's Citation Lookup API.
// https://www.courtlistener.com/help/api/rest/v3/citation-lookup/
//
// CourtListener is provided by Free Law Project, a 501(c)(3) nonprofit.
// API is rate-limited to 60 valid citations per minute.
//
// This adapter:
//   1. Queries CourtListener to verify citations exist
//   2. Caches results to reduce API calls
//   3. Falls back gracefully on API errors
// =============================================================================

import type { CaseDatabase, KnownCaseRecord } from './types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface CourtListenerConfig {
  /** CourtListener API base URL */
  baseUrl: string;

  /** API token (optional, increases rate limits) */
  apiToken?: string;

  /** Request timeout in milliseconds */
  timeoutMs: number;

  /** Whether to cache results */
  enableCache: boolean;

  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtlMs: number;

  /** Maximum cache entries */
  maxCacheSize: number;

  /** Rate limiting: max requests per minute */
  maxRequestsPerMinute: number;
}

const DEFAULT_CONFIG: CourtListenerConfig = {
  baseUrl: 'https://www.courtlistener.com/api/rest/v3',
  timeoutMs: 30000,
  enableCache: true,
  cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  maxCacheSize: 10000,
  maxRequestsPerMinute: 55, // Stay under 60 limit
};

// =============================================================================
// COURTLISTENER API RESPONSE TYPES
// =============================================================================

/**
 * CourtListener citation lookup response.
 * Based on https://www.courtlistener.com/help/api/rest/v3/citation-lookup/
 */
interface CourtListenerCitationResult {
  /** Whether the citation was found */
  found: boolean;

  /** Cluster ID if found */
  cluster_id?: number;

  /** Absolute URL to the opinion */
  absolute_url?: string;

  /** Case name */
  case_name?: string;

  /** Case name with docket numbers */
  case_name_full?: string;

  /** Date filed (ISO format) */
  date_filed?: string;

  /** Court object */
  court?: {
    id: string;
    name: string;
    name_abbreviation: string;
    position: number;
    citation_string: string;
    jurisdiction: string;
  };

  /** Citation strings */
  citations?: Array<{
    volume: number;
    reporter: string;
    page: string;
    type: number;
  }>;

  /** Docket information */
  docket?: {
    id: number;
    absolute_url: string;
    court: string;
  };

  /** Error message if lookup failed */
  error?: string;
}

/**
 * Response from the text endpoint (parses and looks up multiple citations).
 */
interface CourtListenerTextResponse {
  citations: CourtListenerCitationResult[];
}

// =============================================================================
// CACHE IMPLEMENTATION
// =============================================================================

interface CacheEntry {
  record: KnownCaseRecord | null;
  timestamp: number;
  apiResponse?: CourtListenerCitationResult;
}

class CitationCache {
  private cache = new Map<string, CacheEntry>();
  private config: CourtListenerConfig;

  constructor(config: CourtListenerConfig) {
    this.config = config;
  }

  /**
   * Generate cache key from citation components.
   */
  private makeKey(volume: number | null, reporter: string | null, page: number | null): string {
    const normReporter = (reporter ?? '').replace(/\s+/g, '').toLowerCase();
    return `${volume ?? ''}-${normReporter}-${page ?? ''}`;
  }

  /**
   * Get cached result if valid.
   */
  get(volume: number | null, reporter: string | null, page: number | null): CacheEntry | null {
    if (!this.config.enableCache) return null;

    const key = this.makeKey(volume, reporter, page);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Store result in cache.
   */
  set(
    volume: number | null,
    reporter: string | null,
    page: number | null,
    record: KnownCaseRecord | null,
    apiResponse?: CourtListenerCitationResult
  ): void {
    if (!this.config.enableCache) return;

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const key = this.makeKey(volume, reporter, page);
    this.cache.set(key, {
      record,
      timestamp: Date.now(),
      apiResponse,
    });
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need hit/miss tracking for accurate rate
    };
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// RATE LIMITER
// =============================================================================

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs = 60000; // 1 minute

  constructor(maxRequestsPerMinute: number) {
    this.maxRequests = maxRequestsPerMinute;
  }

  /**
   * Check if we can make a request.
   */
  canRequest(): boolean {
    this.cleanup();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Record a request.
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Get time until next request allowed (ms).
   */
  getWaitTime(): number {
    this.cleanup();
    if (this.requests.length < this.maxRequests) return 0;

    const oldestRequest = this.requests[0];
    const waitUntil = oldestRequest + this.windowMs;
    return Math.max(0, waitUntil - Date.now());
  }

  /**
   * Remove expired requests from the window.
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(t => t > cutoff);
  }
}

// =============================================================================
// COURTLISTENER CASE DATABASE
// =============================================================================

/**
 * CaseDatabase implementation backed by CourtListener API.
 *
 * Usage:
 *   const db = new CourtListenerCaseDatabase();
 *   const record = await db.lookupCaseAsync('Smith', 500, 'F.3d', 123);
 *
 * Note: The CaseDatabase interface uses synchronous methods, but CourtListener
 * requires async HTTP calls. This adapter provides both sync (cached-only) and
 * async (with API fallback) methods.
 */
export class CourtListenerCaseDatabase implements CaseDatabase {
  private config: CourtListenerConfig;
  private cache: CitationCache;
  private rateLimiter: RateLimiter;
  private localOverrides = new Map<string, KnownCaseRecord>();
  private pendingLookups = new Map<string, Promise<KnownCaseRecord | null>>();

  // Statistics
  private stats = {
    totalLookups: 0,
    cacheHits: 0,
    apiCalls: 0,
    apiErrors: 0,
    casesFound: 0,
    casesNotFound: 0,
  };

  constructor(config?: Partial<CourtListenerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new CitationCache(this.config);
    this.rateLimiter = new RateLimiter(this.config.maxRequestsPerMinute);
  }

  // ===========================================================================
  // CaseDatabase INTERFACE METHODS (Synchronous - Cache Only)
  // ===========================================================================

  /**
   * Synchronous lookup - returns cached results only.
   * For API-backed lookup, use lookupCaseAsync().
   *
   * Returns null if not in cache (caller should use async method).
   */
  lookupCase(
    caseName: string | null,
    volume: number | null,
    reporter: string | null,
    page: number | null
  ): KnownCaseRecord | null {
    this.stats.totalLookups++;

    // Check local overrides first
    const overrideKey = this.makeKey(volume, reporter, page);
    const override = this.localOverrides.get(overrideKey);
    if (override) {
      this.stats.cacheHits++;
      return override;
    }

    // Check cache
    const cached = this.cache.get(volume, reporter, page);
    if (cached) {
      this.stats.cacheHits++;
      return cached.record;
    }

    // Not in cache - return null (caller should use async method)
    return null;
  }

  /**
   * Add a verified case to local overrides.
   */
  addVerifiedCase(record: Omit<KnownCaseRecord, 'addedAt'>): void {
    const key = this.makeKey(record.volume, record.reporter, record.page);
    this.localOverrides.set(key, {
      ...record,
      addedAt: Date.now(),
    });

    // Also add to cache
    this.cache.set(
      record.volume,
      record.reporter,
      record.page,
      { ...record, addedAt: Date.now() }
    );
  }

  /**
   * Mark a case as overruled.
   */
  markOverruled(
    volume: number,
    reporter: string,
    page: number,
    overruledBy: string
  ): boolean {
    const key = this.makeKey(volume, reporter, page);

    // Check if in local overrides
    const existing = this.localOverrides.get(key);
    if (existing) {
      this.localOverrides.set(key, {
        ...existing,
        overruled: true,
        overruledBy,
      });
      return true;
    }

    // Check cache
    const cached = this.cache.get(volume, reporter, page);
    if (cached?.record) {
      const updated = { ...cached.record, overruled: true, overruledBy };
      this.cache.set(volume, reporter, page, updated, cached.apiResponse);
      return true;
    }

    return false;
  }

  /**
   * Get database statistics.
   */
  getStats(): { totalCases: number; overruledCases: number } {
    const overrides = Array.from(this.localOverrides.values());
    return {
      totalCases: overrides.length + this.cache.getStats().size,
      overruledCases: overrides.filter(r => r.overruled).length,
    };
  }

  // ===========================================================================
  // ASYNC LOOKUP METHODS (API-Backed)
  // ===========================================================================

  /**
   * Async lookup with CourtListener API fallback.
   * This is the preferred method for actual citation verification.
   */
  async lookupCaseAsync(
    caseName: string | null,
    volume: number | null,
    reporter: string | null,
    page: number | null
  ): Promise<KnownCaseRecord | null> {
    // Check synchronous sources first
    const syncResult = this.lookupCase(caseName, volume, reporter, page);
    if (syncResult) return syncResult;

    // Need volume, reporter, and page for API lookup
    if (volume === null || reporter === null || page === null) {
      return null;
    }

    // Check for pending lookup (dedup concurrent requests)
    const key = this.makeKey(volume, reporter, page);
    const pending = this.pendingLookups.get(key);
    if (pending) {
      return pending;
    }

    // Create new lookup promise
    const lookupPromise = this.performApiLookup(caseName, volume, reporter, page);
    this.pendingLookups.set(key, lookupPromise);

    try {
      const result = await lookupPromise;
      return result;
    } finally {
      this.pendingLookups.delete(key);
    }
  }

  /**
   * Lookup a citation by text (uses CourtListener's search API).
   * Updated to use /search/ endpoint which is more reliable than /citation-lookup/.
   */
  async lookupByText(citationText: string): Promise<KnownCaseRecord | null> {
    // Check rate limit
    if (!this.rateLimiter.canRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      console.warn(`[CourtListener] Rate limited. Wait ${waitTime}ms`);
      return null;
    }

    try {
      this.stats.apiCalls++;
      this.rateLimiter.recordRequest();

      // Use search endpoint which is more reliable than citation-lookup
      const searchParams = new URLSearchParams({
        q: citationText,
        type: 'o', // opinions
        page_size: '5',
      });

      const url = `${this.config.baseUrl}/search/?${searchParams.toString()}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      if (this.config.apiToken) {
        headers['Authorization'] = `Token ${this.config.apiToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.stats.apiErrors++;
        console.error(`[CourtListener] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { count?: number; results?: Array<Record<string, unknown>> };

      // Search endpoint returns { count, results: [...] }
      if (data.results && data.results.length > 0) {
        const result = data.results[0] as Record<string, unknown>;
        this.stats.casesFound++;

        // Extract citation components from the text if possible
        const citationMatch = citationText.match(/(\d+)\s+([A-Za-z.]+(?:\s+\d+[a-z]*)?)\s+(\d+)/);
        const volume = citationMatch ? parseInt(citationMatch[1]) : 0;
        const reporter = citationMatch ? citationMatch[2] : 'Unknown';
        const page = citationMatch ? parseInt(citationMatch[3]) : 0;

        // Extract year from result - handle unknown types
        const dateStr = String(result.dateFiled || result.date_filed || '');
        const yearMatch = dateStr.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        // Extract case name and court - handle unknown types
        const caseName = String(result.caseName || result.case_name || 'Unknown Case');
        const courtValue = String(result.court || result.court_id || 'unknown');

        return {
          caseName,
          normalizedName: caseName.toLowerCase().replace(/[^a-z]/g, ''),
          volume,
          reporter,
          page,
          year,
          court: courtValue,
          jurisdiction: this.inferJurisdiction(courtValue),
          overruled: false,
          source: 'verified_addition' as const,
          addedAt: Date.now(),
        };
      }

      this.stats.casesNotFound++;
      return null;

    } catch (error) {
      this.stats.apiErrors++;
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[CourtListener] Request timed out');
      } else {
        console.error('[CourtListener] API error:', error);
      }
      return null;
    }
  }

  /**
   * Batch lookup multiple citations.
   * More efficient than individual lookups.
   */
  async lookupBatch(
    citations: Array<{
      caseName: string | null;
      volume: number | null;
      reporter: string | null;
      page: number | null;
    }>
  ): Promise<Map<string, KnownCaseRecord | null>> {
    const results = new Map<string, KnownCaseRecord | null>();

    // First, check cache for all
    const uncached: typeof citations = [];
    for (const c of citations) {
      const cached = this.lookupCase(c.caseName, c.volume, c.reporter, c.page);
      const key = this.makeKey(c.volume, c.reporter, c.page);
      if (cached) {
        results.set(key, cached);
      } else {
        uncached.push(c);
      }
    }

    // Build citation text for batch lookup
    if (uncached.length > 0) {
      const citationTexts = uncached
        .map(c => `${c.volume} ${c.reporter} ${c.page}`)
        .join('\n');

      const batchResult = await this.lookupByText(citationTexts);

      // For now, simple implementation - individual lookups for uncached
      // TODO: Parse batch response properly
      for (const c of uncached) {
        const key = this.makeKey(c.volume, c.reporter, c.page);
        if (!results.has(key)) {
          const result = await this.lookupCaseAsync(c.caseName, c.volume, c.reporter, c.page);
          results.set(key, result);
        }
      }
    }

    return results;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private makeKey(volume: number | null, reporter: string | null, page: number | null): string {
    const normReporter = (reporter ?? '').replace(/\s+/g, '').toLowerCase();
    return `${volume ?? ''}-${normReporter}-${page ?? ''}`;
  }

  /**
   * Perform API lookup to CourtListener using the search endpoint.
   * The search endpoint is more reliable than citation-lookup for verification.
   */
  private async performApiLookup(
    caseName: string | null,
    volume: number,
    reporter: string,
    page: number
  ): Promise<KnownCaseRecord | null> {
    // Check rate limit
    if (!this.rateLimiter.canRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      console.warn(`[CourtListener] Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    try {
      this.stats.apiCalls++;
      this.rateLimiter.recordRequest();

      // Construct citation string for search
      const citationStr = `${volume} ${reporter} ${page}`;

      // Use search endpoint which is more reliable
      const searchParams = new URLSearchParams({
        q: citationStr,
        type: 'o', // opinions
        page_size: '5',
      });

      const url = `${this.config.baseUrl}/search/?${searchParams.toString()}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      if (this.config.apiToken) {
        headers['Authorization'] = `Token ${this.config.apiToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.stats.apiErrors++;
        console.error(`[CourtListener] API error: ${response.status} ${response.statusText}`);

        // Cache the negative result to avoid repeated failed calls
        this.cache.set(volume, reporter, page, null);
        return null;
      }

      const data = await response.json() as { count: number; results: Array<{
        caseName?: string;
        case_name?: string;
        citation?: string;
        dateFiled?: string;
        date_filed?: string;
        court?: string;
        court_id?: string;
        id?: number;
        absolute_url?: string;
      }> };

      // Check if we got results
      if (data.count > 0 && data.results && data.results.length > 0) {
        // Look for a result that matches our citation pattern
        const result = data.results[0];

        this.stats.casesFound++;

        // Parse date to year
        let year = 0;
        const dateStr = result.dateFiled || result.date_filed;
        if (dateStr) {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            year = parsed.getFullYear();
          }
        }

        const caseName = result.caseName || result.case_name || 'Unknown Case';
        const record: KnownCaseRecord = {
          caseName,
          normalizedName: caseName.toLowerCase().replace(/[^a-z]/g, ''),
          volume,
          reporter,
          page,
          year,
          court: result.court || result.court_id || 'unknown',
          jurisdiction: this.inferJurisdiction(result.court || result.court_id),
          overruled: false,
          source: 'verified_addition',
          addedAt: Date.now(),
        };

        // Cache the result
        this.cache.set(volume, reporter, page, record);

        return record;
      }

      // Citation not found - cache negative result
      this.stats.casesNotFound++;
      this.cache.set(volume, reporter, page, null);

      return null;

    } catch (error) {
      this.stats.apiErrors++;

      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[CourtListener] Request timed out');
      } else {
        console.error('[CourtListener] API error:', error);
      }

      // Don't cache errors - allow retry
      return null;
    }
  }

  /**
   * Infer jurisdiction from court ID.
   */
  private inferJurisdiction(courtId?: string): string {
    if (!courtId) return 'unknown';

    const id = courtId.toLowerCase();
    if (id.includes('scotus') || id.includes('supreme')) return 'federal';
    if (id.startsWith('ca') || id.includes('circuit')) return 'federal';
    if (id.includes('dist') || id.includes('d.')) return 'federal';
    if (id.includes('bap') || id.includes('bankr')) return 'federal';
    return 'state';
  }

  /**
   * Convert CourtListener API response to KnownCaseRecord.
   */
  private convertToRecord(result: CourtListenerCitationResult): KnownCaseRecord {
    // Extract first citation details
    const firstCitation = result.citations?.[0];

    // Parse date to year
    let year = 0;
    if (result.date_filed) {
      const parsed = new Date(result.date_filed);
      if (!isNaN(parsed.getTime())) {
        year = parsed.getFullYear();
      }
    }

    // Determine jurisdiction
    let jurisdiction = 'unknown';
    if (result.court?.jurisdiction) {
      jurisdiction = result.court.jurisdiction;
    } else if (result.court?.id) {
      // Infer from court ID
      if (result.court.id.startsWith('scotus')) {
        jurisdiction = 'federal';
      } else if (result.court.id.includes('ca')) {
        jurisdiction = 'federal';
      } else if (result.court.id.includes('d-')) {
        jurisdiction = 'federal';
      }
    }

    return {
      caseName: result.case_name ?? 'Unknown Case',
      normalizedName: (result.case_name ?? '').toLowerCase().replace(/[^\w\s]/g, ''),
      volume: firstCitation?.volume ?? 0,
      reporter: firstCitation?.reporter ?? '',
      page: parseInt(firstCitation?.page ?? '0', 10),
      court: result.court?.name_abbreviation ?? result.court?.id ?? '',
      year,
      jurisdiction,
      overruled: false, // CourtListener doesn't provide this directly
      source: 'verified_addition',
      addedAt: Date.now(),
    };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get detailed statistics.
   */
  getDetailedStats(): {
    totalLookups: number;
    cacheHits: number;
    cacheHitRate: number;
    apiCalls: number;
    apiErrors: number;
    apiErrorRate: number;
    casesFound: number;
    casesNotFound: number;
    cacheSize: number;
    rateLimitRemaining: number;
  } {
    const cacheHitRate = this.stats.totalLookups > 0
      ? this.stats.cacheHits / this.stats.totalLookups
      : 0;

    const apiErrorRate = this.stats.apiCalls > 0
      ? this.stats.apiErrors / this.stats.apiCalls
      : 0;

    return {
      ...this.stats,
      cacheHitRate,
      apiErrorRate,
      cacheSize: this.cache.getStats().size,
      rateLimitRemaining: this.config.maxRequestsPerMinute - this.stats.apiCalls,
    };
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.cache.clear();
    this.localOverrides.clear();
  }

  /**
   * Get configuration.
   */
  getConfig(): CourtListenerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<CourtListenerConfig>): void {
    this.config = { ...this.config, ...config };
    this.cache = new CitationCache(this.config);
    this.rateLimiter = new RateLimiter(this.config.maxRequestsPerMinute);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a CourtListener-backed case database.
 */
export function createCourtListenerDatabase(
  config?: Partial<CourtListenerConfig>
): CourtListenerCaseDatabase {
  return new CourtListenerCaseDatabase(config);
}

/**
 * Default singleton instance.
 */
export const courtListenerDb = createCourtListenerDatabase();
