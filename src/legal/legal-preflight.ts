// =============================================================================
// LEGAL PRE-FLIGHT EVALUATOR
// =============================================================================
// Performs pre-execution checks for legal domain (◇) operations.
// This is the integration layer between:
//   - Citation validation (format checking)
//   - CourtListener API (existence verification)
//   - HoldManager (human-in-the-loop approval)
//
// WORKFLOW:
//   1. Parse content for legal citations
//   2. Run structural/semantic validation (CitationValidator)
//   3. Verify existence via CourtListener API
//   4. Check for privilege indicators, deadline risks
//   5. Return LegalPreFlightResults for HoldManager.shouldHoldLegal()
//
// =============================================================================

import type {
  LegalPreFlightResults,
  LegalHoldConfig,
  CitationUnverifiedEvidence,
  DeadlineRiskEvidence,
  JudgePreferenceEvidence,
  JurisdictionMismatchEvidence,
  PrivilegeRiskEvidence,
  FabricationFlagEvidence,
  ParsedFrame,
} from '../types/index.js';

import { CitationValidator, InMemoryCourtDatabase, InMemoryCaseDatabase } from './citation-validator.js';
import { CourtListenerCaseDatabase, createCourtListenerDatabase } from './courtlistener-adapter.js';
import { LEGAL_DOMAIN_SYMBOL, NO_FABRICATION_SYMBOLS } from './types.js';

// =============================================================================
// CITATION EXTRACTION
// =============================================================================

/**
 * Regex patterns for extracting legal citations from text.
 */
const CITATION_PATTERNS = [
  // Standard case citation: Smith v. Jones, 123 F.3d 456 (9th Cir. 2020)
  /[A-Z][a-zA-Z']+\s+v\.?\s+[A-Z][a-zA-Z']+,?\s+\d+\s+[A-Za-z.\s]+\d*[a-z]*\.?\s+\d+(?:\s*,\s*\d+)?\s*\([^)]+\s+\d{4}\)/g,

  // Short citation: 123 F.3d 456
  /\d{1,4}\s+(?:U\.S\.|S\.Ct\.|L\.Ed\.|L\.Ed\.2d|F\.|F\.2d|F\.3d|F\.4th|F\.Supp\.|F\.Supp\.2d|F\.Supp\.3d|Cal\.\d*[a-z]*|N\.Y\.\d*[a-z]*)\s+\d+/gi,

  // Supreme Court: 347 U.S. 483
  /\d{1,3}\s+U\.S\.\s+\d+/g,

  // Federal Reporter: 500 F.3d 123
  /\d{1,3}\s+F\.(?:2d|3d|4th)?\s+\d+/g,
];

/**
 * Extract potential legal citations from text.
 */
export function extractCitations(text: string): string[] {
  const citations = new Set<string>();

  for (const pattern of CITATION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        citations.add(match.trim());
      }
    }
  }

  return Array.from(citations);
}

// =============================================================================
// PRIVILEGE DETECTION
// =============================================================================

/**
 * Patterns that indicate potentially privileged content.
 */
const PRIVILEGE_PATTERNS = [
  // Attorney-client privilege indicators
  { pattern: /attorney[\s-]client\s+privilege/gi, type: 'attorney_client' as const, weight: 0.9 },
  { pattern: /privileged\s+and\s+confidential/gi, type: 'attorney_client' as const, weight: 0.8 },
  { pattern: /legal\s+advice/gi, type: 'attorney_client' as const, weight: 0.5 },
  { pattern: /in\s+confidence/gi, type: 'attorney_client' as const, weight: 0.3 },

  // Work product indicators (fact vs opinion distinction)
  { pattern: /work\s+product/gi, type: 'work_product_fact' as const, weight: 0.9 },
  { pattern: /attorney\s+work\s+product/gi, type: 'work_product_opinion' as const, weight: 0.95 },
  { pattern: /litigation\s+strategy/gi, type: 'work_product_opinion' as const, weight: 0.7 },
  { pattern: /prepared\s+in\s+anticipation\s+of\s+litigation/gi, type: 'work_product_fact' as const, weight: 0.95 },

  // Common interest / joint defense
  { pattern: /joint\s+defense/gi, type: 'joint_defense' as const, weight: 0.8 },
  { pattern: /common\s+interest/gi, type: 'common_interest' as const, weight: 0.6 },

  // Document metadata patterns
  { pattern: /\[PRIVILEGED\]/gi, type: 'attorney_client' as const, weight: 0.95 },
  { pattern: /ATTORNEY[\s-]?CLIENT/gi, type: 'attorney_client' as const, weight: 0.9 },
  { pattern: /WORK[\s-]?PRODUCT/gi, type: 'work_product_fact' as const, weight: 0.9 },
];

