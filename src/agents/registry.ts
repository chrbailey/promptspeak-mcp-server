/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Agent Registry
 *
 * Central registry for managing agent definitions, instances, and their lifecycles.
 * Enforces scope isolation, resource quotas, and maintains the delegation hierarchy.
 */

import type {
  AgentDefinition,
  AgentInstance,
  AgentScope,
  AgentStatus,
  AgentResourceLimits,
  AgentResourceUsage,
  AgentMetrics,
  AcquisitionCampaign,
  DEFAULT_RESOURCE_LIMITS,
} from './types.js';
import {
  createAgentDefinition,
  getAgentDefinition,
  listAgentDefinitions,
  createAgentInstance,
  getAgentInstance,
  updateAgentInstance,
  listAgentInstances,
  getCampaign,
  updateCampaign,
  recordAgentAuditEvent,
} from './database.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ID GENERATORS
// ═══════════════════════════════════════════════════════════════════════════════

function generateInstanceId(): string {
  return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Central registry for managing agents.
 *
 * Responsibilities:
 * - Register and retrieve agent definitions
 * - Spawn and manage agent instances
 * - Enforce scope isolation (symbol and tool access)
 * - Track and enforce resource quotas
 * - Manage delegation chains
 */
export class AgentRegistry {
  // In-memory caches for fast access
  private definitionCache: Map<string, AgentDefinition> = new Map();
  private instanceCache: Map<string, AgentInstance> = new Map();
  private instancesByDefinition: Map<string, Set<string>> = new Map();
  private instancesByCampaign: Map<string, Set<string>> = new Map();

  // Rate limiter state (per instance)
  private rateLimiterState: Map<string, {
    windowStart: number;
    requestCount: number;
  }> = new Map();

  constructor() {
    // Load existing definitions and running instances into cache on startup
    this.loadCachesFromDatabase();
  }

  private loadCachesFromDatabase(): void {
    // Load all definitions
    const definitions = listAgentDefinitions({ limit: 1000 });
    for (const def of definitions) {
      this.definitionCache.set(def.agentId, def);
    }

    // Load running instances
    const runningInstances = listAgentInstances({
      status: 'running',
      limit: 1000,
    });
    for (const inst of runningInstances) {
      this.instanceCache.set(inst.instanceId, inst);
      this.trackInstanceMapping(inst);
    }
  }

  private trackInstanceMapping(instance: AgentInstance): void {
    // Track by definition
    if (!this.instancesByDefinition.has(instance.definitionId)) {
      this.instancesByDefinition.set(instance.definitionId, new Set());
    }
    this.instancesByDefinition.get(instance.definitionId)!.add(instance.instanceId);

    // Track by campaign
    if (instance.campaignId) {
      if (!this.instancesByCampaign.has(instance.campaignId)) {
        this.instancesByCampaign.set(instance.campaignId, new Set());
      }
      this.instancesByCampaign.get(instance.campaignId)!.add(instance.instanceId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFINITION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new agent definition.
   */
  registerDefinition(definition: AgentDefinition): AgentDefinition {
    // Validate agent ID format
    if (!definition.agentId.startsWith('agent.')) {
      throw new Error(`Invalid agent ID format: ${definition.agentId}. Must start with 'agent.'`);
    }

    // Check for duplicate
    if (this.definitionCache.has(definition.agentId)) {
      throw new Error(`Agent definition already exists: ${definition.agentId}`);
    }

    // Persist to database
    createAgentDefinition(definition);

    // Update cache
    this.definitionCache.set(definition.agentId, definition);

    // Audit
    recordAgentAuditEvent({
      eventType: 'DEFINITION_REGISTERED',
      agentId: definition.agentId,
      details: {
        name: definition.name,
        category: definition.category,
        riskLevel: definition.riskLevel,
      },
    });

    return definition;
  }

  /**
   * Get an agent definition by ID.
   */
  getDefinition(agentId: string): AgentDefinition | null {
    // Check cache first
    if (this.definitionCache.has(agentId)) {
      return this.definitionCache.get(agentId)!;
    }

    // Fall back to database
    const definition = getAgentDefinition(agentId);
    if (definition) {
      this.definitionCache.set(agentId, definition);
    }

    return definition;
  }

  /**
   * List all registered definitions.
   */
  listDefinitions(filters?: {
    category?: string;
    riskLevel?: string;
    limit?: number;
  }): AgentDefinition[] {
    return listAgentDefinitions(filters);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTANCE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a new agent instance from a definition.
   */
  async spawnInstance(
    definitionId: string,
    options: {
      campaignId?: string;
      parentInstanceId?: string;
      holdId?: string;
      proposalId?: string;
      customScope?: Partial<AgentScope>;
    } = {}
  ): Promise<AgentInstance> {
    const definition = this.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`Agent definition not found: ${definitionId}`);
    }

    // Check campaign circuit breaker if applicable
    if (options.campaignId) {
      const campaign = getCampaign(options.campaignId);
      if (campaign && campaign.circuitBreakerState === 'open') {
        throw new Error(`Campaign ${options.campaignId} circuit breaker is open. Cannot spawn new agents.`);
      }
    }

    // Build scope from definition and options
    const scope = this.buildScope(definition, options);

    // Validate delegation depth
    if (options.parentInstanceId) {
      const parentInstance = this.getInstance(options.parentInstanceId);
      if (parentInstance) {
        const currentDepth = parentInstance.delegationChain.length;
        if (currentDepth >= scope.maxDelegationDepth) {
          throw new Error(`Maximum delegation depth (${scope.maxDelegationDepth}) exceeded`);
        }
      }
    }

    // Create instance
    const instance: AgentInstance = {
      instanceId: generateInstanceId(),
      definitionId,
      campaignId: options.campaignId,
      status: 'approved',
      scope,
      resourceUsage: {
        apiCallsMade: 0,
        tokensUsed: 0,
        executionTimeMs: 0,
        symbolsCreated: [],
        symbolsUpdated: [],
        symbolsDeleted: [],
      },
      createdAt: new Date().toISOString(),
      holdId: options.holdId,
      proposalId: options.proposalId,
      delegationChain: options.parentInstanceId
        ? [...(this.getInstance(options.parentInstanceId)?.delegationChain || []), options.parentInstanceId]
        : [],
      metrics: {
        successRate: 0,
        avgLatencyMs: 0,
        errorCount: 0,
      },
      governingFrame: definition.governingFrame,
      enabled: true,
    };

    // Persist to database
    createAgentInstance(instance);

    // Update caches
    this.instanceCache.set(instance.instanceId, instance);
    this.trackInstanceMapping(instance);

    // Initialize rate limiter
    this.rateLimiterState.set(instance.instanceId, {
      windowStart: Date.now(),
      requestCount: 0,
    });

    // Update campaign metrics
    if (options.campaignId) {
      const campaign = getCampaign(options.campaignId);
      if (campaign) {
        updateCampaign(options.campaignId, {
          agentsSpawned: campaign.agentsSpawned + 1,
        });
      }
    }

    // Audit
    recordAgentAuditEvent({
      eventType: 'INSTANCE_SPAWNED',
      agentId: definitionId,
      instanceId: instance.instanceId,
      campaignId: options.campaignId,
      details: {
        parentInstanceId: options.parentInstanceId,
        delegationDepth: instance.delegationChain.length,
      },
    });

    return instance;
  }

  /**
   * Build scope for an agent instance.
   */
  private buildScope(
    definition: AgentDefinition,
    options: {
      parentInstanceId?: string;
      customScope?: Partial<AgentScope>;
    }
  ): AgentScope {
    const namespace = definition.namespace || 'default';

    // Base scope from definition
    const scope: AgentScope = {
      allowedSymbolPatterns: [
        `Ξ.*.${namespace}.*`,  // Namespace-scoped symbols
        ...definition.expectedOutputSymbols.map(s => s.pattern),
      ],
      deniedSymbolPatterns: [],
      allowedTools: this.capabilitiesToTools(definition.requiredCapabilities),
      deniedTools: [],
      namespace,
      parentInstanceId: options.parentInstanceId,
      maxDelegationDepth: 3, // Default max depth
    };

    // Inherit restrictions from parent if delegated
    if (options.parentInstanceId) {
      const parentInstance = this.getInstance(options.parentInstanceId);
      if (parentInstance) {
        // Child can only access subset of parent's allowed patterns
        scope.allowedSymbolPatterns = scope.allowedSymbolPatterns.filter(
          pattern => this.patternIsSubsetOf(pattern, parentInstance.scope.allowedSymbolPatterns)
        );
        // Child inherits all parent's denied patterns
        scope.deniedSymbolPatterns.push(...parentInstance.scope.deniedSymbolPatterns);
      }
    }

    // Apply custom scope overrides
    if (options.customScope) {
      Object.assign(scope, options.customScope);
    }

    return scope;
  }

  /**
   * Map agent capabilities to MCP tool names.
   */
  private capabilitiesToTools(capabilities: string[]): string[] {
    const toolMapping: Record<string, string[]> = {
      'api_rest': ['WebFetch'],
      'api_graphql': ['WebFetch'],
      'web_scraping': ['WebFetch', 'mcp__MCP_DOCKER__browser_*'],
      'symbol_create': ['ps_symbol_create'],
      'symbol_update': ['ps_symbol_update'],
      'symbol_delete': ['ps_symbol_delete'],
      'llm_inference': ['Task'],
      'file_read': ['Read', 'Glob'],
      'file_write': ['Write', 'Edit'],
      'database_read': ['Bash'],
      'database_write': ['Bash'],
      'delegation_spawn': ['ps_delegate', 'ps_agent_propose'],
      'external_service': ['WebFetch', 'Bash'],
    };

    const tools: Set<string> = new Set();
    for (const capability of capabilities) {
      const mappedTools = toolMapping[capability] || [];
      mappedTools.forEach(t => tools.add(t));
    }

    return Array.from(tools);
  }

  /**
   * Check if a pattern is a subset of allowed patterns.
   */
  private patternIsSubsetOf(pattern: string, allowedPatterns: string[]): boolean {
    for (const allowed of allowedPatterns) {
      // Simple check: pattern starts with same prefix
      const allowedPrefix = allowed.replace(/\*.*$/, '');
      const patternPrefix = pattern.replace(/\*.*$/, '');
      if (patternPrefix.startsWith(allowedPrefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get an agent instance by ID.
   */
  getInstance(instanceId: string): AgentInstance | null {
    // Check cache first
    if (this.instanceCache.has(instanceId)) {
      return this.instanceCache.get(instanceId)!;
    }

    // Fall back to database
    const instance = getAgentInstance(instanceId);
    if (instance) {
      this.instanceCache.set(instanceId, instance);
    }

    return instance;
  }

  /**
   * Update instance status.
   */
  updateInstanceStatus(
    instanceId: string,
    status: AgentStatus,
    message?: string
  ): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance) return false;

    const updates: Partial<AgentInstance> = {
      status,
      statusMessage: message,
    };

    // Set timestamps based on status
    if (status === 'running' && !instance.startedAt) {
      updates.startedAt = new Date().toISOString();
    } else if (['completed', 'failed', 'abandoned', 'archived'].includes(status)) {
      updates.completedAt = new Date().toISOString();
    }

    const success = updateAgentInstance(instanceId, updates);

    if (success) {
      // Update cache
      Object.assign(instance, updates);

      // Update campaign metrics on completion
      if (instance.campaignId && ['completed', 'failed'].includes(status)) {
        this.updateCampaignOnInstanceComplete(instance.campaignId, status === 'completed');
      }

      // Audit
      recordAgentAuditEvent({
        eventType: 'INSTANCE_STATUS_CHANGED',
        instanceId,
        agentId: instance.definitionId,
        campaignId: instance.campaignId,
        details: { status, message },
      });
    }

    return success;
  }

  /**
   * Update campaign metrics when an instance completes.
   */
  private updateCampaignOnInstanceComplete(campaignId: string, success: boolean): void {
    const campaign = getCampaign(campaignId);
    if (!campaign) return;

    const updates: Partial<AcquisitionCampaign> = {};

    if (success) {
      updates.agentsCompleted = campaign.agentsCompleted + 1;
      updates.consecutiveFailures = 0;
      if (campaign.circuitBreakerState === 'half-open') {
        updates.circuitBreakerState = 'closed';
      }
    } else {
      updates.agentsFailed = campaign.agentsFailed + 1;
      updates.consecutiveFailures = campaign.consecutiveFailures + 1;
      updates.lastFailureAt = new Date().toISOString();

      // Trip circuit breaker after 3 consecutive failures
      if (updates.consecutiveFailures >= 3 && campaign.circuitBreakerState === 'closed') {
        updates.circuitBreakerState = 'open';
        recordAgentAuditEvent({
          eventType: 'CIRCUIT_BREAKER_OPENED',
          campaignId,
          details: {
            consecutiveFailures: updates.consecutiveFailures,
            reason: 'Too many consecutive agent failures',
          },
        });
      }
    }

    updateCampaign(campaignId, updates);
  }

  /**
   * List instances with optional filters.
   */
  listInstances(filters?: {
    campaignId?: string;
    definitionId?: string;
    status?: AgentStatus;
    limit?: number;
  }): AgentInstance[] {
    return listAgentInstances(filters);
  }

  /**
   * Get instances by campaign.
   */
  getInstancesByCampaign(campaignId: string): AgentInstance[] {
    const instanceIds = this.instancesByCampaign.get(campaignId);
    if (!instanceIds) return [];

    return Array.from(instanceIds)
      .map(id => this.getInstance(id))
      .filter((i): i is AgentInstance => i !== null);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCOPE ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an instance can access a symbol.
   */
  canAccessSymbol(instanceId: string, symbolId: string): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance || !instance.enabled) return false;

    const scope = instance.scope;

    // Check denied patterns first (takes precedence)
    for (const pattern of scope.deniedSymbolPatterns) {
      if (this.matchPattern(symbolId, pattern)) {
        return false;
      }
    }

    // Check allowed patterns
    for (const pattern of scope.allowedSymbolPatterns) {
      if (this.matchPattern(symbolId, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if an instance can use a tool.
   */
  canUseTool(instanceId: string, toolName: string): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance || !instance.enabled) return false;

    const scope = instance.scope;

    // Check denied tools first
    for (const pattern of scope.deniedTools) {
      if (this.matchPattern(toolName, pattern)) {
        return false;
      }
    }

    // Check allowed tools
    for (const pattern of scope.allowedTools) {
      if (this.matchPattern(toolName, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match a value against a pattern (supports * wildcards).
   */
  private matchPattern(value: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
      .replace(/\*/g, '.*');  // Convert * to .*
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE QUOTA ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an instance has quota remaining for a resource.
   */
  checkQuota(
    instanceId: string,
    resource: keyof AgentResourceLimits,
    amount: number = 1
  ): { allowed: boolean; remaining: number; reason?: string } {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      return { allowed: false, remaining: 0, reason: 'Instance not found' };
    }

    const definition = this.getDefinition(instance.definitionId);
    if (!definition) {
      return { allowed: false, remaining: 0, reason: 'Definition not found' };
    }

    const limits = definition.resourceLimits;
    const usage = instance.resourceUsage;

    switch (resource) {
      case 'rateLimitPerMinute': {
        const state = this.rateLimiterState.get(instanceId);
        if (!state) {
          return { allowed: true, remaining: limits.rateLimitPerMinute };
        }

        const now = Date.now();
        const windowDuration = 60000; // 1 minute

        // Reset window if expired
        if (now - state.windowStart > windowDuration) {
          state.windowStart = now;
          state.requestCount = 0;
        }

        const remaining = limits.rateLimitPerMinute - state.requestCount;
        const allowed = remaining >= amount;

        return {
          allowed,
          remaining,
          reason: allowed ? undefined : `Rate limit exceeded (${limits.rateLimitPerMinute}/min)`,
        };
      }

      case 'tokenBudget': {
        const remaining = limits.tokenBudget - usage.tokensUsed;
        const allowed = remaining >= amount;
        return {
          allowed,
          remaining,
          reason: allowed ? undefined : `Token budget exhausted (${limits.tokenBudget} total)`,
        };
      }

      case 'timeoutMs': {
        const remaining = limits.timeoutMs - usage.executionTimeMs;
        const allowed = remaining >= amount;
        return {
          allowed,
          remaining,
          reason: allowed ? undefined : `Execution timeout (${limits.timeoutMs}ms)`,
        };
      }

      case 'maxSymbolsCreated': {
        const limit = limits.maxSymbolsCreated || 1000;
        const remaining = limit - usage.symbolsCreated.length;
        const allowed = remaining >= amount;
        return {
          allowed,
          remaining,
          reason: allowed ? undefined : `Symbol creation limit reached (${limit})`,
        };
      }

      default:
        return { allowed: true, remaining: Infinity };
    }
  }

  /**
   * Record resource usage for an instance.
   */
  recordUsage(
    instanceId: string,
    usage: Partial<{
      apiCalls: number;
      tokens: number;
      executionTime: number;
      symbolCreated: string;
      symbolUpdated: string;
      symbolDeleted: string;
    }>
  ): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance) return false;

    // Update rate limiter
    if (usage.apiCalls) {
      const state = this.rateLimiterState.get(instanceId);
      if (state) {
        state.requestCount += usage.apiCalls;
      }
    }

    // Update resource usage
    const currentUsage = instance.resourceUsage;
    const newUsage: AgentResourceUsage = {
      apiCallsMade: currentUsage.apiCallsMade + (usage.apiCalls || 0),
      tokensUsed: currentUsage.tokensUsed + (usage.tokens || 0),
      executionTimeMs: currentUsage.executionTimeMs + (usage.executionTime || 0),
      symbolsCreated: usage.symbolCreated
        ? [...currentUsage.symbolsCreated, usage.symbolCreated]
        : currentUsage.symbolsCreated,
      symbolsUpdated: usage.symbolUpdated
        ? [...currentUsage.symbolsUpdated, usage.symbolUpdated]
        : currentUsage.symbolsUpdated,
      symbolsDeleted: usage.symbolDeleted
        ? [...currentUsage.symbolsDeleted, usage.symbolDeleted]
        : currentUsage.symbolsDeleted,
    };

    // Persist
    const success = updateAgentInstance(instanceId, { resourceUsage: newUsage });

    if (success) {
      instance.resourceUsage = newUsage;
    }

    return success;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTANCE CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pause an agent instance.
   */
  pauseInstance(instanceId: string, reason: string): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance || instance.status !== 'running') return false;

    const success = updateAgentInstance(instanceId, {
      status: 'paused',
      enabled: false,
      pausedReason: reason,
    });

    if (success) {
      instance.status = 'paused';
      instance.enabled = false;
      instance.pausedReason = reason;

      recordAgentAuditEvent({
        eventType: 'INSTANCE_PAUSED',
        instanceId,
        agentId: instance.definitionId,
        details: { reason },
      });
    }

    return success;
  }

  /**
   * Resume a paused agent instance.
   */
  resumeInstance(instanceId: string): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance || instance.status !== 'paused') return false;

    const success = updateAgentInstance(instanceId, {
      status: 'running',
      enabled: true,
      pausedReason: undefined,
    });

    if (success) {
      instance.status = 'running';
      instance.enabled = true;
      instance.pausedReason = undefined;

      recordAgentAuditEvent({
        eventType: 'INSTANCE_RESUMED',
        instanceId,
        agentId: instance.definitionId,
      });
    }

    return success;
  }

  /**
   * Terminate an agent instance.
   */
  terminateInstance(instanceId: string, reason: string): boolean {
    const instance = this.getInstance(instanceId);
    if (!instance) return false;

    const finalStatus: AgentStatus = instance.status === 'running' ? 'failed' : 'archived';

    const success = updateAgentInstance(instanceId, {
      status: finalStatus,
      enabled: false,
      completedAt: new Date().toISOString(),
      errorDetails: {
        code: 'TERMINATED',
        message: reason,
        retryable: false,
      },
    });

    if (success) {
      // Clean up caches
      this.instanceCache.delete(instanceId);
      this.rateLimiterState.delete(instanceId);

      // Remove from tracking maps
      this.instancesByDefinition.get(instance.definitionId)?.delete(instanceId);
      if (instance.campaignId) {
        this.instancesByCampaign.get(instance.campaignId)?.delete(instanceId);
      }

      recordAgentAuditEvent({
        eventType: 'INSTANCE_TERMINATED',
        instanceId,
        agentId: instance.definitionId,
        campaignId: instance.campaignId,
        details: { reason, finalStatus },
      });
    }

    return success;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get aggregated metrics for a definition.
   */
  getDefinitionMetrics(definitionId: string): {
    totalInstances: number;
    activeInstances: number;
    completedInstances: number;
    failedInstances: number;
    avgSuccessRate: number;
    totalSymbolsCreated: number;
    totalTokensUsed: number;
  } {
    const instances = listAgentInstances({ definitionId });

    const activeStatuses: AgentStatus[] = ['running', 'spawning', 'paused'];
    const completedStatuses: AgentStatus[] = ['completed', 'archived'];
    const failedStatuses: AgentStatus[] = ['failed', 'abandoned'];

    const active = instances.filter(i => activeStatuses.includes(i.status));
    const completed = instances.filter(i => completedStatuses.includes(i.status));
    const failed = instances.filter(i => failedStatuses.includes(i.status));

    const totalSymbols = instances.reduce(
      (sum, i) => sum + i.resourceUsage.symbolsCreated.length,
      0
    );
    const totalTokens = instances.reduce(
      (sum, i) => sum + i.resourceUsage.tokensUsed,
      0
    );

    const completedCount = completed.length + failed.length;
    const successRate = completedCount > 0
      ? completed.length / completedCount
      : 0;

    return {
      totalInstances: instances.length,
      activeInstances: active.length,
      completedInstances: completed.length,
      failedInstances: failed.length,
      avgSuccessRate: successRate,
      totalSymbolsCreated: totalSymbols,
      totalTokensUsed: totalTokens,
    };
  }

  /**
   * Get campaign overview.
   */
  getCampaignMetrics(campaignId: string): {
    status: string;
    agents: {
      total: number;
      running: number;
      completed: number;
      failed: number;
    };
    symbols: number;
    circuitBreaker: string;
  } | null {
    const campaign = getCampaign(campaignId);
    if (!campaign) return null;

    const runningInstances = this.getInstancesByCampaign(campaignId)
      .filter(i => i.status === 'running');

    return {
      status: campaign.status,
      agents: {
        total: campaign.agentsSpawned,
        running: runningInstances.length,
        completed: campaign.agentsCompleted,
        failed: campaign.agentsFailed,
      },
      symbols: campaign.symbolsCreated,
      circuitBreaker: campaign.circuitBreakerState,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let registryInstance: AgentRegistry | null = null;

/**
 * Initialize the agent registry.
 */
export function initializeAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}

/**
 * Get the agent registry instance.
 */
export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    throw new Error('Agent registry not initialized. Call initializeAgentRegistry() first.');
  }
  return registryInstance;
}
