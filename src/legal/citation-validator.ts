// =============================================================================
// LEGAL CITATION VALIDATOR
// =============================================================================
// Three-tier validation for legal citations: Structural, Semantic, Chain.
//
// =============================================================================
// CRITICAL LIMITATIONS - READ BEFORE USE
// =============================================================================
//
// THIS VALIDATOR CANNOT:
//   - Verify that a cited case actually exists
//   - Confirm that quoted holdings are accurate
//   - Guarantee that a case has not been overruled
//   - Validate that the legal proposition matches the citation
//   - Replace human legal research or Westlaw/Lexis verification
//
// THIS VALIDATOR CAN:
//   - Check if citation FORMAT matches known patterns (Bluebook, etc.)
//   - Flag obviously malformed citations
//   - Check citations against a LOCAL database of known cases
//   - Detect implausible date/court combinations
//   - Flag citations that require human verification
//
// A PASSING SCORE DOES NOT MEAN THE CASE IS REAL.
// A FAILING SCORE DOES NOT MEAN THE CASE IS FAKE.
//
// ALWAYS verify citations through Westlaw, Lexis, or official court records.
// =============================================================================

import type { ParsedFrame } from '../types/index.js';
import type {
  ParsedCitation,
  CitationType,
  CitationFormat,
  CitationValidationResult,
  CitationValidationReport,
  CitationValidationRule,
  CitationValidationContext,
  CitationHoldReason,
  CitationHumanAction,
  ConfidenceFactors,
  CourtInfo,
  CourtDatabase,
  CaseDatabase,
  KnownCaseRecord,
} from './types.js';
import {
  LEGAL_INSTRUMENT_SYMBOLS,
  NO_FABRICATION_SYMBOLS,
  LEGAL_DOMAIN_SYMBOL,
} from './types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum confidence score. Capped because we CANNOT fully verify citations.
 */
const MAX_CONFIDENCE_SCORE = 0.85;

/**
 * Known reporter abbreviations for structural validation.
 */
const KNOWN_REPORTERS: string[] = [
  // U.S. Supreme Court
  'U.S.', 'S.Ct.', 'S. Ct.', 'L.Ed.', 'L.Ed.2d', 'L. Ed.', 'L. Ed. 2d',
  // Federal Reporter (Circuit Courts)
  'F.', 'F.2d', 'F.3d', 'F.4th',
  // Federal Supplement (District Courts)
  'F.Supp.', 'F.Supp.2d', 'F.Supp.3d', 'F. Supp.', 'F. Supp. 2d', 'F. Supp. 3d',
  // Federal Appendix (Unpublished)
  'Fed.Appx.', 'Fed. Appx.',
  // Bankruptcy Reporter
  'B.R.',
  // Federal Claims
  'Fed.Cl.', 'Fed. Cl.', 'Cl.Ct.', 'Ct.Cl.',
  // California
  'Cal.', 'Cal.2d', 'Cal.3d', 'Cal.4th', 'Cal.5th',
  'Cal.App.', 'Cal.App.2d', 'Cal.App.3d', 'Cal.App.4th', 'Cal.App.5th',
  'Cal.Rptr.', 'Cal.Rptr.2d', 'Cal.Rptr.3d',
  // New York
  'N.Y.', 'N.Y.2d', 'N.Y.3d',
  'A.D.', 'A.D.2d', 'A.D.3d',
  'N.Y.S.', 'N.Y.S.2d', 'N.Y.S.3d',
  'Misc.', 'Misc.2d', 'Misc.3d',
  // Regional Reporters
  'N.E.', 'N.E.2d', 'N.E.3d',
  'A.', 'A.2d', 'A.3d',
  'So.', 'So.2d', 'So.3d',
  'S.E.', 'S.E.2d',
  'S.W.', 'S.W.2d', 'S.W.3d',
  'N.W.', 'N.W.2d',
  'P.', 'P.2d', 'P.3d',
  // Other Federal
  'M.J.', // Military Justice
  'Vet.App.', // Veterans Appeals
  'T.C.', 'T.C.M.', // Tax Court
];

/**
 * Court patterns for structural validation.
 */
const COURT_PATTERNS: RegExp[] = [
  /^\d{1,2}(?:st|nd|rd|th)\s+Cir\.?$/i,           // "9th Cir."
  /^[A-Z]\.[A-Z]\.$/,                              // "D.C."
  /^[A-Z]{2}$/,                                    // State abbreviations "CA", "NY"
  /^(?:N|S|E|W|C|M)\.?D\.?\s*[A-Z][a-z]+\.?$/i,   // "N.D. Cal.", "S.D.N.Y."
  /^[A-Z][a-z]+\.?\s*(?:Ct\.?\s*)?App\.?$/i,      // "Cal. Ct. App."
  /^[A-Z][a-z]+\.?$/i,                            // "Cal.", "Tex."
  /^Fed\.?\s*Cl\.?$/i,                            // "Fed. Cl."
  /^Fed\.?\s*Cir\.?$/i,                           // "Fed. Cir."
  /^T\.?C\.?$/i,                                   // "T.C." Tax Court
  /^C\.?C\.?P\.?A\.?$/i,                          // "C.C.P.A."
  /^Bankr\.?\s*[A-Z]\.?[A-Z]?\.?\s*[A-Z][a-z]*\.?$/i, // Bankruptcy courts
  /^[A-Z][a-z]+\.?\s+Super\.?\s*(?:Ct\.?)?$/i,    // "Cal. Super. Ct."
  /^Sup\.?\s*Ct\.?$/i,                            // "Sup. Ct."
];

/**
 * Reporter series with year ranges for semantic validation.
 */
const REPORTER_YEAR_RANGES: Record<string, [number, number]> = {
  'F.': [1880, 1924],
  'F.2d': [1924, 1993],
  'F.3d': [1993, 2021],
  'F.4th': [2021, 2100],
  'F.Supp.': [1932, 1998],
  'F.Supp.2d': [1998, 2014],
  'F.Supp.3d': [2014, 2100],
  'Fed.Appx.': [2001, 2100],
  'U.S.': [1790, 2100],
  'S.Ct.': [1882, 2100],
  'L.Ed.': [1790, 1956],
  'L.Ed.2d': [1956, 2100],
};

/**
 * Approximate maximum volumes for known reporters (for plausibility).
 */
const REPORTER_MAX_VOLUMES: Record<string, number> = {
  'U.S.': 600,
  'S.Ct.': 145,
  'L.Ed.': 100,
  'L.Ed.2d': 180,
  'F.': 300,
  'F.2d': 999,
  'F.3d': 999,
  'F.4th': 150,
  'F.Supp.': 999,
  'F.Supp.2d': 999,
  'F.Supp.3d': 750,
  'Fed.Appx.': 999,
};

/**
 * Static limitation notice to include in all reports.
 */
