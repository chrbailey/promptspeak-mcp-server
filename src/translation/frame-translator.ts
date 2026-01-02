// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - FRAME TRANSLATOR
// ═══════════════════════════════════════════════════════════════════════════
// Bidirectional translation between frame formats:
// - Unicode: ⊕◊▶β
// - Text Alias: strict.financial.execute.secondary
// - Natural Language: "Execute in strict mode within the financial domain..."
// ═══════════════════════════════════════════════════════════════════════════

import type {
  FrameTranslateRequest,
  FrameTranslateResponse,
  FrameOutputFormat,
} from './types.js';

import {
  UNICODE_TO_TEXT,
  TEXT_TO_UNICODE,
  UNICODE_TO_NATURAL,
  TEXT_TO_NATURAL,
  UNICODE_TO_CATEGORY,
  TEXT_TO_CATEGORY,
  detectMode,
  detectDomain,
  detectAction,
  detectEntity,
} from './mappings.js';

// ─────────────────────────────────────────────────────────────────────────────
// FRAME TRANSLATOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class FrameTranslator {
  // Opaque ID mappings (in-memory for now, will be moved to database)
  private opaqueToUnicode: Map<string, string> = new Map();
  private unicodeToOpaque: Map<string, string> = new Map();
  private opaqueCounter = 10000;

  /**
   * Translate a frame between formats.
   */
  translate(request: FrameTranslateRequest): FrameTranslateResponse {
    try {
      // Step 1: Determine input type and parse to Unicode (canonical)
      let unicode: string;
      let confidence = 1.0;

      if (request.unicode) {
        unicode = request.unicode;
      } else if (request.textAlias) {
        unicode = this.textAliasToUnicode(request.textAlias);
      } else if (request.naturalLanguage) {
        const result = this.naturalLanguageToUnicode(request.naturalLanguage, request.nlParseMode);
        unicode = result.unicode;
        confidence = result.confidence;
      } else if (request.opaqueId) {
        const resolved = this.opaqueToUnicode.get(request.opaqueId);
        if (!resolved) {
          return {
            success: false,
            error: `Opaque ID not found: ${request.opaqueId}`,
          };
        }
        unicode = resolved;
      } else {
        return {
          success: false,
          error: 'No input provided. Provide one of: unicode, textAlias, naturalLanguage, opaqueId',
        };
      }

      // Step 2: Parse the Unicode frame into components
      const parsed = this.parseUnicodeFrame(unicode);

      // Step 3: Generate requested output formats
      const response: FrameTranslateResponse = {
        success: true,
        parsed,
        confidence,
      };

      for (const format of request.outputFormats) {
        switch (format) {
          case 'unicode':
            response.unicode = unicode;
            break;
          case 'textAlias':
            response.textAlias = this.unicodeToTextAlias(unicode);
            break;
          case 'naturalLanguage':
            response.naturalLanguage = this.unicodeToNaturalLanguage(unicode);
            break;
          case 'opaqueId':
            response.opaqueId = this.getOrCreateOpaqueId(unicode);
            break;
        }
      }

      // Step 4: Validate if all symbols were recognized
      const validationErrors: string[] = [];
      const unknownChars = [...unicode].filter(c => !UNICODE_TO_TEXT[c] && !/\s/.test(c));
      if (unknownChars.length > 0) {
        validationErrors.push(`Unknown symbols: ${unknownChars.join(', ')}`);
      }

      response.isValid = validationErrors.length === 0;
      response.validationErrors = validationErrors.length > 0 ? validationErrors : undefined;

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown translation error',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONVERSION METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert text alias format to Unicode.
   * e.g., "strict.financial.execute.secondary" -> "⊕◊▶β"
   */
  textAliasToUnicode(textAlias: string): string {
    const parts = textAlias.split('.');
    const unicode = parts.map(part => {
      const symbol = TEXT_TO_UNICODE[part.toLowerCase()];
      if (!symbol) {
        throw new Error(`Unknown text alias: ${part}`);
      }
      return symbol;
    });
    return unicode.join('');
  }

  /**
   * Convert Unicode frame to text alias format.
   * e.g., "⊕◊▶β" -> "strict.financial.execute.secondary"
   */
  unicodeToTextAlias(unicode: string): string {
    const chars = [...unicode];
    const parts = chars
      .map(char => UNICODE_TO_TEXT[char])
      .filter(Boolean);
    return parts.join('.');
  }

  /**
   * Convert Unicode frame to natural language description.
   * e.g., "⊕◊▶β" -> "Execute in strict mode within the financial domain using a secondary agent"
   */
  unicodeToNaturalLanguage(unicode: string): string {
    const parsed = this.parseUnicodeFrame(unicode);
    if (!parsed) {
      return 'No recognized frame components';
    }

    const parts: string[] = [];

    // Build natural language description
    if (parsed.action) {
      parts.push(this.capitalize(parsed.action.name.replace('_', ' ')));
    }

    if (parsed.mode) {
      parts.push(`in ${parsed.mode.name} mode`);
    }

    if (parsed.domain) {
      parts.push(`within the ${parsed.domain.name} domain`);
    }

    if (parsed.entity) {
      parts.push(`using a ${parsed.entity.name.replace('_', ' ')}`);
    }

    if (parsed.constraints && parsed.constraints.length > 0) {
      const constraintNames = parsed.constraints.map(c => c.name).join(', ');
      parts.push(`(constraints: ${constraintNames})`);
    }

    if (parsed.modifiers && parsed.modifiers.length > 0) {
      const modifierNames = parsed.modifiers.map(m => m.name.replace('_', ' ')).join(', ');
      parts.push(`[${modifierNames}]`);
    }

    return parts.join(' ') || 'No recognized frame components';
  }

  /**
   * Convert natural language to Unicode frame.
   * e.g., "strict mode, financial domain, execute" -> "⊕◊▶"
   */
  naturalLanguageToUnicode(
    naturalLanguage: string,
    parseMode: 'strict' | 'fuzzy' = 'fuzzy'
  ): { unicode: string; confidence: number } {
    const parts: string[] = [];
    let totalConfidence = 0;
    let matchCount = 0;

    // Detect mode
    const modeResult = detectMode(naturalLanguage);
    if (modeResult) {
      const symbol = TEXT_TO_UNICODE[modeResult.textAlias];
      if (symbol) {
        parts.push(symbol);
        totalConfidence += modeResult.confidence;
        matchCount++;
      }
    }

    // Detect domain
    const domainResult = detectDomain(naturalLanguage);
    if (domainResult) {
      const symbol = TEXT_TO_UNICODE[domainResult.textAlias];
      if (symbol) {
        parts.push(symbol);
        totalConfidence += domainResult.confidence;
        matchCount++;
      }
    }

    // Detect action
    const actionResult = detectAction(naturalLanguage);
    if (actionResult) {
      const symbol = TEXT_TO_UNICODE[actionResult.textAlias];
      if (symbol) {
        parts.push(symbol);
        totalConfidence += actionResult.confidence;
        matchCount++;
      }
    }

    // Detect entity
    const entityResult = detectEntity(naturalLanguage);
    if (entityResult) {
      const symbol = TEXT_TO_UNICODE[entityResult.textAlias];
      if (symbol) {
        parts.push(symbol);
        totalConfidence += entityResult.confidence;
        matchCount++;
      }
    }

    // In strict mode, require at least mode and domain
    if (parseMode === 'strict' && matchCount < 2) {
      return { unicode: '', confidence: 0 };
    }

    const avgConfidence = matchCount > 0 ? totalConfidence / matchCount : 0;
    return {
      unicode: parts.join(''),
      confidence: avgConfidence,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PARSING METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse a Unicode frame into structured components.
   */
  parseUnicodeFrame(unicode: string): FrameTranslateResponse['parsed'] {
    const chars = [...unicode];
    const result: FrameTranslateResponse['parsed'] = {
      constraints: [],
      modifiers: [],
    };

    for (const char of chars) {
      const textAlias = UNICODE_TO_TEXT[char];
      const category = UNICODE_TO_CATEGORY[char];

      if (!textAlias || !category) continue;

      const symbolInfo = { symbol: char, name: textAlias };

      switch (category) {
        case 'mode':
          result.mode = symbolInfo;
          break;
        case 'domain':
          result.domain = symbolInfo;
          break;
        case 'action':
          result.action = symbolInfo;
          break;
        case 'entity':
          result.entity = symbolInfo;
          break;
        case 'constraint':
          result.constraints!.push(symbolInfo);
          break;
        case 'modifier':
          result.modifiers!.push(symbolInfo);
          break;
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OPACITY METHODS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get or create an opaque ID for a Unicode frame.
   */
  getOrCreateOpaqueId(unicode: string): string {
    // Check if already exists
    const existing = this.unicodeToOpaque.get(unicode);
    if (existing) {
      return existing;
    }

    // Create new opaque ID
    const opaqueId = `::${(++this.opaqueCounter).toString().padStart(5, '0')}`;
    this.unicodeToOpaque.set(unicode, opaqueId);
    this.opaqueToUnicode.set(opaqueId, unicode);

    return opaqueId;
  }

  /**
   * Resolve an opaque ID back to Unicode.
   */
  resolveOpaqueId(opaqueId: string): string | null {
    return this.opaqueToUnicode.get(opaqueId) ?? null;
  }

  /**
   * Register an opaque mapping (for loading from database).
   */
  registerOpaqueMapping(opaqueId: string, unicode: string): void {
    this.unicodeToOpaque.set(unicode, opaqueId);
    this.opaqueToUnicode.set(opaqueId, unicode);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY METHODS
  // ─────────────────────────────────────────────────────────────────────────

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const frameTranslator = new FrameTranslator();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick translation function for common use cases.
 */
export function translateFrame(
  input: string,
  inputFormat: 'unicode' | 'textAlias' | 'naturalLanguage' | 'opaqueId',
  outputFormats: FrameOutputFormat[]
): FrameTranslateResponse {
  const request: FrameTranslateRequest = {
    outputFormats,
  };

  switch (inputFormat) {
    case 'unicode':
      request.unicode = input;
      break;
    case 'textAlias':
      request.textAlias = input;
      break;
    case 'naturalLanguage':
      request.naturalLanguage = input;
      break;
    case 'opaqueId':
      request.opaqueId = input;
      break;
  }

  return frameTranslator.translate(request);
}

/**
 * Quick Unicode to text alias conversion.
 */
export function unicodeToText(unicode: string): string {
  return frameTranslator.unicodeToTextAlias(unicode);
}

/**
 * Quick text alias to Unicode conversion.
 */
export function textToUnicode(textAlias: string): string {
  return frameTranslator.textAliasToUnicode(textAlias);
}

/**
 * Quick Unicode to natural language conversion.
 */
export function unicodeToNatural(unicode: string): string {
  return frameTranslator.unicodeToNaturalLanguage(unicode);
}

/**
 * Quick natural language to Unicode conversion.
 */
export function naturalToUnicode(naturalLanguage: string): { unicode: string; confidence: number } {
  return frameTranslator.naturalLanguageToUnicode(naturalLanguage);
}
