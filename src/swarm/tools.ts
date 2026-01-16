/**
 * Swarm MCP Tool Definitions
 *
 * Exposes swarm functionality through the MCP protocol.
 * These tools allow LLM agents to create and manage market swarms.
 */

import { z } from 'zod';
import { getSwarmController, CreateSwarmOptions } from './swarm-controller.js';
import { getInsightComputer } from './registry/insight-computer.js';
import { queryEvents } from './database.js';
import { getRecommendedDistribution } from './strategies/index.js';
import type { BiddingStrategy } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const SwarmCreateSchema = z.object({
  totalBudget: z.number().min(10).max(10000).describe('Total budget in USD'),
  agentCount: z.number().min(1).max(20).optional().describe('Number of agents (default: 5)'),
  searchTerms: z.array(z.string()).describe('Keywords to search for (e.g., ["gold bars", "silver coins"])'),
  maxPricePerItem: z.number().optional().describe('Maximum price per item in USD'),
  minPricePerItem: z.number().optional().describe('Minimum price per item in USD'),
  conditions: z.array(z.string()).optional().describe('Acceptable conditions (e.g., ["new", "used"])'),
  durationHours: z.number().min(1).max(168).optional().describe('Duration in hours (default: 24)'),
  strategyDistribution: z.record(z.number()).optional().describe('Custom strategy distribution'),
});

export const SwarmStatusSchema = z.object({
  swarmId: z.string().uuid().describe('The swarm ID to check'),
});

export const SwarmAgentStatusSchema = z.object({
  swarmId: z.string().uuid().describe('The swarm ID'),
  agentId: z.string().uuid().describe('The agent ID'),
});

export const SwarmReallocateSchema = z.object({
  swarmId: z.string().uuid().describe('The swarm ID'),
  fromAgentId: z.string().uuid().describe('Agent to take budget from'),
  toAgentId: z.string().uuid().describe('Agent to give budget to'),
  amount: z.number().positive().describe('Amount to reallocate'),
});

