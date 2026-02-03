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
// DEPENDENCY INJECTION EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  container,
  createMultiAgentContainer,
  getDefaultContainer,
} from './container.js';

export type {
  MultiAgentContainer,
  AgentRegistryDeps,
  MissionManagerDeps,
} from './container.js';

// ─────────────────────────────────────────────────────────────────────────────
// LRU CACHE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  LRUCache,
  createLRUCache,
  ONE_HOUR_MS,
  TWELVE_HOURS_MS,
  TWENTY_FOUR_HOURS_MS,
  SEVEN_DAYS_MS,
} from './lru-cache.js';

export type { LRUCacheConfig } from './lru-cache.js';

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
// BOOT CAMP EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  BootCampProtocol,
  getBootCamp,
  initializeBootCamp,
  BOOT_CAMP_VERSION,
  DEFAULT_CHARACTERISTICS,
} from './boot-camp.js';

export type {
  MarineCharacteristics,
  MarineCertification,
  BootCampPhase,
  TrainingScenario,
  BootCampSession,
} from './boot-camp.js';

// ─────────────────────────────────────────────────────────────────────────────
// MCP TOOL EXPORTS (Legacy tools.ts)
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
  // Boot Camp tool definitions
  PS_BOOTCAMP_START_TOOL,
  PS_BOOTCAMP_SCENARIO_TOOL,
  PS_BOOTCAMP_SUBMIT_TOOL,
  PS_BOOTCAMP_STATUS_TOOL,
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
  // Boot Camp handlers
  handleBootCampStart,
  handleBootCampScenario,
  handleBootCampSubmit,
  handleBootCampStatus,
  handleMultiAgentTool,
} from './tools.js';

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDER'S INTENT TOOLS (New pattern with mcpSuccess/mcpFailure)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Tool definitions
  INTENT_TOOLS,

  // Tool handlers (use mcpSuccess/mcpFailure pattern)
  handleMissionCreate as handleIntentMissionCreate,
  handleMissionStatus as handleIntentMissionStatus,
  handleMissionComplete as handleIntentMissionComplete,
  handleAgentRegister as handleIntentAgentRegister,
  handleAgentHeartbeat as handleIntentAgentHeartbeat,
  handleIntentConsult as handleIntentConsultation,
} from './intent-tools.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

export {
  dispatchIntentTool,
  isIntentTool,
  getIntentToolNames,
  getIntentToolDefinitions,
  getIntentToolCount,
} from './tool-dispatcher.js';