/**
 * Detect privilege indicators in content.
 */
export function detectPrivilegeIndicators(
  content: string,
  outputDestination: 'internal' | 'client' | 'opposing_counsel' | 'court' | 'public' | 'unknown' = 'unknown'
): PrivilegeRiskEvidence[] {
  const indicators: PrivilegeRiskEvidence[] = [];

  for (const { pattern, type, weight } of PRIVILEGE_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const idx = content.indexOf(match);
        const context = content.slice(Math.max(0, idx - 50), idx + match.length + 50);

        // Calculate waiver risk based on destination
        let waiverRisk: 'low' | 'medium' | 'high' | 'certain' = 'low';
        if (outputDestination === 'opposing_counsel') waiverRisk = 'certain';
        else if (outputDestination === 'court') waiverRisk = 'high';
        else if (outputDestination === 'public') waiverRisk = 'certain';
        else if (outputDestination === 'unknown') waiverRisk = 'high';

        indicators.push({
          detectionMethod: 'keyword_pattern',
          detectionConfidence: weight,
          triggerPatterns: [{
            pattern: match,
            location: `char ${idx}`,
            context,
          }],
          privilegeType: type,
          privilegeHolder: 'unknown',
          privilegeScope: 'unknown',
          outputType: 'generated_content',
          outputDestination,
          recipientPrivilegeStatus: outputDestination === 'client' ? 'privileged' : 'unknown',
          waiverRisk,
          waiverMitigatable: waiverRisk !== 'certain',
          contentExcerpt: context,
        });
      }
    }
  }

  return indicators;
}

// =============================================================================
// FABRICATION DETECTION
// =============================================================================

/**
 * Patterns that suggest potentially fabricated legal content.
 */
const FABRICATION_INDICATORS = [
  // Suspiciously generic case names
  { pattern: /Smith\s+v\.\s+Jones/gi, type: 'fabricated_citation' as const, score: 0.3 },
  { pattern: /Doe\s+v\.\s+Roe/gi, type: 'fabricated_citation' as const, score: 0.4 },

  // Round numbers in citations (suspicious)
  { pattern: /\d00\s+[A-Z][a-z]+\.\s+\d00\b/gi, type: 'fabricated_citation' as const, score: 0.2 },

  // Invented-sounding legal terms
  { pattern: /doctrine\s+of\s+[a-z]+\s+[a-z]+ability/gi, type: 'invented_legal_doctrine' as const, score: 0.5 },

  // Quotes without proper attribution
  { pattern: /"[^"]{50,}"(?!\s*\d+\s+[A-Z])/g, type: 'unverifiable_quote' as const, score: 0.3 },
];

/**
 * Simple semantic entropy estimation based on response patterns.
 * Higher scores indicate more uncertainty/potential fabrication.
 */
export function estimateSemanticEntropy(content: string): number {
  let score = 0;
  let factors = 0;

  // Check for hedging language (suggests uncertainty)
  const hedges = (content.match(/\b(may|might|could|possibly|perhaps|arguably)\b/gi) || []).length;
  if (hedges > 3) {
    score += 0.2;
    factors++;
  }

  // Check for very specific but unverifiable claims
  const specificClaims = (content.match(/\bexactly\s+\d+|precisely\s+\d+/gi) || []).length;
  if (specificClaims > 0) {
    score += 0.15;
    factors++;
  }

  // Check for fabrication indicators
  for (const { pattern, score: indicatorScore } of FABRICATION_INDICATORS) {
    if (pattern.test(content)) {
      score += indicatorScore;
      factors++;
    }
  }

  return factors > 0 ? Math.min(1, score / factors) : 0;
}

