import { describe, it, expect, beforeEach } from 'vitest';
import { ActionInterceptor } from '../../../src/gatekeeper/interceptor.js';
import type { ResolvedFrame, SymbolDefinition } from '../../../src/types/index.js';

/**
 * Build a minimal ResolvedFrame that passes checks 1-5.
 * Tool bindings allow everything via wildcard.
 */
function makeFrame(overrides?: Partial<ResolvedFrame>): ResolvedFrame {
  const baseDef: SymbolDefinition = { name: 'strict', canonical: '⊕', color: 'red', category: 'modes' };
  return {
    raw: '⊕◐▶',
    symbols: [],
    mode: '⊕',
    modifiers: [],
    domain: '◐',
    source: null,
    constraints: [],
    action: '▶',
    entity: null,
    metadata: {},
    parseConfidence: 1.0,
    effectiveMode: { ...baseDef },
    effectiveDomain: { ...baseDef, name: 'operational', canonical: '◐' },
    effectiveAction: { ...baseDef, name: 'execute', canonical: '▶' },
    toolBindings: { blocked: [], allowed: ['*'] },
    ...overrides,
  };
}

describe('ActionInterceptor - Check 6: Security scan', () => {
  let interceptor: ActionInterceptor;

  beforeEach(() => {
    interceptor = new ActionInterceptor();
  });

  it('should block when proposed write action contains critical security finding', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { content: 'const q = `SELECT * FROM users WHERE id = ${id}`', path: 'src/db.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Security');
    expect(decision.reason).toContain('critical');
    expect(decision.reason).toContain('sql-injection');
  });

  it('should block when proposed write action contains hardcoded secret', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { content: 'const api_key = "sk-reallyLongSecretKey1234"', path: 'src/config.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('critical');
    expect(decision.reason).toContain('hardcoded-secret');
  });

  it('should block (held) for high-severity findings', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { content: '// TODO: add password validation before deploy', path: 'src/auth.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('high-severity');
    expect(decision.reason).toContain('held for review');
  });

  it('should allow clean code through', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { content: 'const sum = a + b;', path: 'src/math.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(true);
  });

  it('should only scan write-type actions', () => {
    const frame = makeFrame();
    // read_file should not trigger scan even with SQL injection in args
    const decision = interceptor.intercept(
      frame,
      'read_file',
      { content: 'const q = `SELECT * FROM users WHERE id = ${id}`', path: 'src/db.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(true);
  });

  it('should skip scan when no content arg is provided', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { path: 'src/empty.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(true);
  });

  it('should allow medium-severity warnings through but log them', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'write_file',
      { content: 'catch (e) {}', path: 'src/handler.ts' },
      'agent-1'
    );
    // Medium warnings don't block
    expect(decision.allowed).toBe(true);
  });

  it('should scan edit_file actions', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'edit_file',
      { content: 'const password = "hunter2hunter2"', path: 'src/auth.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('hardcoded-secret');
  });

  it('should scan create_file actions', () => {
    const frame = makeFrame();
    const decision = interceptor.intercept(
      frame,
      'create_file',
      { content: 'const secret_key = "mysupersecretkey1234"', path: 'src/new.ts' },
      'agent-1'
    );
    expect(decision.allowed).toBe(false);
  });
});
