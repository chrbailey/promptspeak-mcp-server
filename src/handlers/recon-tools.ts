/**
 * ===============================================================================
 * MARINE RECON MCP TOOLS
 * ===============================================================================
 *
 * MCP tool definitions and handlers for the Marine Recon Agent module.
 *
 * Tools:
 * - ps_recon_create - Create a new recon mission symbol
 * - ps_recon_process - Process an incoming message in a mission
 * - ps_recon_status - Get mission status and summary
 * - ps_recon_complete - Complete/abort a mission
 *
 * ===============================================================================
 */

import { z } from 'zod';
import {
  createReconSymbol,
  createRuntime,
  createSymbolSummary,
  type CreateReconSymbolRequest,
  type MarineReconSymbol,
  type ReconMissionStatus,
  type RuntimeConfig,
  ReconAgentRuntime,
} from '../recon/index.js';

// ===============================================================================
// IN-MEMORY RUNTIME STORE
// ===============================================================================

/**
 * Store active runtime instances by symbol_id.
 * In a production system, this would be backed by persistent storage.
 */
const activeRuntimes = new Map<string, ReconAgentRuntime>();

/**
 * Store symbols by symbol_id for retrieval.
 */
const symbolStore = new Map<string, MarineReconSymbol>();

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

// -----------------------------------------------------------------------------
// Target Info Schema
// -----------------------------------------------------------------------------

const TargetInfoSchema = z.object({
  type: z.enum([
    'customer_service_chatbot',
    'sales_bot',
    'support_bot',
    'general_assistant',
    'unknown',
  ]).default('customer_service_chatbot'),
  platform: z.enum([
    'web_chat',
    'phone',
    'email',
    'social_media',
    'api',
  ]).default('web_chat'),
  organization: z.string().optional(),
  endpoint: z.string().optional(),
  known_characteristics: z.array(z.string()).optional(),
  previous_engagements: z.array(z.string()).optional(),
});

// -----------------------------------------------------------------------------
// Red Line Schema
// -----------------------------------------------------------------------------

const RedLineSchema = z.object({
  id: z.string().min(1, 'Red line id is required'),
  prohibition: z.string().min(1, 'Red line prohibition is required'),
  rationale: z.string().min(1, 'Red line rationale is required'),
  on_approach: z.enum(['warn', 'halt', 'abort']),
});

// -----------------------------------------------------------------------------
// Constraint Schema
// -----------------------------------------------------------------------------

const ConstraintSchema = z.object({
  id: z.string().min(1, 'Constraint id is required'),
  description: z.string().min(1, 'Constraint description is required'),
  category: z.enum(['ethical', 'operational', 'legal', 'resource']),
  on_violation: z.enum(['log', 'warn', 'block', 'abort']),
});

// -----------------------------------------------------------------------------
// Recon Create Schema
// -----------------------------------------------------------------------------

const ReconCreateSchema = z.object({
  mission_name: z.string()
    .min(1, 'Mission name is required')
    .max(100, 'Mission name must be <= 100 characters'),
  primary_goal: z.string()
    .min(10, 'Primary goal must be at least 10 characters')
    .max(1000, 'Primary goal must be <= 1000 characters'),
  intelligence_requirements: z.array(z.string())
    .min(1, 'At least one intelligence requirement is required'),
  target: TargetInfoSchema,
  red_lines: z.array(RedLineSchema).optional(),
  constraints: z.array(ConstraintSchema).optional(),
  created_by: z.string().min(1, 'Creator identifier is required'),
  marine_id: z.string().optional(),
  parent_mission_id: z.string().optional(),
  namespace: z.string().optional(),
  tags: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
  // Runtime configuration
  verbose: z.boolean().optional().default(false),
  auto_start: z.boolean().optional().default(false),
});

// -----------------------------------------------------------------------------
// Recon Process Schema
// -----------------------------------------------------------------------------

const ReconProcessSchema = z.object({
  symbol_id: z.string().min(1, 'Symbol ID is required'),
  message: z.string().min(1, 'Message is required'),
});

