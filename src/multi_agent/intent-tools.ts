/**
 * ===============================================================================
 * COMMANDER'S INTENT MCP TOOLS
 * ===============================================================================
 *
 * MCP tool definitions and handlers for Commander's Intent multi-agent operations.
 * These tools follow the newer pattern using mcpSuccess/mcpFailure from core/result.
 *
 * Tools:
 * - ps_mission_create - Create mission with Commander's Intent
 * - ps_mission_status - Get mission status and agent info
 * - ps_mission_complete - Mark mission complete
 * - ps_agent_register - Register agent for mission
 * - ps_agent_heartbeat - Agent heartbeat/status update
 * - ps_intent_consult - Consult intent for decision guidance
 *
 * ===============================================================================
 */

import { z } from 'zod';
import { mcpSuccess, mcpFailure } from '../core/result/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { intentManager } from './intent-manager.js';
import { agentRegistry } from './agent-registry.js';
import { missionManager } from './mission.js';
import type {
  CreateIntentRequest,
  CreateMissionRequest,
  IntentConsultationRequest,
  AgentRole,
  AutonomyLevel,
  AgentStatus,
} from './intent-types.js';

// ===============================================================================
// ZOD VALIDATION SCHEMAS
// ===============================================================================

/**
 * Helper to format Zod validation errors into a readable string.
 */
function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');
}

// -------------------------------------------------------------------------------
// Shared Sub-Schemas
// -------------------------------------------------------------------------------

const ConstraintSchema = z.object({
  id: z.string().min(1, 'Constraint id is required'),
  description: z.string().min(1, 'Constraint description is required'),
  severity: z.enum(['advisory', 'required', 'critical']),
  condition: z.string().optional(),
  on_violation: z.enum(['warn', 'block', 'escalate', 'terminate']),
});

const EndStateSchema = z.object({
  success: z.array(z.string()).min(1, 'At least one success condition is required'),
  failure: z.array(z.string()).min(1, 'At least one failure condition is required'),
  partial_success: z.array(z.string()).optional(),
  timeout: z.string().optional(),
});

const ContextSchema = z.object({
  background: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  domain_hints: z.array(z.string()).optional(),
});

const AgentRoleSchema = z.enum(['coordinator', 'specialist', 'support', 'terminal']);

const AutonomyLevelSchema = z.enum(['strict', 'guided', 'autonomous', 'exploratory']);

// -------------------------------------------------------------------------------
// ps_mission_create Schema
// -------------------------------------------------------------------------------

const MissionCreateSchema = z.object({
  name: z.string().min(1, 'Mission name is required').max(200),
  description: z.string().min(1, 'Mission description is required').max(5000),
  objective: z.string().min(10, 'Objective must be at least 10 characters').max(5000),
  end_state: EndStateSchema,
  red_lines: z.array(z.string()).min(1, 'At least one red line is required'),
  autonomy_level: AutonomyLevelSchema.optional().default('guided'),
  constraints: z.array(ConstraintSchema).optional(),
  context: ContextSchema.optional(),
  agent_assignments: z.array(z.object({
    agent_id: z.string().min(1),
    role: AgentRoleSchema,
  })).optional(),
  estimated_duration: z.string().optional(),
  created_by: z.string().min(1, 'Creator identifier is required'),
  namespace: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// -------------------------------------------------------------------------------
// ps_mission_status Schema
// -------------------------------------------------------------------------------

const MissionStatusSchema = z.object({
  mission_id: z.string().min(1, 'Mission ID is required'),
  include_agents: z.boolean().optional().default(true),
  include_intent: z.boolean().optional().default(false),
});

// -------------------------------------------------------------------------------
// ps_mission_complete Schema
// -------------------------------------------------------------------------------

const MissionCompleteSchema = z.object({
  mission_id: z.string().min(1, 'Mission ID is required'),
  success: z.boolean(),
  summary: z.string().optional(),
  metrics: z.record(z.unknown()).optional(),
});

// -------------------------------------------------------------------------------
// ps_agent_register Schema
// -------------------------------------------------------------------------------

const AgentRegisterSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required').max(100),
  name: z.string().min(1, 'Agent name is required').max(200),
  role: AgentRoleSchema,
  capabilities: z.array(z.string()).min(1, 'At least one capability is required'),
});

