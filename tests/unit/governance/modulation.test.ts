/**
 * Governance Modulation Tests
 *
 * Verifies the novel contribution: compositional uncertainty × governance.
 * Ported from AETHER into PromptSpeak.
 *
 * Key properties being tested:
 * 1. Epistemic uncertainty tightens governance (higher epistemic → stricter)
 * 2. Aleatoric uncertainty does NOT tighten governance (irreducible)
 * 3. Poor calibration tightens governance
 * 4. Strict mode is stricter than flexible mode
 * 5. Thresholds stay within reasonable bounds
 * 6. Direction-awareness: lower-is-stricter vs higher-is-stricter gates
 */

import { describe, it, expect } from 'vitest';
import {
  computeModeFactor,
  computeUncertaintyFactor,
  computeCalibrationFactor,
  computeEffectiveThresholds,
  makeGateDecision,
} from '../../../src/governance/modulation.js';
import { computeVocabAwareMinFloor } from '../../../src/governance/governance.config.js';
import { GOVERNANCE_MODES } from '../../../src/governance/types.js';
import type { UncertaintyDecomposition, CalibrationMetrics } from '../../../src/governance/types.js';

// --- Test Fixtures ---

function makeUncertainty(overrides: Partial<UncertaintyDecomposition> = {}): UncertaintyDecomposition {
  return {
    total: 0.5,
    epistemic: 0.3,
    aleatoric: 0.2,
    epistemicRatio: 0.6,
    method: 'ensemble_variance',
    ...overrides,
  };
}

function makeCalibration(overrides: Partial<CalibrationMetrics> = {}): CalibrationMetrics {
  return {
    ece: 0.05,
    mce: 0.10,
    brierScore: 0.08,
    windowSize: 50,
    windowStart: '2025-01-01T00:00:00Z',
    windowEnd: '2025-01-01T01:00:00Z',
    buckets: [],
    ...overrides,
  };
}

// --- Mode Factor Tests ---

describe('computeModeFactor', () => {
  it('returns higher factor for strict mode (more tightening)', () => {
    const flexible = computeModeFactor(GOVERNANCE_MODES['flexible']);
    const strict = computeModeFactor(GOVERNANCE_MODES['strict']);
    expect(strict).toBeGreaterThan(flexible);
  });

  it('returns 1.0 for flexible mode (no tightening — baseline)', () => {
    const factor = computeModeFactor(GOVERNANCE_MODES['flexible']);
    expect(factor).toBeCloseTo(1.0);
  });

  it('produces correct values for each mode', () => {
    expect(computeModeFactor(GOVERNANCE_MODES['flexible'])).toBeCloseTo(1.0);
    expect(computeModeFactor(GOVERNANCE_MODES['standard'])).toBeCloseTo(1.1);
    expect(computeModeFactor(GOVERNANCE_MODES['strict'])).toBeCloseTo(1.2);
    expect(computeModeFactor(GOVERNANCE_MODES['forbidden'])).toBeCloseTo(1.3);
  });
});

// --- Uncertainty Factor Tests ---

describe('computeUncertaintyFactor', () => {
  it('THE KEY INSIGHT: high epistemic uncertainty tightens governance', () => {
    const highEpistemic = makeUncertainty({
      total: 0.8,
      epistemic: 0.7,
      aleatoric: 0.1,
      epistemicRatio: 0.875,
    });

    const factor = computeUncertaintyFactor(highEpistemic);
    expect(factor).toBeGreaterThan(1.2);
  });

  it('THE KEY INSIGHT: high aleatoric uncertainty does NOT tighten', () => {
    const highAleatoric = makeUncertainty({
      total: 0.8,
      epistemic: 0.1,
      aleatoric: 0.7,
      epistemicRatio: 0.125,
    });

    const factor = computeUncertaintyFactor(highAleatoric);
    expect(factor).toBeLessThan(1.0);
  });

  it('same total uncertainty produces different factors based on decomposition', () => {
    const mostlyEpistemic = makeUncertainty({
      total: 0.6,
      epistemic: 0.5,
      aleatoric: 0.1,
      epistemicRatio: 0.833,
    });

    const mostlyAleatoric = makeUncertainty({
      total: 0.6,
      epistemic: 0.1,
      aleatoric: 0.5,
      epistemicRatio: 0.167,
    });

    const epistemicFactor = computeUncertaintyFactor(mostlyEpistemic);
    const aleatoricFactor = computeUncertaintyFactor(mostlyAleatoric);

    expect(epistemicFactor).toBeGreaterThan(aleatoricFactor);
    expect(epistemicFactor - aleatoricFactor).toBeGreaterThan(0.15);
  });

  it('zero epistemic ratio relaxes below 1.0 (model knows what it knows)', () => {
    const noUncertainty = makeUncertainty({
      total: 0,
      epistemic: 0,
      aleatoric: 0,
      epistemicRatio: 0,
    });

    expect(computeUncertaintyFactor(noUncertainty)).toBeCloseTo(0.85);
  });
});

