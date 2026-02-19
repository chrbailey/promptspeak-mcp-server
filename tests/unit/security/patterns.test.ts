import { describe, it, expect } from 'vitest';
import { DEFAULT_PATTERNS, getPatternById } from '../../../src/security/patterns.js';
import type { SecuritySeverity, SecurityPatternCategory } from '../../../src/types/index.js';

describe('Security Detection Patterns', () => {
  describe('pattern metadata', () => {
    it('should have unique IDs', () => {
      const ids = DEFAULT_PATTERNS.map(p => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should all have valid severity levels', () => {
      const validSeverities: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
      for (const pattern of DEFAULT_PATTERNS) {
        expect(validSeverities).toContain(pattern.severity);
      }
    });

    it('should all have valid categories', () => {
      const validCategories: SecurityPatternCategory[] = [
        'injection', 'secrets', 'authentication', 'configuration', 'governance',
      ];
      for (const pattern of DEFAULT_PATTERNS) {
        expect(validCategories).toContain(pattern.category);
      }
    });

    it('should all be enabled by default', () => {
      for (const pattern of DEFAULT_PATTERNS) {
        expect(pattern.enabled).toBe(true);
      }
    });

    it('should all have compilable regex patterns', () => {
      for (const pattern of DEFAULT_PATTERNS) {
        expect(() => new RegExp(pattern.pattern, 'gim')).not.toThrow();
      }
    });
  });

  describe('getPatternById', () => {
    it('should return correct pattern by ID', () => {
      const pattern = getPatternById('sql-injection');
      expect(pattern).toBeDefined();
      expect(pattern!.severity).toBe('critical');
      expect(pattern!.category).toBe('injection');
    });

    it('should return undefined for unknown ID', () => {
      expect(getPatternById('nonexistent')).toBeUndefined();
    });
  });

  // ─── CRITICAL pattern tests ────────────────────────────────────────────

  describe('sql-injection pattern', () => {
    const pattern = getPatternById('sql-injection')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match template literal in SQL SELECT', () => {
      expect('const q = `SELECT * FROM users WHERE id = ${userId}`').toMatch(regex);
    });

    it('should match template literal in SQL INSERT', () => {
      expect('db.query(`INSERT INTO logs VALUES (${data})`);').toMatch(regex);
    });

    it('should match template literal in SQL DELETE', () => {
      expect('`DELETE FROM sessions WHERE token = ${token}`').toMatch(regex);
    });

    it('should NOT match parameterized queries', () => {
      expect('db.query("SELECT * FROM users WHERE id = ?", [userId])').not.toMatch(regex);
    });

    it('should NOT match plain SQL without interpolation', () => {
      expect('const q = "SELECT * FROM users"').not.toMatch(regex);
    });
  });

  describe('hardcoded-secret pattern', () => {
    const pattern = getPatternById('hardcoded-secret')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match hardcoded API key', () => {
      expect('const API_KEY = "sk-1234567890abcdef"').toMatch(regex);
    });

    it('should match hardcoded password', () => {
      expect("const password = 'mysecretpassword123'").toMatch(regex);
    });

    it('should match access_token assignment', () => {
      expect('const access_token = "eyJhbGciOiJIUzI1NiJ9.test"').toMatch(regex);
    });

    it('should NOT match environment variable reads', () => {
      expect('const API_KEY = process.env.API_KEY').not.toMatch(regex);
    });

    it('should NOT match short values (less than 8 chars)', () => {
      expect('const password = "short"').not.toMatch(regex);
    });
  });

  // ─── HIGH pattern tests ────────────────────────────────────────────────

  describe('security-todo pattern', () => {
    const pattern = getPatternById('security-todo')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match TODO about authentication', () => {
      expect('// TODO: add authentication check').toMatch(regex);
    });

    it('should match FIXME about validation', () => {
      expect('// FIXME: validate user input').toMatch(regex);
    });

    it('should match HACK about security', () => {
      expect('// HACK: bypassing security for now').toMatch(regex);
    });

    it('should NOT match generic TODOs', () => {
      expect('// TODO: refactor this function').not.toMatch(regex);
    });
  });

  describe('console-log-sensitive pattern', () => {
    const pattern = getPatternById('console-log-sensitive')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match logging a token', () => {
      expect('console.log("user token:", token)').toMatch(regex);
    });

    it('should match logging a password', () => {
      expect('console.error("password mismatch", password)').toMatch(regex);
    });

    it('should NOT match logging non-sensitive data', () => {
      expect('console.log("user count:", count)').not.toMatch(regex);
    });
  });

  describe('insecure-defaults pattern', () => {
    const pattern = getPatternById('insecure-defaults')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match cors() with no arguments', () => {
      expect('app.use(cors())').toMatch(regex);
    });

    it('should match 0.0.0.0 binding', () => {
      expect("app.listen(3000, '0.0.0.0')").toMatch(regex);
    });

    it('should match debug: true', () => {
      expect('const config = { debug: true }').toMatch(regex);
    });

    it('should NOT match cors with config', () => {
      expect("app.use(cors({ origin: 'https://example.com' }))").not.toMatch(regex);
    });
  });

  // ─── MEDIUM pattern tests ─────────────────────────────────────────────

  describe('suppressed-errors pattern', () => {
    const pattern = getPatternById('suppressed-errors')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match empty catch block', () => {
      expect('catch (e) {}').toMatch(regex);
    });

    it('should match empty catch with whitespace', () => {
      expect('catch (err) {  }').toMatch(regex);
    });

    it('should NOT match catch with handling', () => {
      expect('catch (e) { console.error(e); }').not.toMatch(regex);
    });
  });

  describe('unverified-comments pattern', () => {
    const pattern = getPatternById('unverified-comments')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match "probably" in comment', () => {
      expect('// probably works fine').toMatch(regex);
    });

    it('should match "should work" in comment', () => {
      expect('// this should work').toMatch(regex);
    });

    it('should match "not sure" in block comment', () => {
      expect('* not sure if this is correct').toMatch(regex);
    });

    it('should NOT match hedging in code strings', () => {
      expect("const msg = 'probably works fine'").not.toMatch(regex);
    });
  });

  describe('disabled-tests pattern', () => {
    const pattern = getPatternById('disabled-tests')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match it.skip', () => {
      expect("it.skip('should test something', () => {})").toMatch(regex);
    });

    it('should match describe.skip', () => {
      expect("describe.skip('skipped suite', () => {})").toMatch(regex);
    });

    it('should match xit', () => {
      expect("xit('disabled test', () => {})").toMatch(regex);
    });

    it('should match test.only', () => {
      expect("test.only('focused test', () => {})").toMatch(regex);
    });

    it('should NOT match normal test declarations', () => {
      expect("it('should work', () => {})").not.toMatch(regex);
    });
  });

  // ─── LOW pattern tests ────────────────────────────────────────────────

  describe('destructive-db pattern', () => {
    const pattern = getPatternById('destructive-db')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match DROP TABLE', () => {
      expect('DROP TABLE users').toMatch(regex);
    });

    it('should match TRUNCATE TABLE', () => {
      expect('TRUNCATE TABLE sessions').toMatch(regex);
    });

    it('should NOT match DELETE with WHERE clause', () => {
      expect("DELETE FROM users WHERE id = 'abc'").not.toMatch(regex);
    });
  });

  describe('filesystem-destructive pattern', () => {
    const pattern = getPatternById('filesystem-destructive')!;
    const regex = new RegExp(pattern.pattern, 'gim');

    it('should match rm -rf', () => {
      expect('rm -rf /tmp/build').toMatch(regex);
    });

    it('should match rm -fr', () => {
      expect('rm -fr ./dist').toMatch(regex);
    });

    it('should NOT match rm without recursive force', () => {
      expect('rm file.txt').not.toMatch(regex);
    });
  });
});