// -------------------------------------------------------------------------------
// ps_agent_heartbeat Schema
// -------------------------------------------------------------------------------

const AgentHeartbeatSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  status: z.enum(['idle', 'briefed', 'executing', 'blocked', 'completed', 'failed', 'recalled']).optional(),
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
});

// -------------------------------------------------------------------------------
// ps_intent_consult Schema
// -------------------------------------------------------------------------------

const ConsultOptionSchema = z.object({
  id: z.string().min(1, 'Option id is required'),
  description: z.string().min(1, 'Option description is required'),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});

const IntentConsultSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  intent_id: z.string().min(1, 'Intent ID is required'),
  situation: z.string().min(1, 'Situation description is required'),
  options: z.array(ConsultOptionSchema).min(1, 'At least one option is required'),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  context: z.record(z.unknown()).optional(),
});

// ===============================================================================
// TOOL DEFINITIONS
// ===============================================================================

export const INTENT_TOOLS = [
  {
    name: 'ps_mission_create',
    description: `Create a mission with Commander's Intent for multi-agent coordination.

A mission defines:
- OBJECTIVE: What we're trying to accomplish (the north star)
- END STATE: How we know we're done (success/failure conditions)
- RED LINES: Absolute prohibitions that must never be crossed
- CONSTRAINTS: What agents must/must not do
- AUTONOMY LEVEL: How much latitude agents have (strict|guided|autonomous|exploratory)

The Intent is automatically created and bound to the mission. Agents can then consult
the Intent for autonomous decision-making using ps_intent_consult.`,
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Mission name (e.g., "Market Research Q1 2025")',
        },
        description: {
          type: 'string',
          description: 'Mission description explaining the overall goal',
        },
        objective: {
          type: 'string',
          description: 'What we are trying to accomplish - the north star objective',
        },
        end_state: {
          type: 'object',
          properties: {
            success: {
              type: 'array',
              items: { type: 'string' },
              description: 'Conditions that indicate mission success',
            },
            failure: {
              type: 'array',
              items: { type: 'string' },
              description: 'Conditions that indicate mission failure',
            },
            timeout: {
              type: 'string',
              description: 'Maximum duration before timeout (ISO 8601, e.g., "PT2H")',
            },
          },
          required: ['success', 'failure'],
        },
        red_lines: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute prohibitions - agents must NEVER cross these',
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
        agent_assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              role: { type: 'string', enum: ['coordinator', 'specialist', 'support', 'terminal'] },
            },
          },
          description: 'Initial agent assignments (agents must be registered first)',
        },
        estimated_duration: {
          type: 'string',
          description: 'Estimated duration (ISO 8601, e.g., "PT4H")',
        },
        created_by: {
          type: 'string',
          description: 'Creator identifier',
        },
        namespace: {
          type: 'string',
          description: 'Optional namespace for multi-tenant isolation',
        },
      },
      required: ['name', 'description', 'objective', 'end_state', 'red_lines', 'created_by'],
    },
  },
  {
    name: 'ps_mission_status',
    description: `Get the current status of a mission including progress, assigned agents, and Intent details.

Returns:
- Mission status (planning|briefing|active|paused|completed|failed|aborted)
- Progress information (phase, percent complete, blockers)
- Assigned agents and their status
- Duration and timing information`,
    inputSchema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'Mission ID',
        },
        include_agents: {
          type: 'boolean',
          description: 'Include detailed agent information (default: true)',
        },
        include_intent: {
          type: 'boolean',
          description: 'Include full Intent details (default: false)',
        },
      },
      required: ['mission_id'],
    },
  },
  {
    name: 'ps_mission_complete',
    description: `Mark a mission as complete (success or failure).

Completing a mission:
- Unbinds all agents from the Intent
- Records completion metrics
- Updates agent performance statistics
- Marks mission status as completed or failed`,
    inputSchema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'Mission ID',
        },
        success: {
          type: 'boolean',
          description: 'Whether the mission succeeded',
        },
        summary: {
          type: 'string',
          description: 'Optional completion summary',
        },
        metrics: {
          type: 'object',
          description: 'Optional completion metrics',
        },
      },
      required: ['mission_id', 'success'],
    },
  },
  {
    name: 'ps_agent_register',
    description: `Register an agent in the multi-agent system.

Roles:
- coordinator: High-level orchestration (alpha agent)
- specialist: Domain-specific execution (beta agent)
- support: Auxiliary functions (gamma agent)
- terminal: Final output generation (omega agent)

Agents must be registered before they can be assigned to missions.`,
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Unique agent identifier',
        },
        name: {
          type: 'string',
          description: 'Human-readable agent name',
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
  },
  {
    name: 'ps_agent_heartbeat',
    description: `Send a heartbeat from an agent to update status and keep alive.

Use this to:
- Keep the agent registration alive (prevents TTL expiration)
- Update agent status (executing, blocked, etc.)
- Report progress on current task
- Send status messages`,
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID',
        },
        status: {
          type: 'string',
          enum: ['idle', 'briefed', 'executing', 'blocked', 'completed', 'failed', 'recalled'],
          description: 'New agent status (optional)',
        },
        progress: {
          type: 'number',
          description: 'Progress percentage 0-100 (optional)',
        },
        message: {
          type: 'string',
          description: 'Status message (optional)',
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'ps_intent_consult',
    description: `Consult Commander's Intent for decision guidance.

Use this when an agent is uncertain about what action to take. The Intent will:
1. Check if any option violates red lines (absolute prohibitions)
2. Evaluate constraints for each option
3. Assess if the action advances the mission objective
4. Consider the autonomy level

Returns a recommendation:
- proceed: Action is aligned with Intent, go ahead
- proceed_with_caution: Some concerns but acceptable
- escalate: Requires human or coordinator decision
- abort: Action would violate red lines or critical constraints`,
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent making the consultation request',
        },
        intent_id: {
          type: 'string',
          description: 'Intent ID to consult (e.g., "XI.I.MISSION_001")',
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
  },
] as const;

