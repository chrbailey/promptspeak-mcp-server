/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MULTI-AGENT MCP TOOLS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * MCP tool definitions and handlers for Commander's Intent and multi-agent ops.
 *
 * Tools:
 * - ps_intent_create - Create a Commander's Intent
 * - ps_intent_get - Get Intent details
 * - ps_intent_consult - Consult Intent for a decision
 * - ps_agent_register - Register an agent
 * - ps_agent_bind - Bind agent to Intent
 * - ps_mission_create - Create a mission
 * - ps_mission_status - Get mission status
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  CreateIntentRequest,
  CreateIntentResponse,
  IntentConsultationRequest,
  IntentConsultationResult,
  BindAgentRequest,
  BindAgentResponse,
  CreateMissionRequest,
  CreateMissionResponse,
  AgentRole,
  AutonomyLevel,
} from './intent-types.js';
import { intentManager } from './intent-manager.js';
import { agentRegistry } from './agent-registry.js';
import { missionManager } from './mission.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ps_intent_create - Create a Commander's Intent
 */
export const PS_INTENT_CREATE_TOOL = {
  name: 'ps_intent_create',
  description: `Create a Commander's Intent symbol for multi-agent operations.

Commander's Intent defines:
- OBJECTIVE: What we're trying to accomplish
- END STATE: How we know we're done (success/failure conditions)
- CONSTRAINTS: What agents must/must not do
- RED LINES: Absolute prohibitions (never cross)
- AUTONOMY LEVEL: How much latitude agents have

Agents bound to an Intent can make autonomous decisions by consulting it.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      mission_id: {
        type: 'string',
        description: 'Unique mission identifier (e.g., "MARKET_ANALYSIS_001")',
      },
      objective: {
        type: 'string',
        description: 'What we are trying to accomplish - the north star',
      },
      end_state: {
        type: 'object',
        properties: {
          success: {
            type: 'array',
            items: { type: 'string' },
            description: 'Conditions that indicate success',
          },
          failure: {
            type: 'array',
            items: { type: 'string' },
            description: 'Conditions that indicate failure',
          },
          timeout: {
            type: 'string',
            description: 'ISO 8601 duration before timeout (e.g., "PT1H")',
          },
        },
        required: ['success', 'failure'],
      },
      red_lines: {
        type: 'array',
        items: { type: 'string' },
        description: 'Absolute prohibitions - never cross these',
      },
      autonomy_level: {
        type: 'string',
        enum: ['strict', 'guided', 'autonomous', 'exploratory'],
        description: 'How much latitude agents have (default: guided)',
      },
      constraints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['advisory', 'required', 'critical'] },
            on_violation: { type: 'string', enum: ['warn', 'block', 'escalate', 'terminate'] },
          },
        },
        description: 'Behavioral constraints for agents',
      },
      created_by: {
        type: 'string',
        description: 'Creator identifier',
      },
    },
    required: ['mission_id', 'objective', 'end_state', 'red_lines', 'created_by'],
  },
};

/**
 * ps_intent_get - Get Intent details
 */
export const PS_INTENT_GET_TOOL = {
  name: 'ps_intent_get',
  description: `Get details of a Commander's Intent symbol.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      intent_id: {
        type: 'string',
        description: 'Intent ID (e.g., "Ξ.I.MARKET_ANALYSIS_001")',
      },
    },
    required: ['intent_id'],
  },
};

/**
 * ps_intent_consult - Consult Intent for a decision
 */
export const PS_INTENT_CONSULT_TOOL = {
  name: 'ps_intent_consult',
  description: `Consult Commander's Intent to decide on an action.

Use this when an agent is uncertain about what to do. The Intent will:
1. Check if action violates red lines
2. Evaluate constraints
3. Assess if action advances the objective
4. Return a recommendation with reasoning

Returns: proceed | proceed_with_caution | escalate | abort`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent making the request',
      },
      intent_id: {
        type: 'string',
        description: 'Intent to consult',
      },
      situation: {
        type: 'string',
        description: 'Current situation description',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            pros: { type: 'array', items: { type: 'string' } },
            cons: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'description'],
        },
        description: 'Options being considered',
      },
      urgency: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Urgency level (default: medium)',
      },
    },
    required: ['agent_id', 'intent_id', 'situation', 'options'],
  },
};

/**
 * ps_agent_register - Register an agent
 */
