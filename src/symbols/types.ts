/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK DIRECTIVE SYMBOL TYPES v2.1
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for the Directive Symbol Registry.
 * Symbols are persistent, queryable context anchors for multi-agent grounding.
 *
 * v2.0 Enhancements:
 * - MECE category taxonomy (13 categories in 7 families)
 * - Enhanced 5W+H with nested structures
 * - Domain-specific extensions (financial, legal, regulatory, metric)
 * - Provenance and trust scoring
 * - Namespace support for multi-tenant isolation
 *
 * v2.1 Enhancements:
 * - Epistemic uncertainty tracking for probabilistic outputs
 * - Claim type detection and evidence requirements
 * - Human verification workflows
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Epistemic uncertainty types (inlined from @cbailey/types-shared)
import type { EpistemicMetadata, EvidenceBasis } from './epistemic-types.js';

// Re-export epistemic types for convenience
export type { EpistemicMetadata, EvidenceBasis } from './epistemic-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL CATEGORIES v2.0 (MECE Taxonomy)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Category families for grouping related symbol types.
 * Based on PromptSpeak Registry v2.0 MECE principles.
 */
export type CategoryFamily =
  | 'AGENT'     // Active entities that act
  | 'RESOURCE'  // Passive entities acted upon
  | 'EVENT'     // Things that happen
  | 'FLOW'      // Processes and workflows
  | 'RULE'      // Constraints and policies
  | 'UNIT'      // Reference data
  | 'QUERY';    // Benchmark/test queries

/**
 * Full symbol category taxonomy.
 * Each category maps to a family for hierarchical organization.
 */
export type SymbolCategory =
  // AGENT family
  | 'COMPANY'           // Ξ.C.NVDA - Organizations
  | 'PERSON'            // Ξ.P.JENSEN_HUANG - Individuals
  | 'SYSTEM'            // Ξ.SY.TRADING_ENGINE - Automated systems

  // RESOURCE family
  | 'DOCUMENT'          // Ξ.D.10K.NVDA.2024 - Documents, filings
  | 'KNOWLEDGE'         // Ξ.K.GAAP.REVENUE - Reference knowledge
  | 'ASSET'             // Ξ.AS.PATENT.US12345 - Assets

  // EVENT family
  | 'EVENT'             // Ξ.E.EARNINGS.NVDA.Q3FY25 - Events
  | 'MILESTONE'         // Ξ.MS.LAUNCH.H100 - Project milestones
  | 'REGULATORY_EVENT'  // Ξ.RE.FDA_APPROVAL.X - Regulatory events

  // FLOW family
  | 'TASK'              // Ξ.T.ANALYSIS.001 - Work items
  | 'WORKFLOW'          // Ξ.WF.ONBOARDING.X - Multi-step processes
  | 'TRANSACTION'       // Ξ.TX.ACQUISITION.ARM - Business transactions

  // RULE family
  | 'REGULATORY'        // Ξ.RG.SEC.RULE_10B5 - Regulatory requirements
  | 'POLICY'            // Ξ.PL.TRADING.INSIDER - Business policies
  | 'CONSTRAINT'        // Ξ.CN.SYSTEM.RATE_LIMIT - Technical constraints

  // UNIT family
  | 'METRIC'            // Ξ.M.REVENUE.NVDA.Q3FY25 - Measured quantities
  | 'GEOGRAPHY'         // Ξ.G.US.CA.SANTA_CLARA - Locations
  | 'SECTOR'            // Ξ.S.SEMICONDUCTORS - Industry classifications

  // QUERY family
  | 'QUERY';            // Ξ.Q.BENCHMARK.001 - Benchmark queries

/**
 * Maps each category to its parent family.
 */
