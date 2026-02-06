/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MCP TOOL REGISTRY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central registry for all MCP tool definitions.
 * Separates tool metadata from routing logic for maintainability.
 *
 * Tool categories:
 * - VALIDATION_TOOLS: Frame validation (ps_validate, ps_validate_batch)
 * - EXECUTION_TOOLS: Governed execution (ps_execute, ps_execute_dry_run)
 * - DELEGATION_TOOLS: Task delegation (ps_delegate, ps_delegate_*)
 * - STATE_TOOLS: Agent state management (ps_state_*)
 * - CONFIG_TOOLS: Operator configuration (ps_config_*)
 * - CONFIDENCE_TOOLS: Confidence thresholds (ps_confidence_*)
 * - FEATURE_TOOLS: Feature flags (ps_feature_*)
 * - AUDIT_TOOLS: Audit logging (ps_audit_*)
 *
 * External tool definitions are imported from their respective modules.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Import external tool definitions
import { holdToolDefinitions } from './ps_hold.js';
import { legalToolDefinitions } from './ps_legal.js';
import { calendarToolDefinitions } from './ps_calendar.js';
import { symbolToolDefinitions } from '../symbols/index.js';
import { translationToolDefinitions } from '../translation/index.js';
import { multiAgentToolDefinitions } from '../multi_agent/index.js';
import { swarmToolDefinitions, intelligenceToolDefinitions } from '../swarm/index.js';
import { reconToolDefinitions } from '../handlers/recon-tools.js';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATION_TOOLS: Tool[] = [
  {
    name: 'ps_validate',
    description: 'Validate a PromptSpeak frame. Returns validation report with errors, warnings, and suggestions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        frame: { type: 'string', description: 'The PromptSpeak frame to validate (e.g., "⊕◊▶β")' },
        parentFrame: { type: 'string', description: 'Optional parent frame for chain validation' },
        validationLevel: {
          type: 'string',
          enum: ['structural', 'semantic', 'chain', 'full'],
          description: 'Level of validation to perform'
        },
        strict: { type: 'boolean', description: 'If true, warnings also cause validation failure' }
      },
      required: ['frame']
    }
  },
  {
    name: 'ps_validate_batch',
    description: 'Validate multiple frames at once. Useful for validating delegation chains.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        frames: {
          type: 'array',
          items: {
            type: 'object' as const,
            properties: {
              frame: { type: 'string' },
              parentFrame: { type: 'string' }
            },
            required: ['frame']
          }
        },
        validationLevel: { type: 'string', enum: ['structural', 'semantic', 'chain', 'full'] },
        strict: { type: 'boolean' },
        stopOnFirstError: { type: 'boolean' }
      },
      required: ['frames']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTION_TOOLS: Tool[] = [
  {
    name: 'ps_execute',
    description: 'Execute an action under PromptSpeak frame governance. The gatekeeper validates and enforces constraints.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Unique identifier for the executing agent' },
        frame: { type: 'string', description: 'The governing PromptSpeak frame' },
        action: {
          type: 'object' as const,
          properties: {
            tool: { type: 'string', description: 'The tool/action to execute' },
            arguments: { type: 'object' as const, description: 'Arguments for the tool' },
            description: { type: 'string' }
          },
          required: ['tool', 'arguments']
        },
        parentFrame: { type: 'string', description: 'Parent frame if part of delegation chain' }
      },
      required: ['agentId', 'frame', 'action']
    }
  },
  {
    name: 'ps_execute_dry_run',
    description: 'Check if an action would succeed without executing. Returns decision and coverage analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        frame: { type: 'string' },
        action: {
          type: 'object' as const,
          properties: {
            tool: { type: 'string' },
            arguments: { type: 'object' }
          },
          required: ['tool', 'arguments']
        },
        parentFrame: { type: 'string' }
      },
      required: ['agentId', 'frame', 'action']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// DELEGATION TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const DELEGATION_TOOLS: Tool[] = [
  {
    name: 'ps_delegate',
    description: 'Delegate a task from parent agent to child agent. Enforces inheritance rules and constraint propagation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        parentAgentId: { type: 'string' },
        childAgentId: { type: 'string' },
        parentFrame: { type: 'string' },
        childFrame: { type: 'string' },
        task: {
          type: 'object' as const,
          properties: {
            description: { type: 'string' },
            constraints: { type: 'array', items: { type: 'string' } },
            deadline: { type: 'number' }
          }
        },
        inheritanceMode: { type: 'string', enum: ['strict', 'relaxed', 'custom'] }
      },
      required: ['parentAgentId', 'childAgentId', 'parentFrame', 'childFrame']
    }
  },
  {
    name: 'ps_delegate_revoke',
    description: 'Revoke an active delegation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        delegationId: { type: 'string' },
        parentAgentId: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['delegationId', 'parentAgentId']
    }
  },
  {
    name: 'ps_delegate_list',
    description: 'List delegations for an agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        role: { type: 'string', enum: ['parent', 'child', 'both'] },
        status: { type: 'string', enum: ['active', 'completed', 'revoked', 'all'] }
      },
      required: ['agentId']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// STATE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_TOOLS: Tool[] = [
  {
    name: 'ps_state_get',
    description: 'Get current state of an agent including drift metrics and circuit breaker status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' }
      },
      required: ['agentId']
    }
  },
  {
    name: 'ps_state_system',
    description: 'Get overall system state including all agents, operations, and drift alerts.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'ps_state_reset',
    description: 'Reset agent state. Can reset circuit breaker, drift metrics, and/or baseline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        resetCircuitBreaker: { type: 'boolean' },
        resetDriftMetrics: { type: 'boolean' },
        resetBaseline: { type: 'boolean' },
        reason: { type: 'string' }
      },
      required: ['agentId', 'reason']
    }
  },
  {
    name: 'ps_state_halt',
    description: 'Immediately halt an agent by opening its circuit breaker.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        reason: { type: 'string' }
      },
      required: ['agentId', 'reason']
    }
  },
  {
    name: 'ps_state_resume',
    description: 'Resume a halted agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        reason: { type: 'string' },
        resetMetrics: { type: 'boolean' }
      },
      required: ['agentId', 'reason']
    }
  },
  {
    name: 'ps_state_drift_history',
    description: 'Get drift history for an agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string' },
        since: { type: 'number', description: 'Unix timestamp' },
        limit: { type: 'number' }
      },
      required: ['agentId']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG TOOLS (Operator)
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_TOOLS: Tool[] = [
  {
    name: 'ps_config_set',
    description: 'Register a new policy overlay.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        overlayId: { type: 'string' },
        overlay: { type: 'object' }
      },
      required: ['overlayId', 'overlay']
    }
  },
  {
    name: 'ps_config_activate',
    description: 'Activate a registered policy overlay.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        overlayId: { type: 'string' }
      },
      required: ['overlayId']
    }
  },
  {
    name: 'ps_config_get',
    description: 'Get current configuration including active overlay and thresholds.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'ps_config_export',
    description: 'Export current configuration for backup.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'ps_config_import',
    description: 'Import configuration from backup.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        data: { type: 'string' },
        expectedChecksum: { type: 'string' }
      },
      required: ['data']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE TOOLS (Operator)
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE_TOOLS: Tool[] = [
  {
    name: 'ps_confidence_set',
    description: 'Set a confidence threshold. This is the hidden knob for operators.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threshold: {
          type: 'string',
          enum: ['parseConfidence', 'coverageConfidence', 'chainConfidence', 'driftThreshold', 'tripwireThreshold']
        },
        value: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['threshold', 'value']
    }
  },
  {
    name: 'ps_confidence_get',
    description: 'Get all confidence thresholds.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'ps_confidence_bulk_set',
    description: 'Set multiple confidence thresholds at once.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        thresholds: { type: 'object' }
      },
      required: ['thresholds']
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_TOOLS: Tool[] = [
  {
    name: 'ps_feature_set',
    description: 'Set a feature flag.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        flag: { type: 'string' },
        enabled: { type: 'boolean' }
      },
      required: ['flag', 'enabled']
    }
  },
  {
    name: 'ps_feature_get',
    description: 'Get all feature flags.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const AUDIT_TOOLS: Tool[] = [
  {
    name: 'ps_audit_get',
    description: 'Get audit log entries.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        since: { type: 'number' },
        action: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL TOOL DEFINITIONS (re-exported for convenience)
// ─────────────────────────────────────────────────────────────────────────────

export {
  holdToolDefinitions,
  legalToolDefinitions,
  calendarToolDefinitions,
  symbolToolDefinitions,
  translationToolDefinitions,
  multiAgentToolDefinitions,
  swarmToolDefinitions,
  intelligenceToolDefinitions,
  reconToolDefinitions,
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete tool registry.
 * Groups tools by category for organization and returns a flat array.
 *
 * @returns Complete array of all MCP tool definitions
 */
export function buildToolRegistry(): Tool[] {
  return [
    // Core tool schemas
    ...VALIDATION_TOOLS,
    ...EXECUTION_TOOLS,
    ...DELEGATION_TOOLS,
    ...STATE_TOOLS,
    ...CONFIG_TOOLS,
    ...CONFIDENCE_TOOLS,
    ...FEATURE_TOOLS,
    ...AUDIT_TOOLS,

    // External tool definitions
    ...holdToolDefinitions,        // Hold Management (Human-in-the-Loop)
    ...legalToolDefinitions,       // Legal Citation Verification
    ...calendarToolDefinitions,    // Legal Calendar
    ...symbolToolDefinitions,      // Directive Symbol Registry
    ...translationToolDefinitions, // Translation Layer
    ...multiAgentToolDefinitions,  // Multi-Agent / Commander's Intent
    ...swarmToolDefinitions,       // Market Agent Swarm
    ...intelligenceToolDefinitions, // Market Intelligence (Swarm)
    ...reconToolDefinitions,        // Marine Recon Agent
  ];
}

/**
 * Get tool count by category for diagnostics.
 * Category names match those in handlers/tool-registry.ts for consistency.
 */
export function getToolStats(): Record<string, number> {
  return {
    validation: VALIDATION_TOOLS.length,
    execution: EXECUTION_TOOLS.length,
    delegation: DELEGATION_TOOLS.length,
    state: STATE_TOOLS.length,
    config: CONFIG_TOOLS.length,
    confidence: CONFIDENCE_TOOLS.length,
    feature: FEATURE_TOOLS.length,
    audit: AUDIT_TOOLS.length,
    hold: holdToolDefinitions.length,
    legal: legalToolDefinitions.length,
    calendar: calendarToolDefinitions.length,
    symbol: symbolToolDefinitions.length,
    translation: translationToolDefinitions.length,
    multiAgent: multiAgentToolDefinitions.length,
    swarm: swarmToolDefinitions.length,
    intel: intelligenceToolDefinitions.length,
    recon: reconToolDefinitions.length,
    total: buildToolRegistry().length
  };
}
