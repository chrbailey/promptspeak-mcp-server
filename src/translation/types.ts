// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
// Bidirectional translation between natural language and PromptSpeak symbols.
// Implements hybrid opacity: readable IDs with opaque content.
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// FRAME TRANSLATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All possible output formats for frame translation.
 */
export type FrameOutputFormat = 'unicode' | 'textAlias' | 'naturalLanguage' | 'opaqueId';

/**
 * Request to translate a frame between formats.
 * Provide exactly ONE of the input formats.
 */
export interface FrameTranslateRequest {
  // Input (provide exactly one)
  unicode?: string;              // e.g., "⊕◊▶β"
  textAlias?: string;            // e.g., "strict.financial.execute.secondary"
  naturalLanguage?: string;      // e.g., "strict mode, financial domain, execute"
  opaqueId?: string;             // e.g., "::34920"

  // Output formats to generate
  outputFormats: FrameOutputFormat[];

  // Parsing options
  nlParseMode?: 'strict' | 'fuzzy';  // How strictly to parse NL (default: fuzzy)

  // Opacity options
  opacityMode?: 'transparent' | 'opaque';
}

/**
 * Result of frame translation.
 */
export interface FrameTranslateResponse {
  success: boolean;

  // Output in all requested formats
  unicode?: string;              // "⊕◊▶β"
  textAlias?: string;            // "strict.financial.execute.secondary"
  naturalLanguage?: string;      // "Execute in strict mode within the financial domain..."
  opaqueId?: string;             // "::34920"

  // Parsed structure (for validation)
  parsed?: {
    mode?: { symbol: string; name: string };
    domain?: { symbol: string; name: string };
    action?: { symbol: string; name: string };
    entity?: { symbol: string; name: string };
    constraints?: Array<{ symbol: string; name: string }>;
    modifiers?: Array<{ symbol: string; name: string }>;
  };

  // Validation status
  isValid?: boolean;
  validationErrors?: string[];

  // Confidence (for NL parsing)
  confidence?: number;

  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL LANGUAGE COMPILATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What to generate from natural language input.
 */
export type CompileOutputType = 'symbol' | 'frame' | 'both';

/**
 * Opacity mode for content storage.
 */
export type OpacityMode = 'transparent' | 'opaque' | 'hybrid';

/**
 * The 5W+H framework extracted from natural language.
 */
export interface Extracted5WH {
  who: string;                   // Target audience/stakeholder
  what: string;                  // What is being done/analyzed
  why: string;                   // Purpose/motivation
  where: string;                 // Scope/boundaries
  when: string;                  // Time context

  how: {
    focus: string[];             // Key areas to emphasize
    constraints: string[];       // Restrictions/guardrails
    output_format?: string;      // Expected output style
  };

  commanders_intent: string;     // Ultimate goal in one sentence
  requirements: string[];        // Explicit MUST requirements
  anti_requirements?: string[];  // MUST NOT requirements
  key_terms: string[];           // Terms that must appear in output
}

/**
 * Request to compile natural language into PromptSpeak symbols.
 */
export interface NLCompileRequest {
  // The natural language input
  naturalLanguage: string;

  // What to generate
  outputType: CompileOutputType;

  // Opacity mode for content
  opacityMode: OpacityMode;

  // Symbol options (for outputType: 'symbol' or 'both')
  symbolOptions?: {
    category?: string;           // Auto-infer if not provided
    symbolIdHint?: string;       // Suggested ID pattern
    created_by?: string;
    autoCreate?: boolean;        // Actually create in registry (default: false)
    tags?: string[];
  };

  // Frame options (for outputType: 'frame' or 'both')
  frameOptions?: {
    inferMode?: boolean;         // Auto-detect strict/flexible (default: true)
    inferDomain?: boolean;       // Auto-detect domain from context (default: true)
    parentFrame?: string;        // For chain validation
  };

  // Extraction options
  extractKeyTerms?: boolean;     // Auto-extract key_terms from NL (default: true)
  extractRequirements?: boolean; // Auto-extract requirements from NL (default: true)
}

/**
 * Result of natural language compilation.
 */
export interface NLCompileResponse {
  success: boolean;

  // Generated symbol (if requested)
  symbol?: {
    symbolId: string;
    category: string;
    hash: string;
    version: number;
    created: boolean;            // True if actually created in registry
  };

  // Generated frame (if requested)
  frame?: {
    unicode: string;             // "⊕◊▶β"
    textAlias: string;           // "strict.financial.execute.secondary"
    opaqueId?: string;           // "::34920" (if opaque mode)
  };

  // Extracted 5W+H (with opaque tokens if opacityMode != 'transparent')
  extracted: Extracted5WH | OpaqueExtracted5WH;

  // Raw extracted content (always transparent, for internal use)
  rawExtracted?: Extracted5WH;

  // Inference confidence and reasoning
  confidence: number;
  reasoning: string;             // Why these interpretations were chosen

  // Alternative interpretations (if ambiguous)
  alternativeInterpretations?: Array<{
    interpretation: string;
    confidence: number;
  }>;

  error?: string;
}

/**
 * Extracted 5W+H with opaque content tokens.
 */
export interface OpaqueExtracted5WH {
  who: string;                   // "::84721"
  what: string;                  // "::39204"
  why: string;                   // "::12948"
  where: string;                 // "::48291"
  when: string;                  // "::73920"