// --- Calibration Factor Tests ---

describe('computeCalibrationFactor', () => {
  it('poor calibration (high ECE) tightens governance', () => {
    const poorCal = makeCalibration({ ece: 0.30 });
    const goodCal = makeCalibration({ ece: 0.02 });

    const poorFactor = computeCalibrationFactor(poorCal);
    const goodFactor = computeCalibrationFactor(goodCal);

    expect(poorFactor).toBeGreaterThan(goodFactor);
  });

  it('perfect calibration relaxes below 1.0 (earned trust)', () => {
    const perfectCal = makeCalibration({ ece: 0.0 });
    expect(computeCalibrationFactor(perfectCal)).toBeCloseTo(0.98);
  });

  it('maximum calibration error (ECE=1.0) produces maximum factor', () => {
    const worstCal = makeCalibration({ ece: 1.0 });
    expect(computeCalibrationFactor(worstCal)).toBeCloseTo(1.38);
  });
});

// --- Effective Thresholds Tests ---

describe('computeEffectiveThresholds', () => {
  it('produces valid thresholds with default inputs', () => {
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['standard'],
      makeUncertainty(),
      makeCalibration(),
      'supervised',
    );

    expect(thresholds.driftThreshold).toBeGreaterThan(0);
    expect(thresholds.reviewGateAutoPass).toBeGreaterThan(0);
    expect(thresholds.threatActivation).toBeGreaterThan(0);
    expect(thresholds.conformanceDeviation).toBeGreaterThan(0);
    expect(thresholds.sayDoGap).toBeGreaterThan(0);
    expect(thresholds.knowledgePromotion).toBeGreaterThan(0);
  });

  it('strict mode produces tighter thresholds than flexible mode', () => {
    const uncertainty = makeUncertainty({ total: 0.0, epistemicRatio: 0.0 });
    const calibration = makeCalibration({ ece: 0.0 });

    const strict = computeEffectiveThresholds(
      GOVERNANCE_MODES['strict'], uncertainty, calibration, 'supervised',
    );
    const flexible = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'], uncertainty, calibration, 'supervised',
    );

    // Lower-is-stricter: strict should have LOWER drift threshold
    expect(strict.driftThreshold).toBeLessThan(flexible.driftThreshold);
    expect(strict.conformanceDeviation).toBeLessThan(flexible.conformanceDeviation);
    expect(strict.sayDoGap).toBeLessThan(flexible.sayDoGap);

    // Higher-is-stricter: strict should have HIGHER auto-pass threshold
    expect(strict.reviewGateAutoPass).toBeGreaterThan(flexible.reviewGateAutoPass);
    expect(strict.knowledgePromotion).toBeGreaterThan(flexible.knowledgePromotion);
  });

  it('high epistemic uncertainty tightens all thresholds', () => {
    const calibration = makeCalibration({ ece: 0.0 });

    const lowEpistemic = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      makeUncertainty({ total: 0.1, epistemicRatio: 0.1 }),
      calibration,
      'supervised',
    );

    const highEpistemic = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      makeUncertainty({ total: 0.8, epistemicRatio: 0.9 }),
      calibration,
      'supervised',
    );

    expect(highEpistemic.driftThreshold).toBeLessThan(lowEpistemic.driftThreshold);
    expect(highEpistemic.conformanceDeviation).toBeLessThan(lowEpistemic.conformanceDeviation);

    expect(highEpistemic.reviewGateAutoPass).toBeGreaterThanOrEqual(lowEpistemic.reviewGateAutoPass);
    expect(highEpistemic.knowledgePromotion).toBeGreaterThanOrEqual(lowEpistemic.knowledgePromotion);
  });

  it('thresholds are bounded within reasonable ranges', () => {
    const extreme = computeEffectiveThresholds(
      GOVERNANCE_MODES['strict'],
      makeUncertainty({ total: 1.0, epistemicRatio: 1.0 }),
      makeCalibration({ ece: 0.5 }),
      'supervised',
    );

    expect(extreme.driftThreshold).toBeGreaterThanOrEqual(0.02);
    expect(extreme.driftThreshold).toBeLessThanOrEqual(0.30);
    expect(extreme.reviewGateAutoPass).toBeGreaterThanOrEqual(0.50);
    expect(extreme.reviewGateAutoPass).toBeLessThanOrEqual(0.99);
    expect(extreme.conformanceDeviation).toBeGreaterThanOrEqual(0.01);
    expect(extreme.conformanceDeviation).toBeLessThanOrEqual(0.15);
  });

  it('includes modulation details for every threshold', () => {
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['standard'],
      makeUncertainty(),
      makeCalibration(),
      'supervised',
    );

    expect(thresholds.modulations['driftThreshold']).toBeDefined();
    expect(thresholds.modulations['reviewGateAutoPass']).toBeDefined();
    expect(thresholds.modulations['conformanceDeviation']).toBeDefined();
    expect(thresholds.computedAt).toBeDefined();
  });
});

