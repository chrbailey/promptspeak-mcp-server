/**
 * Cross-LLM Verification
 *
 * Provides cross-LLM verification where multiple AI models validate
 * PromptSpeak symbol analysis for higher confidence.
 *
 * Features:
 * - Support for multiple LLM providers (Anthropic, OpenAI, etc.)
 * - Consensus checking across model outputs
 * - Confidence scoring based on agreement level
 * - Discrepancy flagging for human review
 * - Async verification (non-blocking)
 */

import { Result, success, failure } from '../core/result/index.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('CrossLLMVerification');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'local';

export interface LLMProviderConfig {
  provider: LLMProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface VerificationConfig {
  /** Enabled providers */
  providers: LLMProviderConfig[];
  /** Minimum providers that must agree for consensus */
  consensusThreshold: number;
  /** Timeout for each provider call (ms) */
  timeoutMs: number;
  /** Whether to run verification async (non-blocking) */
  async: boolean;
  /** Minimum confidence score to pass verification */
  minConfidenceScore: number;
}

export interface SymbolAnalysis {
  /** The symbol being analyzed (e.g., XI.INTENT.MISSION_001) */
  symbolId: string;
  /** The type of symbol */
  symbolType: string;
  /** Key-value pairs extracted from the symbol */
  attributes: Record<string, unknown>;
  /** Free-form analysis text */
  analysis: string;
  /** Confidence in the analysis (0-1) */
  confidence: number;
}

export interface ProviderResponse {
  provider: LLMProvider;
  model: string;
  analysis: SymbolAnalysis;
  latencyMs: number;
  error?: string;
}

export interface VerificationResult {
  /** Whether verification passed */
  verified: boolean;
  /** Overall confidence score (0-1) */
  confidenceScore: number;
  /** Number of providers that agreed */
  consensusCount: number;
  /** Total providers queried */
  totalProviders: number;
  /** Individual provider responses */
  responses: ProviderResponse[];
  /** Discrepancies found between providers */
  discrepancies: Discrepancy[];
  /** Whether human review is recommended */
  needsHumanReview: boolean;
  /** Verification duration */
  durationMs: number;
}

export interface Discrepancy {
  field: string;
  providers: Array<{
    provider: LLMProvider;
    value: unknown;
  }>;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: VerificationConfig = {
  providers: [],
  consensusThreshold: 2,
  timeoutMs: 30000,
  async: true,
  minConfidenceScore: 0.7,
};

/**
 * Load provider configs from environment.
 */
function loadProvidersFromEnv(): LLMProviderConfig[] {
  const providers: LLMProviderConfig[] = [];

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      maxTokens: 1024,
      temperature: 0,
    });
  }

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      maxTokens: 1024,
      temperature: 0,
    });
  }

  // Google
  if (process.env.GOOGLE_API_KEY) {
    providers.push({
      provider: 'google',
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
      maxTokens: 1024,
      temperature: 0,
    });
  }

  return providers;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildVerificationPrompt(
  symbolId: string,
  symbolType: string,
  symbolData: Record<string, unknown>
): string {
  return `You are a PromptSpeak symbol verification agent. Analyze the following symbol and provide a structured analysis.

SYMBOL:
- ID: ${symbolId}
- Type: ${symbolType}
- Data:
${JSON.stringify(symbolData, null, 2)}

Provide your analysis in the following JSON format:
{
  "symbolId": "${symbolId}",
  "symbolType": "${symbolType}",
  "attributes": {
    // Key attributes you extracted from the symbol
  },
  "analysis": "Your analysis of what this symbol represents and its validity",
  "confidence": 0.0-1.0 // Your confidence in the analysis
}

Focus on:
1. Whether the symbol structure is valid
2. Whether the attributes are consistent
3. Whether the symbol makes semantic sense
4. Any potential issues or red flags

Respond ONLY with the JSON, no additional text.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════

async function callAnthropic(
  config: LLMProviderConfig,
  prompt: string,
  timeoutMs: number
): Promise<Result<SymbolAnalysis>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 1024,
        temperature: config.temperature ?? 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return failure('API_ERROR', `Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content.find(c => c.type === 'text')?.text;
    if (!text) {
      return failure('PARSE_ERROR', 'No text in response');
    }

    const analysis = JSON.parse(text) as SymbolAnalysis;
    return success(analysis);

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return failure('TIMEOUT', 'Request timed out');
    }
    return failure('ERROR', (error as Error).message);
  }
}

