/**
 * ===============================================================================
 * MCP TOOL DISPATCHER
 * ===============================================================================
 *
 * Routes tool calls to their handlers using the centralized tool registry.
 * All tool registrations are managed in tool-registry.ts.
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
 * - Swarm: ps_swarm_create, ps_swarm_start, ps_swarm_status, etc.
 * - Intel: ps_intel_list_opportunities, ps_intel_query_market, etc.
 *
 * ===============================================================================
 */

import { createLogger } from '../core/logging/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Import MCP response adapter
import {
  mcpLegacyFailure,
  fromLegacyResponse,
} from '../core/result/index.js';

// Import from centralized registry
import {
  TOOL_HANDLERS,
  getToolsByCategory as registryGetToolsByCategory,
  getRegisteredTools as registryGetRegisteredTools,
  getToolCount as registryGetToolCount,
  isToolRegistered as registryIsToolRegistered,
  getToolStats,
  type ToolCategory,
} from './tool-registry.js';

// ============================================================================
// TYPES
// ============================================================================

type ToolArgs = Record<string, unknown>;

// ============================================================================
// LOGGER
// ============================================================================

const logger = createLogger('ToolDispatcher');

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
    return mcpLegacyFailure(`Unknown tool: ${name}`);
  }

  logger.debug('Dispatching tool', { toolName: name });

  try {
    const result = await handler(args);
    // Use fromLegacyResponse to handle existing tool response formats
    return fromLegacyResponse(result as Record<string, unknown>);
  } catch (error) {
    logger.error('Tool execution failed', error as Error, { toolName: name });
    const message = error instanceof Error ? error.message : String(error);
    return mcpLegacyFailure(message);
  }
}

/**
 * Check if a tool is registered in the dispatcher.
 *
 * @param name Tool name to check
 * @returns true if the tool is registered
 */
export function isToolRegistered(name: string): boolean {
  return registryIsToolRegistered(name);
}

/**
 * Get all registered tool names.
 *
 * @returns Array of all tool names in the dispatcher
 */
export function getRegisteredTools(): string[] {
  return registryGetRegisteredTools();
}

/**
 * Get the count of registered tools.
 *
 * @returns Number of tools registered in the dispatcher
 */
export function getToolCount(): number {
  return registryGetToolCount();
}

/**
 * Get tools grouped by category.
 * Categories are derived from the tool registry metadata.
 *
 * @returns Object mapping category names to tool names
 */
export function getToolsByCategory(): Record<string, string[]> {
  // Convert ToolCategory record to string record for backwards compatibility
  const categories = registryGetToolsByCategory();
  const result: Record<string, string[]> = {};

  for (const [category, tools] of Object.entries(categories)) {
    // Map camelCase to snake_case for backwards compatibility
    const legacyKey = category === 'multiAgent' ? 'multi_agent' : category;
    result[legacyKey] = tools;
  }

  return result;
}

// Re-export additional utilities from registry
export { getToolStats, type ToolCategory };