const LIMITATION_NOTICE = `
CITATION VALIDATION LIMITATIONS
===============================
This validator CANNOT verify that a cited case actually exists.
It can only:
  - Check if the citation FORMAT matches known patterns
  - Detect obviously implausible date/court combinations
  - Check against a LOCAL database of known cases (incomplete)
  - Flag citations for human review

A PASSING score does NOT mean the case is real.
A FAILING score does NOT mean the case is fake.

ALWAYS verify citations through Westlaw, Lexis, or official court records.
`.trim();

// =============================================================================
// STRUCTURAL VALIDATION RULES (Tier 1)
// =============================================================================
// These rules check if the citation LOOKS RIGHT syntactically.
// =============================================================================

const STRUCTURAL_RULES: CitationValidationRule[] = [
  {
    id: 'CR-SR-001',
    name: 'CASE_NAME_PRESENT',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      const hasName = citation.caseName !== null &&
                      citation.caseName.length > 0 &&
                      /\S+\s+v\.?\s+\S+/i.test(citation.caseName);
      return {
        ruleId: 'CR-SR-001',
        ruleName: 'CASE_NAME_PRESENT',
        tier: 'structural',
        passed: hasName,
        severity: hasName ? 'pass' : 'error',
        message: hasName
          ? 'Case name identified'
          : 'Could not identify case name (expected "Party v. Party" format)',
        details: hasName ? `Case: ${citation.caseName}` : undefined,
        humanAction: 'none',
      };
    },
  },

  {
    id: 'CR-SR-002',
    name: 'VOLUME_REPORTER_PAGE_FORMAT',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      const hasVRP = citation.volume !== null &&
                     citation.reporter !== null &&
                     citation.page !== null;
      return {
        ruleId: 'CR-SR-002',
        ruleName: 'VOLUME_REPORTER_PAGE_FORMAT',
        tier: 'structural',
        passed: hasVRP,
        severity: hasVRP ? 'pass' : 'error',
        message: hasVRP
          ? 'Volume/Reporter/Page format valid'
          : 'Missing or malformed volume/reporter/page components',
        details: hasVRP
          ? `${citation.volume} ${citation.reporter} ${citation.page}`
          : 'Expected format: [volume] [reporter] [page]',
        humanAction: hasVRP ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SR-003',
    name: 'REPORTER_RECOGNIZED',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      if (!citation.reporter) {
        return {
          ruleId: 'CR-SR-003',
          ruleName: 'REPORTER_RECOGNIZED',
          tier: 'structural',
          passed: false,
          severity: 'error',
          message: 'No reporter found in citation',
          humanAction: 'verify',
        };
      }

      const normalized = citation.reporter.replace(/\s+/g, '').toLowerCase();
      const isKnown = KNOWN_REPORTERS.some(r =>
        r.replace(/\s+/g, '').toLowerCase() === normalized
      );

      return {
        ruleId: 'CR-SR-003',
        ruleName: 'REPORTER_RECOGNIZED',
        tier: 'structural',
        passed: isKnown,
        severity: isKnown ? 'pass' : 'warning',
        message: isKnown
          ? `Recognized reporter: ${citation.reporter}`
          : `Unrecognized reporter: "${citation.reporter}" - may be valid but not in database`,
        humanAction: isKnown ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SR-004',
    name: 'COURT_IDENTIFIER_FORMAT',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      if (!citation.court) {
        return {
          ruleId: 'CR-SR-004',
          ruleName: 'COURT_IDENTIFIER_FORMAT',
          tier: 'structural',
          passed: false,
          severity: 'warning',
          message: 'No court identifier found in parenthetical',
          humanAction: 'verify',
        };
      }

      const matchesPattern = COURT_PATTERNS.some(p => p.test(citation.court!));

      return {
        ruleId: 'CR-SR-004',
        ruleName: 'COURT_IDENTIFIER_FORMAT',
        tier: 'structural',
        passed: matchesPattern,
        severity: matchesPattern ? 'pass' : 'warning',
        message: matchesPattern
          ? `Valid court identifier format: ${citation.court}`
          : `Unusual court format: "${citation.court}"`,
        humanAction: matchesPattern ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SR-005',
    name: 'YEAR_FORMAT_VALID',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      const year = citation.year;
      const currentYear = new Date().getFullYear();
      const validFormat = year !== null && year >= 1700 && year <= currentYear;

      return {
        ruleId: 'CR-SR-005',
        ruleName: 'YEAR_FORMAT_VALID',
        tier: 'structural',
        passed: validFormat,
        severity: validFormat ? 'pass' : 'error',
        message: validFormat
          ? `Valid year: ${year}`
          : year === null
            ? 'No year found in citation'
            : year > currentYear
              ? `FUTURE DATE: Year ${year} is in the future`
              : `Invalid year: ${year}`,
        humanAction: 'none',
      };
    },
  },

  {
    id: 'CR-SR-006',
    name: 'VOLUME_PAGE_POSITIVE',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      const validVolume = citation.volume === null || citation.volume > 0;
      const validPage = citation.page === null || citation.page > 0;
      const passed = validVolume && validPage;

      return {
        ruleId: 'CR-SR-006',
        ruleName: 'VOLUME_PAGE_POSITIVE',
        tier: 'structural',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Volume and page numbers are positive'
          : `Invalid numbers: volume=${citation.volume}, page=${citation.page}`,
        humanAction: 'none',
      };
    },
  },

  {
    id: 'CR-SR-007',
    name: 'PINPOINT_AFTER_PAGE',
    tier: 'structural',
    check: (citation: ParsedCitation): CitationValidationResult => {
      if (citation.pinpoint === null) {
        return {
          ruleId: 'CR-SR-007',
          ruleName: 'PINPOINT_AFTER_PAGE',
          tier: 'structural',
          passed: true,
          severity: 'pass',
          message: 'No pinpoint citation (acceptable)',
          humanAction: 'none',
        };
      }

      const validPinpoint = citation.page !== null &&
                            citation.pinpoint >= citation.page;

      return {
        ruleId: 'CR-SR-007',
        ruleName: 'PINPOINT_AFTER_PAGE',
        tier: 'structural',
        passed: validPinpoint,
        severity: validPinpoint ? 'pass' : 'warning',
        message: validPinpoint
          ? `Valid pinpoint: ${citation.page}, ${citation.pinpoint}`
          : `Pinpoint (${citation.pinpoint}) before starting page (${citation.page})`,
        humanAction: validPinpoint ? 'none' : 'verify',
      };
    },
  },
];

// =============================================================================
// SEMANTIC VALIDATION RULES (Tier 2)
// =============================================================================
// These rules check if the citation MAKES SENSE given what we know.
// =============================================================================

