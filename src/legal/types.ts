// =============================================================================
// LEGAL CITATION VALIDATOR - TYPE DEFINITIONS
// =============================================================================
// Types for citation parsing, validation, and human review integration.
//
// CRITICAL LIMITATION NOTICE:
// This validator CANNOT verify that cited cases actually exist.
// It can only check format patterns and local database matches.
// =============================================================================

import type { ParsedFrame } from '../types/index.js';

// -----------------------------------------------------------------------------
// CITATION PARSING TYPES
// -----------------------------------------------------------------------------

/**
 * Represents a parsed legal citation with extracted components.
 */
export interface ParsedCitation {
  /** Original citation string as provided */
  raw: string;

  /** Cleaned and normalized form */
  normalized: string;

  // Core citation components (null if not parseable)
  /** Case name, e.g., "Smith v. Jones" */
  caseName: string | null;

  /** Reporter volume number */
  volume: number | null;

  /** Reporter abbreviation, e.g., "F.3d" */
  reporter: string | null;

  /** Starting page number */
  page: number | null;

  /** Pinpoint citation page (optional) */
  pinpoint: number | null;

  /** Court identifier, e.g., "9th Cir." */
  court: string | null;

  /** Decision year */
  year: number | null;

  // Classification
  /** Type of legal citation */
  citationType: CitationType;

  /** Format style detected */
  formatStyle: CitationFormat;

  // Parsing metadata
  /** Confidence in parsing accuracy (0.0 - 1.0) */
  parseConfidence: number;

  /** Segments that could not be parsed */
  unparsedSegments: string[];
}

/**
 * Classification of citation types.
 */
export type CitationType =
  | 'case'           // Case law citation
  | 'statute'        // Statutory citation (U.S.C., state codes)
  | 'regulation'     // Regulatory citation (C.F.R., state regs)
  | 'constitution'   // Constitutional provision
  | 'secondary'      // Law review, treatise, etc.
  | 'unknown';       // Could not determine type

/**
 * Citation format style classification.
 */
export type CitationFormat =
  | 'bluebook'       // Standard Bluebook format
  | 'court_specific' // Court-specific local rules format
  | 'informal'       // Recognizable but non-standard
  | 'malformed'      // Does not match known patterns
  | 'unknown';       // Could not determine format

// -----------------------------------------------------------------------------
// VALIDATION RESULT TYPES
// -----------------------------------------------------------------------------

/**
 * Severity levels for citation validation results.
 *
 * NOTE: 'unverifiable' is critical - many citations will be unverifiable
 * because this system CANNOT check Westlaw/Lexis.
 */
export type CitationValidationSeverity =
  | 'pass'           // Check passed
  | 'info'           // Informational note
  | 'warning'        // Potential issue, human should review
  | 'error'          // Structural/format error detected
  | 'hold'           // Requires human verification before proceeding
  | 'unverifiable';  // Cannot be verified by this system (NOT an error)

/**
 * Result of a single validation rule check.
 */
export interface CitationValidationResult {
  /** Unique rule identifier */
  ruleId: string;

  /** Human-readable rule name */
  ruleName: string;

  /** Validation tier */
  tier: 'structural' | 'semantic' | 'chain';

  /** Whether the rule check passed */
  passed: boolean;

  /** Severity of the result */
  severity: CitationValidationSeverity;

  /** Human-readable message explaining the result */
  message: string;

  /** Additional details (optional) */
  details?: string;

  /** Recommended human action if any */
  humanAction?: CitationHumanAction;
}

/**
 * Actions a human reviewer should take.
 */
export type CitationHumanAction =
  | 'verify'          // General verification needed
  | 'check_westlaw'   // Specifically check Westlaw/Lexis
  | 'review_holding'  // Review the legal holding
  | 'check_overruled' // Check if case has been overruled
  | 'none';           // No action required

/**
 * Complete validation report for a citation.
 */
export interface CitationValidationReport {
  /** Original citation string */
  citation: string;

  /** Parsed citation (null if parsing failed completely) */
  parsedCitation: ParsedCitation | null;