export const SwarmEventsSchema = z.object({
  swarmId: z.string().uuid().describe('The swarm ID'),
  limit: z.number().min(1).max(500).optional().describe('Number of events to return (default: 50)'),
  eventTypes: z.array(z.string()).optional().describe('Filter by event types'),
  agentId: z.string().uuid().optional().describe('Filter by agent ID'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const swarmTools = {
  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_create
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_create: {
    name: 'ps_swarm_create',
    description: `Create a new market agent swarm for autonomous eBay bidding.

The swarm will deploy multiple agents with different bidding strategies:
- SNIPER: Waits until final seconds to bid
- EARLY_AGGRESSIVE: Bids high early to discourage competition
- NEGOTIATOR: Uses Best Offer with calculated concessions
- HYBRID: Dynamically selects optimal approach
- PASSIVE: Only bids on significantly underpriced items

Returns a swarm ID for use with other swarm commands.`,
    inputSchema: SwarmCreateSchema,
    handler: async (input: z.infer<typeof SwarmCreateSchema>) => {
      const controller = getSwarmController();

      // Parse strategy distribution if provided
      let strategyDistribution: Map<BiddingStrategy, number> | undefined;
      if (input.strategyDistribution) {
        strategyDistribution = new Map(
          Object.entries(input.strategyDistribution) as [BiddingStrategy, number][]
        );
      } else {
        strategyDistribution = getRecommendedDistribution(input.agentCount ?? 5);
      }

      // Build options
      const options: CreateSwarmOptions = {
        totalBudget: { value: input.totalBudget, currency: 'USD' },
        agentCount: input.agentCount ?? 5,
        strategyDistribution,
        targetCriteria: {
          searchTerms: input.searchTerms,
          maxPrice: input.maxPricePerItem,
          minPrice: input.minPricePerItem,
          conditions: input.conditions,
        },
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + (input.durationHours ?? 24) * 60 * 60 * 1000),
        },
      };

      const swarmId = await controller.createSwarm(options);

      return {
        success: true,
        swarmId,
        message: `Swarm created with ${input.agentCount ?? 5} agents and $${input.totalBudget} budget`,
        strategyDistribution: Object.fromEntries(strategyDistribution),
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_start
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_start: {
    name: 'ps_swarm_start',
    description: 'Start swarm operations. Agents will begin searching and bidding.',
    inputSchema: z.object({}),
    handler: async () => {
      const controller = getSwarmController();
      await controller.startSwarm();

      return {
        success: true,
        message: 'Swarm started - agents are now searching and bidding',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_pause
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_pause: {
    name: 'ps_swarm_pause',
    description: 'Pause swarm operations. Agents will stop searching but maintain their state.',
    inputSchema: z.object({}),
    handler: async () => {
      const controller = getSwarmController();
      await controller.pauseSwarm();

      return {
        success: true,
        message: 'Swarm paused - agents have stopped searching',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_terminate
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_terminate: {
    name: 'ps_swarm_terminate',
    description: 'Terminate the swarm and compute final insights.',
    inputSchema: z.object({
      reason: z.string().optional().describe('Reason for termination'),
    }),
    handler: async (input: { reason?: string }) => {
      const controller = getSwarmController();
      await controller.terminateSwarm(input.reason ?? 'Manual termination');

      return {
        success: true,
        message: 'Swarm terminated',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_status
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_status: {
    name: 'ps_swarm_status',
    description: 'Get current swarm status including budget, agents, and activity.',
    inputSchema: z.object({}),
    handler: async () => {
      const controller = getSwarmController();
      const status = controller.getStatus();

      if (!status) {
        return {
          success: false,
          error: 'No swarm configured',
        };
      }

      return {
        success: true,
        status: {
          swarmId: status.swarmId,
          status: status.status,
          activeAgents: status.activeAgents,
          budget: {
            total: status.budgetTotal.value,
            spent: status.budgetSpent.value,
            available: status.budgetAvailable.value,
            currency: status.budgetTotal.currency,
          },
          activity: {
            totalBids: status.totalBids,
            totalOffers: status.totalOffers,
            wonAuctions: status.wonAuctions,
            acceptedOffers: status.acceptedOffers,
            itemsAcquired: status.itemsAcquired,
          },
          timeRemaining: `${Math.floor(status.timeRemaining / 3600000)}h ${Math.floor((status.timeRemaining % 3600000) / 60000)}m`,
          lastActivity: status.lastActivity,
        },
        agents: controller.getAgentSummaries(),
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_agent_status
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_agent_status: {
    name: 'ps_swarm_agent_status',
    description: 'Get detailed status for a specific agent.',
    inputSchema: SwarmAgentStatusSchema,
    handler: async (input: z.infer<typeof SwarmAgentStatusSchema>) => {
      const controller = getSwarmController();
      const agentStatus = controller.getAgentStatus(input.agentId);

      if (!agentStatus) {
        return {
          success: false,
          error: `Agent ${input.agentId} not found`,
        };
      }

      return {
        success: true,
        agent: {
          agentId: input.agentId,
          status: agentStatus.status,
          budget: {
            remaining: agentStatus.remainingBudget.value,
            spent: agentStatus.totalSpent.value,
            currency: agentStatus.remainingBudget.currency,
          },
          activity: {
            activeBids: agentStatus.activeBids.length,
            activeOffers: agentStatus.activeOffers.length,
            wins: agentStatus.wins,
            losses: agentStatus.losses,
          },
          activeBids: agentStatus.activeBids,
          activeOffers: agentStatus.activeOffers,
        },
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_reallocate_budget
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_reallocate_budget: {
    name: 'ps_swarm_reallocate_budget',
    description: 'Reallocate budget from one agent to another.',
    inputSchema: SwarmReallocateSchema,
    handler: async (input: z.infer<typeof SwarmReallocateSchema>) => {
      // This would need budget allocator integration
      return {
        success: false,
        error: 'Budget reallocation not yet implemented through tools',
        note: 'Use performanceBasedReallocation() directly for now',
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_insights
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_insights: {
    name: 'ps_swarm_insights',
    description: `Get computed insights for the swarm.

Returns:
- Strategy rankings by effectiveness
- Cost efficiency metrics
- Concentration risk analysis (SPOF detection)
- Gaming pattern detection`,
    inputSchema: z.object({
      swarmId: z.string().uuid().describe('The swarm ID'),
    }),
    handler: async (input: { swarmId: string }) => {
      const insightComputer = getInsightComputer();

      try {
        const [strategyRanking, costEfficiency, concentrationRisk, gamingPatterns, performance] = await Promise.all([
          insightComputer.computeStrategyRanking(input.swarmId),
          insightComputer.computeCostEfficiency(input.swarmId),
          insightComputer.computeConcentrationRisk(input.swarmId),
          insightComputer.detectGamingPatterns(input.swarmId),
          insightComputer.computeSwarmPerformance(input.swarmId),
        ]);

        return {
          success: true,
          insights: {
            strategyRanking: {
              symbol: strategyRanking.symbol,
              rankings: strategyRanking.rankings,
              computedAt: strategyRanking.computedAt,
            },
            costEfficiency: {
              symbol: costEfficiency.symbol,
              totalSpent: costEfficiency.totalSpent,
              itemsAcquired: costEfficiency.itemsAcquired,
              avgCostPerItem: costEfficiency.avgCostPerItem,
              computedAt: costEfficiency.computedAt,
            },
            concentrationRisk: {
              symbol: concentrationRisk.symbol,
              riskLevel: concentrationRisk.riskLevel,
              hhi: concentrationRisk.hhi,
              recommendation: concentrationRisk.recommendation,
              computedAt: concentrationRisk.computedAt,
            },
            dataIntegrity: {
              hasAnomalies: gamingPatterns.hasAnomalies,
              severity: gamingPatterns.severity,
              patterns: gamingPatterns.patterns,
            },
            performance: performance.data,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to compute insights',
        };
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ps_swarm_events
  // ═══════════════════════════════════════════════════════════════════════════
  ps_swarm_events: {
    name: 'ps_swarm_events',
    description: 'Query event history for the swarm.',
    inputSchema: SwarmEventsSchema,
    handler: async (input: z.infer<typeof SwarmEventsSchema>) => {
      // Use the module function to query events
      const events = queryEvents({
        swarmId: input.swarmId,
        agentId: input.agentId,
        eventTypes: input.eventTypes,
        limit: input.limit ?? 50,
      });

      return {
        success: true,
        count: events.length,
        events: events.map(e => ({
          eventId: e.eventId,
          type: e.eventType,
          agentId: e.agentId,
          timestamp: e.timestamp,
          data: e.metadata ?? e.data ?? {},
        })),
      };
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all swarm tool definitions for MCP registration.
 */
export function getSwarmToolDefinitions() {
  return Object.values(swarmTools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute a swarm tool by name.
 */
export async function executeSwarmTool(
  toolName: string,
  input: unknown
): Promise<unknown> {
  const tool = swarmTools[toolName as keyof typeof swarmTools];

  if (!tool) {
    throw new Error(`Unknown swarm tool: ${toolName}`);
  }

  // Validate input
  const validatedInput = tool.inputSchema.parse(input);

  // Execute handler
  return tool.handler(validatedInput as any);
}