/**
 * Detect potential fabrication in legal content.
 */
export function detectFabrication(
  content: string,
  unverifiedCitations: string[]
): FabricationFlagEvidence[] {
  const flags: FabricationFlagEvidence[] = [];

  // Flag unverified citations
  for (const citation of unverifiedCitations) {
    const idx = content.indexOf(citation);
    const context = idx >= 0
      ? content.slice(Math.max(0, idx - 100), idx + citation.length + 100)
      : citation;

    flags.push({
      fabricationType: 'fabricated_citation',
      detectionConfidence: 0.5, // Unknown until verified
      detectionMethods: ['citation_verification'],
      fabricatedContent: citation,
      contentLocation: idx >= 0 ? `char ${idx}` : 'unknown',
      verificationAttempts: [{
        method: 'courtlistener_lookup',
        source: 'CourtListener API',
        result: 'not_found',
        details: 'Citation not found in CourtListener database',
      }],
      citationDetails: {
        citedCase: citation,
        citedReporter: extractReporter(citation),
        reporterExists: true, // Assume reporter exists if format matched
      },
      semanticEntropyScore: estimateSemanticEntropy(content),
      surroundingContext: context,
      documentType: 'legal_output',
      legalConsequence: 'Citation to non-existent case violates Rule 3.3 (candor toward tribunal)',
    });
  }

  return flags;
}

/**
 * Extract reporter abbreviation from citation.
 */
function extractReporter(citation: string): string {
  const match = citation.match(/\d+\s+([A-Za-z.\s]+\d*[a-z]*\.?)\s+\d+/);
  return match ? match[1].trim() : '';
}

// =============================================================================
// LEGAL PRE-FLIGHT EVALUATOR CLASS
// =============================================================================

/**
 * Configuration for legal pre-flight checks.
 */
export interface LegalPreFlightConfig {
  /** Whether to use CourtListener API for verification */
  enableCourtListenerVerification: boolean;

  /** CourtListener API token (increases rate limits) */
  courtListenerApiToken?: string;

  /** Minimum confidence score to consider citation verified */
  minVerificationConfidence: number;

  /** Whether to check for privilege indicators */
  enablePrivilegeDetection: boolean;

  /** Whether to estimate fabrication risk */
  enableFabricationDetection: boolean;

  /** Semantic entropy threshold for fabrication flag */
  semanticEntropyThreshold: number;
}

const DEFAULT_PREFLIGHT_CONFIG: LegalPreFlightConfig = {
  enableCourtListenerVerification: true,
  minVerificationConfidence: 0.6,
  enablePrivilegeDetection: true,
  enableFabricationDetection: true,
  semanticEntropyThreshold: 0.6,
};

/**
 * Legal Pre-Flight Evaluator.
 *
 * Performs comprehensive pre-execution checks for legal domain operations.
 * Integrates with CitationValidator and CourtListener for verification.
 */
export class LegalPreFlightEvaluator {
  private config: LegalPreFlightConfig;
  private citationValidator: CitationValidator;
  private courtListenerDb: CourtListenerCaseDatabase | null;

  constructor(config?: Partial<LegalPreFlightConfig>) {
    this.config = { ...DEFAULT_PREFLIGHT_CONFIG, ...config };

    // Initialize citation validator with in-memory databases
    const courtDb = new InMemoryCourtDatabase();
    const caseDb = new InMemoryCaseDatabase();
    caseDb.seedTestData();
    this.citationValidator = new CitationValidator(courtDb, caseDb);

    // Initialize CourtListener adapter if enabled
    if (this.config.enableCourtListenerVerification) {
      this.courtListenerDb = createCourtListenerDatabase({
        apiToken: this.config.courtListenerApiToken,
      });
    } else {
      this.courtListenerDb = null;
    }
  }