export const CATEGORY_FAMILY: Record<SymbolCategory, CategoryFamily> = {
  COMPANY: 'AGENT',
  PERSON: 'AGENT',
  SYSTEM: 'AGENT',
  DOCUMENT: 'RESOURCE',
  KNOWLEDGE: 'RESOURCE',
  ASSET: 'RESOURCE',
  EVENT: 'EVENT',
  MILESTONE: 'EVENT',
  REGULATORY_EVENT: 'EVENT',
  TASK: 'FLOW',
  WORKFLOW: 'FLOW',
  TRANSACTION: 'FLOW',
  REGULATORY: 'RULE',
  POLICY: 'RULE',
  CONSTRAINT: 'RULE',
  METRIC: 'UNIT',
  GEOGRAPHY: 'UNIT',
  SECTOR: 'UNIT',
  QUERY: 'QUERY',
};

/**
 * Category prefix mapping for explicit categories.
 * Single-letter for primary categories, two-letter for subcategories.
 */
export const CATEGORY_PREFIX: Record<string, SymbolCategory> = {
  // Primary categories (1 letter)
  'C': 'COMPANY',
  'P': 'PERSON',
  'D': 'DOCUMENT',
  'K': 'KNOWLEDGE',
  'E': 'EVENT',
  'T': 'TASK',
  'M': 'METRIC',
  'G': 'GEOGRAPHY',
  'S': 'SECTOR',
  'Q': 'QUERY',

  // Subcategories (2 letters)
  'SY': 'SYSTEM',
  'AS': 'ASSET',
  'MS': 'MILESTONE',
  'RE': 'REGULATORY_EVENT',
  'WF': 'WORKFLOW',
  'TX': 'TRANSACTION',
  'RG': 'REGULATORY',
  'PL': 'POLICY',
  'CN': 'CONSTRAINT',

  // Legacy aliases (backward compatibility)
  'I': 'PERSON',  // Old PERSON prefix
};

/**
 * Reverse mapping: category to preferred prefix.
 */
