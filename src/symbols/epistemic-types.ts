/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK EPISTEMIC UNCERTAINTY TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Re-exports from @cbailey/types-shared/epistemic with local type aliases
 * for backwards compatibility.
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

// Re-export core types from shared package
export {
  // Enums (usable as both types and values)
  EpistemicStatus,
  ClaimType,
  // Constants
  EPISTEMIC_STATUS_PRIORITY,
  CLAIM_TYPE_REQUIREMENTS,
  // Interfaces
  type ClaimTypeRequirements,
  type AlternativeExplanation,
  type EvidenceBasis,
  type VerificationEventType,
  type VerificationEvent,
  type EpistemicMetadata,
  type ClaimValidationResult,
  // Functions
  createDefaultEpistemicMetadata,
  adjustConfidenceForEvidence,
} from '@cbailey/types-shared/epistemic';

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARDS COMPATIBILITY - Local extensions
// ═══════════════════════════════════════════════════════════════════════════════

import {
  createDefaultEpistemicMetadata as _createDefaultMetadata,
  adjustConfidenceForEvidence as _adjustConfidenceForEvidence,
  ClaimType,
} from '@cbailey/types-shared/epistemic';

/**
 * Create epistemic metadata for ACCUSATORY claims.
 * These have the strictest requirements.
 *
 * @deprecated Use createDefaultEpistemicMetadata(ClaimType.ACCUSATORY) instead
 */
export function createAccusatoryEpistemicMetadata() {
  const metadata = _createDefaultMetadata(ClaimType.ACCUSATORY);
  return {
    ...metadata,
    confidence: 0.3, // Low confidence by default
    requires_human_review: true,
    review_reason: 'Accusatory claims require human verification before action',
  };
}

/**
 * Convenience export for default functions.
 *
 * @deprecated Import functions directly instead
 */
export const epistemicDefaults = {
  createDefaultEpistemicMetadata: _createDefaultMetadata,
  createAccusatoryEpistemicMetadata,
  adjustConfidenceForEvidence: _adjustConfidenceForEvidence,
};
