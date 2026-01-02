// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - INDEX & TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
// Main entry point for the translation layer.
// Exports all translation components and MCP tool handlers.
// ═══════════════════════════════════════════════════════════════════════════

// Re-export all types
export * from './types.js';

// Re-export mappings
export {
  SYMBOL_MAPPINGS,
  UNICODE_TO_TEXT,
  TEXT_TO_UNICODE,
  UNICODE_TO_NATURAL,
  TEXT_TO_NATURAL,
  UNICODE_TO_CATEGORY,
  TEXT_TO_CATEGORY,
  TRANSLATION_MAPPINGS,
  getMappingsByCategory,
  detectMode,
  detectDomain,
  detectAction,
  detectEntity,
  MODE_NL_PATTERNS,
  DOMAIN_NL_PATTERNS,
  ACTION_NL_PATTERNS,
  ENTITY_NL_PATTERNS,
} from './mappings.js';

// Re-export frame translator
export {
  FrameTranslator,
  frameTranslator,
  translateFrame,
  unicodeToText,
  textToUnicode,
  unicodeToNatural,
  naturalToUnicode,
} from './frame-translator.js';

// Re-export LLM extractor
export {
  LLMExtractor,
  llmExtractor,
  extract5WH,
  extractWithRules,
  type LLMExtractionResult,
  type LLMExtractorOptions,
} from './llm-extractor.js';

// Re-export NL compiler
export {
  NLCompiler,
  nlCompiler,
  compileNL,
} from './compiler.js';

// Re-export NL decompiler
export {
  NLDecompiler,
  nlDecompiler,
  decompileNL,
} from './decompiler.js';

// Re-export opacity layer
export {
  OpacityLayer,
  opacityLayer,
  encrypt,
  decrypt,
  resolveTokens,
  applyOpacity,
  removeOpacity,
} from './opacity-layer.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

import type {
  FrameTranslateRequest,
  FrameTranslateResponse,
  FrameOutputFormat,
  NLCompileRequest,
  NLDecompileRequest,
  DecompileOutputFormat,
  DecompileAudience,
  OpacityResolveRequest,
} from './types.js';
import { frameTranslator } from './frame-translator.js';
import { nlCompiler } from './compiler.js';
import { nlDecompiler } from './decompiler.js';
import { opacityLayer } from './opacity-layer.js';

/**
 * Tool definition for ps_frame_translate.
 */
export const PS_FRAME_TRANSLATE_TOOL = {
  name: 'ps_frame_translate',
  description: `Translate PromptSpeak frames between formats:
- Unicode symbols (⊕◊▶β)
- Text aliases (strict.financial.execute.secondary)
- Natural language ("strict mode, financial domain, execute action")
- Opaque IDs (::34920)

Provide exactly ONE input format and specify which output formats you want.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      unicode: {
        type: 'string',
        description: 'Unicode frame input (e.g., "⊕◊▶β")',
      },
      textAlias: {
        type: 'string',
        description: 'Text alias input (e.g., "strict.financial.execute.secondary")',
      },
      naturalLanguage: {
        type: 'string',
        description: 'Natural language input (e.g., "strict mode, financial domain")',
      },
      opaqueId: {
        type: 'string',
        description: 'Opaque ID input (e.g., "::34920")',
      },
      outputFormats: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['unicode', 'textAlias', 'naturalLanguage', 'opaqueId'],
        },
        description: 'Output formats to generate',
        default: ['unicode', 'textAlias', 'naturalLanguage'],
      },
      nlParseMode: {
        type: 'string',
        enum: ['strict', 'fuzzy'],
        description: 'How strictly to parse natural language (default: fuzzy)',
        default: 'fuzzy',
      },
      opacityMode: {
        type: 'string',
        enum: ['transparent', 'opaque'],
        description: 'Whether to generate opaque IDs',
        default: 'transparent',
      },
    },
    required: ['outputFormats'],
  },
};

/**
 * Tool definition for ps_nl_compile.
 * Compiles natural language into PromptSpeak symbols and frames using LLM-powered extraction.
 */
export const PS_NL_COMPILE_TOOL = {
  name: 'ps_nl_compile',
  description: `Compile natural language task descriptions into PromptSpeak symbols and frames.

Uses LLM-powered 5W+H extraction to intelligently parse:
- WHO: Target audience or stakeholder
- WHAT: The core task being performed
- WHY: Purpose or motivation
- WHERE: Scope or boundaries
- WHEN: Time context
- HOW: Focus areas, constraints, output format

Returns a symbol ID (e.g., Ξ.NVDA.Q3FY25) and/or frame (e.g., strict.financial.execute.secondary).
Content can be wrapped in opaque tokens (::34920) for security.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      naturalLanguage: {
        type: 'string',
        description: 'The natural language task description to compile',
      },
      outputType: {
        type: 'string',
        enum: ['symbol', 'frame', 'both'],
        description: 'What to generate: symbol ID, frame, or both (default: both)',
        default: 'both',
      },
      opacityMode: {
        type: 'string',
        enum: ['transparent', 'opaque', 'hybrid'],
        description: 'Content visibility: transparent (visible), opaque (::tokens), or hybrid (visible ID, opaque content). Default: transparent',
        default: 'transparent',
      },
      symbolIdHint: {
        type: 'string',
        description: 'Optional hint for symbol ID generation (e.g., "NVDA" for NVIDIA)',
      },
      autoCreate: {
        type: 'boolean',
        description: 'Whether to actually create the symbol in the registry (default: false)',
        default: false,
      },
      extractKeyTerms: {
        type: 'boolean',
        description: 'Extract specific terms, numbers, and names that must appear in output (default: true)',
        default: true,
      },
      extractRequirements: {
        type: 'boolean',
        description: 'Extract explicit MUST/MUST NOT requirements (default: true)',
        default: true,
      },
    },
    required: ['naturalLanguage'],
  },
};

