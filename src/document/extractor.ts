/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYMBOL EXTRACTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Uses Claude API to extract entities and generate PromptSpeak symbols from
 * document content. Implements the 5W+H framework for structured extraction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';

import type {
  ParsedDocument,
  ExtractionConfig,
  ExtractionResult,
  ExtractedEntity,
  ExtractedSymbolData,
} from './types.js';
import type { SymbolCategory } from '../symbols/types.js';
import { getDocumentParser } from './parser.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('SymbolExtractor');

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER & COST CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum requests per minute (default: 30) */
  maxRequestsPerMinute: number;
  /** Maximum tokens per session (default: 500,000) */
  maxTokensPerSession: number;
  /** Maximum concurrent requests (default: 3) */
  maxConcurrentRequests: number;
  /** Request timeout in ms (default: 60,000) */
  requestTimeoutMs: number;
  /** Maximum retries on failure (default: 3) */
  maxRetries: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryBaseDelayMs: number;
  /** Enable cost tracking (default: true) */
  trackCosts: boolean;
  /** Log rate limit events (default: true) */
  logEvents: boolean;
}

const DEFAULT_RATE_CONFIG: RateLimiterConfig = {
  maxRequestsPerMinute: 30,
  maxTokensPerSession: 500_000,
  maxConcurrentRequests: 3,
  requestTimeoutMs: 60_000,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  trackCosts: true,
  logEvents: true,
};

/**
 * Rate limit error thrown when limits are exceeded.
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly limitType: 'requests' | 'tokens' | 'concurrent',
    public readonly currentValue: number,
    public readonly maxValue: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Token bucket rate limiter for controlling API request rate.
 */
export class APIRateLimiter {
  private config: RateLimiterConfig;

  // Token bucket state
  private requestTimestamps: number[] = [];

  // Session tracking
  private sessionTokensUsed: number = 0;
  private sessionStartTime: number = Date.now();
  private sessionRequestCount: number = 0;