  /** Whether the citation has no structural errors */
  valid: boolean;

  /**
   * Whether the citation has been verified to exist.
   * ALWAYS FALSE - this validator CANNOT verify existence.
   */
  verified: false;

  /** Whether human review is required before proceeding */
  requiresHumanReview: boolean;

  /** Reason for hold if human review required */
  holdReason?: CitationHoldReason;

  /** Structural validation results */
  structural: CitationValidationResult[];

  /** Semantic validation results */
  semantic: CitationValidationResult[];

  /** Chain validation results */
  chain: CitationValidationResult[];

  /**
   * Overall confidence score (0.0 - 0.85).
   * CAPPED at 0.85 because we cannot fully verify.
   */
  confidenceScore: number;

  /** Explicit statement of validator limitations */
  limitationNotice: string;

  /** Timestamp of validation */
  timestamp: number;
}

/**
 * Reasons for requiring human review (hold).
 */
export type CitationHoldReason =
  | 'citation_not_in_database'       // Not found in local verified database
  | 'fabrication_constraint_active'  // Parent frame has no_fabrication (via ¶ or †)
  | 'implausible_date_court'         // Date/court combination is impossible
  | 'format_unrecognized'            // Cannot parse citation format
  | 'multiple_issues_detected'       // Several validation issues found
  | 'high_risk_legal_claim'          // Citation supports critical legal claim
  | 'case_overruled';                // Case marked as overruled in database

// -----------------------------------------------------------------------------
// DATABASE TYPES
// -----------------------------------------------------------------------------

/**
 * Record of a known/verified case in the local database.
 */
export interface KnownCaseRecord {
  /** Case name as commonly cited */
  caseName: string;

  /** Normalized name for matching */
  normalizedName: string;

  /** Reporter volume */
  volume: number;

  /** Reporter abbreviation */
  reporter: string;

  /** Starting page */
  page: number;

  /** Court abbreviation */
  court: string;

  /** Decision year */
  year: number;

  /** Jurisdiction (federal, state name, etc.) */
  jurisdiction: string;

  /** Whether the case has been overruled */
  overruled: boolean;

  /** Citation of overruling case if applicable */
  overruledBy?: string;

  /** When record was added to database */
  addedAt: number;

  /** Source of the record */
  source: 'seed_data' | 'verified_addition' | 'user_confirmed';
}

/**
 * Information about a court for validation.
 */
export interface CourtInfo {
  /** Standard abbreviation, e.g., "9th Cir." */
  abbreviation: string;

  /** Full court name */
  fullName: string;

  /** Federal or state court */
  jurisdiction: 'federal' | 'state';

  /** Court level in hierarchy */
  level: 'supreme' | 'appellate' | 'district' | 'trial' | 'specialized';

  /** Year court was established */
  establishedYear: number;

  /** Valid reporter prefixes for this court */
  reporterPrefixes: string[];

  /** State if state court */
  state?: string;
}

// -----------------------------------------------------------------------------
// VALIDATION RULE TYPES
// -----------------------------------------------------------------------------

/**
 * Interface for a citation validation rule.
 */
export interface CitationValidationRule {
  /** Unique rule identifier */
  id: string;

  /** Human-readable rule name */
  name: string;

  /** Validation tier */
  tier: 'structural' | 'semantic' | 'chain';

  /** The check function */
  check: CitationRuleChecker;
}

/**
 * Function signature for rule checkers.
 */
export type CitationRuleChecker = (
  citation: ParsedCitation,
  context?: CitationValidationContext
) => CitationValidationResult;

/**
 * Context passed to validation rules.
 */
export interface CitationValidationContext {
  /** Parent PromptSpeak frame if available */
  parentFrame?: ParsedFrame;

  /** Court database for lookups */
  courtDb?: CourtDatabase;

  /** Case database for lookups */
  caseDb?: CaseDatabase;

  /** Whether ¶ (case_law) or † (citation) symbols are active */
  noFabricationActive?: boolean;
}

// -----------------------------------------------------------------------------
// DATABASE INTERFACES
// -----------------------------------------------------------------------------

/**
 * Interface for court information database.
 */