const SEMANTIC_RULES: CitationValidationRule[] = [
  {
    id: 'CR-SM-001',
    name: 'DATE_NOT_FUTURE',
    tier: 'semantic',
    check: (citation: ParsedCitation): CitationValidationResult => {
      const currentYear = new Date().getFullYear();
      const isFuture = citation.year !== null && citation.year > currentYear;

      return {
        ruleId: 'CR-SM-001',
        ruleName: 'DATE_NOT_FUTURE',
        tier: 'semantic',
        passed: !isFuture,
        severity: isFuture ? 'error' : 'pass',
        message: isFuture
          ? `FABRICATION INDICATOR: Citation year ${citation.year} is in the future`
          : 'Citation date is not in the future',
        humanAction: isFuture ? 'verify' : 'none',
      };
    },
  },

  {
    id: 'CR-SM-002',
    name: 'REPORTER_SERIES_MATCHES_YEAR',
    tier: 'semantic',
    check: (citation: ParsedCitation): CitationValidationResult => {
      if (!citation.reporter || !citation.year) {
        return {
          ruleId: 'CR-SM-002',
          ruleName: 'REPORTER_SERIES_MATCHES_YEAR',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'Cannot verify reporter-year match (missing data)',
          humanAction: 'none',
        };
      }

      const normalizedReporter = citation.reporter.replace(/\s+/g, '');
      const range = REPORTER_YEAR_RANGES[normalizedReporter];

      if (!range) {
        return {
          ruleId: 'CR-SM-002',
          ruleName: 'REPORTER_SERIES_MATCHES_YEAR',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: `Year range not tracked for ${citation.reporter}`,
          humanAction: 'none',
        };
      }

      const inRange = citation.year >= range[0] && citation.year <= range[1];

      return {
        ruleId: 'CR-SM-002',
        ruleName: 'REPORTER_SERIES_MATCHES_YEAR',
        tier: 'semantic',
        passed: inRange,
        severity: inRange ? 'pass' : 'error',
        message: inRange
          ? `Year ${citation.year} appropriate for ${citation.reporter}`
          : `IMPLAUSIBLE: ${citation.reporter} published ${range[0]}-${range[1]}, not ${citation.year}`,
        details: inRange ? undefined : `Expected year range: ${range[0]}-${range[1]}`,
        humanAction: inRange ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SM-003',
    name: 'VOLUME_RANGE_PLAUSIBLE',
    tier: 'semantic',
    check: (citation: ParsedCitation): CitationValidationResult => {
      if (!citation.reporter || !citation.volume) {
        return {
          ruleId: 'CR-SM-003',
          ruleName: 'VOLUME_RANGE_PLAUSIBLE',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'Cannot verify volume range (missing data)',
          humanAction: 'none',
        };
      }

      const normalizedReporter = citation.reporter.replace(/\s+/g, '');
      const maxVol = REPORTER_MAX_VOLUMES[normalizedReporter];

      if (!maxVol) {
        return {
          ruleId: 'CR-SM-003',
          ruleName: 'VOLUME_RANGE_PLAUSIBLE',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: `Volume range not tracked for ${citation.reporter}`,
          humanAction: 'none',
        };
      }

      const plausible = citation.volume <= maxVol;

      return {
        ruleId: 'CR-SM-003',
        ruleName: 'VOLUME_RANGE_PLAUSIBLE',
        tier: 'semantic',
        passed: plausible,
        severity: plausible ? 'pass' : 'error',
        message: plausible
          ? `Volume ${citation.volume} within expected range for ${citation.reporter}`
          : `IMPLAUSIBLE: Volume ${citation.volume} exceeds known range (~${maxVol}) for ${citation.reporter}`,
        humanAction: plausible ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SM-004',
    name: 'COURT_EXISTS_FOR_DATE',
    tier: 'semantic',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      if (!citation.court || !citation.year) {
        return {
          ruleId: 'CR-SM-004',
          ruleName: 'COURT_EXISTS_FOR_DATE',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'Cannot verify court existence (missing court or year)',
          humanAction: 'none',
        };
      }

      const courtDb = context?.courtDb;
      if (!courtDb) {
        return {
          ruleId: 'CR-SM-004',
          ruleName: 'COURT_EXISTS_FOR_DATE',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'No court database available for verification',
          humanAction: 'none',
        };
      }

      const courtInfo = courtDb.lookupCourt(citation.court);
      if (!courtInfo) {
        return {
          ruleId: 'CR-SM-004',
          ruleName: 'COURT_EXISTS_FOR_DATE',
          tier: 'semantic',
          passed: true,
          severity: 'warning',
          message: `Court "${citation.court}" not in database - cannot verify existence`,
          humanAction: 'verify',
        };
      }

      const courtExisted = citation.year >= courtInfo.establishedYear;

      return {
        ruleId: 'CR-SM-004',
        ruleName: 'COURT_EXISTS_FOR_DATE',
        tier: 'semantic',
        passed: courtExisted,
        severity: courtExisted ? 'pass' : 'error',
        message: courtExisted
          ? `Court existed in ${citation.year}`
          : `IMPLAUSIBLE: ${courtInfo.fullName} established ${courtInfo.establishedYear}, not ${citation.year}`,
        humanAction: courtExisted ? 'none' : 'verify',
      };
    },
  },

  {
    id: 'CR-SM-005',
    name: 'REPORTER_MATCHES_COURT',
    tier: 'semantic',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      if (!citation.reporter || !citation.court) {
        return {
          ruleId: 'CR-SM-005',
          ruleName: 'REPORTER_MATCHES_COURT',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'Cannot verify reporter-court match (missing data)',
          humanAction: 'none',
        };
      }

      const courtDb = context?.courtDb;
      if (!courtDb) {
        // Basic heuristic checks without database
        return performBasicReporterCourtCheck(citation);
      }

      const courtInfo = courtDb.lookupCourt(citation.court);
      if (!courtInfo) {
        return {
          ruleId: 'CR-SM-005',
          ruleName: 'REPORTER_MATCHES_COURT',
          tier: 'semantic',
          passed: true,
          severity: 'info',
          message: 'Court not in database - cannot verify reporter match',
          humanAction: 'none',
        };
      }

      const reporterMatch = courtDb.isReporterValidForCourt(citation.reporter, citation.court);

      return {
        ruleId: 'CR-SM-005',
        ruleName: 'REPORTER_MATCHES_COURT',
        tier: 'semantic',
        passed: reporterMatch,
        severity: reporterMatch ? 'pass' : 'warning',
        message: reporterMatch
          ? `Reporter ${citation.reporter} valid for ${citation.court}`
          : `UNUSUAL: Reporter ${citation.reporter} not typical for ${citation.court}`,
        details: reporterMatch ? undefined : `Expected: ${courtInfo.reporterPrefixes.join(', ')}`,
        humanAction: reporterMatch ? 'none' : 'check_westlaw',
      };
    },
  },
];

/**
 * Basic reporter-court compatibility check without database.
 */
function performBasicReporterCourtCheck(citation: ParsedCitation): CitationValidationResult {
  const reporter = citation.reporter!.replace(/\s+/g, '');
  const court = citation.court!;

  // Federal circuit courts should use F., F.2d, F.3d, F.4th
  const isCircuitCourt = /Cir\.?$/i.test(court);
  const isFederalReporter = /^F\.(2d|3d|4th)?$/.test(reporter);

  // Federal district courts should use F.Supp
  const isDistrictCourt = /^[NSEWCM]\.?D\.?/i.test(court);
  const isSupplementReporter = /^F\.Supp/.test(reporter);

  // Supreme Court should use U.S., S.Ct., or L.Ed.
  const isSupremeCourt = court === 'U.S.' || /Sup\.?\s*Ct\.?/i.test(court);
  const isSupremeReporter = /^(U\.S\.|S\.Ct\.|L\.Ed)/.test(reporter);

  let passed = true;
  let message = 'Reporter-court combination appears reasonable';

  if (isCircuitCourt && !isFederalReporter) {
    passed = false;
    message = `Circuit courts typically use F./F.2d/F.3d/F.4th, not ${citation.reporter}`;
  } else if (isDistrictCourt && !isSupplementReporter && !isFederalReporter) {
    passed = false;
    message = `District courts typically use F.Supp. series, not ${citation.reporter}`;
  } else if (isSupremeCourt && !isSupremeReporter) {
    passed = false;
    message = `Supreme Court uses U.S./S.Ct./L.Ed., not ${citation.reporter}`;
  }

  return {
    ruleId: 'CR-SM-005',
    ruleName: 'REPORTER_MATCHES_COURT',
    tier: 'semantic',
    passed,
    severity: passed ? 'pass' : 'warning',
    message,
    humanAction: passed ? 'none' : 'check_westlaw',
  };
}

// =============================================================================
// CHAIN VALIDATION RULES (Tier 3)
// =============================================================================
// These rules apply when there is a parent frame context.
// Critical for no_fabrication constraints from legal instruments (¶, †).
// =============================================================================

const CHAIN_RULES: CitationValidationRule[] = [
  {
    id: 'CR-CH-001',
    name: 'CITATION_IN_LOCAL_DATABASE',
    tier: 'chain',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      const caseDb = context?.caseDb;
      const noFabricationActive = context?.noFabricationActive ?? false;

      if (!caseDb) {
        // No database available
        if (noFabricationActive) {
          return {
            ruleId: 'CR-CH-001',
            ruleName: 'CITATION_IN_LOCAL_DATABASE',
            tier: 'chain',
            passed: false,
            severity: 'hold',
            message: 'NO_FABRICATION ACTIVE: No case database available for verification',
            details: 'Parent frame has ¶ or † symbol - all citations MUST be verified by human',
            humanAction: 'check_westlaw',
          };
        }
        return {
          ruleId: 'CR-CH-001',
          ruleName: 'CITATION_IN_LOCAL_DATABASE',
          tier: 'chain',
          passed: true,
          severity: 'info',
          message: 'No case database available',
          humanAction: 'none',
        };
      }

      const inDatabase = caseDb.lookupCase(
        citation.caseName,
        citation.volume,
        citation.reporter,
        citation.page
      );

      if (noFabricationActive && !inDatabase) {
        return {
          ruleId: 'CR-CH-001',
          ruleName: 'CITATION_IN_LOCAL_DATABASE',
          tier: 'chain',
          passed: false,
          severity: 'hold',
          message: 'NO_FABRICATION CONSTRAINT: Citation not found in verified database',
          details: 'Parent frame has ¶ or † symbol - all citations MUST be verified by human',
          humanAction: 'check_westlaw',
        };
      }

      return {
        ruleId: 'CR-CH-001',
        ruleName: 'CITATION_IN_LOCAL_DATABASE',
        tier: 'chain',
        passed: inDatabase !== null,
        severity: inDatabase ? 'pass' : 'unverifiable',
        message: inDatabase
          ? `Citation found in local database (source: ${inDatabase.source})`
          : 'Citation NOT in local database - CANNOT verify existence',
        details: inDatabase
          ? undefined
          : 'This does NOT mean the case is fabricated - only that it is not in our verified list',
        humanAction: inDatabase ? 'none' : 'check_westlaw',
      };
    },
  },

  {
    id: 'CR-CH-002',
    name: 'CASE_NOT_OVERRULED',
    tier: 'chain',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      const caseDb = context?.caseDb;

      if (!caseDb) {
        return {
          ruleId: 'CR-CH-002',
          ruleName: 'CASE_NOT_OVERRULED',
          tier: 'chain',
          passed: true,
          severity: 'info',
          message: 'No case database available - cannot check overruling status',
          humanAction: 'check_westlaw',
        };
      }

      const caseRecord = caseDb.lookupCase(
        citation.caseName,
        citation.volume,
        citation.reporter,
        citation.page
      );

      if (!caseRecord) {
        return {
          ruleId: 'CR-CH-002',
          ruleName: 'CASE_NOT_OVERRULED',
          tier: 'chain',
          passed: true,
          severity: 'info',
          message: 'Case not in database - cannot check overruling status',
          humanAction: 'check_overruled',
        };
      }

      if (caseRecord.overruled) {
        return {
          ruleId: 'CR-CH-002',
          ruleName: 'CASE_NOT_OVERRULED',
          tier: 'chain',
          passed: false,
          severity: 'warning',
          message: 'WARNING: This case has been overruled',
          details: caseRecord.overruledBy
            ? `Overruled by: ${caseRecord.overruledBy}`
            : 'Overruling case not recorded in database',
          humanAction: 'review_holding',
        };
      }

      return {
        ruleId: 'CR-CH-002',
        ruleName: 'CASE_NOT_OVERRULED',
        tier: 'chain',
        passed: true,
        severity: 'pass',
        message: 'Case not marked as overruled in local database',
        details: 'Note: Local database may be incomplete',
        humanAction: 'none',
      };
    },
  },

  {
    id: 'CR-CH-003',
    name: 'LEGAL_DOMAIN_CONTEXT',
    tier: 'chain',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      const parentFrame = context?.parentFrame;

      if (!parentFrame) {
        return {
          ruleId: 'CR-CH-003',
          ruleName: 'LEGAL_DOMAIN_CONTEXT',
          tier: 'chain',
          passed: true,
          severity: 'info',
          message: 'No parent frame - cannot check domain context',
          humanAction: 'none',
        };
      }

      const legalDomainActive = parentFrame.domain === LEGAL_DOMAIN_SYMBOL;

      return {
        ruleId: 'CR-CH-003',
        ruleName: 'LEGAL_DOMAIN_CONTEXT',
        tier: 'chain',
        passed: true,
        severity: legalDomainActive ? 'pass' : 'info',
        message: legalDomainActive
          ? `Legal domain (${LEGAL_DOMAIN_SYMBOL}) active - citation validation applies`
          : `Domain is ${parentFrame.domain || 'unset'} - citation may be for reference only`,
        humanAction: 'none',
      };
    },
  },

  {
    id: 'CR-CH-004',
    name: 'NO_FABRICATION_CONSTRAINT',
    tier: 'chain',
    check: (citation: ParsedCitation, context?: CitationValidationContext): CitationValidationResult => {
      const parentFrame = context?.parentFrame;

      if (!parentFrame) {
        return {
          ruleId: 'CR-CH-004',
          ruleName: 'NO_FABRICATION_CONSTRAINT',
          tier: 'chain',
          passed: true,
          severity: 'info',
          message: 'No parent frame - cannot check fabrication constraints',
          humanAction: 'none',
        };
      }

      // Check for legal instrument symbols with no_fabrication constraint
      const hasNoFabricationSymbol = parentFrame.symbols.some(
        s => NO_FABRICATION_SYMBOLS.includes(s.symbol as typeof NO_FABRICATION_SYMBOLS[number])
      );

      // Also check if ⛔ (forbidden) is present in constraints
      const hasForbidden = parentFrame.constraints.includes('⛔');

      const noFabricationActive = hasNoFabricationSymbol || hasForbidden;

      if (noFabricationActive) {
        return {
          ruleId: 'CR-CH-004',
          ruleName: 'NO_FABRICATION_CONSTRAINT',
          tier: 'chain',
          passed: true,
          severity: 'hold',
          message: 'NO_FABRICATION constraint active - all citations require verification',
          details: hasNoFabricationSymbol
            ? `Legal instrument symbol (${NO_FABRICATION_SYMBOLS.join(' or ')}) present`
            : 'Forbidden constraint (⛔) present in parent frame',
          humanAction: 'check_westlaw',
        };
      }

      return {
        ruleId: 'CR-CH-004',
        ruleName: 'NO_FABRICATION_CONSTRAINT',
        tier: 'chain',
        passed: true,
        severity: 'pass',
        message: 'No fabrication constraints active',
        humanAction: 'none',
      };
    },
  },
];

