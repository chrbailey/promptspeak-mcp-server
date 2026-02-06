// =============================================================================
// LEGAL MODULE - PUBLIC EXPORTS
// =============================================================================
// Citation validation for legal documents.
//
// ARCHITECTURE:
//   1. citation-validator.ts - Three-tier format/semantic/chain validation
//   2. courtlistener-adapter.ts - External API for existence verification
//   3. legal-preflight.ts - Pre-flight checks for legal domain (◇) operations
//
// The Legal MVP flow:
//   Frame with ◇ domain → LegalPreFlight.check() → CitationValidator + CourtListener
//     → LegalHoldConfig determines hold conditions → HoldManager creates holds
//
// =============================================================================

// Type exports
export type {
  ParsedCitation,
  CitationType,
  CitationFormat,
  CitationValidationSeverity,
  CitationValidationResult,
  CitationValidationReport,
  CitationHoldReason,
  CitationHumanAction,
  CitationValidationRule,
  CitationRuleChecker,
  CitationValidationContext,
  KnownCaseRecord,
  CourtInfo,
  CourtDatabase,
  CaseDatabase,
  CitationHoldRequest,
  CitationHoldDecision,
  ConfidenceFactors,
} from './types.js';

// Constant exports
export {
  LEGAL_INSTRUMENT_SYMBOLS,
  NO_FABRICATION_SYMBOLS,
  LEGAL_DOMAIN_SYMBOL,
} from './types.js';

// Validator exports
export {
  CitationValidator,
  InMemoryCourtDatabase,
  InMemoryCaseDatabase,
  createCitationValidator,
  citationValidator,
} from './citation-validator.js';

// CourtListener adapter exports
export {
  CourtListenerCaseDatabase,
  createCourtListenerDatabase,
  courtListenerDb,
} from './courtlistener-adapter.js';

export type { CourtListenerConfig } from './courtlistener-adapter.js';

// Legal pre-flight evaluator exports
export {
  LegalPreFlightEvaluator,
  createLegalPreFlight,
  legalPreFlight,
  extractCitations,
  detectPrivilegeIndicators,
  detectFabrication,
  estimateSemanticEntropy,
} from './legal-preflight.js';

export type { LegalPreFlightConfig } from './legal-preflight.js';

// Calendar integration exports
export {
  DeadlineExtractor,
  createDeadlineExtractor,
} from './deadline-extractor.js';

export {
  ICalGenerator,
  createICalGenerator,
  generateICalFromDeadlines,
} from './ical-generator.js';

export type {
  ExtractedDeadline,
  DeadlineType,
  DeadlinePriority,
  CourtRules,
  CountingMethod,
  DeadlineExtractorConfig,
  DeadlineExtractionResult,
  CalendarEvent,
  FederalHoliday,
} from './calendar-types.js';

export {
  DEADLINE_PATTERNS,
  FRCP_DEADLINES,
  FEDERAL_HOLIDAYS_2024_2025,
} from './calendar-types.js';

export type { ICalGeneratorConfig } from './ical-generator.js';

// Calendar integration exports
export {
  CalendarIntegration,
  createCalendarIntegration,
  processDocumentsToICal,
  extractDeadlinesFromDocument,
  lookupFRCPDeadline,
  getDeadlinesForRule,
} from './calendar-integration.js';

export type {
  DocumentInput,
  DocumentResult,
  BatchResult,
  CourtRulesConfig,
  CalendarIntegrationConfig,
} from './calendar-integration.js';


// Batch parsing exports
export {
  CourtListenerBatchParser,
  getBatchParser,
  createBatchParser,
  generateCaseSymbol,
  generateCourtSymbol,
  generateOpinionSymbol,
} from './batch-parser.js';

export type {
  BatchConfig,
  Opinion,
  Docket,
  Court,
  BatchProgress,
  BatchResult,
  LegalSymbol,
} from './batch-parser.js';
