/**
 * Multi-Agent Data Intelligence Framework (MADIF) - MCP Tools
 *
 * MCP tool definitions and handlers for orchestration (ps_orch_*)
 * and agent management (ps_agent_*).
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
  AcquisitionCampaign,
  AgentInstance,
  AgentProposal,
  DataSourceSpec,
  CampaignScopeConstraints,
} from './types.js';
import {
  createCampaign,
  getCampaign,
  updateCampaign,
  listCampaigns,
  listAgentInstances,
  recordAgentAuditEvent,
} from './database.js';
import { getAgentRegistry } from './registry.js';
import { getProposalManager } from './proposal-manager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const orchestrationToolDefinitions: Tool[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // CAMPAIGN TOOLS (ps_orch_*)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_orch_query',
    description: 'Start a new data acquisition campaign for a topic. Creates a campaign that will spawn sub-agents to discover, validate, and extract data from various sources.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to research (e.g., "Defense/Government contracts")',
        },
        scopeConstraints: {
          type: 'object',
          description: 'Optional constraints on the campaign scope',
          properties: {
            allowedSourceTypes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Allowed data source types (rest_api, web_page, github, etc.)',
            },
            dateRange: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
              },
            },
            geographies: {
              type: 'array',
              items: { type: 'string' },
            },
            maxConcurrentAgents: { type: 'number' },
            maxTotalAgents: { type: 'number' },
          },
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          default: 'medium',
        },
      },
      required: ['topic'],
    },
  },

  {
    name: 'ps_orch_propose_agent',
    description: 'Propose spawning a new sub-agent for a data source. Requires human approval before the agent is created.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Campaign this agent belongs to',
        },
        dataSource: {
          type: 'object',
          description: 'Data source specification',
          properties: {
            id: { type: 'string', description: 'Unique source identifier' },
            name: { type: 'string', description: 'Human-readable name' },
            type: {
              type: 'string',
              enum: ['rest_api', 'graphql', 'soap', 'web_page', 'rss_feed', 'file', 'database', 'github', 'huggingface'],
            },
            endpoint: { type: 'string', description: 'Base URL or path' },
            auth: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['none', 'api_key', 'oauth2', 'bearer', 'basic'] },
                credentialRef: { type: 'string' },
              },
            },
            rateLimit: {
              type: 'object',
              properties: {
                requestsPerMinute: { type: 'number' },
                requestsPerDay: { type: 'number' },
              },
            },
          },
          required: ['id', 'name', 'type', 'endpoint'],
        },
        trigger: {
          type: 'string',
          enum: ['new_data_source', 'user_request', 'scheduled', 'dependency', 'system'],
          default: 'user_request',
        },
      },
      required: ['dataSource'],
    },
  },

  {
    name: 'ps_orch_status',
    description: 'Get status of a campaign or specific agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Campaign ID to check',
        },
        instanceId: {
          type: 'string',
          description: 'Specific agent instance ID',
        },
        includeAgents: {
          type: 'boolean',
          description: 'Include all agents in campaign',
          default: true,
        },
      },
    },
  },

  {
    name: 'ps_orch_abort',
    description: 'Abort a running campaign or agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaignId: {
          type: 'string',
          description: 'Campaign to abort',
        },
        instanceId: {
          type: 'string',
          description: 'Specific agent to abort',
        },
        reason: {
          type: 'string',
          description: 'Reason for aborting',
        },
        cascade: {
          type: 'boolean',
          description: 'Abort all child agents too',
          default: true,
        },
      },
      required: ['reason'],
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AGENT MANAGEMENT TOOLS (ps_agent_*)
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'ps_agent_list_proposals',
    description: 'List pending agent proposals awaiting approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        state: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'expired', 'all'],
          default: 'pending',
        },
        campaignId: {
          type: 'string',
          description: 'Filter by campaign',
        },
        limit: {
          type: 'number',
          default: 20,
        },
      },
    },
  },

  {
    name: 'ps_agent_approve',
    description: 'Approve a pending agent proposal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proposalId: {
          type: 'string',
          description: 'Proposal ID to approve',
        },
        reason: {
          type: 'string',
          description: 'Reason for approval',
        },
        modifications: {
          type: 'object',
          description: 'Optional modifications to agent configuration',
        },
      },
      required: ['proposalId'],
    },
  },

  {
    name: 'ps_agent_reject',
    description: 'Reject a pending agent proposal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        proposalId: {
          type: 'string',
          description: 'Proposal ID to reject',
        },
        reason: {
          type: 'string',
          description: 'Reason for rejection',
        },
      },
      required: ['proposalId', 'reason'],
    },
  },

  {
    name: 'ps_agent_list',
    description: 'List registered agent definitions and their instances.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['data_acquisition', 'data_processing', 'analysis', 'monitoring', 'integration'],
        },
        status: {
          type: 'string',
          enum: ['proposed', 'pending_approval', 'approved', 'spawning', 'running', 'paused', 'reporting', 'completed', 'failed', 'abandoned', 'archived'],
        },
        campaignId: {
          type: 'string',
        },
        limit: {
          type: 'number',
          default: 50,
        },
      },
    },
  },

  {
    name: 'ps_agent_get',
    description: 'Get details about a specific agent instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: {
          type: 'string',
          description: 'Agent instance ID',
        },
        includeMetrics: {
          type: 'boolean',
          default: true,
        },
      },
      required: ['instanceId'],
    },
  },

  {
    name: 'ps_agent_enable',
    description: 'Enable a disabled agent instance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: { type: 'string' },
      },
      required: ['instanceId'],
    },
  },

  {
    name: 'ps_agent_disable',
    description: 'Disable an agent instance (pause execution).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['instanceId', 'reason'],
    },
  },

  {
    name: 'ps_agent_terminate',
    description: 'Terminate an agent instance permanently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        instanceId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['instanceId', 'reason'],
    },
  },

  {
    name: 'ps_agent_metrics',
    description: 'Get performance metrics for agents.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        campaignId: { type: 'string' },
        definitionId: { type: 'string' },
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

function generateCampaignId(): string {
  return `camp_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Handle ps_orch_query - Start a new campaign.
 */