// --- Gate Decision Tests ---

describe('makeGateDecision', () => {
  it('allows when observed value is within threshold (lower-is-stricter)', () => {
    const modulation = computeEffectiveThresholds(
      GOVERNANCE_MODES['standard'],
      makeUncertainty(),
      makeCalibration(),
      'supervised',
    ).modulations['driftThreshold'];

    const decision = makeGateDecision('driftThreshold', 0.01, modulation, true);
    expect(decision.action).toBe('allow');
  });

  it('holds when observed value exceeds threshold (lower-is-stricter)', () => {
    const modulation = computeEffectiveThresholds(
      GOVERNANCE_MODES['strict'],
      makeUncertainty({ total: 0.8, epistemicRatio: 0.9 }),
      makeCalibration({ ece: 0.3 }),
      'supervised',
    ).modulations['driftThreshold'];

    const decision = makeGateDecision('driftThreshold', 0.25, modulation, true);
    expect(decision.action).toBe('hold');
    expect(decision.immutableTriggered).toBe(false);
  });

  it('blocks in forbidden mode regardless of values', () => {
    const modulation = computeEffectiveThresholds(
      GOVERNANCE_MODES['forbidden'],
      makeUncertainty(),
      makeCalibration(),
      'supervised',
    ).modulations['driftThreshold'];

    const decision = makeGateDecision('driftThreshold', 0.001, modulation, true);
    expect(decision.action).toBe('block');
    expect(decision.immutableTriggered).toBe(true);
  });

  it('generates unique audit IDs', () => {
    const modulation = computeEffectiveThresholds(
      GOVERNANCE_MODES['standard'],
      makeUncertainty(),
      makeCalibration(),
      'supervised',
    ).modulations['driftThreshold'];

    const d1 = makeGateDecision('test', 0.1, modulation, true);
    const d2 = makeGateDecision('test', 0.1, modulation, true);
    expect(d1.auditId).not.toBe(d2.auditId);
  });
});

// --- Tightening Factor Safety (division-by-zero guard) ---

