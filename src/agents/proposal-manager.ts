/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Proposal Manager
 *
 * Manages the lifecycle of agent proposals, from creation through approval/rejection.
 * Integrates with the HoldManager for human-in-the-loop approval and the
 * WebhookDispatcher for external notifications.
 */

import type {
  AgentProposal,
  AgentDefinition,
  AgentRiskAssessment,
  ResourceEstimate,
  DataSourceSpec,
  AgentInstance,
  ProposalJustification,
  RiskLevel,
  AgentCapability,
} from './types.js';
import { DEFAULT_RESOURCE_LIMITS } from './types.js';
import { getAgentRegistry } from './registry.js';
import { getWebhookDispatcher } from '../notifications/webhook-dispatcher.js';
import {
  recordAgentAuditEvent,
  createProposal as dbCreateProposal,
  getProposal as dbGetProposal,
  getProposalByHoldId as dbGetProposalByHoldId,
  updateProposalState as dbUpdateProposalState,
  listProposals as dbListProposals,
  loadAllProposals as dbLoadAllProposals,
  deleteExpiredProposals as dbDeleteExpiredProposals,
} from './database.js';
import { getTemplateForSourceType } from './templates/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HOLD MANAGER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

// Import the hold manager types and functions
// These would come from the existing gatekeeper/hold-manager.ts
interface HoldRequest {
  holdId: string;
  agentId: string;
  frame: string;
  tool: string;
  arguments: Record<string, unknown>;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

interface HoldManager {
  createHold(
    request: {
      agentId: string;
      frame: string;
      tool: string;
      arguments: Record<string, unknown>;
    },
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata: Record<string, unknown>
  ): HoldRequest;