/**
 * Tool definition for ps_nl_decompile.
 * Converts PromptSpeak symbols and frames back to human-readable natural language.
 */
export const PS_NL_DECOMPILE_TOOL = {
  name: 'ps_nl_decompile',
  description: `Convert PromptSpeak symbols and frames back to human-readable natural language.

Supports multiple output formats for different audiences:
- summary: Brief overview (1-3 sentences)
- detailed: Full breakdown with sections
- audit: Formal record with hash, version, timestamps
- stakeholder: Non-technical explanation for executives

Provide a symbol ID (e.g., Ξ.NVDA.Q3FY25) and/or frame (e.g., ⊕◊▶β) to explain.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      symbolId: {
        type: 'string',
        description: 'Symbol ID to explain (e.g., "Ξ.NVDA.Q3FY25")',
      },
      frame: {
        type: 'string',
        description: 'Frame to explain - Unicode (e.g., "⊕◊▶β") or text alias (e.g., "strict.financial.execute")',
      },
      outputFormat: {
        type: 'string',
        enum: ['summary', 'detailed', 'audit', 'stakeholder'],
        description: 'Output format (default: summary)',
        default: 'summary',
      },
      audience: {
        type: 'string',
        enum: ['technical', 'executive', 'legal', 'general'],
        description: 'Target audience - affects language and detail level (default: general)',
        default: 'general',
      },
      includeHash: {
        type: 'boolean',
        description: 'Include content hash in output (default: false)',
        default: false,
      },
      includeVersion: {
        type: 'boolean',
        description: 'Include version number in output (default: false)',
        default: false,
      },
      resolveOpaque: {
        type: 'boolean',
        description: 'Resolve opaque tokens (::12345) to plain text - requires authToken (default: false)',
        default: false,
      },
      authToken: {
        type: 'string',
        description: 'Authorization token for resolving opaque content',
      },
    },
    required: [],
  },
};

/**
 * Tool definition for ps_opacity_resolve.
 * Resolves opaque tokens back to plaintext (requires authorization).
 */
export const PS_OPACITY_RESOLVE_TOOL = {
  name: 'ps_opacity_resolve',
  description: `Resolve opaque tokens (::12345) back to their original plaintext values.

Opaque tokens are used to protect sensitive content in PromptSpeak symbols.
This tool decrypts them for authorized users.

Example tokens: ::10001, ::10002, ::10003`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      tokens: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of opaque tokens to resolve (e.g., ["::10001", "::10002"])',
      },
      authToken: {
        type: 'string',
        description: 'Authorization token (currently optional, will be required in production)',
      },
    },
    required: ['tokens'],
  },
};

/**
 * Tool definition for ps_opacity_stats.
 * Get statistics about the opacity layer.
 */
export const PS_OPACITY_STATS_TOOL = {
  name: 'ps_opacity_stats',
  description: `Get statistics about the opacity layer including token counts and access patterns.`,
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
};

/**
 * All translation tool definitions for registration in server.ts.
 */
export const translationToolDefinitions = [
  PS_FRAME_TRANSLATE_TOOL,
  PS_NL_COMPILE_TOOL,
  PS_NL_DECOMPILE_TOOL,
  PS_OPACITY_RESOLVE_TOOL,
  PS_OPACITY_STATS_TOOL,
  // Future tools will be added here:
  // PS_TRANSLATE_BATCH_TOOL,
];

// ─────────────────────────────────────────────────────────────────────────────
// MCP TOOL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle ps_frame_translate tool call.
 */
export function handleFrameTranslate(args: Record<string, unknown>): Record<string, unknown> {
  const outputFormats = (args.outputFormats as string[] | undefined) || ['unicode', 'textAlias', 'naturalLanguage'];

  const request: FrameTranslateRequest = {
    unicode: args.unicode as string | undefined,
    textAlias: args.textAlias as string | undefined,
    naturalLanguage: args.naturalLanguage as string | undefined,
    opaqueId: args.opaqueId as string | undefined,
    outputFormats: outputFormats as FrameOutputFormat[],
    nlParseMode: (args.nlParseMode as 'strict' | 'fuzzy') || 'fuzzy',
    opacityMode: (args.opacityMode as 'transparent' | 'opaque') || 'transparent',
  };

  const result = frameTranslator.translate(request);

  // Convert to plain object for MCP response
  return { ...result };
}

/**
 * Handle ps_nl_compile tool call.
 * Compiles natural language into PromptSpeak symbols and frames.
 */
export async function handleNLCompile(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const naturalLanguage = args.naturalLanguage as string;

  if (!naturalLanguage) {
    return {
      success: false,
      error: 'naturalLanguage is required',
    };
  }

  const request: NLCompileRequest = {
    naturalLanguage,
    outputType: (args.outputType as 'symbol' | 'frame' | 'both') || 'both',
    opacityMode: (args.opacityMode as 'transparent' | 'opaque' | 'hybrid') || 'transparent',
    symbolOptions: args.symbolIdHint ? {
      symbolIdHint: args.symbolIdHint as string,
      autoCreate: args.autoCreate as boolean | undefined,
    } : undefined,
    extractKeyTerms: args.extractKeyTerms !== false,
    extractRequirements: args.extractRequirements !== false,
  };

  const result = await nlCompiler.compile(request);

  // Convert to plain object for MCP response
  return { ...result };
}

/**
 * Handle ps_nl_decompile tool call.
 * Converts symbols and frames back to human-readable natural language.
 */
export async function handleNLDecompile(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const symbolId = args.symbolId as string | undefined;
  const frame = args.frame as string | undefined;

  if (!symbolId && !frame) {
    return {
      success: false,
      error: 'Either symbolId or frame must be provided',
    };
  }

  const request: NLDecompileRequest = {
    symbolId,
    frame,
    outputFormat: (args.outputFormat as DecompileOutputFormat) || 'summary',
    audience: (args.audience as DecompileAudience) || 'general',
    includeHash: args.includeHash as boolean | undefined,
    includeVersion: args.includeVersion as boolean | undefined,
    resolveOpaque: args.resolveOpaque as boolean | undefined,
    authToken: args.authToken as string | undefined,
  };

  const result = await nlDecompiler.decompile(request);

  // Convert to plain object for MCP response
  return { ...result };
}

/**
 * Handle ps_opacity_resolve tool call.
 * Resolves opaque tokens back to plaintext.
 */
export async function handleOpacityResolve(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tokens = args.tokens as string[] | undefined;

  if (!tokens || !Array.isArray(tokens)) {
    return {
      success: false,
      error: 'tokens must be an array of strings',
      resolved: {},
      unresolved: [],
    };
  }

  const request: OpacityResolveRequest = {
    tokens,
    authToken: args.authToken as string | undefined,
  };

  const result = await opacityLayer.resolve(request);

  // Convert to plain object for MCP response
  return { ...result };
}

/**
 * Handle ps_opacity_stats tool call.
 * Returns statistics about the opacity layer.
 */
export async function handleOpacityStats(): Promise<Record<string, unknown>> {
  try {
    const stats = await opacityLayer.getStats();
    return {
      success: true,
      ...stats,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main handler for all translation tools.
 * Routes to the appropriate handler based on tool name.
 */
export async function handleTranslationTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'ps_frame_translate':
      return handleFrameTranslate(args);

    case 'ps_nl_compile':
      return handleNLCompile(args);

    case 'ps_nl_decompile':
      return handleNLDecompile(args);

    case 'ps_opacity_resolve':
      return handleOpacityResolve(args);

    case 'ps_opacity_stats':
      return handleOpacityStats();

    // Future handlers:
    // case 'ps_translate_batch':
    //   return handleTranslateBatch(args);

    default:
      return {
        success: false,
        error: `Unknown translation tool: ${toolName}`,
      };
  }
}
