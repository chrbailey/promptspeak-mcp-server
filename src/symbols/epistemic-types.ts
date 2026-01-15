/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK EPISTEMIC UNCERTAINTY TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for handling epistemic uncertainty in probabilistic outputs.
 *
 * The Core Problem:
 * LLMs produce probability distributions collapsed into confident-sounding text.
 * Humans interpret this text as deterministic truth. This module provides the
 * type system to externalize and track uncertainty.
 *
 * Design Philosophy:
 * 1. Claims are INFERENCE until proven otherwise
 * 2. High-stakes claims (accusations, diagnoses) require evidence
 * 3. Alternative explanations must be documented
 * 4. Uncertainty must be visible, not hidden
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EPISTEMIC STATUS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Epistemic status represents the verification level of a claim.
 * This is the fundamental unit of uncertainty tracking.
 *
 * Status Hierarchy (lowest to highest certainty):
 * HYPOTHESIS → INFERENCE → OBSERVATION → CORROBORATED → VERIFIED → AXIOMATIC
 */
export type EpistemicStatus =
  | 'HYPOTHESIS'    // Untested idea, speculation
  | 'INFERENCE'     // Derived from data, not independently verified
  | 'OBSERVATION'   // Direct observation from a single source
  | 'CORROBORATED'  // Multiple independent sources agree
  | 'VERIFIED'      // Human expert has confirmed
  | 'AXIOMATIC';    // Definitionally true (e.g., "water is H2O")

/**
 * Priority ordering for epistemic status.
 * Higher number = higher certainty.
 */
