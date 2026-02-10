// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK GOVERNANCE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// All tunable parameters for the governance modulation system.
// Ported from AETHER.
//
// The governance formula:
//   effective_threshold = base × mode_factor × uncertainty_factor × calibration_factor
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// Base Thresholds — the static values before modulation
// ─────────────────────────────────────────────────────────────────────────

export const BASE_THRESHOLDS = {
  /** PromptSpeak concept drift detection */
  driftThreshold: 0.15,
  /** Review gate auto-pass confidence */
  reviewGateAutoPass: 0.55,
  /** Threat activation threshold */
  threatActivation: 0.60,
  /** Process conformance deviation */
  conformanceDeviation: 0.05,
  /** Say-Do gap threshold */
  sayDoGap: 0.20,
  /** Knowledge promotion threshold */
  knowledgePromotion: 0.75,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Modulation Coefficients — sensitivity of each factor
// ─────────────────────────────────────────────────────────────────────────

export const COEFFICIENTS = {
  /** How much the governance mode affects thresholds (0 = mode ignored) */
  modeStrength: 0.3,
  /** How much epistemic uncertainty modulates governance (0 = uncertainty ignored) */
  uncertaintyStrength: 0.5,
  /** How much calibration quality modulates governance (0 = calibration ignored) */
  calibrationStrength: 0.4,
  /** ECE below this target relaxes governance; above tightens */
  targetECE: 0.05,
  /** Epistemic ratio baseline. Below → relax. Above → tighten. */
  baselineEpistemicRatio: 0.3,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Clamp Bounds — safety limits for each threshold
// ─────────────────────────────────────────────────────────────────────────

export const CLAMP_BOUNDS = {
  driftThreshold:       { min: 0.02, max: 0.30 },
  reviewGateAutoPass:   { min: 0.50, max: 0.99 },
  threatActivation:     { min: 0.40, max: 0.90 },
  conformanceDeviation: { min: 0.01, max: 0.15 },
  sayDoGap:             { min: 0.05, max: 0.40 },
  knowledgePromotion:   { min: 0.60, max: 0.95 },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Vocabulary-Aware Minimum Floor (v3)
// ─────────────────────────────────────────────────────────────────────────

export const VOCAB_NORMALIZATION = {
  baseFloor: 0.50,
  floorIncrement: 0.05,
  referenceVocab: 20,
  scaleFactor: 4,
  enabled: true,
} as const;

/**
 * Compute the vocabulary-aware minimum threshold floor for reviewGateAutoPass.
 */
export function computeVocabAwareMinFloor(vocabSize: number): number {
  if (!VOCAB_NORMALIZATION.enabled || vocabSize <= VOCAB_NORMALIZATION.referenceVocab) {
    return VOCAB_NORMALIZATION.baseFloor;
  }

  const logRatio = Math.log(vocabSize / VOCAB_NORMALIZATION.referenceVocab);
  const logScale = Math.log(VOCAB_NORMALIZATION.scaleFactor);
  const adjustment = VOCAB_NORMALIZATION.floorIncrement * (logRatio / logScale);

  return Math.min(
    VOCAB_NORMALIZATION.baseFloor + adjustment,
    CLAMP_BOUNDS.reviewGateAutoPass.max - 0.05,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Gate Direction — which way "tighter" goes
// ─────────────────────────────────────────────────────────────────────────

export const GATE_DIRECTION: Record<string, 'lower' | 'higher'> = {
  driftThreshold:       'lower',
  reviewGateAutoPass:   'higher',
  threatActivation:     'higher',
  conformanceDeviation: 'lower',
  sayDoGap:             'lower',
  knowledgePromotion:   'higher',
} as const;
