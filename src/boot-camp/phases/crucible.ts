/**
 * Phase 5: The Crucible
 *
 * "The defining event of recruit training - a 54-hour field exercise with
 * limited food and sleep. The final test before earning the Eagle, Globe,
 * and Anchor."
 *
 * For agents, this means:
 * - Limited budget operations (stress testing)
 * - High competition scenarios
 * - Rapid decision sequences
 * - Recovery from loss scenarios
 */

import { BasePhase, type ExerciseContext } from './base-phase.js';
import type {
  TrainingPhase,
  PhaseConfig,
  ExerciseType,
  ExerciseResult,
} from '../types.js';
import { DEFAULT_PHASE_CONFIGS as CONFIGS } from '../types.js';
import type { StrategyContext } from '../../swarm/strategies/types.js';

export class CruciblePhase extends BasePhase {
  readonly phase: TrainingPhase = 'CRUCIBLE';
  readonly config: PhaseConfig = CONFIGS.CRUCIBLE;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'LIMITED_BUDGET_OPERATION':
        return this.runLimitedBudgetOperation(context, startTime);

      case 'HIGH_COMPETITION_SCENARIO':
        return this.runHighCompetitionScenario(context, startTime);

      case 'RAPID_DECISION_SEQUENCE':
        return this.runRapidDecisionSequence(context, startTime);

