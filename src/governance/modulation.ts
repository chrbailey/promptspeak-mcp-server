// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK GOVERNANCE MODULATION
// ═══════════════════════════════════════════════════════════════════════════
// Composes symbolic governance modes with continuous uncertainty
// to produce effective thresholds for all gate decisions.
//
// Ported from AETHER — the core formal contribution:
//   effective_threshold = base × mode_factor × uncertainty_factor × calibration_factor
//
// Key insight: Aleatoric uncertainty (irreducible randomness) should NOT
// tighten governance — more human review won't reduce it. Epistemic
// uncertainty (reducible with more data) SHOULD tighten governance —
// human review or additional evidence genuinely helps.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  GovernanceMode,
  GovernanceModulation,
  EffectiveThresholds,
  GateDecision,
  UncertaintyDecomposition,
  CalibrationMetrics,
  AutonomyLevel,
} from './types.js';
import { IMMUTABLE_CONSTRAINTS } from './types.js';
import {
  BASE_THRESHOLDS,
  COEFFICIENTS,
  CLAMP_BOUNDS,
  computeVocabAwareMinFloor,
} from './governance.config.js';

/**
 * Compute the mode factor from a symbolic governance mode.
 *
 * - forbidden (s=3) → 1.3 (maximum tightening)
 * - strict (s=2)    → 1.2 (strong tightening)
 * - standard (s=1)  → 1.1 (slight tightening)
 * - flexible (s=0)  → 1.0 (no tightening — baseline)
 */
export function computeModeFactor(mode: GovernanceMode): number {
  return 1 + (mode.strictness / 3) * COEFFICIENTS.modeStrength;
}

/**
 * Compute the uncertainty factor from decomposed uncertainty.
 *
 * Bidirectional around a baseline epistemic ratio:
 *   uncertainty_factor = 1 + (epistemic_ratio − baseline) × uncertaintyStrength
 *
 * Returns > 1.0 when epistemic ratio exceeds baseline (tighten).
 * Returns < 1.0 when epistemic ratio is below baseline (relax).
 * Returns = 1.0 at the baseline (neutral).
 */
export function computeUncertaintyFactor(
  uncertainty: UncertaintyDecomposition,
): number {
  const deviation = uncertainty.epistemicRatio - COEFFICIENTS.baselineEpistemicRatio;
  return 1 + deviation * COEFFICIENTS.uncertaintyStrength;
}

/**
 * Compute the calibration factor from recent calibration metrics.
 *
 * Bidirectional around a target ECE:
 *   calibration_factor = 1 + (ece − target_ece) × calibrationStrength
 *
 * Poor calibration (ECE > target) → factor > 1 → tighter governance.
 * Good calibration (ECE < target) → factor < 1 → earned relaxation.
 */
export function computeCalibrationFactor(
  calibration: CalibrationMetrics,
): number {
  const ece = Math.min(calibration.ece, 1.0);
  return 1 + (ece - COEFFICIENTS.targetECE) * COEFFICIENTS.calibrationStrength;
}

/**
 * Compute the full governance modulation for a single threshold.
 *
 * NOTE: autonomyLevel is stored in the result but intentionally does NOT
 * affect threshold computation. Autonomy level governs authorization
 * (isActionPermitted) not threshold values. This is a deliberate design
 * choice — thresholds adapt to what the model knows (uncertainty) and
 * how well-calibrated it is, while autonomy gates what actions are
 * allowed at all. These are orthogonal concerns.
 */
export function computeModulation(
  baseThreshold: number,
  mode: GovernanceMode,
  uncertainty: UncertaintyDecomposition,
  calibration: CalibrationMetrics,
  autonomyLevel: AutonomyLevel,
): GovernanceModulation {
  const modeFactor = computeModeFactor(mode);
  const uncertaintyFactor = computeUncertaintyFactor(uncertainty);
  const calibrationFactor = computeCalibrationFactor(calibration);

  const effectiveThreshold = baseThreshold * modeFactor * uncertaintyFactor * calibrationFactor;

  return {
    baseThreshold,
    modeFactor,
    uncertaintyFactor,
    calibrationFactor,
    effectiveThreshold,
    mode,
    uncertainty,
    autonomyLevel,
  };
}

/** Options for computing effective thresholds */
export interface ThresholdComputeOptions {
  vocabSize?: number;
}

/**
 * Compute effective thresholds for ALL configurable gates.
 *
 * Main entry point — takes the current system state
 * and produces adaptive thresholds for every gate.
 */
