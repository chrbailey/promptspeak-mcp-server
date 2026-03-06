import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VerbRegistryDB } from '../../../src/registry/registry-db.js';
import { seedCoreVerbs, seedProcurementVerbs } from '../../../src/registry/seed-verbs.js';
import {
  setRegistryDB,
  ps_registry_lookup,
  ps_registry_propose,
  ps_registry_status,
  ps_registry_namespace,
  ps_registry_audit,
  ps_registry_version,
} from '../../../src/tools/ps_registry.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Registry MCP Tools', () => {
  let db: VerbRegistryDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ps-tools-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  describe('ps_registry_lookup', () => {
    it('should lookup existing verb', () => {
      const result = ps_registry_lookup({ symbol: '::analyze' });
      expect(result.success).toBe(true);
      expect(result.verb).toBeDefined();
      expect(result.verb!.symbol).toBe('::analyze');
      expect(result.verb!.namespace).toBe('ps:core');
    });

    it('should return error for unknown verb', () => {
      const result = ps_registry_lookup({ symbol: '::nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should resolve aliases', () => {
      // Register a verb with aliases
      db.register({
        symbol: '::custom',
        namespace: 'ps:test',
        category: 'verb',
        definition: 'test',
        safety_class: 'unrestricted',
        registered_by: 'test',
        aliases: ['::mycustom'],
      });
      const result = ps_registry_lookup({ symbol: '::mycustom' });
      expect(result.success).toBe(true);
      expect(result.verb!.symbol).toBe('::custom');
    });
  });

  describe('ps_registry_propose', () => {
    it('should propose a new verb', () => {
      const result = ps_registry_propose({
        symbol: '::newverb',
        namespace: 'ps:custom',
        definition: 'A new custom verb',
      });
      expect(result.success).toBe(true);
      expect(result.symbol_id).toBeDefined();

      // Verify it was created as proposed
      const status = ps_registry_status({ symbol: '::newverb' });
      expect(status.status).toBe('proposed');
    });

    it('should reject duplicate symbol', () => {
      const result = ps_registry_propose({
        symbol: '::analyze',
        namespace: 'ps:core',
        definition: 'duplicate',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('ps_registry_status', () => {
    it('should return status for active verb', () => {
      const result = ps_registry_status({ symbol: '::analyze' });
      expect(result.success).toBe(true);
      expect(result.status).toBe('active');
      expect(result.safety_class).toBe('unrestricted');
      expect(result.version).toBeDefined();
    });

    it('should return error for unknown verb', () => {
      const result = ps_registry_status({ symbol: '::nope' });
      expect(result.success).toBe(false);
    });
  });

  describe('ps_registry_namespace', () => {
    it('should list core verbs', () => {
      const result = ps_registry_namespace({ namespace: 'ps:core' });
      expect(result.success).toBe(true);
      expect(result.count).toBe(30);
      expect(result.namespace).toBe('ps:core');
    });

    it('should list procurement verbs', () => {
      const result = ps_registry_namespace({ namespace: 'ps:gov' });
      expect(result.success).toBe(true);
      expect(result.count).toBe(6);
    });

    it('should return empty for unknown namespace', () => {
      const result = ps_registry_namespace({ namespace: 'ps:nope' });
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  describe('ps_registry_audit', () => {
    it('should return audit history', () => {
      const result = ps_registry_audit({ symbol: '::analyze' });
      expect(result.success).toBe(true);
      expect(result.history).toBeDefined();
      // At minimum: registered + transition to active
      expect(result.history!.length).toBeGreaterThanOrEqual(2);
      expect(result.history![0].event).toBe('registered');
      expect(result.history![1].event).toBe('transition');
    });
  });

  describe('ps_registry_version', () => {
    it('should return spec version and verb count', () => {
      const result = ps_registry_version();
      expect(result.success).toBe(true);
      expect(result.spec_version).toBe('0.2');
      expect(result.verb_count).toBe(36);
      expect(result.byNamespace!['ps:core']).toBe(30);
      expect(result.byNamespace!['ps:gov']).toBe(6);
    });
  });
});