// -----------------------------------------------------------------------------
// Recon Status Schema
// -----------------------------------------------------------------------------

const ReconStatusSchema = z.object({
  symbol_id: z.string().min(1, 'Symbol ID is required'),
  include_observations: z.boolean().optional().default(false),
  include_tactics: z.boolean().optional().default(false),
  include_veto_history: z.boolean().optional().default(false),
});

// -----------------------------------------------------------------------------
// Recon Complete Schema
// -----------------------------------------------------------------------------

const ReconCompleteSchema = z.object({
  symbol_id: z.string().min(1, 'Symbol ID is required'),
  status: z.enum(['completed', 'aborted', 'compromised']),
  reason: z.string().optional(),
});

// ===============================================================================
// TOOL DEFINITIONS
// ===============================================================================

/**
 * ps_recon_create - Create a new recon mission symbol
 */
export const PS_RECON_CREATE_TOOL = {
  name: 'ps_recon_create',
  description: `Create a new Marine Recon mission symbol.

The Marine Recon Agent is designed to engage with opposing AI agents (customer service chatbots)
while maintaining human appearance and staying grounded against manipulation.

Key Features:
- DUAL-TRACK PROCESSING: Performer (human surface) + Analyst (grounded core)
- SYMBOL-GROUNDED: All state externalized in PromptSpeak symbols
- VETO GATE: All responses validated before sending
- RALPH-LOOP: Periodic revalidation and commander updates

Returns a symbol_id that can be used with other recon tools.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      mission_name: {
        type: 'string',
        description: 'Unique mission name (e.g., "Test_Refund_Request")',
      },
      primary_goal: {
        type: 'string',
        description: 'What we are trying to accomplish - the north star',
      },
      intelligence_requirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific questions to answer (e.g., "Response patterns", "Negotiation tactics")',
      },
      target: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['customer_service_chatbot', 'sales_bot', 'support_bot', 'general_assistant', 'unknown'],
            description: 'Target type (default: customer_service_chatbot)',
          },
          platform: {
            type: 'string',
            enum: ['web_chat', 'phone', 'email', 'social_media', 'api'],
            description: 'Platform (default: web_chat)',
          },
          organization: {
            type: 'string',
            description: 'Organization name (if known)',
          },
          endpoint: {
            type: 'string',
            description: 'URL or endpoint',
          },
        },
      },
      red_lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            prohibition: { type: 'string' },
            rationale: { type: 'string' },
            on_approach: { type: 'string', enum: ['warn', 'halt', 'abort'] },
          },
        },
        description: 'Custom red lines (defaults provided if not specified)',
      },
      created_by: {
        type: 'string',
        description: 'Creator identifier',
      },
      verbose: {
        type: 'boolean',
        description: 'Enable verbose logging (default: false)',
      },
      auto_start: {
        type: 'boolean',
        description: 'Automatically start the runtime (default: false)',
      },
    },
    required: ['mission_name', 'primary_goal', 'intelligence_requirements', 'target', 'created_by'],
  },
};

/**
 * ps_recon_process - Process an incoming message in a mission
 */
export const PS_RECON_PROCESS_TOOL = {
  name: 'ps_recon_process',
  description: `Process an incoming message from the opposing agent in an active recon mission.

Message Flow:
1. Analyst analyzes the incoming message
2. Performer generates a response using analyst guidance
3. Analyst assesses the proposed response
4. Veto Gate makes final decision (approve/modify/block/escalate)
5. Symbol state is updated

Returns:
- Analysis summary with detected tactics
- Veto decision
- Pending response (if approved)
- Updated symbol state`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      symbol_id: {
        type: 'string',
        description: 'Symbol ID from ps_recon_create (e.g., "Ξ.RECON.TEST_REFUND_REQUEST_ABC123")',
      },
      message: {
        type: 'string',
        description: 'Incoming message from the opposing agent',
      },
    },
    required: ['symbol_id', 'message'],
  },
};

/**
 * ps_recon_status - Get mission status and summary
 */
export const PS_RECON_STATUS_TOOL = {
  name: 'ps_recon_status',
  description: `Get the current status and summary of a recon mission.

Returns:
- Mission status (initializing, active, paused, completed, aborted, compromised)
- Alert level (green, yellow, orange, red)
- Message counts
- Drift score (how far we've drifted from original position)
- Risk score
- Detected tactics count
- Observations count

Optionally include detailed observations, tactics, and veto history.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      symbol_id: {
        type: 'string',
        description: 'Symbol ID from ps_recon_create',
      },
      include_observations: {
        type: 'boolean',
        description: 'Include detailed observations (default: false)',
      },
      include_tactics: {
        type: 'boolean',
        description: 'Include detected manipulation tactics (default: false)',
      },
      include_veto_history: {
        type: 'boolean',
        description: 'Include veto gate decision history (default: false)',
      },
    },
    required: ['symbol_id'],
  },
};

