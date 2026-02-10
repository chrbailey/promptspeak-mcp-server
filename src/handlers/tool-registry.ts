/**
 * ===============================================================================
 * TOOL REGISTRY - Metadata-Driven Tool Configuration
 * ===============================================================================
 *
 * Single source of truth for all tool registrations.
 * Eliminates duplication between tool registration and categorization.
 *
 * Benefits:
 * - Add new tool = one entry in the registry
 * - Category is always in sync with registration
 * - Type-safe tool definitions
 * - Self-documenting tool catalog
 *
 * ===============================================================================
 */

// ============================================================================
// IMPORTS - Direct Handlers
// ============================================================================

// Validation tools
import { ps_validate, ps_validate_batch } from '../tools/index.js';

// Execution tools
import { ps_execute, ps_execute_dry_run } from '../tools/index.js';

// Delegation tools
import { ps_delegate, ps_delegate_revoke, ps_delegate_list } from '../tools/index.js';

// State tools
import {
  ps_state_get,
  ps_state_system,
  ps_state_reset,
  ps_state_recalibrate,
  ps_state_halt,
  ps_state_resume,
  ps_state_drift_history,
} from '../tools/index.js';

// Configuration tools
import {
  ps_config_set,
  ps_config_activate,
  ps_config_get,
  ps_config_export,
  ps_config_import,
} from '../tools/index.js';

// Confidence tools
import {
  ps_confidence_set,
  ps_confidence_get,
  ps_confidence_bulk_set,
} from '../tools/index.js';

// Feature tools
import { ps_feature_set, ps_feature_get } from '../tools/index.js';

// Audit tools
import { ps_audit_get } from '../tools/index.js';

// ============================================================================
// IMPORTS - Delegated Handlers
// ============================================================================

import { handleHoldTool } from '../tools/index.js';
import { handleSymbolTool } from '../symbols/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool categories for grouping and filtering.
 */
export type ToolCategory =
  | 'validation'
  | 'execution'
  | 'delegation'
  | 'state'
  | 'config'
  | 'confidence'
  | 'feature'
  | 'audit'
  | 'hold'
  | 'symbol';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs) => unknown | Promise<unknown>;

/**
 * Tool registration entry.
 */
