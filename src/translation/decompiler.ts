// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - NATURAL LANGUAGE DECOMPILER
// ═══════════════════════════════════════════════════════════════════════════
// Converts PromptSpeak symbols and frames back into human-readable natural language.
// Supports multiple output formats for different audiences.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  NLDecompileRequest,
  NLDecompileResponse,
  DecompileOutputFormat,
  DecompileAudience,
  Extracted5WH,
} from './types.js';

import { frameTranslator } from './frame-translator.js';
import { UNICODE_TO_TEXT, TEXT_TO_NATURAL, UNICODE_TO_CATEGORY } from './mappings.js';

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Templates for different output formats.
 * Uses placeholders like {symbolId}, {frameExplanation}, etc.
 */
const OUTPUT_TEMPLATES: Record<DecompileOutputFormat, string> = {
  summary: `{title}

{purpose}

{frameDescription}`,

  detailed: `# {title}

## Overview
{purpose}

## Execution Context
{frameDescription}

## Key Parameters
{parameters}

## Requirements
{requirements}

## Constraints
{constraints}`,

  audit: `═══════════════════════════════════════════════════════════════
AUDIT RECORD
═══════════════════════════════════════════════════════════════
Symbol ID: {symbolId}
Version: {version}
Hash: {hash}
Created: {createdAt}
Last Updated: {updatedAt}
Accessed: {accessedAt}
───────────────────────────────────────────────────────────────
{purpose}
───────────────────────────────────────────────────────────────
Frame: {frameUnicode} ({frameTextAlias})
{frameDescription}
═══════════════════════════════════════════════════════════════`,

  stakeholder: `**{title}**

{purpose}

_This task operates in {modeDescription} within the {domainDescription}._

{actionDescription}`,
};

/**
 * Audience-specific language adjustments.
 */