  // Concurrent request tracking
  private activeRequests: number = 0;
  private requestQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  // Statistics
  private stats = {
    totalRequests: 0,
    totalTokens: 0,
    rateLimitHits: 0,
    retries: 0,
    failures: 0,
    averageLatencyMs: 0,
  };

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_RATE_CONFIG, ...config };
  }

  /**
   * Update rate limiter configuration.
   */
  setConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): RateLimiterConfig {
    return { ...this.config };
  }

  /**
   * Get rate limiter statistics.
   */
  getStats(): typeof this.stats & {
    sessionTokensUsed: number;
    sessionDurationMs: number;
    activeRequests: number;
    queuedRequests: number;
  } {
    return {
      ...this.stats,
      sessionTokensUsed: this.sessionTokensUsed,
      sessionDurationMs: Date.now() - this.sessionStartTime,
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
    };
  }

  /**
   * Reset session counters.
   */
  resetSession(): void {
    this.sessionTokensUsed = 0;
    this.sessionStartTime = Date.now();
    this.sessionRequestCount = 0;
    if (this.config.logEvents) {
      logger.info('Session reset');
    }
  }

  /**
   * Check if a request can proceed immediately.
   */
  canProceed(): { allowed: boolean; retryAfterMs?: number; reason?: string } {
    // Check concurrent limit
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return {
        allowed: false,
        reason: `Max concurrent requests (${this.config.maxConcurrentRequests}) reached`,
      };
    }

    // Check token limit
    if (this.sessionTokensUsed >= this.config.maxTokensPerSession) {
      return {
        allowed: false,
        reason: `Session token limit (${this.config.maxTokensPerSession}) exceeded`,
      };
    }

    // Check rate limit (sliding window)
    const now = Date.now();
    const windowStart = now - 60_000; // 1 minute window

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      const oldestInWindow = this.requestTimestamps[0];
      const retryAfterMs = oldestInWindow + 60_000 - now;
      return {
        allowed: false,
        retryAfterMs,
        reason: `Rate limit (${this.config.maxRequestsPerMinute}/min) exceeded`,
      };
    }

    return { allowed: true };
  }

  /**
   * Acquire a slot for making a request. Blocks if rate limited.
   */
  async acquire(): Promise<void> {
    const check = this.canProceed();

    if (!check.allowed) {
      this.stats.rateLimitHits++;

      // If concurrent limit reached, wait in queue
      if (this.activeRequests >= this.config.maxConcurrentRequests) {
        if (this.config.logEvents) {
          logger.info('Queuing request (concurrent limit)');
        }
        await new Promise<void>((resolve, reject) => {
          this.requestQueue.push({ resolve, reject });
        });
        return;
      }

      // If rate limited, wait and retry
      if (check.retryAfterMs) {
        if (this.config.logEvents) {
          logger.info(`Rate limited, waiting ${check.retryAfterMs}ms`);
        }
        await this.sleep(check.retryAfterMs);
        return this.acquire();
      }

      // Token limit exceeded - throw error
      throw new RateLimitError(
        check.reason || 'Rate limit exceeded',
        'tokens',
        this.sessionTokensUsed,
        this.config.maxTokensPerSession
      );
    }

    // Record request
    this.requestTimestamps.push(Date.now());
    this.activeRequests++;
    this.sessionRequestCount++;
    this.stats.totalRequests++;
  }

  /**
   * Release a slot after completing a request.
   */
  release(tokensUsed: number = 0): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.sessionTokensUsed += tokensUsed;
    this.stats.totalTokens += tokensUsed;

    // Process queue
    if (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const next = this.requestQueue.shift();
      if (next) {
        next.resolve();
      }
    }
  }

  /**
   * Execute a function with rate limiting and retry logic.
   */
  async execute<T>(
    fn: () => Promise<T>,
    options?: { estimatedTokens?: number }
  ): Promise<{ result: T; tokensUsed: number; retries: number; latencyMs: number }> {
    // Pre-check token budget
    if (options?.estimatedTokens) {
      const remaining = this.config.maxTokensPerSession - this.sessionTokensUsed;
      if (options.estimatedTokens > remaining) {
        throw new RateLimitError(
          `Estimated tokens (${options.estimatedTokens}) exceeds remaining budget (${remaining})`,
          'tokens',
          this.sessionTokensUsed,
          this.config.maxTokensPerSession
        );
      }
    }

    let lastError: Error | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.acquire();
        const startTime = Date.now();

        // Execute with timeout
        const result = await this.withTimeout(fn(), this.config.requestTimeoutMs);
        const latencyMs = Date.now() - startTime;

        // Update average latency
        this.stats.averageLatencyMs =
          (this.stats.averageLatencyMs * (this.stats.totalRequests - 1) + latencyMs) /
          this.stats.totalRequests;

        // Extract token count if available
        let tokensUsed = 0;
        if (result && typeof result === 'object' && 'usage' in result) {
          const usage = (result as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
          tokensUsed = (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
        }

        this.release(tokensUsed);

        return { result, tokensUsed, retries, latencyMs };
      } catch (error) {
        this.release(0);
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on rate limit errors (non-retryable)
        if (error instanceof RateLimitError) {
          throw error;
        }

        // Check if retryable
        if (attempt < this.config.maxRetries) {
          retries++;
          this.stats.retries++;
          const delay = this.config.retryBaseDelayMs * Math.pow(2, attempt);
          if (this.config.logEvents) {
            logger.info(`Retry ${attempt + 1}/${this.config.maxRetries} after ${delay}ms: ${lastError.message}`);
          }
          await this.sleep(delay);
        }
      }
    }

    this.stats.failures++;
    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Wrap a promise with a timeout.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global rate limiter instance
let globalRateLimiter: APIRateLimiter | null = null;

export function getRateLimiter(config?: Partial<RateLimiterConfig>): APIRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new APIRateLimiter(config);
  }
  return globalRateLimiter;
}

