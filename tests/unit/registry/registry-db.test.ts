import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VerbRegistryDB } from '../../../src/registry/registry-db.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('VerbRegistryDB', () => {
  let db: VerbRegistryDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ps-verb-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new VerbRegistryDB(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  describe('CRUD', () => {
    it('should register a new verb', () => {
      const id = db.register({
        symbol: '::analyze',
        namespace: 'ps:core',
        category: 'verb',
        definition: 'Structural examination of patterns, relationships, and implications.',
        safety_class: 'unrestricted',
        registered_by: 'PSR',
      });
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should lookup registered verb', () => {
      db.register({
        symbol: '::analyze',
        namespace: 'ps:core',
        category: 'verb',
        definition: 'Structural examination.',
        safety_class: 'unrestricted',
        registered_by: 'PSR',
      });
      const verb = db.lookup('::analyze');
      expect(verb).toBeDefined();
      expect(verb!.symbol).toBe('::analyze');
      expect(verb!.namespace).toBe('ps:core');
      expect(verb!.status).toBe('proposed');
      expect(verb!.version).toBe('0.1.0');
    });

    it('should return undefined for unknown verb', () => {
      expect(db.lookup('::nonexistent')).toBeUndefined();
    });

    it('should list verbs by namespace', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.register({ symbol: '::bid', namespace: 'ps:gov', category: 'verb', definition: 'test', safety_class: 'monitored', registered_by: 'PSR' });
      const core = db.listByNamespace('ps:core');
      expect(core).toHaveLength(1);
      expect(core[0].symbol).toBe('::analyze');
      const gov = db.listByNamespace('ps:gov');
      expect(gov).toHaveLength(1);
      expect(gov[0].symbol).toBe('::bid');
    });
  });

  describe('lifecycle', () => {
    it('should transition proposed -> active', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.transition('::analyze', 'active');
      const verb = db.lookup('::analyze');
      expect(verb!.status).toBe('active');
    });

    it('should transition active -> deprecated with superseding symbol', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.transition('::analyze', 'active');
      db.transition('::analyze', 'deprecated', { superseded_by: '::examine' });
      const verb = db.lookup('::analyze');
      expect(verb!.status).toBe('deprecated');
      expect(verb!.supersedes).toBe('::examine');
    });

    it('should transition to revoked immediately', () => {
      db.register({ symbol: '::danger', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'restricted', registered_by: 'PSR' });
      db.transition('::danger', 'active');
      db.transition('::danger', 'revoked', { reason: 'safety', authority: 'Anthropic' });
      const verb = db.lookup('::danger');
      expect(verb!.status).toBe('revoked');
    });

    it('should reject invalid transitions', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      // proposed -> deprecated is invalid (must go through active first)
      expect(() => db.transition('::analyze', 'deprecated')).toThrow(/Invalid transition/);
    });

    it('should reject transitions from revoked (terminal state)', () => {
      db.register({ symbol: '::test', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.transition('::test', 'revoked', { reason: 'test' });
      expect(() => db.transition('::test', 'active')).toThrow(/Invalid transition/);
    });
  });

  describe('safety classification', () => {
    it('should store and retrieve safety_class', () => {
      db.register({ symbol: '::exec', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'restricted', registered_by: 'PSR' });
      const verb = db.lookup('::exec');
      expect(verb!.safety_class).toBe('restricted');
    });
  });

  describe('revocation authority', () => {
    it('should store multiple revocation authorities', () => {
      db.register({
        symbol: '::analyze',
        namespace: 'ps:core',
        category: 'verb',
        definition: 'test',
        safety_class: 'unrestricted',
        registered_by: 'PSR',
        revocation_auth: ['PSR', 'Anthropic'],
      });
      const verb = db.lookup('::analyze');
      expect(verb!.revocation_auth).toEqual(['PSR', 'Anthropic']);
    });

    it('should default to PSR as revocation authority', () => {
      db.register({ symbol: '::test', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      const verb = db.lookup('::test');
      expect(verb!.revocation_auth).toEqual(['PSR']);
    });
  });

  describe('aliases', () => {
    it('should register and resolve aliases', () => {
      db.register({
        symbol: '::analyze',
        namespace: 'ps:core',
        category: 'verb',
        definition: 'test',
        safety_class: 'unrestricted',
        registered_by: 'PSR',
        aliases: ['::examine', '::inspect'],
      });
      const verb = db.lookup('::analyze');
      expect(verb!.aliases).toEqual(['::examine', '::inspect']);
      // Alias resolution
      const resolved = db.resolve('::examine');
      expect(resolved).toBeDefined();
      expect(resolved!.symbol).toBe('::analyze');
    });

    it('should return undefined for unresolvable alias', () => {
      expect(db.resolve('::nonexistent')).toBeUndefined();
    });
  });

  describe('versioning', () => {
    it('should track version on update', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'v1', safety_class: 'unrestricted', registered_by: 'PSR' });
      expect(db.lookup('::analyze')!.version).toBe('0.1.0');

      db.updateDefinition('::analyze', 'v2 definition');
      expect(db.lookup('::analyze')!.version).toBe('0.2.0');

      db.updateDefinition('::analyze', 'v3 definition');
      expect(db.lookup('::analyze')!.version).toBe('0.3.0');
    });
  });

  describe('audit trail', () => {
    it('should log registration event', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      const history = db.getAuditHistory('::analyze');
      expect(history).toHaveLength(1);
      expect(history[0].event).toBe('registered');
    });

    it('should log transition events', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.transition('::analyze', 'active');
      const history = db.getAuditHistory('::analyze');
      expect(history).toHaveLength(2);
      expect(history[0].event).toBe('registered');
      expect(history[1].event).toBe('transition');
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      db.register({ symbol: '::analyze', namespace: 'ps:core', category: 'verb', definition: 'test', safety_class: 'unrestricted', registered_by: 'PSR' });
      db.register({ symbol: '::bid', namespace: 'ps:gov', category: 'verb', definition: 'test', safety_class: 'monitored', registered_by: 'PSR' });
      db.transition('::analyze', 'active');

      const stats = db.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byNamespace['ps:core']).toBe(1);
      expect(stats.byNamespace['ps:gov']).toBe(1);
      expect(stats.byStatus['active']).toBe(1);
      expect(stats.byStatus['proposed']).toBe(1);
    });
  });
});