export async function handleOrchQuery(args: {
  topic: string;
  scopeConstraints?: CampaignScopeConstraints;
  priority?: 'low' | 'medium' | 'high';
}): Promise<{ campaignId: string; status: string; message: string }> {
  const campaignId = generateCampaignId();

  const campaign: Omit<AcquisitionCampaign, 'id'> = {
    campaignId,
    topic: args.topic,
    status: 'active',
    scopeConstraints: args.scopeConstraints || {},
    priority: args.priority || 'medium',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    agentsSpawned: 0,
    agentsCompleted: 0,
    agentsFailed: 0,
    symbolsCreated: 0,
    circuitBreakerState: 'closed',
    consecutiveFailures: 0,
  };

  createCampaign(campaign);

  recordAgentAuditEvent({
    eventType: 'CAMPAIGN_CREATED',
    campaignId,
    details: {
      topic: args.topic,
      priority: args.priority,
      scopeConstraints: args.scopeConstraints,
    },
  });

  return {
    campaignId,
    status: 'active',
    message: `Campaign started for topic: "${args.topic}". Use ps_orch_propose_agent to add data sources.`,
  };
}

/**
 * Handle ps_orch_propose_agent - Propose a new agent.
 */
export async function handleOrchProposeAgent(args: {
  campaignId?: string;
  dataSource: DataSourceSpec;
  trigger?: 'new_data_source' | 'user_request' | 'scheduled' | 'dependency' | 'system';
}): Promise<{ proposalId: string; status: string; riskScore: number; message: string }> {
  const proposalManager = getProposalManager();

  const proposal = await proposalManager.generateProposal(
    args.trigger || 'user_request',
    args.dataSource,
    { campaignId: args.campaignId }
  );

  return {
    proposalId: proposal.proposalId,
    status: proposal.state,
    riskScore: proposal.riskAssessment.overallRiskScore,
    message: proposal.state === 'approved'
      ? 'Agent auto-approved (low risk). Spawning...'
      : `Agent proposal created. Awaiting approval. Risk: ${(proposal.riskAssessment.overallRiskScore * 100).toFixed(0)}%`,
  };
}