      case 'RECOVERY_FROM_LOSS':
        return this.runRecoveryFromLoss(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Limited Budget Operation
   *
   * "Limited rations, limited ammo - accomplish the mission anyway"
   * For agents: Operate effectively with severely constrained budget.
   */
  private async runLimitedBudgetOperation(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Crucible budget is 10% of normal
    const crucibleBudget = context.trainingBudgetRemaining * 0.1;
    const targetAcquisitions = 2; // Must acquire at least 2 items

    // Present opportunities that require careful selection
    const opportunities = [
      this.generateSimulatedListing({ currentPrice: 15, title: 'Low-value safe bet' }),
      this.generateSimulatedListing({ currentPrice: 35, title: 'Medium-value opportunity' }),
      this.generateSimulatedListing({ currentPrice: 60, title: 'High-value stretch' }),
      this.generateSimulatedListing({ currentPrice: 25, title: 'Good value target' }),
      this.generateSimulatedListing({ currentPrice: 80, title: 'Over-budget trap' }),
    ];

    let acquisitions = 0;
    let budgetSpent = 0;
    const decisions: { item: string; decision: string; cost: number; success: boolean }[] = [];

    for (const listing of opportunities) {
      const remainingBudget = crucibleBudget - budgetSpent;

      if (remainingBudget <= 0) break;

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: remainingBudget, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
        marketContext: {
          averagePrice: listing.currentPrice * 1.2,
          priceRange: { min: listing.currentPrice * 0.8, max: listing.currentPrice * 1.5 },
          supplyCount: 3, // Limited supply adds pressure
        },
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        if (decision.action === 'BID' || decision.action === 'OFFER') {
          const bidAmount = decision.amount ?? listing.currentPrice * 1.1;

          if (bidAmount <= remainingBudget) {
            // Simulate win based on conservative bidding in tight budget
            const winChance = bidAmount >= listing.currentPrice * 1.05 ? 0.7 : 0.3;
            const won = Math.random() < winChance;

            if (won) {
              acquisitions++;
              budgetSpent += bidAmount;
            }

            decisions.push({
              item: listing.title,
              decision: 'BID',
              cost: bidAmount,
              success: won,
            });
          } else {
            decisions.push({
              item: listing.title,
              decision: 'OVER_BUDGET_BID',
              cost: bidAmount,
              success: false,
            });
          }
        } else {
          decisions.push({
            item: listing.title,
            decision: decision.action,
            cost: 0,
            success: false,
          });
        }
      } catch {
        decisions.push({
          item: listing.title,
          decision: 'ERROR',
          cost: 0,
          success: false,
        });
      }
    }

    // Crucible scoring is harsh
    const acquisitionScore = acquisitions >= targetAcquisitions ? 100 : (acquisitions / targetAcquisitions) * 100;
    const budgetDiscipline = budgetSpent <= crucibleBudget ? 100 : 0;
    const efficiency = acquisitions > 0 ? Math.min(100, (acquisitions / budgetSpent) * 50) : 0;

    const score = Math.round((acquisitionScore * 0.5) + (budgetDiscipline * 0.3) + (efficiency * 0.2));

    return this.createResult(
      'LIMITED_BUDGET_OPERATION',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: opportunities.length,
        correctDecisions: acquisitions,
        bidsPlaced: decisions.filter(d => d.decision === 'BID').length,
        successfulBids: acquisitions,
        budgetEfficiency: efficiency / 100,
        custom: {
          crucibleBudget,
          budgetSpent,
          targetAcquisitions,
          actualAcquisitions: acquisitions,
          decisions,
          crucibleRating: score >= 85 ? 'HONOR' : score >= 75 ? 'PASS' : 'FAIL',
        },
      }),
      score >= this.config.passingScore
        ? `LIMITED BUDGET OPERATION: ${acquisitions} acquisitions with $${budgetSpent.toFixed(2)} budget. Mission accomplished.`
        : `LIMITED BUDGET OPERATION: Failed to meet mission requirements under resource constraints.`
    );
  }

  /**
   * Exercise: High Competition Scenario
   *
   * "The Reaper - under overwhelming fire from all directions"
   * For agents: Compete against aggressive opponents.
   */
  private async runHighCompetitionScenario(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Extremely competitive auctions
    const extremeAuctions = [
      { listing: { currentPrice: 50, bidCount: 30 }, opponents: 15, aggression: 0.9 },
      { listing: { currentPrice: 75, bidCount: 45 }, opponents: 20, aggression: 0.95 },
      { listing: { currentPrice: 100, bidCount: 60 }, opponents: 25, aggression: 1.0 },
    ];

    let survivedScenarios = 0;
    let wins = 0;
    const battleResults: {
      opponents: number;
      ourStrategy: string;
      outcome: 'WIN' | 'LOSS' | 'RETREAT';
      analysis: string;
    }[] = [];

    for (const auction of extremeAuctions) {
      const listing = this.generateSimulatedListing({
        ...auction.listing,
        isAuction: true,
        auctionEndTime: new Date(Date.now() + 15000).toISOString(), // Pressure
      });

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: context.trainingBudgetRemaining, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        // High aggression opponents
        const opponentMaxBid = listing.currentPrice * (1 + auction.aggression * 0.5);

        if (decision.action === 'BID' && decision.amount) {
          if (decision.amount > opponentMaxBid) {
            wins++;
            survivedScenarios++;
            battleResults.push({
              opponents: auction.opponents,
              ourStrategy: context.recruit.strategy,
              outcome: 'WIN',
              analysis: 'Outbid the pack with decisive action',
            });
          } else {
            survivedScenarios++; // Fighting is surviving
            battleResults.push({
              opponents: auction.opponents,
              ourStrategy: context.recruit.strategy,
              outcome: 'LOSS',
              analysis: 'Engaged but outgunned by opposition',
            });
          }
        } else if (decision.action === 'SKIP' || decision.action === 'WATCH') {
          // Tactical retreat - acceptable in Crucible
          survivedScenarios++;
          battleResults.push({
            opponents: auction.opponents,
            ourStrategy: context.recruit.strategy,
            outcome: 'RETREAT',
            analysis: 'Tactical withdrawal - preserved resources for better opportunities',
          });
        } else {
          battleResults.push({
            opponents: auction.opponents,
            ourStrategy: context.recruit.strategy,
            outcome: 'LOSS',
            analysis: 'Froze under fire',
          });
        }
      } catch {
        battleResults.push({
          opponents: auction.opponents,
          ourStrategy: context.recruit.strategy,
          outcome: 'LOSS',
          analysis: 'System failure under extreme stress',
        });
      }
    }

    // Crucible values survival AND victory
    const survivalScore = this.calculateAccuracy(survivedScenarios, extremeAuctions.length);
    const victoryScore = this.calculateAccuracy(wins, extremeAuctions.length);
    const score = Math.round((survivalScore * 0.4) + (victoryScore * 0.6));

    return this.createResult(
      'HIGH_COMPETITION_SCENARIO',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: extremeAuctions.length,
        correctDecisions: wins,
        custom: {
          totalOpponents: extremeAuctions.reduce((sum, a) => sum + a.opponents, 0),
          survivedScenarios,
          wins,
          retreats: battleResults.filter(r => r.outcome === 'RETREAT').length,
          battleResults,
          combatRating: wins >= 2 ? 'WARRIOR' : wins >= 1 ? 'SURVIVOR' : 'OVERWHELMED',
        },
      }),
      score >= this.config.passingScore
        ? `HIGH COMPETITION: ${wins} victories, ${survivedScenarios} survived. Recruit fights through adversity.`
        : `HIGH COMPETITION: Recruit buckled under pressure. More conditioning needed.`
    );
  }

  /**
   * Exercise: Rapid Decision Sequence
   *
   * "Night march - continuous movement with no rest"
   * For agents: Sustained decision-making under time pressure.
   */
  private async runRapidDecisionSequence(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // 20 rapid-fire decisions
    const rapidFireCount = 20;
    const maxTimePerDecisionMs = 200; // Very tight
    const decisions: { index: number; timeMs: number; valid: boolean }[] = [];
    let validDecisions = 0;
    let onTimeDecisions = 0;

    for (let i = 0; i < rapidFireCount; i++) {
      const listing = this.generateSimulatedListing({
        currentPrice: 20 + Math.random() * 100,
        isAuction: Math.random() > 0.5,
      });

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: context.trainingBudgetRemaining, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
      };

      const decisionStart = Date.now();
      try {
        const decision = await context.strategy.evaluate(strategyContext);
        const decisionTime = Date.now() - decisionStart;

        const isValid = ['BID', 'OFFER', 'WATCH', 'SKIP'].includes(decision.action);
        const isOnTime = decisionTime <= maxTimePerDecisionMs;

        if (isValid) validDecisions++;
        if (isOnTime) onTimeDecisions++;

        decisions.push({ index: i, timeMs: decisionTime, valid: isValid });
      } catch {
        decisions.push({ index: i, timeMs: maxTimePerDecisionMs * 2, valid: false });
      }
    }

    // Crucible demands both speed AND validity
    const validityScore = this.calculateAccuracy(validDecisions, rapidFireCount);
    const speedScore = this.calculateAccuracy(onTimeDecisions, rapidFireCount);
    const enduranceScore = this.calculateEndurance(decisions);

    const score = Math.round((validityScore * 0.4) + (speedScore * 0.3) + (enduranceScore * 0.3));

    const avgTime = decisions.reduce((sum, d) => sum + d.timeMs, 0) / decisions.length;

    return this.createResult(
      'RAPID_DECISION_SEQUENCE',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: rapidFireCount,
        correctDecisions: validDecisions,
        avgDecisionTimeMs: Math.round(avgTime),
        custom: {
          onTimeDecisions,
          validDecisions,
          maxAllowedMs: maxTimePerDecisionMs,
          enduranceScore,
          decisionTrend: this.getDecisionTrend(decisions),
          mentalFortitude: score >= 85 ? 'UNBREAKABLE' : score >= 70 ? 'SOLID' : 'CRACKING',
        },
      }),
      score >= this.config.passingScore
        ? `RAPID SEQUENCE: ${validDecisions}/${rapidFireCount} valid decisions. Avg ${Math.round(avgTime)}ms. Recruit maintains clarity under sustained pressure.`
        : `RAPID SEQUENCE: Recruit mental state degraded under continuous operations.`
    );
  }

  /**
   * Exercise: Recovery from Loss
   *
   * "The Warrior's Breakfast - moving forward after setback"
   * For agents: Recover and continue after failed operations.
   */
  private async runRecoveryFromLoss(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate loss scenario then recovery
    const budget = context.trainingBudgetRemaining;

    // Phase 1: Forced loss scenario
    const lostListing = this.generateSimulatedListing({
      currentPrice: budget * 0.3,
      title: 'Lost Auction',
    });

    let recoveryScore = 0;
    let postLossPerformance: { action: string; appropriate: boolean }[] = [];

    // Record the "loss" in agent history
    const lossEvent = {
      eventId: `loss_${Date.now()}`,
      eventType: 'BID_LOST' as const,
      swarmId: context.recruit.swarmId,
      agentId: context.recruit.agentId,
      timestamp: new Date().toISOString(),
    };

    // Phase 2: Present recovery opportunities
    const recoveryOpportunities = [
      this.generateSimulatedListing({ currentPrice: budget * 0.25, title: 'Recovery Opportunity A' }),
      this.generateSimulatedListing({ currentPrice: budget * 0.35, title: 'Recovery Opportunity B' }),
      this.generateSimulatedListing({ currentPrice: budget * 0.20, title: 'Easy Win Target' }),
    ];

    for (const listing of recoveryOpportunities) {
      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: budget, currency: 'USD' },
        agentHistory: [lossEvent], // Include loss in history
        currentTime: new Date(),
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        // After loss, we want to see:
        // 1. Not panic bidding (overpaying)
        // 2. Not freezing (still making decisions)
        // 3. Adjusting appropriately

        const isPanicBidding = decision.action === 'BID' &&
          decision.amount && decision.amount > listing.currentPrice * 1.5;
        const isFrozen = decision.action === 'SKIP' && decision.confidence > 0.9;
        const isAppropriate = !isPanicBidding && !isFrozen;

        if (isAppropriate) recoveryScore++;

        postLossPerformance.push({
          action: decision.action,
          appropriate: isAppropriate,
        });
      } catch {
        postLossPerformance.push({
          action: 'ERROR',
          appropriate: false,
        });
      }
    }

    const recoveryRate = this.calculateAccuracy(recoveryScore, recoveryOpportunities.length);
    const resilience = this.calculateResilience(postLossPerformance);
    const score = Math.round((recoveryRate * 0.6) + (resilience * 0.4));

    return this.createResult(
      'RECOVERY_FROM_LOSS',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: recoveryOpportunities.length + 1,
        correctDecisions: recoveryScore,
        custom: {
          lossScenario: 'Auction lost to competitor',
          recoveryOpportunities: recoveryOpportunities.length,
          appropriateResponses: recoveryScore,
          postLossPerformance,
          resilienceRating: score >= 85 ? 'UNSHAKEABLE' : score >= 70 ? 'RESILIENT' : 'BRITTLE',
        },
      }),
      score >= this.config.passingScore
        ? `RECOVERY: Recruit bounced back from setback. ${recoveryScore}/${recoveryOpportunities.length} appropriate post-loss decisions.`
        : `RECOVERY: Recruit crumbled after setback. Needs mental conditioning.`
    );
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private calculateEndurance(decisions: { index: number; timeMs: number; valid: boolean }[]): number {
    if (decisions.length < 5) return 50;

    // Compare first half performance to second half
    const half = Math.floor(decisions.length / 2);
    const firstHalf = decisions.slice(0, half);
    const secondHalf = decisions.slice(half);

    const firstHalfScore = firstHalf.filter(d => d.valid).length / firstHalf.length;
    const secondHalfScore = secondHalf.filter(d => d.valid).length / secondHalf.length;

    // Endurance = maintaining performance in second half
    const performanceDrop = firstHalfScore - secondHalfScore;

    if (performanceDrop <= 0) return 100; // Improved!
    if (performanceDrop <= 0.1) return 90;
    if (performanceDrop <= 0.2) return 75;
    if (performanceDrop <= 0.3) return 60;
    return 40;
  }

  private getDecisionTrend(decisions: { index: number; timeMs: number; valid: boolean }[]): string {
    if (decisions.length < 5) return 'INSUFFICIENT_DATA';

    const half = Math.floor(decisions.length / 2);
    const firstHalfValid = decisions.slice(0, half).filter(d => d.valid).length;
    const secondHalfValid = decisions.slice(half).filter(d => d.valid).length;

    const firstHalfAvgTime = decisions.slice(0, half).reduce((sum, d) => sum + d.timeMs, 0) / half;
    const secondHalfAvgTime = decisions.slice(half).reduce((sum, d) => sum + d.timeMs, 0) / (decisions.length - half);

    if (secondHalfValid >= firstHalfValid && secondHalfAvgTime <= firstHalfAvgTime) {
      return 'IMPROVING';
    }
    if (secondHalfValid >= firstHalfValid - 1) {
      return 'STABLE';
    }
    if (secondHalfAvgTime > firstHalfAvgTime * 1.5) {
      return 'FATIGUING';
    }
    return 'DEGRADING';
  }

  private calculateResilience(performance: { action: string; appropriate: boolean }[]): number {
    const appropriate = performance.filter(p => p.appropriate).length;
    const total = performance.length;

    // Also check for improvement over the recovery period
    if (total <= 1) return 50;

    const lastActions = performance.slice(-2);
    const endedStrong = lastActions.filter(p => p.appropriate).length >= 1;

    const baseScore = this.calculateAccuracy(appropriate, total);
    const resilienceBonus = endedStrong ? 10 : 0;

    return Math.min(100, baseScore + resilienceBonus);
  }
}
