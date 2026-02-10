// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK GOVERNANCE TYPES
// ═══════════════════════════════════════════════════════════════════════════
// Types for adaptive governance modulation.
// Ported from AETHER — the core formal contribution:
//   effective_threshold = base × mode_factor × uncertainty_factor × calibration_factor
//
// Key insight: Aleatoric uncertainty (irreducible) should NOT tighten
// governance. Epistemic uncertainty (reducible) SHOULD tighten governance.
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// GOVERNANCE MODE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Symbolic governance mode — maps to PromptSpeak frame modes.
 * Each mode has a strictness level (0-3) that affects
 * the mode_factor in threshold computation.
 */
export interface GovernanceMode {
  /** Mode name matching PromptSpeak conventions */
  name: 'strict' | 'standard' | 'flexible' | 'forbidden';
  /** Strictness level: 0=flexible, 1=standard, 2=strict, 3=forbidden */
  strictness: 0 | 1 | 2 | 3;
  /** PromptSpeak symbol (e.g., "⊕" for strict) */
  symbol: string;
}

/** Pre-defined governance modes */
export const GOVERNANCE_MODES: Record<string, GovernanceMode> = {
  forbidden: { name: 'forbidden', strictness: 3, symbol: '⊗' },
  strict:    { name: 'strict',    strictness: 2, symbol: '⊕' },
  standard:  { name: 'standard',  strictness: 1, symbol: '◈' },
  flexible:  { name: 'flexible',  strictness: 0, symbol: '◇' },
};

// ─────────────────────────────────────────────────────────────────────────
// UNCERTAINTY DECOMPOSITION
// ─────────────────────────────────────────────────────────────────────────

/** Uncertainty decomposed into epistemic and aleatoric components */
export interface UncertaintyDecomposition {
  /** Total uncertainty (entropy or variance) */
  total: number;
  /** Epistemic uncertainty — reducible with more data/evidence */
  epistemic: number;
  /** Aleatoric uncertainty — irreducible randomness */
  aleatoric: number;
  /** Ratio of epistemic to total — drives governance tightening */
  epistemicRatio: number;
  /** Method used for decomposition */
  method: DecompositionMethod;
}

export type DecompositionMethod =
  | 'ensemble_variance'
  | 'mc_dropout'
  | 'evidential'
  | 'verity_ds'
  | 'manual';

// ─────────────────────────────────────────────────────────────────────────
// CALIBRATION
// ─────────────────────────────────────────────────────────────────────────

/** Calibration metrics for a window of predictions/decisions */
export interface CalibrationMetrics {
  /** Expected Calibration Error — primary metric */
  ece: number;
  /** Maximum Calibration Error — worst bucket */
  mce: number;
  /** Brier score — combines calibration + resolution */
  brierScore: number;
  /** Number of predictions in this window */
  windowSize: number;
  /** Start and end timestamps of the window */
  windowStart: string;
  windowEnd: string;
  /** Per-bucket calibration (for reliability diagrams) */
  buckets: CalibrationBucket[];
}

export interface CalibrationBucket {
  confidenceLow: number;
  confidenceHigh: number;
  avgConfidence: number;
  avgAccuracy: number;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────
// AUTONOMY LEVELS
// ─────────────────────────────────────────────────────────────────────────

/** Four levels of autonomy, each granting progressively more freedom */
export type AutonomyLevel = 'supervised' | 'guided' | 'collaborative' | 'autonomous';

/** Numeric ordering for comparison */
export const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  supervised: 0,
  guided: 1,
  collaborative: 2,
  autonomous: 3,
};

/** Ascent requirements — consecutive calibrated windows to advance */
export const ASCENT_REQUIREMENTS: Record<AutonomyLevel, number> = {
  supervised: 0,
  guided: 10,
  collaborative: 20,
  autonomous: 50,
};

// ─────────────────────────────────────────────────────────────────────────
// GOVERNANCE MODULATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * The compositional governance modulation — THE NOVEL PIECE.
 * effective_threshold = base × mode_factor × uncertainty_factor × calibration_factor
 */
export interface GovernanceModulation {
  baseThreshold: number;
  modeFactor: number;
  uncertaintyFactor: number;
  calibrationFactor: number;
  effectiveThreshold: number;
  mode: GovernanceMode;
  uncertainty: UncertaintyDecomposition;
  autonomyLevel: AutonomyLevel;
}

/** Effective thresholds for all configurable gates */
export interface EffectiveThresholds {
  driftThreshold: number;
  reviewGateAutoPass: number;
  threatActivation: number;
  conformanceDeviation: number;
  sayDoGap: number;
  knowledgePromotion: number;
  modulations: Record<string, GovernanceModulation>;
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// GATE DECISIONS
// ─────────────────────────────────────────────────────────────────────────

/** Gate decision — output of the governance layer */
export interface GateDecision {
  action: 'allow' | 'hold' | 'block';
  reason: string;
  immutableTriggered: boolean;
  threshold: number;
  observedValue: number;
  modulation: GovernanceModulation;
  auditId: string;
}

// ─────────────────────────────────────────────────────────────────────────
// IMMUTABLE CONSTRAINTS
// ─────────────────────────────────────────────────────────────────────────

export interface ImmutableConstraints {
  forbiddenModeBlocks: true;
  sensitiveDataHold: true;
  dsConflictThreshold: 0.7;
  circuitBreakerFloor: 3;
  maxUncertaintyForAutoPass: 0.95;
}

/** Hardcoded immutable constraints — never changes */
export const IMMUTABLE_CONSTRAINTS: ImmutableConstraints = {
  forbiddenModeBlocks: true,
  sensitiveDataHold: true,
  dsConflictThreshold: 0.7,
  circuitBreakerFloor: 3,
  maxUncertaintyForAutoPass: 0.95,
};

// ─────────────────────────────────────────────────────────────────────────
// TRUST STATE
// ─────────────────────────────────────────────────────────────────────────

/** Trust level transition event */
export interface TrustTransition {
  from: AutonomyLevel;
  to: AutonomyLevel;
  direction: 'ascent' | 'descent';
  trigger: string;
  calibrationAtTransition: number;
  timestamp: string;
}

/** Full trust state of the autonomy controller */
export interface TrustState {
  level: AutonomyLevel;
  consecutiveCalibratedWindows: number;
  consecutiveDegradedWindows: number;
  totalPredictions: number;
  correctPredictions: number;
  levelEnteredAt: string;
  transitions: TrustTransition[];
  calibrationThreshold: number;
  probationary: boolean;
}

/** Immutable check result */
export interface ImmutableCheckResult {
  passed: boolean;
  violatedConstraint: string | null;
  reason: string;
  severity: 'critical';
}
