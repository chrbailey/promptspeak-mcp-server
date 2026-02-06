// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - LLM-POWERED EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════
// Uses Claude API to intelligently extract 5W+H framework from natural language.
// This enables accurate compilation of complex task descriptions into symbols.
// ═══════════════════════════════════════════════════════════════════════════

// @anthropic-ai/sdk removed - LLM extraction requires reinstalling the package
// Runtime stub: silently constructs so singleton doesn't crash; methods throw on actual use
interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
}
class Anthropic {
  constructor(_opts: Record<string, unknown>) {
    // No-op: allows LLMExtractor to instantiate without crashing
  }
  messages = {
    create: async (_opts?: Record<string, unknown>): Promise<AnthropicResponse> => {
      throw new Error('@anthropic-ai/sdk has been removed. Reinstall the package to use LLM extraction.');
    },
  };
}
import type { Extracted5WH } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION PROMPT TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a precise task analyzer. Extract the 5W+H framework from the given task description.

TASK DESCRIPTION:
"""
{INPUT}
"""

Extract and respond with a JSON object containing:

{
  "who": "The target audience or stakeholder (who is this for?)",
  "what": "What is being done or analyzed (the core task)",
  "why": "The purpose or motivation (why is this needed?)",
  "where": "The scope or boundaries (where does this apply?)",
  "when": "Time context or constraints (when is this relevant?)",
  "how": {
    "focus": ["Key areas to emphasize"],
    "constraints": ["Restrictions or guardrails"],
    "output_format": "Expected output style if mentioned"
  },
  "commanders_intent": "The ultimate goal in one clear sentence",
  "requirements": ["Explicit MUST requirements extracted from the text"],
  "anti_requirements": ["Explicit MUST NOT requirements if any"],
  "key_terms": ["Specific terms, numbers, or names that must appear in output"],
  "inferred_mode": "strict|flexible|neutral (based on language like 'must', 'exactly', 'roughly')",
  "inferred_domain": "financial|legal|technical|operational|strategic|general (based on context)",
  "inferred_action": "execute|propose|delegate|escalate|commit (based on what's being asked)",
  "confidence": 0.0-1.0
}

RULES:
1. If a field cannot be determined, use a reasonable default or empty string/array
2. For "requirements", extract explicit constraints like "must include X", "cite specific numbers"
3. For "key_terms", extract specific values like "$30.8B", "Blackwell", "Q3 FY25"
4. For "inferred_mode": use "strict" if words like "must", "exact", "specific" appear; "flexible" for "roughly", "approximately"
5. For "inferred_domain": look for industry indicators (earnings→financial, court→legal, code→technical)
6. Set "confidence" based on how clear and complete the task description is

Respond ONLY with the JSON object, no other text.`;

// ─────────────────────────────────────────────────────────────────────────────
// SYMBOL ID GENERATION PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYMBOL_ID_PROMPT = `Given this task description, suggest a PromptSpeak symbol ID.

TASK DESCRIPTION:
"""
{INPUT}
"""

EXTRACTED CONTEXT:
- What: {WHAT}
- Where: {WHERE}
- When: {WHEN}

Symbol ID format: Ξ.CATEGORY.IDENTIFIER[.CONTEXT]

Categories:
- C = Company (e.g., Ξ.C.NVDA.Q3FY25)
- P = Person (e.g., Ξ.P.JENSEN_HUANG)
- E = Event (e.g., Ξ.E.EARNINGS_CALL.2024Q3)
- S = Sector (e.g., Ξ.S.SEMICONDUCTORS)
- T = Task (e.g., Ξ.T.PORTFOLIO_REVIEW)
- K = Knowledge (e.g., Ξ.K.BLACKWELL_ARCHITECTURE)
- Q = Query (e.g., Ξ.Q.REVENUE_ANALYSIS)

