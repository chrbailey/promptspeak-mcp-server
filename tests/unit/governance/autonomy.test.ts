/**
 * Autonomy Controller Tests
 *
 * Verifies the asymmetric trust dynamics:
 * - Trust ASCENT is slow (requires sustained calibration)
 * - Trust DESCENT is fast (single critical failure = immediate demotion)
 * - Immutable violations always reset to SUPERVISED
 * - Probationary period after descent
 *
 * Ported from AETHER into PromptSpeak.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialTrustState,
  processCalibrationWindow,
  summarizeTrustState,
  isActionPermitted,
} from '../../../src/governance/autonomy-controller.js';
import type { TrustState, CalibrationMetrics } from '../../../src/governance/types.js';

function makeCalibratedWindow(overrides: Partial<CalibrationMetrics> = {}): CalibrationMetrics {
  return {
    ece: 0.03,
    mce: 0.05,
    brierScore: 0.04,
    windowSize: 50,
    windowStart: '2025-01-01T00:00:00Z',
    windowEnd: '2025-01-01T01:00:00Z',
    buckets: [],
    ...overrides,
  };
}

function makeDegradedWindow(overrides: Partial<CalibrationMetrics> = {}): CalibrationMetrics {
  return {
    ece: 0.20,
    mce: 0.35,
    brierScore: 0.25,
    windowSize: 50,
    windowStart: '2025-01-01T00:00:00Z',
    windowEnd: '2025-01-01T01:00:00Z',
    buckets: [],
    ...overrides,
  };
}

function runCalibratedWindows(state: TrustState, n: number): TrustState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = processCalibrationWindow(s, makeCalibratedWindow(), false, false);
  }
  return s;
}

function runDegradedWindows(state: TrustState, n: number): TrustState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = processCalibrationWindow(s, makeDegradedWindow(), false, false);
  }
  return s;
}

// --- Initial State ---

describe('createInitialTrustState', () => {
  it('starts at supervised level', () => {
    const state = createInitialTrustState();
    expect(state.level).toBe('supervised');
  });

  it('starts with zero counters', () => {
    const state = createInitialTrustState();
    expect(state.consecutiveCalibratedWindows).toBe(0);
    expect(state.consecutiveDegradedWindows).toBe(0);
    expect(state.totalPredictions).toBe(0);
    expect(state.transitions).toHaveLength(0);
  });

  it('is not probationary', () => {
    const state = createInitialTrustState();
    expect(state.probationary).toBe(false);
  });
});

// --- Trust Ascent (Slow) ---

describe('trust ascent (slow)', () => {
  it('requires 10 calibrated windows to reach GUIDED', () => {
    let state = createInitialTrustState();

    state = runCalibratedWindows(state, 9);
    expect(state.level).toBe('supervised');

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.level).toBe('guided');
  });

  it('requires 20 more calibrated windows to reach COLLABORATIVE', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 10);
    expect(state.level).toBe('guided');

    state = runCalibratedWindows(state, 19);
    expect(state.level).toBe('guided');

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.level).toBe('collaborative');
  });

  it('requires 50 more calibrated windows to reach AUTONOMOUS', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 10);
    state = runCalibratedWindows(state, 20);
    expect(state.level).toBe('collaborative');

    state = runCalibratedWindows(state, 49);
    expect(state.level).toBe('collaborative');

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.level).toBe('autonomous');
  });

  it('full ascent requires 80 total calibrated windows', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);
    expect(state.level).toBe('autonomous');
    expect(state.transitions).toHaveLength(3);
  });

  it('records ascent transitions with correct direction', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 10);

    expect(state.transitions).toHaveLength(1);
    expect(state.transitions[0].from).toBe('supervised');
    expect(state.transitions[0].to).toBe('guided');
    expect(state.transitions[0].direction).toBe('ascent');
  });
});

// --- Trust Descent (Fast) ---

describe('trust descent (fast)', () => {
  it('critical miss causes immediate one-level descent', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);
    expect(state.level).toBe('autonomous');

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.level).toBe('collaborative');
  });

  it('3 consecutive degraded windows cause one-level descent', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);

    state = runDegradedWindows(state, 2);
    expect(state.level).toBe('autonomous');

    state = processCalibrationWindow(state, makeDegradedWindow(), false, false);
    expect(state.level).toBe('collaborative');
  });

  it('immutable violation resets ALL THE WAY to supervised', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);
    expect(state.level).toBe('autonomous');

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, true);
    expect(state.level).toBe('supervised');
  });

  it('descent marks state as probationary', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.probationary).toBe(true);
  });

  it('probation clears after 5 calibrated windows', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.probationary).toBe(true);

    state = runCalibratedWindows(state, 4);
    expect(state.probationary).toBe(true);

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.probationary).toBe(false);
  });

  it('ascent is asymmetrically harder than descent', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);
    expect(state.level).toBe('autonomous');

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.level).toBe('collaborative');

    state = runCalibratedWindows(state, 49);
    expect(state.level).toBe('collaborative');
    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.level).toBe('autonomous');
  });

  it('resets calibrated window counter on descent', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.consecutiveCalibratedWindows).toBe(0);
  });

  it('supervised cannot descend further', () => {
    let state = createInitialTrustState();
    expect(state.level).toBe('supervised');

    state = processCalibrationWindow(state, makeCalibratedWindow(), true, false);
    expect(state.level).toBe('supervised');
  });
});

// --- Counter Tracking ---

describe('counter tracking', () => {
  it('increments calibrated counter on calibrated windows', () => {
    let state = createInitialTrustState();
    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.consecutiveCalibratedWindows).toBe(1);
    expect(state.consecutiveDegradedWindows).toBe(0);
  });

  it('increments degraded counter on degraded windows', () => {
    let state = createInitialTrustState();
    state = processCalibrationWindow(state, makeDegradedWindow(), false, false);
    expect(state.consecutiveDegradedWindows).toBe(1);
    expect(state.consecutiveCalibratedWindows).toBe(0);
  });

  it('resets degraded counter when a calibrated window arrives', () => {
    let state = createInitialTrustState();
    state = runDegradedWindows(state, 2);
    expect(state.consecutiveDegradedWindows).toBe(2);

    state = processCalibrationWindow(state, makeCalibratedWindow(), false, false);
    expect(state.consecutiveDegradedWindows).toBe(0);
    expect(state.consecutiveCalibratedWindows).toBe(1);
  });

  it('tracks total predictions across windows', () => {
    let state = createInitialTrustState();
    state = processCalibrationWindow(state, makeCalibratedWindow({ windowSize: 50 }), false, false);
    state = processCalibrationWindow(state, makeCalibratedWindow({ windowSize: 30 }), false, false);
    expect(state.totalPredictions).toBe(80);
  });
});

// --- Action Permission ---

describe('isActionPermitted', () => {
  it('supervised permits supervised actions', () => {
    const state = createInitialTrustState();
    expect(isActionPermitted(state, 'supervised')).toBe(true);
  });

  it('supervised does not permit guided actions', () => {
    const state = createInitialTrustState();
    expect(isActionPermitted(state, 'guided')).toBe(false);
  });

  it('autonomous permits all actions', () => {
    let state = createInitialTrustState();
    state = runCalibratedWindows(state, 80);
    expect(isActionPermitted(state, 'supervised')).toBe(true);
    expect(isActionPermitted(state, 'guided')).toBe(true);
    expect(isActionPermitted(state, 'collaborative')).toBe(true);
    expect(isActionPermitted(state, 'autonomous')).toBe(true);
  });
});

// --- Summary ---

describe('summarizeTrustState', () => {
  it('produces a readable summary', () => {
    const state = createInitialTrustState();
    const summary = summarizeTrustState(state);
    expect(summary).toContain('SUPERVISED');
    expect(summary).toContain('0/10');
  });
});
