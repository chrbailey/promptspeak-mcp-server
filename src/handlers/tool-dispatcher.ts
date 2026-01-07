/**
 * ===============================================================================
 * MCP TOOL DISPATCHER
 * ===============================================================================
 *
 * Routes tool calls to their handlers using a Map-based dispatch table.
 * Replaces the monolithic switch statement for maintainability.
 *
 * Tool Categories:
 * - Validation: ps_validate, ps_validate_batch
 * - Execution: ps_execute, ps_execute_dry_run
 * - Delegation: ps_delegate, ps_delegate_revoke, ps_delegate_list
 * - State: ps_state_get, ps_state_system, ps_state_reset, etc.
 * - Configuration: ps_config_set, ps_config_activate, ps_config_get, etc.
 * - Confidence: ps_confidence_set, ps_confidence_get, ps_confidence_bulk_set
 * - Features: ps_feature_set, ps_feature_get
 * - Audit: ps_audit_get
 * - Hold Management: ps_hold_list, ps_hold_approve, ps_hold_reject, etc.
 * - Legal: ps_legal_verify, ps_legal_extract, etc.
 * - Calendar: ps_calendar_extract, ps_calendar_export, etc.
 * - Symbols: ps_symbol_create, ps_symbol_get, ps_symbol_update, etc.
 * - Graph: ps_graph_relate, ps_graph_related, ps_graph_neighborhood, etc.
 * - Document: ps_document_process, ps_document_batch, etc.
 * - Translation: ps_frame_translate, ps_nl_compile, ps_nl_decompile, etc.
 * - Orchestration: ps_orch_query, ps_orch_propose_agent, ps_agent_list, etc.
 * - Multi-Agent: ps_intent_create, ps_mission_create, ps_mission_status, etc.
 */

import { createLogger } from '../core/logging/index.js';

// Import validation tools
import { ps_validate, ps_validate_batch } from '../tools/index.js';

// Import execution tools
import { ps_execute, ps_execute_dry_run } from '../tools/index.js';

// Import delegation tools
import { ps_delegate, ps_delegate_revoke, ps_delegate_list } from '../tools/index.js';

// Import state tools
import {
  ps_state_get,
  ps_state_system,
  ps_state_reset,
  ps_state_recalibrate,
  ps_state_halt,
  ps_state_resume,
  ps_state_drift_history,
} from '../tools/index.js';

// Import configuration tools
import {
  ps_config_set,
  ps_config_activate,
  ps_config_get,
  ps_config_export,
  ps_config_import,
} from '../tools/index.js';

// Import confidence tools
import {
  ps_confidence_set,
  ps_confidence_get,
  ps_confidence_bulk_set,
} from '../tools/index.js';

// Import feature tools
import { ps_feature_set, ps_feature_get } from '../tools/index.js';

// Import audit tools
import { ps_audit_get } from '../tools/index.js';

// Import hold management tools
import { handleHoldTool } from '../tools/index.js';

// Import legal tools
import { handleLegalTool } from '../tools/index.js';

// Import calendar tools
import { handleCalendarTool } from '../tools/index.js';

// Import symbol registry tools
import { handleSymbolTool, handleGraphTool } from '../symbols/index.js';

// Import document processing tools
import { handleDocumentTool } from '../document/index.js';

// Import translation tools
import { handleTranslationTool } from '../translation/index.js';

// Import orchestration tools (MADIF)
import { handleOrchestrationTool } from '../agents/tools.js';

// Import multi-agent tools
import { handleMultiAgentTool } from '../multi_agent/index.js';

// ============================================================================
// TYPES
// ============================================================================

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => unknown | Promise<unknown>;

// ============================================================================
// LOGGER
// ============================================================================

const logger = createLogger('ToolDispatcher');

// ============================================================================
// TOOL DISPATCH TABLE
// ============================================================================

/**
 * Tool dispatch table mapping tool names to handlers.
 * Built using .set() calls for TypeScript compatibility.
 */
const TOOL_HANDLERS = new Map<string, ToolHandler>();

// ---------------------------------------------------------------------------
// Validation Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_validate', (args) => ps_validate(args as any));
TOOL_HANDLERS.set('ps_validate_batch', (args) => ps_validate_batch(args as any));

// ---------------------------------------------------------------------------
// Execution Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_execute', async (args) => ps_execute(args as any));
TOOL_HANDLERS.set('ps_execute_dry_run', (args) => ps_execute_dry_run(args as any));