  /**
   * Check if a frame is in legal domain.
   */
  isLegalDomain(frame: string | ParsedFrame): boolean {
    if (typeof frame === 'string') {
      return frame.includes(LEGAL_DOMAIN_SYMBOL);
    }
    return frame.domain === LEGAL_DOMAIN_SYMBOL;
  }

  /**
   * Check if no-fabrication constraint is active.
   */
  hasNoFabricationConstraint(frame: string | ParsedFrame): boolean {
    if (typeof frame === 'string') {
      return NO_FABRICATION_SYMBOLS.some(s => frame.includes(s));
    }
    return frame.symbols.some(
      s => NO_FABRICATION_SYMBOLS.includes(s.symbol as typeof NO_FABRICATION_SYMBOLS[number])
    ) || frame.constraints.includes('⛔');
  }

  /**
   * Perform synchronous pre-flight checks (no API calls).
   * Returns immediately with format validation results.
   */
  checkSync(
    content: string,
    frame: string | ParsedFrame,
    outputDestination: 'internal' | 'client' | 'opposing_counsel' | 'court' | 'public' | 'unknown' = 'unknown'
  ): LegalPreFlightResults {
    const isLegalDomain = this.isLegalDomain(frame);

    if (!isLegalDomain) {
      return { isLegalDomain: false };
    }

    // Extract citations
    const citations = extractCitations(content);

    // Validate citation formats
    const parsedFrame = typeof frame === 'string' ? undefined : frame;
    const validationResults = citations.map(c => this.citationValidator.validate(c, parsedFrame));

    // Identify unverified citations (not in local database)
    const unverifiedCitations = validationResults
      .filter(r => r.requiresHumanReview)
      .map(r => r.citation);

    // Calculate overall verification score
    const verificationScore = validationResults.length > 0
      ? validationResults.reduce((sum, r) => sum + r.confidenceScore, 0) / validationResults.length
      : 1.0;

    // Build citation evidence
    const citationEvidence: CitationUnverifiedEvidence | undefined = unverifiedCitations.length > 0
      ? {
          citationText: unverifiedCitations[0],
          verificationAttempted: true,
          databasesChecked: ['local_seed_data'],
          failureReason: 'not_found',
          documentContext: content.slice(0, 200),
          proposedUsage: 'primary_authority',
          verificationTimestamp: Date.now(),
        }
      : undefined;

    // Check privilege indicators
    let privilegeCheck: LegalPreFlightResults['privilegeCheck'] | undefined;
    if (this.config.enablePrivilegeDetection) {
      const indicators = detectPrivilegeIndicators(content, outputDestination);
      if (indicators.length > 0) {
        const riskScore = Math.max(...indicators.map(i => i.detectionConfidence));
        privilegeCheck = {
          privilegeIndicators: indicators,
          riskScore,
        };
      }
    }

    // Check fabrication indicators
    let fabricationCheck: LegalPreFlightResults['fabricationCheck'] | undefined;
    if (this.config.enableFabricationDetection) {
      const fabricationFlags = detectFabrication(content, unverifiedCitations);
      const entropyScore = estimateSemanticEntropy(content);

      if (fabricationFlags.length > 0 || entropyScore > this.config.semanticEntropyThreshold) {
        fabricationCheck = {
          flaggedContent: fabricationFlags,
          overallScore: Math.max(entropyScore, ...fabricationFlags.map(f => f.detectionConfidence)),
        };
      }
    }

    // Calculate verified citations (those in seed data)
    const verifiedCitationsInitial = citations.filter(c => !unverifiedCitations.includes(c));

    return {
      isLegalDomain: true,
      citationVerification: citations.length > 0 ? {
        totalCitations: citations.length,
        verifiedCitations: verifiedCitationsInitial,
        unverifiedCitations,
        verificationScore,
        evidence: citationEvidence,
      } : undefined,
      privilegeCheck,
      fabricationCheck,
    };
  }