export function resetRateLimiter(): void {
  globalRateLimiter = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

// Symbol type to category mapping
const SYMBOL_TYPE_CATEGORY: Record<string, SymbolCategory> = {
  profile: 'COMPANY',
  event: 'EVENT',
  financial: 'COMPANY',
  risk: 'COMPANY',
  competitive: 'SECTOR',
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

const ENTITY_EXTRACTION_PROMPT = `You are an expert entity extraction system for financial documents. Extract key entities from the provided document text.

<document_context>
Company: {{COMPANY_NAME}} ({{COMPANY_TICKER}})
Document Type: {{DOCUMENT_CONTEXT}}
Fiscal Period: {{FISCAL_PERIOD}}
</document_context>

<extraction_types>
{{EXTRACTION_TYPES}}
</extraction_types>

<document_text>
{{DOCUMENT_TEXT}}
</document_text>

Extract entities and return a JSON object with this structure:
{
  "entities": [
    {
      "type": "person|company|product|event|metric|risk|opportunity",
      "name": "Entity name",
      "description": "Brief description of the entity",
      "confidence": 0.0-1.0,
      "sourceText": "Exact quote from document mentioning this entity",
      "attributes": {
        // Key-value pairs relevant to the entity type
        // For metrics: {"value": "...", "period": "...", "change": "..."}
        // For people: {"title": "...", "role": "..."}
        // For events: {"date": "...", "impact": "..."}
      },
      "relatedEntities": ["names of related entities"]
    }
  ],
  "documentSummary": "Brief summary of the document section"
}

Focus on extracting:
1. Key executives and their roles
2. Products, services, and business segments
3. Financial metrics with specific values
4. Risk factors and their potential impact
5. Competitive dynamics and market position
6. Significant events (acquisitions, launches, partnerships)
7. Forward-looking statements and guidance

Be precise and cite specific source text. Assign confidence based on clarity and specificity of the source.`;

const SYMBOL_GENERATION_PROMPT = `You are an expert at creating PromptSpeak directive symbols. Convert the extracted entities into structured symbols using the 5W+H framework.

<company_context>
Company: {{COMPANY_NAME}} ({{COMPANY_TICKER}})
Document Type: {{DOCUMENT_CONTEXT}}
Fiscal Period: {{FISCAL_PERIOD}}
</company_context>

<extracted_entities>
{{ENTITIES_JSON}}
</extracted_entities>

<symbol_types_to_create>
{{SYMBOL_TYPES}}
</symbol_types_to_create>

Generate PromptSpeak symbols for each relevant entity group. Return a JSON array of symbols:

{
  "symbols": [
    {
      "suggestedSymbolId": "Ξ.{{TICKER}}.SYMBOL_NAME",
      "category": "COMPANY|PERSON|EVENT|SECTOR|TASK|KNOWLEDGE|QUERY",
      "subcategory": "optional subcategory",
      "who": "Who needs this information / who is the audience",
      "what": "What is being analyzed or described",
      "why": "Why this matters / the purpose",
      "where": "Scope: company, market, geography",
      "when": "Time context (e.g., Q3FY25, 2024)",
      "how": {
        "focus": ["key areas to emphasize"],
        "constraints": ["restrictions and guardrails"],
        "output_format": "expected output style"
      },
      "commanders_intent": "One sentence ultimate goal - the north star",
      "requirements": ["MUST include these elements"],
      "anti_requirements": ["MUST NOT include these elements"],
      "key_terms": ["terms that must appear in output for validation"],
      "tags": ["filtering tags"],
      "confidence": 0.0-1.0,
      "reasoning": "Why this symbol was created and what it captures",
      "sourceEntityIndices": [0, 1, 2]
    }
  ]
}

Guidelines for symbol creation:
1. **Profile symbols** (category: COMPANY): Capture company overview, business model, key products
   - Symbol ID: Ξ.{TICKER}.PROFILE or Ξ.{TICKER}.PROFILE.{ASPECT}

2. **Event symbols** (category: EVENT): Capture significant events like earnings, launches, acquisitions
   - Symbol ID: Ξ.E.{EVENT_TYPE}.{TICKER}.{DATE_OR_ID}

3. **Financial symbols** (category: COMPANY): Capture key metrics, guidance, financial performance
   - Symbol ID: Ξ.{TICKER}.FINANCIALS.{PERIOD} or Ξ.{TICKER}.METRICS.{PERIOD}

4. **Risk symbols** (category: COMPANY): Capture risk factors and their potential impact
   - Symbol ID: Ξ.{TICKER}.RISKS.{PERIOD} or Ξ.{TICKER}.RISK.{RISK_TYPE}

5. **Competitive symbols** (category: SECTOR): Capture competitive landscape and market position
   - Symbol ID: Ξ.S.{SECTOR}.{TICKER}.COMPETITIVE

For each symbol:
- commanders_intent should be a single, clear sentence
- requirements should be specific and verifiable
- key_terms should be unique identifiers that validate the symbol
- Assign higher confidence to symbols with more source evidence`;

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SymbolExtractor {
  private client: Anthropic;
  private model: string;
  private rateLimiter: APIRateLimiter;

  constructor(apiKey?: string, model?: string, rateLimiterConfig?: Partial<RateLimiterConfig>) {
    // Validate API key
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      logger.warn('No API key provided. API calls will fail.');
    }

    this.client = new Anthropic({
      apiKey: key,
    });
    this.model = model || DEFAULT_MODEL;
    this.rateLimiter = getRateLimiter(rateLimiterConfig);
  }

  /**
   * Get rate limiter statistics.
   */
  getRateLimiterStats(): ReturnType<APIRateLimiter['getStats']> {
    return this.rateLimiter.getStats();
  }

  /**
   * Reset the rate limiter session.
   */
  resetRateLimiterSession(): void {
    this.rateLimiter.resetSession();
  }

  /**
   * Update rate limiter configuration.
   */
  setRateLimiterConfig(config: Partial<RateLimiterConfig>): void {
    this.rateLimiter.setConfig(config);
  }

  /**
   * Extract symbols from a parsed document
   */
  async extract(
    document: ParsedDocument,
    config: ExtractionConfig
  ): Promise<ExtractionResult> {
    const startTime = Date.now();
    const parser = getDocumentParser();

    // Chunk document for processing
    const chunks = parser.chunkDocument(document);

    // Extract entities from each chunk
    const allEntities: ExtractedEntity[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let totalTokens = 0;

    for (const chunk of chunks) {
      try {
        const result = await this.extractEntitiesFromChunk(
          chunk.text,
          config,
          chunk.section
        );
        allEntities.push(...result.entities);
        totalTokens += result.tokensUsed || 0;
      } catch (error) {
        warnings.push(`Failed to extract from chunk ${chunk.chunkIndex}: ${error}`);
      }
    }

    // Deduplicate entities
    const deduplicatedEntities = this.deduplicateEntities(allEntities);

    // Generate symbols from entities
    let symbols: ExtractedSymbolData[] = [];
    try {
      symbols = await this.generateSymbols(deduplicatedEntities, config);
    } catch (error) {
      errors.push(`Failed to generate symbols: ${error}`);
    }

    const endTime = Date.now();

    return {
      symbols,
      entities: deduplicatedEntities,
      metadata: {
        documentSource: document.source.path || document.source.url || 'content',
        extractedAt: new Date().toISOString(),
        processingTimeMs: endTime - startTime,
        tokensUsed: totalTokens,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Extract entities from a single chunk of text
   */
  private async extractEntitiesFromChunk(
    text: string,
    config: ExtractionConfig,
    section?: string
  ): Promise<{ entities: ExtractedEntity[]; tokensUsed?: number }> {
    // Build extraction types description
    const extractionTypes = config.symbolTypes
      .map((type) => {
        switch (type) {
          case 'profile':
            return '- PROFILE: Company overview, business model, key products/services';
          case 'event':
            return '- EVENT: Significant events, earnings, launches, acquisitions';
          case 'financial':
            return '- FINANCIAL: Key metrics, revenue, margins, guidance';
          case 'risk':
            return '- RISK: Risk factors, challenges, uncertainties';
          case 'competitive':
            return '- COMPETITIVE: Market position, competitors, competitive advantages';
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join('\n');

    const prompt = ENTITY_EXTRACTION_PROMPT
      .replace('{{COMPANY_NAME}}', config.companyName || config.companyTicker)
      .replace('{{COMPANY_TICKER}}', config.companyTicker)
      .replace('{{DOCUMENT_CONTEXT}}', config.documentContext || 'unknown')
      .replace('{{FISCAL_PERIOD}}', config.fiscalPeriod || 'current')
      .replace('{{EXTRACTION_TYPES}}', extractionTypes)
      .replace('{{DOCUMENT_TEXT}}', text);

    // Estimate tokens: ~4 chars per token for input, MAX_TOKENS for output
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedTokens = estimatedInputTokens + MAX_TOKENS;

    // Execute with rate limiting, timeout, and retry
    const { result: response } = await this.rateLimiter.execute(
      () => this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      { estimatedTokens }
    );

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    try {
      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]) as {
        entities: ExtractedEntity[];
        documentSummary?: string;
      };

      // Add section context to entities
      const entities = result.entities.map((entity) => ({
        ...entity,
        position: entity.position || {
          section,
          startIndex: 0,
          endIndex: text.length,
        },
      }));

      return {
        entities,
        tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens,
      };
    } catch (error) {
      throw new Error(`Failed to parse entity extraction response: ${error}`);
    }
  }

  /**
   * Generate symbols from extracted entities
   */
  private async generateSymbols(
    entities: ExtractedEntity[],
    config: ExtractionConfig
  ): Promise<ExtractedSymbolData[]> {
    if (entities.length === 0) {
      return [];
    }

    // Build symbol types description
    const symbolTypes = config.symbolTypes
      .map((type) => {
        const category = SYMBOL_TYPE_CATEGORY[type] || 'COMPANY';
        return `- ${type.toUpperCase()} (category: ${category})`;
      })
      .join('\n');

    const prompt = SYMBOL_GENERATION_PROMPT
      .replace(/\{\{COMPANY_NAME\}\}/g, config.companyName || config.companyTicker)
      .replace(/\{\{COMPANY_TICKER\}\}/g, config.companyTicker)
      .replace(/\{\{TICKER\}\}/g, config.companyTicker)
      .replace('{{DOCUMENT_CONTEXT}}', config.documentContext || 'unknown')
      .replace('{{FISCAL_PERIOD}}', config.fiscalPeriod || 'current')
      .replace('{{ENTITIES_JSON}}', JSON.stringify(entities, null, 2))
      .replace('{{SYMBOL_TYPES}}', symbolTypes);

    // Estimate tokens: ~4 chars per token for input, MAX_TOKENS for output
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedTokens = estimatedInputTokens + MAX_TOKENS;

    // Execute with rate limiting, timeout, and retry
    const { result: response } = await this.rateLimiter.execute(
      () => this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      { estimatedTokens }
    );

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    try {
      // Extract JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]) as {
        symbols: Array<ExtractedSymbolData & { sourceEntityIndices?: number[] }>;
      };

      // Link source entities to symbols
      const symbols = result.symbols.map((symbol) => {
        const sourceEntities = (symbol.sourceEntityIndices || [])
          .map((i) => entities[i])
          .filter(Boolean);

        return {
          ...symbol,
          sourceEntities,
        };
      });

      // Apply max symbols per type limit
      if (config.maxSymbolsPerType) {
        const symbolsByType: Record<string, ExtractedSymbolData[]> = {};
        for (const symbol of symbols) {
          const type = symbol.category;
          if (!symbolsByType[type]) {
            symbolsByType[type] = [];
          }
          if (symbolsByType[type].length < config.maxSymbolsPerType) {
            symbolsByType[type].push(symbol);
          }
        }
        return Object.values(symbolsByType).flat();
      }

      return symbols;
    } catch (error) {
      throw new Error(`Failed to parse symbol generation response: ${error}`);
    }
  }

  /**
   * Deduplicate entities based on name and type
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>();

    for (const entity of entities) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;

      if (seen.has(key)) {
        // Keep the one with higher confidence
        const existing = seen.get(key)!;
        if (entity.confidence > existing.confidence) {
          // Merge related entities
          const mergedRelated = [
            ...(existing.relatedEntities || []),
            ...(entity.relatedEntities || []),
          ];
          entity.relatedEntities = [...new Set(mergedRelated)];
          seen.set(key, entity);
        }
      } else {
        seen.set(key, entity);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Validate extracted symbols against the schema
   */
  validateSymbol(symbol: ExtractedSymbolData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!symbol.suggestedSymbolId) errors.push('Missing suggestedSymbolId');
    if (!symbol.category) errors.push('Missing category');
    if (!symbol.who) errors.push('Missing who');
    if (!symbol.what) errors.push('Missing what');
    if (!symbol.why) errors.push('Missing why');
    if (!symbol.where) errors.push('Missing where');
    if (!symbol.when) errors.push('Missing when');
    if (!symbol.how) errors.push('Missing how');
    if (!symbol.commanders_intent) errors.push('Missing commanders_intent');
    if (!symbol.requirements || symbol.requirements.length === 0) {
      errors.push('Missing requirements');
    }

    // Validate symbol ID format
    if (symbol.suggestedSymbolId && !symbol.suggestedSymbolId.startsWith('Ξ.')) {
      errors.push('Symbol ID must start with Ξ.');
    }

    // Validate how structure
    if (symbol.how) {
      if (!symbol.how.focus || !Array.isArray(symbol.how.focus)) {
        errors.push('how.focus must be an array');
      }
      if (!symbol.how.constraints || !Array.isArray(symbol.how.constraints)) {
        errors.push('how.constraints must be an array');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let symbolExtractor: SymbolExtractor | null = null;

export function getSymbolExtractor(apiKey?: string, model?: string): SymbolExtractor {
  if (!symbolExtractor) {
    symbolExtractor = new SymbolExtractor(apiKey, model);
  }
  return symbolExtractor;
}

export function resetSymbolExtractor(): void {
  symbolExtractor = null;
}
