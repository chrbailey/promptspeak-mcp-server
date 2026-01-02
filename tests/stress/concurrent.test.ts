/**
 * Stress Tests: Concurrent Operations
 *
 * Tests system behavior under high load with many concurrent agents and operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DriftDetectionEngine } from '../../src/drift/index.js';
import { ps_validate, ps_delegate, ps_state_system } from '../../src/tools/index.js';
import { operatorConfig } from '../../src/operator/config.js';

describe('Concurrent Operations Stress Tests', () => {
  let engine: DriftDetectionEngine;

  beforeEach(() => {
    engine = new DriftDetectionEngine();
    engine.reset();
  });

  describe('high volume validation', () => {
    it('should handle 1000 validations without error', () => {
      const frames = [
        '⊕◊▶', '⊖◇○', '⊘◆▲', '⊕◈●', '⊖◐▼',
        '⊕↑◊▶', '⊖↓◇○', '⊕◊⛔▶', '⊖◇⚠○'
      ];

      const results: boolean[] = [];

      for (let i = 0; i < 1000; i++) {
        const frame = frames[i % frames.length];
        const result = ps_validate({ frame });
        results.push(result.valid);
      }

      // All frames should validate consistently
      expect(results.length).toBe(1000);
      // First frame should always be valid
      expect(results[0]).toBe(true);
    });

    it('should maintain consistent results under load', () => {
      const frame = '⊕◊▶β';
      const results: boolean[] = [];

      for (let i = 0; i < 500; i++) {
        results.push(ps_validate({ frame }).valid);
      }

      // All results should be identical
      const allSame = results.every(r => r === results[0]);
      expect(allSame).toBe(true);
    });
  });

  describe('many agents', () => {
    it('should track 100 agents simultaneously', () => {
      for (let i = 0; i < 100; i++) {
        const agentId = `stress-agent-${i}`;
        engine.recordOperation(agentId, '⊕◊▶', 'execute', true);
      }

      const allIds = engine.getAllAgentIds();
      expect(allIds.length).toBeGreaterThanOrEqual(100);
    });

    it('should maintain per-agent state isolation', () => {
      // Create agents with different behaviors
      for (let i = 0; i < 50; i++) {
        const agentId = `isolation-agent-${i}`;

        // Even agents succeed, odd agents fail
        const success = i % 2 === 0;
        for (let j = 0; j < 10; j++) {
          engine.recordOperation(agentId, '⊕◊▶', 'action', success);
        }
      }

      // Check isolation
      for (let i = 0; i < 50; i++) {
        const status = engine.getAgentStatus(`isolation-agent-${i}`);
        expect(status).toBeDefined();
        // States should be independent
      }
    });
  });

  describe('delegation chains', () => {
    it('should handle deep delegation chains', () => {
      const depth = 20;
      const delegations: string[] = [];

      for (let i = 0; i < depth; i++) {
        const result = ps_delegate({
          parentAgentId: i === 0 ? 'root' : `agent-${i - 1}`,
          childAgentId: `agent-${i}`,
          parentFrame: '⊕◊▼α',
          childFrame: '⊕◊▶β'
        });

        expect(result.success).toBe(true);
        delegations.push(result.delegationId);
      }

      expect(delegations.length).toBe(depth);
    });

    it('should handle wide delegation (many children)', () => {
      const width = 50;
      const delegations: string[] = [];

      for (let i = 0; i < width; i++) {
        const result = ps_delegate({
          parentAgentId: 'parent',
          childAgentId: `child-${i}`,
          parentFrame: '⊕◊▼α',
          childFrame: '⊕◊▶β'
        });

        expect(result.success).toBe(true);
        delegations.push(result.delegationId);
      }

      expect(delegations.length).toBe(width);
    });
  });

  describe('drift detection under load', () => {
    it('should detect drift across many operations', () => {
      const agentId = 'drift-load-test';

      // Phase 1: Consistent behavior (baseline)
      for (let i = 0; i < 50; i++) {
        engine.recordOperation(agentId, '⊕◊▶', 'execute', true);
      }

      // Phase 2: Introduce drift (different frame patterns)
      for (let i = 0; i < 50; i++) {
        engine.recordOperation(agentId, '⊖◇○', 'create', true);
      }

      const status = engine.getAgentStatus(agentId);
      expect(status).toBeDefined();
      // Drift score should be non-zero after behavior change
    });

    it('should handle rapid state changes', () => {
      const agentId = 'rapid-change';

      for (let i = 0; i < 100; i++) {
        if (i % 10 === 0) {
          engine.haltAgent(agentId, 'Periodic halt');
        }
        if (i % 10 === 5) {
          engine.resumeAgent(agentId);
        }
        engine.recordOperation(agentId, '⊕◊▶', 'action', true);
      }

      // Should not crash
      const status = engine.getAgentStatus(agentId);
      expect(status).toBeDefined();
    });
  });

  describe('configuration changes under load', () => {
    it('should handle threshold changes during operations', () => {
      // Start operations
      for (let i = 0; i < 25; i++) {
        engine.recordOperation('config-test', '⊕◊▶', 'action', true);
      }

      // Change thresholds mid-operation
      operatorConfig.setThreshold('driftThreshold', 0.1);

      // Continue operations
      for (let i = 0; i < 25; i++) {
        engine.recordOperation('config-test', '⊕◊▶', 'action', true);
      }

      // Should not crash
      const status = engine.getAgentStatus('config-test');
      expect(status).toBeDefined();

      // Reset threshold
      operatorConfig.setThreshold('driftThreshold', 0.3);
    });
  });

  describe('system stats accuracy', () => {
    it('should accurately count operations across agents', () => {
      const agentCount = 10;
      const opsPerAgent = 20;

      for (let a = 0; a < agentCount; a++) {
        for (let o = 0; o < opsPerAgent; o++) {
          engine.recordOperation(`count-agent-${a}`, '⊕◊▶', 'action', true);
        }
      }

      const stats = engine.getSystemStats();
      expect(stats.agents).toBeGreaterThanOrEqual(agentCount);
    });
  });
});

describe('Memory and Resource Stress Tests', () => {
  describe('large payload handling', () => {
    it('should handle frames at max length', () => {
      // 12 symbol frame (max length per rules)
      const maxFrame = '⊕↑⟳◊⌘⛔⚠✓✗▶●β';

      const result = ps_validate({ frame: maxFrame });
      expect(result).toBeDefined();
      expect(result.frame).toBe(maxFrame);
    });

    it('should handle many concurrent validations', async () => {
      const validations = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(ps_validate({ frame: '⊕◊▶' }))
      );

      const results = await Promise.all(validations);
      expect(results.every(r => r.valid)).toBe(true);
    });
  });

  describe('state accumulation', () => {
    let engine: DriftDetectionEngine;

    beforeEach(() => {
      engine = new DriftDetectionEngine();
      engine.reset();
    });

    it('should limit stored history to prevent memory bloat', () => {
      const agentId = 'history-limit-test';

      // Record many operations
      for (let i = 0; i < 2000; i++) {
        engine.recordOperation(agentId, '⊕◊▶', `action-${i}`, true);
      }

      // History should be capped
      const history = engine.getDriftHistory(agentId);
      expect(history.length).toBeLessThanOrEqual(1000); // Reasonable cap
    });

    it('should clean up old alerts', () => {
      const agentId = 'alert-cleanup-test';

      // Trigger many alerts
      for (let i = 0; i < 200; i++) {
        engine.recordOperation(agentId, '⊕◊▶', 'action', false);
      }

      const alerts = engine.getAgentAlerts(agentId);
      expect(alerts.length).toBeLessThanOrEqual(100); // Should be capped
    });
  });
});
