import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VerbRegistryDB } from '../../src/registry/registry-db.js';
import { seedCoreVerbs, seedProcurementVerbs } from '../../src/registry/seed-verbs.js';
import { setRegistryDB } from '../../src/tools/ps_registry.js';
import { validateExpression } from '../../src/grammar/governance.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Grammar → Governance Pipeline Integration', () => {
  let db: VerbRegistryDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ps-pipeline-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VerbRegistryDB(dbPath);
    seedCoreVerbs(db);
    seedProcurementVerbs(db);
    setRegistryDB(db);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  describe('expression validation with active verbs', () => {
    it('should allow expression with all active unrestricted verbs', () => {
      const report = validateExpression('::analyze{document}[security]');
      expect(report.valid).toBe(true);
      expect(report.decision).toBe('allow');
      expect(report.english).toBe('Analyze document focusing on security');
      expect(report.verbs).toHaveLength(1);
      expect(report.verbs[0].found).toBe(true);
      expect(report.verbs[0].safety_class).toBe('unrestricted');
    });

    it('should allow piped expression with multiple active verbs', () => {
      const report = validateExpression('::extract{data}[email] > ::filter{results}|min:10 > ::sort{output}');
      expect(report.valid).toBe(true);
      expect(report.decision).toBe('allow');
      expect(report.verbs).toHaveLength(3);
      expect(report.verbs.every(v => v.found)).toBe(true);
    });

    it('should include English expansion in report', () => {
      const report = validateExpression('::propose{teaming}|prime:ERP_Access|share:51');
      expect(report.english).toBe('Propose teaming with prime=ERP_Access, share=51');
    });

    it('should warn about monitored verbs but still allow', () => {
      const report = validateExpression('::delegate{task}');
      expect(report.valid).toBe(true);
      expect(report.decision).toBe('allow');
      expect(report.verbs[0].safety_class).toBe('monitored');
      expect(report.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('expression validation with revoked verbs', () => {
    it('should reject expression with revoked verb', () => {
      // Revoke a verb
      db.transition('::analyze', 'revoked', { reason: 'test' });

      const report = validateExpression('::analyze{document}');
      expect(report.valid).toBe(false);
      expect(report.decision).toBe('reject');
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toContain('revoked');
    });

    it('should reject piped expression if any verb is revoked', () => {
      db.transition('::sort', 'revoked', { reason: 'test' });

      const report = validateExpression('::extract{data} > ::filter{results} > ::sort{output}');
      expect(report.decision).toBe('reject');
      // Only the revoked verb should be in errors
      expect(report.errors.some(e => e.includes('sort'))).toBe(true);
    });
  });

  describe('expression validation with deprecated verbs', () => {
    it('should warn about deprecated verb but allow', () => {
      db.transition('::analyze', 'deprecated', { superseded_by: '::examine' });

      const report = validateExpression('::analyze{document}');
      expect(report.valid).toBe(true);
      expect(report.decision).toBe('allow');
      expect(report.warnings.some(w => w.includes('deprecated'))).toBe(true);
    });
  });

  describe('expression validation with safety classifications', () => {
    it('should hold expression with restricted verb', () => {
      // Register a restricted verb
      db.register({
        symbol: '::danger',
        namespace: 'ps:test',
        category: 'verb',
        definition: 'dangerous operation',
        safety_class: 'restricted',
        registered_by: 'test',
      });
      db.transition('::danger', 'active');

      const report = validateExpression('::danger{target}');
      expect(report.decision).toBe('hold');
      expect(report.valid).toBe(true); // hold is still valid, just needs approval
    });

    it('should block expression with blocked verb', () => {
      db.register({
        symbol: '::forbidden',
        namespace: 'ps:test',
        category: 'verb',
        definition: 'forbidden operation',
        safety_class: 'blocked',
        registered_by: 'test',
      });
      db.transition('::forbidden', 'active');

      const report = validateExpression('::forbidden{target}');
      expect(report.decision).toBe('block');
      expect(report.valid).toBe(false);
    });

    it('should use most restrictive decision when mixing safety classes', () => {
      db.register({
        symbol: '::risky',
        namespace: 'ps:test',
        category: 'verb',
        definition: 'risky op',
        safety_class: 'restricted',
        registered_by: 'test',
      });
      db.transition('::risky', 'active');

      // analyze is unrestricted, risky is restricted → overall hold
      const report = validateExpression('::analyze{doc} > ::risky{target}');
      expect(report.decision).toBe('hold');
    });
  });

  describe('expression validation with unknown verbs', () => {
    it('should reject expression with unknown verb', () => {
      const report = validateExpression('::nonexistent{target}');
      expect(report.decision).toBe('reject');
      expect(report.errors.some(e => e.includes('Unknown verb'))).toBe(true);
    });
  });

  describe('parse errors', () => {
    it('should reject invalid expression syntax', () => {
      const report = validateExpression('::{doc}');
      expect(report.valid).toBe(false);
      expect(report.decision).toBe('reject');
      expect(report.errors).toHaveLength(1);
    });

    it('should reject empty expression', () => {
      const report = validateExpression('');
      expect(report.valid).toBe(false);
      expect(report.decision).toBe('reject');
    });
  });

  describe('backward compatibility', () => {
    it('should not break existing frame validation (validator is untouched)', async () => {
      // Dynamic import verifies the validator module still loads correctly
      const { validator } = await import('../../src/gatekeeper/validator.js');
      expect(validator).toBeDefined();
      expect(typeof validator.validate).toBe('function');
    });
  });

  describe('procurement domain expressions from spec', () => {
    it('should validate procurement capability statement', () => {
      const report = validateExpression('::propose{teaming}|prime:ERP_Access|share:51');
      expect(report.valid).toBe(true);
      expect(report.verbs[0].found).toBe(true);
      expect(report.verbs[0].status).toBe('active');
    });

    it('should validate piped procurement flow', () => {
      const report = validateExpression('::seek{partner}[cloud_migration, AWS_GovCloud] > ::certify{SDVOSB, SAM_active}');
      expect(report.valid).toBe(true);
      expect(report.verbs).toHaveLength(2);
      expect(report.verbs[0].verb).toBe('seek');
      expect(report.verbs[1].verb).toBe('certify');
    });

    it('should validate complex expression with all components', () => {
      const report = validateExpression('::extract{data, metadata}[format:csv, recent]|limit:100|sort:desc');
      expect(report.valid).toBe(true);
      expect(report.english).toContain('Extract');
      expect(report.english).toContain('focusing on');
      expect(report.english).toContain('with');
    });
  });

  describe('audit trail data', () => {
    it('should include expression and English expansion in report', () => {
      const expr = '::analyze{document}[security]';
      const report = validateExpression(expr);
      expect(report.expression).toBe(expr);
      expect(report.english).toBe('Analyze document focusing on security');
      expect(report.verbs[0].verb).toBe('analyze');
    });
  });
});
