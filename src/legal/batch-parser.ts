/**
 * Court Listener Batch Parser
 *
 * Provides batch processing capabilities for fetching and parsing
 * court data from CourtListener API at scale.
 *
 * Features:
 * - Batch fetch for opinions, dockets, courts
 * - Rate limiting to respect API limits (60/min)
 * - Progress tracking for long-running operations
 * - Automatic retry with exponential backoff
 * - PromptSpeak symbol generation for legal entities
 */

import { createLogger } from '../core/logging/index.js';
import { Result, success, failure } from '../core/result/index.js';

const logger = createLogger('CourtListenerBatch');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BatchConfig {
  /** CourtListener API base URL */
  baseUrl: string;
  /** API token (optional, increases rate limits) */
  apiToken?: string;
  /** Maximum requests per minute */
  maxRequestsPerMinute: number;
  /** Batch size for parallel requests */
  batchSize: number;
  /** Maximum retries per request */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelayMs: number;
  /** Request timeout (ms) */
  timeoutMs: number;
}

const DEFAULT_CONFIG: BatchConfig = {
  baseUrl: 'https://www.courtlistener.com/api/rest/v4',
  maxRequestsPerMinute: 55,
  batchSize: 10,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  timeoutMs: 30000,
};

export interface Opinion {
  id: number;
  absolute_url: string;
  cluster_id: number;
  author_str: string;
  per_curiam: boolean;
  type: string;
  sha1: string;
  page_count?: number;
  download_url?: string;
  plain_text?: string;
  html?: string;
  date_created: string;
  date_modified: string;
}

export interface Docket {
  id: number;
  absolute_url: string;
  court: string;
  court_id: string;
  case_name: string;
  case_name_short: string;
  case_name_full: string;
  slug: string;
  pacer_case_id?: string;
  docket_number?: string;
  date_filed?: string;
  date_terminated?: string;
  date_last_filing?: string;
  cause?: string;
  nature_of_suit?: string;
  jury_demand?: string;
  date_created: string;
  date_modified: string;
}

export interface Court {
  id: string;
  resource_uri: string;
  full_name: string;
  short_name: string;
  position: number;
  in_use: boolean;
  has_opinion_scraper: boolean;
  has_oral_argument_scraper: boolean;
  url: string;
  jurisdiction: string;
  citation_string: string;
  start_date?: string;
  end_date?: string;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentComplete: number;
  estimatedTimeRemainingMs?: number;
  currentBatch: number;
  totalBatches: number;
}