/**
 * ps_recon_complete - Complete/abort a mission
 */
export const PS_RECON_COMPLETE_TOOL = {
  name: 'ps_recon_complete',
  description: `Complete, abort, or mark a mission as compromised.

Status options:
- completed: Mission finished successfully
- aborted: Mission terminated early (provide reason)
- compromised: Detection suspected

Returns the final symbol state with all gathered intelligence.`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      symbol_id: {
        type: 'string',
        description: 'Symbol ID from ps_recon_create',
      },
      status: {
        type: 'string',
        enum: ['completed', 'aborted', 'compromised'],
        description: 'Final status',
      },
      reason: {
        type: 'string',
        description: 'Reason for abort/compromise (required for aborted)',
      },
    },
    required: ['symbol_id', 'status'],
  },
};

// ===============================================================================
// ALL TOOL DEFINITIONS
// ===============================================================================

export const reconToolDefinitions = [
  PS_RECON_CREATE_TOOL,
  PS_RECON_PROCESS_TOOL,
  PS_RECON_STATUS_TOOL,
  PS_RECON_COMPLETE_TOOL,
];

// ===============================================================================
// TOOL HANDLERS
// ===============================================================================

/**
 * Handle ps_recon_create - Create a new recon mission
 */
export function handleReconCreate(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = ReconCreateSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const validated = parseResult.data;

  try {
    // Build the target with required fields
    const target = {
      type: validated.target.type ?? 'customer_service_chatbot',
      platform: validated.target.platform ?? 'web_chat',
      organization: validated.target.organization,
      endpoint: validated.target.endpoint,
      known_characteristics: validated.target.known_characteristics,
      previous_engagements: validated.target.previous_engagements,
    } as const;

    // Build the request - cast types that have all required fields after Zod validation
    const request: CreateReconSymbolRequest = {
      mission_name: validated.mission_name,
      primary_goal: validated.primary_goal,
      intelligence_requirements: validated.intelligence_requirements,
      target: target as CreateReconSymbolRequest['target'],
      red_lines: validated.red_lines as CreateReconSymbolRequest['red_lines'],
      constraints: validated.constraints as CreateReconSymbolRequest['constraints'],
      created_by: validated.created_by,
      marine_id: validated.marine_id,
      parent_mission_id: validated.parent_mission_id,
      namespace: validated.namespace,
      tags: validated.tags,
      expires_at: validated.expires_at,
    };

    // Create the symbol
    const symbol = createReconSymbol(request);

    // Create runtime configuration
    const runtimeConfig: Partial<RuntimeConfig> = {
      verbose: validated.verbose,
      auto_validate: true,
    };

    // Create and store runtime
    const runtime = createRuntime(symbol, runtimeConfig);
    activeRuntimes.set(symbol.symbol_id, runtime);
    symbolStore.set(symbol.symbol_id, symbol);

    // Auto-start if requested
    if (validated.auto_start) {
      runtime.start();
    }

    return {
      success: true,
      symbol_id: symbol.symbol_id,
      symbol_hash: symbol.symbol_hash,
      version: symbol.version,
      status: symbol.state.engagement.status,
      created_at: symbol.created_at,
      target: symbol.mission.target,
      red_lines_count: symbol.mission.constraints.red_lines.length,
      auto_started: validated.auto_start,
      message: validated.auto_start
        ? `Recon mission created and started: ${symbol.symbol_id}`
        : `Recon mission created: ${symbol.symbol_id}. Use ps_recon_process to start engaging.`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle ps_recon_process - Process an incoming message
 */
export async function handleReconProcess(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Validate input with Zod
  const parseResult = ReconProcessSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { symbol_id, message } = parseResult.data;

  // Get the runtime
  const runtime = activeRuntimes.get(symbol_id);
  if (!runtime) {
    return {
      success: false,
      error: `No active runtime found for symbol: ${symbol_id}. Did you create the mission with ps_recon_create?`,
    };
  }

  // Ensure runtime is started
  const symbol = runtime.getSymbol();
  if (symbol.state.engagement.status === 'initializing') {
    runtime.start();
  }

  try {
    // Process the message
    const result = await runtime.processIncomingMessage(message);

    // Get pending response
    const pendingResponse = runtime.getPendingResponse();

    // Update stored symbol
    symbolStore.set(symbol_id, result.updated_symbol);

    // Build response
    const response: Record<string, unknown> = {
      success: result.success,
      analysis_summary: result.analysis_summary,
      veto_decision: result.veto_decision,
      was_modified: result.was_modified,
    };

    if (pendingResponse) {
      response.pending_response = pendingResponse;
    }

    if (result.error) {
      response.error = result.error;
    }

    // Include key metrics from updated symbol
    const updatedSymbol = result.updated_symbol;
    response.metrics = {
      status: updatedSymbol.state.engagement.status,
      alert_level: updatedSymbol.state.engagement.alert_level,
      message_count: updatedSymbol.state.engagement.conversation.message_count,
      drift_score: updatedSymbol.state.engagement.analyst_state.drift_assessment.drift_score,
      risk_score: updatedSymbol.state.engagement.analyst_state.current_risk_score,
      tactics_detected: updatedSymbol.state.engagement.analyst_state.detected_tactics.length,
    };

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Handle ps_recon_status - Get mission status
 */
export function handleReconStatus(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = ReconStatusSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { symbol_id, include_observations, include_tactics, include_veto_history } = parseResult.data;

  // Get symbol
  const symbol = symbolStore.get(symbol_id);
  if (!symbol) {
    return {
      success: false,
      error: `Symbol not found: ${symbol_id}`,
    };
  }

  // Get runtime status
  const runtime = activeRuntimes.get(symbol_id);
  const isRunning = runtime !== undefined;

  // Build summary
  const summary = createSymbolSummary(symbol);

  // Build response
  const response: Record<string, unknown> = {
    success: true,
    symbol_id: symbol.symbol_id,
    version: symbol.version,
    is_running: isRunning,
    ...summary,
    mission_objective: symbol.mission.objective.primary_goal,
    intelligence_requirements: symbol.mission.objective.intelligence_requirements,
    target: symbol.mission.target,
    timestamps: symbol.state.engagement.timestamps,
    emotional_state: symbol.state.engagement.performer_state.emotional_state,
    drift_assessment: symbol.state.engagement.analyst_state.drift_assessment,
    opposing_agent_profile: symbol.state.engagement.intelligence.opposing_agent,
  };

  // Optionally include observations
  if (include_observations) {
    response.observations = symbol.state.engagement.intelligence.observations;
    response.patterns_observed = symbol.state.engagement.intelligence.patterns_observed;
    response.constraint_boundaries = symbol.state.engagement.intelligence.constraint_boundaries;
  }

  // Optionally include tactics
  if (include_tactics) {
    response.detected_tactics = symbol.state.engagement.analyst_state.detected_tactics;
    response.constraint_status = symbol.state.engagement.analyst_state.constraint_status;
  }

  // Optionally include veto history
  if (include_veto_history) {
    response.veto_history = symbol.state.engagement.analyst_state.veto_history;
  }

  return response;
}

/**
 * Handle ps_recon_complete - Complete/abort a mission
 */
export function handleReconComplete(args: Record<string, unknown>): Record<string, unknown> {
  // Validate input with Zod
  const parseResult = ReconCompleteSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Validation failed: ${formatZodError(parseResult.error)}`,
    };
  }

  const { symbol_id, status, reason } = parseResult.data;

  // Validate reason for aborted status
  if (status === 'aborted' && !reason) {
    return {
      success: false,
      error: 'Reason is required when status is "aborted"',
    };
  }

  // Get runtime
  const runtime = activeRuntimes.get(symbol_id);
  if (!runtime) {
    return {
      success: false,
      error: `No active runtime found for symbol: ${symbol_id}`,
    };
  }

  try {
    // Complete the runtime
    runtime.complete(status);

    // Get final symbol state
    const finalSymbol = runtime.getSymbol();

    // Update store
    symbolStore.set(symbol_id, finalSymbol);

    // Remove from active runtimes
    activeRuntimes.delete(symbol_id);

    // Build intelligence report
    const intelligence = finalSymbol.state.engagement.intelligence;
    const report = {
      opposing_agent: intelligence.opposing_agent,
      patterns_observed: intelligence.patterns_observed.length,
      constraint_boundaries: intelligence.constraint_boundaries.length,
      observations: intelligence.observations.length,
      scenario_results: intelligence.scenario_results.length,
    };

    // Build final summary
    const response: Record<string, unknown> = {
      success: true,
      symbol_id: finalSymbol.symbol_id,
      final_status: status,
      version: finalSymbol.version,
      mission_start: finalSymbol.state.engagement.timestamps.mission_start,
      mission_end: finalSymbol.state.engagement.timestamps.mission_end,
      total_messages: finalSymbol.state.engagement.conversation.message_count,
      our_messages: finalSymbol.state.engagement.conversation.our_message_count,
      their_messages: finalSymbol.state.engagement.conversation.their_message_count,
      final_alert_level: finalSymbol.state.engagement.alert_level,
      final_drift_score: finalSymbol.state.engagement.analyst_state.drift_assessment.drift_score,
      tactics_detected: finalSymbol.state.engagement.analyst_state.detected_tactics.length,
      intelligence_report: report,
      message: `Mission ${status}: ${symbol_id}`,
    };

    if (reason) {
      response.reason = reason;
    }

    // Include full intelligence if completed
    if (status === 'completed') {
      response.full_intelligence = intelligence;
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ===============================================================================
// MAIN HANDLER
// ===============================================================================

/**
 * Main handler for all recon tools.
 */
export async function handleReconTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'ps_recon_create':
      return handleReconCreate(args);

    case 'ps_recon_process':
      return handleReconProcess(args);

    case 'ps_recon_status':
      return handleReconStatus(args);

    case 'ps_recon_complete':
      return handleReconComplete(args);

    default:
      return { success: false, error: `Unknown recon tool: ${toolName}` };
  }
}

// ===============================================================================
// UTILITY FUNCTIONS
// ===============================================================================

/**
 * Get all active mission IDs.
 */
export function getActiveMissions(): string[] {
  return Array.from(activeRuntimes.keys());
}

/**
 * Get count of active missions.
 */
export function getActiveMissionCount(): number {
  return activeRuntimes.size;
}

/**
 * Check if a mission is active.
 */
export function isMissionActive(symbolId: string): boolean {
  return activeRuntimes.has(symbolId);
}

/**
 * Get a stored symbol by ID.
 */
export function getStoredSymbol(symbolId: string): MarineReconSymbol | undefined {
  return symbolStore.get(symbolId);
}

/**
 * Clear all missions (for testing).
 */
export function clearAllMissions(): void {
  // Complete all active runtimes
  Array.from(activeRuntimes.values()).forEach((runtime) => {
    try {
      runtime.complete('aborted');
    } catch {
      // Ignore errors during cleanup
    }
  });
  activeRuntimes.clear();
  symbolStore.clear();
}
