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
import type { EpistemicStatus, EpistemicMetadata } from './epistemic-types.js';

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // EPISTEMIC VERIFICATION TOOLS (v2.1)
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_verify
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_verify',
    description: `Record human verification of a symbol claim.

Use this tool to upgrade or dispute claims based on human review:
- VERIFIED: Human expert has confirmed the claim is accurate
- CORROBORATED: Additional evidence supports the claim
- DISPUTED: Human reviewer found the claim to be incorrect or misleading

Important: Accusatory claims (fraud, violations) should be DISPUTED if they lack
evidence or have plausible alternative explanations.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to verify',
        },
        new_status: {
          type: 'string',
          enum: ['VERIFIED', 'DISPUTED', 'CORROBORATED'],
          description: 'New epistemic status for the claim',
        },
        new_confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'New confidence level (0-1). Auto-calculated if not provided.',
        },
        evidence_added: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of evidence sources that support this verification',
        },
        reviewer: {
          type: 'string',
          description: 'Identifier of the human reviewer',
        },
        notes: {
          type: 'string',
          description: 'Notes explaining the verification decision',
        },
      },
      required: ['symbolId', 'new_status', 'reviewer'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_list_unverified
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_list_unverified',
    description: `List symbols that require human review.

Returns symbols flagged for review due to:
- Accusatory claims without sufficient evidence
- Missing alternative explanations
- High-stakes claims (fraud, violations, diagnoses)
- Low confidence scores

