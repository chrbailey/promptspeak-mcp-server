/**
 * System Stress Tests
 *
 * Tests the system under extreme load to verify:
 * - Concurrent execution blocking works correctly
 * - Hold mechanism scales under load
 * - Circuit breaker state is consistent
 * - No race conditions in pre-execution checks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Gatekeeper, driftEngine, holdManager } from '../../src/gatekeeper/index.js';

describe('STRESS: Circuit Breaker Under Extreme Load', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: false,
      enableBaselineComparison: false,
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

  it('STRESS: 1000 concurrent executions with halted agent', async () => {
    const agentId = 'stress-agent';
    const numExecutions = 1000;

    // Halt the agent
    driftEngine.haltAgent(agentId, 'Stress test halt');

    // Fire 1000 concurrent executions
    const startTime = Date.now();
    const promises = Array.from({ length: numExecutions }, (_, i) =>
      Promise.resolve(gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: `tool_${i}`,
        arguments: { index: i },
      }))
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();

    // ALL should be blocked
    const blockedCount = results.filter(r => !r.success && !r.allowed).length;
    const circuitBreakerBlockedCount = results.filter(
      r => r.preFlightCheck?.checks.circuitBreaker.passed === false
    ).length;

    expect(blockedCount).toBe(numExecutions);
    expect(circuitBreakerBlockedCount).toBe(numExecutions);

    console.log(`\n  STRESS: ${numExecutions} executions blocked in ${endTime - startTime}ms`);
    console.log(`  Rate: ${(numExecutions / (endTime - startTime) * 1000).toFixed(0)} ops/sec`);
  });

  it('STRESS: Rapid halt/resume cycles with concurrent executions', async () => {
    const agentId = 'cycle-agent';
    const cycles = 100;
    let blockedWhileHalted = 0;
    let allowedWhileOpen = 0;

    for (let i = 0; i < cycles; i++) {
      // Halt
      driftEngine.haltAgent(agentId, `Cycle ${i}`);

      // Try execution while halted
      const haltedResult = gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test',
        arguments: {},
      });
      if (!haltedResult.preFlightCheck?.checks.circuitBreaker.passed) {
        blockedWhileHalted++;
      }

      // Resume
      driftEngine.resumeAgent(agentId);

      // Try execution while resumed
      const resumedResult = gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test',
        arguments: {},
      });
      if (resumedResult.preFlightCheck?.checks.circuitBreaker.passed) {
        allowedWhileOpen++;
      }
    }

    // All should be correct
    expect(blockedWhileHalted).toBe(cycles);
    expect(allowedWhileOpen).toBe(cycles);

    console.log(`\n  STRESS: ${cycles} halt/resume cycles completed`);
    console.log(`  Blocked while halted: ${blockedWhileHalted}/${cycles}`);
    console.log(`  Allowed while open: ${allowedWhileOpen}/${cycles}`);
  });

  it('STRESS: 500 agents with mixed states', async () => {
    const numAgents = 500;
    const agents = Array.from({ length: numAgents }, (_, i) => `agent-${i}`);

    // Halt half the agents
    agents.slice(0, numAgents / 2).forEach(agentId => {
      driftEngine.haltAgent(agentId, 'Half halted');
    });

    // Execute on all agents
    const startTime = Date.now();
    const results = await Promise.all(
      agents.map(agentId =>
        Promise.resolve({
          agentId,
          result: gk.execute({
            agentId,
            frame: '⊕◊▶',
            tool: 'test',
            arguments: {},
          }),
        })
      )
    );
    const endTime = Date.now();

    // Check results
    const haltedAgents = new Set(agents.slice(0, numAgents / 2));
    let correctlyBlocked = 0;
    let correctlyAllowed = 0;

    results.forEach(({ agentId, result }) => {
      if (haltedAgents.has(agentId)) {
        if (!result.preFlightCheck?.checks.circuitBreaker.passed) {
          correctlyBlocked++;
        }
      } else {
        if (result.preFlightCheck?.checks.circuitBreaker.passed) {
          correctlyAllowed++;
        }
      }
    });

    expect(correctlyBlocked).toBe(numAgents / 2);
    expect(correctlyAllowed).toBe(numAgents / 2);

    console.log(`\n  STRESS: ${numAgents} agents processed in ${endTime - startTime}ms`);
    console.log(`  Correctly blocked: ${correctlyBlocked}`);
    console.log(`  Correctly allowed: ${correctlyAllowed}`);
  });
});

describe('STRESS: Hold Mechanism Under Load', () => {
  let gk: Gatekeeper;

  beforeEach(() => {
    gk = new Gatekeeper();
    driftEngine.reset();
    holdManager.clearAll();
    gk.setExecutionControlConfig({
      enableCircuitBreakerCheck: true,
      enablePreFlightDriftPrediction: false,
      enableBaselineComparison: false,
      holdOnDriftPrediction: false,
      holdOnLowConfidence: false,
      holdOnForbiddenWithOverride: false,
      holdTimeoutMs: 60000,
      driftPredictionThreshold: 0.25,
      baselineDeviationThreshold: 0.30,
      enableMcpValidation: true,
      mcpValidationTools: ['hold_*'],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('STRESS: Create 500 concurrent holds', async () => {
    const numHolds = 500;

    const startTime = Date.now();
    const results = await Promise.all(
      Array.from({ length: numHolds }, (_, i) =>
        Promise.resolve(gk.execute({
          agentId: `hold-agent-${i}`,
          frame: '⊕◊▶',
          tool: 'hold_operation',
          arguments: { index: i },
        }))
      )
    );
    const endTime = Date.now();

    // All should be held
    const heldCount = results.filter(r => r.held).length;
    expect(heldCount).toBe(numHolds);

    // Check pending holds
    const pendingHolds = holdManager.getPendingHolds();
    expect(pendingHolds.length).toBe(numHolds);

    console.log(`\n  STRESS: ${numHolds} holds created in ${endTime - startTime}ms`);
    console.log(`  Rate: ${(numHolds / (endTime - startTime) * 1000).toFixed(0)} holds/sec`);
    console.log(`  Pending holds: ${pendingHolds.length}`);
  });

  it('STRESS: Approve 200 holds rapidly', async () => {
    const numHolds = 200;

    // Create holds
    const holdResults = await Promise.all(
      Array.from({ length: numHolds }, (_, i) =>
        Promise.resolve(gk.execute({
          agentId: `approve-agent-${i}`,
          frame: '⊕◊▶',
          tool: 'hold_operation',
          arguments: { index: i },
        }))
      )
    );

    const holdIds = holdResults.map(r => r.holdRequest!.holdId);

    // Approve all holds
    const startTime = Date.now();
    const approvals = holdIds.map(holdId =>
      holdManager.approveHold(holdId, 'human', 'Mass approved')
    );
    const endTime = Date.now();

    const approvedCount = approvals.filter(d => d?.state === 'approved').length;
    expect(approvedCount).toBe(numHolds);

    // Verify no pending holds
    const remaining = holdManager.getPendingHolds();
    expect(remaining.length).toBe(0);

    console.log(`\n  STRESS: ${numHolds} holds approved in ${endTime - startTime}ms`);
    console.log(`  Rate: ${(numHolds / (endTime - startTime) * 1000).toFixed(0)} approvals/sec`);
  });

  it('STRESS: Mixed approve/reject under load', async () => {
    const numHolds = 300;

    // Create holds
    const holdResults = await Promise.all(
      Array.from({ length: numHolds }, (_, i) =>
        Promise.resolve(gk.execute({
          agentId: `mixed-agent-${i}`,
          frame: '⊕◊▶',
          tool: 'hold_operation',
          arguments: { index: i },
        }))
      )
    );

    const startTime = Date.now();
    const decisions = holdResults.map((r, i) => {
      if (i % 2 === 0) {
        return holdManager.approveHold(r.holdRequest!.holdId, 'human', 'Approved');
      } else {
        return holdManager.rejectHold(r.holdRequest!.holdId, 'human', 'Rejected');
      }
    });
    const endTime = Date.now();

    const approved = decisions.filter(d => d?.state === 'approved').length;
    const rejected = decisions.filter(d => d?.state === 'rejected').length;

    expect(approved).toBe(numHolds / 2);
    expect(rejected).toBe(numHolds / 2);

    console.log(`\n  STRESS: ${numHolds} mixed decisions in ${endTime - startTime}ms`);
    console.log(`  Approved: ${approved}, Rejected: ${rejected}`);
  });
});

describe('STRESS: Full System Under Load', () => {
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
      enableMcpValidation: true,
      mcpValidationTools: ['mcp_*'],
      haltOnCriticalDrift: true,
      haltOnHighDrift: true,
    });
  });

  it('STRESS: Mixed operations - halted, held, and allowed', async () => {
    const numOperations = 600;
    const haltedAgents = new Set(['halted-1', 'halted-2', 'halted-3']);
    const mcpTools = ['mcp_tool_1', 'mcp_tool_2'];
    const normalTools = ['read', 'write', 'update'];

    // Halt some agents
    haltedAgents.forEach(agentId => {
      driftEngine.haltAgent(agentId, 'Pre-halted');
    });

    const operations = Array.from({ length: numOperations }, (_, i) => {
      const agentId = i < 100 ? Array.from(haltedAgents)[i % 3] :
                      i < 200 ? `mcp-agent-${i}` :
                      `normal-agent-${i}`;
      const tool = i < 100 ? normalTools[i % 3] :
                   i < 200 ? mcpTools[i % 2] :
                   normalTools[i % 3];
      return { agentId, tool };
    });

    const startTime = Date.now();
    const results = await Promise.all(
      operations.map(({ agentId, tool }) =>
        Promise.resolve({
          agentId,
          tool,
          result: gk.execute({
            agentId,
            frame: '⊕◊▶',
            tool,
            arguments: {},
          }),
        })
      )
    );
    const endTime = Date.now();

    // Analyze results
    let circuitBreakerBlocked = 0;
    let held = 0;
    let proceededToExecution = 0;

    results.forEach(({ agentId, tool, result }) => {
      if (haltedAgents.has(agentId)) {
        if (!result.preFlightCheck?.checks.circuitBreaker.passed) {
          circuitBreakerBlocked++;
        }
      } else if (tool.startsWith('mcp_')) {
        if (result.held) {
          held++;
        }
      } else {
        if (result.preFlightCheck?.passed) {
          proceededToExecution++;
        }
      }
    });

    // Verify expected behavior
    expect(circuitBreakerBlocked).toBe(100);  // First 100 from halted agents
    expect(held).toBe(100);  // Next 100 with MCP tools

    console.log(`\n  STRESS: ${numOperations} mixed operations in ${endTime - startTime}ms`);
    console.log(`  Circuit breaker blocked: ${circuitBreakerBlocked}`);
    console.log(`  Held for approval: ${held}`);
    console.log(`  Proceeded to execution: ${proceededToExecution}`);
    console.log(`  Throughput: ${(numOperations / (endTime - startTime) * 1000).toFixed(0)} ops/sec`);
  });

  it('STRESS: Memory stability under sustained load', async () => {
    const iterations = 10;
    const opsPerIteration = 100;

    const memoryBefore = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    for (let iter = 0; iter < iterations; iter++) {
      // Create holds
      const results = await Promise.all(
        Array.from({ length: opsPerIteration }, (_, i) =>
          Promise.resolve(gk.execute({
            agentId: `mem-agent-${iter}-${i}`,
            frame: '⊕◊▶',
            tool: 'mcp_operation',
            arguments: { iter, i },
          }))
        )
      );

      // Approve all holds
      results.forEach(r => {
        if (r.holdRequest) {
          holdManager.approveHold(r.holdRequest.holdId, 'system', 'Auto-approved');
        }
      });

      // Reset for next iteration
      holdManager.clearAll();
    }

    const endTime = Date.now();
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryDelta = (memoryAfter - memoryBefore) / 1024 / 1024;

    console.log(`\n  STRESS: ${iterations * opsPerIteration} total operations`);
    console.log(`  Duration: ${endTime - startTime}ms`);
    console.log(`  Memory delta: ${memoryDelta.toFixed(2)} MB`);

    // Memory growth should be reasonable (< 50MB for this test)
    expect(memoryDelta).toBeLessThan(50);
  });
});

describe('STRESS: Timing Critical Operations', () => {
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

  it('STRESS: Measure pre-execution check latency', () => {
    const agentId = 'latency-agent';
    const iterations = 1000;
    const latencies: number[] = [];

    // Halt agent for circuit breaker path
    driftEngine.haltAgent(agentId, 'Latency test');

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      gk.execute({
        agentId,
        frame: '⊕◊▶',
        tool: 'test',
        arguments: {},
      });
      const end = performance.now();
      latencies.push(end - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

    console.log(`\n  LATENCY: Pre-execution check (circuit breaker blocked path)`);
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Avg: ${avgLatency.toFixed(3)}ms`);
    console.log(`  Min: ${minLatency.toFixed(3)}ms`);
    console.log(`  Max: ${maxLatency.toFixed(3)}ms`);
    console.log(`  P95: ${p95.toFixed(3)}ms`);
    console.log(`  P99: ${p99.toFixed(3)}ms`);

    // Pre-execution check should be fast (< 1ms average)
    expect(avgLatency).toBeLessThan(1);
  });

  it('STRESS: Measure full execution path latency', () => {
    const iterations = 500;
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      gk.execute({
        agentId: `full-path-${i}`,
        frame: '⊕◊▶',
        tool: 'test',
        arguments: { index: i },
      });
      const end = performance.now();
      latencies.push(end - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    console.log(`\n  LATENCY: Full execution path (all checks pass)`);
    console.log(`  Iterations: ${iterations}`);
    console.log(`  Avg: ${avgLatency.toFixed(3)}ms`);
    console.log(`  P95: ${p95.toFixed(3)}ms`);

    // Full execution should still be fast (< 5ms average)
    expect(avgLatency).toBeLessThan(5);
  });
});