// ---------------------------------------------------------------------------
// Delegation Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_delegate', (args) => ps_delegate(args as any));
TOOL_HANDLERS.set('ps_delegate_revoke', (args) => ps_delegate_revoke(args as any));
TOOL_HANDLERS.set('ps_delegate_list', (args) => ps_delegate_list(args as any));

// ---------------------------------------------------------------------------
// State Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_state_get', (args) => ps_state_get((args as { agentId: string }).agentId));
TOOL_HANDLERS.set('ps_state_system', () => ps_state_system());
TOOL_HANDLERS.set('ps_state_reset', (args) => ps_state_reset(args as any));
TOOL_HANDLERS.set('ps_state_recalibrate', (args) => ps_state_recalibrate(args as any));
TOOL_HANDLERS.set('ps_state_halt', (args) => ps_state_halt(args as any));
TOOL_HANDLERS.set('ps_state_resume', (args) => ps_state_resume(args as any));
TOOL_HANDLERS.set('ps_state_drift_history', (args) => ps_state_drift_history(args as any));

// ---------------------------------------------------------------------------
// Configuration Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_config_set', (args) => ps_config_set(args as any));
TOOL_HANDLERS.set('ps_config_activate', (args) => ps_config_activate(args as any));
TOOL_HANDLERS.set('ps_config_get', () => ps_config_get());
TOOL_HANDLERS.set('ps_config_export', () => ps_config_export());
TOOL_HANDLERS.set('ps_config_import', (args) => ps_config_import(args as any));

// ---------------------------------------------------------------------------
// Confidence Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_confidence_set', (args) => ps_confidence_set(args as any));
TOOL_HANDLERS.set('ps_confidence_get', () => ps_confidence_get());
TOOL_HANDLERS.set('ps_confidence_bulk_set', (args) => ps_confidence_bulk_set(args as any));

// ---------------------------------------------------------------------------
// Feature Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_feature_set', (args) => ps_feature_set(args as any));
TOOL_HANDLERS.set('ps_feature_get', () => ps_feature_get());

// ---------------------------------------------------------------------------
// Audit Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_audit_get', (args) => ps_audit_get(args as any));

// ---------------------------------------------------------------------------
// Hold Management Tools (Human-in-the-Loop)
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_hold_list', (args) => handleHoldTool('ps_hold_list', args));
TOOL_HANDLERS.set('ps_hold_approve', (args) => handleHoldTool('ps_hold_approve', args));
TOOL_HANDLERS.set('ps_hold_reject', (args) => handleHoldTool('ps_hold_reject', args));
TOOL_HANDLERS.set('ps_hold_config', (args) => handleHoldTool('ps_hold_config', args));
TOOL_HANDLERS.set('ps_hold_stats', (args) => handleHoldTool('ps_hold_stats', args));

// ---------------------------------------------------------------------------
// Legal Citation Verification Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_legal_verify', (args) => handleLegalTool('ps_legal_verify', args));
TOOL_HANDLERS.set('ps_legal_verify_batch', (args) => handleLegalTool('ps_legal_verify_batch', args));
TOOL_HANDLERS.set('ps_legal_extract', (args) => handleLegalTool('ps_legal_extract', args));
TOOL_HANDLERS.set('ps_legal_check', (args) => handleLegalTool('ps_legal_check', args));
TOOL_HANDLERS.set('ps_legal_config', (args) => handleLegalTool('ps_legal_config', args));
TOOL_HANDLERS.set('ps_legal_stats', (args) => handleLegalTool('ps_legal_stats', args));

// ---------------------------------------------------------------------------
// Legal Calendar Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_calendar_extract', (args) => handleCalendarTool('ps_calendar_extract', args));
TOOL_HANDLERS.set('ps_calendar_export', (args) => handleCalendarTool('ps_calendar_export', args));
TOOL_HANDLERS.set('ps_calendar_calculate', (args) => handleCalendarTool('ps_calendar_calculate', args));
TOOL_HANDLERS.set('ps_calendar_frcp', (args) => handleCalendarTool('ps_calendar_frcp', args));

// ---------------------------------------------------------------------------
// Directive Symbol Registry Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_symbol_create', (args) => handleSymbolTool('ps_symbol_create', args));
TOOL_HANDLERS.set('ps_symbol_get', (args) => handleSymbolTool('ps_symbol_get', args));
TOOL_HANDLERS.set('ps_symbol_update', (args) => handleSymbolTool('ps_symbol_update', args));
TOOL_HANDLERS.set('ps_symbol_list', (args) => handleSymbolTool('ps_symbol_list', args));
TOOL_HANDLERS.set('ps_symbol_delete', (args) => handleSymbolTool('ps_symbol_delete', args));
TOOL_HANDLERS.set('ps_symbol_import', (args) => handleSymbolTool('ps_symbol_import', args));
TOOL_HANDLERS.set('ps_symbol_stats', (args) => handleSymbolTool('ps_symbol_stats', args));
TOOL_HANDLERS.set('ps_symbol_format', (args) => handleSymbolTool('ps_symbol_format', args));

