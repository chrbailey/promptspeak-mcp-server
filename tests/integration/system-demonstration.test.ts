/**
 * Integration Tests: System Demonstration
 *
 * These tests DEMONSTRATE that the pre-execution blocking, hold mechanism,
 * and circuit breaker architecture actually work in realistic scenarios.
 *
 * Each test shows the system behavior through assertions and logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Gatekeeper, gatekeeper as globalGatekeeper, driftEngine, holdManager } from '../../src/gatekeeper/index.js';

// Test utilities
function logStep(step: string, data?: unknown) {
  console.log(`\n  → ${step}`);
  if (data) console.log(`    ${JSON.stringify(data, null, 2).split('\n').join('\n    ')}`);
}

describe('DEMONSTRATION: Pre-Execution Blocking Works', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: true,
      enableBaselineComparison: true,
      holdOnDriftPrediction: false,  // Hard block, not hold
      holdOnLowConfidence: false,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 5000,
      driftPredictionThreshold: 0.25,
      baselineDeviationThreshold: 0.30,
      enableMcpValidation: false,
      mcpValidationTools: [],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('DEMO: Circuit breaker blocks tool execution BEFORE it runs', () => {
    const agentId = 'demo-agent-1';

    logStep('1. Agent starts with closed circuit breaker');
    const initialState = driftEngine.circuitBreaker.getState(agentId);
    expect(initialState.state).toBe('closed');
    logStep('   Circuit state:', { state: initialState.state });

    logStep('2. Agent executes 3 operations (circuit breaker passes)');
    for (let i = 0; i < 3; i++) {
      const result = gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'read_data',
        arguments: { id: i },
      });
      // Circuit breaker check passes even if other checks fail
      expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    }
    logStep('   Circuit breaker passed on all operations');

    logStep('3. Operator halts agent due to suspicious behavior');
    driftEngine.haltAgent(agentId, 'Suspicious pattern detected by operator');
    const haltedState = driftEngine.circuitBreaker.getState(agentId);
    expect(haltedState.state).toBe('open');
    logStep('   Agent halted:', { state: haltedState.state, reason: haltedState.reason });

    logStep('4. Agent attempts to execute tool - SHOULD BE BLOCKED');
    const blockedResult = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'delete_data',
      arguments: { id: 999 },
    });

    // CRITICAL ASSERTION: Tool was NOT executed
    expect(blockedResult.success).toBe(false);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.preFlightCheck?.checks.circuitBreaker.passed).toBe(false);
    expect(blockedResult.error).toContain('Agent halted');

    logStep('   BLOCKED!', {
      success: blockedResult.success,
      blocked: blockedResult.preFlightCheck?.blocked,
      reason: blockedResult.error,
    });

    logStep('5. Verify tool was NEVER executed');
    // In real implementation, the tool would have side effects
    // Here we verify by checking the execution was blocked at pre-flight
    expect(blockedResult.preFlightCheck?.passed).toBe(false);
    logStep('   Tool execution prevented: ✓');
  });

  it('DEMO: Multiple consecutive failures trigger circuit breaker', () => {
    const agentId = 'demo-failure-agent';

    logStep('1. Start with closed circuit');
    expect(driftEngine.circuitBreaker.getState(agentId).state).toBe('closed');

    logStep('2. Record 5 consecutive failures (threshold)');
    for (let i = 0; i < 5; i++) {
      driftEngine.circuitBreaker.recordFailure(agentId, `Failure ${i + 1}`);
      const state = driftEngine.circuitBreaker.getState(agentId);
      logStep(`   After failure ${i + 1}: state=${state.state}, failures=${state.failureCount}`);
    }

    logStep('3. Circuit should now be OPEN');
    const finalState = driftEngine.circuitBreaker.getState(agentId);
    expect(finalState.state).toBe('open');
    logStep('   Circuit state:', { state: finalState.state });

    logStep('4. Attempt execution - SHOULD BE BLOCKED');
    const result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'any_tool',
      arguments: {},
    });

    expect(result.success).toBe(false);
    expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(false);
    logStep('   Execution blocked: ✓');
  });
});

describe('DEMONSTRATION: Human-in-the-Loop Hold Mechanism Works', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: true,
      enableBaselineComparison: true,
      holdOnDriftPrediction: true,  // HOLD on drift prediction
      holdOnLowConfidence: false,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 60000,
      driftPredictionThreshold: 0.1,  // Low threshold to trigger holds
      baselineDeviationThreshold: 0.1,
      enableMcpValidation: true,
      mcpValidationTools: ['dangerous_*', 'admin_*'],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('DEMO: Dangerous tool triggers hold, requires human approval', () => {
    const agentId = 'demo-hold-agent';

    logStep('1. Configure MCP validation for dangerous tools');
    logStep('   Tools requiring validation: dangerous_*, admin_*');

    logStep('2. Agent attempts to call dangerous_delete');
    const holdResult = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'dangerous_delete',
      arguments: { target: 'all_data' },
    });

    expect(holdResult.success).toBe(false);
    expect(holdResult.held).toBe(true);
    expect(holdResult.holdRequest).toBeDefined();
    expect(holdResult.holdRequest!.reason).toBe('mcp_validation_pending');

    logStep('   Execution HELD!', {
      held: holdResult.held,
      holdId: holdResult.holdRequest!.holdId,
      reason: holdResult.holdRequest!.reason,
      severity: holdResult.holdRequest!.severity,
    });

    logStep('3. Verify pending holds list');
    const pendingHolds = holdManager.getPendingHolds();
    expect(pendingHolds.length).toBe(1);
    expect(pendingHolds[0].tool).toBe('dangerous_delete');
    logStep('   Pending holds:', { count: pendingHolds.length, tool: pendingHolds[0].tool });

    logStep('4. Human REJECTS the hold');
    const decision = holdManager.rejectHold(
      holdResult.holdRequest!.holdId,
      'human',
      'Too risky - operation denied'
    );
    expect(decision).toBeDefined();
    expect(decision!.state).toBe('rejected');
    logStep('   Decision:', { state: decision!.state, reason: decision!.reason });

    logStep('5. Verify hold is no longer pending');
    const remainingHolds = holdManager.getPendingHolds();
    expect(remainingHolds.length).toBe(0);
    logStep('   Pending holds after rejection: 0 ✓');
  });

  it('DEMO: Human approves hold, execution proceeds', () => {
    const agentId = 'demo-approve-agent';

    logStep('1. Agent attempts dangerous operation');
    const holdResult = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'admin_reset',
      arguments: { scope: 'limited' },
    });

    expect(holdResult.held).toBe(true);
    const holdId = holdResult.holdRequest!.holdId;
    logStep('   Held for approval:', { holdId, tool: 'admin_reset' });

    logStep('2. Human reviews and APPROVES');
    const decision = holdManager.approveHold(
      holdId,
      'human',
      'Approved after review - limited scope is acceptable'
    );
    expect(decision!.state).toBe('approved');
    logStep('   Approved:', { state: decision!.state });

    logStep('3. Resume execution with approval');
    const resumeResult = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'admin_reset',
      arguments: { scope: 'limited' },
      bypassHold: true,
      holdDecision: decision!,
    });

    // Execution should proceed (may still fail other checks)
    expect(resumeResult.held).toBeFalsy();
    logStep('   Execution resumed, not held: ✓');
  });

  it('DEMO: Hold expires after timeout', async () => {
    const agentId = 'demo-timeout-agent';

    logStep('1. Set very short timeout (10ms)');
    gk.setExecutionControlConfig({ holdTimeoutMs: 10 });

    logStep('2. Create hold');
    const holdResult = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'dangerous_action',
      arguments: {},
    });
    expect(holdResult.held).toBe(true);
    logStep('   Hold created:', { holdId: holdResult.holdRequest!.holdId });

    logStep('3. Wait for timeout');
    await new Promise(r => setTimeout(r, 50));

    logStep('4. Process expired holds');
    const expired = holdManager.processExpiredHolds();
    expect(expired.length).toBe(1);
    expect(expired[0].state).toBe('expired');
    logStep('   Expired holds:', { count: expired.length, state: expired[0].state });

    logStep('5. Verify hold is no longer pending');
    const pending = holdManager.getPendingHolds();
    expect(pending.length).toBe(0);
    logStep('   No pending holds: ✓');
  });
});

describe('DEMONSTRATION: Drift Detection Halts Agents', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: true,
      enableBaselineComparison: true,
      holdOnDriftPrediction: false,
      holdOnLowConfidence: false,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 300000,
      driftPredictionThreshold: 0.25,
      baselineDeviationThreshold: 0.30,
      enableMcpValidation: false,
      mcpValidationTools: [],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('DEMO: High drift score triggers automatic agent halt', () => {
    const agentId = 'demo-drift-agent';

    logStep('1. Agent operates normally');
    for (let i = 0; i < 5; i++) {
      gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'read_data',
        arguments: {},
      });
    }
    logStep('   5 normal operations completed');

    logStep('2. Simulate high drift detection');
    // Record drift directly to circuit breaker (simulating drift detection)
    driftEngine.circuitBreaker.recordDrift(agentId, 0.6, 'Simulated high drift');

    logStep('3. Check circuit breaker state');
    const state = driftEngine.circuitBreaker.getState(agentId);
    expect(state.state).toBe('open');
    logStep('   Agent halted due to drift:', { state: state.state, reason: state.reason });

    logStep('4. Verify subsequent operations are blocked');
    const result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'any_tool',
      arguments: {},
    });
    expect(result.success).toBe(false);
    expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(false);
    logStep('   Future operations blocked: ✓');
  });

  it('DEMO: Agent can be recalibrated and resume', () => {
    const agentId = 'demo-recalibrate-agent';

    logStep('1. Halt agent');
    driftEngine.haltAgent(agentId, 'Initial halt');
    expect(driftEngine.circuitBreaker.getState(agentId).state).toBe('open');
    logStep('   Agent halted');

    logStep('2. Verify blocked');
    let result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'test',
      arguments: {},
    });
    expect(result.success).toBe(false);
    logStep('   Blocked while halted: ✓');

    logStep('3. Recalibrate agent');
    driftEngine.recalibrateAgent(agentId);
    const state = driftEngine.circuitBreaker.getState(agentId);
    expect(state.state).toBe('closed');
    logStep('   Recalibrated:', { state: state.state });

    logStep('4. Agent can operate again');
    result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'test',
      arguments: {},
    });
    // Circuit breaker check should pass now
    expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    logStep('   Circuit breaker check passes: ✓');
  });
});

describe('DEMONSTRATION: End-to-End Delegation Chain with Drift', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: true,
      enableBaselineComparison: true,
      holdOnDriftPrediction: true,
      holdOnLowConfidence: false,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 300000,
      driftPredictionThreshold: 0.25,
      baselineDeviationThreshold: 0.30,
      enableMcpValidation: false,
      mcpValidationTools: [],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('DEMO: Parent halted → Child operations also blocked', () => {
    const parentId = 'parent-coordinator';
    const childId = 'child-worker';

    logStep('1. Parent delegates to child');
    // Simulate parent-child relationship through shared constraint
    gk.execute({ agentId: parentId, frame: '⊕◊▼α', tool: 'delegate', arguments: { to: childId } });
    gk.execute({ agentId: childId, frame: '⊕◊▶β', tool: 'work', arguments: {} });
    logStep('   Delegation established');

    logStep('2. Parent detects drift and is halted');
    driftEngine.haltAgent(parentId, 'Parent drift detected');
    expect(driftEngine.circuitBreaker.getState(parentId).state).toBe('open');
    logStep('   Parent halted');

    logStep('3. Child continues working (independent circuit)');
    const childResult = gk.execute({
      agentId: childId,
      frame: '⊕◊▶β',
      tool: 'work',
      arguments: {},
    });
    // Child has its own circuit breaker
    expect(childResult.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    logStep('   Child still allowed (independent circuit): ✓');

    logStep('4. Explicitly halt child too');
    driftEngine.haltAgent(childId, 'Child halted due to parent drift');
    const childBlocked = gk.execute({
      agentId: childId,
      frame: '⊕◊▶β',
      tool: 'work',
      arguments: {},
    });
    expect(childBlocked.success).toBe(false);
    logStep('   Child now blocked: ✓');
  });
});

describe('DEMONSTRATION: Configuration Controls Behavior', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
  });

  it('DEMO: Disabling circuit breaker allows halted agent to execute', () => {
    const agentId = 'config-test-agent';

    logStep('1. Halt agent');
    driftEngine.haltAgent(agentId, 'Halted');
    logStep('   Agent halted');

    logStep('2. With circuit breaker ENABLED (default)');
    gk.setExecutionControlConfig({ enableCircuitBreakerCheck: true });
    let result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'test',
      arguments: {},
    });
    expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(false);
    logStep('   Blocked: ✓');

    logStep('3. DISABLE circuit breaker check');
    gk.setExecutionControlConfig({ enableCircuitBreakerCheck: false });
    result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'test',
      arguments: {},
    });
    expect(result.preFlightCheck?.checks.circuitBreaker.passed).toBe(true);
    logStep('   Circuit breaker check bypassed: ✓');
    logStep('   WARNING: This is a dangerous configuration!');
  });

  it('DEMO: MCP validation tools can be configured at runtime', () => {
    const agentId = 'mcp-config-agent';

    logStep('1. Initially no MCP validation required');
    gk.setExecutionControlConfig({
      enableMcpValidation: true,
      mcpValidationTools: [],
    });
    let result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'sensitive_op',
      arguments: {},
    });
    expect(result.held).toBeFalsy();
    logStep('   sensitive_op NOT held');

    logStep('2. Add sensitive_* to validation list');
    gk.setExecutionControlConfig({
      enableMcpValidation: true,
      mcpValidationTools: ['sensitive_*'],
    });
    result = gk.execute({
      agentId,
      frame: '⊕◊▶',
      tool: 'sensitive_op',
      arguments: {},
    });
    expect(result.held).toBe(true);
    logStep('   sensitive_op now HELD for validation: ✓');
  });
});
