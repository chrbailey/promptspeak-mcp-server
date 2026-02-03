/**
 * ===============================================================================
 * COMMANDER'S INTENT TOOL DISPATCHER
 * ===============================================================================
 *
 * Dispatches MCP tool calls to the appropriate Commander's Intent handlers.
 * Follows the pattern established in verification/tools.ts.
 *
 * Usage:
 * ```typescript
 * import { dispatchIntentTool, isIntentTool } from './tool-dispatcher.js';
 *
 * if (isIntentTool(toolName)) {
 *   const result = await dispatchIntentTool(toolName, args);
 *   if (result) return result;
 * }
 * ```
 *
 * ===============================================================================
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  INTENT_TOOLS,
  handleMissionCreate,
  handleMissionStatus,
  handleMissionComplete,
  handleAgentRegister,
  handleAgentHeartbeat,
  handleIntentConsult,
} from './intent-tools.js';

// ===============================================================================
// TOOL IDENTIFICATION
// ===============================================================================

/**
 * Set of tool names handled by the Intent dispatcher.
 */
const INTENT_TOOL_NAMES = new Set([
  'ps_mission_create',
  'ps_mission_status',
  'ps_mission_complete',
  'ps_agent_register',
  'ps_agent_heartbeat',
  'ps_intent_consult',
]);

/**
 * Check if a tool name is handled by the Intent dispatcher.
 *
 * @param toolName - The tool name to check
 * @returns true if this is an Intent tool
 */
export function isIntentTool(toolName: string): boolean {
  return INTENT_TOOL_NAMES.has(toolName);
}

/**
 * Get all Intent tool names.
 *
 * @returns Array of tool names
 */
export function getIntentToolNames(): string[] {
  return Array.from(INTENT_TOOL_NAMES);
}

// ===============================================================================
// DISPATCHER
// ===============================================================================

/**
 * Dispatch a tool call to the appropriate Intent handler.
 *
 * @param toolName - The tool name to dispatch
 * @param args - Tool arguments
 * @returns CallToolResult or null if not an Intent tool
 *
 * @example
 * ```typescript
 * const result = await dispatchIntentTool('ps_mission_create', {
 *   name: 'Market Research',
 *   objective: 'Analyze competitor products',
 *   // ...
 * });
 * ```
 */
export async function dispatchIntentTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult | null> {
  switch (toolName) {
    case 'ps_mission_create':
      return handleMissionCreate(args as Parameters<typeof handleMissionCreate>[0]);

    case 'ps_mission_status':
      return handleMissionStatus(args as Parameters<typeof handleMissionStatus>[0]);

    case 'ps_mission_complete':
      return handleMissionComplete(args as Parameters<typeof handleMissionComplete>[0]);

    case 'ps_agent_register':
      return handleAgentRegister(args as Parameters<typeof handleAgentRegister>[0]);

    case 'ps_agent_heartbeat':
      return handleAgentHeartbeat(args as Parameters<typeof handleAgentHeartbeat>[0]);

    case 'ps_intent_consult':
      return handleIntentConsult(args as Parameters<typeof handleIntentConsult>[0]);

    default:
      // Not an Intent tool - return null so caller knows to try other dispatchers
      return null;
  }
}

// ===============================================================================
// TOOL DEFINITIONS EXPORT
// ===============================================================================

/**
 * Get all Intent tool definitions for MCP registration.
 *
 * @returns Array of tool definitions
 */
export function getIntentToolDefinitions() {
  return INTENT_TOOLS;
}

/**
 * Get Intent tool count for diagnostics.
 */
export function getIntentToolCount(): number {
  return INTENT_TOOLS.length;
}