// =============================================================================
// CITATION PARSER
// =============================================================================

/**
 * Parse a citation string into structured components.
 */
function parseCitation(raw: string): ParsedCitation {
  const trimmed = raw.trim();

  // Main case citation pattern:
  // [Case Name], [Volume] [Reporter] [Page](, [Pinpoint])? ([Court] [Year])
  const CASE_CITATION_PATTERN =
    /^(.+?)\s*,?\s*(\d+)\s+([A-Za-z.\s]+\d*[a-z]*\.?)\s+(\d+)(?:\s*,\s*(\d+))?\s*\(([^)]+?)\s+(\d{4})\)\.?$/;

  // Simpler pattern without court parenthetical
  const SIMPLE_CITATION_PATTERN =
    /^(.+?)\s*,?\s*(\d+)\s+([A-Za-z.\s]+\d*[a-z]*\.?)\s+(\d+)(?:\s*,\s*(\d+))?\s*\((\d{4})\)\.?$/;

  let match = trimmed.match(CASE_CITATION_PATTERN);

  if (match) {
    return {
      raw,
      normalized: trimmed,
      caseName: match[1].trim(),
      volume: parseInt(match[2], 10),
      reporter: match[3].trim(),
      page: parseInt(match[4], 10),
      pinpoint: match[5] ? parseInt(match[5], 10) : null,
      court: match[6].trim(),
      year: parseInt(match[7], 10),
      citationType: 'case',
      formatStyle: 'bluebook',
      parseConfidence: 0.9,
      unparsedSegments: [],
    };
  }

  // Try simpler pattern (year only in parenthetical)
  match = trimmed.match(SIMPLE_CITATION_PATTERN);
  if (match) {
    return {
      raw,
      normalized: trimmed,
      caseName: match[1].trim(),
      volume: parseInt(match[2], 10),
      reporter: match[3].trim(),
      page: parseInt(match[4], 10),
      pinpoint: match[5] ? parseInt(match[5], 10) : null,
      court: null,
      year: parseInt(match[6], 10),
      citationType: 'case',
      formatStyle: 'informal',
      parseConfidence: 0.7,
      unparsedSegments: [],
    };
  }

  // Try to extract what we can
  const partialResult = attemptPartialParse(trimmed);
  if (partialResult) {
    return partialResult;
  }

  // Complete parse failure
  return {
    raw,
    normalized: trimmed,
    caseName: null,
    volume: null,
    reporter: null,
    page: null,
    pinpoint: null,
    court: null,
    year: null,
    citationType: 'unknown',
    formatStyle: 'malformed',
    parseConfidence: 0.1,
    unparsedSegments: [trimmed],
  };
}

