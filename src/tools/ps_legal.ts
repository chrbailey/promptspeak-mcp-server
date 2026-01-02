// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - LEGAL CITATION TOOLS
// ═══════════════════════════════════════════════════════════════════════════
// MCP tools for legal citation verification and pre-flight checks:
// - ps_legal_verify: Verify a single citation via CourtListener
// - ps_legal_verify_batch: Verify multiple citations
// - ps_legal_check: Run full legal pre-flight check on content
// - ps_legal_config: Configure legal verification settings
// - ps_legal_stats: Get legal verification statistics
//
// ARCHITECTURE:
//   These tools integrate with:
//   - CitationValidator (format validation)
//   - CourtListenerCaseDatabase (existence verification)
//   - LegalPreFlightEvaluator (comprehensive checks)
//   - HoldManager (human-in-the-loop approval)
//
// ═══════════════════════════════════════════════════════════════════════════

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { LegalPreFlightResults } from '../types/index.js';
import {
  CitationValidator,
  InMemoryCourtDatabase,
  InMemoryCaseDatabase,
  CourtListenerCaseDatabase,
  createCourtListenerDatabase,
  LegalPreFlightEvaluator,
  createLegalPreFlight,
  extractCitations,
} from '../legal/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.legal-review');
const TOKEN_FILE = join(CONFIG_DIR, '.courtlistener-token');

function loadSavedToken(): string | undefined {
  try {
    if (existsSync(TOKEN_FILE)) {
      const token = readFileSync(TOKEN_FILE, 'utf-8').trim();
      if (token) return token;
    }
  } catch {
    // Ignore errors, token just won't be loaded
  }
  // Also check environment variable
  return process.env.COURTLISTENER_API_TOKEN;
}

