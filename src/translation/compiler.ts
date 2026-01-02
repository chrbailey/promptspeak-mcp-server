// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - NATURAL LANGUAGE COMPILER
// ═══════════════════════════════════════════════════════════════════════════
// Compiles natural language task descriptions into PromptSpeak symbols and frames.
// Uses LLM-powered 5W+H extraction with optional opacity wrapping.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  NLCompileRequest,
  NLCompileResponse,
  Extracted5WH,
  OpaqueExtracted5WH,
  OpacityMode,
} from './types.js';

import { extract5WH, extractWithRules, LLMExtractionResult } from './llm-extractor.js';
import { frameTranslator } from './frame-translator.js';
import { TEXT_TO_UNICODE, detectMode, detectDomain, detectAction, detectEntity } from './mappings.js';
import { opacityLayer } from './opacity-layer.js';

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL LANGUAGE COMPILER
// ─────────────────────────────────────────────────────────────────────────────

export class NLCompiler {
  /**
   * Compile natural language into PromptSpeak symbol and/or frame.
   */
  async compile(request: NLCompileRequest): Promise<NLCompileResponse> {
    try {
      // Step 1: Extract 5W+H using LLM (or rules fallback)
      const extractionResult = await extract5WH(request.naturalLanguage, true);

      if (!extractionResult.success || !extractionResult.extracted) {
        return {
          success: false,
          extracted: extractWithRules(request.naturalLanguage),
          confidence: 0.3,
          reasoning: 'Extraction failed, using rule-based fallback',
          error: extractionResult.error,
        };
      }

      const { extracted } = extractionResult;

      // Step 2: Infer frame from NL cues and LLM suggestions
      let frame: NLCompileResponse['frame'] | undefined;
      if (request.outputType === 'frame' || request.outputType === 'both') {
        frame = this.inferFrame(request, extractionResult);
      }

      // Step 3: Generate symbol ID if requested
      let symbol: NLCompileResponse['symbol'] | undefined;
      if (request.outputType === 'symbol' || request.outputType === 'both') {
        symbol = await this.generateSymbol(request, extractionResult);
      }

      // Step 4: Apply opacity if needed
      let finalExtracted: Extracted5WH | OpaqueExtracted5WH = extracted;
      let rawExtracted: Extracted5WH | undefined;

      if (request.opacityMode === 'opaque' || request.opacityMode === 'hybrid') {
        rawExtracted = extracted;
        finalExtracted = await opacityLayer.applyOpacity(extracted, symbol?.symbolId);
      }

      // Step 5: Build response
      return {
        success: true,
        symbol,
        frame,
        extracted: finalExtracted,
        rawExtracted: request.opacityMode !== 'transparent' ? rawExtracted : undefined,
        confidence: extractionResult.confidence,
        reasoning: this.buildReasoning(extractionResult, frame),
        alternativeInterpretations: this.generateAlternatives(request.naturalLanguage, extractionResult),
      };
    } catch (error) {
      return {
        success: false,
        extracted: extractWithRules(request.naturalLanguage),
        confidence: 0,
        reasoning: 'Compilation failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Infer frame from natural language and LLM extraction.
   */
  private inferFrame(
    request: NLCompileRequest,
    extraction: LLMExtractionResult
  ): NLCompileResponse['frame'] {
    const nl = request.naturalLanguage;
    const parts: string[] = [];

    // Determine mode
    let modeAlias = 'neutral';
    if (extraction.inferredMode) {
      modeAlias = extraction.inferredMode;
    } else if (request.frameOptions?.inferMode !== false) {
      const detected = detectMode(nl);
      if (detected) modeAlias = detected.textAlias;
    }
    const modeSymbol = TEXT_TO_UNICODE[modeAlias];
    if (modeSymbol) parts.push(modeSymbol);

    // Determine domain
    let domainAlias = 'general';
    if (extraction.inferredDomain) {
      domainAlias = extraction.inferredDomain;
    } else if (request.frameOptions?.inferDomain !== false) {
      const detected = detectDomain(nl);
      if (detected) domainAlias = detected.textAlias;
    }
    // Map 'general' to a valid domain
    if (domainAlias === 'general') domainAlias = 'operational';
    const domainSymbol = TEXT_TO_UNICODE[domainAlias];
    if (domainSymbol) parts.push(domainSymbol);

    // Determine action
    let actionAlias = 'execute';
    if (extraction.inferredAction) {
      actionAlias = extraction.inferredAction;
    } else {
      const detected = detectAction(nl);
      if (detected) actionAlias = detected.textAlias;
    }
    const actionSymbol = TEXT_TO_UNICODE[actionAlias];
    if (actionSymbol) parts.push(actionSymbol);

    // Determine entity (default to secondary for delegated tasks)
    let entityAlias = 'secondary';
    const detected = detectEntity(nl);
    if (detected) entityAlias = detected.textAlias;
    const entitySymbol = TEXT_TO_UNICODE[entityAlias];
    if (entitySymbol) parts.push(entitySymbol);

    const unicode = parts.join('');
    const textAlias = [modeAlias, domainAlias, actionAlias, entityAlias]
      .filter(Boolean)
      .join('.');

    return {
      unicode,
      textAlias,
      opaqueId: request.opacityMode === 'opaque'
        ? frameTranslator.getOrCreateOpaqueId(unicode)
        : undefined,
    };
  }

  /**
   * Generate symbol ID and metadata.
   */
  private async generateSymbol(
    request: NLCompileRequest,
    extraction: LLMExtractionResult
  ): Promise<NLCompileResponse['symbol']> {
    // Use LLM-suggested ID or generate from context
    let symbolId = extraction.suggestedSymbolId;

    if (!symbolId && extraction.extracted) {
      symbolId = this.generateSymbolId(extraction.extracted, request.symbolOptions);
    }

    if (!symbolId) {
      symbolId = `Ξ.T.TASK_${Date.now()}`;
    }

    // Determine category from ID
    const parts = symbolId.split('.');
    const categoryCode = parts[1] || 'T';
    const categoryMap: Record<string, string> = {
      'C': 'COMPANY',
      'P': 'PERSON',
      'E': 'EVENT',
      'S': 'SECTOR',
      'T': 'TASK',
      'K': 'KNOWLEDGE',
      'Q': 'QUERY',
    };
    const category = categoryMap[categoryCode] || 'TASK';

    // Generate hash from content
    const content = JSON.stringify(extraction.extracted);
    const hash = this.simpleHash(content);

    return {
      symbolId,
      category,
      hash,
      version: 1,
      created: false, // Would be true if we actually saved to registry
    };
  }

  /**
   * Generate a symbol ID from extracted content.
   */
  private generateSymbolId(
    extracted: Extracted5WH,
    options?: NLCompileRequest['symbolOptions']
  ): string {
    // Use hint if provided
    if (options?.symbolIdHint) {
      return options.symbolIdHint;
    }

    // Try to extract company ticker from where/what
    const tickerMatch = (extracted.where + ' ' + extracted.what).match(/\b([A-Z]{2,5})\b/);
    if (tickerMatch) {
      const ticker = tickerMatch[1];
      const timeContext = extracted.when.replace(/\s+/g, '').toUpperCase() || '';
      return `Ξ.C.${ticker}${timeContext ? '.' + timeContext : ''}`;
    }

    // Default to task-based ID
    const slug = extracted.what
      .slice(0, 30)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+$/, '');
    return `Ξ.T.${slug || 'TASK'}`;
  }

  /**
   * Build reasoning explanation.
   */
  private buildReasoning(extraction: LLMExtractionResult, frame?: NLCompileResponse['frame']): string {
    const parts: string[] = [];

    if (extraction.inferredMode) {
      parts.push(`Mode "${extraction.inferredMode}" detected from language patterns`);
    }
    if (extraction.inferredDomain) {
      parts.push(`Domain "${extraction.inferredDomain}" inferred from context`);
    }
    if (extraction.inferredAction) {
      parts.push(`Action "${extraction.inferredAction}" determined from task type`);
    }
    if (extraction.suggestedSymbolId) {
      parts.push(`Symbol ID "${extraction.suggestedSymbolId}" suggested based on entity identification`);
    }

    if (parts.length === 0) {
      parts.push('Extracted using default inference rules');
    }

    return parts.join('. ') + '.';
  }

  /**
   * Generate alternative interpretations if confidence is low.
   */
  private generateAlternatives(
    naturalLanguage: string,
    extraction: LLMExtractionResult
  ): NLCompileResponse['alternativeInterpretations'] {
    if (extraction.confidence >= 0.8) {
      return undefined; // High confidence, no alternatives needed
    }

    const alternatives: Array<{ interpretation: string; confidence: number }> = [];

    // Suggest different modes
    if (!extraction.inferredMode || extraction.inferredMode === 'neutral') {
      if (/\b(should|could|might)\b/i.test(naturalLanguage)) {
        alternatives.push({
          interpretation: 'Could be interpreted as flexible mode (allows interpretation)',
          confidence: 0.4,
        });
      }
    }

    // Suggest different domains
    if (extraction.inferredDomain === 'financial' && /\blegal\b/i.test(naturalLanguage)) {
      alternatives.push({
        interpretation: 'Legal domain detected but financial context stronger',
        confidence: 0.3,
      });
    }

    return alternatives.length > 0 ? alternatives : undefined;
  }

  /**
   * Simple hash function for content.
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const nlCompiler = new NLCompiler();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile natural language to PromptSpeak symbols and frames.
 */
export async function compileNL(
  naturalLanguage: string,
  options?: Partial<NLCompileRequest>
): Promise<NLCompileResponse> {
  const request: NLCompileRequest = {
    naturalLanguage,
    outputType: options?.outputType || 'both',
    opacityMode: options?.opacityMode || 'transparent',
    symbolOptions: options?.symbolOptions,
    frameOptions: options?.frameOptions,
    extractKeyTerms: options?.extractKeyTerms ?? true,
    extractRequirements: options?.extractRequirements ?? true,
  };

  return nlCompiler.compile(request);
}
