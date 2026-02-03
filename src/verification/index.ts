/**
 * Verification Module
 *
 * Cross-LLM verification for PromptSpeak symbol analysis.
 */

export {
  CrossLLMVerifier,
  getCrossLLMVerifier,
  createCrossLLMVerifier,
  resetCrossLLMVerifier,
} from './cross-llm.js';

export type {
  LLMProvider,
  LLMProviderConfig,
  VerificationConfig,
  SymbolAnalysis,
  ProviderResponse,
  VerificationResult,
  Discrepancy,
} from './cross-llm.js';

// Dashboard
export {
  DashboardGenerator,
  getDashboardGenerator,
  createDashboardGenerator,
} from './dashboard.js';

export type {
  DashboardFormat,
  DashboardOptions,
  DashboardOutput,
  ConsensusSummary,
  ProviderSummary,
  DiscrepancySummary,
  ConfidenceBreakdown,
  LatencyBreakdown,
} from './dashboard.js';

// MCP Tools
export {
  VERIFICATION_TOOLS,
  handleVerifyCrossLLM,
  handleVerifyStatus,
  handleVerifyDashboard,
  dispatchVerificationTool,
} from './tools.js';