describe('tightening factor safety', () => {
  it('extreme relaxation does not cause Infinity or NaN thresholds', () => {
    // Scenario: zero epistemic ratio + perfect calibration → factors go well below 1.0
    // Combined product must never reach zero or negative
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      makeUncertainty({ total: 0.0, epistemic: 0.0, aleatoric: 0.0, epistemicRatio: 0.0 }),
      makeCalibration({ ece: 0.0 }),
      'supervised',
    );

    expect(Number.isFinite(thresholds.driftThreshold)).toBe(true);
    expect(Number.isFinite(thresholds.conformanceDeviation)).toBe(true);
    expect(Number.isFinite(thresholds.sayDoGap)).toBe(true);
    expect(thresholds.driftThreshold).toBeGreaterThan(0);
    expect(thresholds.conformanceDeviation).toBeGreaterThan(0);
    expect(thresholds.sayDoGap).toBeGreaterThan(0);
  });

  it('all thresholds remain within clamp bounds regardless of extreme inputs', () => {
    // Maximum relaxation scenario
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      makeUncertainty({ total: 0.0, epistemic: 0.0, aleatoric: 0.0, epistemicRatio: 0.0 }),
      makeCalibration({ ece: 0.0 }),
      'supervised',
    );

    expect(thresholds.driftThreshold).toBeGreaterThanOrEqual(0.02);
    expect(thresholds.driftThreshold).toBeLessThanOrEqual(0.30);
    expect(thresholds.reviewGateAutoPass).toBeGreaterThanOrEqual(0.50);
    expect(thresholds.reviewGateAutoPass).toBeLessThanOrEqual(0.99);
  });
});

// --- Vocabulary-Aware Floor Tests (v3) ---

describe('computeVocabAwareMinFloor', () => {
  it('returns base floor (0.50) for small vocabularies', () => {
    expect(computeVocabAwareMinFloor(10)).toBeCloseTo(0.50);
    expect(computeVocabAwareMinFloor(20)).toBeCloseTo(0.50);
  });

  it('returns 0.55 for ~80 activities (matches static baseline)', () => {
    expect(computeVocabAwareMinFloor(80)).toBeCloseTo(0.55, 1);
  });

  it('returns ~0.60 for ~320 activities (high complexity)', () => {
    expect(computeVocabAwareMinFloor(320)).toBeCloseTo(0.60, 1);
  });

  it('increases monotonically with vocabulary size', () => {
    const floor20 = computeVocabAwareMinFloor(20);
    const floor50 = computeVocabAwareMinFloor(50);
    const floor100 = computeVocabAwareMinFloor(100);
    const floor200 = computeVocabAwareMinFloor(200);

    expect(floor50).toBeGreaterThan(floor20);
    expect(floor100).toBeGreaterThan(floor50);
    expect(floor200).toBeGreaterThan(floor100);
  });
});

describe('computeEffectiveThresholds with vocabSize option', () => {
  it('uses default min floor when vocabSize not provided', () => {
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      makeUncertainty({ total: 0.1, epistemicRatio: 0.1 }),
      makeCalibration({ ece: 0.0 }),
      'supervised',
    );
    expect(thresholds.reviewGateAutoPass).toBeGreaterThanOrEqual(0.50);
  });

  it('uses vocab-aware floor for high-vocabulary datasets', () => {
    const relaxedUncertainty = makeUncertainty({ total: 0.1, epistemicRatio: 0.1 });
    const perfectCalibration = makeCalibration({ ece: 0.0 });

    const withoutVocab = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      relaxedUncertainty,
      perfectCalibration,
      'supervised',
    );

    const withHighVocab = computeEffectiveThresholds(
      GOVERNANCE_MODES['flexible'],
      relaxedUncertainty,
      perfectCalibration,
      'supervised',
      { vocabSize: 80 },
    );

    expect(withHighVocab.reviewGateAutoPass).toBeGreaterThanOrEqual(
      withoutVocab.reviewGateAutoPass
    );
  });

  it('prevents regression: 77-activity dataset gets floor >= 0.55', () => {
    const thresholds = computeEffectiveThresholds(
      GOVERNANCE_MODES['standard'],
      makeUncertainty({ total: 0.9, epistemicRatio: 0.35 }),
      makeCalibration({ ece: 0.0 }),
      'supervised',
      { vocabSize: 77 },
    );
    expect(thresholds.reviewGateAutoPass).toBeGreaterThanOrEqual(0.54);
  });
});
