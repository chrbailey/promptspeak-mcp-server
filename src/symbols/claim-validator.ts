/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK CLAIM VALIDATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Detects high-stakes claims and enforces evidence requirements.
 *
 * This module addresses the core problem with probabilistic outputs:
 * LLMs sound confident regardless of factual accuracy. This validator
 * detects patterns that indicate high-stakes claims (accusations, diagnoses,
 * predictions) and ensures appropriate epistemic metadata is set.
 *
 * Key Behaviors:
 * 1. Does NOT block creation - only flags and adjusts confidence
 * 2. Detects accusatory language (fraud, violation, suspicious)
 * 3. Detects overconfident language (impossible, certain, proven)
 * 4. Reduces confidence for claims lacking evidence
 * 5. Requires human review for high-stakes claims
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  ClaimType,
  CLAIM_TYPE_REQUIREMENTS,
  adjustConfidenceForEvidence,
  createDefaultEpistemicMetadata,
  type ClaimValidationResult,
  type EpistemicMetadata,
  type EvidenceBasis,
} from './epistemic-types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Patterns that indicate ACCUSATORY claims.
 * These require the highest level of evidence and scrutiny.
 */
const ACCUSATORY_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Direct fraud language
  { pattern: /\bfraud(ulent)?\b/i, description: 'fraud accusation' },
  { pattern: /\bembezzl(e|ed|ing|ement)\b/i, description: 'embezzlement accusation' },
  { pattern: /\bkickback(s)?\b/i, description: 'kickback accusation' },
  { pattern: /\bshell\s+compan(y|ies)\b/i, description: 'shell company accusation' },
  { pattern: /\bmoney\s+launder(ing)?\b/i, description: 'money laundering accusation' },
  { pattern: /\btax\s+evasion\b/i, description: 'tax evasion accusation' },
  { pattern: /\bskim(ming)?\b/i, description: 'skimming accusation' },

  // Legal violation language
  { pattern: /\bviolat(e|es|ed|ion|ions)\b/i, description: 'violation claim' },
  { pattern: /\billegal(ly)?\b/i, description: 'illegality claim' },
  { pattern: /\bunlawful(ly)?\b/i, description: 'unlawfulness claim' },
  { pattern: /\bcriminal(ly)?\b/i, description: 'criminal accusation' },
  { pattern: /\bfelony\b/i, description: 'felony accusation' },
  { pattern: /\bmisdemeanor\b/i, description: 'misdemeanor accusation' },

  // Suspicion language
  { pattern: /\bsuspicious(ly)?\b/i, description: 'suspicion indicator' },
  { pattern: /\banomal(y|ous|ies)\b/i, description: 'anomaly indicator' },
  { pattern: /\birregular(ity|ities)?\b/i, description: 'irregularity indicator' },
  { pattern: /\bred\s+flag(s)?\b/i, description: 'red flag indicator' },

  // Wrongdoing language
  { pattern: /\bwrongdoing\b/i, description: 'wrongdoing claim' },
  { pattern: /\bmisconduct\b/i, description: 'misconduct accusation' },
  { pattern: /\bmalfeasance\b/i, description: 'malfeasance accusation' },
  { pattern: /\bcollusion\b/i, description: 'collusion accusation' },
  { pattern: /\bconspiracy\b/i, description: 'conspiracy accusation' },
  { pattern: /\bcover[\s-]?up\b/i, description: 'cover-up accusation' },

  // Financial crime language
  { pattern: /\bbribe(ry|s)?\b/i, description: 'bribery accusation' },
  { pattern: /\bextortion\b/i, description: 'extortion accusation' },
  { pattern: /\bforgery\b/i, description: 'forgery accusation' },
  { pattern: /\bfalsif(y|ied|ication)\b/i, description: 'falsification accusation' },
];

/**
 * Patterns that indicate OVERCONFIDENT claims.
 * These should reduce confidence because they express certainty
 * that probabilistic systems cannot legitimately have.
 */
