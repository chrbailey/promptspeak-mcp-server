/**
 * Observation Hook System
 *
 * Pluggable hook architecture for processing observations in RECONNAISSANCE mode.
 * Hooks are triggered when agents record observations and can:
 * - Store data in the database (database-sync-hook)
 * - Upsert vectors to Pinecone (pinecone-sync-hook)
 * - Send webhook notifications (webhook-alert-hook)
 * - Update MCP resources (mcp-resource-hook)
 */

import type { Observation, ObservationType, ReconRole } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filter criteria for when a hook should execute.
 */
export interface HookFilter {
  /** Minimum confidence score to trigger */
  minConfidence?: number;
  /** Market conditions to match */
  marketConditions?: string[];
  /** Agent roles to match */
  agentRoles?: ReconRole[];
  /** Custom filter function */
  customFilter?: (observation: Observation) => boolean;
}

/**
 * Result of hook execution.
 */
export interface HookExecutionResult {
  hookId: string;
  hookName: string;
  success: boolean;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook configuration and handler.
 */
export interface ObservationHook {
  /** Unique hook identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether hook is active */
  enabled: boolean;
  /** Priority (higher = runs first) */
  priority: number;

  /** Observation types this hook processes */
  observationTypes: ObservationType[];
  /** Optional filter criteria */
  filters?: HookFilter;

  /** Handler function called for matching observations */
  handler: (observation: Observation) => Promise<void>;

  /** Optional cleanup function called on shutdown */
  cleanup?: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registry for managing observation hooks.
 */
export class ObservationHookRegistry {
  private hooks: Map<string, ObservationHook> = new Map();
  private executionStats: Map<string, { calls: number; errors: number; totalMs: number }> = new Map();

  /**
   * Register a new hook.
   */
  register(hook: ObservationHook): void {
    if (this.hooks.has(hook.id)) {
      throw new Error(`Hook with id '${hook.id}' is already registered`);
    }
    this.hooks.set(hook.id, hook);
    this.executionStats.set(hook.id, { calls: 0, errors: 0, totalMs: 0 });
  }

  /**
   * Unregister a hook.
   */
  async unregister(hookId: string): Promise<void> {
    const hook = this.hooks.get(hookId);
    if (hook?.cleanup) {
      await hook.cleanup();
    }
    this.hooks.delete(hookId);
    this.executionStats.delete(hookId);
  }

  /**
   * Enable or disable a hook.
   */
  setEnabled(hookId: string, enabled: boolean): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    hook.enabled = enabled;
    return true;
  }

  /**
   * Get a hook by ID.
   */
  getHook(hookId: string): ObservationHook | undefined {
    return this.hooks.get(hookId);
  }

  /**
   * Get all registered hooks.
   */
  getAllHooks(): ObservationHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Get enabled hooks sorted by priority.
   */
  getEnabledHooks(): ObservationHook[] {
    return Array.from(this.hooks.values())
      .filter(h => h.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Execute all matching hooks for an observation.
   */
  async executeHooks(observation: Observation): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];
    const enabledHooks = this.getEnabledHooks();

    for (const hook of enabledHooks) {
      // Check if hook should process this observation type
      if (!hook.observationTypes.includes(observation.observationType)) {
        continue;
      }

      // Apply filters
      if (!this.passesFilters(hook, observation)) {
        continue;
      }

      // Execute hook
      const startTime = Date.now();
      const result: HookExecutionResult = {
        hookId: hook.id,
        hookName: hook.name,
        success: false,
        durationMs: 0,
      };

      try {
        await hook.handler(observation);
        result.success = true;
      } catch (error) {
        result.success = false;
        result.error = error instanceof Error ? error.message : 'Unknown error';
      }

      result.durationMs = Date.now() - startTime;
      results.push(result);

      // Update stats
      const stats = this.executionStats.get(hook.id);
      if (stats) {
        stats.calls++;
        stats.totalMs += result.durationMs;
        if (!result.success) stats.errors++;
      }
    }

    return results;
  }