// ===============================================================================
// TOOL HANDLERS
// ===============================================================================

/**
 * Handle ps_mission_create - Create mission with Commander's Intent
 */
export async function handleMissionCreate(args: {
  name: string;
  description: string;
  objective: string;
  end_state: { success: string[]; failure: string[]; timeout?: string };
  red_lines: string[];
  autonomy_level?: AutonomyLevel;
  constraints?: Array<{
    id: string;
    description: string;
    severity: 'advisory' | 'required' | 'critical';
    on_violation: 'warn' | 'block' | 'escalate' | 'terminate';
  }>;
  context?: { background?: string; assumptions?: string[]; domain_hints?: string[] };
  agent_assignments?: Array<{ agent_id: string; role: AgentRole }>;
  estimated_duration?: string;
  created_by: string;
  namespace?: string;
  tags?: string[];
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = MissionCreateSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const validated = parseResult.data;

  // Generate mission ID
  const missionId = `MISSION_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // First, create the Intent
  const intentRequest: CreateIntentRequest = {
    mission_id: missionId,
    objective: validated.objective,
    end_state: validated.end_state,
    constraints: validated.constraints,
    red_lines: validated.red_lines,
    autonomy_level: (validated.autonomy_level || 'guided') as AutonomyLevel,
    context: validated.context,
    created_by: validated.created_by,
    namespace: validated.namespace,
    tags: validated.tags,
  };

  const intentResult = await intentManager.createIntent(intentRequest);
  if (!intentResult.success) {
    return mcpFailure('INTENT_CREATE_FAILED', intentResult.error || 'Failed to create Intent');
  }

  // Now create the mission
  const missionRequest: CreateMissionRequest = {
    name: validated.name,
    description: validated.description,
    intent_id: intentResult.intent_id!,
    agent_assignments: validated.agent_assignments as CreateMissionRequest['agent_assignments'],
    estimated_duration: validated.estimated_duration,
    created_by: validated.created_by,
    namespace: validated.namespace,
  };

  const missionResult = await missionManager.createMission(missionRequest);
  if (!missionResult.success) {
    return mcpFailure('MISSION_CREATE_FAILED', missionResult.error || 'Failed to create mission');
  }

  return mcpSuccess({
    mission_id: missionResult.mission_id,
    intent_id: intentResult.intent_id,
    intent_hash: intentResult.intent_hash,
    status: 'planning',
    agents_assigned: missionResult.bindings_created || 0,
    message: `Mission "${validated.name}" created with Commander's Intent`,
  });
}