Respond with ONLY the symbol ID (e.g., "Ξ.C.NVDA.Q3FY25"), nothing else.`;

// ─────────────────────────────────────────────────────────────────────────────
// LLM EXTRACTOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export interface LLMExtractionResult {
  success: boolean;
  extracted?: Extracted5WH;
  inferredMode?: string;
  inferredDomain?: string;
  inferredAction?: string;
  suggestedSymbolId?: string;
  confidence: number;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
}

export interface LLMExtractorOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class LLMExtractor {
  private client: Anthropic | null = null;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(options: LLMExtractorOptions = {}) {
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens || 1024;
    this.temperature = options.temperature || 0.1; // Low temperature for consistent extraction

    // Initialize client if API key is available
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Check if the extractor is configured with an API key.
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Extract 5W+H framework from natural language using Claude.
   */
  async extract5WH(naturalLanguage: string): Promise<LLMExtractionResult> {
    if (!this.client) {
      return {
        success: false,
        confidence: 0,
        error: 'LLM extractor not configured. Set ANTHROPIC_API_KEY environment variable.',
      };
    }

    try {
      const prompt = EXTRACTION_PROMPT.replace('{INPUT}', naturalLanguage);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      // Extract text content
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        return {
          success: false,
          confidence: 0,
          error: 'No text response from LLM',
        };
      }

      // Parse JSON response
      const rawJson = textContent.text.trim();
      let parsed: Record<string, unknown>;

      try {
        // Handle potential markdown code blocks
        const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawJson];
        parsed = JSON.parse(jsonMatch[1] || rawJson);
      } catch (parseError) {
        return {
          success: false,
          confidence: 0,
          error: `Failed to parse LLM response as JSON: ${parseError}`,
        };
      }

      // Build Extracted5WH from parsed response
      // Extract 'how' object with proper typing
      const howObj = parsed.how as { focus?: unknown[]; constraints?: unknown[]; output_format?: string } | undefined;

      const extracted: Extracted5WH = {
        who: String(parsed.who || ''),
        what: String(parsed.what || ''),
        why: String(parsed.why || ''),
        where: String(parsed.where || ''),
        when: String(parsed.when || ''),
        how: {
          focus: Array.isArray(howObj?.focus) ? howObj.focus.map(String) : [],
          constraints: Array.isArray(howObj?.constraints) ? howObj.constraints.map(String) : [],
          output_format: howObj?.output_format,
        },
        commanders_intent: String(parsed.commanders_intent || ''),
        requirements: Array.isArray(parsed.requirements) ? (parsed.requirements as unknown[]).map(String) : [],
        anti_requirements: Array.isArray(parsed.anti_requirements) ? (parsed.anti_requirements as unknown[]).map(String) : undefined,
        key_terms: Array.isArray(parsed.key_terms) ? (parsed.key_terms as unknown[]).map(String) : [],
      };

      return {
        success: true,
        extracted,
        inferredMode: parsed.inferred_mode as string | undefined,
        inferredDomain: parsed.inferred_domain as string | undefined,
        inferredAction: parsed.inferred_action as string | undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
        tokensUsed: {
          input: response.usage?.input_tokens || 0,
          output: response.usage?.output_tokens || 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        error: `LLM extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Suggest a symbol ID based on extracted content.
   */
  async suggestSymbolId(
    naturalLanguage: string,
    extracted: Extracted5WH
  ): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const prompt = SYMBOL_ID_PROMPT
        .replace('{INPUT}', naturalLanguage)
        .replace('{WHAT}', extracted.what)
        .replace('{WHERE}', extracted.where)
        .replace('{WHEN}', extracted.when);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 100,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        return null;
      }

      const symbolId = textContent.text.trim();

      // Validate format
      if (symbolId.startsWith('Ξ.') && symbolId.split('.').length >= 3) {
        return symbolId;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Full extraction: 5W+H + symbol ID suggestion.
   */
  async fullExtraction(naturalLanguage: string): Promise<LLMExtractionResult> {
    const result = await this.extract5WH(naturalLanguage);

    if (result.success && result.extracted) {
      const symbolId = await this.suggestSymbolId(naturalLanguage, result.extracted);
      if (symbolId) {
        result.suggestedSymbolId = symbolId;
      }
    }

    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FALLBACK RULE-BASED EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rule-based fallback extraction when LLM is not available.
 * Less accurate but works without API key.
 */
export function extractWithRules(naturalLanguage: string): Extracted5WH {
  const text = naturalLanguage.toLowerCase();

  // Extract key terms (numbers, proper nouns, etc.)
  const keyTerms: string[] = [];
  const numberMatches = naturalLanguage.match(/\$[\d,.]+[BMK]?|\d+(?:\.\d+)?%|\d{4}Q\d|Q\d\s*(?:FY)?\d{2,4}/gi);
  if (numberMatches) {
    keyTerms.push(...numberMatches);
  }

  // Extract requirements (MUST statements)
  const requirements: string[] = [];
  const mustMatches = naturalLanguage.match(/(?:must|should|need to|required to)\s+[^.,]+/gi);
  if (mustMatches) {
    requirements.push(...mustMatches.map(m => m.trim()));
  }

  // Detect focus areas
  const focus: string[] = [];
  if (text.includes('revenue') || text.includes('earnings')) focus.push('revenue');
  if (text.includes('margin')) focus.push('margins');
  if (text.includes('growth')) focus.push('growth');
  if (text.includes('risk')) focus.push('risks');
  if (text.includes('guidance')) focus.push('guidance');

  // Detect constraints
  const constraints: string[] = [];
  if (text.includes('specific') || text.includes('exact')) constraints.push('cite_specific_numbers');
  if (text.includes('compare')) constraints.push('include_comparisons');
  if (text.includes('source') || text.includes('cite')) constraints.push('cite_sources');

  // Infer who from common patterns
  let who = '';
  if (text.includes('committee')) who = 'Committee';
  else if (text.includes('team')) who = 'Team';
  else if (text.includes('client')) who = 'Client';
  else if (text.includes('board')) who = 'Board';

  // Infer where from company/entity mentions
  let where = '';
  const companyMatch = naturalLanguage.match(/\b([A-Z]{2,5})\b/); // Ticker symbols
  if (companyMatch) {
    where = companyMatch[1];
  }

  // Infer when from time references
  let when = '';
  const timeMatch = naturalLanguage.match(/Q\d\s*(?:FY)?\s*\d{2,4}|\d{4}|(?:this|next|last)\s+(?:quarter|year|month)/i);
  if (timeMatch) {
    when = timeMatch[0];
  }

  return {
    who,
    what: naturalLanguage.slice(0, 100), // First 100 chars as summary
    why: '',
    where,
    when,
    how: {
      focus,
      constraints,
    },
    commanders_intent: naturalLanguage.slice(0, 150),
    requirements,
    key_terms: keyTerms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const llmExtractor = new LLMExtractor();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract 5W+H from natural language.
 * Uses LLM if available, falls back to rules otherwise.
 */
export async function extract5WH(
  naturalLanguage: string,
  useLLM: boolean = true
): Promise<LLMExtractionResult> {
  if (useLLM && llmExtractor.isConfigured()) {
    return llmExtractor.fullExtraction(naturalLanguage);
  }

  // Fallback to rule-based extraction
  const extracted = extractWithRules(naturalLanguage);
  return {
    success: true,
    extracted,
    confidence: 0.4, // Lower confidence for rule-based
  };
}
