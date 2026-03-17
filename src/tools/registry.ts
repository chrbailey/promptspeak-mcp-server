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
 * External tool definitions (hold, symbol) are imported from their modules.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Import external tool definitions
import { holdToolDefinitions } from './ps_hold.js';
import { securityToolDefinitions } from './ps_security.js';
import { symbolToolDefinitions } from '../symbols/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// GRAMMAR TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const GRAMMAR_TOOLS: Tool[] = [
  {
    name: 'ps_parse',
    description: 'Parse a PromptSpeak EBNF expression into an AST. Returns AST tree and metadata (verb count, pipes, branches).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'PromptSpeak expression (e.g., "::analyze{document}[security]|format:json")' },
      },
      required: ['expression'],
    },
    annotations: {
      title: 'Parse PromptSpeak Expression',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_expand',
    description: 'Expand a PromptSpeak expression to natural English. Used by safety filters for human-readable action descriptions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: 'PromptSpeak expression to expand' },
      },
      required: ['expression'],
    },
    annotations: {
      title: 'Expand Expression to English',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const REGISTRY_TOOLS: Tool[] = [
  {
    name: 'ps_registry_lookup',
    description: 'Resolve a verb symbol to its full definition, including aliases.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Verb symbol (e.g., "::analyze")' },
      },
      required: ['symbol'],
    },
    annotations: {
      title: 'Lookup Verb Definition',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_registry_propose',
    description: 'Submit a new verb for review. Created with status: proposed.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Verb symbol (e.g., "::myverb")' },
        namespace: { type: 'string', description: 'Namespace (e.g., "ps:custom")' },
        category: { type: 'string', enum: ['verb', 'modifier', 'pattern', 'primitive'], description: 'Verb category' },
        definition: { type: 'string', description: 'Semantic definition of the verb' },
        safety_class: { type: 'string', enum: ['unrestricted', 'monitored', 'restricted', 'blocked'], description: 'Safety classification' },
      },
      required: ['symbol', 'namespace', 'definition'],
    },
    annotations: {
      title: 'Propose New Verb',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_registry_status',
    description: 'Check the lifecycle state and safety classification of a verb.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Verb symbol to check' },
      },
      required: ['symbol'],
    },
    annotations: {
      title: 'Check Verb Status',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_registry_namespace',
    description: 'List all verbs registered in a namespace.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: 'Namespace to list (e.g., "ps:core", "ps:gov")' },
      },
      required: ['namespace'],
    },
    annotations: {
      title: 'List Namespace Verbs',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_registry_audit',
    description: 'Get full change history for a verb (registrations, transitions, updates).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Verb symbol to audit' },
      },
      required: ['symbol'],
    },
    annotations: {
      title: 'Audit Verb History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_registry_version',
    description: 'Get current spec version, verb count, and registry statistics.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: {
      title: 'Get Registry Version',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

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
    },
    annotations: {
      title: 'Validate Frame',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Validate Frames (Batch)',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Execute Governed Action',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Dry Run Execution Check',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_execute_batch',
    description: 'Execute multiple actions under a single frame. Supports sequential or parallel execution with optional stop-on-failure.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Unique identifier for the executing agent' },
        frame: { type: 'string', description: 'The governing PromptSpeak frame for all actions' },
        actions: {
          type: 'array',
          items: {
            type: 'object' as const,
            properties: {
              tool: { type: 'string', description: 'The tool/action to execute' },
              arguments: { type: 'object' as const, description: 'Arguments for the tool' },
              description: { type: 'string' }
            },
            required: ['tool', 'arguments']
          },
          description: 'Array of actions to execute under the frame'
        },
        parentFrame: { type: 'string', description: 'Parent frame if part of delegation chain' },
        stopOnFirstFailure: { type: 'boolean', description: 'Stop executing remaining actions on first failure (sequential only)' },
        parallel: { type: 'boolean', description: 'Execute all actions in parallel instead of sequentially' }
      },
      required: ['agentId', 'frame', 'actions']
    },
    annotations: {
      title: 'Execute Governed Actions (Batch)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Delegate Task to Agent',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Revoke Delegation',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'List Delegations',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Get Agent State',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_state_system',
    description: 'Get overall system state including all agents, operations, and drift alerts.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    annotations: {
      title: 'Get System State',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Reset Agent State',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_state_recalibrate',
    description: 'Recalibrate agent drift baseline. Optionally provide a new baseline configuration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent to recalibrate' },
        newBaseline: {
          type: 'object' as const,
          properties: {
            frame: { type: 'string', description: 'Baseline frame' },
            expectedBehavior: {
              type: 'array',
              items: { type: 'string' },
              description: 'Expected behavior patterns'
            }
          },
          required: ['frame', 'expectedBehavior'],
          description: 'Optional new baseline configuration. If omitted, recalibrates from current state.'
        }
      },
      required: ['agentId']
    },
    annotations: {
      title: 'Recalibrate Agent Baseline',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Halt Agent',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Resume Halted Agent',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Get Drift History',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Register Policy Overlay',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Activate Policy Overlay',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_config_get',
    description: 'Get current configuration including active overlay and thresholds.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    annotations: {
      title: 'Get Configuration',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_config_export',
    description: 'Export current configuration for backup.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    annotations: {
      title: 'Export Configuration',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Import Configuration',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Set Confidence Threshold',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_confidence_get',
    description: 'Get all confidence thresholds.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    annotations: {
      title: 'Get Confidence Thresholds',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Set Confidence Thresholds (Bulk)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Set Feature Flag',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_feature_get',
    description: 'Get all feature flags.',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    annotations: {
      title: 'Get Feature Flags',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
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
    },
    annotations: {
      title: 'Get Audit Log',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// HANDSHAKE TOOLS
// ─────────────────────────────────────────────────────────────────────────────

export const HANDSHAKE_TOOLS: Tool[] = [
  {
    name: 'ps_handshake_initiate',
    description: 'Start a PromptSpeak verification handshake. Returns probe expression to send to remote agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: {
      title: 'Initiate Handshake',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_handshake_respond',
    description: 'Handle an incoming PromptSpeak handshake probe. Parses, validates, and echoes confirmation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        input: { type: 'string', description: 'The handshake probe expression to respond to' },
      },
      required: ['input'],
    },
    annotations: {
      title: 'Respond to Handshake',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'ps_capability_get',
    description: 'Report this server\'s PromptSpeak capabilities (version, verb count, namespaces).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
    annotations: {
      title: 'Get Server Capabilities',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL TOOL DEFINITIONS (re-exported for convenience)
// ─────────────────────────────────────────────────────────────────────────────

export {
  holdToolDefinitions,
  securityToolDefinitions,
  symbolToolDefinitions,
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
    // Grammar tools
    ...GRAMMAR_TOOLS,
    // Registry tools
    ...REGISTRY_TOOLS,
    // Handshake tools
    ...HANDSHAKE_TOOLS,

    // External tool definitions
    ...holdToolDefinitions,        // Hold Management (Human-in-the-Loop)
    ...securityToolDefinitions,    // Security Enforcement
    ...symbolToolDefinitions,      // Directive Symbol Registry
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
    grammar: GRAMMAR_TOOLS.length,
    registry: REGISTRY_TOOLS.length,
    handshake: HANDSHAKE_TOOLS.length,
    hold: holdToolDefinitions.length,
    security: securityToolDefinitions.length,
    symbol: symbolToolDefinitions.length,
    total: buildToolRegistry().length
  };
}
