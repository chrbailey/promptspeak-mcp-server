import { describe, it, expect } from 'vitest';
import {
  Gatekeeper,
  type ToolExecutor,
  type AsyncToolExecutor,
} from '../../src/gatekeeper/index.js';
import { driftEngine } from '../../src/drift/index.js';

// Frame: strict(⊕) financial(◊) execute(▶) secondary(β) + a financial+execute
// tool so coverage passes; permissive thresholds/holds so the pipeline reaches
// STEP 6 (we are exercising execution, not the gating checks here).
const FRAME = '⊕◊▶β';
const TOOL = 'process_payment';

function permissive(opts?: { executor?: ToolExecutor; asyncExecutor?: AsyncToolExecutor }): Gatekeeper {
  driftEngine.reset();
  const gk = new Gatekeeper({ enablePeriodicCleanup: false }, opts);
  gk.setThresholds({ preExecute: 0, postAudit: 0, coverageMinimum: 0, driftThreshold: 1 });
  gk.setExecutionControlConfig({
    enableCircuitBreakerCheck: true,
    enablePreFlightDriftPrediction: false,
    enableBaselineComparison: false,
    holdOnDriftPrediction: false,
    holdOnLowConfidence: false,
    enableMcpValidation: false,
  });
  return gk;
}

describe('Gatekeeper.executeAsync', () => {
  it('awaits a registered async executor and returns its resolved value', async () => {
    const seen: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const asyncExecutor: AsyncToolExecutor = async (tool, args) => {
      await Promise.resolve();
      seen.push({ tool, args });
      return { ok: true, echoed: args };
    };
    const gk = permissive({ asyncExecutor });
    expect(gk.hasAsyncExecutor()).toBe(true);

    const res = await gk.executeAsync({ agentId: 'aa1', frame: FRAME, tool: TOOL, arguments: { amt: 5 } });

    expect(res.success).toBe(true);
    expect(res.allowed).toBe(true);
    expect(res.result).toEqual({ ok: true, echoed: { amt: 5 } });
    expect(seen).toEqual([{ tool: TOOL, args: { amt: 5 } }]);
  });

  it('treats a rejected async executor as a failed execution, not a crash', async () => {
    const asyncExecutor: AsyncToolExecutor = async () => {
      throw new Error('async boom');
    };
    const gk = permissive({ asyncExecutor });

    const res = await gk.executeAsync({ agentId: 'aa2', frame: FRAME, tool: TOOL, arguments: {} });

    expect(res.success).toBe(false);
    expect(res.allowed).toBe(true);
    expect(res.error).toBe('async boom');
    expect(res.result).toMatchObject({ executed: false, error: 'async boom' });
  });

  it('falls back to the sync executor when no async executor is registered', async () => {
    const executor: ToolExecutor = () => ({ viaSync: true });
    const gk = permissive({ executor });
    expect(gk.hasAsyncExecutor()).toBe(false);

    const res = await gk.executeAsync({ agentId: 'aa3', frame: FRAME, tool: TOOL, arguments: {} });
    expect(res.result).toEqual({ viaSync: true });
  });

  it('falls back to simulation when neither executor is registered', async () => {
    const gk = permissive();
    const res = await gk.executeAsync({ agentId: 'aa4', frame: FRAME, tool: TOOL, arguments: {} });
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ tool: TOOL, executed: true });
  });

  it('applies the same governance gate as execute() (circuit breaker blocks)', async () => {
    const asyncExecutor: AsyncToolExecutor = async () => ({ shouldNotRun: true });
    const gk = permissive({ asyncExecutor });
    driftEngine.haltAgent('aa5', 'halted for test');

    const res = await gk.executeAsync({ agentId: 'aa5', frame: FRAME, tool: TOOL, arguments: {} });

    expect(res.allowed).toBe(false);
    expect(res.success).toBe(false);
    expect(res.result).toBeUndefined(); // executor never ran
  });

  it('can register/clear the async executor after construction', async () => {
    const gk = permissive();
    gk.setAsyncExecutor(async () => ({ late: true }));
    expect(gk.hasAsyncExecutor()).toBe(true);
    const res = await gk.executeAsync({ agentId: 'aa6', frame: FRAME, tool: TOOL, arguments: {} });
    expect(res.result).toEqual({ late: true });
    gk.setAsyncExecutor(undefined);
    expect(gk.hasAsyncExecutor()).toBe(false);
  });

  it('parity: async simulation path matches sync execute() result shape', async () => {
    const syncRes = permissive().execute({ agentId: 'p1', frame: FRAME, tool: TOOL, arguments: {} });
    const asyncRes = await permissive().executeAsync({ agentId: 'p1', frame: FRAME, tool: TOOL, arguments: {} });
    expect(asyncRes.success).toBe(syncRes.success);
    expect(asyncRes.allowed).toBe(syncRes.allowed);
    expect(asyncRes.result).toMatchObject({ tool: TOOL, executed: true });
  });
});