async function callOpenAI(
  config: LLMProviderConfig,
  prompt: string,
  timeoutMs: number
): Promise<Result<SymbolAnalysis>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens || 1024,
        temperature: config.temperature ?? 0,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return failure('API_ERROR', `OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const text = data.choices[0]?.message?.content;
    if (!text) {
      return failure('PARSE_ERROR', 'No text in response');
    }

    const analysis = JSON.parse(text) as SymbolAnalysis;
    return success(analysis);

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return failure('TIMEOUT', 'Request timed out');
    }
    return failure('ERROR', (error as Error).message);
  }
}

async function callGoogle(
  config: LLMProviderConfig,
  prompt: string,
  timeoutMs: number
): Promise<Result<SymbolAnalysis>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: config.maxTokens || 1024,
            temperature: config.temperature ?? 0,
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return failure('API_ERROR', `Google API error: ${response.status}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const text = data.candidates[0]?.content?.parts[0]?.text;
    if (!text) {
      return failure('PARSE_ERROR', 'No text in response');
    }

    // Extract JSON from response (Google may wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return failure('PARSE_ERROR', 'No JSON in response');
    }

    const analysis = JSON.parse(jsonMatch[0]) as SymbolAnalysis;
    return success(analysis);

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return failure('TIMEOUT', 'Request timed out');
    }
    return failure('ERROR', (error as Error).message);
  }
}

