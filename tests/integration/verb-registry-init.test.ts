/**
 * Integration: Verb Registry + Handshake Wire-up
 *
 * Verifies that initializeServer() actually instantiates VerbRegistryDB,
 * seeds the 30 core verbs + 6 gov verbs + 6 gov modifiers on first run,
 * wires the DB into ps_registry_* tool handlers, and builds a
 * HandshakeProtocol whose capabilities reflect the live verb count.
 *
 * This test covers the gap identified in the v0.2 Design Specification
 * evaluation: the seed functions and tool handlers existed but the
 * init wire-up was missing, so verb_count came back as 0 live.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeServer } from '../../src/server-init.js';
import { ps_registry_version, ps_registry_namespace } from '../../src/tools/ps_registry.js';
import { ps_capability_get, ps_handshake_respond } from '../../src/tools/ps_handshake.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Verb Registry + Handshake Init Wire-up', () => {
  const tmpRoot = path.join(os.tmpdir(), `ps-init-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  beforeAll(async () => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    await initializeServer({
      skipPolicyLoader: true,
      skipSymbolManager: true,
      skipGovernanceDb: true,
      verbRegistryRoot: tmpRoot,
    });
  });

  afterAll(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('should initialize the verb registry subsystem', async () => {
    const res = await initializeServer({
      skipPolicyLoader: true,
      skipSymbolManager: true,
      skipGovernanceDb: true,
      verbRegistryRoot: tmpRoot,
    });

    expect(res.subsystems.verbRegistry.initialized).toBe(true);
    expect(res.subsystems.handshake.initialized).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('should expose verb_count 42 via ps_registry_version', () => {
    const v = ps_registry_version();
    expect(v.success).toBe(true);
    expect(v.spec_version).toBe('0.2');
    expect(v.verb_count).toBe(42);
    expect(v.byNamespace).toEqual({ 'ps:core': 30, 'ps:gov': 12 });
  });

  it('should list 30 verbs in ps:core namespace', () => {
    const ns = ps_registry_namespace({ namespace: 'ps:core' });
    expect(ns.success).toBe(true);
    expect(ns.count).toBe(30);
    const symbols = (ns.verbs ?? []).map(v => v.symbol).sort();
    expect(symbols).toContain('::analyze');
    expect(symbols).toContain('::delegate');
    expect(symbols).toContain('::report');
  });

  it('should list 12 entries in ps:gov namespace (6 verbs + 6 modifiers)', () => {
    const ns = ps_registry_namespace({ namespace: 'ps:gov' });
    expect(ns.success).toBe(true);
    expect(ns.count).toBe(12);

    const verbs = (ns.verbs ?? []).filter(v => v.category === 'verb').map(v => v.symbol).sort();
    const modifiers = (ns.verbs ?? []).filter(v => v.category === 'modifier').map(v => v.symbol).sort();

    expect(verbs).toEqual(['::bid', '::certify', '::comply', '::propose', '::seek', '::team']);
    expect(modifiers).toEqual(['|cage', '|clearance', '|naics', '|past-perf', '|set-aside', '|vehicle']);
  });

  it('should set safety_class=monitored on ::delegate (spec §5.1)', () => {
    const ns = ps_registry_namespace({ namespace: 'ps:core' });
    const delegate = (ns.verbs ?? []).find(v => v.symbol === '::delegate');
    expect(delegate).toBeDefined();
    expect(delegate!.safety_class).toBe('monitored');
  });

  it('should list PSR and Anthropic as revocation authorities (spec §4.2)', () => {
    const ns = ps_registry_namespace({ namespace: 'ps:core' });
    const analyze = (ns.verbs ?? []).find(v => v.symbol === '::analyze');
    expect(analyze!.revocation_auth).toEqual(['PSR', 'Anthropic']);
  });

  it('should report accurate capabilities via ps_capability_get', () => {
    const cap = ps_capability_get();
    expect(cap.success).toBe(true);
    expect(cap.capabilities.version).toBe('0.2');
    expect(cap.capabilities.verbCount).toBe(42);
    expect(cap.capabilities.status).toBe('active');
    expect(cap.capabilities.namespaces.sort()).toEqual(['ps:core', 'ps:gov']);
  });

  it('should respond to ::check{ps:version} handshake (spec §5.2)', () => {
    const r = ps_handshake_respond({ input: '::check{ps:version}' });
    expect(r.success).toBe(true);
    expect(r.echo).toBe('ps:0.2 |verbs:42 |status:active');
  });

  it('should persist verb count across re-init (idempotent seeding)', async () => {
    const before = ps_registry_version().verb_count;
    expect(before).toBe(42);

    // Re-initialize with the same verb registry root
    await initializeServer({
      skipPolicyLoader: true,
      skipSymbolManager: true,
      skipGovernanceDb: true,
      verbRegistryRoot: tmpRoot,
    });

    const after = ps_registry_version().verb_count;
    expect(after).toBe(42);
  });
});
