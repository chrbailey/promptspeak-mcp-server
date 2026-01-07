#!/usr/bin/env node
/**
 * PromptSpeak MCP Server
 *
 * Model Context Protocol server that provides:
 * - Frame validation (ps_validate)
 * - Governed execution (ps_execute)
 * - Delegation management (ps_delegate)
 * - State and drift monitoring (ps_state)
 * - Operator control plane (ps_config_*, ps_confidence_*)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import * as path from 'path';
import { fileURLToPath } from 'url';

// Import tools
import {
  ps_validate,
  ps_validate_batch,
  ps_execute,
  ps_execute_batch,
  ps_execute_dry_run,
  ps_delegate,
  ps_delegate_revoke,
  ps_delegate_list,
  ps_state_get,
  ps_state_system,
  ps_state_reset,
  ps_state_recalibrate,
  ps_state_halt,
  ps_state_resume,
  ps_state_drift_history,
  ps_config_set,
  ps_config_activate,
  ps_config_get,
  ps_config_export,
  ps_config_import,
  ps_confidence_set,
  ps_confidence_get,
  ps_confidence_bulk_set,
  ps_feature_set,
  ps_feature_get,
  ps_audit_get,
  // Hold management tools (human-in-the-loop)
  holdToolDefinitions,
  handleHoldTool,
  // Legal citation verification tools
  legalToolDefinitions,
  handleLegalTool,
  // Legal calendar tools
  calendarToolDefinitions,
  handleCalendarTool
} from './tools/index.js';

import { initializePolicyLoader, getPolicyLoader } from './policies/loader.js';
import { operatorConfig } from './operator/config.js';

// Import symbol registry
import {
  initializeSymbolManager,
  symbolToolDefinitions,
  handleSymbolTool,
  graphToolDefinitions,
  handleGraphTool,
} from './symbols/index.js';

// Import document processing agent
import {
  documentToolDefinitions,
  handleDocumentTool
} from './document/index.js';

// Import translation layer
import {
  translationToolDefinitions,
  handleTranslationTool
} from './translation/index.js';

// Import agent orchestration (MADIF)
import {
  orchestrationToolDefinitions,
  handleOrchestrationTool
} from './agents/tools.js';
import { initializeAgentSystem } from './agents/integration.js';

// Import multi-agent / Commander's Intent
import {
  multiAgentToolDefinitions,
  handleMultiAgentTool
} from './multi_agent/index.js';

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS: Tool[] = [
  // Validation Tools
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
  },

  // Execution Tools
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
  },

  // Delegation Tools
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
  },

  // State Tools
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
  },

  // Configuration Tools (Operator)
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
  },

  // Confidence Tools (Operator)
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
  },

  // Feature Flags
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
  },

  // Audit
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
  },

  // Hold Management Tools (Human-in-the-Loop)
  ...holdToolDefinitions,

  // Legal Citation Verification Tools
  ...legalToolDefinitions,

  // Legal Calendar Tools
  ...calendarToolDefinitions,

  // Directive Symbol Registry Tools
  ...symbolToolDefinitions,

  // Graph Traversal Tools
  ...graphToolDefinitions,

  // Document Processing Agent Tools
  ...documentToolDefinitions,

  // Translation Layer Tools
  ...translationToolDefinitions,

  // Agent Orchestration Tools (MADIF)
  ...orchestrationToolDefinitions,

  // Multi-Agent / Commander's Intent Tools
  ...multiAgentToolDefinitions
];

// ============================================================================
// SERVER SETUP
// ============================================================================

async function main() {
  // Initialize paths
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const policiesRoot = path.join(__dirname, '..', 'policies');
  const symbolsRoot = path.join(__dirname, '..', 'symbols');

  // Initialize policy loader
  try {
    const loader = initializePolicyLoader(policiesRoot);

    // Load default policy as active overlay
    const defaultOverlay = loader.toPolicyOverlay('default');
    if (defaultOverlay) {
      operatorConfig.registerOverlay(defaultOverlay);
      operatorConfig.setActiveOverlay('default');
    }

    console.error(`Loaded policies: ${loader.listPolicies().join(', ')}`);
  } catch (error) {
    console.error('Warning: Could not load policies from disk:', error);
  }

  // Initialize symbol manager
  try {
    const symbolManager = initializeSymbolManager(symbolsRoot);
    const stats = symbolManager.getStats();
    console.error(`Symbol registry initialized: ${stats.total_symbols} symbols loaded`);
  } catch (error) {
    console.error('Warning: Could not initialize symbol registry:', error);
  }

  // Initialize MADIF agent system
  try {
    const agentSystem = await initializeAgentSystem({
      dbPath: path.join(__dirname, '..', 'data', 'agents.db'),
    });
    console.error('MADIF agent system initialized');
  } catch (error) {
    console.error('Warning: Could not initialize MADIF agent system:', error);
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'promptspeak-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Handle list tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        // Validation
        case 'ps_validate':
          result = ps_validate(args as any);
          break;
        case 'ps_validate_batch':
          result = ps_validate_batch(args as any);
          break;

        // Execution
        case 'ps_execute':
          result = await ps_execute(args as any);
          break;
        case 'ps_execute_dry_run':
          result = ps_execute_dry_run(args as any);
          break;

        // Delegation
        case 'ps_delegate':
          result = ps_delegate(args as any);
          break;
        case 'ps_delegate_revoke':
          result = ps_delegate_revoke(args as any);
          break;
        case 'ps_delegate_list':
          result = ps_delegate_list(args as any);
          break;

        // State
        case 'ps_state_get':
          result = ps_state_get((args as any).agentId);
          break;
        case 'ps_state_system':
          result = ps_state_system();
          break;
        case 'ps_state_reset':
          result = ps_state_reset(args as any);
          break;
        case 'ps_state_recalibrate':
          result = ps_state_recalibrate(args as any);
          break;
        case 'ps_state_halt':
          result = ps_state_halt(args as any);
          break;
        case 'ps_state_resume':
          result = ps_state_resume(args as any);
          break;
        case 'ps_state_drift_history':
          result = ps_state_drift_history(args as any);
          break;

        // Configuration
        case 'ps_config_set':
          result = ps_config_set(args as any);
          break;
        case 'ps_config_activate':
          result = ps_config_activate(args as any);
          break;
        case 'ps_config_get':
          result = ps_config_get();
          break;
        case 'ps_config_export':
          result = ps_config_export();
          break;
        case 'ps_config_import':
          result = ps_config_import(args as any);
          break;

        // Confidence
        case 'ps_confidence_set':
          result = ps_confidence_set(args as any);
          break;
        case 'ps_confidence_get':
          result = ps_confidence_get();
          break;
        case 'ps_confidence_bulk_set':
          result = ps_confidence_bulk_set(args as any);
          break;

        // Features
        case 'ps_feature_set':
          result = ps_feature_set(args as any);
          break;
        case 'ps_feature_get':
          result = ps_feature_get();
          break;

        // Audit
        case 'ps_audit_get':
          result = ps_audit_get(args as any);
          break;

        // Hold Management (Human-in-the-Loop)
        case 'ps_hold_list':
        case 'ps_hold_approve':
        case 'ps_hold_reject':
        case 'ps_hold_config':
        case 'ps_hold_stats':
          result = await handleHoldTool(name, args as Record<string, unknown>);
          break;

        // Legal Citation Verification
        case 'ps_legal_verify':
        case 'ps_legal_verify_batch':
        case 'ps_legal_extract':
        case 'ps_legal_check':
        case 'ps_legal_config':
        case 'ps_legal_stats':
          result = await handleLegalTool(name, args as Record<string, unknown>);
          break;

        // Legal Calendar
        case 'ps_calendar_extract':
        case 'ps_calendar_export':
        case 'ps_calendar_calculate':
        case 'ps_calendar_frcp':
          result = await handleCalendarTool(name, args as Record<string, unknown>);
          break;

        // Directive Symbol Registry
        case 'ps_symbol_create':
        case 'ps_symbol_get':
        case 'ps_symbol_update':
        case 'ps_symbol_list':
        case 'ps_symbol_delete':
        case 'ps_symbol_import':
        case 'ps_symbol_stats':
        case 'ps_symbol_format':
          result = await handleSymbolTool(name, args as Record<string, unknown>);
          break;

        // Graph Traversal
        case 'ps_graph_relate':
        case 'ps_graph_related':
        case 'ps_graph_neighborhood':
        case 'ps_graph_path':
        case 'ps_graph_shortest_path':
        case 'ps_graph_centrality':
        case 'ps_graph_stats':
        case 'ps_graph_delete_relationship':
        case 'ps_graph_batch_relate':
          result = await handleGraphTool(name, args as Record<string, unknown>);
          break;

        // Document Processing Agent
        case 'ps_document_process':
        case 'ps_document_batch':
        case 'ps_document_company_symbols':
        case 'ps_document_stats':
          result = await handleDocumentTool(name, args as Record<string, unknown>);
          break;

        // Translation Layer
        case 'ps_frame_translate':
        case 'ps_nl_compile':
        case 'ps_nl_decompile':
        case 'ps_opacity_resolve':
        case 'ps_opacity_stats':
          result = await handleTranslationTool(name, args as Record<string, unknown>);
          break;

        // Agent Orchestration (MADIF)
        case 'ps_orch_query':
        case 'ps_orch_propose_agent':
        case 'ps_orch_status':
        case 'ps_orch_abort':
        case 'ps_agent_list_proposals':
        case 'ps_agent_approve':
        case 'ps_agent_reject':
        case 'ps_agent_list':
        case 'ps_agent_get':
        case 'ps_agent_enable':
        case 'ps_agent_disable':
        case 'ps_agent_terminate':
        case 'ps_agent_metrics':
          result = await handleOrchestrationTool(name, args as Record<string, unknown>);
          break;

        // Multi-Agent / Commander's Intent
        case 'ps_intent_create':
        case 'ps_intent_get':
        case 'ps_intent_consult':
        case 'ps_agent_register':
        case 'ps_agent_bind':
        case 'ps_mission_create':
        case 'ps_mission_status':
        case 'ps_mission_control':
          result = await handleMultiAgentTool(name, args as Record<string, unknown>);
          break;

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error}` }],
        isError: true
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PromptSpeak MCP Server running on stdio');
}

main().catch(console.error);