// ---------------------------------------------------------------------------
// Graph Traversal Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_graph_relate', (args) => handleGraphTool('ps_graph_relate', args));
TOOL_HANDLERS.set('ps_graph_related', (args) => handleGraphTool('ps_graph_related', args));
TOOL_HANDLERS.set('ps_graph_neighborhood', (args) => handleGraphTool('ps_graph_neighborhood', args));
TOOL_HANDLERS.set('ps_graph_path', (args) => handleGraphTool('ps_graph_path', args));
TOOL_HANDLERS.set('ps_graph_shortest_path', (args) => handleGraphTool('ps_graph_shortest_path', args));
TOOL_HANDLERS.set('ps_graph_centrality', (args) => handleGraphTool('ps_graph_centrality', args));
TOOL_HANDLERS.set('ps_graph_stats', (args) => handleGraphTool('ps_graph_stats', args));
TOOL_HANDLERS.set('ps_graph_delete_relationship', (args) => handleGraphTool('ps_graph_delete_relationship', args));
TOOL_HANDLERS.set('ps_graph_batch_relate', (args) => handleGraphTool('ps_graph_batch_relate', args));

// ---------------------------------------------------------------------------
// Document Processing Agent Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_document_process', (args) => handleDocumentTool('ps_document_process', args));
TOOL_HANDLERS.set('ps_document_batch', (args) => handleDocumentTool('ps_document_batch', args));
TOOL_HANDLERS.set('ps_document_company_symbols', (args) => handleDocumentTool('ps_document_company_symbols', args));
TOOL_HANDLERS.set('ps_document_stats', (args) => handleDocumentTool('ps_document_stats', args));

// ---------------------------------------------------------------------------
// Translation Layer Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_frame_translate', (args) => handleTranslationTool('ps_frame_translate', args));
TOOL_HANDLERS.set('ps_nl_compile', (args) => handleTranslationTool('ps_nl_compile', args));
TOOL_HANDLERS.set('ps_nl_decompile', (args) => handleTranslationTool('ps_nl_decompile', args));
TOOL_HANDLERS.set('ps_opacity_resolve', (args) => handleTranslationTool('ps_opacity_resolve', args));
TOOL_HANDLERS.set('ps_opacity_stats', (args) => handleTranslationTool('ps_opacity_stats', args));

// ---------------------------------------------------------------------------
// Agent Orchestration Tools (MADIF)
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_orch_query', (args) => handleOrchestrationTool('ps_orch_query', args));
TOOL_HANDLERS.set('ps_orch_propose_agent', (args) => handleOrchestrationTool('ps_orch_propose_agent', args));
TOOL_HANDLERS.set('ps_orch_status', (args) => handleOrchestrationTool('ps_orch_status', args));
TOOL_HANDLERS.set('ps_orch_abort', (args) => handleOrchestrationTool('ps_orch_abort', args));
TOOL_HANDLERS.set('ps_agent_list_proposals', (args) => handleOrchestrationTool('ps_agent_list_proposals', args));
TOOL_HANDLERS.set('ps_agent_approve', (args) => handleOrchestrationTool('ps_agent_approve', args));
TOOL_HANDLERS.set('ps_agent_reject', (args) => handleOrchestrationTool('ps_agent_reject', args));
TOOL_HANDLERS.set('ps_agent_list', (args) => handleOrchestrationTool('ps_agent_list', args));
TOOL_HANDLERS.set('ps_agent_get', (args) => handleOrchestrationTool('ps_agent_get', args));
TOOL_HANDLERS.set('ps_agent_enable', (args) => handleOrchestrationTool('ps_agent_enable', args));
TOOL_HANDLERS.set('ps_agent_disable', (args) => handleOrchestrationTool('ps_agent_disable', args));
TOOL_HANDLERS.set('ps_agent_terminate', (args) => handleOrchestrationTool('ps_agent_terminate', args));
TOOL_HANDLERS.set('ps_agent_metrics', (args) => handleOrchestrationTool('ps_agent_metrics', args));