export function computeEffectiveThresholds(
  mode: GovernanceMode,
  uncertainty: UncertaintyDecomposition,
  calibration: CalibrationMetrics,
  autonomyLevel: AutonomyLevel,
  options: ThresholdComputeOptions = {},
): EffectiveThresholds {
  const modulations: Record<string, GovernanceModulation> = {};

  for (const key of Object.keys(BASE_THRESHOLDS) as Array<keyof typeof BASE_THRESHOLDS>) {
    modulations[key] = computeModulation(
      BASE_THRESHOLDS[key],
      mode,
      uncertainty,
      calibration,
      autonomyLevel,
    );
  }

  // Guard: factors are bidirectional (can go below 1.0) but combined product
  // must never reach zero or negative — that would cause division-by-zero in
  // lower-is-stricter gates → Infinity → clamp to max → governance bypass.
  const MINIMUM_COMBINED_FACTOR = 0.1;
  const tighteningFactor = (m: GovernanceModulation) =>
    Math.max(MINIMUM_COMBINED_FACTOR, m.modeFactor * m.uncertaintyFactor * m.calibrationFactor);

  // Lower-is-stricter: tightening divides
  const driftThreshold = clamp(
    BASE_THRESHOLDS.driftThreshold / tighteningFactor(modulations['driftThreshold']),
    CLAMP_BOUNDS.driftThreshold.min,
    CLAMP_BOUNDS.driftThreshold.max,
  );

  const conformanceDeviation = clamp(
    BASE_THRESHOLDS.conformanceDeviation / tighteningFactor(modulations['conformanceDeviation']),
    CLAMP_BOUNDS.conformanceDeviation.min,
    CLAMP_BOUNDS.conformanceDeviation.max,
  );

  const sayDoGap = clamp(
    BASE_THRESHOLDS.sayDoGap / tighteningFactor(modulations['sayDoGap']),
    CLAMP_BOUNDS.sayDoGap.min,
    CLAMP_BOUNDS.sayDoGap.max,
  );

  // Higher-is-stricter: tightening multiplies
  const reviewGateMinFloor = options.vocabSize
    ? computeVocabAwareMinFloor(options.vocabSize)
    : CLAMP_BOUNDS.reviewGateAutoPass.min;

  const reviewGateAutoPass = clamp(
    BASE_THRESHOLDS.reviewGateAutoPass * tighteningFactor(modulations['reviewGateAutoPass']),
    reviewGateMinFloor,
    CLAMP_BOUNDS.reviewGateAutoPass.max,
  );

  const threatActivation = clamp(
    BASE_THRESHOLDS.threatActivation * tighteningFactor(modulations['threatActivation']),
    CLAMP_BOUNDS.threatActivation.min,
    CLAMP_BOUNDS.threatActivation.max,
  );

  const knowledgePromotion = clamp(
    BASE_THRESHOLDS.knowledgePromotion * tighteningFactor(modulations['knowledgePromotion']),
    CLAMP_BOUNDS.knowledgePromotion.min,
    CLAMP_BOUNDS.knowledgePromotion.max,
  );

  // Update modulations with direction-corrected effective thresholds
  modulations['driftThreshold'].effectiveThreshold = driftThreshold;
  modulations['reviewGateAutoPass'].effectiveThreshold = reviewGateAutoPass;
  modulations['threatActivation'].effectiveThreshold = threatActivation;
  modulations['conformanceDeviation'].effectiveThreshold = conformanceDeviation;
  modulations['sayDoGap'].effectiveThreshold = sayDoGap;
  modulations['knowledgePromotion'].effectiveThreshold = knowledgePromotion;

  return {
    driftThreshold,
    reviewGateAutoPass,
    threatActivation,
    conformanceDeviation,
    sayDoGap,
    knowledgePromotion,
    modulations,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Make a gate decision by comparing an observed value against
 * the effective threshold, respecting immutable constraints.
 */
export function makeGateDecision(
  gateName: string,
  observedValue: number,
  modulation: GovernanceModulation,
  lowerIsStricter: boolean,
): GateDecision {
  const threshold = modulation.effectiveThreshold;

  // Check immutable constraints first
  if (modulation.mode.name === 'forbidden') {
    return {
      action: 'block',
      reason: `Forbidden mode active — immutable block on ${gateName}`,
      immutableTriggered: true,
      threshold,
      observedValue,
      modulation,
      auditId: generateAuditId(),
    };
  }

  if (modulation.uncertainty.total > IMMUTABLE_CONSTRAINTS.maxUncertaintyForAutoPass) {
    return {
      action: 'hold',
      reason: `Total uncertainty ${modulation.uncertainty.total.toFixed(3)} exceeds immutable max ${IMMUTABLE_CONSTRAINTS.maxUncertaintyForAutoPass}`,
      immutableTriggered: true,
      threshold,
      observedValue,
      modulation,
      auditId: generateAuditId(),
    };
  }

  // Direction-aware comparison
  const exceeds = lowerIsStricter
    ? observedValue > threshold
    : observedValue < threshold;

  if (exceeds) {
    return {
      action: 'hold',
      reason: `${gateName}: observed ${observedValue.toFixed(3)} ${lowerIsStricter ? '>' : '<'} threshold ${threshold.toFixed(3)} (base=${modulation.baseThreshold}, mode=${modulation.mode.name}, epistemic_ratio=${modulation.uncertainty.epistemicRatio.toFixed(2)})`,
      immutableTriggered: false,
      threshold,
      observedValue,
      modulation,
      auditId: generateAuditId(),
    };
  }

  return {
    action: 'allow',
    reason: `${gateName}: observed ${observedValue.toFixed(3)} within threshold ${threshold.toFixed(3)}`,
    immutableTriggered: false,
    threshold,
    observedValue,
    modulation,
    auditId: generateAuditId(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

let auditCounter = 0;
function generateAuditId(): string {
  auditCounter++;
  return `PS-GOV-${Date.now()}-${auditCounter.toString().padStart(6, '0')}`;
}