  /**
   * Perform full pre-flight checks including CourtListener API verification.
   * This is the preferred method but requires async.
   */
  async check(
    content: string,
    frame: string | ParsedFrame,
    outputDestination: 'internal' | 'client' | 'opposing_counsel' | 'court' | 'public' | 'unknown' = 'unknown'
  ): Promise<LegalPreFlightResults> {
    // Start with sync checks
    const syncResults = this.checkSync(content, frame, outputDestination);

    if (!syncResults.isLegalDomain) {
      return syncResults;
    }

    // If CourtListener is enabled and we have unverified citations, check API
    if (
      this.courtListenerDb &&
      this.config.enableCourtListenerVerification &&
      syncResults.citationVerification &&
      syncResults.citationVerification.unverifiedCitations.length > 0
    ) {
      const newlyVerifiedCitations: string[] = [];
      const stillUnverified: string[] = [];

      // Rate limiting: add delay between API calls to avoid 403 errors
      const API_DELAY_MS = 500;

      for (let i = 0; i < syncResults.citationVerification.unverifiedCitations.length; i++) {
        const citation = syncResults.citationVerification.unverifiedCitations[i];

        // Add delay between requests (skip first request)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
        }

        // Try CourtListener lookup
        const result = await this.courtListenerDb.lookupByText(citation);

        if (result) {
          newlyVerifiedCitations.push(citation);
        } else {
          stillUnverified.push(citation);
        }
      }

      // Calculate totals - include previously verified citations from seed data
      const previouslyVerified = syncResults.citationVerification.verifiedCitations || [];
      const allVerifiedCitations = [...previouslyVerified, ...newlyVerifiedCitations];
      const totalCitations = syncResults.citationVerification.totalCitations;
      const verifiedCount = allVerifiedCitations.length;

      // Always update results with complete information
      syncResults.citationVerification = {
        totalCitations,
        verifiedCitations: allVerifiedCitations,
        unverifiedCitations: stillUnverified,
        verificationScore: totalCitations > 0 ? verifiedCount / totalCitations : 1.0,
        evidence: stillUnverified.length > 0 ? {
          citationText: stillUnverified[0],
          verificationAttempted: true,
          databasesChecked: ['local_seed_data', 'courtlistener'],
          failureReason: 'not_found',
          documentContext: content.slice(0, 200),
          proposedUsage: 'primary_authority',
          verificationTimestamp: Date.now(),
        } : undefined,
      };

      // Update fabrication flags if citations were verified
      if (
        syncResults.fabricationCheck &&
        newlyVerifiedCitations.length > 0
      ) {
        syncResults.fabricationCheck.flaggedContent =
          syncResults.fabricationCheck.flaggedContent.filter(
            f => !newlyVerifiedCitations.includes(f.fabricatedContent)
          );

        // Recalculate overall score
        if (syncResults.fabricationCheck.flaggedContent.length === 0) {
          syncResults.fabricationCheck.overallScore = estimateSemanticEntropy(content);
        }
      }
    }

    return syncResults;
  }

  /**
   * Get CourtListener database statistics.
   */
  getCourtListenerStats(): Record<string, unknown> | null {
    return this.courtListenerDb?.getDetailedStats() ?? null;
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<LegalPreFlightConfig>): void {
    this.config = { ...this.config, ...config };

    if (this.config.enableCourtListenerVerification && !this.courtListenerDb) {
      this.courtListenerDb = createCourtListenerDatabase({
        apiToken: this.config.courtListenerApiToken,
      });
    } else if (!this.config.enableCourtListenerVerification) {
      this.courtListenerDb = null;
    }
  }

  /**
   * Get configuration.
   */
  getConfig(): LegalPreFlightConfig {
    return { ...this.config };
  }
}

// =============================================================================
// FACTORY AND SINGLETON
// =============================================================================

/**
 * Create a legal pre-flight evaluator.
 */
export function createLegalPreFlight(
  config?: Partial<LegalPreFlightConfig>
): LegalPreFlightEvaluator {
  return new LegalPreFlightEvaluator(config);
}

/**
 * Default singleton instance.
 */
export const legalPreFlight = createLegalPreFlight();
