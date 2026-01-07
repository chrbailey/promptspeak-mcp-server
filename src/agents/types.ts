/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Core Types
 *
 * This module defines the type system for the agent orchestration layer,
 * including agent definitions, instances, proposals, and lifecycle management.
 */

import type { SymbolCategory } from '../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Capabilities that agents can request for their operations.
 * Each capability grants specific permissions to the agent.
 */
export type AgentCapability =
  | 'web_scraping'        // Fetch and parse web content
  | 'api_rest'            // Make REST API calls
  | 'api_graphql'         // Make GraphQL queries
  | 'api_soap'            // Make SOAP web service calls
  | 'auth_oauth2'         // OAuth2 authentication flow
  | 'auth_api_key'        // API key authentication
  | 'auth_bearer'         // Bearer token authentication
  | 'auth_basic'          // Basic authentication
  | 'file_read'           // Read local files
  | 'file_write'          // Write local files
  | 'database_read'       // Query databases
  | 'database_write'      // Modify databases
  | 'symbol_create'       // Create symbols in registry
  | 'symbol_update'       // Update existing symbols
  | 'symbol_delete'       // Delete symbols
  | 'delegation_spawn'    // Can spawn child agents
  | 'external_service'    // Call external services
  | 'llm_inference';      // Make LLM API calls

// ═══════════════════════════════════════════════════════════════════════════════
// DATA SOURCE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classification of data source types.
 */
export type DataSourceType =
  | 'rest_api'
  | 'graphql'
  | 'soap'
  | 'web_page'
  | 'rss_feed'
  | 'file'
  | 'database'
  | 'github'
  | 'huggingface';

/**
 * Authentication configuration for a data source.
 */
export interface DataSourceAuth {
  type: 'none' | 'api_key' | 'oauth2' | 'bearer' | 'basic';
  /** Reference to credential in secure storage (never the actual secret) */
  credentialRef?: string;
  /** Header name for API key (e.g., 'X-Api-Key') */
  headerName?: string;
  /** OAuth2 specific config */
  oauth2Config?: {
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };
}

/**
 * Rate limiting configuration for a data source.
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  /** Minimum delay between requests in ms */
  minDelayMs?: number;
}

/**
 * Specification for a data source that an agent will access.
 */
