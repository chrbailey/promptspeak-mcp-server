// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - HOLD MANAGEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════
// MCP tools for managing human-in-the-loop holds:
// - ps_hold_list: List pending holds awaiting approval
// - ps_hold_approve: Approve a held execution
// - ps_hold_reject: Reject a held execution
// - ps_hold_config: Configure hold behavior
// ═══════════════════════════════════════════════════════════════════════════

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { HoldRequest, HoldDecision, ExecutionControlConfig } from '../types/index.js';
import { holdManager } from '../gatekeeper/hold-manager.js';
import { gatekeeper } from '../gatekeeper/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const holdToolDefinitions: Tool[] = [
  {
    name: 'ps_hold_list',
    description: 'List all pending holds awaiting human approval. Returns holds for risky operations that were blocked pending review.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: {
          type: 'string',
          description: 'Optional: Filter holds by agent ID',
        },
        includeExpired: {
          type: 'boolean',
          description: 'Include expired holds in the list (default: false)',
        },
      },
      required: [],
    },
  },
  {
    name: 'ps_hold_approve',
    description: 'Approve a held execution request. The operation will proceed with optional modifications.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        holdId: {
          type: 'string',
          description: 'The hold ID to approve',
        },
        reason: {
          type: 'string',
          description: 'Reason for approval (for audit trail)',
        },
        modifiedFrame: {
          type: 'string',
          description: 'Optional: Modified frame to use instead of original',
        },
        modifiedArgs: {
          type: 'object' as const,
          description: 'Optional: Modified arguments to use instead of original',
        },
        executeNow: {
          type: 'boolean',
          description: 'Execute immediately after approval (default: true)',
        },
      },
      required: ['holdId'],
    },
  },
  {
    name: 'ps_hold_reject',
    description: 'Reject a held execution request. The operation will not proceed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        holdId: {
          type: 'string',
          description: 'The hold ID to reject',
        },
        reason: {
          type: 'string',
          description: 'Reason for rejection (for audit trail)',
        },
        haltAgent: {
          type: 'boolean',
          description: 'Also halt the agent that made the request (default: false)',
        },
      },
      required: ['holdId'],
    },
  },
  {
    name: 'ps_hold_config',
    description: 'Configure hold behavior and thresholds. Controls when operations are held for human review.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'Get current config or set new config',
        },
        config: {
          type: 'object' as const,
          description: 'Configuration to set (only for action=set)',
          properties: {
            holdOnDriftPrediction: { type: 'boolean' },
            holdOnLowConfidence: { type: 'boolean' },
            holdOnForbiddenWithOverride: { type: 'boolean' },
            holdTimeoutMs: { type: 'number' },
            driftPredictionThreshold: { type: 'number' },
            baselineDeviationThreshold: { type: 'number' },
            enableMcpValidation: { type: 'boolean' },
            mcpValidationTools: { type: 'array', items: { type: 'string' } },
            haltOnCriticalDrift: { type: 'boolean' },
            haltOnHighDrift: { type: 'boolean' },
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'ps_hold_stats',
    description: 'Get hold statistics and history.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        historyLimit: {
          type: 'number',
          description: 'Number of historical decisions to return (default: 10)',
        },
      },
      required: [],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export async function handleHoldList(args: {
  agentId?: string;
  includeExpired?: boolean;
}): Promise<{
  holds: HoldRequest[];
  count: number;
  expiredCount: number;
}> {
  // Process expired holds first
  const expired = holdManager.processExpiredHolds();

  let holds = args.agentId
    ? holdManager.getAgentPendingHolds(args.agentId)
    : holdManager.getPendingHolds();

  return {
    holds,
    count: holds.length,
    expiredCount: expired.length,
  };
}

export async function handleHoldApprove(args: {
  holdId: string;
  reason?: string;
  modifiedFrame?: string;
  modifiedArgs?: Record<string, unknown>;
  executeNow?: boolean;
}): Promise<{
  success: boolean;
  decision?: HoldDecision;
  executionResult?: unknown;
  error?: string;
}> {
  const hold = holdManager.getHold(args.holdId);
  if (!hold) {
    return { success: false, error: `Hold not found: ${args.holdId}` };
  }

  // Approve the hold
  const decision = holdManager.approveHold(
    args.holdId,
    'human',
    args.reason || 'Approved by operator',
    args.modifiedFrame,
    args.modifiedArgs
  );

  if (!decision) {
    return { success: false, error: 'Failed to approve hold' };
  }

  // Execute if requested
  if (args.executeNow !== false) {
    const result = gatekeeper.execute({
      agentId: hold.agentId,
      frame: args.modifiedFrame || hold.frame,
      tool: hold.tool,
      arguments: args.modifiedArgs || hold.arguments,
      bypassHold: true,
      holdDecision: decision,
    });

    return {
      success: true,
      decision,
      executionResult: result,
    };
  }

  return { success: true, decision };
}

export async function handleHoldReject(args: {
  holdId: string;
  reason?: string;
  haltAgent?: boolean;
}): Promise<{
  success: boolean;
  decision?: HoldDecision;
  agentHalted?: boolean;
  error?: string;
}> {
  const hold = holdManager.getHold(args.holdId);
  if (!hold) {
    return { success: false, error: `Hold not found: ${args.holdId}` };
  }

  // Reject the hold
  const decision = holdManager.rejectHold(
    args.holdId,
    'human',
    args.reason || 'Rejected by operator'
  );

  if (!decision) {
    return { success: false, error: 'Failed to reject hold' };
  }

  // Halt agent if requested
  let agentHalted = false;
  if (args.haltAgent) {
    gatekeeper.getDriftEngine().haltAgent(hold.agentId, `Hold rejected: ${args.reason || 'Operator decision'}`);
    agentHalted = true;
  }

  return { success: true, decision, agentHalted };
}

export async function handleHoldConfig(args: {
  action: 'get' | 'set';
  config?: Partial<ExecutionControlConfig>;
}): Promise<{
  success: boolean;
  config: ExecutionControlConfig;
  error?: string;
}> {
  if (args.action === 'set' && args.config) {
    gatekeeper.setExecutionControlConfig(args.config);
  }

  return {
    success: true,
    config: gatekeeper.getExecutionControlConfig(),
  };
}

export async function handleHoldStats(args: {
  historyLimit?: number;
}): Promise<{
  stats: ReturnType<typeof holdManager.getStats>;
  history: HoldDecision[];
}> {
  return {
    stats: holdManager.getStats(),
    history: holdManager.getHoldHistory(args.historyLimit || 10),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function handleHoldTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'ps_hold_list':
      return handleHoldList(args as Parameters<typeof handleHoldList>[0]);
    case 'ps_hold_approve':
      return handleHoldApprove(args as Parameters<typeof handleHoldApprove>[0]);
    case 'ps_hold_reject':
      return handleHoldReject(args as Parameters<typeof handleHoldReject>[0]);
    case 'ps_hold_config':
      return handleHoldConfig(args as Parameters<typeof handleHoldConfig>[0]);
    case 'ps_hold_stats':
      return handleHoldStats(args as Parameters<typeof handleHoldStats>[0]);
    default:
      throw new Error(`Unknown hold tool: ${name}`);
  }
}
