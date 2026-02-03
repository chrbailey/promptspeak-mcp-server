/**
 * Verification MCP Tools
 *
 * MCP tools for cross-LLM verification.
 */

import { getCrossLLMVerifier, type VerificationResult } from './cross-llm.js';
import { getDashboardGenerator, type DashboardFormat } from './dashboard.js';
import { mcpSuccess, mcpFailure } from '../core/result/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const VERIFICATION_TOOLS = [
  {
    name: 'ps_verify_cross_llm',
    description: 'Verify a PromptSpeak symbol using multiple LLM providers for consensus validation.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol_id: {
          type: 'string',
          description: 'The symbol ID to verify (e.g., XI.INTENT.MISSION_001)',
        },
        symbol_type: {
          type: 'string',
          description: 'The type of symbol (e.g., INTENT, AGENT, MISSION)',
        },
        symbol_data: {
          type: 'object',
          description: 'The symbol data to verify',
          additionalProperties: true,
        },
      },
      required: ['symbol_id', 'symbol_type', 'symbol_data'],
    },
  },
  {
    name: 'ps_verify_status',
    description: 'Get the status of cross-LLM verification (available providers, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ps_verify_dashboard',
    description: 'Generate a formatted dashboard from cross-LLM verification results. Supports HTML, Markdown, and JSON formats.',
    inputSchema: {
      type: 'object',
      properties: {
        verification_result: {
          type: 'object',
          description: 'The verification result from ps_verify_cross_llm',
          properties: {
            verified: { type: 'boolean' },
            confidenceScore: { type: 'number' },
            consensusCount: { type: 'number' },
            totalProviders: { type: 'number' },
            responses: { type: 'array' },
            discrepancies: { type: 'array' },
            needsHumanReview: { type: 'boolean' },
            durationMs: { type: 'number' },
          },
          required: ['verified', 'confidenceScore', 'consensusCount', 'totalProviders', 'responses', 'discrepancies', 'needsHumanReview', 'durationMs'],
        },
        format: {
          type: 'string',
          enum: ['html', 'markdown', 'json'],
          description: 'Output format (default: markdown)',
        },
        title: {
          type: 'string',
          description: 'Custom title for the dashboard (optional)',
        },
        include_raw_responses: {
          type: 'boolean',
          description: 'Include raw response data in JSON output (optional)',
        },
      },
      required: ['verification_result'],
    },
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleVerifyCrossLLM(args: {
  symbol_id: string;
  symbol_type: string;
  symbol_data: Record<string, unknown>;
}): Promise<CallToolResult> {
  const verifier = getCrossLLMVerifier();

  if (!verifier.isAvailable()) {
    return mcpFailure(
      'NO_PROVIDERS',
      'Cross-LLM verification not available. Configure ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.'
    );
  }

  const result = await verifier.verify(
    args.symbol_id,
    args.symbol_type,
    args.symbol_data
  );

  if (!result.success) {
    return mcpFailure(result.error.code, result.error.message);
  }

  const verification = result.data;

  return mcpSuccess({
    verified: verification.verified,
    confidence_score: verification.confidenceScore,
    consensus: {
      count: verification.consensusCount,
      total: verification.totalProviders,
    },
    needs_human_review: verification.needsHumanReview,
    discrepancies: verification.discrepancies.map(d => ({
      field: d.field,
      severity: d.severity,
      description: d.description,
    })),
    provider_results: verification.responses.map(r => ({
      provider: r.provider,
      model: r.model,
      confidence: r.analysis.confidence,
      latency_ms: r.latencyMs,
      error: r.error,
    })),
    duration_ms: verification.durationMs,
  });
}

export async function handleVerifyStatus(): Promise<CallToolResult> {
  const verifier = getCrossLLMVerifier();

  return mcpSuccess({
    available: verifier.isAvailable(),
    providers: verifier.getProviders(),
    message: verifier.isAvailable()
      ? `Cross-LLM verification available with ${verifier.getProviders().length} provider(s)`
      : 'No LLM providers configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.',
  });
}

export async function handleVerifyDashboard(args: {
  verification_result: VerificationResult;
  format?: DashboardFormat;
  title?: string;
  include_raw_responses?: boolean;
}): Promise<CallToolResult> {
  const dashboard = getDashboardGenerator();

  try {
    const output = dashboard.generate(args.verification_result, {
      format: args.format || 'markdown',
      title: args.title,
      includeRawResponses: args.include_raw_responses,
    });

    return mcpSuccess({
      format: output.format,
      content: output.content,
      generated_at: output.generatedAt,
    });
  } catch (error) {
    return mcpFailure(
      'DASHBOARD_ERROR',
      `Failed to generate dashboard: ${(error as Error).message}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════════

export async function dispatchVerificationTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult | null> {
  switch (toolName) {
    case 'ps_verify_cross_llm':
      return handleVerifyCrossLLM(args as Parameters<typeof handleVerifyCrossLLM>[0]);

    case 'ps_verify_status':
      return handleVerifyStatus();

    case 'ps_verify_dashboard':
      return handleVerifyDashboard(args as Parameters<typeof handleVerifyDashboard>[0]);

    default:
      return null;
  }
}