  getHold(holdId: string): HoldRequest | null;
  approveHold(holdId: string, approvedBy: string, reason?: string): boolean;
  rejectHold(holdId: string, rejectedBy: string, reason: string): boolean;
}

// We'll get this from the actual module when integrating
let holdManager: HoldManager | null = null;

export function setHoldManager(manager: HoldManager): void {
  holdManager = manager;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

function generateProposalId(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentProposalManager {
  // In-memory cache for fast access (DB is source of truth)
  private proposals: Map<string, AgentProposal> = new Map();
  private proposalsByHold: Map<string, string> = new Map(); // holdId -> proposalId
  private initialized: boolean = false;

  /**
   * Load proposals from the database into memory cache.
   * Should be called on initialization.
   */
  loadFromDatabase(): void {
    if (this.initialized) return;

    try {
      const proposals = dbLoadAllProposals();
      for (const proposal of proposals) {
        this.proposals.set(proposal.proposalId, proposal);
        if (proposal.holdId) {
          this.proposalsByHold.set(proposal.holdId, proposal.proposalId);
        }
      }
      this.initialized = true;
      console.log(`Loaded ${proposals.length} proposals from database`);
    } catch (error) {
      // Database may not be initialized yet, that's okay
      console.warn('Could not load proposals from database:', error);
    }
  }

  /**
   * Sync a proposal to both the in-memory cache and database.
   */
  private syncToDatabase(proposal: AgentProposal): void {
    // Update in-memory cache
    this.proposals.set(proposal.proposalId, proposal);
    if (proposal.holdId) {
      this.proposalsByHold.set(proposal.holdId, proposal.proposalId);
    }

    // Persist to database
    try {
      // Check if proposal exists in DB
      const existing = dbGetProposal(proposal.proposalId);
      if (existing) {
        // Update existing
        dbUpdateProposalState(proposal.proposalId, proposal.state, {
          holdId: proposal.holdId,
          decision: proposal.decision,
          approvedBy: proposal.decision?.decidedBy,
          approvedAt: proposal.decision?.decidedAt,
          rejectionReason: proposal.state === 'rejected' ? proposal.decision?.reason : undefined,
        });
      } else {
        // Insert new
        dbCreateProposal(proposal);
      }
    } catch (error) {
      console.error('Failed to sync proposal to database:', error);
    }
  }

  /**
   * Generate a proposal for a new agent based on a data source.
   */
  async generateProposal(
    trigger: ProposalJustification['trigger'],
    dataSource: DataSourceSpec,
    context: {
      campaignId?: string;
      requestedBy?: string;
      parentAgentId?: string;
    } = {}
  ): Promise<AgentProposal> {
    // 1. Select appropriate template
    const template = getTemplateForSourceType(dataSource.type);
    if (!template) {
      throw new Error(`No template available for source type: ${dataSource.type}`);
    }

    // 2. Generate agent definition from template
    const agentDefinition = this.generateAgentDefinition(template, dataSource, context);

    // 3. Assess risk
    const riskAssessment = this.assessRisk(agentDefinition);

    // 4. Estimate resources
    const resourceEstimate = this.estimateResources(agentDefinition);

    // 5. Build justification
    const justification: ProposalJustification = {
      trigger,
      explanation: this.generateExplanation(trigger, dataSource),
      businessValue: this.assessBusinessValue(dataSource),
      alternatives: this.suggestAlternatives(dataSource),
    };

    // 6. Create proposal
    const proposal: AgentProposal = {
      proposalId: generateProposalId(),
      agentDefinition,
      campaignId: context.campaignId,
      justification,
      riskAssessment,
      resourceEstimate,
      dataAccessSummary: this.summarizeDataAccess(agentDefinition),
      state: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    // 7. Store proposal (both in-memory and database)
    this.syncToDatabase(proposal);

    // 8. Queue for approval if required
    if (agentDefinition.requiresApproval || riskAssessment.recommendedApprovalLevel !== 'auto') {
      await this.queueForApproval(proposal);
    } else {
      // Auto-approve low-risk agents
      proposal.state = 'approved';
      proposal.decision = {
        decidedBy: 'system',
        decidedAt: new Date().toISOString(),
        reason: 'Auto-approved: Low risk agent',
      };
      // Update database with approved state
      this.syncToDatabase(proposal);
    }

    // 9. Audit
    recordAgentAuditEvent({
      eventType: 'PROPOSAL_CREATED',
      proposalId: proposal.proposalId,
      agentId: agentDefinition.agentId,
      campaignId: context.campaignId,
      operatorId: context.requestedBy,
      details: {
        trigger,
        riskLevel: riskAssessment.overallRiskScore,
        autoApproved: proposal.state === 'approved',
      },
    });

    return proposal;
  }

  /**
   * Generate an agent definition from a template and data source.
   */
  private generateAgentDefinition(
    template: ReturnType<typeof getTemplateForSourceType>,
    dataSource: DataSourceSpec,
    context: { campaignId?: string; requestedBy?: string }
  ): AgentDefinition {
    if (!template) {
      throw new Error('Template is required');
    }

    // Merge template base with source-specific config
    const sourceConfig = template.configureForSource(dataSource);

    // Generate unique agent ID
    const sanitizedSourceId = dataSource.id
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 30);
    const agentId = `agent.${template.templateId.replace('template.', '')}.${sanitizedSourceId}`;

    // Build the definition
    const definition: AgentDefinition = {
      agentId,
      name: `${template.name} - ${dataSource.name}`,
      version: '1.0.0',
      purpose: `Fetch and process data from ${dataSource.name} (${dataSource.type})`,
      category: template.baseDefinition.category || 'data_acquisition',
      dataSources: sourceConfig.dataSources || [dataSource],
      requiredCapabilities: [
        ...(template.baseDefinition.requiredCapabilities || []),
        ...(sourceConfig.requiredCapabilities || []),
      ],
      optionalCapabilities: template.baseDefinition.optionalCapabilities,
      expectedOutputSymbols: sourceConfig.expectedOutputSymbols || [
        {
          pattern: `Ξ.*.${sanitizedSourceId}.*`,
          category: 'KNOWLEDGE',
          required: true,
          description: `Data extracted from ${dataSource.name}`,
        },
      ],
      resourceLimits: {
        ...DEFAULT_RESOURCE_LIMITS,
        ...template.baseDefinition.resourceLimits,
      },
      successCriteria: {
        minSymbolsCreated: 1,
        maxDataAgeHours: 24,
      },
      dependencies: [],
      governingFrame: sourceConfig.governingFrame || template.baseDefinition.governingFrame || '⊕◊▶β',
      riskLevel: template.baseDefinition.riskLevel || 'medium',
      requiresApproval: template.baseDefinition.requiresApproval !== false,
      namespace: context.campaignId || 'default',
      createdAt: new Date().toISOString(),
      createdBy: context.requestedBy || 'system',
      tags: [dataSource.type, template.templateId],
      templateId: template.templateId,
    };

    return definition;
  }

  /**
   * Assess the risk of an agent definition.
   */
  private assessRisk(definition: AgentDefinition): AgentRiskAssessment {
    const categoryRisks = {
      dataAccess: this.assessDataAccessRisk(definition),
      externalCalls: this.assessExternalCallsRisk(definition),
      resourceUsage: this.assessResourceUsageRisk(definition),
      symbolCreation: this.assessSymbolCreationRisk(definition),
      privilegeLevel: this.assessPrivilegeLevelRisk(definition),
    };

    // Calculate weighted overall score
    const weights = {
      dataAccess: 0.25,
      externalCalls: 0.20,
      resourceUsage: 0.15,
      symbolCreation: 0.20,
      privilegeLevel: 0.20,
    };

    const overallRiskScore = Object.entries(categoryRisks).reduce(
      (sum, [key, value]) => sum + value.score * weights[key as keyof typeof weights],
      0
    );

    // Collect concerns
    const concerns: string[] = [];
    Object.values(categoryRisks).forEach(cat => {
      if (cat.score >= 0.7) {
        concerns.push(...cat.factors);
      }
    });

    // Identify mitigations
    const mitigations = this.identifyMitigations(definition, categoryRisks);

    // Determine approval level
    let recommendedApprovalLevel: 'auto' | 'human' | 'elevated';
    if (overallRiskScore >= 0.7 || definition.riskLevel === 'critical') {
      recommendedApprovalLevel = 'elevated';
    } else if (overallRiskScore >= 0.3 || definition.requiresApproval) {
      recommendedApprovalLevel = 'human';
    } else {
      recommendedApprovalLevel = 'auto';
    }

    return {
      overallRiskScore,
      categoryRisks,
      concerns,
      mitigations,
      recommendedApprovalLevel,
    };
  }

  private assessDataAccessRisk(definition: AgentDefinition): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    // Check authentication requirements
    for (const source of definition.dataSources) {
      if (source.auth?.type === 'oauth2') {
        score += 0.3;
        factors.push(`OAuth2 authentication required for ${source.name}`);
      }
      if (source.auth?.type === 'api_key' && source.auth.credentialRef) {
        score += 0.1;
        factors.push(`API key required for ${source.name}`);
      }
    }

    // Check if accessing sensitive endpoints
    const sensitivePatterns = ['/admin', '/internal', '/private', 'gov', 'mil'];
    for (const source of definition.dataSources) {
      if (sensitivePatterns.some(p => source.endpoint.toLowerCase().includes(p))) {
        score += 0.2;
        factors.push(`Potentially sensitive endpoint: ${source.endpoint}`);
      }
    }

    return { score: Math.min(score, 1), factors };
  }

  private assessExternalCallsRisk(definition: AgentDefinition): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    const sourcesCount = definition.dataSources.length;
    if (sourcesCount > 3) {
      score += 0.3;
      factors.push(`Multiple external sources (${sourcesCount})`);
    }

    // Check rate limits
    for (const source of definition.dataSources) {
      if (source.rateLimit && source.rateLimit.requestsPerMinute > 100) {
        score += 0.2;
        factors.push(`High rate limit requested for ${source.name}`);
      }
    }

    // Web scraping is higher risk
    if (definition.requiredCapabilities.includes('web_scraping')) {
      score += 0.3;
      factors.push('Web scraping capability requested');
    }

    return { score: Math.min(score, 1), factors };
  }

  private assessResourceUsageRisk(definition: AgentDefinition): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    const limits = definition.resourceLimits;

    if (limits.tokenBudget > 100000) {
      score += 0.3;
      factors.push(`High token budget (${limits.tokenBudget})`);
    }

    if (limits.timeoutMs > 600000) { // 10 minutes
      score += 0.2;
      factors.push(`Long timeout (${limits.timeoutMs / 60000} minutes)`);
    }

    if (limits.maxConcurrency > 10) {
      score += 0.2;
      factors.push(`High concurrency (${limits.maxConcurrency})`);
    }

    return { score: Math.min(score, 1), factors };
  }

