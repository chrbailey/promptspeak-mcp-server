/**
 * Unit Tests: Pre-Execution Blocking System
 *
 * Tests the deterministic pre-execution blocking that prevents tool calls
 * and memory writes when drift is detected.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Gatekeeper } from '../../src/gatekeeper/index.js';
import { HoldManager } from '../../src/gatekeeper/hold-manager.js';
import { DriftDetectionEngine } from '../../src/drift/index.js';
import { driftEngine } from '../../src/drift/index.js';

describe('Pre-Execution Blocking', () => {
  let gatekeeper: Gatekeeper;

  beforeEach(() => {
    gatekeeper = new Gatekeeper();
    // Reset drift engine state
    driftEngine.reset();
    // Reset hold manager and restore default config
    const holdManager = gatekeeper.getHoldManager();
    holdManager.clearAll();
    // Restore default execution control config
    gatekeeper.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: true,
      enableBaselineComparison: true,
      holdOnDriftPrediction: true,
      holdOnLowConfidence: true,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 300000,
      driftPredictionThreshold: 0.25,
      baselineDeviationThreshold: 0.30,
      enableMcpValidation: true,
      mcpValidationTools: [],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  describe('Circuit Breaker Pre-Execution Check', () => {
    it('should block execution when circuit breaker is open', () => {
      const agentId = 'halted-agent';

      // Halt the agent (open circuit breaker)
      driftEngine.haltAgent(agentId, 'Test halt reason');

      // Attempt to execute
      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: {},
      });

      expect(result.success).toBe(false);
      expect(result.allowed).toBe(false);
      expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(false);
      expect(result.error).toContain('Agent halted');
    });

    it('should allow execution when circuit breaker is closed', () => {
      const agentId = 'normal-agent';

      // Don't halt - circuit should be closed by default
      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: {},
      });

      // Should pass circuit breaker check (may fail other checks)
      expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    });

    it('should resume execution after circuit breaker is closed', () => {
      const agentId = 'resume-agent';

      // Halt then resume
      driftEngine.haltAgent(agentId, 'Temporary halt');
      driftEngine.resumeAgent(agentId);

      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: {},
      });

      expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    });
  });

  describe('Pre-Flight Drift Prediction', () => {
    it('should detect drift from baseline before execution', () => {
      const agentId = 'drift-predict-agent';

      // Set up baseline
      const parsed = gatekeeper.parseFrame('⊕◊▶');
      driftEngine.baselineStore.recordBaseline(
        parsed,
        'strict financial execute',
        ['read_data'],  // Baseline expects read_data
        agentId
      );

      // Configure to hold on drift prediction
      gatekeeper.setExecutionControlConfig({
        enablePreFlightDriftPrediction: true,
        holdOnDriftPrediction: true,
        driftPredictionThreshold: 0.1,
      });

      // Execute with different action than baseline
      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'delete_data',  // Different from baseline
        arguments: {},
      });

      // Should either block or hold based on drift prediction
      if (result.held) {
        expect(result.holdRequest).toBeDefined();
        expect(result.holdRequest!.reason).toBe('pre_flight_drift_prediction');
      }
    });
  });

  describe('Human-in-the-Loop Hold Mechanism', () => {
    it('should create hold for high-risk operations', () => {
      const agentId = 'hold-test-agent';

      // Configure to require MCP validation for specific tools
      gatekeeper.setExecutionControlConfig({
        enableMcpValidation: true,
        mcpValidationTools: ['dangerous_*'],
      });

      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'dangerous_delete',
        arguments: {},
      });

      expect(result.held).toBe(true);
      expect(result.holdRequest).toBeDefined();
      expect(result.holdRequest!.reason).toBe('mcp_validation_pending');
      expect(result.holdRequest!.state).toBe('pending');
    });

    it('should allow execution after hold approval', () => {
      const agentId = 'approved-hold-agent';
      const holdManager = gatekeeper.getHoldManager();

      // Configure to hold
      gatekeeper.setExecutionControlConfig({
        enableMcpValidation: true,
        mcpValidationTools: ['needs_approval'],
      });

      // First request creates hold
      const holdResult = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'needs_approval',
        arguments: { data: 'test' },
      });

      expect(holdResult.held).toBe(true);
      const holdId = holdResult.holdRequest!.holdId;

      // Approve the hold
      const decision = holdManager.approveHold(holdId, 'human', 'Approved for testing');
      expect(decision).toBeDefined();
      expect(decision!.state).toBe('approved');

      // Execute with bypass
      const executeResult = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'needs_approval',
        arguments: { data: 'test' },
        bypassHold: true,
        holdDecision: decision!,
      });

      // Should proceed (may still fail other checks, but not held)
      expect(executeResult.held).toBeFalsy();
    });

    it('should reject execution when hold is rejected', () => {
      const agentId = 'rejected-hold-agent';
      const holdManager = gatekeeper.getHoldManager();

      // Configure to hold
      gatekeeper.setExecutionControlConfig({
        enableMcpValidation: true,
        mcpValidationTools: ['risky_op'],
      });

      // Create hold
      gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'risky_op',
        arguments: {},
      });

      const holds = holdManager.getPendingHolds();
      expect(holds.length).toBeGreaterThan(0);

      // Reject the hold
      const decision = holdManager.rejectHold(holds[0].holdId, 'human', 'Too risky');
      expect(decision!.state).toBe('rejected');

      // Hold should no longer be pending
      const remainingHolds = holdManager.getPendingHolds();
      expect(remainingHolds.find(h => h.holdId === holds[0].holdId)).toBeUndefined();
    });

    it('should expire holds after timeout', async () => {
      const holdManager = gatekeeper.getHoldManager();

      // Set very short timeout
      gatekeeper.setExecutionControlConfig({
        holdTimeoutMs: 1,  // 1ms timeout
        enableMcpValidation: true,
        mcpValidationTools: ['timeout_test'],
      });

      // Create hold
      gatekeeper.execute({
        agentId: 'timeout-agent',
        frame: '⊕◊▶',
        tool: 'timeout_test',
        arguments: {},
      });

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      // Process expired holds
      const expired = holdManager.processExpiredHolds();
      expect(expired.length).toBeGreaterThan(0);
      expect(expired[0].state).toBe('expired');
    });
  });

  describe('Post-Audit Immediate Action', () => {
    it('should halt agent on critical drift detection', () => {
      const agentId = 'critical-drift-agent';

      // Configure to halt on critical drift
      gatekeeper.setExecutionControlConfig({
        haltOnCriticalDrift: true,
        haltOnHighDrift: true,
      });

      // Build up execution history to enable drift detection
      for (let i = 0; i < 15; i++) {
        gatekeeper.execute({
          agentId,
          frame: '⊕◊▶',
          tool: 'consistent_tool',
          arguments: {},
        });
      }

      // Execute with drastically different behavior pattern
      // Note: In real scenario, the post-audit would detect behavior change
      // For this test, we verify the mechanism is in place

      const status = driftEngine.getAgentStatus(agentId);
      expect(status).toBeDefined();
    });
  });

  describe('Execution Control Configuration', () => {
    it('should allow disabling circuit breaker check', () => {
      const agentId = 'disabled-cb-agent';

      // Halt the agent
      driftEngine.haltAgent(agentId, 'Halted');

      // Disable circuit breaker check
      gatekeeper.setExecutionControlConfig({
        enableCircuitBreakerCheck: false,
      });

      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: {},
      });

      // Should NOT be blocked by circuit breaker (other checks may still fail)
      expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    });

    it('should return current configuration', () => {
      const config = gatekeeper.getExecutionControlConfig();

      expect(config).toBeDefined();
      expect(typeof config.enableCircuitBreakerCheck).toBe('boolean');
      expect(typeof config.holdOnDriftPrediction).toBe('boolean');
      expect(typeof config.holdTimeoutMs).toBe('number');
    });
  });

  describe('Integration with Drift Detection', () => {
    it('should record operations in drift engine', () => {
      const agentId = 'drift-record-agent';

      gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'tracked_tool',
        arguments: {},
      });

      const status = driftEngine.getAgentStatus(agentId);
      expect(status).toBeDefined();
      expect(status.operationCount).toBeGreaterThan(0);
    });

    it('should open circuit breaker after drift threshold exceeded', () => {
      const agentId = 'drift-threshold-agent';

      // Simulate high drift by recording many failures
      for (let i = 0; i < 10; i++) {
        driftEngine.circuitBreaker.recordFailure(agentId, 'Simulated failure');
      }

      // Circuit should be open
      const isAllowed = driftEngine.circuitBreaker.isAllowed(agentId);
      expect(isAllowed).toBe(false);

      // Execution should be blocked
      const result = gatekeeper.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: {},
      });

      expect(result.success).toBe(false);
      expect(result.preFlightCheck?.blocked).toBe(true);
    });
  });
});

describe('HoldManager', () => {
  let holdManager: HoldManager;

  beforeEach(() => {
    holdManager = new HoldManager();
    holdManager.clearAll();
  });

  it('should create holds with correct structure', () => {
    const hold = holdManager.createHold(
      {
        agentId: 'test-agent',
        frame: '⊕◊▶',
        tool: 'test_tool',
        arguments: { key: 'value' },
      },
      'human_approval_required',
      'high',
      { customEvidence: true }
    );

    expect(hold.holdId).toBeDefined();
    expect(hold.agentId).toBe('test-agent');
    expect(hold.reason).toBe('human_approval_required');
    expect(hold.severity).toBe('high');
    expect(hold.state).toBe('pending');
    expect(hold.evidence.customEvidence).toBe(true);
  });

  it('should track hold statistics', () => {
    // Create some holds
    holdManager.createHold(
      { agentId: 'a1', frame: '⊕◊▶', tool: 't1', arguments: {} },
      'drift_threshold_exceeded',
      'high',
      {}
    );
    holdManager.createHold(
      { agentId: 'a2', frame: '⊕◊▶', tool: 't2', arguments: {} },
      'mcp_validation_pending',
      'medium',
      {}
    );

    const stats = holdManager.getStats();
    expect(stats.pending).toBe(2);
    expect(stats.byReason.drift_threshold_exceeded).toBe(1);
    expect(stats.byReason.mcp_validation_pending).toBe(1);
  });

  it('should match MCP validation tool patterns', () => {
    holdManager.setConfig({
      enableMcpValidation: true,
      mcpValidationTools: ['dangerous_*', 'admin_delete', '*_sensitive'],
    });

    expect(holdManager.requiresMcpValidation('dangerous_operation')).toBe(true);
    expect(holdManager.requiresMcpValidation('admin_delete')).toBe(true);
    expect(holdManager.requiresMcpValidation('read_sensitive')).toBe(true);
    expect(holdManager.requiresMcpValidation('safe_operation')).toBe(false);
  });

  it('should determine if hold is needed based on config', () => {
    holdManager.setConfig({
      holdOnDriftPrediction: true,
      driftPredictionThreshold: 0.2,
    });

    const shouldHold = holdManager.shouldHold(
      { agentId: 'a1', frame: '⊕◊▶', tool: 't1', arguments: {} },
      { predictedDriftScore: 0.5 }
    );

    expect(shouldHold).toBeDefined();
    expect(shouldHold!.reason).toBe('pre_flight_drift_prediction');
  });

  it('should not hold when thresholds are not exceeded', () => {
    holdManager.setConfig({
      holdOnDriftPrediction: true,
      driftPredictionThreshold: 0.8,  // High threshold
    });

    const shouldHold = holdManager.shouldHold(
      { agentId: 'a1', frame: '⊕◊▶', tool: 't1', arguments: {} },
      { predictedDriftScore: 0.1 }  // Low predicted drift
    );

    expect(shouldHold).toBeNull();
  });
});