/**
 * Handle ps_orch_status - Get campaign/agent status.
 */
export async function handleOrchStatus(args: {
  campaignId?: string;
  instanceId?: string;
  includeAgents?: boolean;
}): Promise<{
  campaign?: AcquisitionCampaign;
  instance?: AgentInstance;
  agents?: AgentInstance[];
  metrics?: Record<string, unknown>;
}> {
  const result: {
    campaign?: AcquisitionCampaign;
    instance?: AgentInstance;
    agents?: AgentInstance[];
    metrics?: Record<string, unknown>;
  } = {};

  if (args.instanceId) {
    const registry = getAgentRegistry();
    result.instance = registry.getInstance(args.instanceId) || undefined;
  }

  if (args.campaignId) {
    result.campaign = getCampaign(args.campaignId) || undefined;

    if (args.includeAgents !== false) {
      result.agents = listAgentInstances({ campaignId: args.campaignId });
    }

    const registry = getAgentRegistry();
    result.metrics = registry.getCampaignMetrics(args.campaignId) || undefined;
  }

  return result;
}

/**
 * Handle ps_orch_abort - Abort campaign or agent.
 */
export async function handleOrchAbort(args: {
  campaignId?: string;
  instanceId?: string;
  reason: string;
  cascade?: boolean;
}): Promise<{ success: boolean; aborted: string[]; message: string }> {
  const registry = getAgentRegistry();
  const aborted: string[] = [];

  if (args.instanceId) {
    const success = registry.terminateInstance(args.instanceId, args.reason);
    if (success) aborted.push(args.instanceId);
  }

  if (args.campaignId) {
    updateCampaign(args.campaignId, { status: 'aborted' });
    aborted.push(args.campaignId);

    if (args.cascade !== false) {
      const instances = listAgentInstances({
        campaignId: args.campaignId,
        status: 'running',
      });

      for (const instance of instances) {
        const success = registry.terminateInstance(instance.instanceId, args.reason);
        if (success) aborted.push(instance.instanceId);
      }
    }

    recordAgentAuditEvent({
      eventType: 'CAMPAIGN_ABORTED',
      campaignId: args.campaignId,
      details: { reason: args.reason, cascade: args.cascade },
    });
  }

  return {
    success: aborted.length > 0,
    aborted,
    message: `Aborted ${aborted.length} items: ${args.reason}`,
  };
}

/**
 * Handle ps_agent_list_proposals.
 */
export async function handleAgentListProposals(args: {
  state?: 'pending' | 'approved' | 'rejected' | 'expired' | 'all';
  campaignId?: string;
  limit?: number;
}): Promise<{ proposals: AgentProposal[]; count: number }> {
  const proposalManager = getProposalManager();

  const stateFilter = args.state === 'all' ? undefined : args.state;
  const proposals = proposalManager.listProposals({
    state: stateFilter,
    campaignId: args.campaignId,
    limit: args.limit,
  });

  return {
    proposals,
    count: proposals.length,
  };
}

/**
 * Handle ps_agent_approve.
 */