export const PREFIX_FOR_CATEGORY: Record<SymbolCategory, string> = {
  COMPANY: 'C',
  PERSON: 'P',
  SYSTEM: 'SY',
  DOCUMENT: 'D',
  KNOWLEDGE: 'K',
  ASSET: 'AS',
  EVENT: 'E',
  MILESTONE: 'MS',
  REGULATORY_EVENT: 'RE',
  TASK: 'T',
  WORKFLOW: 'WF',
  TRANSACTION: 'TX',
  REGULATORY: 'RG',
  POLICY: 'PL',
  CONSTRAINT: 'CN',
  METRIC: 'M',
  GEOGRAPHY: 'G',
  SECTOR: 'S',
  QUERY: 'Q',
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAIN TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cross-cutting domain classifications.
 */
export type Domain =
  | 'FINANCE'
  | 'TECHNOLOGY'
  | 'LEGAL'
  | 'REGULATORY'
  | 'HEALTHCARE'
  | 'ENERGY'
  | 'RETAIL'
  | 'MANUFACTURING';

/**
 * Temporal period types for the WHEN framework.
 */
export type PeriodType = 'POINT' | 'RANGE' | 'RECURRING';

/**
 * Monetary value representation.
 */
export interface MonetaryValue {
  amount: number;
  currency: string;
  unit: 'ONES' | 'THOUSANDS' | 'MILLIONS' | 'BILLIONS';
  as_of?: string;
}

/**
 * Symbol lifecycle status.
 */
export type SymbolStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

/**
 * Source authority levels for provenance.
 */
export type SourceAuthority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Source types for provenance tracking.
 */
export type SourceType = 'PRIMARY' | 'SECONDARY' | 'DERIVED' | 'SYNTHETIC';

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED 5W+H STRUCTURES (v2.0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enhanced WHO structure with role context.
 */
export interface EnhancedWho {
  /** Primary audience description */
  audience: string;
  /** Additional stakeholders */
  stakeholders?: string[];
  /** Target persona type */
  persona?: 'EXPERT' | 'NOVICE' | 'EXECUTIVE' | 'TECHNICAL';
}

/**
 * Enhanced WHAT structure with entity binding.
 */
export interface EnhancedWhat {
  /** Core description */
  description: string;
  /** Entity type classification */
  entity_type?: string;
  /** Primary bound symbol ID */
  primary_entity?: string;
  /** Related symbol IDs */
  related_entities?: string[];
}

/**
 * Enhanced WHY structure with goal hierarchy.
 */
export interface EnhancedWhy {
  /** Immediate purpose */
  purpose: string;
  /** Business justification */
  business_value?: string;
  /** Measurable success criteria */
  success_criteria?: string[];
  /** Consequence of failure */
  risk_if_failed?: string;
}

/**
 * Enhanced WHERE structure with multi-scope support.
 */
export interface EnhancedWhere {
  /** Primary scope description */
  scope: string;
  /** Geographic regions */
  geography?: string[];
  /** Market identifiers */
  market?: string[];
  /** Business segments */
  segment?: string[];
}

/**
 * Enhanced WHEN structure with temporal precision.
 */
export interface EnhancedWhen {
  /** Human-readable context */
  context: string;
  /** Period type classification */
  period_type?: PeriodType;
  /** Start date (ISO 8601) */
  start_date?: string;
  /** End date (ISO 8601) */
  end_date?: string;
  /** Fiscal period identifier */
  fiscal_period?: string;
  /** Recurrence pattern */
  recurrence?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
}

/**
 * Enhanced HOW structure with execution detail.
 */
export interface EnhancedHow {
  /** What to emphasize */
  focus: string[];
  /** Restrictions/guardrails */
  constraints: string[];
  /** Expected output style */
  output_format?: string;
  /** Methodology specification */
  methodology?: string;
  /** Required tools/capabilities */
  required_capabilities?: string[];
  /** Quality thresholds */
  quality_requirements?: {
    min_sources?: number;
    recency_days?: number;
    confidence_threshold?: number;
  };
}

/**
 * Intent hierarchy for complex symbols.
 */
export interface IntentHierarchy {
  /** Long-term strategic objective */
  strategic: string;
  /** Immediate tactical goal */
  tactical: string;
  /** Specific operational action */
  operational?: string;
}

/**
 * Prioritized requirements structure.
 */
export interface PrioritizedRequirements {
  must_have: string[];
  should_have: string[];
  nice_to_have: string[];
}

/**
 * Acceptance criterion for completion validation.
 */
export interface AcceptanceCriterion {
  description: string;
  validator?: string;
  threshold?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAIN-SPECIFIC EXTENSIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Financial domain extension for company/market symbols.
 */
export interface FinancialExtension {
  /** Ticker symbols */
  tickers?: string[];
  /** Market identifiers */
  markets?: string[];
  /** Financial metrics */
  metrics?: {
    revenue?: MonetaryValue;
    net_income?: MonetaryValue;
    eps?: number;
    pe_ratio?: number;
    market_cap?: MonetaryValue;
    guidance?: {
      type: 'RAISED' | 'LOWERED' | 'MAINTAINED' | 'WITHDREW';
      value?: MonetaryValue;
      period?: string;
    };
  };
  /** Sentiment indicators */
  sentiment?: {
    overall: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    drivers?: string[];
  };
  /** Peer comparison context */
  peer_group?: string[];
}

/**
 * Legal domain extension for legal/case symbols.
 */
export interface LegalExtension {
  /** Case citation */
  citation?: {
    format: 'BLUEBOOK' | 'ALWD' | 'CUSTOM';
    full_citation: string;
    short_form?: string;
  };
  /** Court information */
  court?: {
    name: string;
    jurisdiction: string;
    level: 'TRIAL' | 'APPELLATE' | 'SUPREME';
  };
  /** Legal concepts */
  legal_concepts?: string[];
  /** Holdings/Rules */
  holdings?: string[];
  /** Precedential value */
  precedential_value?: 'BINDING' | 'PERSUASIVE' | 'NOT_CITABLE';
}

/**
 * Regulatory domain extension for compliance/filing symbols.
 */
export interface RegulatoryExtension {
  /** Filing type */
  filing_type?: string;
  /** Regulatory body */
  regulator?: string;
  /** Filing details */
  filing?: {
    accession_number?: string;
    file_number?: string;
    filed_date?: string;
    accepted_date?: string;
  };
  /** Compliance status */
  compliance?: {
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PENDING' | 'EXEMPT';
    deadline?: string;
    requirements?: string[];
  };
}

/**
 * Metric domain extension for quantitative symbols.
 */
export interface MetricExtension {
  /** Metric definition */
  definition: string;
  /** Calculation formula */
  formula?: string;
  /** Unit of measure */
  unit: string;
  /** Current value */
  value?: number;
  /** Historical values */
  time_series?: Array<{
    period: string;
    value: number;
    source?: string;
  }>;
  /** Benchmarks */
  benchmarks?: Array<{
    name: string;
    value: number;
    comparison: 'ABOVE' | 'BELOW' | 'AT';
  }>;
  /** Trend analysis */
  trend?: {
    direction: 'UP' | 'DOWN' | 'FLAT';
    change_percent?: number;
    period?: string;
  };
}

/**
 * Provenance tracking for trust and attribution.
 */
export interface Provenance {
  source_type: SourceType;
  source_authority: SourceAuthority;
  source_urls?: string[];
  extraction_method?: 'manual' | 'llm' | 'api' | 'scrape';
  verified_by?: string;
  verification_date?: string;
}

/**
 * Confidence scoring for claims.
 */
export interface ConfidenceScore {
  overall: number;
  by_field?: Record<string, number>;
}

/**
 * Freshness tracking for staleness detection.
 */
export interface Freshness {
  last_validated: string;
  valid_for_days: number;
  is_stale?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTIVE SYMBOL (BASE + ENHANCED)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DirectiveSymbol {
  // ─────────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────

  /** Unique symbol ID (e.g., "Ξ.NVDA.Q3FY25") */
  symbolId: string;

  /** Version number, increments on each update */
  version: number;

  /** SHA-256 hash of semantic content (first 16 chars) */
  hash: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // CLASSIFICATION
  // ─────────────────────────────────────────────────────────────────────────────

  /** Primary category */
  category: SymbolCategory;

  /** Optional subcategory (e.g., 'EARNINGS', 'COMPETITIVE') */
  subcategory?: string;

  /** Freeform tags for filtering */
  tags?: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // 5W+H FRAMEWORK (Core Grounding)
  // ─────────────────────────────────────────────────────────────────────────────

  /** WHO needs this / who is the audience */
  who: string;

  /** WHAT is being analyzed/done */
  what: string;

  /** WHY this matters / purpose */
  why: string;

  /** WHERE / scope (company, market, geography) */
  where: string;

  /** WHEN / time context */
  when: string;

  /** HOW to approach this */
  how: {
    /** What to emphasize */
    focus: string[];
    /** Restrictions/guardrails */
    constraints: string[];
    /** Expected output style */
    output_format?: string;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMANDER'S INTENT (The Anchor)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Ultimate goal in one sentence - the north star for all agents */
  commanders_intent: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // REQUIREMENTS (Explicit Grounding)
  // ─────────────────────────────────────────────────────────────────────────────

  /** MUST include these elements */
  requirements: string[];

  /** MUST NOT include these elements */
  anti_requirements?: string[];

  /** Terms that MUST appear in output (for validation) */
  key_terms?: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────────────────────

  /** ISO 8601 creation timestamp */
  created_at: string;

  /** ISO 8601 last update timestamp */
  updated_at?: string;

  /** Creator identifier */
  created_by?: string;

  /** Optional expiration (ISO 8601) */
  expires_at?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // VERSIONING & CHANGE TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  /** History of changes */
  changelog?: ChangelogEntry[];

  // ─────────────────────────────────────────────────────────────────────────────
  // RELATIONSHIPS
  // ─────────────────────────────────────────────────────────────────────────────

  /** Parent symbol ID for hierarchical symbols */
  parent_symbol?: string;

  /** Related symbol IDs */
  related_symbols?: string[];

  /** Symbol ID this supersedes (if replacement) */
  supersedes?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // SOURCE (for imported symbols)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Source dataset (e.g., "google/deepsearchqa") */
  source_dataset?: string;

  /** ID in source dataset */
  source_id?: string;

  /** Original question/data from source */
  source_data?: Record<string, unknown>;

  // ─────────────────────────────────────────────────────────────────────────────
  // v2.0 ENHANCED FIELDS (Optional for backward compatibility)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Optional operator namespace for multi-tenant isolation */
  namespace?: string;

  /** Cross-cutting domain classifications */
  domains?: Domain[];

  /** Confidence in category classification */
  classification_confidence?: number;

  /** Symbol IDs this symbol was derived from */
  derived_from?: string[];

  // ─────────────────────────────────────────────────────────────────────────────
  // ENHANCED 5W+H (v2.0) - Alternative to simple strings
  // ─────────────────────────────────────────────────────────────────────────────

  /** Enhanced WHO with role context */
  who_enhanced?: EnhancedWho;

  /** Enhanced WHAT with entity binding */
  what_enhanced?: EnhancedWhat;

  /** Enhanced WHY with goal hierarchy */
  why_enhanced?: EnhancedWhy;

  /** Enhanced WHERE with multi-scope */
  where_enhanced?: EnhancedWhere;

  /** Enhanced WHEN with temporal precision */
  when_enhanced?: EnhancedWhen;

  /** Enhanced HOW with execution detail */
  how_enhanced?: EnhancedHow;

  // ─────────────────────────────────────────────────────────────────────────────
  // ENHANCED INTENT & REQUIREMENTS (v2.0)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Intent hierarchy for complex symbols */
  intent_hierarchy?: IntentHierarchy;

  /** Completion criteria */
  done_when?: string[];

  /** Prioritized requirements (alternative to flat requirements) */
  prioritized_requirements?: PrioritizedRequirements;

  /** Acceptance criteria for validation */
  acceptance_criteria?: AcceptanceCriterion[];

  // ─────────────────────────────────────────────────────────────────────────────
  // DOMAIN-SPECIFIC EXTENSIONS (v2.0)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Financial domain extension */
  financial?: FinancialExtension;

  /** Legal domain extension */
  legal?: LegalExtension;

  /** Regulatory domain extension */
  regulatory?: RegulatoryExtension;

  /** Metric domain extension */
  metric?: MetricExtension;

  // ─────────────────────────────────────────────────────────────────────────────
  // PROVENANCE & TRUST (v2.0)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Source attribution and verification */
  provenance?: Provenance;

  /** Trust score (computed) */
  trust_score?: number;

  /** Confidence intervals for claims */
  confidence?: ConfidenceScore;

  // ─────────────────────────────────────────────────────────────────────────────
  // EPISTEMIC UNCERTAINTY (v2.1)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Epistemic metadata for tracking uncertainty in probabilistic outputs.
   *
   * This addresses the fundamental problem that LLMs produce confident-sounding
   * text regardless of factual accuracy. The epistemic field tracks:
   * - Claim type (factual, accusatory, predictive, etc.)
   * - Evidence basis (what data was consulted)
   * - Verification status (hypothesis → verified)
   * - Human review requirements
   *
   * For high-stakes claims (accusations, diagnoses), this field is automatically
   * populated by the claim validator with reduced confidence and review flags.
   */
  epistemic?: EpistemicMetadata;

  // ─────────────────────────────────────────────────────────────────────────────
  // LIFECYCLE (v2.0)
  // ─────────────────────────────────────────────────────────────────────────────

  /** Symbol lifecycle status */
  status?: SymbolStatus;

  /** Date when symbol should be reviewed */
  review_date?: string;

  /** Freshness tracking for staleness detection */
  freshness?: Freshness;
}

export interface ChangelogEntry {
  version: number;
  change: string;
  timestamp: string;
  changed_by?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY INDEX
// ═══════════════════════════════════════════════════════════════════════════════

export interface SymbolRegistry {
  version: string;
  updated_at: string;
  symbols: Record<string, SymbolRegistryEntry>;
  stats: {
    total_symbols: number;
    by_category: Record<SymbolCategory, number>;
  };
}

export interface SymbolRegistryEntry {
  path: string;
  category: SymbolCategory;
  version: number;
  hash: string;
  created_at: string;
  updated_at?: string;
  commanders_intent_preview?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface SymbolIdValidation {
  valid: boolean;
  symbolId: string;
  category?: SymbolCategory;
  /** Category family (v2.0) */
  family?: CategoryFamily;
  /** Namespace if present (v2.0) */
  namespace?: string;
  inferred?: boolean;
  segments?: string[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP TOOL REQUESTS/RESPONSES
// ═══════════════════════════════════════════════════════════════════════════════

// ps_symbol_create
export interface CreateSymbolRequest {
  symbolId: string;
  category?: SymbolCategory;  // Auto-inferred if not provided
  subcategory?: string;
  tags?: string[];
  who: string;
  what: string;
  why: string;
  where: string;
  when: string;
  how: {
    focus: string[];
    constraints: string[];
    output_format?: string;
  };
  commanders_intent: string;
  requirements: string[];
  anti_requirements?: string[];
  key_terms?: string[];
  parent_symbol?: string;
  related_symbols?: string[];
  source_dataset?: string;
  source_id?: string;
  source_data?: Record<string, unknown>;
  created_by?: string;

  // v2.1: Epistemic metadata (optional - auto-generated if not provided)
  /**
   * Epistemic metadata for the claim. If not provided, will be auto-generated
   * by the claim validator based on content analysis.
   *
   * Provide this to explicitly set:
   * - Evidence basis (what sources were consulted)
   * - Cross-reference status
   * - Alternative explanations considered
   */
  epistemic?: Partial<EpistemicMetadata>;
}

export interface CreateSymbolResponse {
  success: boolean;
  symbolId: string;
  version: number;
  hash: string;
  path: string;
  error?: string;
}

// ps_symbol_get
export interface GetSymbolRequest {
  symbolId: string;
  version?: number;
  include_changelog?: boolean;
}

export interface GetSymbolResponse {
  found: boolean;
  symbol?: DirectiveSymbol;
  error?: string;
}

// ps_symbol_update
export interface UpdateSymbolRequest {
  symbolId: string;
  changes: Partial<Omit<DirectiveSymbol, 'symbolId' | 'version' | 'hash' | 'created_at' | 'changelog' | 'epistemic'>> & {
    epistemic?: Partial<EpistemicMetadata>;
  };
  change_description: string;
  changed_by?: string;
}

export interface UpdateSymbolResponse {
  success: boolean;
  symbolId: string;
  old_version: number;
  new_version: number;
  old_hash: string;
  new_hash: string;
  error?: string;
}

// ps_symbol_list
export interface ListSymbolsRequest {
  category?: SymbolCategory;
  tags?: string[];
  created_after?: string;
  created_before?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListSymbolsResponse {
  symbols: SymbolListEntry[];
  total: number;
  has_more: boolean;
}

export interface SymbolListEntry {
  symbolId: string;
  category: SymbolCategory;
  version: number;
  hash: string;
  commanders_intent: string;
  created_at: string;
  updated_at?: string;
}

// ps_symbol_delete
export interface DeleteSymbolRequest {
  symbolId: string;
  reason: string;
}

export interface DeleteSymbolResponse {
  success: boolean;
  deleted: boolean;
  error?: string;
}

// ps_symbol_import
export type ImportSource = 'huggingface' | 'json' | 'csv';

export interface ImportSymbolsRequest {
  source: ImportSource;
  data: unknown;
  category: SymbolCategory;
  id_prefix: string;
  transform?: FieldTransform;
  defaults?: Partial<DirectiveSymbol>;
}

export interface FieldTransform {
  who?: string | ((row: unknown) => string);
  what?: string | ((row: unknown) => string);
  why?: string | ((row: unknown) => string);
  where?: string | ((row: unknown) => string);
  when?: string | ((row: unknown) => string);
  commanders_intent?: string | ((row: unknown) => string);
  requirements?: string | ((row: unknown) => string[]);
  key_terms?: string | ((row: unknown) => string[]);
}

export interface ImportSymbolsResponse {
  success: boolean;
  imported: number;
  failed: number;
  symbols_created: string[];
  errors?: Array<{ index: number; error: string }>;
}

// ps_symbol_validate
export interface ValidateSymbolRequest {
  symbol: Partial<DirectiveSymbol>;
  strict?: boolean;
}

export interface ValidateSymbolResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
