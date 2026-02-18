import { describe, it, expect } from 'vitest';
import { SecurityScanner } from '../../../src/security/scanner.js';

describe('SecurityScanner', () => {
  const scanner = new SecurityScanner();

  describe('scan()', () => {
    it('should detect SQL injection in template literals', () => {
      const code = 'const q = `SELECT * FROM users WHERE id = ${userId}`';
      const result = scanner.scan(code);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].patternId).toBe('sql-injection');
      expect(result.findings[0].severity).toBe('critical');
    });

    it('should detect hardcoded API keys', () => {
      const code = 'const api_key = "sk-1234567890abcdef"';
      const result = scanner.scan(code);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.enforcement.blocked.length).toBeGreaterThan(0);
    });

    it('should return empty findings for clean code', () => {
      const code = 'const x = 1 + 2;\nconsole.log(x);';
      const result = scanner.scan(code);
      expect(result.findings).toHaveLength(0);
      expect(result.enforcement.blocked).toHaveLength(0);
      expect(result.enforcement.held).toHaveLength(0);
      expect(result.enforcement.warned).toHaveLength(0);
      expect(result.enforcement.logged).toHaveLength(0);
    });

    it('should include line numbers in findings', () => {
      const code = 'line1\nconst api_key = "AKIA1234567890abcdef"\nline3';
      const result = scanner.scan(code);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].line).toBe(2);
    });

    it('should include context lines around findings', () => {
      const code = 'const a = 1;\nconst api_key = "sk-reallyLongSecretKey123"\nconst b = 2;';
      const result = scanner.scan(code);
      expect(result.findings[0].context).toContain('const a = 1;');
      expect(result.findings[0].context).toContain('const b = 2;');
    });

    it('should include suggestions for findings', () => {
      const code = 'const q = `SELECT * FROM users WHERE id = ${id}`';
      const result = scanner.scan(code);
      expect(result.findings[0].suggestion).toContain('parameterized');
    });

    it('should classify findings by severity', () => {
      const code = [
        'const api_key = "sk-1234567890abcdef"',   // critical
        '// TODO: add authentication check',        // high
        'catch (e) {}',                             // medium
        'DROP TABLE users',                         // low
      ].join('\n');
      const result = scanner.scan(code);
      expect(result.enforcement.blocked.length).toBeGreaterThan(0);
      expect(result.enforcement.held.length).toBeGreaterThan(0);
      expect(result.enforcement.warned.length).toBeGreaterThan(0);
      expect(result.enforcement.logged.length).toBeGreaterThan(0);
    });

    it('should report scan metadata', () => {
      const code = 'const x = 1;';
      const result = scanner.scan(code);
      expect(result.scannedAt).toBeDefined();
      expect(result.contentLength).toBe(code.length);
      expect(result.patternsChecked).toBeGreaterThan(0);
    });
  });

  describe('scan options', () => {
    it('should respect disabledPatterns', () => {
      const code = 'const q = `SELECT * FROM users WHERE id = ${userId}`';
      const result = scanner.scan(code, { disabledPatterns: ['sql-injection'] });
      const sqlFindings = result.findings.filter(f => f.patternId === 'sql-injection');
      expect(sqlFindings).toHaveLength(0);
    });

    it('should respect onlyPatterns', () => {
      const code = [
        'const api_key = "sk-1234567890abcdef"',
        '// TODO: add authentication check',
        'const q = `SELECT * FROM users WHERE id = ${id}`',
      ].join('\n');
      const result = scanner.scan(code, { onlyPatterns: ['sql-injection'] });
      expect(result.findings.every(f => f.patternId === 'sql-injection')).toBe(true);
      expect(result.patternsChecked).toBe(1);
    });

    it('should skip disabled patterns from constructor', () => {
      const customPatterns = [
        {
          id: 'test-pattern',
          name: 'Test',
          description: 'Test pattern',
          severity: 'critical' as const,
          pattern: 'FINDME',
          category: 'governance' as const,
          enabled: false,
        },
      ];
      const customScanner = new SecurityScanner(customPatterns);
      const result = customScanner.scan('FINDME');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('multiple findings', () => {
    it('should find multiple issues on different lines', () => {
      const code = [
        'const password = "hunter2hunter2"',
        'const q = `DELETE FROM users WHERE id = ${id}`',
      ].join('\n');
      const result = scanner.scan(code);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      const patternIds = result.findings.map(f => f.patternId);
      expect(patternIds).toContain('hardcoded-secret');
      expect(patternIds).toContain('sql-injection');
    });

    it('should handle empty content', () => {
      const result = scanner.scan('');
      expect(result.findings).toHaveLength(0);
      expect(result.contentLength).toBe(0);
    });
  });
});
