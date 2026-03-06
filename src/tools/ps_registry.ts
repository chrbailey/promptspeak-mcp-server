/**
 * Verb Registry MCP Tool Handlers
 *
 * 6 tools for managing the verb registry (spec Section 4.3):
 * - ps_registry_lookup    — Resolve verb to full definition
 * - ps_registry_propose   — Submit new verb for review
 * - ps_registry_status    — Check lifecycle state
 * - ps_registry_namespace — List verbs in a namespace
 * - ps_registry_audit     — Full change history
 * - ps_registry_version   — Spec version + stats
 */

import type { VerbRegistryDB, VerbEntry, RegisterInput } from '../registry/registry-db.js';

// Module-level reference set during server init
let registryDB: VerbRegistryDB | undefined;

export function setRegistryDB(db: VerbRegistryDB): void {
  registryDB = db;
}

export function getRegistryDB(): VerbRegistryDB | undefined {
  return registryDB;
}

function requireDB(): VerbRegistryDB {
  if (!registryDB) {
    throw new Error('Verb registry not initialized. Server init required.');
  }
  return registryDB;
}

// ─── Tool interfaces ────────────────────────────────────────────────────────

export interface LookupRequest { symbol: string; }
export interface LookupResult { success: boolean; verb?: VerbEntry; error?: string; }

export interface ProposeRequest {
  symbol: string;
  namespace: string;
  category?: string;
  definition: string;
  safety_class?: string;
}
export interface ProposeResult { success: boolean; symbol_id?: string; error?: string; }

export interface StatusRequest { symbol: string; }
export interface StatusResult { success: boolean; symbol?: string; status?: string; safety_class?: string; version?: string; error?: string; }

export interface NamespaceRequest { namespace: string; }
export interface NamespaceResult { success: boolean; namespace?: string; verbs?: VerbEntry[]; count?: number; error?: string; }

export interface AuditRequest { symbol: string; }
export interface AuditResult { success: boolean; symbol?: string; history?: Array<{ event: string; details: unknown; timestamp: string }>; error?: string; }

export interface VersionResult { success: boolean; spec_version: string; verb_count: number; byStatus?: Record<string, number>; byNamespace?: Record<string, number>; }

// ─── Tool handlers ──────────────────────────────────────────────────────────

export function ps_registry_lookup(args: LookupRequest): LookupResult {
  try {
    const db = requireDB();
    const verb = db.resolve(args.symbol);
    if (!verb) {
      return { success: false, error: `Verb not found: ${args.symbol}` };
    }
    return { success: true, verb };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ps_registry_propose(args: ProposeRequest): ProposeResult {
  try {
    const db = requireDB();
    const input: RegisterInput = {
      symbol: args.symbol,
      namespace: args.namespace,
      category: (args.category as RegisterInput['category']) ?? 'verb',
      definition: args.definition,
      safety_class: (args.safety_class as RegisterInput['safety_class']) ?? 'unrestricted',
      registered_by: 'user',
    };
    const id = db.register(input);
    return { success: true, symbol_id: id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ps_registry_status(args: StatusRequest): StatusResult {
  try {
    const db = requireDB();
    const verb = db.resolve(args.symbol);
    if (!verb) {
      return { success: false, error: `Verb not found: ${args.symbol}` };
    }
    return {
      success: true,
      symbol: verb.symbol,
      status: verb.status,
      safety_class: verb.safety_class,
      version: verb.version,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ps_registry_namespace(args: NamespaceRequest): NamespaceResult {
  try {
    const db = requireDB();
    const verbs = db.listByNamespace(args.namespace);
    return {
      success: true,
      namespace: args.namespace,
      verbs,
      count: verbs.length,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ps_registry_audit(args: AuditRequest): AuditResult {
  try {
    const db = requireDB();
    const history = db.getAuditHistory(args.symbol);
    return {
      success: true,
      symbol: args.symbol,
      history,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function ps_registry_version(): VersionResult {
  try {
    const db = requireDB();
    const stats = db.getStats();
    return {
      success: true,
      spec_version: '0.2',
      verb_count: stats.total,
      byStatus: stats.byStatus,
      byNamespace: stats.byNamespace,
    };
  } catch (error) {
    return {
      success: false,
      spec_version: '0.2',
      verb_count: 0,
      ...(error instanceof Error ? { error: error.message } : {}),
    };
  }
}
