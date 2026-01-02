/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENT PROCESSING TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for the document processing agent that extracts and updates
 * PromptSpeak symbols from company documents.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { DirectiveSymbol, SymbolCategory } from '../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentType = 'pdf' | 'text' | 'markdown' | 'html';

export interface DocumentSource {
  /** Document type */
  type: DocumentType;

  /** File path for local files */
  path?: string;

  /** Raw content if provided directly */
  content?: string;

  /** URL if fetched from web */
  url?: string;

  /** Document metadata */
  metadata?: {
    title?: string;
    author?: string;
    date?: string;
    source?: string;
  };
}

export interface ParsedDocument {
  /** Original source */
  source: DocumentSource;

  /** Extracted text content */
  text: string;

  /** Structured sections if identified */
  sections?: DocumentSection[];

  /** Document metadata */
  metadata: {
    title?: string;
    wordCount: number;
    charCount: number;
    pageCount?: number;
    extractedAt: string;
  };
}

export interface DocumentSection {
  /** Section heading */
  heading?: string;

  /** Section content */
  content: string;

  /** Section type (e.g., 'executive_summary', 'financials', 'risks') */
  type?: string;

  /** Start position in original text */
  startIndex: number;

  /** End position in original text */
  endIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractionConfig {
  /** Company ticker to associate symbols with */
  companyTicker: string;

  /** Company name for context */
  companyName?: string;

  /** Types of symbols to extract */
  symbolTypes: ('profile' | 'event' | 'financial' | 'risk' | 'competitive')[];

  /** Document context (e.g., '10-K', 'earnings_call', 'press_release') */
  documentContext?: string;

  /** Fiscal period if applicable (e.g., 'Q3FY25') */
  fiscalPeriod?: string;

  /** Additional extraction instructions */
  customInstructions?: string;

  /** Whether to extract relationships between entities */
  extractRelationships?: boolean;

  /** Maximum number of symbols to extract per type */
  maxSymbolsPerType?: number;
}

export interface ExtractedEntity {
  /** Entity type */
  type: 'person' | 'company' | 'product' | 'event' | 'metric' | 'risk' | 'opportunity';

  /** Entity name */
  name: string;

  /** Entity description */
  description: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Source text that mentions this entity */
  sourceText: string;

  /** Position in document */
  position?: {
    section?: string;
    startIndex: number;
    endIndex: number;
  };

  /** Related entities */
  relatedEntities?: string[];

  /** Key attributes */
  attributes?: Record<string, string | number | boolean>;
}

export interface ExtractedSymbolData {
  /** Suggested symbol ID */
  suggestedSymbolId: string;

  /** Symbol category */
  category: SymbolCategory;

  /** Subcategory if applicable */
  subcategory?: string;

  /** 5W+H data */
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

  /** Commander's intent */
  commanders_intent: string;

  /** Requirements */
  requirements: string[];

  /** Anti-requirements */
  anti_requirements?: string[];

  /** Key terms for validation */
  key_terms?: string[];

  /** Tags for filtering */
  tags?: string[];

  /** Source entities that contributed to this symbol */
  sourceEntities: ExtractedEntity[];

  /** Extraction confidence (0-1) */
  confidence: number;

  /** Extraction reasoning */
  reasoning: string;
}

export interface ExtractionResult {
  /** Successfully extracted symbols */
  symbols: ExtractedSymbolData[];

  /** Extracted entities */
  entities: ExtractedEntity[];

  /** Extraction metadata */
  metadata: {
    documentSource: string;
    extractedAt: string;
    processingTimeMs: number;
    tokensUsed?: number;
  };

  /** Any warnings during extraction */
  warnings?: string[];

  /** Any errors during extraction */
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERGE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type MergeStrategy = 'smart' | 'replace' | 'append';

export interface MergeConfig {
  /** Merge strategy */
  strategy: MergeStrategy;

  /** Minimum confidence to update existing symbol */
  minConfidenceToUpdate?: number;

  /** Fields that should never be overwritten */
  protectedFields?: (keyof DirectiveSymbol)[];

  /** Whether to preserve original requirements */
  preserveRequirements?: boolean;

  /** Whether to log all changes */
  verbose?: boolean;
}

export interface FieldChange {
  /** Field name */
  field: string;

  /** Old value */
  oldValue: unknown;

  /** New value */
  newValue: unknown;

  /** Change type */
  changeType: 'added' | 'modified' | 'removed' | 'unchanged';

  /** Confidence in the change */
  confidence?: number;
}

export interface MergeResult {
  /** Symbol ID */
  symbolId: string;

  /** Action taken */
  action: 'created' | 'updated' | 'unchanged' | 'skipped';

  /** Old version (if updated) */
  oldVersion?: number;

  /** New version */
  newVersion?: number;

  /** Field-level changes */
  changes: FieldChange[];

  /** Reason for action */
  reason: string;

  /** Whether merge was successful */
  success: boolean;

  /** Error if any */
  error?: string;
}

export interface BatchMergeResult {
  /** Individual merge results */
  results: MergeResult[];

  /** Summary statistics */
  summary: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    failed: number;
  };

  /** Processing metadata */
  metadata: {
    startTime: string;
    endTime: string;
    processingTimeMs: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentProcessingRequest {
  /** Document(s) to process */
  documents: DocumentSource[];

  /** Extraction configuration */
  extraction: ExtractionConfig;

  /** Merge configuration */
  merge?: MergeConfig;

  /** Whether to run in dry-run mode (no persistence) */
  dryRun?: boolean;
}

export interface DocumentProcessingResult {
  /** Overall success */
  success: boolean;

  /** Documents processed */
  documentsProcessed: number;

  /** Extraction results */
  extraction: ExtractionResult;

  /** Merge results (if not dry run) */
  merge?: BatchMergeResult;

  /** Symbols that would be created/updated (for dry run) */
  proposedChanges?: ExtractedSymbolData[];

  /** Processing metadata */
  metadata: {
    startTime: string;
    endTime: string;
    processingTimeMs: number;
    dryRun: boolean;
  };

  /** Errors */
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP TOOL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProcessDocumentRequest {
  /** File path or content */
  source: string;

  /** Source type */
  sourceType: 'path' | 'content' | 'url';

  /** Document type (auto-detected if not provided) */
  documentType?: DocumentType;

  /** Company ticker */
  companyTicker: string;

  /** Company name */
  companyName?: string;

  /** Document context */
  documentContext?: string;

  /** Fiscal period */
  fiscalPeriod?: string;

  /** Symbol types to extract */
  symbolTypes?: ('profile' | 'event' | 'financial' | 'risk' | 'competitive')[];

  /** Merge strategy */
  mergeStrategy?: MergeStrategy;

  /** Dry run mode */
  dryRun?: boolean;
}

export interface ProcessDocumentResponse {
  success: boolean;
  symbolsCreated: string[];
  symbolsUpdated: string[];
  symbolsUnchanged: string[];
  errors?: string[];
  warnings?: string[];
  processingTimeMs: number;
}

export interface ListCompanySymbolsRequest {
  companyTicker: string;
  category?: SymbolCategory;
  includeDetails?: boolean;
}

export interface ListCompanySymbolsResponse {
  companyTicker: string;
  symbols: Array<{
    symbolId: string;
    category: SymbolCategory;
    version: number;
    commanders_intent: string;
    updated_at?: string;
  }>;
  total: number;
}
