import { describe, it, expect, beforeEach } from 'vitest';
import { Gatekeeper, type ToolExecutor } from '../../src/gatekeeper/index.js';
import { driftEngine } from '../../src/drift/index.js';
import {
  DeterministicEmbeddingProvider,
  serializeContext,
} from '../../src/utils/embedding-provider.js';
import {
  generateContentEmbedding,
  blendEmbeddings,
  euclideanDistance,
} from '../../src/utils/embeddings.js';
import { TripwireInjector } from '../../src/drift/tripwire.js';
import type { ParsedFrame } from '../../src/types/index.js';

function frame(raw: string): ParsedFrame {
  return {
    raw,
    symbols: [...raw].map((s) => ({
      symbol: s,
      category: 'unknown' as const,
      definition: { name: s, canonical: s, color: '#888888', category: 'unknown' },
    })),
    mode: raw[0],
    modifiers: [],
    domain: null,
    source: null,
    constraints: [],
    action: null,
    entity: null,
    metadata: {},
  } as ParsedFrame;
}

// ───────────────────────────────────────────────────────────────────────────
// GAP 1: Pluggable tool executor (was: simulateToolExecution stub)
// ───────────────────────────────────────────────────────────────────────────
describe('Gatekeeper executor seam', () => {
  // Frame: strict(⊕) financial(◊) execute(▶) secondary(β). Use a financial+execute
  // tool so coverage passes; make thresholds/holds permissive so the pipeline
  // reaches STEP 6 (we are testing execution, not the gating checks here).
  const validFrame = '⊕◊▶β';
  const financialTool = 'process_payment';

  function permissiveGatekeeper(executor?: ToolExecutor): Gatekeeper {
    driftEngine.reset();
    const gk = new Gatekeeper(
      { enablePeriodicCleanup: false },
      executor ? { executor } : undefined
    );
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

  it('defaults to simulation when no executor is registered', () => {
    const gk = permissiveGatekeeper();
    expect(gk.hasExecutor()).toBe(false);
    const res = gk.execute({ agentId: 'a1', frame: validFrame, tool: financialTool, arguments: {} });
    expect(res.allowed).toBe(true);
    expect(res.success).toBe(true);
    // Simulated result shape
    expect(res.result).toMatchObject({ tool: financialTool, executed: true });
  });

  it('invokes a registered executor and returns its result', () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const executor: ToolExecutor = (tool, args) => {
      calls.push({ tool, args });
      return { ok: true, echoed: args };
    };
    const gk = permissiveGatekeeper(executor);
    expect(gk.hasExecutor()).toBe(true);

    const res = gk.execute({
      agentId: 'a2',
      frame: validFrame,
      tool: financialTool,
      arguments: { x: 1 },
    });

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ ok: true, echoed: { x: 1 } });
    expect(calls).toEqual([{ tool: financialTool, args: { x: 1 } }]);
  });

  it('treats an executor throw as a failed execution, not a crash', () => {
    const executor: ToolExecutor = () => {
      throw new Error('boom');
    };
    const gk = permissiveGatekeeper(executor);

    const res = gk.execute({ agentId: 'a3', frame: validFrame, tool: financialTool, arguments: {} });

    expect(res.success).toBe(false);
    expect(res.allowed).toBe(true);
    expect(res.error).toBe('boom');
    expect(res.result).toMatchObject({ executed: false, error: 'boom' });
  });

  it('can register/clear an executor after construction', () => {
    const gk = permissiveGatekeeper();
    gk.setExecutor(() => ({ ran: true }));
    expect(gk.hasExecutor()).toBe(true);
    expect(
      gk.execute({ agentId: 'a4', frame: validFrame, tool: financialTool, arguments: {} }).result
    ).toEqual({ ran: true });
    gk.setExecutor(undefined);
    expect(gk.hasExecutor()).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GAP 2: Content-aware, pluggable embeddings (was: glyph-only pseudo-embedding)
// ───────────────────────────────────────────────────────────────────────────
describe('Content-aware embeddings', () => {
  const provider = new DeterministicEmbeddingProvider();

  it('serializes context stably regardless of key order', () => {
    const a = serializeContext({ args: { b: 2, a: 1 } });
    const b = serializeContext({ args: { a: 1, b: 2 } });
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  it('returns frame-only embedding when no behavioral context (backward compatible)', () => {
    const f = frame('⊕◊▶β');
    const withoutContext = provider.embed({ frame: f });
    const emptyContext = provider.embed({ frame: f, context: {} });
    expect(withoutContext).toEqual(emptyContext);
  });

  it('produces different embeddings for same frame but different content', () => {
    const f = frame('⊕◊▶β');
    const e1 = provider.embed({ frame: f, context: { args: { amount: 100 } } });
    const e2 = provider.embed({ frame: f, context: { args: { amount: 999999 } } });
    expect(euclideanDistance(e1, e2)).toBeGreaterThan(0);
  });

  it('is deterministic for identical inputs', () => {
    const f = frame('⊕◊▶β');
    const e1 = provider.embed({ frame: f, context: { args: { amount: 100 } } });
    const e2 = provider.embed({ frame: f, context: { args: { amount: 100 } } });
    expect(e1).toEqual(e2);
  });

  it('content embedding is normalized and content-sensitive', () => {
    const v = generateContentEmbedding('write_file:/etc/passwd');
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(mag).toBeCloseTo(1, 5);
    expect(euclideanDistance(v, generateContentEmbedding('read_file:/tmp/ok'))).toBeGreaterThan(0);
  });

  it('blend respects weighting', () => {
    const a = generateContentEmbedding('aaaa');
    const b = generateContentEmbedding('bbbb');
    expect(blendEmbeddings(a, b, 1)).toEqual(a);
  });
});

describe('Drift reacts to behavioral content', () => {
  beforeEach(() => driftEngine.reset());

  it('accumulates non-zero drift when same frame is used with diverging content', () => {
    const agent = 'drift-agent';
    const f = '⊕◊▶β';
    // Establish a stable pattern.
    for (let i = 0; i < 6; i++) {
      driftEngine.recordOperation(agent, f, 'pay', true, { args: { amount: 100 } });
    }
    // Then diverge sharply in content under the identical frame.
    for (let i = 0; i < 6; i++) {
      driftEngine.recordOperation(agent, f, 'pay', true, {
        args: { amount: 10_000_000, dest: 'unknown' },
      });
    }
    const status = driftEngine.getAgentStatus(agent);
    expect(status.driftScore).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GAP 4: Crypto-backed tripwire RNG (was: Math.random)
// ───────────────────────────────────────────────────────────────────────────
describe('Tripwire crypto RNG', () => {
  it('honors injection rate bounds deterministically at extremes', () => {
    const tw = new TripwireInjector();
    tw.setInjectionRate(0);
    expect(Array.from({ length: 50 }, () => tw.shouldInject()).some(Boolean)).toBe(false);
    tw.setInjectionRate(1);
    expect(Array.from({ length: 50 }, () => tw.shouldInject()).every(Boolean)).toBe(true);
  });

  it('returns well-formed tripwire cases', () => {
    const tw = new TripwireInjector();
    for (let i = 0; i < 20; i++) {
      const t = tw.getRandomTripwire();
      expect(['valid', 'invalid']).toContain(t.type);
      expect(typeof t.frame).toBe('string');
      expect(['accept', 'reject']).toContain(t.expectedOutcome);
    }
    expect(tw.getTripwire('valid').type).toBe('valid');
    expect(tw.getTripwire('invalid').type).toBe('invalid');
  });
});