  private assessSymbolCreationRisk(definition: AgentDefinition): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    // Check if can create symbols in multiple categories
    const categories = new Set(definition.expectedOutputSymbols.map(s => s.category));
    if (categories.size > 3) {
      score += 0.3;
      factors.push(`Creates symbols in ${categories.size} categories`);
    }

    // Check for wildcard patterns
    const hasWildcards = definition.expectedOutputSymbols.some(s => s.pattern.includes('*'));
    if (hasWildcards) {
      score += 0.2;
      factors.push('Uses wildcard symbol patterns');
    }

    // Check deletion capability
    if (definition.requiredCapabilities.includes('symbol_delete')) {
      score += 0.4;
      factors.push('Can delete symbols');
    }

    return { score: Math.min(score, 1), factors };
  }

  private assessPrivilegeLevelRisk(definition: AgentDefinition): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0;

    const highPrivilegeCapabilities: AgentCapability[] = [
      'delegation_spawn',
      'database_write',
      'file_write',
    ];

    for (const cap of highPrivilegeCapabilities) {
      if (definition.requiredCapabilities.includes(cap)) {
        score += 0.3;
        factors.push(`Requires ${cap} capability`);
      }
    }

    // LLM inference allows agent to make decisions
    if (definition.requiredCapabilities.includes('llm_inference')) {
      score += 0.2;
      factors.push('Uses LLM inference (autonomous decision-making)');
    }

    return { score: Math.min(score, 1), factors };
  }

  private identifyMitigations(
    definition: AgentDefinition,
    categoryRisks: AgentRiskAssessment['categoryRisks']
  ): string[] {
    const mitigations: string[] = [];

    // Resource limits are a mitigation
    mitigations.push(`Rate limited to ${definition.resourceLimits.rateLimitPerMinute} requests/min`);
    mitigations.push(`Token budget capped at ${definition.resourceLimits.tokenBudget}`);
    mitigations.push(`Timeout set to ${definition.resourceLimits.timeoutMs / 1000}s`);

    // Namespace isolation
    if (definition.namespace) {
      mitigations.push(`Isolated to namespace: ${definition.namespace}`);
    }

    // Governance frame
    mitigations.push(`Governed by frame: ${definition.governingFrame}`);

    // robots.txt compliance for scrapers
    if (definition.dataSources.some(s => s.respectRobotsTxt)) {
      mitigations.push('Respects robots.txt');
    }

    return mitigations;
  }

  /**
   * Estimate resource usage for an agent.
   */
  private estimateResources(definition: AgentDefinition): ResourceEstimate {
    // Base estimates from template/definition
    const baseApiCalls = definition.dataSources.length * 10;
    const baseTokens = 5000;
    const baseTime = 30000; // 30 seconds
    const baseSymbols = 10;

    // Adjust based on capabilities
    let multiplier = 1;
    if (definition.requiredCapabilities.includes('llm_inference')) {
      multiplier *= 2;
    }
    if (definition.requiredCapabilities.includes('web_scraping')) {
      multiplier *= 1.5;
    }

    return {
      apiCalls: {
        min: Math.floor(baseApiCalls * 0.5),
        max: Math.ceil(baseApiCalls * 3 * multiplier),
        typical: Math.ceil(baseApiCalls * multiplier),
      },
      tokenUsage: {
        min: Math.floor(baseTokens * 0.5),
        max: Math.min(definition.resourceLimits.tokenBudget, baseTokens * 5 * multiplier),
        typical: Math.ceil(baseTokens * multiplier),
      },
      executionTime: {
        min: baseTime,
        max: Math.min(definition.resourceLimits.timeoutMs, baseTime * 5),
        typical: Math.ceil(baseTime * multiplier),
      },
      symbolsCreated: {
        min: 1,
        max: Math.ceil(baseSymbols * 10 * multiplier),
        typical: Math.ceil(baseSymbols * multiplier),
      },
    };
  }

  /**
   * Generate explanation for proposal.
   */
  private generateExplanation(
    trigger: ProposalJustification['trigger'],
    dataSource: DataSourceSpec
  ): string {
    const triggerExplanations: Record<ProposalJustification['trigger'], string> = {
      new_data_source: `A new data source was discovered: ${dataSource.name}`,
      user_request: `User requested data from ${dataSource.name}`,
      scheduled: `Scheduled refresh for ${dataSource.name}`,
      dependency: `Required by another agent to access ${dataSource.name}`,
      system: `System identified ${dataSource.name} as relevant`,
    };

    return triggerExplanations[trigger] + `. This agent will fetch and process data from the ${dataSource.type} source at ${dataSource.endpoint}.`;
  }

  /**
   * Assess business value of data source.
   */
  private assessBusinessValue(dataSource: DataSourceSpec): string {
    const valueByType: Record<string, string> = {
      rest_api: 'Structured API data enables automated processing and integration',
      graphql: 'GraphQL allows precise data fetching reducing overhead',
      web_page: 'Web content provides up-to-date information not available via API',
      rss_feed: 'Feed monitoring enables real-time awareness of updates',
      github: 'Code repository analysis reveals project health and activity',
      huggingface: 'Dataset access enables benchmarking and model evaluation',
      file: 'Document processing extracts insights from unstructured content',
      database: 'Direct database access provides comprehensive data access',
    };

    return valueByType[dataSource.type] || 'Provides valuable data for analysis';
  }

  /**
   * Suggest alternatives to the proposed agent.
   */
  private suggestAlternatives(dataSource: DataSourceSpec): string[] {
    const alternatives: string[] = [];

    if (dataSource.type === 'web_page') {
      alternatives.push('Consider checking if an official API exists');
      alternatives.push('RSS/Atom feed may provide structured updates');
    }

    if (dataSource.type === 'rest_api' && !dataSource.auth) {
      alternatives.push('Authenticated access may provide more data');
    }

    return alternatives;
  }

  /**
   * Summarize data access for the proposal.
   */
  private summarizeDataAccess(definition: AgentDefinition): AgentProposal['dataAccessSummary'] {
    return {
      dataAccessed: definition.dataSources.map(s => `${s.name} (${s.endpoint})`),
      dataModified: [],
      symbolsCreated: definition.expectedOutputSymbols.map(s => s.pattern),
      externalServices: definition.dataSources.map(s => new URL(s.endpoint).hostname),
    };
  }

  /**
   * Queue proposal for human approval.
   */
  private async queueForApproval(proposal: AgentProposal): Promise<void> {
    if (!holdManager) {
      console.warn('HoldManager not configured. Approval workflow disabled.');
      return;
    }

    // Create hold request
    const holdRequest = holdManager.createHold(
      {
        agentId: 'agent-spawner',
        frame: proposal.agentDefinition.governingFrame,
        tool: 'spawn_agent',
        arguments: { proposalId: proposal.proposalId },
      },
      'agent_spawn_approval',
      this.riskScoreToSeverity(proposal.riskAssessment.overallRiskScore),
      {
        proposalId: proposal.proposalId,
        agentName: proposal.agentDefinition.name,
        purpose: proposal.agentDefinition.purpose,
        riskScore: proposal.riskAssessment.overallRiskScore,
        concerns: proposal.riskAssessment.concerns,
        resourceEstimate: proposal.resourceEstimate,
      }
    );

    // Store hold reference
    proposal.holdId = holdRequest.holdId;
    this.proposalsByHold.set(holdRequest.holdId, proposal.proposalId);

    // Update database with hold ID
    this.syncToDatabase(proposal);

    // Send webhook notifications
    const dispatcher = getWebhookDispatcher();
    await dispatcher.sendApprovalRequest(proposal);

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_QUEUED_FOR_APPROVAL',
      proposalId: proposal.proposalId,
      agentId: proposal.agentDefinition.agentId,
      details: {
        holdId: holdRequest.holdId,
        riskScore: proposal.riskAssessment.overallRiskScore,
      },
    });
  }

  private riskScoreToSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPOSAL RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a proposal by ID.
   * First checks in-memory cache, then falls back to database.
   */
  getProposal(proposalId: string): AgentProposal | null {
    // Check cache first
    const cached = this.proposals.get(proposalId);
    if (cached) return cached;

    // Fall back to database
    try {
      const proposal = dbGetProposal(proposalId);
      if (proposal) {
        // Update cache
        this.proposals.set(proposal.proposalId, proposal);
        if (proposal.holdId) {
          this.proposalsByHold.set(proposal.holdId, proposal.proposalId);
        }
        return proposal;
      }
    } catch (error) {
      console.warn('Failed to get proposal from database:', error);
    }

    return null;
  }

  /**
   * Get proposal by hold ID.
   * First checks in-memory cache, then falls back to database.
   */
  getProposalByHold(holdId: string): AgentProposal | null {
    // Check cache first
    const proposalId = this.proposalsByHold.get(holdId);
    if (proposalId) {
      return this.getProposal(proposalId);
    }

    // Fall back to database
    try {
      const proposal = dbGetProposalByHoldId(holdId);
      if (proposal) {
        // Update cache
        this.proposals.set(proposal.proposalId, proposal);
        this.proposalsByHold.set(holdId, proposal.proposalId);
        return proposal;
      }
    } catch (error) {
      console.warn('Failed to get proposal by hold ID from database:', error);
    }

    return null;
  }

  /**
   * List proposals with optional filters.
   * Uses database as source of truth for accurate listing.
   */
  listProposals(filters?: {
    state?: AgentProposal['state'];
    campaignId?: string;
    limit?: number;
  }): AgentProposal[] {
    // Use database as source of truth for listing
    try {
      const proposals = dbListProposals(filters);
      // Update cache with fetched proposals
      for (const proposal of proposals) {
        this.proposals.set(proposal.proposalId, proposal);
        if (proposal.holdId) {
          this.proposalsByHold.set(proposal.holdId, proposal.proposalId);
        }
      }
      return proposals;
    } catch (error) {
      console.warn('Failed to list proposals from database, using cache:', error);
      // Fall back to cache
      let proposals = Array.from(this.proposals.values());

      if (filters?.state) {
        proposals = proposals.filter(p => p.state === filters.state);
      }
      if (filters?.campaignId) {
        proposals = proposals.filter(p => p.campaignId === filters.campaignId);
      }

      // Sort by creation date (newest first)
      proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (filters?.limit) {
        proposals = proposals.slice(0, filters.limit);
      }

      return proposals;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Approve a pending proposal.
   */
  async approveProposal(
    proposalId: string,
    approvedBy: string,
    reason: string = 'Approved',
    modifications?: Partial<AgentDefinition>
  ): Promise<AgentInstance | null> {
    const proposal = this.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    if (proposal.state !== 'pending') {
      throw new Error(`Proposal is not pending: ${proposal.state}`);
    }

    // Check expiration
    if (new Date(proposal.expiresAt) < new Date()) {
      proposal.state = 'expired';
      this.syncToDatabase(proposal);
      throw new Error('Proposal has expired');
    }

    // Apply modifications
    let finalDefinition = proposal.agentDefinition;
    if (modifications) {
      finalDefinition = { ...finalDefinition, ...modifications };
    }

    // Update proposal state
    proposal.state = 'approved';
    proposal.decision = {
      decidedBy: approvedBy,
      decidedAt: new Date().toISOString(),
      reason,
      modifiedConfig: modifications,
    };

    // Persist to database
    this.syncToDatabase(proposal);

    // Approve the hold if exists
    if (proposal.holdId && holdManager) {
      holdManager.approveHold(proposal.holdId, approvedBy, reason);
    }

    // Register definition and spawn instance
    const registry = getAgentRegistry();
    registry.registerDefinition(finalDefinition);

    const instance = await registry.spawnInstance(finalDefinition.agentId, {
      campaignId: proposal.campaignId,
      proposalId: proposal.proposalId,
      holdId: proposal.holdId,
    });

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_APPROVED',
      proposalId,
      agentId: finalDefinition.agentId,
      instanceId: instance.instanceId,
      operatorId: approvedBy,
      details: {
        reason,
        hadModifications: !!modifications,
      },
    });

    return instance;
  }

  /**
   * Reject a pending proposal.
   */
  rejectProposal(
    proposalId: string,
    rejectedBy: string,
    reason: string
  ): void {
    const proposal = this.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    if (proposal.state !== 'pending') {
      throw new Error(`Proposal is not pending: ${proposal.state}`);
    }

    // Update proposal state
    proposal.state = 'rejected';
    proposal.decision = {
      decidedBy: rejectedBy,
      decidedAt: new Date().toISOString(),
      reason,
    };

    // Persist to database
    this.syncToDatabase(proposal);

    // Reject the hold if exists
    if (proposal.holdId && holdManager) {
      holdManager.rejectHold(proposal.holdId, rejectedBy, reason);
    }

    recordAgentAuditEvent({
      eventType: 'PROPOSAL_REJECTED',
      proposalId,
      agentId: proposal.agentDefinition.agentId,
      operatorId: rejectedBy,
      details: { reason },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPIRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Expire stale proposals.
   * Uses database to mark expired proposals and syncs to cache.
   */
  expireStaleProposals(): number {
    // First, use database function to mark expired proposals
    try {
      const dbExpired = dbDeleteExpiredProposals();

      // Also update in-memory cache
      const now = new Date();
      for (const proposal of this.proposals.values()) {
        if (proposal.state === 'pending' && new Date(proposal.expiresAt) < now) {
          proposal.state = 'expired';

          recordAgentAuditEvent({
            eventType: 'PROPOSAL_EXPIRED',
            proposalId: proposal.proposalId,
            agentId: proposal.agentDefinition.agentId,
          });
        }
      }

      return dbExpired;
    } catch (error) {
      console.warn('Failed to expire proposals in database, using cache:', error);

      // Fall back to cache-only expiration
      const now = new Date();
      let expired = 0;

      for (const proposal of this.proposals.values()) {
        if (proposal.state === 'pending' && new Date(proposal.expiresAt) < now) {
          proposal.state = 'expired';
          expired++;

          recordAgentAuditEvent({
            eventType: 'PROPOSAL_EXPIRED',
            proposalId: proposal.proposalId,
            agentId: proposal.agentDefinition.agentId,
          });
        }
      }

      return expired;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let managerInstance: AgentProposalManager | null = null;

/**
 * Initialize the proposal manager.
 * Loads existing proposals from the database.
 */
export function initializeProposalManager(): AgentProposalManager {
  if (!managerInstance) {
    managerInstance = new AgentProposalManager();
    // Load proposals from database on initialization
    managerInstance.loadFromDatabase();
  }
  return managerInstance;
}

/**
 * Get the proposal manager instance.
 * If not initialized, creates a new instance and loads from database.
 */
export function getProposalManager(): AgentProposalManager {
  if (!managerInstance) {
    managerInstance = new AgentProposalManager();
    // Load proposals from database
    managerInstance.loadFromDatabase();
  }
  return managerInstance;
}