export interface DataSourceSpec {
  /** Unique identifier for this source */
  id: string;
  /** Human-readable name */
  name: string;
  /** Source type classification */
  type: DataSourceType;
  /** Base URL or connection string */
  endpoint: string;
  /** Authentication requirements */
  auth?: DataSourceAuth;
  /** Rate limiting from source */
  rateLimit?: RateLimitConfig;
  /** Whether to respect robots.txt (for web scraping) */
  respectRobotsTxt?: boolean;
  /** Schema or structure hint for parsing */
  schema?: Record<string, unknown>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resource limit configuration for agent execution.
 * These limits are enforced by the AgentRegistry.
 */
export interface AgentResourceLimits {
  /** Maximum requests per minute to external APIs */
  rateLimitPerMinute: number;
  /** Maximum tokens (LLM) per execution session */
  tokenBudget: number;
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Maximum memory usage in MB */
  maxMemoryMb: number;
  /** Maximum concurrent operations */
  maxConcurrency: number;
  /** Maximum retry attempts for failed operations */
  maxRetries: number;
  /** Base backoff delay for retries in ms */
  retryBackoffMs: number;
  /** Maximum symbols this agent can create */
  maxSymbolsCreated?: number;
}

/**
 * Default resource limits for agents.
 */
export const DEFAULT_RESOURCE_LIMITS: AgentResourceLimits = {
  rateLimitPerMinute: 60,
  tokenBudget: 50000,
  timeoutMs: 300000, // 5 minutes
  maxMemoryMb: 512,
  maxConcurrency: 5,
  maxRetries: 3,
  retryBackoffMs: 1000,
  maxSymbolsCreated: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUCCESS CRITERIA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Success criteria for agent completion validation.
 */
export interface AgentSuccessCriteria {
  /** Required symbol patterns that must be created (supports wildcards) */
  requiredSymbolPatterns?: string[];
  /** Minimum number of symbols to create */
  minSymbolsCreated?: number;
  /** Maximum data age in hours (for freshness validation) */
  maxDataAgeHours?: number;
  /** Minimum confidence score for extracted data */
  minConfidenceScore?: number;
  /** Minimum field coverage percentage (0-1) */
  minFieldCoverage?: number;
  /** Custom validation function name */
  customValidator?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent dependency specification.
 */
export interface AgentDependency {
  /** ID of dependent agent definition */
  agentDefinitionId: string;
  /** Required output symbol patterns from dependency */
  requiredSymbolPatterns?: string[];
  /** Whether dependency must complete successfully */
  required: boolean;
  /** Maximum wait time for dependency (ms) */
  timeoutMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPECTED OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expected output symbol specification.
 */
export interface ExpectedOutputSymbol {
  /** Symbol ID pattern (supports wildcards like Ξ.C.GOV.*) */
  pattern: string;
  /** Symbol category */
  category: SymbolCategory;
  /** Whether this output is required or optional */
  required: boolean;
  /** Description of what this symbol represents */
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent category for organization.
 */
export type AgentCategory =
  | 'data_acquisition'  // Fetches data from external sources
  | 'data_processing'   // Transforms and processes data
  | 'analysis'          // Analyzes data and generates insights
  | 'monitoring'        // Monitors sources for changes
  | 'integration';      // Integrates with external systems

/**
 * Risk level assessment for an agent.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Complete Agent Definition Schema.
 * Defines what an agent is, what it can do, and its constraints.
 */
export interface AgentDefinition {
  // === IDENTITY ===
  /** Unique agent definition identifier (e.g., "agent.usaspending-fetcher") */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Version string (semver) */
  version: string;
  /** Detailed purpose description */
  purpose: string;
  /** Agent category for organization */
  category: AgentCategory;

  // === DATA SOURCES ===
  /** Target data sources this agent accesses */
  dataSources: DataSourceSpec[];

  // === CAPABILITIES ===
  /** Required capabilities */
  requiredCapabilities: AgentCapability[];
  /** Optional capabilities (nice to have) */
  optionalCapabilities?: AgentCapability[];

  // === OUTPUTS ===
  /** Expected output symbol patterns */
  expectedOutputSymbols: ExpectedOutputSymbol[];

  // === RESOURCE LIMITS ===
  /** Resource constraints */
  resourceLimits: AgentResourceLimits;

  // === SUCCESS CRITERIA ===
  /** How to determine if agent succeeded */
  successCriteria: AgentSuccessCriteria;

  // === DEPENDENCIES ===
  /** Other agent definitions this depends on */
  dependencies?: AgentDependency[];

  // === GOVERNANCE ===
  /** PromptSpeak frame for agent governance */
  governingFrame: string;
  /** Risk level assessment */
  riskLevel: RiskLevel;
  /** Requires human approval before spawning */
  requiresApproval: boolean;
  /** Namespace isolation (agents can only see symbols in their namespace) */
  namespace?: string;

  // === METADATA ===
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Created by (user/system) */
  createdBy: string;
  /** Tags for filtering */
  tags?: string[];
  /** Template this was created from */
  templateId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent instance status.
 */
export type AgentStatus =
  | 'proposed'          // Proposal created, not yet approved
  | 'pending_approval'  // Awaiting human approval
  | 'approved'          // Approved but not yet started
  | 'spawning'          // Being instantiated
  | 'running'           // Actively executing
  | 'paused'            // Temporarily paused
  | 'reporting'         // Completed, aggregating results
  | 'completed'         // Successfully finished
  | 'failed'            // Encountered unrecoverable error
  | 'abandoned'         // Rejected or timed out
  | 'archived';         // Completed and archived

/**
 * Agent execution scope - defines what an agent can access.
 */
export interface AgentScope {
  /** Allowed symbol patterns (supports wildcards) */
  allowedSymbolPatterns: string[];
  /** Denied symbol patterns (takes precedence) */
  deniedSymbolPatterns: string[];
  /** Allowed MCP tools */
  allowedTools: string[];
  /** Denied MCP tools (takes precedence) */
  deniedTools: string[];
  /** Namespace isolation */
  namespace: string;
  /** Parent agent instance ID (for delegation chain) */
  parentInstanceId?: string;
  /** Maximum delegation depth */
  maxDelegationDepth: number;
}

/**
 * Resource usage tracking for an agent instance.
 */
export interface AgentResourceUsage {
  /** Number of API calls made */
  apiCallsMade: number;
  /** Number of tokens used (LLM) */
  tokensUsed: number;
  /** Total execution time in ms */
  executionTimeMs: number;
  /** Symbols created by this agent */
  symbolsCreated: string[];
  /** Symbols updated by this agent */
  symbolsUpdated: string[];
  /** Symbols deleted by this agent */
  symbolsDeleted: string[];
}

/**
 * Performance metrics for an agent instance.
 */
export interface AgentMetrics {
  /** Success rate (0-1) */
  successRate: number;
  /** Average latency per operation in ms */
  avgLatencyMs: number;
  /** Total error count */
  errorCount: number;
  /** Last error message */
  lastError?: string;
  /** Last error timestamp */
  lastErrorAt?: string;
}

/**
 * Agent instance represents a running or completed agent.
 */
export interface AgentInstance {
  // === IDENTITY ===
  /** Unique instance identifier */
  instanceId: string;
  /** Reference to agent definition */
  definitionId: string;
  /** Campaign this instance belongs to */
  campaignId?: string;

  // === STATE ===
  /** Current status */
  status: AgentStatus;
  /** Human-readable status message */
  statusMessage?: string;

  // === SCOPE ===
  /** Execution scope */
  scope: AgentScope;

  // === RESOURCE TRACKING ===
  /** Resource usage */
  resourceUsage: AgentResourceUsage;

  // === LIFECYCLE ===
  /** When instance was created */
  createdAt: string;
  /** When instance started executing */
  startedAt?: string;
  /** When instance completed */
  completedAt?: string;
  /** Who approved this instance */
  approvedBy?: string;
  /** When it was approved */
  approvedAt?: string;

  // === APPROVAL ===
  /** Hold ID if pending approval */
  holdId?: string;
  /** Proposal ID if created from proposal */
  proposalId?: string;

  // === DELEGATION ===
  /** Delegation ID from ps_delegate */
  delegationId?: string;
  /** Delegation chain (parent instance IDs) */
  delegationChain: string[];

  // === METRICS ===
  /** Performance metrics */
  metrics: AgentMetrics;

  // === GOVERNANCE ===
  /** PromptSpeak frame governing this instance */
  governingFrame: string;

  // === CONTROL ===
  /** Whether agent is enabled */
  enabled: boolean;
  /** Reason if paused */
  pausedReason?: string;

  // === RESULTS ===
  /** Final result summary */
  resultSummary?: string;
  /** Error details if failed */
  errorDetails?: {
    code: string;
    message: string;
    stack?: string;
    retryable: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Campaign status.
 */
export type CampaignStatus =
  | 'active'     // Currently running
  | 'paused'     // Temporarily paused
  | 'completed'  // All agents finished
  | 'failed'     // Critical failure
  | 'aborted';   // Manually aborted

/**
 * Scope constraints for a campaign.
 */
export interface CampaignScopeConstraints {
  /** Allowed data source types */
  allowedSourceTypes?: DataSourceType[];
  /** Date range for data */
  dateRange?: {
    start: string;
    end: string;
  };
  /** Geographic constraints */
  geographies?: string[];
  /** Maximum concurrent agents */
  maxConcurrentAgents?: number;
  /** Maximum total agents */
  maxTotalAgents?: number;
  /** Token budget for entire campaign */
  campaignTokenBudget?: number;
}

/**
 * Acquisition campaign for a topic.
 */
export interface AcquisitionCampaign {
  /** Unique campaign identifier */
  campaignId: string;
  /** Topic being researched */
  topic: string;
  /** Current status */
  status: CampaignStatus;
  /** Scope constraints */
  scopeConstraints: CampaignScopeConstraints;
  /** Priority level */
  priority: 'low' | 'medium' | 'high';
  /** Who created the campaign */
  createdBy: string;
  /** When campaign was created */
  createdAt: string;
  /** When campaign was last updated */
  updatedAt?: string;
  /** When campaign completed */
  completedAt?: string;

  // === METRICS ===
  /** Total agents spawned */
  agentsSpawned: number;
  /** Agents completed successfully */
  agentsCompleted: number;
  /** Agents failed */
  agentsFailed: number;
  /** Total symbols created */
  symbolsCreated: number;

  // === CIRCUIT BREAKER ===
  /** Circuit breaker state */
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Last failure time */
  lastFailureAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Risk assessment for an agent proposal.
 */
export interface AgentRiskAssessment {
  /** Overall risk score (0-1) */
  overallRiskScore: number;

  /** Risk by category */
  categoryRisks: {
    dataAccess: { score: number; factors: string[] };
    externalCalls: { score: number; factors: string[] };
    resourceUsage: { score: number; factors: string[] };
    symbolCreation: { score: number; factors: string[] };
    privilegeLevel: { score: number; factors: string[] };
  };

  /** Specific concerns flagged */
  concerns: string[];

  /** Mitigations in place */
  mitigations: string[];

  /** Recommended approval level */
  recommendedApprovalLevel: 'auto' | 'human' | 'elevated';
}

/**
 * Resource usage estimate for an agent.
 */
export interface ResourceEstimate {
  apiCalls: { min: number; max: number; typical: number };
  tokenUsage: { min: number; max: number; typical: number };
  executionTime: { min: number; max: number; typical: number };
  symbolsCreated: { min: number; max: number; typical: number };
}

/**
 * Justification for why an agent is needed.
 */
export interface ProposalJustification {
  /** What triggered this proposal */
  trigger: 'new_data_source' | 'user_request' | 'scheduled' | 'dependency' | 'system';
  /** Detailed explanation */
  explanation: string;
  /** Expected business value */
  businessValue: string;
  /** Alternative approaches considered */
  alternatives?: string[];
}

/**
 * Agent proposal for human approval.
 */
export interface AgentProposal {
  /** Unique proposal ID */
  proposalId: string;

  /** The agent definition being proposed */
  agentDefinition: AgentDefinition;

  /** Campaign this proposal belongs to */
  campaignId?: string;

  /** Justification for the proposal */
  justification: ProposalJustification;

  /** Risk assessment */
  riskAssessment: AgentRiskAssessment;

  /** Resource estimates */
  resourceEstimate: ResourceEstimate;

  /** Summary of data access */
  dataAccessSummary: {
    dataAccessed: string[];
    dataModified: string[];
    symbolsCreated: string[];
    externalServices: string[];
  };

  /** Current state */
  state: 'pending' | 'approved' | 'rejected' | 'expired';

  /** When proposal was created */
  createdAt: string;

  /** When proposal expires */
  expiresAt: string;

  /** Hold ID for approval workflow */
  holdId?: string;

  /** Decision details if decided */
  decision?: {
    decidedBy: string;
    decidedAt: string;
    reason: string;
    modifiedConfig?: Partial<AgentDefinition>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK NOTIFICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Webhook notification channel type.
 */
export type WebhookChannelType = 'slack' | 'discord' | 'email' | 'custom';

/**
 * Webhook channel configuration.
 */
export interface WebhookChannel {
  type: WebhookChannelType;
  name: string;
  enabled: boolean;
  webhookUrl?: string;
  email?: {
    to: string[];
    from: string;
    smtpConfig?: Record<string, unknown>;
  };
}

/**
 * Webhook payload for agent approval requests.
 */
export interface AgentApprovalWebhookPayload {
  type: 'agent_approval_request';
  proposalId: string;
  agent: {
    name: string;
    purpose: string;
    riskLevel: RiskLevel;
    riskScore: number;
  };
  dataSources: string[];
  estimatedResources: {
    apiCalls: string;
    timeout: string;
  };
  expiresAt: string;
  approveUrl: string;
  rejectUrl: string;
}
