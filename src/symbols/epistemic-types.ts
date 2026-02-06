/**
 * Epistemic Types for Uncertainty Tracking
 *
 * Inlined from @cbailey/types-shared/epistemic to remove external dependency.
 * Only the types and functions actually used by the symbols module are included.
 */

// =============================================================================
// EPISTEMIC STATUS
// =============================================================================

export enum EpistemicStatus {
  HYPOTHESIS = 'HYPOTHESIS',
  SUPPORTED = 'SUPPORTED',
  CORROBORATED = 'CORROBORATED',
  VERIFIED = 'VERIFIED',
  ESTABLISHED = 'ESTABLISHED',
}

// =============================================================================
// CLAIM TYPES
// =============================================================================

export enum ClaimType {
  FACTUAL = 'FACTUAL',
  ACCUSATORY = 'ACCUSATORY',
  DIAGNOSTIC = 'DIAGNOSTIC',
  PREDICTIVE = 'PREDICTIVE',
  CAUSAL = 'CAUSAL',
  NORMATIVE = 'NORMATIVE',
}

export interface ClaimTypeRequirements {
  requires_cross_reference: boolean;
  requires_alternative_explanations: boolean;
  max_confidence_without_verification: number;
  requires_human_review_by_default: boolean;
}

export const CLAIM_TYPE_REQUIREMENTS: Record<ClaimType, ClaimTypeRequirements> = {
  [ClaimType.FACTUAL]: {
    requires_cross_reference: false,
    requires_alternative_explanations: false,
    max_confidence_without_verification: 0.8,
    requires_human_review_by_default: false,
  },
  [ClaimType.ACCUSATORY]: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.3,
    requires_human_review_by_default: true,
  },
  [ClaimType.DIAGNOSTIC]: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.5,
    requires_human_review_by_default: true,
  },
  [ClaimType.PREDICTIVE]: {
    requires_cross_reference: false,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.6,
    requires_human_review_by_default: false,
  },
  [ClaimType.CAUSAL]: {
    requires_cross_reference: true,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.5,
    requires_human_review_by_default: true,
  },
  [ClaimType.NORMATIVE]: {
    requires_cross_reference: false,
    requires_alternative_explanations: true,
    max_confidence_without_verification: 0.6,
    requires_human_review_by_default: false,
  },
};

// =============================================================================
// EVIDENCE BASIS
// =============================================================================

export interface AlternativeExplanation {
  explanation: string;
  likelihood: number;
  reasoning?: string;
  investigated: boolean;
}

export interface EvidenceBasis {
  sources_consulted: string[];
  sources_not_consulted: string[];
  cross_references_performed: boolean;
  alternative_explanations: AlternativeExplanation[];
  methodology: string;
  evidence_gathered_at?: string;
  evidence_valid_until?: string;
}

// =============================================================================
// VERIFICATION EVENTS
// =============================================================================

export type VerificationEventType =
  | 'CREATED'
  | 'AUTO_FLAGGED'
  | 'HUMAN_REVIEWED'
  | 'VERIFIED'
  | 'DISPUTED'
  | 'CORROBORATED'
  | 'EVIDENCE_ADDED'
  | 'ALTERNATIVE_ADDED'
  | 'CONFIDENCE_UPDATED';

export interface VerificationEvent {
  event_type: VerificationEventType;
  timestamp: string;
  old_status?: EpistemicStatus;
  new_status?: EpistemicStatus;
  old_confidence?: number;
  new_confidence?: number;
  reviewer: string;
  evidence_added?: string[];
  notes?: string;
}

// =============================================================================
// EPISTEMIC METADATA
// =============================================================================

export interface EpistemicMetadata {
  status: EpistemicStatus;
  claim_type: ClaimType;
  confidence: number;
  evidence_basis: EvidenceBasis;
  requires_human_review: boolean;
  review_reason?: string;
  verification_history: VerificationEvent[];
  was_llm_generated: boolean;
  llm_expressed_uncertainty?: string;
  semantic_entropy?: number;
  contradiction_score?: number;
  staleness_risk?: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function createDefaultEpistemicMetadata(
  claimType: ClaimType = ClaimType.FACTUAL
): EpistemicMetadata {
  const requirements = CLAIM_TYPE_REQUIREMENTS[claimType];

  return {
    status: EpistemicStatus.HYPOTHESIS,
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
        new_status: EpistemicStatus.HYPOTHESIS,
        new_confidence: requirements.max_confidence_without_verification,
        reviewer: 'system',
        notes: 'Auto-generated from LLM output',
      },
    ],
    was_llm_generated: true,
  };
}