export const PS_AGENT_REGISTER_TOOL = {
  name: 'ps_agent_register',
  description: `Register an agent in the multi-agent system.

Roles:
- coordinator: High-level orchestration (α agent)
- specialist: Domain-specific execution (β agent)
- support: Auxiliary functions (γ agent)
- terminal: Final output generation (ω agent)`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_id: {
        type: 'string',
        description: 'Unique agent identifier',
      },
      name: {
        type: 'string',
        description: 'Human-readable name',
      },
      role: {
        type: 'string',
        enum: ['coordinator', 'specialist', 'support', 'terminal'],
        description: 'Agent role in multi-agent operations',
      },
      capabilities: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of capabilities this agent provides',
      },
    },
    required: ['agent_id', 'name', 'role', 'capabilities'],
  },
};

/**
 * ps_agent_bind - Bind agent to Intent
 */
export const PS_AGENT_BIND_TOOL = {
  name: 'ps_agent_bind',
  description: `Bind an agent to a Commander's Intent.

Once bound, the agent can consult the Intent for autonomous decision-making.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      intent_id: {
        type: 'string',
        description: 'Intent to bind to',
      },
      agent_id: {
        type: 'string',
        description: 'Agent to bind',
      },
      bound_by: {
        type: 'string',
        description: 'Who is authorizing the binding',
      },
    },
    required: ['intent_id', 'agent_id', 'bound_by'],
  },
};

/**
 * ps_mission_create - Create a mission
 */
export const PS_MISSION_CREATE_TOOL = {
  name: 'ps_mission_create',
  description: `Create a multi-agent mission governed by a Commander's Intent.

A mission coordinates multiple agents working toward a single objective.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Mission name',
      },
      description: {
        type: 'string',
        description: 'Mission description',
      },
      intent_id: {
        type: 'string',
        description: 'Commander\'s Intent governing this mission',
      },
      agent_assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
            role: { type: 'string', enum: ['coordinator', 'specialist', 'support', 'terminal'] },
          },
          required: ['agent_id', 'role'],
        },
        description: 'Initial agent assignments',
      },
      estimated_duration: {
        type: 'string',
        description: 'Estimated duration (ISO 8601, e.g., "PT2H")',
      },
      created_by: {
        type: 'string',
        description: 'Creator identifier',
      },
    },
    required: ['name', 'description', 'intent_id', 'created_by'],
  },
};

/**
 * ps_mission_status - Get mission status
 */