const OVERCONFIDENT_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Absolute certainty
  { pattern: /\b100\s*%/, description: '100% certainty claim' },
  { pattern: /\balways\b/i, description: 'always claim' },
  { pattern: /\bnever\b/i, description: 'never claim' },
  { pattern: /\bimpossible\b/i, description: 'impossibility claim' },
  { pattern: /\bcertain(ly)?\b/i, description: 'certainty claim' },
  { pattern: /\bdefinite(ly)?\b/i, description: 'definiteness claim' },
  { pattern: /\babsolute(ly)?\b/i, description: 'absoluteness claim' },
  { pattern: /\bundoubtedly\b/i, description: 'undoubted claim' },
  { pattern: /\bunquestionabl(e|y)\b/i, description: 'unquestionable claim' },

  // Proof language (statistical claims need careful handling)
  { pattern: /\bproven\b/i, description: 'proven claim' },
  { pattern: /\bproves?\b/i, description: 'proves claim' },
  { pattern: /\bguarantee[ds]?\b/i, description: 'guarantee claim' },
  { pattern: /\bstatistically\s+impossible\b/i, description: 'statistical impossibility' },

  // Evidence of finality
  { pattern: /\bno\s+doubt\b/i, description: 'no doubt claim' },
  { pattern: /\bwithout\s+(a\s+)?doubt\b/i, description: 'without doubt claim' },
  { pattern: /\bbeyond\s+(a\s+|any\s+)?doubt\b/i, description: 'beyond doubt claim' },
  { pattern: /\bconclusive(ly)?\b/i, description: 'conclusive claim' },
];

/**
 * Patterns that indicate CAUSAL claims.
 * Cause-effect relationships require evidence of mechanism.
 */
const CAUSAL_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bcaused?\s+(by|the)\b/i, description: 'causation claim' },
  { pattern: /\bresult(s|ed)?\s+(in|from)\b/i, description: 'result claim' },
  { pattern: /\bled\s+to\b/i, description: 'led to claim' },
  { pattern: /\btriggered?\b/i, description: 'trigger claim' },
  { pattern: /\bbecause\s+of\b/i, description: 'because of claim' },
  { pattern: /\bdue\s+to\b/i, description: 'due to claim' },
  { pattern: /\bas\s+a\s+result\b/i, description: 'as a result claim' },
  { pattern: /\bconsequen(ce|tly)\b/i, description: 'consequence claim' },
];

/**
 * Patterns that indicate DIAGNOSTIC claims.
 */
const DIAGNOSTIC_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bfailure\b/i, description: 'failure diagnosis' },
  { pattern: /\bbroken\b/i, description: 'broken diagnosis' },
  { pattern: /\bmalfunction(ing)?\b/i, description: 'malfunction diagnosis' },
  { pattern: /\bdefect(ive)?\b/i, description: 'defect diagnosis' },
  { pattern: /\bbug(s|gy)?\b/i, description: 'bug diagnosis' },
  { pattern: /(?<!margin of )(?<!standard )(?<!sampling )\berror(s)?\b/i, description: 'error diagnosis' },
  { pattern: /\bflaw(ed|s)?\b/i, description: 'flaw diagnosis' },
  { pattern: /\bvulnerabilit(y|ies)\b/i, description: 'vulnerability diagnosis' },
];

/**
 * Patterns that indicate PREDICTIVE claims.
 */