Use this to find claims that need human validation before action.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        claim_type: {
          type: 'string',
          enum: ['FACTUAL', 'STATISTICAL', 'CAUSAL', 'PREDICTIVE', 'ACCUSATORY', 'DIAGNOSTIC', 'PRESCRIPTIVE'],
          description: 'Filter by claim type (e.g., ACCUSATORY for fraud allegations)',
        },
        min_confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Minimum confidence level to include',
        },
        max_confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Maximum confidence level to include',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 50)',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
        },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ps_symbol_add_alternative
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_symbol_add_alternative',
    description: `Add an alternative explanation to a symbol's findings.

CRITICAL for preventing false positives: When a pattern-based finding could have
multiple explanations, document them here. Adding high-likelihood alternatives
automatically reduces confidence in the original claim.

Examples:
- "9 identical payments" → Alternative: "Monthly insurance premium financing"
- "Large round numbers" → Alternative: "Negotiated contract amounts"
- "Vendor with single customer" → Alternative: "Subsidiary company"`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbolId: {
          type: 'string',
          description: 'Symbol ID to update',
        },
        alternative: {
          type: 'string',
          description: 'Description of the alternative explanation',
        },
        likelihood: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Estimated likelihood this alternative is correct (0-1)',
        },
        reasoning: {
          type: 'string',
          description: 'Why this alternative is plausible',
        },
        added_by: {
          type: 'string',
          description: 'Who is adding this alternative',
        },
      },
      required: ['symbolId', 'alternative', 'likelihood', 'added_by'],
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

    // ─────────────────────────────────────────────────────────────────────────
    // EPISTEMIC VERIFICATION HANDLERS (v2.1)
    // ─────────────────────────────────────────────────────────────────────────

    case 'ps_symbol_verify':
      return manager.verifySymbol({
        symbolId: args.symbolId as string,
        new_status: args.new_status as 'VERIFIED' | 'DISPUTED' | 'CORROBORATED',
        new_confidence: args.new_confidence as number | undefined,
        evidence_added: args.evidence_added as string[] | undefined,
        reviewer: args.reviewer as string,
        notes: args.notes as string | undefined,
      });

    case 'ps_symbol_list_unverified':
      return manager.listUnverifiedSymbols({
        claim_type: args.claim_type as string | undefined,
        min_confidence: args.min_confidence as number | undefined,
        max_confidence: args.max_confidence as number | undefined,
        limit: args.limit as number | undefined,
        offset: args.offset as number | undefined,
      });

    case 'ps_symbol_add_alternative':
      return manager.addAlternativeExplanation({
        symbolId: args.symbolId as string,
        alternative: args.alternative as string,
        likelihood: args.likelihood as number,
        reasoning: args.reasoning as string | undefined,
        added_by: args.added_by as string,
      });

    default:
      throw new Error(`Unknown symbol tool: ${name}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EPISTEMIC FORMATTING UTILITIES (v2.1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Render a confidence bar for visual uncertainty display.
 * Uses filled and empty blocks to show confidence level.
 */
function renderConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Get emoji indicator for epistemic status.
 */
function getStatusEmoji(status: EpistemicStatus): string {
  const map: Record<EpistemicStatus, string> = {
    'HYPOTHESIS': '❓',
    'INFERENCE': '🔍',
    'OBSERVATION': '👁️',
    'CORROBORATED': '✓✓',
    'VERIFIED': '✅',
    'AXIOMATIC': '📐',
  };
  return map[status] || '❓';
}

/**
 * Get color-coded confidence descriptor.
 */
function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.9) return 'VERY HIGH';
  if (confidence >= 0.7) return 'HIGH';
  if (confidence >= 0.5) return 'MODERATE';
  if (confidence >= 0.3) return 'LOW';
  return 'VERY LOW';
}

/**
 * Format epistemic metadata for display.
 */
function formatEpistemicSection(epistemic: EpistemicMetadata | undefined): string {
  if (!epistemic) {
    return `
┌─ EPISTEMIC STATUS ─────────────────────────────────────────────────────────┐
│ ⚠️  NO EPISTEMIC METADATA - Treat as UNVERIFIED INFERENCE                   │
└─────────────────────────────────────────────────────────────────────────────┘`;
  }

  const confidenceBar = renderConfidenceBar(epistemic.confidence);
  const statusEmoji = getStatusEmoji(epistemic.status);
  const confidencePercent = (epistemic.confidence * 100).toFixed(0);
  const confidenceLevel = getConfidenceLevel(epistemic.confidence);

  let output = `
┌─ EPISTEMIC STATUS ─────────────────────────────────────────────────────────┐
│ ${statusEmoji} ${epistemic.status.padEnd(12)} | Confidence: ${confidenceBar} ${confidencePercent.padStart(3)}% (${confidenceLevel})`;

  // Add review warning if needed
  if (epistemic.requires_human_review) {
    output += `
├─ ⚠️  REQUIRES HUMAN REVIEW ──────────────────────────────────────────────────┤
│ ${epistemic.review_reason || 'No reason provided'}`;
  }

  // Add claim type
  output += `
├─ Claim Type: ${epistemic.claim_type}`;

  // Add evidence basis if available
  if (epistemic.evidence_basis) {
    const eb = epistemic.evidence_basis;
    output += `
├─ EVIDENCE BASIS ───────────────────────────────────────────────────────────┤
│ Sources consulted: ${eb.sources_consulted.length > 0 ? eb.sources_consulted.join(', ') : 'None'}
│ Cross-referenced: ${eb.cross_references_performed ? '✓ Yes' : '✗ NO - NOT CROSS-REFERENCED'}`;

    // Add sources not consulted (gaps)
    if (eb.sources_not_consulted && eb.sources_not_consulted.length > 0) {
      output += `
│ ⚠️  Sources NOT consulted: ${eb.sources_not_consulted.join(', ')}`;
    }

    // Add alternative explanations
    if (eb.alternative_explanations && eb.alternative_explanations.length > 0) {
      output += `
├─ ALTERNATIVE EXPLANATIONS CONSIDERED ──────────────────────────────────────┤`;
      for (const alt of eb.alternative_explanations) {
        const likelihood = (alt.likelihood * 100).toFixed(0);
        output += `
│ • ${alt.explanation} (${likelihood}% likely)${alt.investigated ? ' [investigated]' : ''}`;
      }
    } else {
      output += `
│ ⚠️  NO ALTERNATIVE EXPLANATIONS PROVIDED`;
    }
  }

  output += `
└─────────────────────────────────────────────────────────────────────────────┘`;

  return output;
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
    // Compact format with inline epistemic indicator
    const statusIndicator = s.epistemic
      ? `${getStatusEmoji(s.epistemic.status)} ${(s.epistemic.confidence * 100).toFixed(0)}%`
      : '❓ UNVERIFIED';

    content = `
═══ ${s.symbolId} (v${s.version}) ${statusIndicator} ═══
WHO: ${s.who} | WHAT: ${s.what}
WHY: ${s.why} | WHEN: ${s.when}
INTENT: "${s.commanders_intent}"
REQUIREMENTS: ${s.requirements.join('; ')}
${s.epistemic?.requires_human_review ? '⚠️  REQUIRES HUMAN REVIEW' : ''}
`.trim();
  } else {
    // Full format with complete epistemic section
    content = `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL: ${s.symbolId}
Version: ${s.version} | Hash: ${s.hash}
═══════════════════════════════════════════════════════════════════════════════
${formatEpistemicSection(s.epistemic)}

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