const AUDIENCE_ADJUSTMENTS: Record<DecompileAudience, {
  simplify: boolean;
  includeSymbols: boolean;
  formalTone: boolean;
}> = {
  technical: { simplify: false, includeSymbols: true, formalTone: false },
  executive: { simplify: true, includeSymbols: false, formalTone: true },
  legal: { simplify: false, includeSymbols: false, formalTone: true },
  general: { simplify: true, includeSymbols: false, formalTone: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// FRAME EXPLANATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface FrameComponents {
  mode?: { symbol: string; name: string; description: string };
  domain?: { symbol: string; name: string; description: string };
  action?: { symbol: string; name: string; description: string };
  entity?: { symbol: string; name: string; description: string };
}

/**
 * Parse a frame (Unicode or text alias) into its components with descriptions.
 */
function parseFrameComponents(frame: string): FrameComponents {
  const components: FrameComponents = {};

  // Determine if it's Unicode or text alias
  const isUnicode = /[⊕⊖⊗⊘◊◈◇◆◐▶◀▲▼●○αβγω]/.test(frame);

  if (isUnicode) {
    const chars = [...frame];
    for (const char of chars) {
      const textAlias = UNICODE_TO_TEXT[char];
      const category = UNICODE_TO_CATEGORY[char];
      const description = TEXT_TO_NATURAL[textAlias] || textAlias;

      if (category && textAlias) {
        const info = { symbol: char, name: textAlias, description };
        switch (category) {
          case 'mode': components.mode = info; break;
          case 'domain': components.domain = info; break;
          case 'action': components.action = info; break;
          case 'entity': components.entity = info; break;
        }
      }
    }
  } else {
    // Text alias format: strict.financial.execute.secondary
    const parts = frame.split('.');
    const categories = ['mode', 'domain', 'action', 'entity'] as const;

    parts.forEach((part, index) => {
      if (index < categories.length) {
        const category = categories[index];
        const description = TEXT_TO_NATURAL[part] || part;
        components[category] = { symbol: '', name: part, description };
      }
    });
  }

  return components;
}

/**
 * Generate a human-readable frame description.
 */
function generateFrameDescription(
  components: FrameComponents,
  audience: DecompileAudience
): string {
  const parts: string[] = [];
  const settings = AUDIENCE_ADJUSTMENTS[audience];

  if (components.action) {
    if (settings.simplify) {
      parts.push(`Task: ${capitalizeFirst(components.action.name)}`);
    } else {
      parts.push(`Action: ${components.action.description}`);
    }
  }

  if (components.mode) {
    if (settings.simplify) {
      parts.push(`Mode: ${capitalizeFirst(components.mode.name)}`);
    } else {
      parts.push(`Mode: ${components.mode.description}`);
    }
  }

  if (components.domain) {
    if (settings.simplify) {
      parts.push(`Domain: ${capitalizeFirst(components.domain.name)}`);
    } else {
      parts.push(`Domain: ${components.domain.description}`);
    }
  }

  if (components.entity) {
    if (settings.simplify) {
      parts.push(`Agent: ${capitalizeFirst(components.entity.name)}`);
    } else {
      parts.push(`Agent Type: ${components.entity.description}`);
    }
  }

  return parts.join('\n');
}

/**
 * Generate mode-specific description for stakeholder format.
 */
function getModeDescription(components: FrameComponents): string {
  if (!components.mode) return 'standard mode';

  switch (components.mode.name) {
    case 'strict': return 'strict compliance mode (exact requirements must be met)';
    case 'flexible': return 'flexible mode (reasonable interpretation allowed)';
    case 'forbidden': return 'restricted mode (certain actions are prohibited)';
    case 'neutral': return 'neutral mode (balanced approach)';
    default: return `${components.mode.name} mode`;
  }
}

/**
 * Generate domain-specific description for stakeholder format.
 */
function getDomainDescription(components: FrameComponents): string {
  if (!components.domain) return 'general context';

  switch (components.domain.name) {
    case 'financial': return 'financial domain (audit trail required)';
    case 'legal': return 'legal domain (confidentiality enforced)';
    case 'technical': return 'technical domain';
    case 'medical': return 'medical domain (HIPAA compliance)';
    case 'operational': return 'operational domain';
    default: return `${components.domain.name} domain`;
  }
}

/**
 * Generate action description for stakeholder format.
 */
function getActionDescription(components: FrameComponents): string {
  if (!components.action) return '';

  const entityName = components.entity?.name || 'agent';

  switch (components.action.name) {
    case 'execute':
      return `A ${entityName} will execute this task directly.`;
    case 'delegate':
      return `This task will be delegated to a ${entityName} for handling.`;
    case 'escalate':
      return `This task requires escalation for higher-level review.`;
    case 'propose':
      return `A ${entityName} will propose a solution for approval.`;
    case 'commit':
      return `This task will be committed and finalized by a ${entityName}.`;
    default:
      return `Action: ${components.action.name}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYMBOL DECOMPILATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a symbol ID into readable components.
 * e.g., "Ξ.C.NVDA.Q3FY25" -> { prefix: "Ξ", category: "COMPANY", identifier: "NVDA", context: "Q3FY25" }
 */
function parseSymbolId(symbolId: string): {
  prefix: string;
  categoryCode: string;
  category: string;
  identifier: string;
  context?: string;
} {
  const parts = symbolId.split('.');

  const categoryMap: Record<string, string> = {
    'C': 'Company',
    'P': 'Person',
    'E': 'Event',
    'S': 'Sector',
    'T': 'Task',
    'K': 'Knowledge',
    'Q': 'Query',
  };

  return {
    prefix: parts[0] || 'Ξ',
    categoryCode: parts[1] || 'T',
    category: categoryMap[parts[1]] || 'Unknown',
    identifier: parts[2] || 'UNKNOWN',
    context: parts[3],
  };
}

/**
 * Generate a title from symbol ID.
 */
function generateTitle(symbolId: string): string {
  const parsed = parseSymbolId(symbolId);

  // Convert identifier to readable format
  const readableId = parsed.identifier
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => capitalizeFirst(word.toLowerCase()))
    .join(' ');

  if (parsed.context) {
    return `${parsed.category}: ${readableId} (${parsed.context})`;
  }
  return `${parsed.category}: ${readableId}`;
}

/**
 * Generate purpose description from symbol and extracted content.
 */
function generatePurpose(
  symbolId: string,
  extracted?: Extracted5WH
): string {
  if (extracted) {
    const parts: string[] = [];

    if (extracted.commanders_intent) {
      parts.push(extracted.commanders_intent);
    } else {
      if (extracted.what) parts.push(extracted.what);
      if (extracted.why) parts.push(`Purpose: ${extracted.why}`);
    }

    if (extracted.who) {
      parts.push(`Target audience: ${extracted.who}`);
    }

    if (extracted.where) {
      parts.push(`Scope: ${extracted.where}`);
    }

    if (extracted.when) {
      parts.push(`Time context: ${extracted.when}`);
    }

    return parts.join('\n');
  }

  // Fallback: generate from symbol ID
  const parsed = parseSymbolId(symbolId);
  return `Analysis of ${parsed.identifier}${parsed.context ? ` for ${parsed.context}` : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DECOMPILER CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class NLDecompiler {
  /**
   * Decompile a symbol and/or frame to natural language.
   */
  async decompile(request: NLDecompileRequest): Promise<NLDecompileResponse> {
    try {
      const { symbolId, frame, outputFormat, audience = 'general' } = request;

      if (!symbolId && !frame) {
        return {
          success: false,
          naturalLanguage: '',
          error: 'Either symbolId or frame must be provided',
        };
      }

      // Parse frame components if provided
      let frameComponents: FrameComponents = {};
      if (frame) {
        frameComponents = parseFrameComponents(frame);
      }

      // Generate the natural language output based on format
      const naturalLanguage = this.generateOutput(
        outputFormat,
        audience,
        symbolId,
        frame,
        frameComponents,
        request
      );

      // Build response
      const response: NLDecompileResponse = {
        success: true,
        naturalLanguage,
      };

      // Add breakdown if detailed format
      if (outputFormat === 'detailed' || outputFormat === 'audit') {
        response.breakdown = {
          symbolExplanation: symbolId ? generateTitle(symbolId) : undefined,
          frameExplanation: frame
            ? frameTranslator.unicodeToNaturalLanguage(frame)
            : undefined,
          combinedMeaning: this.generateCombinedMeaning(symbolId, frameComponents),
        };
      }

      // Add audit info if requested
      if (request.includeHash || request.includeVersion || outputFormat === 'audit') {
        response.auditInfo = {
          symbolId,
          version: 1, // Would come from registry
          hash: symbolId ? this.simpleHash(symbolId) : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accessedAt: new Date().toISOString(),
        };
      }

      return response;
    } catch (error) {
      return {
        success: false,
        naturalLanguage: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate output based on format and audience.
   */
  private generateOutput(
    format: DecompileOutputFormat,
    audience: DecompileAudience,
    symbolId?: string,
    frame?: string,
    frameComponents?: FrameComponents,
    request?: NLDecompileRequest
  ): string {
    const settings = AUDIENCE_ADJUSTMENTS[audience];
    let template = OUTPUT_TEMPLATES[format];

    // Generate template variables
    const vars: Record<string, string> = {
      title: symbolId ? generateTitle(symbolId) : 'PromptSpeak Task',
      symbolId: symbolId || 'N/A',
      purpose: symbolId ? generatePurpose(symbolId) : 'Task execution',
      frameUnicode: frame || 'N/A',
      frameTextAlias: frame ? this.getTextAlias(frame) : 'N/A',
      frameDescription: frameComponents
        ? generateFrameDescription(frameComponents, audience)
        : 'No frame specified',
      modeDescription: frameComponents ? getModeDescription(frameComponents) : 'standard mode',
      domainDescription: frameComponents ? getDomainDescription(frameComponents) : 'general context',
      actionDescription: frameComponents ? getActionDescription(frameComponents) : '',
      version: '1',
      hash: symbolId ? this.simpleHash(symbolId) : 'N/A',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessedAt: new Date().toISOString(),
      parameters: 'See symbol registry for full parameters',
      requirements: 'See symbol registry for requirements',
      constraints: 'See symbol registry for constraints',
    };

    // Replace template variables
    for (const [key, value] of Object.entries(vars)) {
      template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    // Clean up empty lines if stakeholder format
    if (format === 'stakeholder') {
      template = template.replace(/\n{3,}/g, '\n\n').trim();
    }

    return template;
  }

  /**
   * Generate combined meaning from symbol and frame.
   */
  private generateCombinedMeaning(
    symbolId?: string,
    frameComponents?: FrameComponents
  ): string {
    const parts: string[] = [];

    if (symbolId) {
      const parsed = parseSymbolId(symbolId);
      parts.push(`This is a ${parsed.category.toLowerCase()} symbol (${parsed.identifier})`);
      if (parsed.context) {
        parts.push(`in the context of ${parsed.context}`);
      }
    }

    if (frameComponents) {
      if (frameComponents.action) {
        parts.push(`The requested action is to ${frameComponents.action.name}`);
      }
      if (frameComponents.mode) {
        parts.push(`operating in ${frameComponents.mode.name} mode`);
      }
      if (frameComponents.domain) {
        parts.push(`within the ${frameComponents.domain.name} domain`);
      }
    }

    return parts.join(' ') + '.';
  }

  /**
   * Get text alias from Unicode frame or return as-is if already text.
   */
  private getTextAlias(frame: string): string {
    if (/[⊕⊖⊗⊘◊◈◇◆◐▶◀▲▼●○αβγω]/.test(frame)) {
      return frameTranslator.unicodeToTextAlias(frame);
    }
    return frame;
  }

  /**
   * Simple hash for audit purposes.
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const nlDecompiler = new NLDecompiler();

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decompile a symbol and/or frame to natural language.
 */
export async function decompileNL(
  symbolId?: string,
  frame?: string,
  options?: Partial<NLDecompileRequest>
): Promise<NLDecompileResponse> {
  const request: NLDecompileRequest = {
    symbolId,
    frame,
    outputFormat: options?.outputFormat || 'summary',
    audience: options?.audience || 'general',
    includeHash: options?.includeHash,
    includeVersion: options?.includeVersion,
    includeChangelog: options?.includeChangelog,
    resolveOpaque: options?.resolveOpaque,
    authToken: options?.authToken,
  };

  return nlDecompiler.decompile(request);
}