export interface ToolEntry {
  /** The handler function for this tool */
  handler: ToolHandler;
  /** Category for grouping */
  category: ToolCategory;
  /** Optional description for documentation */
  description?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a delegated handler that forwards to a dispatcher function.
 * Pattern: (args) => dispatcher(toolName, args)
 */
function delegated(
  dispatcher: (name: string, args: ToolArgs) => unknown | Promise<unknown>,
  toolName: string
): ToolHandler {
  return (args) => dispatcher(toolName, args);
}

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Master registry of all tools.
 * Single source of truth for tool name → handler mapping and categorization.
 */
export const TOOL_REGISTRY: Record<string, ToolEntry> = {
  // -------------------------------------------------------------------------
  // VALIDATION TOOLS
  // -------------------------------------------------------------------------
  ps_validate: {
    handler: (args) => ps_validate(args as any),
    category: 'validation',
    description: 'Validate PromptSpeak syntax and semantics',
  },
  ps_validate_batch: {
    handler: (args) => ps_validate_batch(args as any),
    category: 'validation',
    description: 'Batch validate multiple PromptSpeak expressions',
  },

  // -------------------------------------------------------------------------
  // EXECUTION TOOLS
  // -------------------------------------------------------------------------
  ps_execute: {
    handler: async (args) => ps_execute(args as any),
    category: 'execution',
    description: 'Execute a PromptSpeak directive',
  },
  ps_execute_dry_run: {
    handler: (args) => ps_execute_dry_run(args as any),
    category: 'execution',
    description: 'Preview directive execution without side effects',
  },

  // -------------------------------------------------------------------------
  // DELEGATION TOOLS
  // -------------------------------------------------------------------------
  ps_delegate: {
    handler: (args) => ps_delegate(args as any),
    category: 'delegation',
    description: 'Delegate execution authority to an agent',
  },
  ps_delegate_revoke: {
    handler: (args) => ps_delegate_revoke(args as any),
    category: 'delegation',
    description: 'Revoke delegated authority',
  },
  ps_delegate_list: {
    handler: (args) => ps_delegate_list(args as any),
    category: 'delegation',
    description: 'List active delegations',
  },

  // -------------------------------------------------------------------------
  // STATE TOOLS
  // -------------------------------------------------------------------------
  ps_state_get: {
    handler: (args) => ps_state_get((args as { agentId: string }).agentId),
    category: 'state',
    description: 'Get agent state',
  },
  ps_state_system: {
    handler: () => ps_state_system(),
    category: 'state',
    description: 'Get system-wide state',
  },
  ps_state_reset: {
    handler: (args) => ps_state_reset(args as any),
    category: 'state',
    description: 'Reset agent state',
  },
  ps_state_recalibrate: {
    handler: (args) => ps_state_recalibrate(args as any),
    category: 'state',
    description: 'Recalibrate agent confidence',
  },
  ps_state_halt: {
    handler: (args) => ps_state_halt(args as any),
    category: 'state',
    description: 'Halt agent execution',
  },
  ps_state_resume: {
    handler: (args) => ps_state_resume(args as any),
    category: 'state',
    description: 'Resume halted agent',
  },
  ps_state_drift_history: {
    handler: (args) => ps_state_drift_history(args as any),
    category: 'state',
    description: 'Get drift detection history',
  },

  // -------------------------------------------------------------------------
  // CONFIGURATION TOOLS
  // -------------------------------------------------------------------------
  ps_config_set: {
    handler: (args) => ps_config_set(args as any),
    category: 'config',
    description: 'Set configuration value',
  },
  ps_config_activate: {
    handler: (args) => ps_config_activate(args as any),
    category: 'config',
    description: 'Activate configuration profile',
  },
  ps_config_get: {
    handler: () => ps_config_get(),
    category: 'config',
    description: 'Get current configuration',
  },
  ps_config_export: {
    handler: () => ps_config_export(),
    category: 'config',
    description: 'Export configuration',
  },
  ps_config_import: {
    handler: (args) => ps_config_import(args as any),
    category: 'config',
    description: 'Import configuration',
  },

  // -------------------------------------------------------------------------
  // CONFIDENCE TOOLS
  // -------------------------------------------------------------------------
  ps_confidence_set: {
    handler: (args) => ps_confidence_set(args as any),
    category: 'confidence',
    description: 'Set agent confidence level',
  },
  ps_confidence_get: {
    handler: () => ps_confidence_get(),
    category: 'confidence',
    description: 'Get confidence levels',
  },
  ps_confidence_bulk_set: {
    handler: (args) => ps_confidence_bulk_set(args as any),
    category: 'confidence',
    description: 'Bulk set confidence levels',
  },

  // -------------------------------------------------------------------------
  // FEATURE TOOLS
  // -------------------------------------------------------------------------
  ps_feature_set: {
    handler: (args) => ps_feature_set(args as any),
    category: 'feature',
    description: 'Set feature flag',
  },
  ps_feature_get: {
    handler: () => ps_feature_get(),
    category: 'feature',
    description: 'Get feature flags',
  },

  // -------------------------------------------------------------------------
  // AUDIT TOOLS
  // -------------------------------------------------------------------------
  ps_audit_get: {
    handler: (args) => ps_audit_get(args as any),
    category: 'audit',
    description: 'Get audit log entries',
  },

  // -------------------------------------------------------------------------
  // HOLD MANAGEMENT TOOLS (Human-in-the-Loop)
  // -------------------------------------------------------------------------
  ps_hold_list: {
    handler: delegated(handleHoldTool, 'ps_hold_list'),
    category: 'hold',
    description: 'List pending holds',
  },
  ps_hold_approve: {
    handler: delegated(handleHoldTool, 'ps_hold_approve'),
    category: 'hold',
    description: 'Approve a held operation',
  },
  ps_hold_reject: {
    handler: delegated(handleHoldTool, 'ps_hold_reject'),
    category: 'hold',
    description: 'Reject a held operation',
  },
  ps_hold_config: {
    handler: delegated(handleHoldTool, 'ps_hold_config'),
    category: 'hold',
    description: 'Configure hold settings',
  },
  ps_hold_stats: {
    handler: delegated(handleHoldTool, 'ps_hold_stats'),
    category: 'hold',
    description: 'Get hold statistics',
  },

  // -------------------------------------------------------------------------
  // SYMBOL REGISTRY TOOLS
  // -------------------------------------------------------------------------
  ps_symbol_create: {
    handler: delegated(handleSymbolTool, 'ps_symbol_create'),
    category: 'symbol',
    description: 'Create a new symbol',
  },
  ps_symbol_get: {
    handler: delegated(handleSymbolTool, 'ps_symbol_get'),
    category: 'symbol',
    description: 'Get symbol by ID',
  },
  ps_symbol_update: {
    handler: delegated(handleSymbolTool, 'ps_symbol_update'),
    category: 'symbol',
    description: 'Update existing symbol',
  },
  ps_symbol_list: {
    handler: delegated(handleSymbolTool, 'ps_symbol_list'),
    category: 'symbol',
    description: 'List symbols',
  },
  ps_symbol_delete: {
    handler: delegated(handleSymbolTool, 'ps_symbol_delete'),
    category: 'symbol',
    description: 'Delete a symbol',
  },
  ps_symbol_import: {
    handler: delegated(handleSymbolTool, 'ps_symbol_import'),
    category: 'symbol',
    description: 'Import symbols from file',
  },
  ps_symbol_stats: {
    handler: delegated(handleSymbolTool, 'ps_symbol_stats'),
    category: 'symbol',
    description: 'Get symbol registry statistics',
  },
  ps_symbol_format: {
    handler: delegated(handleSymbolTool, 'ps_symbol_format'),
    category: 'symbol',
    description: 'Format symbol for display',
  },
  ps_symbol_verify: {
    handler: delegated(handleSymbolTool, 'ps_symbol_verify'),
    category: 'symbol',
    description: 'Verify symbol epistemic status',
  },
  ps_symbol_list_unverified: {
    handler: delegated(handleSymbolTool, 'ps_symbol_list_unverified'),
    category: 'symbol',
    description: 'List symbols pending verification',
  },
  ps_symbol_add_alternative: {
    handler: delegated(handleSymbolTool, 'ps_symbol_add_alternative'),
    category: 'symbol',
    description: 'Add alternative symbol ID',
  },

};

// ============================================================================
// DERIVED DATA STRUCTURES
// ============================================================================

/**
 * Map of tool names to handlers - built from registry.
 * Used by the dispatcher for O(1) tool lookup.
 */
export const TOOL_HANDLERS = new Map<string, ToolHandler>(
  Object.entries(TOOL_REGISTRY).map(([name, entry]) => [name, entry.handler])
);

/**
 * Get tools grouped by category.
 * Derived from the registry - always in sync with registrations.
 */
export function getToolsByCategory(): Record<ToolCategory, string[]> {
  const categories: Record<ToolCategory, string[]> = {
    validation: [],
    execution: [],
    delegation: [],
    state: [],
    config: [],
    confidence: [],
    feature: [],
    audit: [],
    hold: [],
    symbol: [],
  };

  for (const [name, entry] of Object.entries(TOOL_REGISTRY)) {
    categories[entry.category].push(name);
  }

  return categories;
}

/**
 * Get all registered tool names.
 */
export function getRegisteredTools(): string[] {
  return Object.keys(TOOL_REGISTRY);
}

/**
 * Get the count of registered tools.
 */
export function getToolCount(): number {
  return Object.keys(TOOL_REGISTRY).length;
}

/**
 * Check if a tool is registered.
 */
export function isToolRegistered(name: string): boolean {
  return name in TOOL_REGISTRY;
}

/**
 * Get tool entry by name.
 */
export function getToolEntry(name: string): ToolEntry | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Get tools by category name.
 */
export function getToolsInCategory(category: ToolCategory): string[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([_, entry]) => entry.category === category)
    .map(([name]) => name);
}

/**
 * Get tool statistics by category.
 */
export function getToolStats(): Record<string, number> & { total: number } {
  const categories = getToolsByCategory();
  const stats: Record<string, number> = {};

  for (const [category, tools] of Object.entries(categories)) {
    stats[category] = tools.length;
  }

  return {
    ...stats,
    total: getToolCount(),
  };
}