  /**
   * Check if observation passes hook filters.
   */
  private passesFilters(hook: ObservationHook, observation: Observation): boolean {
    const filters = hook.filters;
    if (!filters) return true;

    // Check confidence threshold
    if (filters.minConfidence !== undefined) {
      if (observation.confidenceScore < filters.minConfidence) {
        return false;
      }
    }

    // Check market conditions
    if (filters.marketConditions?.length) {
      if (!filters.marketConditions.includes(observation.marketCondition)) {
        return false;
      }
    }

    // Custom filter
    if (filters.customFilter) {
      if (!filters.customFilter(observation)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get execution statistics for a hook.
   */
  getStats(hookId: string): { calls: number; errors: number; avgMs: number } | null {
    const stats = this.executionStats.get(hookId);
    if (!stats) return null;

    return {
      calls: stats.calls,
      errors: stats.errors,
      avgMs: stats.calls > 0 ? stats.totalMs / stats.calls : 0,
    };
  }

  /**
   * Get all hook statistics.
   */
  getAllStats(): Map<string, { calls: number; errors: number; avgMs: number }> {
    const result = new Map<string, { calls: number; errors: number; avgMs: number }>();

    for (const [hookId, stats] of this.executionStats) {
      result.set(hookId, {
        calls: stats.calls,
        errors: stats.errors,
        avgMs: stats.calls > 0 ? stats.totalMs / stats.calls : 0,
      });
    }

    return result;
  }

  /**
   * Cleanup all hooks on shutdown.
   */
  async shutdown(): Promise<void> {
    for (const hook of this.hooks.values()) {
      if (hook.cleanup) {
        try {
          await hook.cleanup();
        } catch (error) {
          console.error(`Error cleaning up hook ${hook.id}:`, error);
        }
      }
    }
    this.hooks.clear();
    this.executionStats.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let registryInstance: ObservationHookRegistry | null = null;

/**
 * Get the observation hook registry singleton.
 */
export function getObservationHookRegistry(): ObservationHookRegistry {
  if (!registryInstance) {
    registryInstance = new ObservationHookRegistry();
  }
  return registryInstance;
}

/**
 * Create a fresh registry (for testing).
 */
export function createObservationHookRegistry(): ObservationHookRegistry {
  return new ObservationHookRegistry();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builder for creating hooks with fluent API.
 */
export class HookBuilder {
  private hook: Partial<ObservationHook> = {
    enabled: true,
    priority: 0,
    observationTypes: [],
  };

  /**
   * Set hook ID.
   */
  id(id: string): this {
    this.hook.id = id;
    return this;
  }

  /**
   * Set hook name.
   */
  name(name: string): this {
    this.hook.name = name;
    return this;
  }

  /**
   * Set hook priority.
   */
  priority(priority: number): this {
    this.hook.priority = priority;
    return this;
  }

  /**
   * Add observation types to handle.
   */
  forTypes(...types: ObservationType[]): this {
    this.hook.observationTypes = types;
    return this;
  }

  /**
   * Add all observation types.
   */
  forAllTypes(): this {
    this.hook.observationTypes = [
      'LISTING_DISCOVERED',
      'PRICE_OBSERVED',
      'MARKET_CONDITION_DETECTED',
      'OPPORTUNITY_IDENTIFIED',
      'SELLER_BEHAVIOR_OBSERVED',
      'PROBE_REQUESTED',
      'PROBE_EXECUTED',
      'ALERT_TRIGGERED',
    ];
    return this;
  }

  /**
   * Add filter for minimum confidence.
   */
  minConfidence(threshold: number): this {
    this.hook.filters = { ...this.hook.filters, minConfidence: threshold };
    return this;
  }

  /**
   * Add filter for market conditions.
   */
  forMarketConditions(...conditions: string[]): this {
    this.hook.filters = { ...this.hook.filters, marketConditions: conditions };
    return this;
  }

  /**
   * Add custom filter.
   */
  withFilter(filter: (obs: Observation) => boolean): this {
    this.hook.filters = { ...this.hook.filters, customFilter: filter };
    return this;
  }

  /**
   * Set the handler function.
   */
  handler(fn: (observation: Observation) => Promise<void>): this {
    this.hook.handler = fn;
    return this;
  }

  /**
   * Set cleanup function.
   */
  cleanup(fn: () => Promise<void>): this {
    this.hook.cleanup = fn;
    return this;
  }

  /**
   * Build the hook.
   */
  build(): ObservationHook {
    if (!this.hook.id) throw new Error('Hook ID is required');
    if (!this.hook.name) throw new Error('Hook name is required');
    if (!this.hook.handler) throw new Error('Hook handler is required');
    if (!this.hook.observationTypes?.length) {
      throw new Error('At least one observation type is required');
    }

    return this.hook as ObservationHook;
  }
}

/**
 * Create a new hook builder.
 */
export function createHook(): HookBuilder {
  return new HookBuilder();
}
