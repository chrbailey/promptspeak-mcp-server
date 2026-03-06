import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VerbRegistryDB } from '../../../src/registry/registry-db.js';
import { seedCoreVerbs, seedProcurementVerbs, CORE_VERB_SYMBOLS, PROCUREMENT_VERB_SYMBOLS } from '../../../src/registry/seed-verbs.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Seed Verbs', () => {
  let db: VerbRegistryDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ps-seed-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VerbRegistryDB(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  describe('seedCoreVerbs', () => {
    it('should seed exactly 30 core verbs', () => {
      seedCoreVerbs(db);
      const stats = db.getStats();
      expect(stats.total).toBe(30);
    });

    it('should place all core verbs in ps:core namespace', () => {
      seedCoreVerbs(db);
      const core = db.listByNamespace('ps:core');
      expect(core).toHaveLength(30);
    });

    it('should transition all core verbs to active', () => {
      seedCoreVerbs(db);
      const active = db.listByStatus('active');
      expect(active).toHaveLength(30);
    });

    it('should cover all 5 domains (6 verbs each)', () => {
      seedCoreVerbs(db);
      expect(CORE_VERB_SYMBOLS).toHaveLength(30);
      // Spot check one verb per domain
      expect(db.lookup('::analyze')).toBeDefined();  // analysis
      expect(db.lookup('::gen')).toBeDefined();       // generation
      expect(db.lookup('::extract')).toBeDefined();   // data
      expect(db.lookup('::report')).toBeDefined();    // communication
      expect(db.lookup('::check')).toBeDefined();     // control
    });

    it('should mark ::delegate as monitored, others as unrestricted', () => {
      seedCoreVerbs(db);
      const delegate = db.lookup('::delegate');
      expect(delegate!.safety_class).toBe('monitored');
      const analyze = db.lookup('::analyze');
      expect(analyze!.safety_class).toBe('unrestricted');
    });

    it('should set revocation authority to PSR and Anthropic', () => {
      seedCoreVerbs(db);
      const verb = db.lookup('::analyze');
      expect(verb!.revocation_auth).toEqual(['PSR', 'Anthropic']);
    });
  });

  describe('seedProcurementVerbs', () => {
    it('should seed exactly 6 procurement verbs', () => {
      seedProcurementVerbs(db);
      const stats = db.getStats();
      expect(stats.total).toBe(6);
    });

    it('should place all procurement verbs in ps:gov namespace', () => {
      seedProcurementVerbs(db);
      const gov = db.listByNamespace('ps:gov');
      expect(gov).toHaveLength(6);
      expect(PROCUREMENT_VERB_SYMBOLS).toEqual(['::bid', '::team', '::certify', '::comply', '::propose', '::seek']);
    });

    it('should set all procurement verbs as monitored safety class', () => {
      seedProcurementVerbs(db);
      for (const symbol of PROCUREMENT_VERB_SYMBOLS) {
        const verb = db.lookup(symbol);
        expect(verb!.safety_class).toBe('monitored');
      }
    });

    it('should transition all procurement verbs to active', () => {
      seedProcurementVerbs(db);
      const active = db.listByStatus('active');
      expect(active).toHaveLength(6);
    });
  });

  describe('combined seeding', () => {
    it('should seed 36 total verbs across both namespaces', () => {
      seedCoreVerbs(db);
      seedProcurementVerbs(db);
      const stats = db.getStats();
      expect(stats.total).toBe(36);
      expect(stats.byNamespace['ps:core']).toBe(30);
      expect(stats.byNamespace['ps:gov']).toBe(6);
    });
  });
});
