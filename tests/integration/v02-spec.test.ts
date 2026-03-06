/**
 * v0.2 Spec End-to-End Integration Tests
 *
 * Exercises the full v0.2 spec flow across all subsystems:
 * grammar parser, verb registry, handshake protocol, governance bridge.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VerbRegistryDB } from '../../src/registry/registry-db.js';
import { seedCoreVerbs, seedProcurementVerbs, CORE_VERB_SYMBOLS, PROCUREMENT_VERB_SYMBOLS } from '../../src/registry/seed-verbs.js';
import { setRegistryDB } from '../../src/tools/ps_registry.js';
import { parse } from '../../src/grammar/parser.js';
import { expand } from '../../src/grammar/expander.js';
import { validateExpression } from '../../src/grammar/governance.js';
import { ps_parse, ps_expand } from '../../src/tools/ps_grammar.js';
import { ps_registry_lookup, ps_registry_namespace, ps_registry_version } from '../../src/tools/ps_registry.js';
import { HandshakeProtocol } from '../../src/handshake/protocol.js';
import { setHandshakeProtocol, ps_handshake_initiate, ps_handshake_respond } from '../../src/tools/ps_handshake.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('v0.2 Spec End-to-End', () => {
  let db: VerbRegistryDB;
  let dbPath: string;

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `ps-e2e-${Date.now()}.db`);
    db = new VerbRegistryDB(dbPath);
    seedCoreVerbs(db);
    seedProcurementVerbs(db);
    setRegistryDB(db);

    // Initialize handshake protocol with real verb count
    const stats = db.getStats();
    setHandshakeProtocol(new HandshakeProtocol({
      version: '0.2',
      verbCount: stats.total,
      status: 'active',
      namespaces: ['ps:core', 'ps:gov'],
    }));
  });

  afterAll(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  it('1. should parse procurement expression from spec Section 3.4', () => {
    const ast = parse('::propose{teaming}|prime:ERP_Access|share:51');
    expect(ast.body.verb).toBe('propose');
    expect(ast.body.target!.nouns[0].name).toBe('teaming');
    expect(ast.body.modifiers).toHaveLength(2);
    expect(ast.body.modifiers[0]).toEqual({ type: 'Modifier', key: 'prime', value: 'ERP_Access' });
    expect(ast.body.modifiers[1]).toEqual({ type: 'Modifier', key: 'share', value: '51' });
  });

  it('2. should have all 30 core verbs active in registry', () => {
    for (const symbol of CORE_VERB_SYMBOLS) {
      const verb = db.lookup(symbol);
      expect(verb, `${symbol} should exist`).toBeDefined();
      expect(verb!.status, `${symbol} should be active`).toBe('active');
    }
  });

  it('3. should expand procurement expression to English', () => {
    const expression = '::seek{partner}[cloud_migration, AWS_GovCloud] > ::certify{SDVOSB, SAM_active}';
    const english = expand(parse(expression));
    expect(english).toBe('Seek partner focusing on cloud_migration, AWS_GovCloud, then Certify SDVOSB, SAM_active');
    // Verify compression: English is shorter than explaining the same thing from scratch
    expect(english.length).toBeLessThan(200);
  });

  it('4. should validate expression through governance pipeline', () => {
    const report = validateExpression('::extract{data, metadata}[format:csv, recent]|limit:100|sort:desc');
    expect(report.valid).toBe(true);
    expect(report.decision).toBe('allow');
    expect(report.verbs[0].found).toBe(true);
    expect(report.verbs[0].status).toBe('active');
    expect(report.english).toContain('Extract');
  });

  it('5. should include expression + expansion in audit trail data', () => {
    const expr = '::analyze{document}[security] > ::report{findings}';
    const report = validateExpression(expr);
    expect(report.expression).toBe(expr);
    expect(report.english).toBe('Analyze document focusing on security, then Report findings');
    expect(report.verbs.map(v => v.verb)).toEqual(['analyze', 'report']);
  });

  it('6. should trigger hold for restricted verb', () => {
    db.register({
      symbol: '::escalate',
      namespace: 'ps:test',
      category: 'verb',
      definition: 'Privilege escalation',
      safety_class: 'restricted',
      registered_by: 'test',
    });
    db.transition('::escalate', 'active');

    const report = validateExpression('::escalate{privileges}');
    expect(report.decision).toBe('hold');
    expect(report.valid).toBe(true); // Hold is valid, just needs approval
  });

  it('7. should reject expression with revoked verb', () => {
    db.register({
      symbol: '::obsolete',
      namespace: 'ps:test',
      category: 'verb',
      definition: 'Obsolete operation',
      safety_class: 'unrestricted',
      registered_by: 'test',
    });
    db.transition('::obsolete', 'active');
    db.transition('::obsolete', 'revoked', { reason: 'deprecated and dangerous' });

    const report = validateExpression('::obsolete{target}');
    expect(report.decision).toBe('reject');
    expect(report.errors.some(e => e.includes('revoked'))).toBe(true);
  });

  it('8. should complete handshake initiate + respond round-trip', () => {
    // Step 1: Initiate
    const initResult = ps_handshake_initiate();
    expect(initResult.success).toBe(true);
    expect(initResult.probe).toBe('::validate{ps:probe} > ::respond{ps:echo}');

    // Step 2: Respond with version check
    const versionResult = ps_handshake_respond({ input: '::check{ps:version}' });
    expect(versionResult.success).toBe(true);
    expect(versionResult.echo).toContain('ps:0.2');
    expect(versionResult.echo).toContain('verbs:');

    // Step 3: Respond with probe expression
    const probeResult = ps_handshake_respond({ input: initResult.probe });
    expect(probeResult.success).toBe(true);
    expect(probeResult.expanded).toContain('Validate');
    expect(probeResult.expanded).toContain('then');
  });

  it('9. should resolve verb alias', () => {
    db.register({
      symbol: '::inspect',
      namespace: 'ps:core',
      category: 'verb',
      definition: 'Detailed inspection',
      safety_class: 'unrestricted',
      registered_by: 'test',
      aliases: ['::peek', '::look'],
    });
    db.transition('::inspect', 'active');

    const result = ps_registry_lookup({ symbol: '::peek' });
    expect(result.success).toBe(true);
    expect(result.verb!.symbol).toBe('::inspect');
  });

  it('10. should list correct verb counts by namespace', () => {
    const coreResult = ps_registry_namespace({ namespace: 'ps:core' });
    expect(coreResult.success).toBe(true);
    // 30 seeded + ::inspect added in test 9
    expect(coreResult.count).toBeGreaterThanOrEqual(30);

    const govResult = ps_registry_namespace({ namespace: 'ps:gov' });
    expect(govResult.success).toBe(true);
    expect(govResult.count).toBe(6);
  });

  it('11. should report correct spec version via registry version tool', () => {
    const result = ps_registry_version();
    expect(result.success).toBe(true);
    expect(result.spec_version).toBe('0.2');
    expect(result.verb_count).toBeGreaterThanOrEqual(36);
    expect(result.byNamespace!['ps:core']).toBeGreaterThanOrEqual(30);
    expect(result.byNamespace!['ps:gov']).toBe(6);
  });

  it('12. should handle full parse → validate → expand pipeline via MCP tools', () => {
    // Parse
    const parseResult = ps_parse({ expression: '::bid{contract}[SDVOSB]|deadline:"2026-Q1"' });
    expect(parseResult.success).toBe(true);
    expect(parseResult.metadata!.verbs).toEqual(['bid']);

    // Validate via governance
    const govReport = validateExpression('::bid{contract}[SDVOSB]|deadline:"2026-Q1"');
    expect(govReport.valid).toBe(true);
    expect(govReport.verbs[0].status).toBe('active');
    expect(govReport.verbs[0].safety_class).toBe('monitored');

    // Expand
    const expandResult = ps_expand({ expression: '::bid{contract}[SDVOSB]|deadline:"2026-Q1"' });
    expect(expandResult.success).toBe(true);
    expect(expandResult.english).toBe('Bid on contract focusing on SDVOSB with deadline=2026-Q1');
  });
});
