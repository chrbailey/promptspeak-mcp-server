/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK SYMBOL MCP TOOLS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * MCP tool definitions and handlers for directive symbol operations.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getSymbolManager } from './manager.js';
import type {
  CreateSymbolRequest,
  GetSymbolRequest,
  UpdateSymbolRequest,
  ListSymbolsRequest,
  DeleteSymbolRequest,
  ImportSymbolsRequest,
  ValidateSymbolRequest,
} from './types.js';
import {
  SAFETY_HEADER,
  SAFETY_FOOTER,
  validateSymbolContent,
  verifySymbolUsage,
} from './sanitizer.js';
import { getAuditLogger } from './audit.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const symbolToolDefinitions: Tool[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_create
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_create',
    description: `Create a new directive symbol in the registry.

Symbol IDs follow the pattern:
- Public companies: Ξ.{TICKER}.{PERIOD} (e.g., Ξ.NVDA.Q3FY25)
- People: Ξ.I.{NAME}.{CONTEXT} (e.g., Ξ.I.JENSEN_HUANG.BIO)
- Events: Ξ.E.{TYPE}.{ID} (e.g., Ξ.E.EARNINGS.NVDA.20241120)
- Sectors: Ξ.S.{SECTOR}.{CONTEXT} (e.g., Ξ.S.SEMICONDUCTORS.2024)
- Tasks: Ξ.T.{PROJECT}.{ID} (e.g., Ξ.T.PORTFOLIO_REVIEW.001)
- Knowledge: Ξ.K.{DOMAIN}.{TOPIC} (e.g., Ξ.K.CHEMISTRY.WATER)
- Queries: Ξ.Q.{DATASET}.{ID} (e.g., Ξ.Q.DEEPSEARCHQA.001)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Unique symbol ID following namespace rules (e.g., Ξ.NVDA.Q3FY25)',
        },
        category: {
          type: 'string',
          enum: ['COMPANY', 'PERSON', 'EVENT', 'SECTOR', 'TASK', 'KNOWLEDGE', 'QUERY'],
          description: 'Category (auto-inferred from ID if not provided)',
        },
        who: {
          type: 'string',
          description: 'Who needs this / who is the audience',
        },
        what: {
          type: 'string',
          description: 'What is being analyzed or done',
        },
        why: {
          type: 'string',
          description: 'Why this matters / purpose',
        },
        where: {
          type: 'string',
          description: 'Scope (company, market, geography)',
        },
        when: {
          type: 'string',
          description: 'Time context',
        },
        how: {
          type: 'object' as const,
          properties: {
            focus: {
              type: 'array',
              items: { type: 'string' },
              description: 'What to emphasize',
            },
            constraints: {
              type: 'array',
              items: { type: 'string' },
              description: 'Restrictions/guardrails',
            },
            output_format: {
              type: 'string',
              description: 'Expected output style',
            },
          },
          required: ['focus', 'constraints'],
        },
        commanders_intent: {
          type: 'string',
          description: 'Ultimate goal in one sentence - the north star',
        },
        requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'MUST include these elements',
        },
        anti_requirements: {
          type: 'array',
          items: { type: 'string' },
          description: 'MUST NOT include these elements',
        },
        key_terms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Terms that MUST appear in output',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Freeform tags for filtering',
        },
        parent_symbol: {
          type: 'string',
          description: 'Parent symbol ID for hierarchical symbols',
        },
        related_symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Related symbol IDs',
        },
        created_by: {
          type: 'string',
          description: 'Creator identifier',
        },
      },
      required: ['symbolId', 'who', 'what', 'why', 'where', 'when', 'how', 'commanders_intent', 'requirements'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_get
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_get',
    description: 'Retrieve a directive symbol by ID. Returns the full symbol with all grounding context.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to retrieve (e.g., Ξ.NVDA.Q3FY25)',
        },
        version: {
          type: 'number',
          description: 'Specific version to retrieve (optional, defaults to latest)',
        },
        include_changelog: {
          type: 'boolean',
          description: 'Include version changelog (default: true)',
        },
      },
      required: ['symbolId'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_update
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_update',
    description: 'Update an existing symbol. Creates a new version with updated hash.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to update',
        },
        changes: {
          type: 'object' as const,
          description: 'Fields to update (who, what, why, where, when, how, commanders_intent, requirements, etc.)',
        },
        change_description: {
          type: 'string',
          description: 'Description of what changed (for changelog)',
        },
        changed_by: {
          type: 'string',
          description: 'Who made the change',
        },
      },
      required: ['symbolId', 'changes', 'change_description'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_list
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_list',
    description: 'List symbols with optional filtering.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['COMPANY', 'PERSON', 'EVENT', 'SECTOR', 'TASK', 'KNOWLEDGE', 'QUERY'],
          description: 'Filter by category',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
        created_after: {
          type: 'string',
          description: 'Filter by creation date (ISO 8601)',
        },
        created_before: {
          type: 'string',
          description: 'Filter by creation date (ISO 8601)',
        },
        search: {
          type: 'string',
          description: 'Search in symbolId and commanders_intent',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 50)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_delete
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_delete',
    description: 'Delete a symbol from the registry.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to delete',
        },
        reason: {
          type: 'string',
          description: 'Reason for deletion',
        },
      },
      required: ['symbolId', 'reason'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_import
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_import',
    description: 'Bulk import symbols from external data (HuggingFace, JSON, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          enum: ['huggingface', 'json', 'csv'],
          description: 'Data source format',
        },
        data: {
          description: 'The data to import (format depends on source)',
        },
        category: {
          type: 'string',
          enum: ['COMPANY', 'PERSON', 'EVENT', 'SECTOR', 'TASK', 'KNOWLEDGE', 'QUERY'],
          description: 'Category for imported symbols',
        },
        id_prefix: {
          type: 'string',
          description: 'Prefix for generated symbol IDs (e.g., Ξ.Q.DEEPSEARCHQA)',
        },
        transform: {
          type: 'object' as const,
          description: 'Field mapping from source data to symbol fields',
        },
        defaults: {
          type: 'object' as const,
          description: 'Default values for fields not in source data',
        },
      },
      required: ['source', 'data', 'category', 'id_prefix'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_stats
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_stats',
    description: 'Get statistics about the symbol registry.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_format
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_format',
    description: 'Format a symbol for inclusion in a prompt. Returns LLM-ready text.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to format',
        },
        format: {
          type: 'string',
          enum: ['full', 'compact', 'requirements_only'],
          description: 'Format style (default: full)',
        },
      },
      required: ['symbolId'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleSymbolTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const manager = getSymbolManager();

  switch (name) {
    case 'ps_symbol_create':
      return manager.create(args as unknown as CreateSymbolRequest);

    case 'ps_symbol_get':
      return manager.get(args as unknown as GetSymbolRequest);

    case 'ps_symbol_update':
      return manager.update(args as unknown as UpdateSymbolRequest);

    case 'ps_symbol_list':
      return manager.list(args as unknown as ListSymbolsRequest);

    case 'ps_symbol_delete':
      return manager.delete(args as unknown as DeleteSymbolRequest);

    case 'ps_symbol_import':
      return manager.import(args as unknown as ImportSymbolsRequest);

    case 'ps_symbol_stats':
      return {
        registry_stats: manager.getStats(),
        timestamp: new Date().toISOString(),
      };

    case 'ps_symbol_format':
      return formatSymbolForPrompt(
        args.symbolId as string,
        args.format as 'full' | 'compact' | 'requirements_only' | undefined
      );

    default:
      throw new Error(`Unknown symbol tool: ${name}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT SYMBOL FOR PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function formatSymbolForPrompt(
  symbolId: string,
  format: 'full' | 'compact' | 'requirements_only' = 'full'
): { success: boolean; formatted?: string; error?: string } {
  const manager = getSymbolManager();
  const result = manager.get({ symbolId, include_changelog: false });

  // Log access for audit trail
  const auditLogger = getAuditLogger();
  if (auditLogger) {
    auditLogger.logAccess(symbolId, result.found, format);
  }

  if (!result.found || !result.symbol) {
    return { success: false, error: result.error || `Symbol ${symbolId} not found` };
  }

  const s = result.symbol;
  let content: string;

  if (format === 'requirements_only') {
    content = `
DIRECTIVE: ${s.symbolId} (v${s.version}, hash: ${s.hash})

COMMANDER'S INTENT: "${s.commanders_intent}"

REQUIREMENTS:
${s.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}
${s.anti_requirements?.length ? '\nANTI-REQUIREMENTS:\n' + s.anti_requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n') : ''}
${s.key_terms?.length ? '\nKEY TERMS (must appear): ' + s.key_terms.join(', ') : ''}
`.trim();
  } else if (format === 'compact') {
    content = `
═══ ${s.symbolId} (v${s.version}) ═══
WHO: ${s.who} | WHAT: ${s.what}
WHY: ${s.why} | WHEN: ${s.when}
INTENT: "${s.commanders_intent}"
REQUIREMENTS: ${s.requirements.join('; ')}
`.trim();
  } else {
    // Full format
    content = `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL: ${s.symbolId}
Version: ${s.version} | Hash: ${s.hash}
═══════════════════════════════════════════════════════════════════════════════

WHO:   ${s.who}
WHAT:  ${s.what}
WHY:   ${s.why}
WHERE: ${s.where}
WHEN:  ${s.when}

HOW:
  Focus: ${s.how.focus.join(', ')}
  Constraints: ${s.how.constraints.join(', ')}
  ${s.how.output_format ? `Output Format: ${s.how.output_format}` : ''}

───────────────────────────────────────────────────────────────────────────────
COMMANDER'S INTENT:
"${s.commanders_intent}"
───────────────────────────────────────────────────────────────────────────────

REQUIREMENTS (ALL must be satisfied):
${s.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

${s.anti_requirements?.length ? `ANTI-REQUIREMENTS (MUST NOT include):\n${s.anti_requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}\n` : ''}
${s.key_terms?.length ? `KEY TERMS (must appear in output): ${s.key_terms.join(', ')}\n` : ''}
═══════════════════════════════════════════════════════════════════════════════
`.trim();
  }

  // Wrap with safety delimiters to prevent injection attacks
  const safeFormatted = `${SAFETY_HEADER}
${content}
${SAFETY_FOOTER}`;

  return {
    success: true,
    formatted: safeFormatted,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  formatSymbolForPrompt,
};