/**
 * Attempt to extract partial citation components when full parse fails.
 */
function attemptPartialParse(text: string): ParsedCitation | null {
  let caseName: string | null = null;
  let volume: number | null = null;
  let reporter: string | null = null;
  let page: number | null = null;
  let court: string | null = null;
  let year: number | null = null;

  // Try to find case name (X v. Y pattern)
  const nameMatch = text.match(/^(.+?\s+v\.?\s+.+?)(?:\s*,|\s+\d)/i);
  if (nameMatch) {
    caseName = nameMatch[1].trim();
  }

  // Try to find volume/reporter/page pattern
  const vrpMatch = text.match(/(\d+)\s+([A-Za-z.\s]+\d*[a-z]*\.?)\s+(\d+)/);
  if (vrpMatch) {
    volume = parseInt(vrpMatch[1], 10);
    reporter = vrpMatch[2].trim();
    page = parseInt(vrpMatch[3], 10);
  }

  // Try to find year in parenthetical
  const yearMatch = text.match(/\(.*?(\d{4})\)/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Try to find court in parenthetical
  const courtMatch = text.match(/\(([^)]*?)\s+\d{4}\)/);
  if (courtMatch && courtMatch[1].trim()) {
    court = courtMatch[1].trim();
  }

  // If we got at least volume/reporter/page, consider it a partial success
  if (volume && reporter && page) {
    return {
      raw: text,
      normalized: text,
      caseName,
      volume,
      reporter,
      page,
      pinpoint: null,
      court,
      year,
      citationType: 'case',
      formatStyle: 'informal',
      parseConfidence: 0.5,
      unparsedSegments: [],
    };
  }

  return null;
}

// =============================================================================
// CONFIDENCE SCORING
// =============================================================================

/**
 * Calculate confidence score based on validation results.
 * CAPPED at MAX_CONFIDENCE_SCORE (0.85) because we cannot fully verify.
 */
