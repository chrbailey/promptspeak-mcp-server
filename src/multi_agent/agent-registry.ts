/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages agent registrations for multi-agent operations.
 * Every agent must be registered before it can be bound to an Intent.
 *
 * Based on Marine Corps doctrine: "Every Marine a rifleman"
 * - All agents can execute basic tasks
 * - Specialists have additional capabilities
 * - Agents can operate independently with Commander's Intent
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  AgentRegistration,
  AgentRole,
  AgentStatus,
  IntentBinding,
} from './intent-types.js';
import { intentManager as defaultIntentManager, type IntentManager } from './intent-manager.js';
import { LRUCache, ONE_HOUR_MS } from './lru-cache.js';
import type { AgentRegistryDeps } from './container.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('AgentRegistry');

// ─────────────────────────────────────────────────────────────────────────────
// CACHE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of agents to store before LRU eviction */
const MAX_AGENTS = 2000;

/** TTL for inactive agents: 1 hour */
const AGENT_TTL_MS = ONE_HOUR_MS;

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages the registry of available agents.
 * Uses LRU cache to prevent unbounded memory growth from inactive agents.
 */
export class AgentRegistry {
  private agents: LRUCache<AgentRegistration>;
  private readonly intentManager: IntentManager;

  /**
   * Create an AgentRegistry instance.
   *
   * @param deps - Optional dependencies for testing/DI. Falls back to singletons.
   * @param deps.intentManager - IntentManager instance to use for agent bindings
   *
   * @example
   * // Production usage (uses default singleton)
   * const registry = new AgentRegistry();
   *
   * @example
   * // Testing with mock
   * const registry = new AgentRegistry({ intentManager: mockIntentManager });
   */
  constructor(deps?: AgentRegistryDeps) {
    // Use injected dependency or fall back to singleton
    this.intentManager = deps?.intentManager ?? defaultIntentManager;

    this.agents = new LRUCache<AgentRegistration>({
      maxSize: MAX_AGENTS,
      ttlMs: AGENT_TTL_MS,
      onEvict: (key, value) => {
        const agent = value as AgentRegistration;
        // Unbind agent from any Intent when evicted
        this.intentManager.unbindAgent(agent.agent_id);
        logger.info(`Evicting inactive agent: ${agent.agent_id}`);
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AGENT LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register a new agent.
   */
  register(
    agentId: string,
    name: string,
    role: AgentRole,
    capabilities: string[]
  ): AgentRegistration {
    if (this.agents.has(agentId)) {
      throw new Error(`Agent already registered: ${agentId}`);
    }

    const registration: AgentRegistration = {
      agent_id: agentId,
      name,
      role,
      status: 'idle',
      capabilities,
      registered_at: new Date().toISOString(),
      metrics: {
        missions_completed: 0,
        missions_failed: 0,
        avg_completion_time_ms: 0,
        last_active: new Date().toISOString(),
      },
    };

    this.agents.set(agentId, registration);
    return registration;
  }

  /**
   * Get an agent by ID.
   */
  getAgent(agentId: string): AgentRegistration | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all agents, optionally filtered by role or status.
   */
  listAgents(filters?: { role?: AgentRole; status?: AgentStatus }): AgentRegistration[] {
    let agents = this.agents.values();

    if (filters?.role) {
      agents = agents.filter(a => a.role === filters.role);
    }

    if (filters?.status) {
      agents = agents.filter(a => a.status === filters.status);
    }

    return agents;
  }

  /**
   * Update agent status.
   * Also extends the TTL to prevent eviction of active agents.
   */
  updateStatus(agentId: string, status: AgentStatus): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.status = status;
    if (agent.metrics) {
      agent.metrics.last_active = new Date().toISOString();
    }

    // Extend TTL for active agents
    this.agents.touch(agentId);

    return true;
  }

  /**
   * Record agent heartbeat.
   * Also extends the TTL to prevent eviction of active agents.
   */
  heartbeat(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.last_heartbeat = new Date().toISOString();

    // Extend TTL on heartbeat
    this.agents.touch(agentId);

    return true;
  }

  /**
   * Deregister an agent.
   */
  deregister(agentId: string): boolean {
    // First, unbind from any Intent
    this.intentManager.unbindAgent(agentId);

    return this.agents.delete(agentId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CAPABILITY MATCHING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Find agents with specific capabilities.
   */
  findByCapability(capability: string): AgentRegistration[] {
    return this.agents.filter(a =>
      a.capabilities.some(c => c.toLowerCase().includes(capability.toLowerCase()))
    );
  }

  /**
   * Find idle agents that can take on a new task.
   */
  findAvailable(requiredCapabilities?: string[]): AgentRegistration[] {
    let available = this.agents.filter(
      a => a.status === 'idle' || a.status === 'completed'
    );

    if (requiredCapabilities && requiredCapabilities.length > 0) {
      available = available.filter(a =>
        requiredCapabilities.every(required =>
          a.capabilities.some(c => c.toLowerCase().includes(required.toLowerCase()))
        )
      );
    }

    return available;
  }

  /**
   * Get the best agent for a role.
   */
  getBestForRole(role: AgentRole, requiredCapabilities?: string[]): AgentRegistration | undefined {
    const candidates = this.findAvailable(requiredCapabilities).filter(a => a.role === role);

    if (candidates.length === 0) return undefined;

    // Sort by success rate and average completion time
    candidates.sort((a, b) => {
      const aMetrics = a.metrics || { missions_completed: 0, missions_failed: 0, avg_completion_time_ms: Infinity };
      const bMetrics = b.metrics || { missions_completed: 0, missions_failed: 0, avg_completion_time_ms: Infinity };

      const aSuccessRate = aMetrics.missions_completed / (aMetrics.missions_completed + aMetrics.missions_failed || 1);
      const bSuccessRate = bMetrics.missions_completed / (bMetrics.missions_completed + bMetrics.missions_failed || 1);

      // Prefer higher success rate, then faster completion
      if (Math.abs(aSuccessRate - bSuccessRate) > 0.1) {
        return bSuccessRate - aSuccessRate;
      }

      return aMetrics.avg_completion_time_ms - bMetrics.avg_completion_time_ms;
    });

    return candidates[0];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Record mission completion for an agent.
   */
  recordCompletion(agentId: string, durationMs: number, success: boolean): void {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.metrics) return;

    if (success) {
      agent.metrics.missions_completed++;
    } else {
      agent.metrics.missions_failed++;
    }

    // Update running average
    const totalMissions = agent.metrics.missions_completed + agent.metrics.missions_failed;
    agent.metrics.avg_completion_time_ms =
      (agent.metrics.avg_completion_time_ms * (totalMissions - 1) + durationMs) / totalMissions;

    agent.metrics.last_active = new Date().toISOString();
    agent.status = 'idle';
  }

  /**
   * Get cache statistics for monitoring.
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return this.agents.stats();
  }

  /**
   * Cleanup expired entries from cache.
   * Returns the number of entries evicted.
   */
  cleanup(): number {
    return this.agents.cleanup();
  }

  /**
   * Touch an agent to extend its TTL (call on activity).
   */
  touchAgent(agentId: string): boolean {
    return this.agents.touch(agentId);
  }

  /**
   * Get registry statistics.
   */
  getStats(): {
    total: number;
    byRole: Record<AgentRole, number>;
    byStatus: Record<AgentStatus, number>;
    avgSuccessRate: number;
  } {
    const agents = this.agents.values();

    const byRole: Record<AgentRole, number> = {
      coordinator: 0,
      specialist: 0,
      support: 0,
      terminal: 0,
    };

    const byStatus: Record<AgentStatus, number> = {
      idle: 0,
      briefed: 0,
      executing: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      recalled: 0,
    };

    let totalSuccessRate = 0;
    let agentsWithMetrics = 0;

    for (const agent of agents) {
      byRole[agent.role]++;
      byStatus[agent.status]++;

      if (agent.metrics) {
        const total = agent.metrics.missions_completed + agent.metrics.missions_failed;
        if (total > 0) {
          totalSuccessRate += agent.metrics.missions_completed / total;
          agentsWithMetrics++;
        }
      }
    }

    return {
      total: agents.length,
      byRole,
      byStatus,
      avgSuccessRate: agentsWithMetrics > 0 ? totalSuccessRate / agentsWithMetrics : 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTENT BINDING INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update agent's current binding.
   */
  setBinding(agentId: string, binding: IntentBinding): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.current_binding = binding;
      agent.status = 'briefed';
    }
  }

  /**
   * Clear agent's current binding.
   */
  clearBinding(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.current_binding = undefined;
      agent.status = 'idle';
    }
  }

  /**
   * Get all agents bound to a specific Intent.
   */
  getAgentsByIntent(intentId: string): AgentRegistration[] {
    return this.agents.filter(a => a.current_binding?.intent_id === intentId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const agentRegistry = new AgentRegistry();

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const registerAgent = (
  agentId: string,
  name: string,
  role: AgentRole,
  capabilities: string[]
) => agentRegistry.register(agentId, name, role, capabilities);

export const getAgent = (id: string) => agentRegistry.getAgent(id);
export const listAgents = (filters?: { role?: AgentRole; status?: AgentStatus }) =>
  agentRegistry.listAgents(filters);
export const findAgentsByCapability = (capability: string) =>
  agentRegistry.findByCapability(capability);
