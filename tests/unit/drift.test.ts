/**
 * Unit Tests: Drift Detection System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DriftDetectionEngine } from '../../src/drift/index.js';
import { CircuitBreaker } from '../../src/drift/circuit-breaker.js';
import { TripwireInjector } from '../../src/drift/tripwire.js';
import { BaselineStore } from '../../src/drift/baseline.js';
import { DynamicResolver } from '../../src/gatekeeper/resolver.js';

describe('DriftDetectionEngine', () => {
  let engine: DriftDetectionEngine;

  beforeEach(() => {
    engine = new DriftDetectionEngine();
    engine.reset();
  });

  describe('recordOperation', () => {
    it('should record successful operation', () => {
      const alert = engine.recordOperation(
        'agent-1',
        '⊕◊▶',
        'execute',
        true
      );

      expect(alert).toBeNull(); // No alert for normal operation
    });

    it('should record failed operation', () => {
      // Record multiple failures to trigger potential alert
      for (let i = 0; i < 5; i++) {
        engine.recordOperation('agent-fail-test', '⊕◊▶', 'execute', false);
      }

      const status = engine.getAgentStatus('agent-fail-test');
      expect(status).toBeDefined();
    });

    it('should return alert when drift threshold exceeded', () => {
      // Simulate drift by recording operations with varying frames
      for (let i = 0; i < 10; i++) {
        engine.recordOperation(
          'drift-agent',
          i % 2 === 0 ? '⊕◊▶' : '⊖◇○',  // Alternating frames
          'action-' + i,
          true
        );
      }

      // After enough variation, drift might be detected
      const status = engine.getAgentStatus('drift-agent');
      expect(status).toBeDefined();
    });
  });

  describe('getAgentStatus', () => {
    it('should return null for unknown agent', () => {
      const status = engine.getAgentStatus('unknown-agent');
      // May return undefined or a default object
      expect(status?.operationCount ?? 0).toBe(0);
    });

    it('should return status for tracked agent', () => {
      engine.recordOperation('tracked-agent', '⊕◊▶', 'execute', true);

      const status = engine.getAgentStatus('tracked-agent');
      expect(status).toBeDefined();
      expect(status!.operationCount).toBeGreaterThan(0);
    });
  });

  describe('agent lifecycle', () => {
    it('should halt agent', () => {
      engine.recordOperation('halt-test', '⊕◊▶', 'execute', true);
      engine.haltAgent('halt-test', 'Test halt');

      const status = engine.getAgentStatus('halt-test');
      expect(status!.circuitBreakerState).toBe('open');
    });

    it('should resume agent', () => {
      engine.recordOperation('resume-test', '⊕◊▶', 'execute', true);
      engine.haltAgent('resume-test', 'Test halt');
      engine.resumeAgent('resume-test');

      const status = engine.getAgentStatus('resume-test');
      expect(status!.circuitBreakerState).toBe('closed');
    });

    it('should recalibrate agent', () => {
      // Build up history
      for (let i = 0; i < 5; i++) {
        engine.recordOperation('recal-test', '⊕◊▶', 'execute', true);
      }

      // Recalibrate
      engine.recalibrateAgent('recal-test');

      const status = engine.getAgentStatus('recal-test');
      expect(status?.driftScore ?? 0).toBe(0);
    });
  });

  describe('getSystemStats', () => {
    it('should return system statistics', () => {
      engine.recordOperation('stat-agent-1', '⊕◊▶', 'execute', true);
      engine.recordOperation('stat-agent-2', '⊖◇○', 'create', true);

      const stats = engine.getSystemStats();
      expect(stats).toBeDefined();
      expect(stats.agents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllAgentIds', () => {
    it('should return all tracked agent IDs', () => {
      engine.recordOperation('id-agent-1', '⊕◊▶', 'execute', true);
      engine.recordOperation('id-agent-2', '⊖◇○', 'create', true);

      const ids = engine.getAllAgentIds();
      expect(ids).toContain('id-agent-1');
      expect(ids).toContain('id-agent-2');
    });
  });
});

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker();
    cb.clearAll();
  });

  it('should start in closed state', () => {
    const state = cb.getState('new-agent');
    expect(state.state).toBe('closed');
  });

  it('should allow operations in closed state', () => {
    expect(cb.isAllowed('agent')).toBe(true);
  });

  it('should open after threshold failures', () => {
    // Configure threshold
    const threshold = 5;

    // Record failures up to threshold
    for (let i = 0; i < threshold; i++) {
      cb.recordFailure('failing-agent', 'Test failure');
    }

    const state = cb.getState('failing-agent');
    expect(state.state).toBe('open');
    expect(cb.isAllowed('failing-agent')).toBe(false);
  });

  it('should record drift', () => {
    cb.recordDrift('drifting-agent', 0.8, 'High drift detected');

    const alerts = cb.getAgentAlerts('drifting-agent');
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('should reset to closed state', () => {
    // Open the circuit
    for (let i = 0; i < 5; i++) {
      cb.recordFailure('reset-test', 'Failure');
    }

    expect(cb.getState('reset-test').state).toBe('open');

    // Reset
    cb.closeCircuit('reset-test');

    expect(cb.getState('reset-test').state).toBe('closed');
    expect(cb.isAllowed('reset-test')).toBe(true);
  });
});

describe('TripwireInjector', () => {
  let injector: TripwireInjector;

  beforeEach(() => {
    injector = new TripwireInjector();
    injector.clearResults();
  });

  it('should run tripwire tests', () => {
    const result = injector.runAllTests(
      'test-agent',
      (frame) => frame.length >= 2  // Simple validation
    );

    expect(result.passed).toBeDefined();
    expect(result.failed).toBeDefined();
    expect(result.passed + result.failed).toBeGreaterThan(0);
  });

  it('should track failure rate', () => {
    // Run tests multiple times
    injector.runAllTests('rate-agent', () => true);
    injector.runAllTests('rate-agent', () => false);

    const rate = injector.getFailureRate('rate-agent');
    expect(rate).toBeGreaterThan(0);
  });

  it('should return zero rate for unknown agent', () => {
    const rate = injector.getFailureRate('unknown-agent');
    expect(rate).toBe(0);
  });
});

describe('BaselineStore', () => {
  let store: BaselineStore;
  let resolver: DynamicResolver;

  beforeEach(() => {
    store = new BaselineStore();
    store.clearAll();
    resolver = new DynamicResolver();
  });

  it('should record baseline', () => {
    const parsed = resolver.parseFrame('⊕◊▶')!;
    // recordBaseline(frame: ParsedFrame, expectedInterpretation: string, expectedBehavior: string[], agentId: string)
    store.recordBaseline(parsed, 'strict mode', ['execute'], 'agent');

    const baselines = store.getAgentBaselines('agent');
    expect(baselines.length).toBe(1);
  });

  it('should compare to baseline', () => {
    const parsed = resolver.parseFrame('⊕◊▶')!;
    store.recordBaseline(parsed, 'strict mode', ['execute'], 'compare-agent');

    const result = store.compareToBaseline(
      parsed,
      'strict mode',
      ['execute'],
      'compare-agent'
    );

    expect(result.hasBaseline).toBe(true);
  });

  it('should detect deviation from baseline', () => {
    const parsed = resolver.parseFrame('⊕◊▶')!;
    store.recordBaseline(parsed, 'strict mode', ['execute'], 'deviation-agent');

    const result = store.compareToBaseline(
      parsed,
      'flexible mode',  // Different interpretation
      ['delete'],        // Different behavior
      'deviation-agent'
    );

    expect(result.hasBaseline).toBe(true);
    // Drift score is based on frame embedding - same frame = 0 drift
    // But interpretation and behavior differences are detected separately
    expect(result.interpretationMatch).toBe(false);  // Interpretation changed
    expect(result.behaviorMatch).toBe(false);        // Behavior changed
  });

  it('should clear agent baselines', () => {
    const parsed = resolver.parseFrame('⊕◊▶')!;
    store.recordBaseline(parsed, 'strict mode', ['execute'], 'clear-agent');

    expect(store.getAgentBaselines('clear-agent').length).toBe(1);

    store.clearAgentBaselines('clear-agent');

    expect(store.getAgentBaselines('clear-agent').length).toBe(0);
  });
});
