/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MISSION MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Manages multi-agent missions - coordinated operations with a single Intent.
 *
 * A Mission is:
 * - A coordinated multi-agent operation
 * - Governed by a single Commander's Intent
 * - Executed by multiple agents with different roles
 * - Tracked through phases to completion
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  Mission,
  MissionStatus,
  CreateMissionRequest,
  CreateMissionResponse,
  AgentRole,
  IntentBinding,
} from './intent-types.js';
import { intentManager } from './intent-manager.js';
import { agentRegistry } from './agent-registry.js';
import { LRUCache, SEVEN_DAYS_MS } from './lru-cache.js';

// ─────────────────────────────────────────────────────────────────────────────
// CACHE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of missions to store before LRU eviction */
const MAX_MISSIONS = 500;

/** TTL for completed missions: 7 days */
const COMPLETED_MISSION_TTL_MS = SEVEN_DAYS_MS;

/** Active missions have effectively infinite TTL (they are touched regularly) */
const ACTIVE_MISSION_TTL_MS = Infinity;

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages multi-agent missions.
 * Uses LRU cache to prevent unbounded memory growth.
 * Active missions are kept alive via touch(), completed missions expire after 7 days.
 */
export class MissionManager {
  private missions: LRUCache<Mission>;

  constructor() {
    // Use 7-day TTL - active missions are kept alive by touching on access/update
    this.missions = new LRUCache<Mission>({
      maxSize: MAX_MISSIONS,
      ttlMs: COMPLETED_MISSION_TTL_MS,
      onEvict: (key, value) => {
        const mission = value as Mission;
        console.log(`[MissionManager] Evicting mission: ${mission.mission_id} (status: ${mission.status})`);
        // Ensure agents are cleaned up when mission is evicted
        for (const assignment of mission.agents) {
          intentManager.unbindAgent(assignment.agent_id);
          agentRegistry.clearBinding(assignment.agent_id);
        }
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MISSION LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a new mission.
   */
  async createMission(request: CreateMissionRequest): Promise<CreateMissionResponse> {
    try {
      // Verify Intent exists
      const intent = intentManager.getIntent(request.intent_id);
      if (!intent) {
        return { success: false, error: `Intent not found: ${request.intent_id}` };
      }

      // Generate mission ID
      const missionId = `M.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;

      // Create mission
      const mission: Mission = {
        mission_id: missionId,
        name: request.name,
        description: request.description,
        intent_id: request.intent_id,
        status: 'planning',
        agents: [],
        timeline: {
          created_at: new Date().toISOString(),
          estimated_duration: request.estimated_duration,
        },
        created_by: request.created_by,
        namespace: request.namespace,
      };

      // Assign agents if provided
      let bindingsCreated = 0;
      if (request.agent_assignments) {
        for (const assignment of request.agent_assignments) {
          const bindResult = await this.assignAgent(
            missionId,
            assignment.agent_id,
            assignment.role,
            request.created_by,
            mission
          );

          if (bindResult.success) {
            bindingsCreated++;
          }
        }

        // Update status if agents assigned
        if (bindingsCreated > 0) {
          mission.status = 'briefing';
        }
      }

      // Store mission
      this.missions.set(missionId, mission);

      return {
        success: true,
        mission_id: missionId,
        bindings_created: bindingsCreated,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get a mission by ID.
   */
  getMission(missionId: string): Mission | undefined {
    return this.missions.get(missionId);
  }

  /**
   * List all missions, optionally filtered.
   */
  listMissions(filters?: {
    status?: MissionStatus;
    namespace?: string;
  }): Mission[] {
    let missions = this.missions.values();

    if (filters?.status) {
      missions = missions.filter(m => m.status === filters.status);
    }

    if (filters?.namespace) {
      missions = missions.filter(m => m.namespace === filters.namespace);
    }

    return missions;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return this.missions.stats();
  }

  /**
   * Cleanup expired entries from cache.
   * Returns the number of entries evicted.
   */
  cleanup(): number {
    return this.missions.cleanup();
  }

  /**
   * Touch a mission to extend its TTL (for active missions).
   */
  private touchMission(missionId: string): void {
    const mission = this.missions.get(missionId);
    if (mission && this.isActiveMission(mission.status)) {
      this.missions.touch(missionId);
    }
  }

  /**
   * Check if mission status indicates it's still active.
   */
  private isActiveMission(status: MissionStatus): boolean {
    return status === 'planning' || status === 'briefing' || status === 'active' || status === 'paused';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AGENT ASSIGNMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Assign an agent to a mission.
   */
  async assignAgent(
    missionId: string,
    agentId: string,
    role: AgentRole,
    assignedBy: string,
    missionOverride?: Mission
  ): Promise<{ success: boolean; binding_id?: string; error?: string }> {
    const mission = missionOverride || this.missions.get(missionId);
    if (!mission) {
      return { success: false, error: `Mission not found: ${missionId}` };
    }

    // Verify agent exists
    const agent = agentRegistry.getAgent(agentId);
    if (!agent) {
      return { success: false, error: `Agent not found: ${agentId}` };
    }

    // Bind agent to Intent
    const bindResult = await intentManager.bindAgent({
      intent_id: mission.intent_id,
      agent_id: agentId,
      bound_by: assignedBy,
    });

    if (!bindResult.success) {
      return { success: false, error: bindResult.error };
    }

    // Add to mission
    mission.agents.push({
      agent_id: agentId,
      role,
      binding_id: bindResult.binding_id!,
    });

    // Update agent registry
    const binding = intentManager.getAgentBinding(agentId);
    if (binding) {
      agentRegistry.setBinding(agentId, binding);
    }

    return { success: true, binding_id: bindResult.binding_id };
  }

  /**
   * Remove an agent from a mission.
   */
  removeAgent(missionId: string, agentId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    const index = mission.agents.findIndex(a => a.agent_id === agentId);
    if (index === -1) return false;

    // Remove from mission
    mission.agents.splice(index, 1);

    // Unbind from Intent
    intentManager.unbindAgent(agentId);

    // Update agent registry
    agentRegistry.clearBinding(agentId);

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MISSION STATUS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start a mission.
   */
  startMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    if (mission.status !== 'planning' && mission.status !== 'briefing') {
      return false;
    }

    if (mission.agents.length === 0) {
      return false; // Can't start with no agents
    }

    mission.status = 'active';
    mission.timeline.started_at = new Date().toISOString();

    // Touch to extend TTL for active mission
    this.touchMission(missionId);

    // Update all assigned agents
    for (const assignment of mission.agents) {
      agentRegistry.updateStatus(assignment.agent_id, 'executing');
    }

    return true;
  }

  /**
   * Pause a mission.
   */
  pauseMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== 'active') return false;

    mission.status = 'paused';

    // Touch to extend TTL for paused mission (still active)
    this.touchMission(missionId);

    // Update all assigned agents
    for (const assignment of mission.agents) {
      agentRegistry.updateStatus(assignment.agent_id, 'blocked');
    }

    return true;
  }

  /**
   * Resume a paused mission.
   */
  resumeMission(missionId: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission || mission.status !== 'paused') return false;

    mission.status = 'active';

    // Touch to extend TTL for resumed mission
    this.touchMission(missionId);

    // Update all assigned agents
    for (const assignment of mission.agents) {
      agentRegistry.updateStatus(assignment.agent_id, 'executing');
    }

    return true;
  }

  /**
   * Complete a mission.
   */
  completeMission(missionId: string, success: boolean): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    mission.status = success ? 'completed' : 'failed';
    mission.timeline.completed_at = new Date().toISOString();

    // Calculate duration
    const startedAt = mission.timeline.started_at
      ? new Date(mission.timeline.started_at).getTime()
      : Date.now();
    const durationMs = Date.now() - startedAt;

    // Update all assigned agents and record metrics
    for (const assignment of mission.agents) {
      intentManager.unbindAgent(assignment.agent_id);
      agentRegistry.clearBinding(assignment.agent_id);
      agentRegistry.recordCompletion(assignment.agent_id, durationMs, success);
    }

    return true;
  }

  /**
   * Abort a mission.
   */
  abortMission(missionId: string, reason?: string): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    mission.status = 'aborted';
    mission.timeline.completed_at = new Date().toISOString();

    // Recall all agents
    for (const assignment of mission.agents) {
      intentManager.unbindAgent(assignment.agent_id);
      agentRegistry.clearBinding(assignment.agent_id);
      agentRegistry.updateStatus(assignment.agent_id, 'recalled');
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROGRESS TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update mission progress.
   */
  updateProgress(
    missionId: string,
    progress: {
      phase?: string;
      percent_complete?: number;
      milestone_achieved?: string;
      blocker?: string;
      blocker_resolved?: string;
    }
  ): boolean {
    const mission = this.missions.get(missionId);
    if (!mission) return false;

    if (!mission.progress) {
      mission.progress = {
        phase: progress.phase || 'initial',
        percent_complete: progress.percent_complete || 0,
        milestones_achieved: [],
        current_blockers: [],
      };
    }

    if (progress.phase) {
      mission.progress.phase = progress.phase;
    }

    if (progress.percent_complete !== undefined) {
      mission.progress.percent_complete = Math.min(100, Math.max(0, progress.percent_complete));
    }

    if (progress.milestone_achieved) {
      mission.progress.milestones_achieved.push(progress.milestone_achieved);
    }

    if (progress.blocker) {
      mission.progress.current_blockers.push(progress.blocker);
    }

    if (progress.blocker_resolved) {
      mission.progress.current_blockers = mission.progress.current_blockers.filter(
        b => b !== progress.blocker_resolved
      );
    }

    // Touch to extend TTL for active mission receiving updates
    this.touchMission(missionId);

    return true;
  }

  /**
   * Get mission status summary.
   */
  getMissionStatus(missionId: string): {
    status: MissionStatus;
    progress: Mission['progress'];
    agents: number;
    duration_ms?: number;
  } | undefined {
    const mission = this.missions.get(missionId);
    if (!mission) return undefined;

    let duration_ms: number | undefined;
    if (mission.timeline.started_at) {
      const endTime = mission.timeline.completed_at
        ? new Date(mission.timeline.completed_at).getTime()
        : Date.now();
      duration_ms = endTime - new Date(mission.timeline.started_at).getTime();
    }

    return {
      status: mission.status,
      progress: mission.progress,
      agents: mission.agents.length,
      duration_ms,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get mission statistics.
   */
  getStats(): {
    total: number;
    byStatus: Record<MissionStatus, number>;
    activeAgents: number;
  } {
    const missions = this.missions.values();

    const byStatus: Record<MissionStatus, number> = {
      planning: 0,
      briefing: 0,
      active: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      aborted: 0,
    };

    let activeAgents = 0;

    for (const mission of missions) {
      byStatus[mission.status]++;
      if (mission.status === 'active') {
        activeAgents += mission.agents.length;
      }
    }

    return {
      total: missions.length,
      byStatus,
      activeAgents,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

export const missionManager = new MissionManager();

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const createMission = (request: CreateMissionRequest) => missionManager.createMission(request);
export const getMission = (id: string) => missionManager.getMission(id);
export const listMissions = (filters?: { status?: MissionStatus; namespace?: string }) =>
  missionManager.listMissions(filters);
export const startMission = (id: string) => missionManager.startMission(id);
export const completeMission = (id: string, success: boolean) => missionManager.completeMission(id, success);