function calculateConfidenceScore(
  parsed: ParsedCitation,
  structural: CitationValidationResult[],
  semantic: CitationValidationResult[],
  chain: CitationValidationResult[]
): number {
  const structuralPassed = structural.filter(r => r.passed).length;
  const structuralTotal = structural.length;

  const semanticPassed = semantic.filter(r => r.passed).length;
  const semanticTotal = semantic.length;

  const chainPassed = chain.filter(r => r.passed).length;
  const chainTotal = Math.max(chain.length, 1);

  const databaseMatch = chain.some(r =>
    r.ruleId === 'CR-CH-001' && r.passed && r.severity === 'pass'
  );

  const knownReporter = parsed.reporter !== null &&
                        parsed.formatStyle !== 'malformed';

  const noSemanticErrors = !semantic.some(r => r.severity === 'error');

  const factors: ConfidenceFactors = {
    parseConfidence: parsed.parseConfidence,
    structuralScore: structuralTotal > 0 ? structuralPassed / structuralTotal : 0,
    semanticScore: semanticTotal > 0 ? semanticPassed / semanticTotal : 0,
    chainScore: chainPassed / chainTotal,
    databaseMatch,
    knownReporter,
    plausibleDateCourt: noSemanticErrors,
  };

  // Weight factors
  const weights = {
    parseConfidence: 0.20,
    structuralScore: 0.25,
    semanticScore: 0.20,
    chainScore: 0.10,
    databaseMatch: 0.15,
    knownReporter: 0.05,
    plausibleDateCourt: 0.05,
  };

  let score =
    factors.parseConfidence * weights.parseConfidence +
    factors.structuralScore * weights.structuralScore +
    factors.semanticScore * weights.semanticScore +
    factors.chainScore * weights.chainScore +
    (factors.databaseMatch ? 1 : 0) * weights.databaseMatch +
    (factors.knownReporter ? 1 : 0) * weights.knownReporter +
    (factors.plausibleDateCourt ? 1 : 0) * weights.plausibleDateCourt;

  // Cap at maximum - we CANNOT fully verify
  return Math.min(score, MAX_CONFIDENCE_SCORE);
}

// =============================================================================
// HOLD DECISION LOGIC
// =============================================================================

interface HoldDecision {
  action: 'allow' | 'warn' | 'hold';
  reason: CitationHoldReason | null;
  humanAction: string | null;
}

/**
 * Determine whether a citation should be held for human review.
 */
