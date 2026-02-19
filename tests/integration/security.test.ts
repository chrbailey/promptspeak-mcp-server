import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleSecurityScan,
  handleSecurityGate,
  handleSecurityConfig,
  resetSecurityPatterns,
} from '../../src/tools/ps_security.js';
import { SecurityScanner } from '../../src/security/scanner.js';
import { ActionInterceptor } from '../../src/gatekeeper/interceptor.js';
import type { ResolvedFrame, SymbolDefinition } from '../../src/types/index.js';

/**
 * Build a ResolvedFrame that passes checks 1-5 for write actions.
 */
function makeOperationalFrame(): ResolvedFrame {
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
  };
}

describe('Security enforcement integration', () => {
  beforeEach(() => {
    resetSecurityPatterns();
  });

  describe('full pipeline: tool → scanner → enforcement', () => {
    it('should block SQL injection through the full pipeline', async () => {
      const result = await handleSecurityGate({
        content: 'const q = `SELECT * FROM users WHERE id = ${input}`',
        action: 'write_file',
      });
      expect(result.decision).toBe('blocked');
      expect(result.scan.enforcement.blocked.length).toBeGreaterThan(0);
      expect(result.scan.enforcement.blocked[0].patternId).toBe('sql-injection');
      expect(result.scan.enforcement.blocked[0].suggestion).toContain('parameterized');
    });

    it('should hold high-severity and include scan details', async () => {
      const result = await handleSecurityGate({
        content: '// TODO: add authentication before going live',
        action: 'write_file',
      });
      expect(result.decision).toBe('held');
      expect(result.scan.enforcement.held[0].patternId).toBe('security-todo');
      expect(result.scan.enforcement.held[0].line).toBe(1);
    });

    it('should pass clean code through without findings', async () => {
      const code = [
        'function add(a: number, b: number): number {',
        '  return a + b;',
        '}',
        '',
        'export { add };',
      ].join('\n');

      const result = await handleSecurityGate({
        content: code,
        action: 'write_file',
      });
      expect(result.decision).toBe('allowed');
      expect(result.scan.findings).toHaveLength(0);
    });
  });

  describe('config affects scan results', () => {
    it('should respect disabled patterns end-to-end', async () => {
      // SQL injection blocks by default
      const before = await handleSecurityGate({
        content: 'const q = `SELECT * FROM users WHERE id = ${id}`',
        action: 'write_file',
      });
      expect(before.decision).toBe('blocked');

      // Disable sql-injection
      const configResult = await handleSecurityConfig({
        action: 'disable',
        patternId: 'sql-injection',
      });
      expect(configResult.success).toBe(true);

      // Should no longer block
      const after = await handleSecurityGate({
        content: 'const q = `SELECT * FROM users WHERE id = ${id}`',
        action: 'write_file',
      });
      expect(after.decision).not.toBe('blocked');
    });

    it('should respect severity changes end-to-end', async () => {
      // suppressed-errors is medium (warns) by default
      const before = await handleSecurityGate({
        content: 'catch (e) {}',
        action: 'write_file',
      });
      expect(before.decision).toBe('warned');

      // Elevate to critical
      await handleSecurityConfig({
        action: 'set_severity',
        patternId: 'suppressed-errors',
        severity: 'critical',
      });

      // Should now block
      const after = await handleSecurityGate({
        content: 'catch (e) {}',
        action: 'write_file',
      });
      expect(after.decision).toBe('blocked');
    });
  });

  describe('interceptor pipeline integration', () => {
    it('should block critical findings in interceptor Check 6', () => {
      const interceptor = new ActionInterceptor();
      const frame = makeOperationalFrame();

      const decision = interceptor.intercept(
        frame,
        'write_file',
        { content: 'const api_key = "sk-1234567890abcdef"', path: 'src/config.ts' },
        'agent-integration-1'
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Security');
      expect(decision.reason).toContain('hardcoded-secret');
    });

    it('should allow clean code through all 6 checks', () => {
      const interceptor = new ActionInterceptor();
      const frame = makeOperationalFrame();

      const decision = interceptor.intercept(
        frame,
        'write_file',
        { content: 'export function greet(name: string) { return `Hello, ${name}`; }', path: 'src/greet.ts' },
        'agent-integration-2'
      );

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('Action allowed');
    });

    it('should not scan read actions in interceptor', () => {
      const interceptor = new ActionInterceptor();
      const frame = makeOperationalFrame();

      const decision = interceptor.intercept(
        frame,
        'read_file',
        { content: 'const password = "supersecretpassword1"', path: 'src/secrets.ts' },
        'agent-integration-3'
      );

      // Should pass — read_file is not a write action
      expect(decision.allowed).toBe(true);
    });
  });

  describe('scan performance', () => {
    it('should scan typical file content in under 10ms', () => {
      const scanner = new SecurityScanner();
      const code = Array(100).fill('const x = computeValue(input);').join('\n');

      const start = performance.now();
      const result = scanner.scan(code);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('multiple findings in single scan', () => {
    it('should detect multiple vulnerability types in one file', async () => {
      const code = [
        'const api_key = "sk-1234567890abcdef";',       // critical: hardcoded-secret
        'const q = `DELETE FROM users WHERE id = ${id}`;', // critical: sql-injection
        '// TODO: add authentication',                    // high: security-todo
        'console.log("token:", token);',                  // high: console-log-sensitive
        'catch (err) {}',                                 // medium: suppressed-errors
        'DROP TABLE sessions',                            // low: destructive-db
      ].join('\n');

      const result = await handleSecurityScan({ content: code });

      expect(result.enforcement.blocked.length).toBeGreaterThanOrEqual(2);
      expect(result.enforcement.held.length).toBeGreaterThanOrEqual(2);
      expect(result.enforcement.warned.length).toBeGreaterThanOrEqual(1);
      expect(result.enforcement.logged.length).toBeGreaterThanOrEqual(1);

      // Gate should block (critical takes priority)
      const gate = await handleSecurityGate({ content: code, action: 'write_file' });
      expect(gate.decision).toBe('blocked');
    });
  });
});