export const PS_MISSION_STATUS_TOOL = {
  name: 'ps_mission_status',
  description: `Get the current status of a mission.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      mission_id: {
        type: 'string',
        description: 'Mission ID',
      },
    },
    required: ['mission_id'],
  },
};

/**
 * ps_mission_control - Control mission lifecycle
 */
export const PS_MISSION_CONTROL_TOOL = {
  name: 'ps_mission_control',
  description: `Control mission lifecycle: start, pause, resume, complete, abort.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      mission_id: {
        type: 'string',
        description: 'Mission ID',
      },
      action: {
        type: 'string',
        enum: ['start', 'pause', 'resume', 'complete', 'abort'],
        description: 'Action to perform',
      },
      success: {
        type: 'boolean',
        description: 'For complete action: whether mission succeeded',
      },
      reason: {
        type: 'string',
        description: 'For abort action: reason for aborting',
      },
    },
    required: ['mission_id', 'action'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// ALL TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const multiAgentToolDefinitions = [
  PS_INTENT_CREATE_TOOL,
  PS_INTENT_GET_TOOL,
  PS_INTENT_CONSULT_TOOL,
  PS_AGENT_REGISTER_TOOL,
  PS_AGENT_BIND_TOOL,
  PS_MISSION_CREATE_TOOL,
  PS_MISSION_STATUS_TOOL,
  PS_MISSION_CONTROL_TOOL,
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle ps_intent_create
 */
export async function handleIntentCreate(args: Record<string, unknown>): Promise<CreateIntentResponse> {
  const request: CreateIntentRequest = {
    mission_id: args.mission_id as string,
    objective: args.objective as string,
    end_state: args.end_state as CreateIntentRequest['end_state'],
    constraints: args.constraints as CreateIntentRequest['constraints'],
    red_lines: args.red_lines as string[],
    autonomy_level: (args.autonomy_level as AutonomyLevel) || 'guided',
    created_by: args.created_by as string,
    success_criteria: args.success_criteria as CreateIntentRequest['success_criteria'],
    failure_modes: args.failure_modes as CreateIntentRequest['failure_modes'],
    priority_order: args.priority_order as string[],
    acceptable_tradeoffs: args.acceptable_tradeoffs as string[],
    context: args.context as CreateIntentRequest['context'],
    expires_at: args.expires_at as string,
    namespace: args.namespace as string,
    tags: args.tags as string[],
  };

  return intentManager.createIntent(request);
}

/**
 * Handle ps_intent_get
 */
export function handleIntentGet(args: Record<string, unknown>): Record<string, unknown> {
  const intentId = args.intent_id as string;
  const intent = intentManager.getIntent(intentId);

  if (!intent) {
    return { success: false, error: `Intent not found: ${intentId}` };
  }

  return { success: true, intent };
}

/**
 * Handle ps_intent_consult
 */
export async function handleIntentConsult(
  args: Record<string, unknown>
): Promise<IntentConsultationResult> {
  const request: IntentConsultationRequest = {
    agent_id: args.agent_id as string,
    intent_id: args.intent_id as string,
    situation: args.situation as string,
    options: args.options as IntentConsultationRequest['options'],
    urgency: args.urgency as IntentConsultationRequest['urgency'],
    context: args.context as Record<string, unknown>,
  };

  return intentManager.consultIntent(request);
}

/**
 * Handle ps_agent_register
 */
export function handleAgentRegister(args: Record<string, unknown>): Record<string, unknown> {
  try {
    const registration = agentRegistry.register(
      args.agent_id as string,
      args.name as string,
      args.role as AgentRole,
      args.capabilities as string[]
    );

    return { success: true, agent: registration };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle ps_agent_bind
 */
export async function handleAgentBind(args: Record<string, unknown>): Promise<BindAgentResponse> {
  const request: BindAgentRequest = {
    intent_id: args.intent_id as string,
    agent_id: args.agent_id as string,
    bound_by: args.bound_by as string,
    scope_restrictions: args.scope_restrictions as BindAgentRequest['scope_restrictions'],
  };

  const result = await intentManager.bindAgent(request);

  // Update agent registry if successful
  if (result.success) {
    const binding = intentManager.getAgentBinding(request.agent_id);
    if (binding) {
      agentRegistry.setBinding(request.agent_id, binding);
    }
  }

  return result;
}

/**
 * Handle ps_mission_create
 */
export async function handleMissionCreate(
  args: Record<string, unknown>
): Promise<CreateMissionResponse> {
  const request: CreateMissionRequest = {
    name: args.name as string,
    description: args.description as string,
    intent_id: args.intent_id as string,
    agent_assignments: args.agent_assignments as CreateMissionRequest['agent_assignments'],
    estimated_duration: args.estimated_duration as string,
    created_by: args.created_by as string,
    namespace: args.namespace as string,
  };

  return missionManager.createMission(request);
}

/**
 * Handle ps_mission_status
 */
export function handleMissionStatus(args: Record<string, unknown>): Record<string, unknown> {
  const missionId = args.mission_id as string;
  const status = missionManager.getMissionStatus(missionId);

  if (!status) {
    return { success: false, error: `Mission not found: ${missionId}` };
  }

  const mission = missionManager.getMission(missionId);

  return {
    success: true,
    mission_id: missionId,
    ...status,
    mission,
  };
}

/**
 * Handle ps_mission_control
 */
export function handleMissionControl(args: Record<string, unknown>): Record<string, unknown> {
  const missionId = args.mission_id as string;
  const action = args.action as string;

  let result = false;

  switch (action) {
    case 'start':
      result = missionManager.startMission(missionId);
      break;
    case 'pause':
      result = missionManager.pauseMission(missionId);
      break;
    case 'resume':
      result = missionManager.resumeMission(missionId);
      break;
    case 'complete':
      result = missionManager.completeMission(missionId, args.success as boolean ?? true);
      break;
    case 'abort':
      result = missionManager.abortMission(missionId, args.reason as string);
      break;
    default:
      return { success: false, error: `Unknown action: ${action}` };
  }

  return {
    success: result,
    action,
    mission_id: missionId,
    error: result ? undefined : `Failed to ${action} mission`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main handler for all multi-agent tools.
 */
export async function handleMultiAgentTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'ps_intent_create':
      return { ...(await handleIntentCreate(args)) };

    case 'ps_intent_get':
      return handleIntentGet(args);

    case 'ps_intent_consult':
      return { ...(await handleIntentConsult(args)) };

    case 'ps_agent_register':
      return handleAgentRegister(args);

    case 'ps_agent_bind':
      return { ...(await handleAgentBind(args)) };

    case 'ps_mission_create':
      return { ...(await handleMissionCreate(args)) };

    case 'ps_mission_status':
      return handleMissionStatus(args);

    case 'ps_mission_control':
      return handleMissionControl(args);

    default:
      return { success: false, error: `Unknown multi-agent tool: ${toolName}` };
  }
}