function decideHoldAction(
  report: CitationValidationReport,
  context?: CitationValidationContext
): HoldDecision {
  const parentFrame = context?.parentFrame;

  // ─────────────────────────────────────────────────────────────────────────
  // HOLD TRIGGERS (must stop for human review)
  // ─────────────────────────────────────────────────────────────────────────

  // 1. No-fabrication constraint active AND citation not in database
  const noFabricationActive = context?.noFabricationActive ?? false;
  const notInDb = report.chain.some(r =>
    r.ruleId === 'CR-CH-001' && !r.passed
  );

  if (noFabricationActive && notInDb) {
    return {
      action: 'hold',
      reason: 'fabrication_constraint_active',
      humanAction: 'Verify citation exists in Westlaw/Lexis before proceeding',
    };
  }

  // 2. Future date detected (impossible citation)
  const futureDateError = report.semantic.some(
    r => r.ruleId === 'CR-SM-001' && !r.passed
  );
  if (futureDateError) {
    return {
      action: 'hold',
      reason: 'implausible_date_court',
      humanAction: 'Citation date is in the future - verify source',
    };
  }

  // 3. Reporter series incompatible with year
  const reporterYearError = report.semantic.some(
    r => r.ruleId === 'CR-SM-002' && r.severity === 'error'
  );
  if (reporterYearError) {
    return {
      action: 'hold',
      reason: 'implausible_date_court',
      humanAction: 'Reporter series did not exist at cited year - verify source',
    };
  }

  // 4. Volume exceeds known range
  const volumeError = report.semantic.some(
    r => r.ruleId === 'CR-SM-003' && r.severity === 'error'
  );
  if (volumeError) {
    return {
      action: 'hold',
      reason: 'implausible_date_court',
      humanAction: 'Volume number exceeds known range - verify source',
    };
  }

  // 5. Court did not exist for date
  const courtDateError = report.semantic.some(
    r => r.ruleId === 'CR-SM-004' && r.severity === 'error'
  );
  if (courtDateError) {
    return {
      action: 'hold',
      reason: 'implausible_date_court',
      humanAction: 'Court did not exist at cited date - verify source',
    };
  }

  // 6. Multiple structural errors
  const structuralErrors = report.structural.filter(r => r.severity === 'error').length;
  if (structuralErrors >= 2) {
    return {
      action: 'hold',
      reason: 'multiple_issues_detected',
      humanAction: 'Multiple format errors detected - verify citation source',
    };
  }

  // 7. Very low confidence score
  if (report.confidenceScore < 0.30) {
    return {
      action: 'hold',
      reason: 'format_unrecognized',
      humanAction: 'Low confidence in citation validity - manual review required',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WARNING TRIGGERS (flag but allow with notice)
  // ─────────────────────────────────────────────────────────────────────────

  // Semantic warnings
  const semanticWarnings = report.semantic.filter(r => r.severity === 'warning').length;

  // Not in database (but format OK and no fabrication constraint)
  const unverifiable = report.chain.some(
    r => r.ruleId === 'CR-CH-001' && r.severity === 'unverifiable'
  );

  // Case marked as overruled
  const isOverruled = report.chain.some(
    r => r.ruleId === 'CR-CH-002' && !r.passed
  );

  if (semanticWarnings > 0 || unverifiable || isOverruled) {
    return {
      action: 'warn',
      reason: isOverruled ? 'case_overruled' : null,
      humanAction: null,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ALLOW (appears valid, but always with caveat)
  // ─────────────────────────────────────────────────────────────────────────

  return {
    action: 'allow',
    reason: null,
    humanAction: null,
  };
}

// =============================================================================
// CITATION VALIDATOR CLASS
// =============================================================================

/**
 * Three-tier citation validator.
 *
 * CRITICAL: This validator CANNOT verify that cases actually exist.
 * It can only check formats and local database matches.
 */
export class CitationValidator {
  private courtDb: CourtDatabase | null;
  private caseDb: CaseDatabase | null;

  constructor(courtDb?: CourtDatabase, caseDb?: CaseDatabase) {
    this.courtDb = courtDb ?? null;
    this.caseDb = caseDb ?? null;
  }

  /**
   * Parse a citation string into components.
   */
  parse(raw: string): ParsedCitation {
    return parseCitation(raw);
  }

  /**
   * Validate a citation through all three tiers.
   */
  validate(
    citation: string,
    parentFrame?: ParsedFrame
  ): CitationValidationReport {
    const parsed = parseCitation(citation);

    // Determine if no_fabrication is active
    const noFabricationActive = parentFrame
      ? parentFrame.symbols.some(
          s => NO_FABRICATION_SYMBOLS.includes(s.symbol as typeof NO_FABRICATION_SYMBOLS[number])
        ) || parentFrame.constraints.includes('⛔')
      : false;

    // Build context for rules
    const context: CitationValidationContext = {
      parentFrame,
      courtDb: this.courtDb ?? undefined,
      caseDb: this.caseDb ?? undefined,
      noFabricationActive,
    };

    // Run all three tiers
    const structural = STRUCTURAL_RULES.map(rule => rule.check(parsed, context));
    const semantic = SEMANTIC_RULES.map(rule => rule.check(parsed, context));
    const chain = CHAIN_RULES.map(rule => rule.check(parsed, context));

    // Calculate confidence
    const confidenceScore = calculateConfidenceScore(parsed, structural, semantic, chain);

    // Check for errors
    const allResults = [...structural, ...semantic, ...chain];
    const hasErrors = allResults.some(r => r.severity === 'error' && !r.passed);
    const hasHolds = allResults.some(r => r.severity === 'hold');

    // Build preliminary report for hold decision
    const prelimReport: CitationValidationReport = {
      citation,
      parsedCitation: parsed,
      valid: !hasErrors,
      verified: false,  // ALWAYS false
      requiresHumanReview: false,  // Will be set by hold decision
      structural,
      semantic,
      chain,
      confidenceScore,
      limitationNotice: LIMITATION_NOTICE,
      timestamp: Date.now(),
    };

    // Determine hold action
    const holdDecision = decideHoldAction(prelimReport, context);

    return {
      ...prelimReport,
      requiresHumanReview: holdDecision.action !== 'allow',
      holdReason: holdDecision.reason ?? undefined,
    };
  }

  /**
   * Validate structural rules only.
   */
  validateStructural(citation: string): CitationValidationReport {
    const parsed = parseCitation(citation);
    const structural = STRUCTURAL_RULES.map(rule => rule.check(parsed));
    const confidenceScore = calculateConfidenceScore(parsed, structural, [], []);

    const hasErrors = structural.some(r => r.severity === 'error' && !r.passed);

    return {
      citation,
      parsedCitation: parsed,
      valid: !hasErrors,
      verified: false,
      requiresHumanReview: confidenceScore < 0.50,
      structural,
      semantic: [],
      chain: [],
      confidenceScore,
      limitationNotice: LIMITATION_NOTICE,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate semantic rules only.
   */
  validateSemantic(citation: string): CitationValidationReport {
    const parsed = parseCitation(citation);
    const context: CitationValidationContext = {
      courtDb: this.courtDb ?? undefined,
    };
    const semantic = SEMANTIC_RULES.map(rule => rule.check(parsed, context));
    const confidenceScore = calculateConfidenceScore(parsed, [], semantic, []);

    const hasErrors = semantic.some(r => r.severity === 'error' && !r.passed);

    return {
      citation,
      parsedCitation: parsed,
      valid: !hasErrors,
      verified: false,
      requiresHumanReview: hasErrors,
      structural: [],
      semantic,
      chain: [],
      confidenceScore,
      limitationNotice: LIMITATION_NOTICE,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate chain rules only (requires parent frame).
   */
  validateChain(citation: string, parentFrame?: ParsedFrame): CitationValidationReport {
    const parsed = parseCitation(citation);

    const noFabricationActive = parentFrame
      ? parentFrame.symbols.some(
          s => NO_FABRICATION_SYMBOLS.includes(s.symbol as typeof NO_FABRICATION_SYMBOLS[number])
        )
      : false;

    const context: CitationValidationContext = {
      parentFrame,
      caseDb: this.caseDb ?? undefined,
      noFabricationActive,
    };

    const chain = CHAIN_RULES.map(rule => rule.check(parsed, context));
    const confidenceScore = calculateConfidenceScore(parsed, [], [], chain);

    const hasErrors = chain.some(r => r.severity === 'error' && !r.passed);
    const hasHolds = chain.some(r => r.severity === 'hold');

    return {
      citation,
      parsedCitation: parsed,
      valid: !hasErrors,
      verified: false,
      requiresHumanReview: hasHolds || noFabricationActive,
      holdReason: noFabricationActive ? 'fabrication_constraint_active' : undefined,
      structural: [],
      semantic: [],
      chain,
      confidenceScore,
      limitationNotice: LIMITATION_NOTICE,
      timestamp: Date.now(),
    };
  }

  /**
   * Batch validate multiple citations.
   */
  validateBatch(
    citations: string[],
    parentFrame?: ParsedFrame
  ): {
    results: CitationValidationReport[];
    summary: {
      total: number;
      valid: number;
      requiresReview: number;
      averageConfidence: number;
    };
  } {
    const results = citations.map(c => this.validate(c, parentFrame));

    const validCount = results.filter(r => r.valid).length;
    const reviewCount = results.filter(r => r.requiresHumanReview).length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidenceScore, 0) / results.length;

    return {
      results,
      summary: {
        total: results.length,
        valid: validCount,
        requiresReview: reviewCount,
        averageConfidence: avgConfidence,
      },
    };
  }

  /**
   * Get the limitation notice that should be displayed to users.
   */
  getLimitationNotice(): string {
    return LIMITATION_NOTICE;
  }

  // ===========================================================================
  // CONVENIENCE ALIAS METHODS
  // ===========================================================================

  /**
   * Alias for validateStructural().
   * Validates citation format/structure without semantic or chain checks.
   */
  validateFormat(citation: string): CitationValidationReport {
    return this.validateStructural(citation);
  }

  /**
   * Extract all citations from a text block.
   * Returns an array of parsed citations found in the text.
   */
  extractCitations(text: string): ParsedCitation[] {
    const citations: ParsedCitation[] = [];

    // Pattern to find potential case citations in text
    // Matches: [Case Name], [Volume] [Reporter] [Page] ([Court/Year])
    const citationPattern =
      /[A-Z][A-Za-z'.\-]+(?:\s+[A-Z][A-Za-z'.\-]+)*\s+v\.?\s+[A-Z][A-Za-z'.\-]+(?:\s+[A-Za-z'.\-]+)*\s*,?\s*\d+\s+[A-Za-z.\s]+\d*[a-z]*\.?\s+\d+(?:\s*,\s*\d+)?\s*\([^)]+\d{4}\)/g;

    const matches = text.match(citationPattern);

    if (matches) {
      for (const match of matches) {
        const parsed = this.parse(match.trim());
        // Only include if we got meaningful parse results
        if (parsed.parseConfidence > 0.1) {
          citations.push(parsed);
        }
      }
    }

    return citations;
  }
}

// =============================================================================
// IN-MEMORY IMPLEMENTATIONS (for testing/development)
// =============================================================================

/**
 * Simple in-memory court database with common courts.
 */
export class InMemoryCourtDatabase implements CourtDatabase {
  private courts: Map<string, CourtInfo> = new Map();

  constructor() {
    this.initializeDefaultCourts();
  }

  private initializeDefaultCourts(): void {
    const defaultCourts: CourtInfo[] = [
      {
        abbreviation: 'U.S.',
        fullName: 'Supreme Court of the United States',
        jurisdiction: 'federal',
        level: 'supreme',
        establishedYear: 1789,
        reporterPrefixes: ['U.S.', 'S.Ct.', 'S. Ct.', 'L.Ed.', 'L. Ed.'],
      },
      {
        abbreviation: '1st Cir.',
        fullName: 'United States Court of Appeals for the First Circuit',
        jurisdiction: 'federal',
        level: 'appellate',
        establishedYear: 1891,
        reporterPrefixes: ['F.', 'F.2d', 'F.3d', 'F.4th'],
      },
      {
        abbreviation: '2d Cir.',
        fullName: 'United States Court of Appeals for the Second Circuit',
        jurisdiction: 'federal',
        level: 'appellate',
        establishedYear: 1891,
        reporterPrefixes: ['F.', 'F.2d', 'F.3d', 'F.4th'],
      },
      {
        abbreviation: '9th Cir.',
        fullName: 'United States Court of Appeals for the Ninth Circuit',
        jurisdiction: 'federal',
        level: 'appellate',
        establishedYear: 1891,
        reporterPrefixes: ['F.', 'F.2d', 'F.3d', 'F.4th'],
      },
      {
        abbreviation: 'N.D. Cal.',
        fullName: 'United States District Court for the Northern District of California',
        jurisdiction: 'federal',
        level: 'district',
        establishedYear: 1850,
        reporterPrefixes: ['F.Supp.', 'F.Supp.2d', 'F.Supp.3d', 'F. Supp.'],
      },
      {
        abbreviation: 'S.D.N.Y.',
        fullName: 'United States District Court for the Southern District of New York',
        jurisdiction: 'federal',
        level: 'district',
        establishedYear: 1789,
        reporterPrefixes: ['F.Supp.', 'F.Supp.2d', 'F.Supp.3d', 'F. Supp.'],
      },
      {
        abbreviation: 'Cal.',
        fullName: 'Supreme Court of California',
        jurisdiction: 'state',
        level: 'supreme',
        establishedYear: 1850,
        reporterPrefixes: ['Cal.', 'Cal.2d', 'Cal.3d', 'Cal.4th', 'Cal.5th', 'P.', 'P.2d', 'P.3d'],
        state: 'California',
      },
      {
        abbreviation: 'N.Y.',
        fullName: 'New York Court of Appeals',
        jurisdiction: 'state',
        level: 'supreme',
        establishedYear: 1847,
        reporterPrefixes: ['N.Y.', 'N.Y.2d', 'N.Y.3d', 'N.E.', 'N.E.2d', 'N.E.3d'],
        state: 'New York',
      },
    ];

    for (const court of defaultCourts) {
      this.courts.set(court.abbreviation.toLowerCase(), court);
      // Also add normalized version
      this.courts.set(court.abbreviation.replace(/\s+/g, '').toLowerCase(), court);
    }
  }

  lookupCourt(abbreviation: string): CourtInfo | null {
    const normalized = abbreviation.replace(/\s+/g, '').toLowerCase();
    return this.courts.get(normalized) ?? null;
  }

  getAllCourts(): CourtInfo[] {
    const seen = new Set<string>();
    return Array.from(this.courts.values()).filter(c => {
      if (seen.has(c.fullName)) return false;
      seen.add(c.fullName);
      return true;
    });
  }

  isReporterValidForCourt(reporter: string, court: string): boolean {
    const courtInfo = this.lookupCourt(court);
    if (!courtInfo) return true; // Unknown court, assume valid

    const normalizedReporter = reporter.replace(/\s+/g, '');
    return courtInfo.reporterPrefixes.some(p =>
      normalizedReporter.startsWith(p.replace(/\s+/g, ''))
    );
  }
}

/**
 * Simple in-memory case database for testing.
 */
export class InMemoryCaseDatabase implements CaseDatabase {
  private cases: Map<string, KnownCaseRecord> = new Map();

  private makeKey(volume: number | null, reporter: string | null, page: number | null): string {
    return `${volume ?? ''}-${(reporter ?? '').replace(/\s+/g, '')}-${page ?? ''}`;
  }

  lookupCase(
    caseName: string | null,
    volume: number | null,
    reporter: string | null,
    page: number | null
  ): KnownCaseRecord | null {
    if (!volume || !reporter || !page) return null;
    const key = this.makeKey(volume, reporter, page);
    return this.cases.get(key) ?? null;
  }

  addVerifiedCase(record: Omit<KnownCaseRecord, 'addedAt'>): void {
    const key = this.makeKey(record.volume, record.reporter, record.page);
    this.cases.set(key, {
      ...record,
      addedAt: Date.now(),
    });
  }

  markOverruled(
    volume: number,
    reporter: string,
    page: number,
    overruledBy: string
  ): boolean {
    const key = this.makeKey(volume, reporter, page);
    const record = this.cases.get(key);
    if (!record) return false;

    this.cases.set(key, {
      ...record,
      overruled: true,
      overruledBy,
    });
    return true;
  }

  getStats(): { totalCases: number; overruledCases: number } {
    const all = Array.from(this.cases.values());
    return {
      totalCases: all.length,
      overruledCases: all.filter(c => c.overruled).length,
    };
  }

  /**
   * Seed with some well-known cases for testing.
   */
  seedTestData(): void {
    const testCases: Omit<KnownCaseRecord, 'addedAt'>[] = [
      {
        caseName: 'Brown v. Board of Education',
        normalizedName: 'brown v board of education',
        volume: 347,
        reporter: 'U.S.',
        page: 483,
        court: 'U.S.',
        year: 1954,
        jurisdiction: 'federal',
        overruled: false,
        source: 'seed_data',
      },
      {
        caseName: 'Marbury v. Madison',
        normalizedName: 'marbury v madison',
        volume: 5,
        reporter: 'U.S.',
        page: 137,
        court: 'U.S.',
        year: 1803,
        jurisdiction: 'federal',
        overruled: false,
        source: 'seed_data',
      },
      {
        caseName: 'Miranda v. Arizona',
        normalizedName: 'miranda v arizona',
        volume: 384,
        reporter: 'U.S.',
        page: 436,
        court: 'U.S.',
        year: 1966,
        jurisdiction: 'federal',
        overruled: false,
        source: 'seed_data',
      },
      {
        caseName: 'Plessy v. Ferguson',
        normalizedName: 'plessy v ferguson',
        volume: 163,
        reporter: 'U.S.',
        page: 537,
        court: 'U.S.',
        year: 1896,
        jurisdiction: 'federal',
        overruled: true,
        overruledBy: 'Brown v. Board of Education, 347 U.S. 483 (1954)',
        source: 'seed_data',
      },
    ];

    for (const c of testCases) {
      this.addVerifiedCase(c);
    }
  }
}

// =============================================================================
// FACTORY AND SINGLETON
// =============================================================================

/**
 * Create a citation validator with default in-memory databases.
 */
export function createCitationValidator(): CitationValidator {
  const courtDb = new InMemoryCourtDatabase();
  const caseDb = new InMemoryCaseDatabase();
  caseDb.seedTestData();
  return new CitationValidator(courtDb, caseDb);
}

/**
 * Default singleton instance.
 */
export const citationValidator = createCitationValidator();
