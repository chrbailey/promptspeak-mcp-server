/**
 * Policy Loader
 *
 * Loads and merges policy files from disk.
 * Handles base policies and overlays with priority ordering.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PolicyOverlay, ConfidenceThresholds } from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PolicyFile {
  id: string;
  name: string;
  version: string;
  description: string;
  created: string;
  priority: number;
  extends?: string;
  classification?: string;
  symbol_overrides?: Record<string, SymbolOverride>;
  tool_bindings?: ToolBindings;
  thresholds?: Partial<ConfidenceThresholds>;
  enforcement?: EnforcementConfig;
  drift_detection?: DriftDetectionConfig;
  features?: Record<string, boolean>;
  extensions?: Record<string, unknown>;
  decoy_responses?: DecoyConfig;
  ontology?: Record<string, Record<string, unknown>>;
  validation_rules?: Record<string, unknown>;
}

export interface SymbolOverride {
  name?: string;
  description?: string;
  blocked?: boolean;
  replacement?: string;
  enforcement?: string;
  allow_execution?: boolean;
  sandbox?: boolean;
  silent_transforms?: boolean;
  original_meaning_suppressed?: boolean;
  pre_execution_hook?: string;
  post_execution_hook?: string;
}

export interface ToolBindings {
  allowed?: string[];
  blocked?: string[];
  require_approval?: string[];
  default_allowed?: string[];
  default_blocked?: string[];
  domain_specific?: Record<string, { allowed?: string[]; blocked?: string[] }>;
  transform_outputs?: {
    enabled: boolean;
    transforms: Array<{ type: string; [key: string]: unknown }>;
  };
}

export interface EnforcementConfig {
  audit_all_operations?: boolean;
  audit_encrypted?: boolean;
  audit_destination?: string;
  require_explicit_mode?: boolean;
  block_unknown_symbols?: boolean;
  require_domain?: boolean;
  max_delegation_depth?: number;
  max_concurrent_agents?: number;
  compartmentalization?: {
    enabled: boolean;
    need_to_know?: boolean;
    agent_isolation?: boolean;
  };
}

export interface DriftDetectionConfig {
  check_frequency_ms?: number;
  tripwire_frequency?: number;
  circuit_breaker_threshold?: number;
  auto_halt_on_drift?: boolean;
  silent_tripwires?: boolean;
  behavior_profiling?: boolean;
}

export interface DecoyConfig {
  enabled: boolean;
  trigger_on: string[];
  response_type: string;
  log_decoy_usage?: boolean;
}

// ============================================================================
// POLICY LOADER
// ============================================================================

export class PolicyLoader {
  private basePoliciesDir: string;
  private overlaysDir: string;
  private loadedPolicies: Map<string, PolicyFile> = new Map();

  constructor(policiesRoot: string) {
    this.basePoliciesDir = path.join(policiesRoot, 'base');
    this.overlaysDir = path.join(policiesRoot, 'overlays');
  }

  /**
   * Load all policies from disk
   */
  loadAll(): void {
    this.loadedPolicies.clear();

    // Load base policies
    if (fs.existsSync(this.basePoliciesDir)) {
      this.loadDirectory(this.basePoliciesDir);
    }

    // Load overlays
    if (fs.existsSync(this.overlaysDir)) {
      this.loadDirectory(this.overlaysDir);
    }
  }

  private loadDirectory(dir: string): void {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const policy = JSON.parse(content) as PolicyFile;
          this.loadedPolicies.set(policy.id, policy);
        } catch (error) {
          console.error(`Failed to load policy ${filePath}:`, error);
        }
      }
    }
  }

  /**
   * Get a specific policy by ID
   */
  getPolicy(id: string): PolicyFile | undefined {
    return this.loadedPolicies.get(id);
  }

  /**
   * List all loaded policy IDs
   */
  listPolicies(): string[] {
    return Array.from(this.loadedPolicies.keys());
  }

  /**
   * Get merged policy with inheritance resolved
   */
  getMergedPolicy(id: string): PolicyFile | undefined {
    const policy = this.loadedPolicies.get(id);
    if (!policy) return undefined;

    if (!policy.extends) {
      return policy;
    }

    // Recursively get parent
    const parent = this.getMergedPolicy(policy.extends);
    if (!parent) {
      console.warn(`Policy ${id} extends ${policy.extends} but parent not found`);
      return policy;
    }

    // Merge with parent
    return this.mergePolicies(parent, policy);
  }

  private mergePolicies(parent: PolicyFile, child: PolicyFile): PolicyFile {
    return {
      ...parent,
      ...child,
      // Merge nested objects
      symbol_overrides: {
        ...parent.symbol_overrides,
        ...child.symbol_overrides
      },
      tool_bindings: this.mergeToolBindings(parent.tool_bindings, child.tool_bindings),
      thresholds: {
        ...parent.thresholds,
        ...child.thresholds
      },
      enforcement: {
        ...parent.enforcement,
        ...child.enforcement
      },
      drift_detection: {
        ...parent.drift_detection,
        ...child.drift_detection
      },
      features: {
        ...parent.features,
        ...child.features
      },
      extensions: {
        ...parent.extensions,
        ...child.extensions
      }
    };
  }

  private mergeToolBindings(
    parent?: ToolBindings,
    child?: ToolBindings
  ): ToolBindings | undefined {
    if (!parent && !child) return undefined;
    if (!parent) return child;
    if (!child) return parent;

    return {
      allowed: [...(child.allowed ?? parent.allowed ?? [])],
      blocked: [...(parent.blocked ?? []), ...(child.blocked ?? [])],
      require_approval: [...(parent.require_approval ?? []), ...(child.require_approval ?? [])],
      default_allowed: child.default_allowed ?? parent.default_allowed,
      default_blocked: [...(parent.default_blocked ?? []), ...(child.default_blocked ?? [])],
      domain_specific: {
        ...parent.domain_specific,
        ...child.domain_specific
      },
      transform_outputs: child.transform_outputs ?? parent.transform_outputs
    };
  }

  /**
   * Convert policy to PolicyOverlay format
   */
  toPolicyOverlay(id: string): PolicyOverlay | undefined {
    const policy = this.getMergedPolicy(id);
    if (!policy) return undefined;

    return {
      overlayId: policy.id,
      id: policy.id,  // Backward-compatible alias
      name: policy.name,
      description: policy.description ?? `Policy: ${policy.name}`,
      priority: policy.priority,
      symbolOverrides: this.convertSymbolOverrides(policy.symbol_overrides),
      toolBindings: {
        allowed: policy.tool_bindings?.allowed ?? [],
        blocked: policy.tool_bindings?.blocked ?? [],
        riskOverrides: {}
      },
      thresholdOverrides: policy.thresholds as ConfidenceThresholds,
      extensions: {
        enforcement: policy.enforcement,
        driftDetection: policy.drift_detection,
        decoyResponses: policy.decoy_responses,
        features: policy.features,
        ...policy.extensions
      }
    };
  }

  private convertSymbolOverrides(
    overrides?: Record<string, SymbolOverride>
  ): Record<string, { meaning?: string; blocked?: boolean; replacement?: string }> {
    if (!overrides) return {};

    const result: Record<string, { meaning?: string; blocked?: boolean; replacement?: string }> = {};
    for (const [symbol, override] of Object.entries(overrides)) {
      result[symbol] = {
        meaning: override.description,
        blocked: override.blocked,
        replacement: override.replacement
      };
    }
    return result;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let policyLoader: PolicyLoader | null = null;

export function initializePolicyLoader(policiesRoot: string): PolicyLoader {
  policyLoader = new PolicyLoader(policiesRoot);
  policyLoader.loadAll();
  return policyLoader;
}

export function getPolicyLoader(): PolicyLoader {
  if (!policyLoader) {
    throw new Error('PolicyLoader not initialized. Call initializePolicyLoader first.');
  }
  return policyLoader;
}
