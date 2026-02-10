// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK GOVERNANCE MODULE
// ═══════════════════════════════════════════════════════════════════════════
// Adaptive governance — absorbed from AETHER.
// Provides: modulation math, autonomy controller, immutable safety floor.
// ═══════════════════════════════════════════════════════════════════════════

export {
  computeModeFactor,
  computeUncertaintyFactor,
  computeCalibrationFactor,
  computeModulation,
  computeEffectiveThresholds,
  makeGateDecision,
} from './modulation.js';

export type { ThresholdComputeOptions } from './modulation.js';

export {
  createInitialTrustState,
  processCalibrationWindow,
  summarizeTrustState,
  isActionPermitted,
} from './autonomy-controller.js';

export {
  checkImmutableConstraints,
  containsSensitiveData,
} from './immutable.js';

export {
  BASE_THRESHOLDS,
  COEFFICIENTS,
  CLAMP_BOUNDS,
  VOCAB_NORMALIZATION,
  GATE_DIRECTION,
  computeVocabAwareMinFloor,
} from './governance.config.js';

export type {
  GovernanceMode,
  GovernanceModulation,
  EffectiveThresholds,
  GateDecision,
  UncertaintyDecomposition,
  DecompositionMethod,
  CalibrationMetrics,
  CalibrationBucket,
  AutonomyLevel,
  TrustState,
  TrustTransition,
  ImmutableCheckResult,
  ImmutableConstraints,
} from './types.js';

export {
  GOVERNANCE_MODES,
  AUTONOMY_RANK,
  ASCENT_REQUIREMENTS,
  IMMUTABLE_CONSTRAINTS,
} from './types.js';