export interface CourtDatabase {
  /** Look up court by abbreviation */
  lookupCourt(abbreviation: string): CourtInfo | null;

  /** Get all known courts */
  getAllCourts(): CourtInfo[];

  /** Check if reporter is valid for court */
  isReporterValidForCourt(reporter: string, court: string): boolean;
}

/**
 * Interface for case database.
 */
export interface CaseDatabase {
  /** Look up a case by citation components */
  lookupCase(
    caseName: string | null,
    volume: number | null,
    reporter: string | null,
    page: number | null
  ): KnownCaseRecord | null;

  /** Add a verified case to the database */
  addVerifiedCase(record: Omit<KnownCaseRecord, 'addedAt'>): void;

  /** Mark a case as overruled */
  markOverruled(
    volume: number,
    reporter: string,
    page: number,
    overruledBy: string
  ): boolean;

  /** Get database statistics */
  getStats(): { totalCases: number; overruledCases: number };
}

// -----------------------------------------------------------------------------
// HOLD INTEGRATION TYPES
// -----------------------------------------------------------------------------

/**
 * Hold request specifically for citation verification.
 */
export interface CitationHoldRequest {
  /** The citation being validated */
  citation: string;

  /** Parsed citation components */
  parsedCitation: ParsedCitation | null;

  /** Confidence score at time of hold */
  confidenceScore: number;

  /** Reason for the hold */
  holdReason: CitationHoldReason;

  /** Action required from human reviewer */
  humanAction: string;

  /** Count of structural errors */
  structuralErrors: number;

  /** Count of semantic errors */
  semanticErrors: number;

  /** Count of chain errors */
  chainErrors: number;

  /** The limitation notice */
  limitationNotice: string;
}

/**
 * Decision from human reviewer on citation hold.
 */
export interface CitationHoldDecision {
  /** The hold that was decided */
  holdId: string;

  /** Decision made */
  decision: 'verified' | 'rejected' | 'modified';

  /** Who made the decision */
  decidedBy: string;

  /** When the decision was made */
  decidedAt: number;

  /** Reason for the decision */
  reason: string;

  /** Corrected citation if modified */
  correctedCitation?: string;

  /** Reference to verification source */
  verificationSource?: 'westlaw' | 'lexis' | 'court_records' | 'other';
}

// -----------------------------------------------------------------------------
// CONFIDENCE SCORING TYPES
// -----------------------------------------------------------------------------

/**
 * Factors used to calculate confidence score.
 */
export interface ConfidenceFactors {
  /** How well the citation was parsed (0-1) */
  parseConfidence: number;

  /** Structural rules passed / total */
  structuralScore: number;

  /** Semantic rules passed / total */
  semanticScore: number;

  /** Chain rules passed / total */
  chainScore: number;

  /** Whether citation was found in local database */
  databaseMatch: boolean;

  /** Whether reporter is in known list */
  knownReporter: boolean;

  /** Whether date/court combination is plausible */
  plausibleDateCourt: boolean;
}

// -----------------------------------------------------------------------------
// LEGAL INSTRUMENT SYMBOLS (from ontology)
// -----------------------------------------------------------------------------

/**
 * Legal instrument symbols from PromptSpeak ontology.
 * These symbols have special validation implications.
 */
export const LEGAL_INSTRUMENT_SYMBOLS = {
  /** Statute - statutory law citation */
  STATUTE: '§',

  /** Case Law - judicial decision citation (has no_fabrication constraint) */
  CASE_LAW: '¶',

  /** Regulation - regulatory citation */
  REGULATION: '℗',

  /** Citation - explicit citation marker (has no_fabrication constraint) */
  CITATION: '†',

  /** Legal Proceeding - procedural reference */
  LEGAL_PROCEEDING: '⚖',
} as const;

/**
 * Symbols that trigger no_fabrication constraint.
 * When these are present, ALL citations must be verified.
 */
export const NO_FABRICATION_SYMBOLS = ['¶', '†'] as const;

/**
 * Legal domain symbol (from ontology).
 */
export const LEGAL_DOMAIN_SYMBOL = '◇';