async function callProvider(
  config: LLMProviderConfig,
  prompt: string,
  timeoutMs: number
): Promise<Result<SymbolAnalysis>> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, prompt, timeoutMs);
    case 'openai':
      return callOpenAI(config, prompt, timeoutMs);
    case 'google':
      return callGoogle(config, prompt, timeoutMs);
    default:
      return failure('UNSUPPORTED', `Unsupported provider: ${config.provider}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSENSUS ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

function findDiscrepancies(responses: ProviderResponse[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];

  if (responses.length < 2) return discrepancies;

  // Compare symbol types
  const types = new Map<string, LLMProvider[]>();
  for (const r of responses) {
    const type = r.analysis.symbolType;
    if (!types.has(type)) types.set(type, []);
    types.get(type)!.push(r.provider);
  }

  if (types.size > 1) {
    discrepancies.push({
      field: 'symbolType',
      providers: Array.from(types.entries()).map(([value, providers]) => ({
        provider: providers[0],
        value,
      })),
      severity: 'high',
      description: 'Providers disagree on symbol type',
    });
  }

  // Compare confidence levels
  const confidences = responses.map(r => r.analysis.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const maxDeviation = Math.max(...confidences.map(c => Math.abs(c - avgConfidence)));

  if (maxDeviation > 0.3) {
    discrepancies.push({
      field: 'confidence',
      providers: responses.map(r => ({
        provider: r.provider,
        value: r.analysis.confidence,
      })),
      severity: 'medium',
      description: `Confidence scores vary significantly (deviation: ${maxDeviation.toFixed(2)})`,
    });
  }

  // Compare key attributes
  const allKeys = new Set<string>();
  for (const r of responses) {
    Object.keys(r.analysis.attributes).forEach(k => allKeys.add(k));
  }

  for (const key of allKeys) {
    const values = new Map<string, LLMProvider[]>();
    for (const r of responses) {
      const value = JSON.stringify(r.analysis.attributes[key] ?? null);
      if (!values.has(value)) values.set(value, []);
      values.get(value)!.push(r.provider);
    }

    if (values.size > 1) {
      discrepancies.push({
        field: `attributes.${key}`,
        providers: Array.from(values.entries()).map(([value, providers]) => ({
          provider: providers[0],
          value: JSON.parse(value),
        })),
        severity: 'low',
        description: `Providers disagree on attribute: ${key}`,
      });
    }
  }

  return discrepancies;
}

function calculateConsensusScore(responses: ProviderResponse[]): number {
  if (responses.length === 0) return 0;
  if (responses.length === 1) return responses[0].analysis.confidence;

  // Average confidence weighted by agreement
  const discrepancies = findDiscrepancies(responses);
  const baseScore = responses.reduce((sum, r) => sum + r.analysis.confidence, 0) / responses.length;

  // Penalize for discrepancies
  let penalty = 0;
  for (const d of discrepancies) {
    switch (d.severity) {
      case 'high':
        penalty += 0.2;
        break;
      case 'medium':
        penalty += 0.1;
        break;
      case 'low':
        penalty += 0.05;
        break;
    }
  }

  return Math.max(0, Math.min(1, baseScore - penalty));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-LLM VERIFIER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cross-LLM Verifier
 *
 * Coordinates verification across multiple LLM providers
 * and calculates consensus scores.
 */
export class CrossLLMVerifier {
  private config: VerificationConfig;

  constructor(config: Partial<VerificationConfig> = {}) {
    const envProviders = loadProvidersFromEnv();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      providers: config.providers || envProviders,
    };
  }

  /**
   * Check if verification is available (at least one provider configured).
   */
  isAvailable(): boolean {
    return this.config.providers.length > 0;
  }

  /**
   * Get configured providers.
   */
  getProviders(): LLMProvider[] {
    return this.config.providers.map(p => p.provider);
  }

  /**
   * Verify a PromptSpeak symbol across multiple LLM providers.
   */
  async verify(
    symbolId: string,
    symbolType: string,
    symbolData: Record<string, unknown>
  ): Promise<Result<VerificationResult>> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return failure('NO_PROVIDERS', 'No LLM providers configured');
    }

    const prompt = buildVerificationPrompt(symbolId, symbolType, symbolData);
    const responses: ProviderResponse[] = [];

    // Query all providers in parallel
    const promises = this.config.providers.map(async (providerConfig) => {
      const providerStart = Date.now();

      const result = await callProvider(
        providerConfig,
        prompt,
        this.config.timeoutMs
      );

      const response: ProviderResponse = {
        provider: providerConfig.provider,
        model: providerConfig.model,
        analysis: result.success
          ? result.data
          : {
              symbolId,
              symbolType,
              attributes: {},
              analysis: '',
              confidence: 0,
            },
        latencyMs: Date.now() - providerStart,
        error: result.success ? undefined : result.error.message,
      };

      return response;
    });

    const results = await Promise.all(promises);
    responses.push(...results);

    // Filter successful responses
    const successfulResponses = responses.filter(r => !r.error);

    // Calculate consensus
    const discrepancies = findDiscrepancies(successfulResponses);
    const confidenceScore = calculateConsensusScore(successfulResponses);
    const consensusCount = successfulResponses.length;

    const verified =
      consensusCount >= this.config.consensusThreshold &&
      confidenceScore >= this.config.minConfidenceScore;

    const needsHumanReview =
      !verified ||
      discrepancies.some(d => d.severity === 'high') ||
      confidenceScore < 0.5;

    if (needsHumanReview) {
      logger.warn('Symbol verification needs human review', {
        symbolId,
        confidenceScore,
        discrepancies: discrepancies.length,
      });
    }

    return success({
      verified,
      confidenceScore,
      consensusCount,
      totalProviders: responses.length,
      responses,
      discrepancies,
      needsHumanReview,
      durationMs: Date.now() - startTime,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let verifierInstance: CrossLLMVerifier | null = null;

/**
 * Get the cross-LLM verifier singleton.
 */
export function getCrossLLMVerifier(): CrossLLMVerifier {
  if (!verifierInstance) {
    verifierInstance = new CrossLLMVerifier();
  }
  return verifierInstance;
}

/**
 * Create a new cross-LLM verifier (for testing).
 */
export function createCrossLLMVerifier(
  config?: Partial<VerificationConfig>
): CrossLLMVerifier {
  return new CrossLLMVerifier(config);
}

/**
 * Reset the singleton (for testing).
 */
export function resetCrossLLMVerifier(): void {
  verifierInstance = null;
}
