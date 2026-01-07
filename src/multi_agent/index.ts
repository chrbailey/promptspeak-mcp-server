/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MULTI-AGENT MODULE - INDEX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Commander's Intent and Multi-Agent Operations for PromptSpeak.
 *
 * This module implements:
 * - Commander's Intent symbols (Ξ.I.*) for mission objectives
 * - Agent registration and binding
 * - Mission lifecycle management
 * - Intent consultation for autonomous decision-making
 *
 * Based on Marine Corps doctrine: Every agent knows the "why" and has latitude
 * to accomplish it without coordinator round-trips for every decision.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Autonomy and constraints
  AutonomyLevel,
  ConstraintSeverity,
  Constraint,
  EndStateConditions,
  SuccessCriterion,
  FailureMode,

  // Intent
  IntentSymbol,
  IntentConsultationRequest,
  IntentConsultationResult,
  IntentBinding,
  CreateIntentRequest,
  CreateIntentResponse,
  BindAgentRequest,
  BindAgentResponse,

  // Agents
  AgentRole,
  AgentStatus,
  AgentRegistration,

  // Missions
  MissionStatus,
  Mission,
  CreateMissionRequest,
  CreateMissionResponse,
} from './intent-types.js';

// ─────────────────────────────────────────────────────────────────────────────
// INTENT MANAGER EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  IntentManager,
  intentManager,
  createIntent,
  getIntent,
  bindAgent,
  consultIntent,
} from './intent-manager.js';

// ─────────────────────────────────────────────────────────────────────────────
// AGENT REGISTRY EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  AgentRegistry,
  agentRegistry,
  registerAgent,
  getAgent,
  listAgents,
  findAgentsByCapability,
} from './agent-registry.js';

// ─────────────────────────────────────────────────────────────────────────────
// MISSION MANAGER EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  MissionManager,
  missionManager,
  createMission,
  getMission,
  listMissions,
  startMission,
  completeMission,
} from './mission.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP TOOL EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Tool definitions
  PS_INTENT_CREATE_TOOL,
  PS_INTENT_GET_TOOL,
  PS_INTENT_CONSULT_TOOL,
  PS_AGENT_REGISTER_TOOL,
  PS_AGENT_BIND_TOOL,
  PS_MISSION_CREATE_TOOL,
  PS_MISSION_STATUS_TOOL,
  PS_MISSION_CONTROL_TOOL,
  multiAgentToolDefinitions,

  // Tool handlers
  handleIntentCreate,
  handleIntentGet,
  handleIntentConsult,
  handleAgentRegister,
  handleAgentBind,
  handleMissionCreate,
  handleMissionStatus,
  handleMissionControl,
  handleMultiAgentTool,
} from './tools.js';
