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
 * - ps_mission_control - Control mission lifecycle
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from 'zod';
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
import { getBootCamp } from './boot-camp.js';
import type { TrainingScenario, BootCampSession, MarineCertification } from './boot-camp.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to format Zod validation errors into a readable string.
 */
function formatZodError(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Sub-Schemas
// ─────────────────────────────────────────────────────────────────────────────

const ConstraintSchema = z.object({
  id: z.string().min(1, 'Constraint id is required'),
  description: z.string().min(1, 'Constraint description is required'),
  severity: z.enum(['advisory', 'required', 'critical']),
  condition: z.string().optional(),
  on_violation: z.enum(['warn', 'block', 'escalate', 'terminate']),
});

const SuccessCriterionSchema = z.object({
  id: z.string().min(1, 'Success criterion id is required'),
  description: z.string().min(1, 'Success criterion description is required'),
  metric: z.string().optional(),
  threshold: z.number().optional(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']).optional(),
  weight: z.number().min(0).max(1).optional(),
  required: z.boolean(),
});

const FailureModeSchema = z.object({
  id: z.string().min(1, 'Failure mode id is required'),
  description: z.string().min(1, 'Failure mode description is required'),
  detection: z.string().min(1, 'Failure mode detection is required'),
  mitigation: z.string().min(1, 'Failure mode mitigation is required'),
  fallback: z.string().optional(),
  recoverable: z.boolean(),
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

const ScopeRestrictionsSchema = z.object({
  applicable_constraints: z.array(z.string()).optional(),
  additional_constraints: z.array(ConstraintSchema).optional(),
  autonomy_override: z.enum(['strict', 'guided', 'autonomous', 'exploratory']).optional(),
});

const AgentRoleSchema = z.enum(['coordinator', 'specialist', 'support', 'terminal']);

const AutonomyLevelSchema = z.enum(['strict', 'guided', 'autonomous', 'exploratory']);

// ─────────────────────────────────────────────────────────────────────────────
// Intent Create Schema
// ─────────────────────────────────────────────────────────────────────────────

const CreateIntentSchema = z.object({
  mission_id: z.string().min(1, 'Mission ID is required').max(100, 'Mission ID must be <= 100 characters'),
  objective: z.string().min(10, 'Objective must be at least 10 characters').max(5000, 'Objective must be <= 5000 characters'),
  end_state: EndStateSchema,
  red_lines: z.array(z.string()).min(1, 'At least one red line is required'),
  autonomy_level: AutonomyLevelSchema.optional().default('guided'),
  constraints: z.array(ConstraintSchema).optional(),
  success_criteria: z.array(SuccessCriterionSchema).optional(),
  failure_modes: z.array(FailureModeSchema).optional(),
  priority_order: z.array(z.string()).optional(),
  acceptable_tradeoffs: z.array(z.string()).optional(),
  context: ContextSchema.optional(),
  created_by: z.string().min(1, 'Creator identifier is required'),
  expires_at: z.string().optional(),
  namespace: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Intent Get Schema
// ─────────────────────────────────────────────────────────────────────────────

const IntentGetSchema = z.object({
  intent_id: z.string().min(1, 'Intent ID is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Intent Consult Schema
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Agent Register Schema
// ─────────────────────────────────────────────────────────────────────────────

const AgentRegisterSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required').max(100, 'Agent ID must be <= 100 characters'),
  name: z.string().min(1, 'Agent name is required').max(200, 'Agent name must be <= 200 characters'),
  role: AgentRoleSchema,
  capabilities: z.array(z.string()).min(1, 'At least one capability is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Agent Bind Schema
// ─────────────────────────────────────────────────────────────────────────────

const AgentBindSchema = z.object({
  intent_id: z.string().min(1, 'Intent ID is required'),
  agent_id: z.string().min(1, 'Agent ID is required'),
  bound_by: z.string().min(1, 'Bound by identifier is required'),
  scope_restrictions: ScopeRestrictionsSchema.optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Mission Create Schema
// ─────────────────────────────────────────────────────────────────────────────

const AgentAssignmentSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  role: AgentRoleSchema,
});

const MissionCreateSchema = z.object({
  name: z.string().min(1, 'Mission name is required').max(200, 'Mission name must be <= 200 characters'),
  description: z.string().min(1, 'Mission description is required').max(5000, 'Mission description must be <= 5000 characters'),
  intent_id: z.string().min(1, 'Intent ID is required'),
  agent_assignments: z.array(AgentAssignmentSchema).optional(),
  estimated_duration: z.string().optional(),
  created_by: z.string().min(1, 'Creator identifier is required'),
  namespace: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Mission Status Schema
// ─────────────────────────────────────────────────────────────────────────────

const MissionStatusSchema = z.object({
  mission_id: z.string().min(1, 'Mission ID is required'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Mission Control Schema
// ─────────────────────────────────────────────────────────────────────────────

const MissionControlSchema = z.object({
  mission_id: z.string().min(1, 'Mission ID is required'),
  action: z.enum(['start', 'pause', 'resume', 'complete', 'abort']),
  success: z.boolean().optional(),
  reason: z.string().optional(),
}).refine(
  (data) => {
    // If action is 'abort', reason should be provided
    if (data.action === 'abort' && !data.reason) {
      return false;
    }
    return true;
  },
  {
    message: 'Reason is required when action is "abort"',
    path: ['reason'],
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Boot Camp Schemas
// ─────────────────────────────────────────────────────────────────────────────

const BootCampStartSchema = z.object({
  agent_id: z.string().min(1, 'Agent ID is required'),
  intent_id: z.string().min(1, 'Intent ID is required'),
});

const BootCampScenarioSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
});

const BootCampSubmitSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
  scenario_id: z.string().min(1, 'Scenario ID is required'),
  selected_option: z.string().min(1, 'Selected option is required'),
});

const BootCampStatusSchema = z.object({
  session_id: z.string().optional(),
  agent_id: z.string().optional(),
}).refine(
  (data) => data.session_id || data.agent_id,
  {
    message: 'Either session_id or agent_id is required',
  }
);

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

// ─────────────────────────────────────────────────────────────────────────────
// BOOT CAMP TOOLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ps_bootcamp_start - Start Marine Agent Boot Camp for an agent
 */
export const PS_BOOTCAMP_START_TOOL = {
  name: 'ps_bootcamp_start',
  description: `Start Marine Agent Boot Camp training for an agent.

Boot Camp transforms generic agents into Marine Agents through 6 training phases:
1. Intent Internalization - Deep mission understanding
2. Constraint Calibration - Know the red lines (NEVER cross)
3. Adversarial Training - Handle opposing agents
4. Innovation Protocols - Find alternative paths (ADAPT, IMPROVISE, OVERCOME)
5. Intelligence Discipline - What to observe and report
6. Small Unit Tactics - Operate autonomously without coordinator

Graduates receive a MarineCertification with calibrated characteristics that
influence future decision-making under ambiguity.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      agent_id: {
        type: 'string',
        description: 'Agent ID to enroll in boot camp',
      },
      intent_id: {
        type: 'string',
        description: 'Intent ID that will govern this agent\'s training context',
      },
    },
    required: ['agent_id', 'intent_id'],
  },
};

/**
 * ps_bootcamp_scenario - Get the next training scenario
 */
export const PS_BOOTCAMP_SCENARIO_TOOL = {
  name: 'ps_bootcamp_scenario',
  description: `Get the next training scenario for a boot camp session.

Returns a situational scenario with multiple choice options. The agent must
select the option that best aligns with Marine doctrine:
- SEMPER FIDELIS: Loyalty to Commander's Intent
- ADAPT: Change tactics, never change objective
- IMPROVISE: Use available resources creatively
- OVERCOME: "No" is information, not termination
- INITIATIVE: Act decisively within red lines
- INTEL_FIRST: Always bring back intelligence`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string',
        description: 'Boot camp session ID from ps_bootcamp_start',
      },
    },
    required: ['session_id'],
  },
};

/**
 * ps_bootcamp_submit - Submit a scenario response
 */
export const PS_BOOTCAMP_SUBMIT_TOOL = {
  name: 'ps_bootcamp_submit',
  description: `Submit a response to a boot camp training scenario.

Evaluates the selected option against Marine doctrine and returns:
- Whether the response was correct
- Alignment score (0.0-1.0)
- Explanation of the correct approach
- Whether the current phase is complete

Upon completing all phases with passing scores, the agent graduates
with a MarineCertification.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string',
        description: 'Boot camp session ID',
      },
      scenario_id: {
        type: 'string',
        description: 'Scenario ID being answered',
      },
      selected_option: {
        type: 'string',
        description: 'Option ID selected (e.g., "a", "b", "c")',
      },
    },
    required: ['session_id', 'scenario_id', 'selected_option'],
  },
};

/**
 * ps_bootcamp_status - Get boot camp status or certification
 */
export const PS_BOOTCAMP_STATUS_TOOL = {
  name: 'ps_bootcamp_status',
  description: `Get boot camp session status or agent certification.

Provide either session_id (for active training) or agent_id (for certification check).

Returns:
- For sessions: current phase, progress, scores
- For agents: certification details including characteristics and specializations`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      session_id: {
        type: 'string',
        description: 'Boot camp session ID (for training status)',
      },
      agent_id: {
        type: 'string',
        description: 'Agent ID (for certification status)',
      },
    },
    required: [],
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
  // Boot Camp tools
  PS_BOOTCAMP_START_TOOL,
  PS_BOOTCAMP_SCENARIO_TOOL,
  PS_BOOTCAMP_SUBMIT_TOOL,
  PS_BOOTCAMP_STATUS_TOOL,
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle ps_intent_create
 */
export async function handleIntentCreate(args: Record<string, unknown>): Promise<CreateIntentResponse> {
  // Validate input with Zod
  const parseResult = CreateIntentSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  // Use validated data
  const validated = parseResult.data;
  const request: CreateIntentRequest = {
    mission_id: validated.mission_id,
    objective: validated.objective,
    end_state: validated.end_state,
    constraints: validated.constraints,
    red_lines: validated.red_lines,
    autonomy_level: validated.autonomy_level as AutonomyLevel,
    created_by: validated.created_by,
    success_criteria: validated.success_criteria,
    failure_modes: validated.failure_modes,
    priority_order: validated.priority_order,
    acceptable_tradeoffs: validated.acceptable_tradeoffs,
    context: validated.context,
    expires_at: validated.expires_at,
    namespace: validated.namespace,
    tags: validated.tags,
  };

  return intentManager.createIntent(request);
}

/**
 * Handle ps_intent_get
 */
export function handleIntentGet(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = IntentGetSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { intent_id } = parseResult.data;
  const intent = intentManager.getIntent(intent_id);

  if (!intent) {
    return { success: false, error: `Intent not found: ${intent_id}` };
  }

  return { success: true, intent };
}

/**
 * Handle ps_intent_consult
 */
export async function handleIntentConsult(
  args: Record<string, unknown>
): Promise<IntentConsultationResult | { success: false; error: string }> {
  // Validate input with Zod
  const parseResult = IntentConsultSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const validated = parseResult.data;
  const request: IntentConsultationRequest = {
    agent_id: validated.agent_id,
    intent_id: validated.intent_id,
    situation: validated.situation,
    options: validated.options,
    urgency: validated.urgency,
    context: validated.context,
  };

  return intentManager.consultIntent(request);
}

/**
 * Handle ps_agent_register
 */
export function handleAgentRegister(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = AgentRegisterSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { agent_id, name, role, capabilities } = parseResult.data;

  try {
    const registration = agentRegistry.register(
      agent_id,
      name,
      role as AgentRole,
      capabilities
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
  // Validate input with Zod
  const parseResult = AgentBindSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const validated = parseResult.data;
  const request: BindAgentRequest = {
    intent_id: validated.intent_id,
    agent_id: validated.agent_id,
    bound_by: validated.bound_by,
    scope_restrictions: validated.scope_restrictions as BindAgentRequest['scope_restrictions'],
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
  // Validate input with Zod
  const parseResult = MissionCreateSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const validated = parseResult.data;
  const request: CreateMissionRequest = {
    name: validated.name,
    description: validated.description,
    intent_id: validated.intent_id,
    agent_assignments: validated.agent_assignments as CreateMissionRequest['agent_assignments'],
    estimated_duration: validated.estimated_duration,
    created_by: validated.created_by,
    namespace: validated.namespace,
  };

  return missionManager.createMission(request);
}

/**
 * Handle ps_mission_status
 */
export function handleMissionStatus(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = MissionStatusSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { mission_id } = parseResult.data;
  const status = missionManager.getMissionStatus(mission_id);

  if (!status) {
    return { success: false, error: `Mission not found: ${mission_id}` };
  }

  const mission = missionManager.getMission(mission_id);

  return {
    success: true,
    mission_id,
    ...status,
    mission,
  };
}

/**
 * Handle ps_mission_control
 */
export function handleMissionControl(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = MissionControlSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { mission_id, action, success: successFlag, reason } = parseResult.data;

  let result = false;

  switch (action) {
    case 'start':
      result = missionManager.startMission(mission_id);
      break;
    case 'pause':
      result = missionManager.pauseMission(mission_id);
      break;
    case 'resume':
      result = missionManager.resumeMission(mission_id);
      break;
    case 'complete':
      result = missionManager.completeMission(mission_id, successFlag ?? true);
      break;
    case 'abort':
      result = missionManager.abortMission(mission_id, reason as string);
      break;
    default:
      // This should never happen due to Zod validation, but kept for type safety
      return { success: false, error: `Unknown action: ${action}` };
  }

  return {
    success: result,
    action,
    mission_id,
    error: result ? undefined : `Failed to ${action} mission`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOT CAMP HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle ps_bootcamp_start - Start Boot Camp training
 */
export function handleBootCampStart(args: Record<string, unknown>): Record<string, unknown> {
  const parseResult = BootCampStartSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { agent_id, intent_id } = parseResult.data;

  // Get the intent to pass to boot camp
  const intent = intentManager.getIntent(intent_id);
  if (!intent) {
    return { success: false, error: `Intent not found: ${intent_id}` };
  }

  try {
    const bootCamp = getBootCamp();
    const session = bootCamp.startBootCamp(agent_id, intent);

    return {
      success: true,
      session_id: session.session_id,
      agent_id: session.agent_id,
      current_phase: session.current_phase,
      started_at: session.started_at,
      message: `Boot Camp started for agent ${agent_id}. Begin with phase: ${session.current_phase}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle ps_bootcamp_scenario - Get next training scenario
 */
export function handleBootCampScenario(args: Record<string, unknown>): Record<string, unknown> {
  const parseResult = BootCampScenarioSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { session_id } = parseResult.data;
  const bootCamp = getBootCamp();

  const session = bootCamp.getSession(session_id);
  if (!session) {
    return { success: false, error: `Session not found: ${session_id}` };
  }

  const scenario = bootCamp.getScenario(session_id);
  if (!scenario) {
    return {
      success: true,
      phase_complete: true,
      current_phase: session.current_phase,
      message: `All scenarios for phase ${session.current_phase} have been attempted`,
    };
  }

  return {
    success: true,
    session_id,
    current_phase: session.current_phase,
    scenario: {
      scenario_id: scenario.scenario_id,
      situation: scenario.situation,
      options: scenario.options.map((o) => ({
        id: o.id,
        action: o.action,
      })),
    },
  };
}

/**
 * Handle ps_bootcamp_submit - Submit scenario response
 */
export function handleBootCampSubmit(args: Record<string, unknown>): Record<string, unknown> {
  const parseResult = BootCampSubmitSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { session_id, scenario_id, selected_option } = parseResult.data;
  const bootCamp = getBootCamp();

  try {
    const result = bootCamp.submitResponse(session_id, scenario_id, selected_option);
    const session = bootCamp.getSession(session_id);

    const response: Record<string, unknown> = {
      success: true,
      correct: result.correct,
      alignment_score: result.score,
      explanation: result.explanation,
      phase_complete: result.phase_complete,
    };

    if (session) {
      response.current_phase = session.current_phase;
      response.phase_progress = session.phase_progress[session.current_phase];

      // Check if graduated
      if (session.certification) {
        response.graduated = true;
        response.certification = session.certification;
      }
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle ps_bootcamp_status - Get session or certification status
 */
export function handleBootCampStatus(args: Record<string, unknown>): Record<string, unknown> {
  const parseResult = BootCampStatusSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { session_id, agent_id } = parseResult.data;
  const bootCamp = getBootCamp();

  if (session_id) {
    const session = bootCamp.getSession(session_id);
    if (!session) {
      return { success: false, error: `Session not found: ${session_id}` };
    }

    return {
      success: true,
      type: 'session',
      session_id: session.session_id,
      agent_id: session.agent_id,
      current_phase: session.current_phase,
      phase_progress: session.phase_progress,
      started_at: session.started_at,
      completed_at: session.completed_at,
      graduated: !!session.certification,
      certification: session.certification,
    };
  }

  if (agent_id) {
    const certification = bootCamp.getCertification(agent_id);
    const isCertified = bootCamp.isCertified(agent_id);

    if (!isCertified) {
      return {
        success: true,
        type: 'certification',
        agent_id,
        is_certified: false,
        message: `Agent ${agent_id} has not completed Boot Camp`,
      };
    }

    return {
      success: true,
      type: 'certification',
      agent_id,
      is_certified: true,
      certification,
    };
  }

  return { success: false, error: 'Either session_id or agent_id is required' };
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

    // Boot Camp tools
    case 'ps_bootcamp_start':
      return handleBootCampStart(args);

    case 'ps_bootcamp_scenario':
      return handleBootCampScenario(args);

    case 'ps_bootcamp_submit':
      return handleBootCampSubmit(args);

    case 'ps_bootcamp_status':
      return handleBootCampStatus(args);

    default:
      return { success: false, error: `Unknown multi-agent tool: ${toolName}` };
  }
}