export async function handleAgentApprove(args: {
  proposalId: string;
  reason?: string;
  modifications?: Record<string, unknown>;
}): Promise<{ success: boolean; instanceId?: string; message: string }> {
  const proposalManager = getProposalManager();

  try {
    const instance = await proposalManager.approveProposal(
      args.proposalId,
      'operator',
      args.reason || 'Approved',
      args.modifications as any
    );

    return {
      success: true,
      instanceId: instance?.instanceId,
      message: instance
        ? `Agent approved and spawned: ${instance.instanceId}`
        : 'Agent approved but not spawned',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to approve: ${(error as Error).message}`,
    };
  }
}

/**
 * Handle ps_agent_reject.
 */
export async function handleAgentReject(args: {
  proposalId: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const proposalManager = getProposalManager();

  try {
    proposalManager.rejectProposal(args.proposalId, 'operator', args.reason);
    return {
      success: true,
      message: `Proposal rejected: ${args.reason}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to reject: ${(error as Error).message}`,
    };
  }
}

/**
 * Handle ps_agent_list.
 */
export async function handleAgentList(args: {
  category?: string;
  status?: string;
  campaignId?: string;
  limit?: number;
}): Promise<{ agents: AgentInstance[]; count: number }> {
  const agents = listAgentInstances({
    campaignId: args.campaignId,
    status: args.status as any,
    limit: args.limit,
  });

  return {
    agents,
    count: agents.length,
  };
}

/**
 * Handle ps_agent_get.
 */
export async function handleAgentGet(args: {
  instanceId: string;
  includeMetrics?: boolean;
}): Promise<{ instance: AgentInstance | null; metrics?: Record<string, unknown> }> {
  const registry = getAgentRegistry();
  const instance = registry.getInstance(args.instanceId);

  let metrics: Record<string, unknown> | undefined;
  if (instance && args.includeMetrics !== false) {
    metrics = registry.getDefinitionMetrics(instance.definitionId);
  }

  return { instance, metrics };
}

/**
 * Handle ps_agent_enable.
 */
export async function handleAgentEnable(args: {
  instanceId: string;
}): Promise<{ success: boolean; message: string }> {
  const registry = getAgentRegistry();
  const success = registry.resumeInstance(args.instanceId);

  return {
    success,
    message: success ? 'Agent enabled' : 'Failed to enable agent',
  };
}

/**
 * Handle ps_agent_disable.
 */
export async function handleAgentDisable(args: {
  instanceId: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const registry = getAgentRegistry();
  const success = registry.pauseInstance(args.instanceId, args.reason);

  return {
    success,
    message: success ? 'Agent disabled' : 'Failed to disable agent',
  };
}

/**
 * Handle ps_agent_terminate.
 */
export async function handleAgentTerminate(args: {
  instanceId: string;
  reason: string;
}): Promise<{ success: boolean; message: string }> {
  const registry = getAgentRegistry();
  const success = registry.terminateInstance(args.instanceId, args.reason);

  return {
    success,
    message: success ? 'Agent terminated' : 'Failed to terminate agent',
  };
}

/**
 * Handle ps_agent_metrics.
 */
export async function handleAgentMetrics(args: {
  campaignId?: string;
  definitionId?: string;
}): Promise<Record<string, unknown>> {
  const registry = getAgentRegistry();

  if (args.definitionId) {
    return registry.getDefinitionMetrics(args.definitionId);
  }

  if (args.campaignId) {
    return registry.getCampaignMetrics(args.campaignId) || {};
  }

  return { error: 'Provide campaignId or definitionId' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Route tool calls to appropriate handlers.
 */
export async function handleOrchestrationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'ps_orch_query':
      return handleOrchQuery(args as Parameters<typeof handleOrchQuery>[0]);
    case 'ps_orch_propose_agent':
      return handleOrchProposeAgent(args as Parameters<typeof handleOrchProposeAgent>[0]);
    case 'ps_orch_status':
      return handleOrchStatus(args as Parameters<typeof handleOrchStatus>[0]);
    case 'ps_orch_abort':
      return handleOrchAbort(args as Parameters<typeof handleOrchAbort>[0]);
    case 'ps_agent_list_proposals':
      return handleAgentListProposals(args as Parameters<typeof handleAgentListProposals>[0]);
    case 'ps_agent_approve':
      return handleAgentApprove(args as Parameters<typeof handleAgentApprove>[0]);
    case 'ps_agent_reject':
      return handleAgentReject(args as Parameters<typeof handleAgentReject>[0]);
    case 'ps_agent_list':
      return handleAgentList(args as Parameters<typeof handleAgentList>[0]);
    case 'ps_agent_get':
      return handleAgentGet(args as Parameters<typeof handleAgentGet>[0]);
    case 'ps_agent_enable':
      return handleAgentEnable(args as Parameters<typeof handleAgentEnable>[0]);
    case 'ps_agent_disable':
      return handleAgentDisable(args as Parameters<typeof handleAgentDisable>[0]);
    case 'ps_agent_terminate':
      return handleAgentTerminate(args as Parameters<typeof handleAgentTerminate>[0]);
    case 'ps_agent_metrics':
      return handleAgentMetrics(args as Parameters<typeof handleAgentMetrics>[0]);
    default:
      throw new Error(`Unknown orchestration tool: ${name}`);
  }
}