export const EPISTEMIC_STATUS_PRIORITY: Record<EpistemicStatus, number> = {
  HYPOTHESIS: 1,
  INFERENCE: 2,
  OBSERVATION: 3,
  CORROBORATED: 4,
  VERIFIED: 5,
  AXIOMATIC: 6,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Claim type determines evidence requirements and default confidence levels.
 *
 * Some claims are inherently riskier than others:
 * - ACCUSATORY claims can harm reputations and trigger legal action
 * - DIAGNOSTIC claims can lead to costly interventions
 * - PREDICTIVE claims guide resource allocation
 */
export type ClaimType =
  | 'FACTUAL'       // Verifiable fact (company founded in 2015)
  | 'STATISTICAL'   // Data-derived metric (37% of revenue from X)
  | 'CAUSAL'        // Cause-effect assertion (X caused Y)
  | 'PREDICTIVE'    // Future state prediction (revenue will grow)
  | 'ACCUSATORY'    // Implies wrongdoing (fraud, violation, scheme)
  | 'DIAGNOSTIC'    // Problem identification (system failure, bug)
  | 'PRESCRIPTIVE'; // Recommendation (should do X)

/**
 * Evidence requirements by claim type.
 * ACCUSATORY claims require the most rigorous evidence.
 */
export const CLAIM_TYPE_REQUIREMENTS: Record<ClaimType, {
  requires_cross_reference: boolean;
  requires_alternative_explanations: boolean;
  max_confidence_without_verification: number;
  requires_human_review_by_default: boolean;
}> = {
  FACTUAL: {
    requires_cross_reference: false,
    requires_alternative_explanations: false,
    max_confidence_without_verification: 0.8,
    requires_human_review_by_default: false,
  },
  STATISTICAL: {
    requires_cross_reference: true,
    requires_alternative_explanations: false,
    max_confidence_without_verification: 0.7,
    requires_human_review_by_default: false,
  },
  CAUSAL: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.5,
    requires_human_review_by_default: true,
  },
  PREDICTIVE: {
    requires_cross_reference: false,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.6,
    requires_human_review_by_default: false,
  },
  ACCUSATORY: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.3, // Very low - accusations need proof
    requires_human_review_by_default: true,
  },
  DIAGNOSTIC: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.5,
    requires_human_review_by_default: true,
  },
  PRESCRIPTIVE: {
    requires_cross_reference: false,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.6,
    requires_human_review_by_default: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE BASIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evidence basis documents what data was (and wasn't) consulted.
 * This is crucial for understanding the completeness of analysis.
 */
export interface EvidenceBasis {
  /**
   * Data sources that WERE consulted in reaching this conclusion.
   * @example ["Transactions.csv", "vendor-api-response"]
   */
  sources_consulted: string[];

  /**
   * Data sources that SHOULD have been consulted but weren't.
   * This is populated by the claim validator when it detects gaps.
   * @example ["Vendors.csv", "employee-master"]
   */
  sources_not_consulted: string[];

  /**
   * Whether multiple data sources were joined/cross-referenced.
   * If false for ACCUSATORY claims, confidence is reduced.
   */
  cross_references_performed: boolean;

  /**
   * Alternative explanations that were considered.
   * For pattern-based findings, there are often benign explanations.
   * @example ["Fixed monthly rent payment", "Insurance premium financing"]
   */
  alternative_explanations: AlternativeExplanation[];

  /**
   * Description of the methodology used to reach conclusion.
   * @example "Statistical analysis of payment frequency distribution"
   */
  methodology: string;

  /**
   * When the evidence was gathered (ISO 8601).
   */
  evidence_gathered_at?: string;

  /**
   * How stale the evidence might be.
   */
  evidence_valid_until?: string;
}

/**
 * An alternative explanation with assessed likelihood.
 */
export interface AlternativeExplanation {
  /**
   * Description of the alternative explanation.
   */
  explanation: string;

  /**
   * Estimated likelihood of this explanation being correct (0-1).
   */
  likelihood: number;

  /**
   * Why this explanation was considered or ruled out.
   */
  reasoning?: string;

  /**
   * Whether this alternative was actually investigated.
   */
  investigated: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of verification events that can occur on a symbol.
 */
export type VerificationEventType =
  | 'CREATED'           // Symbol was created
  | 'AUTO_FLAGGED'      // System automatically flagged for review
  | 'HUMAN_REVIEWED'    // Human reviewed the claim
  | 'VERIFIED'          // Human verified as accurate
  | 'DISPUTED'          // Human disputed the claim
  | 'CORROBORATED'      // Additional evidence added
  | 'EVIDENCE_ADDED'    // New evidence without status change
  | 'ALTERNATIVE_ADDED' // New alternative explanation added
  | 'CONFIDENCE_UPDATED'; // Confidence level changed

/**
 * A verification event in the symbol's history.
 */
export interface VerificationEvent {
  /**
   * Type of verification event.
   */
  event_type: VerificationEventType;

  /**
   * When the event occurred (ISO 8601).
   */
  timestamp: string;

  /**
   * Epistemic status before the event.
   */
  old_status?: EpistemicStatus;

  /**
   * Epistemic status after the event.
   */
  new_status?: EpistemicStatus;

  /**
   * Confidence level before the event.
   */
  old_confidence?: number;

  /**
   * Confidence level after the event.
   */
  new_confidence?: number;

  /**
   * Who performed the verification (human ID or "system").
   */
  reviewer: string;

  /**
   * Evidence that was added in this event.
   */
  evidence_added?: string[];

  /**
   * Notes about the verification.
   */
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EPISTEMIC METADATA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full epistemic metadata for a symbol.
 * This is the complete uncertainty profile.
 */
export interface EpistemicMetadata {
  /**
   * Current epistemic status of the claim.
   * Defaults to INFERENCE for LLM-generated content.
   */
  status: EpistemicStatus;

  /**
   * Type of claim being made.
   * Determines evidence requirements.
   */
  claim_type: ClaimType;

  /**
   * Confidence level (0.0 to 1.0).
   * This may be capped by the system based on claim type and evidence.
   */
  confidence: number;

  /**
   * Evidence basis for the claim.
   */
  evidence_basis: EvidenceBasis;

  /**
   * Whether this symbol requires human review.
   * Set automatically for ACCUSATORY claims without evidence.
   */
  requires_human_review: boolean;

  /**
   * Why human review is required.
   */
  review_reason?: string;

  /**
   * Complete verification history.
   */
  verification_history: VerificationEvent[];

  /**
   * Whether this content was generated by an LLM.
   */
  was_llm_generated: boolean;

  /**
   * Raw uncertainty expressions from the LLM (if any).
   * @example "I think this might be...", "It appears that..."
   */
  llm_expressed_uncertainty?: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // Advanced Uncertainty Metrics
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Semantic entropy - measure of ambiguity in the claim.
   * Higher values indicate more uncertainty.
   */
  semantic_entropy?: number;

  /**
   * Contradiction score - conflicts with other symbols (0-1).
   * Higher values indicate this claim contradicts existing knowledge.
   */
  contradiction_score?: number;

  /**
   * Staleness risk - likelihood the information is outdated (0-1).
   */
  staleness_risk?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAIM VALIDATION RESULT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of validating a claim's epistemic status.
 */
export interface ClaimValidationResult {
  /**
   * Whether the claim passed epistemic validation.
   * Note: Failing validation doesn't block creation, it flags for review.
   */
  passed: boolean;

  /**
   * Detected claim type.
   */
  detected_claim_type: ClaimType;

  /**
   * Patterns that triggered detection.
   */
  triggered_patterns: string[];

  /**
   * Whether the claim has unverified accusations.
   */
  has_unverified_accusations: boolean;

  /**
   * Whether alternative explanations are missing.
   */
  missing_alternative_explanations: boolean;

  /**
   * Whether cross-referencing was required but not performed.
   */
  missing_cross_reference: boolean;

  /**
   * Recommended confidence level after validation.
   */
  recommended_confidence: number;

  /**
   * Whether human review is recommended.
   */
  requires_human_review: boolean;

  /**
   * Explanation of validation result.
   */
  reason: string;

  /**
   * Suggested sources to consult.
   */
  suggested_sources?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create default epistemic metadata for LLM-generated content.
 * Defaults to low confidence and requires review for anything non-trivial.
 */
export function createDefaultEpistemicMetadata(
  claimType: ClaimType = 'FACTUAL'
): EpistemicMetadata {
  const requirements = CLAIM_TYPE_REQUIREMENTS[claimType];

  return {
    status: 'INFERENCE',
    claim_type: claimType,
    confidence: requirements.max_confidence_without_verification,
    evidence_basis: {
      sources_consulted: [],
      sources_not_consulted: [],
      cross_references_performed: false,
      alternative_explanations: [],
      methodology: 'LLM inference',
    },
    requires_human_review: requirements.requires_human_review_by_default,
    review_reason: requirements.requires_human_review_by_default
      ? `${claimType} claims require human verification`
      : undefined,
    verification_history: [
      {
        event_type: 'CREATED',
        timestamp: new Date().toISOString(),
        new_status: 'INFERENCE',
        new_confidence: requirements.max_confidence_without_verification,
        reviewer: 'system',
        notes: 'Auto-generated from LLM output',
      },
    ],
    was_llm_generated: true,
  };
}

/**
 * Create epistemic metadata for ACCUSATORY claims.
 * These have the strictest requirements.
 */
export function createAccusatoryEpistemicMetadata(): EpistemicMetadata {
  return {
    ...createDefaultEpistemicMetadata('ACCUSATORY'),
    confidence: 0.3, // Low confidence by default
    requires_human_review: true,
    review_reason: 'Accusatory claims require human verification before action',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE ADJUSTMENT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adjust confidence based on evidence gaps.
 *
 * @param baseConfidence - Starting confidence level
 * @param claimType - Type of claim being made
 * @param hasEvidence - Evidence completeness indicators
 * @returns Adjusted confidence level
 */
export function adjustConfidenceForEvidence(
  baseConfidence: number,
  claimType: ClaimType,
  hasEvidence: {
    crossReferenced: boolean;
    hasAlternatives: boolean;
    sourceCount: number;
  }
): number {
  const requirements = CLAIM_TYPE_REQUIREMENTS[claimType];
  let adjusted = baseConfidence;

  // Cap at maximum allowed for unverified claims of this type
  adjusted = Math.min(adjusted, requirements.max_confidence_without_verification);

  // Reduce for missing cross-reference
  if (requirements.requires_cross_reference && !hasEvidence.crossReferenced) {
    adjusted *= 0.6;
  }

  // Reduce for missing alternatives
  if (requirements.requires_alternative_explanations && !hasEvidence.hasAlternatives) {
    adjusted *= 0.7;
  }

  // Boost slightly for multiple sources
  if (hasEvidence.sourceCount > 1) {
    adjusted = Math.min(adjusted * 1.1, requirements.max_confidence_without_verification);
  }

  return Math.round(adjusted * 100) / 100; // Round to 2 decimal places
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export const epistemicDefaults = {
  createDefaultEpistemicMetadata,
  createAccusatoryEpistemicMetadata,
  adjustConfidenceForEvidence,
};