// ---------------------------------------------------------------------------
// Multi-Agent / Commander's Intent Tools
// ---------------------------------------------------------------------------
TOOL_HANDLERS.set('ps_intent_create', (args) => handleMultiAgentTool('ps_intent_create', args));
TOOL_HANDLERS.set('ps_intent_get', (args) => handleMultiAgentTool('ps_intent_get', args));
TOOL_HANDLERS.set('ps_intent_consult', (args) => handleMultiAgentTool('ps_intent_consult', args));
TOOL_HANDLERS.set('ps_agent_register', (args) => handleMultiAgentTool('ps_agent_register', args));
TOOL_HANDLERS.set('ps_agent_bind', (args) => handleMultiAgentTool('ps_agent_bind', args));
TOOL_HANDLERS.set('ps_mission_create', (args) => handleMultiAgentTool('ps_mission_create', args));
TOOL_HANDLERS.set('ps_mission_status', (args) => handleMultiAgentTool('ps_mission_status', args));
TOOL_HANDLERS.set('ps_mission_control', (args) => handleMultiAgentTool('ps_mission_control', args));

// ============================================================================
// DISPATCHER FUNCTIONS
// ============================================================================

/**
 * Dispatch a tool call to its handler.
 *
 * @param name Tool name (e.g., 'ps_validate')
 * @param args Tool arguments
 * @returns Tool result formatted for MCP response
 */
export async function dispatchTool(
  name: string,
  args: ToolArgs
): Promise<CallToolResult> {
  const handler = TOOL_HANDLERS.get(name);

  if (!handler) {
    logger.warn('Unknown tool requested', { toolName: name });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `Unknown tool: ${name}` }),
      }],
      isError: true,
    };
  }

  logger.debug('Dispatching tool', { toolName: name });

  try {
    const result = await handler(args);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    logger.error('Tool execution failed', error as Error, { toolName: name });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      }],
      isError: true,
    };
  }
}

/**
 * Check if a tool is registered in the dispatcher.
 *
 * @param name Tool name to check
 * @returns true if the tool is registered
 */
export function isToolRegistered(name: string): boolean {
  return TOOL_HANDLERS.has(name);
}

/**
 * Get all registered tool names.
 *
 * @returns Array of all tool names in the dispatcher
 */
export function getRegisteredTools(): string[] {
  return Array.from(TOOL_HANDLERS.keys());
}

/**
 * Get the count of registered tools.
 *
 * @returns Number of tools registered in the dispatcher
 */
export function getToolCount(): number {
  return TOOL_HANDLERS.size;
}

/**
 * Get tools grouped by category.
 * Categories are inferred from the tool name prefix.
 *
 * @returns Object mapping category names to tool names
 */
export function getToolsByCategory(): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    validation: [],
    execution: [],
    delegation: [],
    state: [],
    config: [],
    confidence: [],
    feature: [],
    audit: [],
    hold: [],
    legal: [],
    calendar: [],
    symbol: [],
    graph: [],
    document: [],
    translation: [],
    orchestration: [],
    multi_agent: [],
  };

  for (const name of Array.from(TOOL_HANDLERS.keys())) {
    if (name.startsWith('ps_validate')) categories.validation.push(name);
    else if (name.startsWith('ps_execute')) categories.execution.push(name);
    else if (name.startsWith('ps_delegate')) categories.delegation.push(name);
    else if (name.startsWith('ps_state')) categories.state.push(name);
    else if (name.startsWith('ps_config')) categories.config.push(name);
    else if (name.startsWith('ps_confidence')) categories.confidence.push(name);
    else if (name.startsWith('ps_feature')) categories.feature.push(name);
    else if (name.startsWith('ps_audit')) categories.audit.push(name);
    else if (name.startsWith('ps_hold')) categories.hold.push(name);
    else if (name.startsWith('ps_legal')) categories.legal.push(name);
    else if (name.startsWith('ps_calendar')) categories.calendar.push(name);
    else if (name.startsWith('ps_symbol')) categories.symbol.push(name);
    else if (name.startsWith('ps_graph')) categories.graph.push(name);
    else if (name.startsWith('ps_document')) categories.document.push(name);
    else if (name.startsWith('ps_frame') || name.startsWith('ps_nl') || name.startsWith('ps_opacity')) {
      categories.translation.push(name);
    }
    else if (name.startsWith('ps_orch') || (name.startsWith('ps_agent') && !name.includes('register') && !name.includes('bind'))) {
      categories.orchestration.push(name);
    }
    else if (name.startsWith('ps_intent') || name.startsWith('ps_mission') || name === 'ps_agent_register' || name === 'ps_agent_bind') {
      categories.multi_agent.push(name);
    }
  }

  return categories;
}