export interface BatchResult<T> {
  items: T[];
  errors: Array<{ id: string | number; error: string }>;
  progress: BatchProgress;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK LEGAL SYMBOLS
// ═══════════════════════════════════════════════════════════════════════════════

export interface LegalSymbol {
  symbolId: string;
  symbolType: 'CASE' | 'COURT' | 'OPINION' | 'DOCKET';
  name: string;
  citation?: string;
  court?: string;
  dateFiled?: string;
  jurisdiction?: string;
  sourceUrl?: string;
  metadata: Record<string, unknown>;
}

/**
 * Generate a PromptSpeak symbol for a case.
 */
export function generateCaseSymbol(
  caseName: string,
  citation: string,
  court: string,
  dateFiled?: string,
  sourceUrl?: string
): LegalSymbol {
  // Generate a sanitized symbol ID from case name
  const sanitizedName = caseName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase()
    .substring(0, 50);

  return {
    symbolId: `XI.LEGAL.CASE.${sanitizedName}`,
    symbolType: 'CASE',
    name: caseName,
    citation,
    court,
    dateFiled,
    sourceUrl,
    metadata: {
      source: 'courtlistener',
      extractedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generate a PromptSpeak symbol for a court.
 */
export function generateCourtSymbol(court: Court): LegalSymbol {
  return {
    symbolId: `XI.LEGAL.COURT.${court.id.toUpperCase()}`,
    symbolType: 'COURT',
    name: court.full_name,
    jurisdiction: court.jurisdiction,
    sourceUrl: court.url,
    metadata: {
      shortName: court.short_name,
      citationString: court.citation_string,
      position: court.position,
      inUse: court.in_use,
      source: 'courtlistener',
    },
  };
}

/**
 * Generate a PromptSpeak symbol for an opinion.
 */
export function generateOpinionSymbol(opinion: Opinion, caseName?: string): LegalSymbol {
  return {
    symbolId: `XI.LEGAL.OPINION.${opinion.id}`,
    symbolType: 'OPINION',
    name: caseName || `Opinion ${opinion.id}`,
    sourceUrl: `https://www.courtlistener.com${opinion.absolute_url}`,
    metadata: {
      clusterId: opinion.cluster_id,
      author: opinion.author_str,
      perCuriam: opinion.per_curiam,
      type: opinion.type,
      pageCount: opinion.page_count,
      source: 'courtlistener',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PARSER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Court Listener Batch Parser
 *
 * Provides batch processing for court data with rate limiting
 * and progress tracking.
 */
export class CourtListenerBatchParser {
  private config: BatchConfig;
  private requestTimes: number[] = [];
  private abortController: AbortController | null = null;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (process.env.COURTLISTENER_API_TOKEN) {
      this.config.apiToken = process.env.COURTLISTENER_API_TOKEN;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RATE LIMITING
  // ─────────────────────────────────────────────────────────────────────────────

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60000;

    // Clean up old requests
    this.requestTimes = this.requestTimes.filter(t => t > windowStart);

    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      const oldestInWindow = this.requestTimes[0];
      const waitTime = oldestInWindow + 60000 - now + 100; // +100ms buffer
      logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.requestTimes.push(Date.now());
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HTTP REQUESTS
  // ─────────────────────────────────────────────────────────────────────────────

  private async fetchWithRetry<T>(
    url: string,
    retries: number = this.config.maxRetries
  ): Promise<Result<T>> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.waitForRateLimit();

        const headers: Record<string, string> = {
          'Accept': 'application/json',
        };

        if (this.config.apiToken) {
          headers['Authorization'] = `Token ${this.config.apiToken}`;
        }

        const response = await fetch(url, {
          headers,
          signal: this.abortController?.signal,
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited, wait and retry
            const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
            logger.warn(`Rate limited, waiting ${retryAfter}s`);
            await this.sleep(retryAfter * 1000);
            continue;
          }

          if (response.status >= 500 && attempt < retries) {
            // Server error, retry with backoff
            const delay = this.config.baseRetryDelayMs * Math.pow(2, attempt);
            await this.sleep(delay);
            continue;
          }

          return failure(
            'API_ERROR',
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data = await response.json() as T;
        return success(data);

      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return failure('ABORTED', 'Request was aborted');
        }

        if (attempt < retries) {
          const delay = this.config.baseRetryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        return failure(
          'FETCH_ERROR',
          `Failed to fetch: ${(error as Error).message}`
        );
      }
    }

    return failure('MAX_RETRIES', 'Max retries exceeded');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BATCH OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetch opinions in batches.
   */
  async *fetchOpinions(
    query: {
      cluster_id?: number;
      court?: string;
      date_filed_after?: string;
      date_filed_before?: string;
      type?: string;
    } = {},
    onProgress?: (progress: BatchProgress) => void
  ): AsyncGenerator<Opinion, void, unknown> {
    this.abortController = new AbortController();

    const params = new URLSearchParams();
    if (query.cluster_id) params.set('cluster_id', String(query.cluster_id));
    if (query.court) params.set('court', query.court);
    if (query.date_filed_after) params.set('date_filed__gte', query.date_filed_after);
    if (query.date_filed_before) params.set('date_filed__lte', query.date_filed_before);
    if (query.type) params.set('type', query.type);

    let nextUrl: string | null = `${this.config.baseUrl}/opinions/?${params.toString()}`;
    let total = 0;
    let completed = 0;
    let failed = 0;
    const startTime = Date.now();

    while (nextUrl) {
      const result = await this.fetchWithRetry<{
        count: number;
        next: string | null;
        results: Opinion[];
      }>(nextUrl);

      if (!result.success) {
        logger.error('Failed to fetch opinions', { error: result.error.message });
        failed++;
        break;
      }

      const data = result.data;
      total = data.count;
      nextUrl = data.next;

      for (const opinion of data.results) {
        yield opinion;
        completed++;

        if (onProgress) {
          const elapsed = Date.now() - startTime;
          const rate = completed / (elapsed / 1000);
          const remaining = total - completed;

          onProgress({
            total,
            completed,
            failed,
            inProgress: data.results.length,
            percentComplete: (completed / total) * 100,
            estimatedTimeRemainingMs: remaining / rate * 1000,
            currentBatch: Math.ceil(completed / this.config.batchSize),
            totalBatches: Math.ceil(total / this.config.batchSize),
          });
        }
      }
    }

    this.abortController = null;
  }

  /**
   * Fetch dockets in batches.
   */
  async *fetchDockets(
    query: {
      court?: string;
      case_name?: string;
      date_filed_after?: string;
      date_filed_before?: string;
    } = {},
    onProgress?: (progress: BatchProgress) => void
  ): AsyncGenerator<Docket, void, unknown> {
    this.abortController = new AbortController();

    const params = new URLSearchParams();
    if (query.court) params.set('court', query.court);
    if (query.case_name) params.set('case_name__icontains', query.case_name);
    if (query.date_filed_after) params.set('date_filed__gte', query.date_filed_after);
    if (query.date_filed_before) params.set('date_filed__lte', query.date_filed_before);

    let nextUrl: string | null = `${this.config.baseUrl}/dockets/?${params.toString()}`;
    let total = 0;
    let completed = 0;
    const startTime = Date.now();

    while (nextUrl) {
      const result = await this.fetchWithRetry<{
        count: number;
        next: string | null;
        results: Docket[];
      }>(nextUrl);

      if (!result.success) {
        logger.error('Failed to fetch dockets', { error: result.error.message });
        break;
      }

      const data = result.data;
      total = data.count;
      nextUrl = data.next;

      for (const docket of data.results) {
        yield docket;
        completed++;

        if (onProgress) {
          const elapsed = Date.now() - startTime;
          const rate = completed / (elapsed / 1000);
          const remaining = total - completed;

          onProgress({
            total,
            completed,
            failed: 0,
            inProgress: data.results.length,
            percentComplete: (completed / total) * 100,
            estimatedTimeRemainingMs: remaining / rate * 1000,
            currentBatch: Math.ceil(completed / this.config.batchSize),
            totalBatches: Math.ceil(total / this.config.batchSize),
          });
        }
      }
    }

    this.abortController = null;
  }

  /**
   * Fetch all courts.
   */
  async fetchCourts(): Promise<Result<Court[]>> {
    const result = await this.fetchWithRetry<{
      count: number;
      results: Court[];
    }>(`${this.config.baseUrl}/courts/?page_size=500`);

    if (!result.success) {
      return result;
    }

    return success(result.data.results);
  }

  /**
   * Abort any in-progress batch operations.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SYMBOL GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Parse dockets and generate PromptSpeak case symbols.
   */
  async *parseDocketsToSymbols(
    query: Parameters<typeof this.fetchDockets>[0],
    onProgress?: (progress: BatchProgress) => void
  ): AsyncGenerator<LegalSymbol, void, unknown> {
    for await (const docket of this.fetchDockets(query, onProgress)) {
      yield generateCaseSymbol(
        docket.case_name || docket.case_name_short,
        docket.docket_number || `Docket ${docket.id}`,
        docket.court,
        docket.date_filed,
        `https://www.courtlistener.com${docket.absolute_url}`
      );
    }
  }

  /**
   * Parse opinions and generate PromptSpeak opinion symbols.
   */
  async *parseOpinionsToSymbols(
    query: Parameters<typeof this.fetchOpinions>[0],
    onProgress?: (progress: BatchProgress) => void
  ): AsyncGenerator<LegalSymbol, void, unknown> {
    for await (const opinion of this.fetchOpinions(query, onProgress)) {
      yield generateOpinionSymbol(opinion);
    }
  }

  /**
   * Fetch courts and generate PromptSpeak court symbols.
   */
  async fetchCourtSymbols(): Promise<Result<LegalSymbol[]>> {
    const result = await this.fetchCourts();

    if (!result.success) {
      return result;
    }

    return success(result.data.map(generateCourtSymbol));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let parserInstance: CourtListenerBatchParser | null = null;

/**
 * Get the batch parser singleton.
 */
export function getBatchParser(): CourtListenerBatchParser {
  if (!parserInstance) {
    parserInstance = new CourtListenerBatchParser();
  }
  return parserInstance;
}

/**
 * Create a new batch parser (for testing).
 */
export function createBatchParser(config?: Partial<BatchConfig>): CourtListenerBatchParser {
  return new CourtListenerBatchParser(config);
}