/**
 * Handle ps_mission_status - Get mission status and agent info
 */
export async function handleMissionStatus(args: {
  mission_id: string;
  include_agents?: boolean;
  include_intent?: boolean;
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = MissionStatusSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const { mission_id, include_agents, include_intent } = parseResult.data;

  // Get mission
  const mission = missionManager.getMission(mission_id);
  if (!mission) {
    return mcpFailure('MISSION_NOT_FOUND', `Mission not found: ${mission_id}`);
  }

  // Get status
  const status = missionManager.getMissionStatus(mission_id);

  // Build response
  const response: Record<string, unknown> = {
    mission_id: mission.mission_id,
    name: mission.name,
    description: mission.description,
    status: mission.status,
    progress: status?.progress,
    duration_ms: status?.duration_ms,
    timeline: mission.timeline,
    agent_count: mission.agents.length,
  };

  // Include agent details if requested
  if (include_agents !== false) {
    response.agents = mission.agents.map(a => {
      const agent = agentRegistry.getAgent(a.agent_id);
      return {
        agent_id: a.agent_id,
        role: a.role,
        binding_id: a.binding_id,
        status: agent?.status,
        last_heartbeat: agent?.last_heartbeat,
      };
    });
  }

  // Include intent if requested
  if (include_intent) {
    const intent = intentManager.getIntent(mission.intent_id);
    response.intent = intent;
  } else {
    response.intent_id = mission.intent_id;
  }

  return mcpSuccess(response);
}

/**
 * Handle ps_mission_complete - Mark mission complete
 */
export async function handleMissionComplete(args: {
  mission_id: string;
  success: boolean;
  summary?: string;
  metrics?: Record<string, unknown>;
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = MissionCompleteSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const { mission_id, success, summary, metrics } = parseResult.data;

  // Get mission first to verify it exists
  const mission = missionManager.getMission(mission_id);
  if (!mission) {
    return mcpFailure('MISSION_NOT_FOUND', `Mission not found: ${mission_id}`);
  }

  // Check if mission can be completed
  if (mission.status === 'completed' || mission.status === 'failed' || mission.status === 'aborted') {
    return mcpFailure('MISSION_ALREADY_COMPLETE', `Mission already in terminal state: ${mission.status}`);
  }

  // Complete the mission
  const result = missionManager.completeMission(mission_id, success);
  if (!result) {
    return mcpFailure('MISSION_COMPLETE_FAILED', 'Failed to complete mission');
  }

  return mcpSuccess({
    mission_id,
    status: success ? 'completed' : 'failed',
    summary,
    metrics,
    completed_at: new Date().toISOString(),
    message: success ? 'Mission completed successfully' : 'Mission marked as failed',
  });
}

/**
 * Handle ps_agent_register - Register agent for mission
 */
export async function handleAgentRegister(args: {
  agent_id: string;
  name: string;
  role: AgentRole;
  capabilities: string[];
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = AgentRegisterSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const { agent_id, name, role, capabilities } = parseResult.data;

  try {
    const registration = agentRegistry.register(
      agent_id,
      name,
      role as AgentRole,
      capabilities
    );

    return mcpSuccess({
      agent_id: registration.agent_id,
      name: registration.name,
      role: registration.role,
      status: registration.status,
      capabilities: registration.capabilities,
      registered_at: registration.registered_at,
      message: `Agent "${name}" registered successfully`,
    });
  } catch (error) {
    return mcpFailure(
      'AGENT_REGISTER_FAILED',
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Handle ps_agent_heartbeat - Agent heartbeat/status update
 */
export async function handleAgentHeartbeat(args: {
  agent_id: string;
  status?: AgentStatus;
  progress?: number;
  message?: string;
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = AgentHeartbeatSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const { agent_id, status, progress, message } = parseResult.data;

  // Get agent
  const agent = agentRegistry.getAgent(agent_id);
  if (!agent) {
    return mcpFailure('AGENT_NOT_FOUND', `Agent not found: ${agent_id}`);
  }

  // Update status if provided
  if (status) {
    agentRegistry.updateStatus(agent_id, status as AgentStatus);
  }

  // Send heartbeat (extends TTL)
  const heartbeatResult = agentRegistry.heartbeat(agent_id);
  if (!heartbeatResult) {
    return mcpFailure('HEARTBEAT_FAILED', 'Failed to record heartbeat');
  }

  // Get updated agent info
  const updatedAgent = agentRegistry.getAgent(agent_id);

  return mcpSuccess({
    agent_id,
    status: updatedAgent?.status,
    progress,
    message,
    last_heartbeat: updatedAgent?.last_heartbeat,
    current_binding: updatedAgent?.current_binding ? {
      intent_id: updatedAgent.current_binding.intent_id,
      binding_id: updatedAgent.current_binding.binding_id,
    } : null,
  });
}

/**
 * Handle ps_intent_consult - Consult intent for decision guidance
 */
export async function handleIntentConsult(args: {
  agent_id: string;
  intent_id: string;
  situation: string;
  options: Array<{
    id: string;
    description: string;
    pros?: string[];
    cons?: string[];
  }>;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
}): Promise<CallToolResult> {
  // Validate input
  const parseResult = IntentConsultSchema.safeParse(args);
  if (!parseResult.success) {
    return mcpFailure(
      'VALIDATION_FAILED',
      `Validation failed: ${formatZodError(parseResult.error)}`
    );
  }

  const validated = parseResult.data;

  // Verify agent exists
  const agent = agentRegistry.getAgent(validated.agent_id);
  if (!agent) {
    return mcpFailure('AGENT_NOT_FOUND', `Agent not found: ${validated.agent_id}`);
  }

  // Verify intent exists
  const intent = intentManager.getIntent(validated.intent_id);
  if (!intent) {
    return mcpFailure('INTENT_NOT_FOUND', `Intent not found: ${validated.intent_id}`);
  }

  // Consult the intent
  const consultRequest: IntentConsultationRequest = {
    agent_id: validated.agent_id,
    intent_id: validated.intent_id,
    situation: validated.situation,
    options: validated.options,
    urgency: validated.urgency,
    context: validated.context,
  };

  const result = await intentManager.consultIntent(consultRequest);

  return mcpSuccess({
    recommendation: result.recommendation,
    confidence: result.confidence,
    reasoning: result.reasoning,
    red_line_violation: result.red_line_violation,
    violated_red_line: result.violated_red_line,
    advances_objective: result.advances_objective,
    constraints_evaluated: result.constraints_evaluated,
    alternatives: result.alternatives,
    urgency: validated.urgency || 'medium',
  });
}
