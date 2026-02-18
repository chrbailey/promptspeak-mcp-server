import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleSecurityScan,
  handleSecurityGate,
  handleSecurityConfig,
  resetSecurityPatterns,
} from '../../../src/tools/ps_security.js';

describe('ps_security_scan', () => {
  it('should scan content and return findings', async () => {
    const result = await handleSecurityScan({
      content: 'const api_key = "sk-test1234567890"',
    });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].patternId).toBe('hardcoded-secret');
  });

  it('should return clean result for safe code', async () => {
    const result = await handleSecurityScan({ content: 'const x = 1;' });
    expect(result.findings).toHaveLength(0);
  });

  it('should filter by pattern IDs when specified', async () => {
    const code = [
      'const api_key = "sk-1234567890abcdef"',
      'const q = `SELECT * FROM users WHERE id = ${id}`',
    ].join('\n');
    const result = await handleSecurityScan({
      content: code,
      patterns: ['sql-injection'],
    });
    expect(result.findings.every(f => f.patternId === 'sql-injection')).toBe(true);
  });

  it('should return scan metadata', async () => {
    const code = 'const x = 1;';
    const result = await handleSecurityScan({ content: code });
    expect(result.scannedAt).toBeDefined();
    expect(result.contentLength).toBe(code.length);
    expect(result.patternsChecked).toBeGreaterThan(0);
  });
});

describe('ps_security_gate', () => {
  it('should block on critical findings', async () => {
    const result = await handleSecurityGate({
      content: 'const q = `SELECT * FROM users WHERE id = ${input}`',
      action: 'write_file',
    });
    expect(result.decision).toBe('blocked');
    expect(result.reason).toContain('critical');
  });

  it('should hold on high findings', async () => {
    const result = await handleSecurityGate({
      content: '// TODO: must add authentication before deploy',
      action: 'write_file',
    });
    expect(result.decision).toBe('held');
    expect(result.reason).toContain('high-severity');
  });

  it('should warn on medium findings', async () => {
    const result = await handleSecurityGate({
      content: 'catch (e) {}',
      action: 'write_file',
    });
    expect(result.decision).toBe('warned');
    expect(result.reason).toContain('medium-severity');
  });

  it('should allow clean code', async () => {
    const result = await handleSecurityGate({
      content: 'const x = 1 + 2;',
      action: 'write_file',
    });
    expect(result.decision).toBe('allowed');
    expect(result.reason).toBe('No security findings');
  });

  it('should prioritize critical over high', async () => {
    const result = await handleSecurityGate({
      content: [
        'const api_key = "sk-1234567890abcdef"',
        '// TODO: add authentication',
      ].join('\n'),
      action: 'write_file',
    });
    expect(result.decision).toBe('blocked');
  });
});

describe('ps_security_config', () => {
  beforeEach(() => {
    resetSecurityPatterns();
  });

  it('should list all patterns with current state', async () => {
    const result = await handleSecurityConfig({ action: 'list' });
    expect(result.success).toBe(true);
    expect(result.patterns!.length).toBeGreaterThan(0);
    expect(result.patterns![0]).toHaveProperty('id');
    expect(result.patterns![0]).toHaveProperty('severity');
    expect(result.patterns![0]).toHaveProperty('enabled');
  });

  it('should disable a pattern', async () => {
    const result = await handleSecurityConfig({
      action: 'disable',
      patternId: 'disabled-tests',
    });
    expect(result.success).toBe(true);

    // Verify it's disabled
    const list = await handleSecurityConfig({ action: 'list' });
    const pattern = list.patterns!.find(p => p.id === 'disabled-tests');
    expect(pattern!.enabled).toBe(false);
  });

  it('should enable a pattern', async () => {
    // Disable first
    await handleSecurityConfig({ action: 'disable', patternId: 'disabled-tests' });
    // Re-enable
    const result = await handleSecurityConfig({
      action: 'enable',
      patternId: 'disabled-tests',
    });
    expect(result.success).toBe(true);

    const list = await handleSecurityConfig({ action: 'list' });
    const pattern = list.patterns!.find(p => p.id === 'disabled-tests');
    expect(pattern!.enabled).toBe(true);
  });

  it('should change severity', async () => {
    const result = await handleSecurityConfig({
      action: 'set_severity',
      patternId: 'suppressed-errors',
      severity: 'high',
    });
    expect(result.success).toBe(true);

    const list = await handleSecurityConfig({ action: 'list' });
    const pattern = list.patterns!.find(p => p.id === 'suppressed-errors');
    expect(pattern!.severity).toBe('high');
  });

  it('should fail for unknown pattern', async () => {
    const result = await handleSecurityConfig({
      action: 'disable',
      patternId: 'nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown pattern');
  });

  it('should fail when patternId missing for non-list actions', async () => {
    const result = await handleSecurityConfig({ action: 'disable' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('patternId is required');
  });

  it('should fail when severity missing for set_severity', async () => {
    const result = await handleSecurityConfig({
      action: 'set_severity',
      patternId: 'suppressed-errors',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('severity is required');
  });

  it('should affect scan results after disabling a pattern', async () => {
    // SQL injection should fire
    const before = await handleSecurityGate({
      content: 'const q = `SELECT * FROM users WHERE id = ${id}`',
      action: 'write_file',
    });
    expect(before.decision).toBe('blocked');

    // Disable sql-injection
    await handleSecurityConfig({ action: 'disable', patternId: 'sql-injection' });

    // Should no longer block
    const after = await handleSecurityGate({
      content: 'const q = `SELECT * FROM users WHERE id = ${id}`',
      action: 'write_file',
    });
    expect(after.decision).not.toBe('blocked');
  });
});
