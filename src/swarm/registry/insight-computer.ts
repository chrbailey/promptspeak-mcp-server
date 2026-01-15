/**
 * Insight Computer
 *
 * Computes derived metrics from immutable event streams.
 * CRITICAL: All insights are computed, never self-reported.
 *
 * Anti-Gaming Design:
 * - No agent can report its own success
 * - All metrics derived from transaction history
 * - Detects gaming patterns (e.g., round numbers, copy-paste)
 */

import type {
  SwarmEvent,
  BiddingStrategy,
  ComputedInsight,
  AgentEffectivenessInsight,
  StrategyRankingInsight,
  CostEfficiencyInsight,
  ConcentrationRiskInsight,
} from '../types.js';
import { getSwarmDatabase } from '../database.js';
import { INSIGHT_SYMBOLS, createInsightSymbol } from './symbol-mapper.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface EventStats {
  bidsPlaced: number;
  bidsWon: number;
  bidsLost: number;
  offersSubmitted: number;
  offersAccepted: number;
  offersDeclined: number;
  offersCountered: number;
  itemsAcquired: number;
  totalSpent: number;
  errors: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSIGHT COMPUTER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class InsightComputer {
  private database = getSwarmDatabase();

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT EFFECTIVENESS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute agent effectiveness from event history.
   * NEVER trust self-reported data.
   */
  async computeAgentEffectiveness(
    agentId: string,
    swarmId: string
  ): Promise<AgentEffectivenessInsight> {
    const events = await this.database.getEventsForAgent(agentId);
    const stats = this.computeEventStats(events);

    // Calculate success metrics
    const totalAttempts = stats.bidsPlaced + stats.offersSubmitted;
    const totalSuccesses = stats.bidsWon + stats.offersAccepted;
    const successRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;

    // Calculate bid/offer specific rates
    const bidWinRate = stats.bidsPlaced > 0 ? stats.bidsWon / stats.bidsPlaced : 0;
    const offerAcceptRate = stats.offersSubmitted > 0 ? stats.offersAccepted / stats.offersSubmitted : 0;

    // Calculate average acquisition cost
    const avgAcquisitionCost = stats.itemsAcquired > 0
      ? stats.totalSpent / stats.itemsAcquired
      : 0;

    return {
      agentId,
      swarmId,
      successRate,
      bidWinRate,
      offerAcceptRate,
      totalAttempts,
      totalSuccesses,
      avgAcquisitionCost,
      computedAt: new Date(),
      symbol: createInsightSymbol('AGENT_SUCCESS_RATE', { agentId }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY RANKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rank strategies by effectiveness across the swarm.
   */
  async computeStrategyRanking(swarmId: string): Promise<StrategyRankingInsight> {
    const agents = await this.database.getAgentsForSwarm(swarmId);
    const strategyStats = new Map<BiddingStrategy, {
      totalAttempts: number;
      totalSuccesses: number;
      totalSpent: number;
      itemsAcquired: number;
      agents: number;
    }>();

    // Aggregate stats by strategy
    for (const agent of agents) {
      const events = await this.database.getEventsForAgent(agent.agent_id);
      const stats = this.computeEventStats(events);
      const strategy = agent.strategy as BiddingStrategy;

      const existing = strategyStats.get(strategy) ?? {
        totalAttempts: 0,
        totalSuccesses: 0,
        totalSpent: 0,
        itemsAcquired: 0,
        agents: 0,
      };

      strategyStats.set(strategy, {
        totalAttempts: existing.totalAttempts + stats.bidsPlaced + stats.offersSubmitted,
        totalSuccesses: existing.totalSuccesses + stats.bidsWon + stats.offersAccepted,
        totalSpent: existing.totalSpent + stats.totalSpent,
        itemsAcquired: existing.itemsAcquired + stats.itemsAcquired,
        agents: existing.agents + 1,
      });
    }

    // Calculate rankings
    const rankings: Array<{
      strategy: BiddingStrategy;
      successRate: number;
      costEfficiency: number;
      overallScore: number;
    }> = [];

    for (const [strategy, stats] of strategyStats) {
      const successRate = stats.totalAttempts > 0
        ? stats.totalSuccesses / stats.totalAttempts
        : 0;
      const costEfficiency = stats.totalSpent > 0
        ? stats.itemsAcquired / stats.totalSpent
        : 0;

      // Weighted overall score
      const overallScore = successRate * 0.6 + (costEfficiency * 100) * 0.4;

      rankings.push({
        strategy,
        successRate,
        costEfficiency,
        overallScore,
      });
    }

    // Sort by overall score descending
    rankings.sort((a, b) => b.overallScore - a.overallScore);

    return {
      swarmId,
      rankings,
      computedAt: new Date(),
      symbol: createInsightSymbol('STRATEGY_RANKING', { swarmId }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COST EFFICIENCY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute cost efficiency metrics.
   */
  async computeCostEfficiency(swarmId: string): Promise<CostEfficiencyInsight> {
    const events = await this.database.getEventsForSwarm(swarmId);
    const stats = this.computeEventStats(events);

    // Calculate per-item cost
    const avgCostPerItem = stats.itemsAcquired > 0
      ? stats.totalSpent / stats.itemsAcquired
      : 0;

    // Calculate cost per attempt
    const totalAttempts = stats.bidsPlaced + stats.offersSubmitted;
    const avgCostPerAttempt = totalAttempts > 0
      ? stats.totalSpent / totalAttempts
      : 0;

    // Extract amounts from events for distribution analysis
    const amounts = events
      .filter(e => e.event_type === 'BID_WON' || e.event_type === 'OFFER_ACCEPTED')
      .map(e => {
        const data = JSON.parse(e.event_data);
        return data.amount ?? 0;
      })
      .filter(a => a > 0);

    const minCost = amounts.length > 0 ? Math.min(...amounts) : 0;
    const maxCost = amounts.length > 0 ? Math.max(...amounts) : 0;

    return {
      swarmId,
      totalSpent: stats.totalSpent,
      itemsAcquired: stats.itemsAcquired,
      avgCostPerItem,
      avgCostPerAttempt,
      minAcquisitionCost: minCost,
      maxAcquisitionCost: maxCost,
      computedAt: new Date(),
      symbol: createInsightSymbol('AGENT_COST_EFFICIENCY', { swarmId }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCENTRATION RISK (SPOF Detection)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect concentration risks - single points of failure.
   */
  async computeConcentrationRisk(swarmId: string): Promise<ConcentrationRiskInsight> {
    const agents = await this.database.getAgentsForSwarm(swarmId);
    const agentMetrics: Array<{ agentId: string; successCount: number; spendRatio: number }> = [];

    let totalSuccesses = 0;
    let totalSpent = 0;

    // Gather metrics
    for (const agent of agents) {
      const events = await this.database.getEventsForAgent(agent.agent_id);
      const stats = this.computeEventStats(events);

      const successCount = stats.bidsWon + stats.offersAccepted;
      totalSuccesses += successCount;
      totalSpent += stats.totalSpent;

      agentMetrics.push({
        agentId: agent.agent_id,
        successCount,
        spendRatio: agent.budget_spent / agent.budget_allocated,
      });
    }

    // Calculate concentration metrics
    const successShares = agentMetrics.map(a => ({
      agentId: a.agentId,
      share: totalSuccesses > 0 ? a.successCount / totalSuccesses : 0,
    }));

    // Herfindahl-Hirschman Index (HHI) for concentration
    const hhi = successShares.reduce((sum, a) => sum + a.share * a.share, 0);

    // Identify SPOF (>50% share) or high concentration (>30%)
    const spofAgents = successShares.filter(a => a.share > 0.5);
    const highConcentrationAgents = successShares.filter(a => a.share > 0.3 && a.share <= 0.5);

    // Risk level determination
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (spofAgents.length > 0) {
      riskLevel = 'CRITICAL';
    } else if (highConcentrationAgents.length > 0 || hhi > 0.25) {
      riskLevel = 'HIGH';
    } else if (hhi > 0.15) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return {
      swarmId,
      hhi,
      riskLevel,
      spofAgents: spofAgents.map(a => a.agentId),
      highConcentrationAgents: highConcentrationAgents.map(a => a.agentId),
      agentShares: successShares,
      recommendation: this.generateConcentrationRecommendation(riskLevel, spofAgents.length),
      computedAt: new Date(),
      symbol: createInsightSymbol('CONCENTRATION_RISK', { swarmId }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWARM PERFORMANCE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute overall swarm performance.
   */
  async computeSwarmPerformance(swarmId: string): Promise<ComputedInsight> {
    const events = await this.database.getEventsForSwarm(swarmId);
    const stats = this.computeEventStats(events);
    const swarm = await this.database.getSwarm(swarmId);

    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const config = JSON.parse(swarm.config);
    const budgetUtilization = swarm.total_budget > 0
      ? swarm.spent_budget / swarm.total_budget
      : 0;

    const totalAttempts = stats.bidsPlaced + stats.offersSubmitted;
    const totalSuccesses = stats.bidsWon + stats.offersAccepted;
    const successRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;

    return {
      symbol: createInsightSymbol('SWARM_PERFORMANCE', { swarmId }),
      computedAt: new Date(),
      data: {
        swarmId,
        status: swarm.status,
        budgetUtilization,
        successRate,
        totalAttempts,
        totalSuccesses,
        itemsAcquired: stats.itemsAcquired,
        totalSpent: stats.totalSpent,
        agentsActive: swarm.agents_active,
        agentsConfigured: config.agentCount,
        errorRate: totalAttempts > 0 ? stats.errors / totalAttempts : 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANTI-GAMING: PATTERN DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect potential gaming patterns in event data.
   */
  async detectGamingPatterns(swarmId: string): Promise<{
    hasAnomalies: boolean;
    patterns: string[];
    severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  }> {
    const events = await this.database.getEventsForSwarm(swarmId);
    const patterns: string[] = [];

    // Check for round number bids (potential manual intervention)
    const bidEvents = events.filter(e => e.event_type === 'BID_PLACED');
    const roundNumberCount = bidEvents.filter(e => {
      const data = JSON.parse(e.event_data);
      const amount = data.amount ?? 0;
      return amount > 0 && amount % 10 === 0;
    }).length;

    if (bidEvents.length > 5 && roundNumberCount / bidEvents.length > 0.7) {
      patterns.push('HIGH_ROUND_NUMBER_BIDS: 70%+ of bids are round numbers');
    }

    // Check for identical timestamps (copy-paste data)
    const timestamps = events.map(e => e.timestamp);
    const duplicateTimestamps = timestamps.filter(
      (t, i) => timestamps.indexOf(t) !== i
    );

    if (duplicateTimestamps.length > events.length * 0.1) {
      patterns.push('DUPLICATE_TIMESTAMPS: >10% of events share timestamps');
    }

    // Check for suspiciously high success rate
    const stats = this.computeEventStats(events);
    const totalAttempts = stats.bidsPlaced + stats.offersSubmitted;
    const totalSuccesses = stats.bidsWon + stats.offersAccepted;
    const successRate = totalAttempts > 0 ? totalSuccesses / totalAttempts : 0;

    if (totalAttempts > 10 && successRate > 0.9) {
      patterns.push('SUSPICIOUSLY_HIGH_SUCCESS: >90% success rate with >10 attempts');
    }

    // Determine severity
    let severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
    if (patterns.length >= 3) severity = 'HIGH';
    else if (patterns.length === 2) severity = 'MEDIUM';
    else if (patterns.length === 1) severity = 'LOW';

    return {
      hasAnomalies: patterns.length > 0,
      patterns,
      severity,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute statistics from event list.
   */
  private computeEventStats(events: Array<{ event_type: string; event_data: string }>): EventStats {
    const stats: EventStats = {
      bidsPlaced: 0,
      bidsWon: 0,
      bidsLost: 0,
      offersSubmitted: 0,
      offersAccepted: 0,
      offersDeclined: 0,
      offersCountered: 0,
      itemsAcquired: 0,
      totalSpent: 0,
      errors: 0,
    };

    for (const event of events) {
      switch (event.event_type) {
        case 'BID_PLACED':
          stats.bidsPlaced++;
          break;
        case 'BID_WON':
          stats.bidsWon++;
          break;
        case 'BID_LOST':
        case 'BID_OUTBID':
          stats.bidsLost++;
          break;
        case 'OFFER_SUBMITTED':
          stats.offersSubmitted++;
          break;
        case 'OFFER_ACCEPTED':
          stats.offersAccepted++;
          break;
        case 'OFFER_DECLINED':
          stats.offersDeclined++;
          break;
        case 'OFFER_COUNTERED':
          stats.offersCountered++;
          break;
        case 'ITEM_ACQUIRED': {
          stats.itemsAcquired++;
          const data = JSON.parse(event.event_data);
          stats.totalSpent += data.cost ?? 0;
          break;
        }
        case 'ERROR':
        case 'RATE_LIMITED':
          stats.errors++;
          break;
      }
    }

    return stats;
  }

  /**
   * Generate recommendation for concentration risk.
   */
  private generateConcentrationRecommendation(
    riskLevel: string,
    spofCount: number
  ): string {
    switch (riskLevel) {
      case 'CRITICAL':
        return `CRITICAL: ${spofCount} agent(s) account for >50% of successes. ` +
          `Reallocate budget to diversify across strategies.`;
      case 'HIGH':
        return `HIGH RISK: Concentration detected. Consider adding more agents ` +
          `or redistributing budget more evenly.`;
      case 'MEDIUM':
        return `MODERATE RISK: Some concentration present. Monitor and consider ` +
          `rebalancing if trend continues.`;
      default:
        return `LOW RISK: Success is well-distributed across agents. ` +
          `Current configuration appears balanced.`;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let insightComputerInstance: InsightComputer | null = null;

/**
 * Get the insight computer singleton.
 */
export function getInsightComputer(): InsightComputer {
  if (!insightComputerInstance) {
    insightComputerInstance = new InsightComputer();
  }
  return insightComputerInstance;
}