function saveToken(token: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  } catch (error) {
    console.error('Warning: Could not save CourtListener token:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE STATE
// ─────────────────────────────────────────────────────────────────────────────

// Singleton instances
let citationValidator: CitationValidator;
let courtListenerDb: CourtListenerCaseDatabase | null = null;
let legalPreFlight: LegalPreFlightEvaluator;
let courtListenerEnabled = true;
let courtListenerApiToken: string | undefined = loadSavedToken();

// Initialize on first use
function initializeIfNeeded(): void {
  if (!citationValidator) {
    const courtDb = new InMemoryCourtDatabase();
    const caseDb = new InMemoryCaseDatabase();
    caseDb.seedTestData();
    citationValidator = new CitationValidator(courtDb, caseDb);
  }

  if (courtListenerEnabled && !courtListenerDb) {
    courtListenerDb = createCourtListenerDatabase({
      apiToken: courtListenerApiToken,
    });
  }

  if (!legalPreFlight) {
    legalPreFlight = createLegalPreFlight({
      enableCourtListenerVerification: courtListenerEnabled,
      courtListenerApiToken,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const legalToolDefinitions: Tool[] = [
  {
    name: 'ps_legal_verify',
    description: `Verify a legal citation using CourtListener's free citation lookup API.
Returns whether the citation exists in court records, along with case details if found.

LIMITATIONS:
- Only verifies case citations (not statutes, regulations)
- Rate limited to 55 requests/minute
- Does not verify that quoted holdings are accurate
- Does not check if case has been overruled (use Westlaw/Lexis for that)

A "verified" result means the case EXISTS - it does not validate the legal proposition.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        citation: {
          type: 'string',
          description: 'The legal citation to verify (e.g., "347 U.S. 483" or "Brown v. Board of Education, 347 U.S. 483 (1954)")',
        },
        includeDetails: {
          type: 'boolean',
          description: 'Include full case details from CourtListener (default: true)',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'ps_legal_verify_batch',
    description: `Verify multiple legal citations in a batch.
More efficient than individual calls. Returns verification status for each citation.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        citations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of legal citations to verify',
        },
      },
      required: ['citations'],
    },
  },
  {
    name: 'ps_legal_extract',
    description: `Extract legal citations from text content.
Returns an array of potential citations found in the text.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Text content to extract citations from',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_legal_check',
    description: `Run comprehensive legal pre-flight checks on content.
This is the full Legal MVP check that includes:
- Citation extraction and verification
- Privilege indicator detection
- Fabrication risk assessment
- Format validation

Returns LegalPreFlightResults suitable for hold decisions.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Legal content to check (brief, motion, memo, etc.)',
        },
        frame: {
          type: 'string',
          description: 'PromptSpeak frame (e.g., "◇▶α" for legal domain execute by primary agent)',
        },
        outputDestination: {
          type: 'string',
          enum: ['internal', 'client', 'opposing_counsel', 'court', 'public', 'unknown'],
          description: 'Where this content will be sent (affects privilege risk assessment)',
        },
        async: {
          type: 'boolean',
          description: 'Use async CourtListener verification (default: true)',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_legal_config',
    description: `Configure legal verification settings.
Control CourtListener integration, thresholds, and detection options.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'Get current config or set new config',
        },
        config: {
          type: 'object' as const,
          description: 'Configuration to set (only for action=set)',
          properties: {
            enableCourtListenerVerification: { type: 'boolean' },
            courtListenerApiToken: { type: 'string' },
            minVerificationConfidence: { type: 'number' },
            enablePrivilegeDetection: { type: 'boolean' },
            enableFabricationDetection: { type: 'boolean' },
            semanticEntropyThreshold: { type: 'number' },
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'ps_legal_stats',
    description: `Get legal verification statistics.
Returns API usage, cache stats, and verification success rates.`,
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a single citation.
 */
export async function handleLegalVerify(args: {
  citation: string;
  includeDetails?: boolean;
}): Promise<{
  citation: string;
  verified: boolean;
  source: 'courtlistener' | 'local_cache' | 'format_only';
  caseDetails?: {
    caseName: string;
    court: string;
    year: number;
    absoluteUrl?: string;
  };
  formatValidation: {
    valid: boolean;
    confidenceScore: number;
    issues: string[];
  };
  limitationNotice: string;
}> {
  initializeIfNeeded();

  // Run format validation
  const formatResult = citationValidator.validate(args.citation);
  const issues = [
    ...formatResult.structural.filter(r => !r.passed).map(r => r.message),
    ...formatResult.semantic.filter(r => !r.passed).map(r => r.message),
  ];

  // Try CourtListener verification
  let verified = false;
  let source: 'courtlistener' | 'local_cache' | 'format_only' = 'format_only';
  let caseDetails: {
    caseName: string;
    court: string;
    year: number;
    absoluteUrl?: string;
  } | undefined;

  if (courtListenerDb && courtListenerEnabled) {
    const result = await courtListenerDb.lookupByText(args.citation);
    if (result) {
      verified = true;
      source = 'courtlistener';
      if (args.includeDetails !== false) {
        caseDetails = {
          caseName: result.caseName,
          court: result.court,
          year: result.year,
        };
      }
    }
  }

  return {
    citation: args.citation,
    verified,
    source,
    caseDetails,
    formatValidation: {
      valid: formatResult.valid,
      confidenceScore: formatResult.confidenceScore,
      issues,
    },
    limitationNotice: citationValidator.getLimitationNotice(),
  };
}

/**
 * Verify multiple citations in batch.
 */
export async function handleLegalVerifyBatch(args: {
  citations: string[];
}): Promise<{
  results: Array<{
    citation: string;
    verified: boolean;
    valid: boolean;
    confidenceScore: number;
  }>;
  summary: {
    total: number;
    verified: number;
    unverified: number;
    formatValid: number;
    formatInvalid: number;
  };
  limitationNotice: string;
}> {
  initializeIfNeeded();

  const results: Array<{
    citation: string;
    verified: boolean;
    valid: boolean;
    confidenceScore: number;
  }> = [];

  let verifiedCount = 0;
  let formatValidCount = 0;

  for (const citation of args.citations) {
    // Format validation
    const formatResult = citationValidator.validate(citation);

    // CourtListener verification
    let verified = false;
    if (courtListenerDb && courtListenerEnabled) {
      const result = await courtListenerDb.lookupByText(citation);
      verified = result !== null;
    }

    if (verified) verifiedCount++;
    if (formatResult.valid) formatValidCount++;

    results.push({
      citation,
      verified,
      valid: formatResult.valid,
      confidenceScore: formatResult.confidenceScore,
    });
  }

  return {
    results,
    summary: {
      total: args.citations.length,
      verified: verifiedCount,
      unverified: args.citations.length - verifiedCount,
      formatValid: formatValidCount,
      formatInvalid: args.citations.length - formatValidCount,
    },
    limitationNotice: citationValidator.getLimitationNotice(),
  };
}

/**
 * Extract citations from content.
 */
export function handleLegalExtract(args: {
  content: string;
}): {
  citations: string[];
  count: number;
} {
  const citations = extractCitations(args.content);
  return {
    citations,
    count: citations.length,
  };
}

/**
 * Run full legal pre-flight check.
 */
export async function handleLegalCheck(args: {
  content: string;
  frame?: string;
  outputDestination?: 'internal' | 'client' | 'opposing_counsel' | 'court' | 'public' | 'unknown';
  async?: boolean;
}): Promise<{
  results: LegalPreFlightResults;
  shouldHold: boolean;
  holdReasons: string[];
  recommendations: string[];
}> {
  initializeIfNeeded();

  const frame = args.frame ?? '◇▶α'; // Default to legal domain
  const destination = args.outputDestination ?? 'unknown';

  // Run pre-flight check
  let results: LegalPreFlightResults;
  if (args.async !== false) {
    results = await legalPreFlight.check(args.content, frame, destination);
  } else {
    results = legalPreFlight.checkSync(args.content, frame, destination);
  }

  // Determine if hold is needed
  const holdReasons: string[] = [];
  const recommendations: string[] = [];

  // Check citation verification
  if (results.citationVerification) {
    const { unverifiedCitations, verificationScore } = results.citationVerification;
    if (unverifiedCitations.length > 0) {
      holdReasons.push(`${unverifiedCitations.length} unverified citation(s)`);
      recommendations.push('Verify citations through Westlaw, Lexis, or official court records');
    }
    if (verificationScore < 0.6) {
      holdReasons.push(`Low verification score: ${(verificationScore * 100).toFixed(0)}%`);
    }
  }

  // Check privilege risk
  if (results.privilegeCheck && results.privilegeCheck.riskScore > 0.5) {
    holdReasons.push(`Privilege risk detected (score: ${(results.privilegeCheck.riskScore * 100).toFixed(0)}%)`);
    recommendations.push('Review content for privileged information before distribution');

    if (destination === 'opposing_counsel' || destination === 'public') {
      holdReasons.push('CRITICAL: Content with privilege indicators destined for external party');
      recommendations.push('DO NOT SEND without attorney review');
    }
  }

  // Check fabrication risk
  if (results.fabricationCheck && results.fabricationCheck.overallScore > 0.6) {
    holdReasons.push(`Potential fabrication detected (score: ${(results.fabricationCheck.overallScore * 100).toFixed(0)}%)`);
    recommendations.push('Verify all factual claims and citations');

    if (results.fabricationCheck.flaggedContent.some(f => f.fabricationType === 'fabricated_citation')) {
      holdReasons.push('CRITICAL: Possible fabricated citation detected');
      recommendations.push('Rule 3.3 (Candor) violation risk - verify all citations');
    }
  }

  const shouldHold = holdReasons.length > 0;

  return {
    results,
    shouldHold,
    holdReasons,
    recommendations,
  };
}

/**
 * Configure legal verification.
 */
export function handleLegalConfig(args: {
  action: 'get' | 'set';
  config?: {
    enableCourtListenerVerification?: boolean;
    courtListenerApiToken?: string;
    minVerificationConfidence?: number;
    enablePrivilegeDetection?: boolean;
    enableFabricationDetection?: boolean;
    semanticEntropyThreshold?: number;
  };
}): {
  success: boolean;
  config: {
    enableCourtListenerVerification: boolean;
    hasApiToken: boolean;
    minVerificationConfidence: number;
    enablePrivilegeDetection: boolean;
    enableFabricationDetection: boolean;
    semanticEntropyThreshold: number;
  };
} {
  initializeIfNeeded();

  if (args.action === 'set' && args.config) {
    // Update module state
    if (args.config.enableCourtListenerVerification !== undefined) {
      courtListenerEnabled = args.config.enableCourtListenerVerification;

      if (courtListenerEnabled && !courtListenerDb) {
        courtListenerDb = createCourtListenerDatabase({
          apiToken: courtListenerApiToken,
        });
      }
    }

    if (args.config.courtListenerApiToken !== undefined) {
      courtListenerApiToken = args.config.courtListenerApiToken;

      // Save token for future sessions
      if (courtListenerApiToken) {
        saveToken(courtListenerApiToken);
      }

      if (courtListenerDb) {
        courtListenerDb.setConfig({ apiToken: courtListenerApiToken });
      }
    }

    // Update pre-flight config
    legalPreFlight.setConfig({
      enableCourtListenerVerification: args.config.enableCourtListenerVerification,
      courtListenerApiToken: args.config.courtListenerApiToken,
      minVerificationConfidence: args.config.minVerificationConfidence,
      enablePrivilegeDetection: args.config.enablePrivilegeDetection,
      enableFabricationDetection: args.config.enableFabricationDetection,
      semanticEntropyThreshold: args.config.semanticEntropyThreshold,
    });
  }

  const currentConfig = legalPreFlight.getConfig();

  return {
    success: true,
    config: {
      enableCourtListenerVerification: currentConfig.enableCourtListenerVerification,
      hasApiToken: !!currentConfig.courtListenerApiToken,
      minVerificationConfidence: currentConfig.minVerificationConfidence,
      enablePrivilegeDetection: currentConfig.enablePrivilegeDetection,
      enableFabricationDetection: currentConfig.enableFabricationDetection,
      semanticEntropyThreshold: currentConfig.semanticEntropyThreshold,
    },
  };
}

/**
 * Get legal verification statistics.
 */
export function handleLegalStats(): {
  courtListener: {
    enabled: boolean;
    stats: Record<string, unknown> | null;
  };
  citationCache: {
    enabled: boolean;
  };
} {
  initializeIfNeeded();

  return {
    courtListener: {
      enabled: courtListenerEnabled,
      stats: courtListenerDb?.getDetailedStats() ?? null,
    },
    citationCache: {
      enabled: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL ROUTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route tool calls to appropriate handlers.
 */
export async function handleLegalTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'ps_legal_verify':
      return handleLegalVerify(args as Parameters<typeof handleLegalVerify>[0]);

    case 'ps_legal_verify_batch':
      return handleLegalVerifyBatch(args as Parameters<typeof handleLegalVerifyBatch>[0]);

    case 'ps_legal_extract':
      return handleLegalExtract(args as Parameters<typeof handleLegalExtract>[0]);

    case 'ps_legal_check':
      return handleLegalCheck(args as Parameters<typeof handleLegalCheck>[0]);

    case 'ps_legal_config':
      return handleLegalConfig(args as Parameters<typeof handleLegalConfig>[0]);

    case 'ps_legal_stats':
      return handleLegalStats();

    default:
      throw new Error(`Unknown legal tool: ${toolName}`);
  }
}