  how: {
    focus: string[];             // ["::39201", "::48201"]
    constraints: string[];       // ["::12039", "::49201"]
    output_format?: string;      // "::83921"
  };

  commanders_intent: string;     // "::29384"
  requirements: string[];        // ["::12039", "::49201", ...]
  anti_requirements?: string[];  // ["::83921", ...]
  key_terms: string[];           // ["::48291", "::73920", ...]
}

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL LANGUAGE DECOMPILATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output format for decompilation.
 */
export type DecompileOutputFormat = 'summary' | 'detailed' | 'audit' | 'stakeholder';

/**
 * Target audience for output formatting.
 */
export type DecompileAudience = 'technical' | 'executive' | 'legal' | 'general';

/**
 * Request to decompile symbols back to natural language.
 */
export interface NLDecompileRequest {
  // Input (one or both)
  symbolId?: string;             // e.g., "Ξ.NVDA.Q3FY25"
  frame?: string;                // e.g., "⊕◊▶β" or "strict.financial.execute"

  // Output format
  outputFormat: DecompileOutputFormat;

  // Audience targeting
  audience?: DecompileAudience;

  // Include internal details
  includeHash?: boolean;
  includeVersion?: boolean;
  includeChangelog?: boolean;

  // Opacity handling
  resolveOpaque?: boolean;       // Resolve ::tokens to plain text
  authToken?: string;            // Required for opaque resolution
  revealTransforms?: boolean;    // Show covert-ops transforms (requires auth)
}

/**
 * Result of decompilation to natural language.
 */
export interface NLDecompileResponse {
  success: boolean;

  // The natural language output
  naturalLanguage: string;

  // Structured breakdown (if detailed)
  breakdown?: {
    symbolExplanation?: string;
    frameExplanation?: string;
    combinedMeaning?: string;
  };

  // Audit information (if requested)
  auditInfo?: {
    symbolId?: string;
    version?: number;
    hash?: string;
    createdAt?: string;
    updatedAt?: string;
    accessedAt: string;
    accessedBy?: string;
  };

  // Covert-ops info (if authorized and requested)
  covertOpsInfo?: {
    originalMeaning?: string;
    transformedMeaning?: string;
    silentTransforms?: string[];
  };

  // Unresolved tokens (if any)
  unresolvedTokens?: string[];

  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPACITY LAYER TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An opaque token mapping stored in the database.
 */
export interface OpaqueMapping {
  token: string;                 // "::34920"
  plaintext: string;             // The actual value
  symbolId?: string;             // Which symbol this belongs to
  fieldName?: string;            // "who", "requirements[0]", etc.
  createdAt: string;             // ISO 8601
  expiresAt?: string;            // Optional TTL
  accessCount: number;
}

/**
 * Request to resolve opaque tokens.
 */
export interface OpacityResolveRequest {
  tokens: string[];              // ["::84721", "::39204"]
  authToken?: string;            // Required for resolution
}

/**
 * Result of opaque token resolution.
 */
export interface OpacityResolveResponse {
  success: boolean;
  resolved: Record<string, string>;  // { "::84721": "Investment Committee", ... }
  unresolved: string[];              // Tokens that couldn't be resolved
  error?: string;
}

/**
 * Request to encrypt content into opaque tokens.
 */
export interface OpacityEncryptRequest {
  content: Record<string, unknown>;  // { who: "Investment Committee", ... }
  symbolId?: string;                 // Associate with a symbol
}

/**
 * Result of content encryption.
 */
export interface OpacityEncryptResponse {
  success: boolean;
  encrypted: Record<string, unknown>;  // { who: "::84721", ... }
  tokenMap: Record<string, string>;    // { "::84721": "who", ... }
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH TRANSLATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single item in a batch translation request.
 */
export interface BatchTranslateItem {
  type: 'frame' | 'symbol' | 'nl';
  input: string;
  outputFormat: string;
}

/**
 * Request to translate multiple items.
 */
export interface BatchTranslateRequest {
  items: BatchTranslateItem[];
  opacityMode?: OpacityMode;
  stopOnError?: boolean;
}

/**
 * Result of a single item in batch translation.
 */
export interface BatchTranslateItemResult {
  index: number;
  success: boolean;
  input: string;
  output?: string;
  error?: string;
}

/**
 * Result of batch translation.
 */
export interface BatchTranslateResponse {
  success: boolean;
  results: BatchTranslateItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYMBOL MAPPING TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mapping entry between Unicode, text alias, and natural language.
 */
export interface SymbolMapping {
  unicode: string;               // "⊕"
  textAlias: string;             // "strict"
  naturalLanguage: string;       // "strict mode (exact compliance required)"
  category: string;              // "mode", "domain", "action", etc.
  metadata?: Record<string, unknown>;
}

/**
 * Complete mapping tables for translation.
 */
export interface TranslationMappings {
  unicodeToText: Record<string, string>;
  textToUnicode: Record<string, string>;
  textToNatural: Record<string, string>;
  naturalToText: Record<string, string>;
  categoryMap: Record<string, string>;  // unicode -> category
}