const PREDICTIVE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bwill\s+(be|have|increase|decrease|grow|fail)\b/i, description: 'future prediction' },
  { pattern: /\bgoing\s+to\b/i, description: 'going to prediction' },
  { pattern: /\bexpect(ed|s)?\s+to\b/i, description: 'expectation' },
  { pattern: /\bforecast\b/i, description: 'forecast' },
  { pattern: /\bproject(ed|ion)?\b/i, description: 'projection' },
  { pattern: /\bpredict(ed|ion)?\b/i, description: 'prediction' },
  { pattern: /\banticipate[ds]?\b/i, description: 'anticipation' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUGGESTED SOURCES BY CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Suggested data sources based on detected context.
 * When certain patterns are detected, we suggest relevant sources.
 */
const SUGGESTED_SOURCES: Array<{
  trigger: RegExp;
  sources: string[];
}> = [
  {
    trigger: /vendor|supplier|payment/i,
    sources: ['Vendors master file', 'Vendor contracts', 'Payment terms'],
  },
  {
    trigger: /customer|client|revenue/i,
    sources: ['Customer master file', 'Sales contracts', 'Revenue recognition'],
  },
  {
    trigger: /employee|staff|payroll/i,
    sources: ['Employee master file', 'HR records', 'Payroll data'],
  },
  {
    trigger: /invoice|bill|expense/i,
    sources: ['Invoice supporting documents', 'Purchase orders', 'Goods receipts'],
  },
  {
    trigger: /transaction|payment|amount/i,
    sources: ['Bank statements', 'GL detail', 'Reconciliation reports'],
  },
  {
    trigger: /identical|same|recurring|pattern/i,
    sources: ['Contract terms', 'Scheduled payments', 'Fixed commitments'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ClaimValidator detects high-stakes claims and enforces evidence requirements.
 */
export class ClaimValidator {
  /**
   * Validate text content for high-stakes claims.
   *
   * @param content - Text content to analyze
   * @param providedEvidence - Evidence basis provided by the creator
   * @returns Validation result with recommendations
   */
  validateContent(
    content: string,
    providedEvidence?: Partial<EvidenceBasis>
  ): ClaimValidationResult {
    const triggeredPatterns: string[] = [];
    let detectedClaimType: ClaimType = ClaimType.FACTUAL;
    let hasUnverifiedAccusations = false;
    let hasOverconfidentLanguage = false;

    // Normalize content for matching
    const normalizedContent = content.toLowerCase();

    // ─────────────────────────────────────────────────────────────────────────
    // Detect ACCUSATORY patterns (highest priority)
    // ─────────────────────────────────────────────────────────────────────────
    for (const { pattern, description } of ACCUSATORY_PATTERNS) {
      if (pattern.test(content)) {
        triggeredPatterns.push(description);
        detectedClaimType = ClaimType.ACCUSATORY;
        hasUnverifiedAccusations = true;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Detect OVERCONFIDENT patterns
    // ─────────────────────────────────────────────────────────────────────────
    for (const { pattern, description } of OVERCONFIDENT_PATTERNS) {
      if (pattern.test(content)) {
        triggeredPatterns.push(description);
        hasOverconfidentLanguage = true;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Detect other claim types (only if not already ACCUSATORY)
    // ─────────────────────────────────────────────────────────────────────────
    if (detectedClaimType !== ClaimType.ACCUSATORY) {
      // Check CAUSAL
      for (const { pattern, description } of CAUSAL_PATTERNS) {
        if (pattern.test(content)) {
          triggeredPatterns.push(description);
          detectedClaimType = ClaimType.CAUSAL;
          break;
        }
      }
    }

    if (detectedClaimType === ClaimType.FACTUAL) {
      // Check DIAGNOSTIC
      for (const { pattern, description } of DIAGNOSTIC_PATTERNS) {
        if (pattern.test(content)) {
          triggeredPatterns.push(description);
          detectedClaimType = ClaimType.DIAGNOSTIC;
          break;
        }
      }
    }

    if (detectedClaimType === ClaimType.FACTUAL) {
      // Check PREDICTIVE
      for (const { pattern, description } of PREDICTIVE_PATTERNS) {
        if (pattern.test(content)) {
          triggeredPatterns.push(description);
          detectedClaimType = ClaimType.PREDICTIVE;
          break;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Check evidence completeness
    // ─────────────────────────────────────────────────────────────────────────
    const requirements = CLAIM_TYPE_REQUIREMENTS[detectedClaimType];
    const evidence = providedEvidence || {};

    const missingCrossReference =
      requirements.requires_cross_reference &&
      !evidence.cross_references_performed;

    const missingAlternativeExplanations =
      requirements.requires_alternative_explanations &&
      (!evidence.alternative_explanations ||
        evidence.alternative_explanations.length === 0);

    // ─────────────────────────────────────────────────────────────────────────
    // Calculate recommended confidence
    // ─────────────────────────────────────────────────────────────────────────
    let recommendedConfidence = requirements.max_confidence_without_verification;

    // Reduce for missing cross-reference
    if (missingCrossReference) {
      recommendedConfidence *= 0.6;
    }

    // Reduce for missing alternatives
    if (missingAlternativeExplanations) {
      recommendedConfidence *= 0.7;
    }

    // Reduce for overconfident language
    if (hasOverconfidentLanguage) {
      recommendedConfidence *= 0.8;
    }

    // Floor at 0.1 - nothing is completely certain
    recommendedConfidence = Math.max(0.1, recommendedConfidence);

    // Round to 2 decimal places
    recommendedConfidence = Math.round(recommendedConfidence * 100) / 100;

    // ─────────────────────────────────────────────────────────────────────────
    // Determine if human review is required
    // ─────────────────────────────────────────────────────────────────────────
    const requiresHumanReview =
      requirements.requires_human_review_by_default ||
      hasUnverifiedAccusations ||
      (hasOverconfidentLanguage && missingCrossReference);

    // ─────────────────────────────────────────────────────────────────────────
    // Generate reason string
    // ─────────────────────────────────────────────────────────────────────────
    const reasons: string[] = [];

    if (hasUnverifiedAccusations) {
      reasons.push('Contains accusatory language without verified evidence');
    }
    if (hasOverconfidentLanguage) {
      reasons.push('Contains overconfident language');
    }
    if (missingCrossReference) {
      reasons.push('No cross-reference to supporting data sources');
    }
    if (missingAlternativeExplanations) {
      reasons.push('No alternative explanations provided');
    }

    const reason =
      reasons.length > 0
        ? reasons.join('; ')
        : 'Claim validated without issues';

    // ─────────────────────────────────────────────────────────────────────────
    // Suggest sources based on content
    // ─────────────────────────────────────────────────────────────────────────
    const suggestedSources: string[] = [];
    for (const { trigger, sources } of SUGGESTED_SOURCES) {
      if (trigger.test(content)) {
        for (const source of sources) {
          if (!suggestedSources.includes(source)) {
            suggestedSources.push(source);
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Return validation result
    // ─────────────────────────────────────────────────────────────────────────
    return {
      passed:
        !hasUnverifiedAccusations &&
        !missingCrossReference &&
        !missingAlternativeExplanations,
      detected_claim_type: detectedClaimType,
      triggered_patterns: triggeredPatterns,
      has_unverified_accusations: hasUnverifiedAccusations,
      missing_alternative_explanations: missingAlternativeExplanations,
      missing_cross_reference: missingCrossReference,
      recommended_confidence: recommendedConfidence,
      requires_human_review: requiresHumanReview,
      reason,
      suggested_sources: suggestedSources.length > 0 ? suggestedSources : undefined,
    };
  }

  /**
   * Validate a full symbol creation request.
   *
   * @param symbolData - All text fields from the symbol
   * @param providedEvidence - Evidence basis provided
   * @returns Combined validation result
   */
  validateSymbol(
    symbolData: {
      who?: string;
      what?: string;
      why?: string;
      where?: string;
      when?: string;
      commanders_intent?: string;
      requirements?: string[];
      tags?: string[];
    },
    providedEvidence?: Partial<EvidenceBasis>
  ): ClaimValidationResult {
    // Combine all text fields for analysis
    const allText = [
      symbolData.who,
      symbolData.what,
      symbolData.why,
      symbolData.where,
      symbolData.when,
      symbolData.commanders_intent,
      ...(symbolData.requirements || []),
      ...(symbolData.tags || []),
    ]
      .filter(Boolean)
      .join(' ');

    return this.validateContent(allText, providedEvidence);
  }

  /**
   * Generate epistemic metadata based on validation result.
   *
   * @param validationResult - Result from validateContent/validateSymbol
   * @param overrides - Optional overrides for specific fields
   * @returns Complete epistemic metadata
   */
  generateEpistemicMetadata(
    validationResult: ClaimValidationResult,
    overrides?: Partial<EpistemicMetadata>
  ): EpistemicMetadata {
    const base = createDefaultEpistemicMetadata(validationResult.detected_claim_type);

    return {
      ...base,
      confidence: validationResult.recommended_confidence,
      requires_human_review: validationResult.requires_human_review,
      review_reason: validationResult.requires_human_review
        ? validationResult.reason
        : undefined,
      evidence_basis: {
        ...base.evidence_basis,
        sources_not_consulted: validationResult.suggested_sources || [],
      },
      ...overrides,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let claimValidatorInstance: ClaimValidator | null = null;

/**
 * Get the singleton ClaimValidator instance.
 */
export function getClaimValidator(): ClaimValidator {
  if (!claimValidatorInstance) {
    claimValidatorInstance = new ClaimValidator();
  }
  return claimValidatorInstance;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ACCUSATORY_PATTERNS,
  OVERCONFIDENT_PATTERNS,
  CAUSAL_PATTERNS,
  DIAGNOSTIC_PATTERNS,
  PREDICTIVE_PATTERNS,
  SUGGESTED_SOURCES,
};
