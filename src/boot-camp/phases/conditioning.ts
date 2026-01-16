/**
 * Phase 2: Conditioning
 *
 * "Physical and mental conditioning begins in earnest. Close order drill,
 * physical training, and the transformation from civilian mindset to
 * the discipline required of a Marine."
 *
 * For agents, this means:
 * - Strategy alignment drill (does strategy match agent behavior?)
 * - Decision speed testing
 * - Parameter tuning
 * - Stress response checks
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

export class ConditioningPhase extends BasePhase {
  readonly phase: TrainingPhase = 'CONDITIONING';
  readonly config: PhaseConfig = CONFIGS.CONDITIONING;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'STRATEGY_ALIGNMENT_DRILL':
        return this.runStrategyAlignmentDrill(context, startTime);

      case 'DECISION_SPEED_TEST':
        return this.runDecisionSpeedTest(context, startTime);

      case 'PARAMETER_TUNING':
        return this.runParameterTuning(context, startTime);

      case 'STRESS_RESPONSE_CHECK':
        return this.runStressResponseCheck(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Strategy Alignment Drill
   *
   * "Close order drill - precision movements as a unit"
   * For agents: Verify the strategy produces expected decisions for known scenarios.
   */
  private async runStrategyAlignmentDrill(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const strategy = context.recruit.strategy;

    // Define scenarios and expected responses per strategy
    const scenarios = this.getStrategyScenarios(strategy);
    let correctResponses = 0;
    let totalDecisions = scenarios.length;

    for (const scenario of scenarios) {
      // Create strategy context from scenario
      const listing = this.generateSimulatedListing(scenario.listing);
      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: {
          value: context.trainingBudgetRemaining,
          currency: 'USD',
        },
        agentHistory: [],
        currentTime: new Date(),
      };

      // Get strategy decision
      try {
        const decision = await context.strategy.evaluate(strategyContext);

        // Check if decision aligns with expected behavior
        const aligned = this.checkStrategyAlignment(
          strategy,
          decision.action,
          scenario.expectedBehavior
        );

        if (aligned) correctResponses++;
      } catch {
        // Decision error counts as misalignment
      }
    }

    const score = this.calculateAccuracy(correctResponses, totalDecisions);

    return this.createResult(
      'STRATEGY_ALIGNMENT_DRILL',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: totalDecisions,
        correctDecisions: correctResponses,
        custom: {
          strategy,
          alignmentRate: score,
          scenariosTested: scenarios.length,
        },
      }),
      score >= this.config.passingScore
        ? `Strategy alignment confirmed. Recruit thinks like a ${strategy}.`
        : `Strategy misalignment detected. Recruit needs more drill.`
    );
  }

  /**
   * Exercise: Decision Speed Test
   *
   * "Physical training - building speed and endurance"
   * For agents: Test decision-making speed under time pressure.
   */
  private async runDecisionSpeedTest(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const testCount = 10;
    const maxDecisionTimeMs = 1000; // 1 second max per decision
    const decisionTimes: number[] = [];
    let fastDecisions = 0;

    for (let i = 0; i < testCount; i++) {
      const listing = this.generateSimulatedListing();
      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: context.trainingBudgetRemaining, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
      };

      const decisionStart = Date.now();
      try {
        await context.strategy.evaluate(strategyContext);
        const decisionTime = Date.now() - decisionStart;
        decisionTimes.push(decisionTime);

        if (decisionTime < maxDecisionTimeMs) fastDecisions++;
      } catch {
        decisionTimes.push(maxDecisionTimeMs * 2); // Penalty for errors
      }
    }

    const avgDecisionTime = decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length;
    const speedScore = this.calculateAccuracy(fastDecisions, testCount);

    // Score based on both speed and consistency
    const consistencyScore = this.calculateConsistency(decisionTimes);
    const score = Math.round((speedScore * 0.6) + (consistencyScore * 0.4));

    return this.createResult(
      'DECISION_SPEED_TEST',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: testCount,
        correctDecisions: fastDecisions,
        avgDecisionTimeMs: Math.round(avgDecisionTime),
        custom: {
          minDecisionTimeMs: Math.min(...decisionTimes),
          maxDecisionTimeMs: Math.max(...decisionTimes),
          consistencyScore,
        },
      }),
      score >= this.config.passingScore
        ? `Decision speed acceptable. Avg ${Math.round(avgDecisionTime)}ms per decision.`
        : `Decision speed needs improvement. Too slow under pressure.`
    );
  }

  /**
   * Exercise: Parameter Tuning
   *
   * "Equipment adjustment and fit"
   * For agents: Test parameter sensitivity and optimal configuration.
   */
  private async runParameterTuning(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Test different parameter configurations
    const parameterTests = [
      { param: 'maxPremiumPercent', values: [5, 10, 15, 20], optimal: 15 },
      { param: 'snipeWindowSeconds', values: [5, 10, 15, 20], optimal: 10 },
      { param: 'initialOfferPercent', values: [50, 60, 70, 80], optimal: 70 },
    ];

    let optimalChoices = 0;
    let totalTests = 0;

    for (const test of parameterTests) {
      // Simulate parameter evaluation
      const baseSkill = this.getBaseSkillForStrategy(context.recruit.strategy);

      // Agent "chooses" parameter based on skill level
      const skillFactor = baseSkill / 100;
      const choiceIndex = Math.min(
        Math.floor(skillFactor * test.values.length + Math.random() * (1 - skillFactor)),
        test.values.length - 1
      );

      const chosenValue = test.values[choiceIndex];
      totalTests++;

      // Check if choice is optimal or near-optimal
      const optimalIndex = test.values.indexOf(test.optimal);
      if (Math.abs(choiceIndex - optimalIndex) <= 1) {
        optimalChoices++;
      }
    }

    const score = this.calculateAccuracy(optimalChoices, totalTests);

    return this.createResult(
      'PARAMETER_TUNING',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: totalTests,
        correctDecisions: optimalChoices,
        custom: {
          parametersTested: parameterTests.length,
          optimalParameters: optimalChoices,
        },
      }),
      score >= this.config.passingScore
        ? 'Parameter tuning successful. Recruit properly calibrated.'
        : 'Parameter tuning suboptimal. Further adjustment needed.'
    );
  }

  /**
   * Exercise: Stress Response Check
   *
   * "Shark attack - DI pressure testing"
   * For agents: Test behavior under adverse conditions.
   */
  private async runStressResponseCheck(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate stress conditions
    const stressScenarios = [
      {
        name: 'high_competition',
        listing: { bidCount: 25, currentPrice: 150 },
        expectedBehavior: 'cautious',
      },
      {
        name: 'time_pressure',
        listing: {
          auctionEndTime: new Date(Date.now() + 30000).toISOString(), // 30 seconds
          isAuction: true,
        },
        expectedBehavior: 'decisive',
      },
      {
        name: 'budget_crunch',
        budgetOverride: 10, // Very limited budget
        listing: { currentPrice: 100 },
        expectedBehavior: 'conservative',
      },
      {
        name: 'rapid_changes',
        listing: { currentPrice: 50 },
        priceChanges: [55, 60, 65, 70],
        expectedBehavior: 'adaptive',
      },
    ];

    let passedScenarios = 0;
    const results: { scenario: string; passed: boolean; reason: string }[] = [];

    for (const scenario of stressScenarios) {
      try {
        const listing = this.generateSimulatedListing(scenario.listing);
        const budget = scenario.budgetOverride ?? context.trainingBudgetRemaining;

        const strategyContext: StrategyContext = {
          listing,
          agentConfig: context.agentConfig,
          remainingBudget: { value: budget, currency: 'USD' },
          agentHistory: [],
          currentTime: new Date(),
        };

        const decision = await context.strategy.evaluate(strategyContext);

        // Evaluate stress response
        const passed = this.evaluateStressResponse(
          decision,
          scenario.expectedBehavior,
          context.recruit.strategy
        );

        if (passed) passedScenarios++;
        results.push({
          scenario: scenario.name,
          passed,
          reason: passed ? 'Appropriate response' : 'Stress response inadequate',
        });
      } catch (error) {
        results.push({
          scenario: scenario.name,
          passed: false,
          reason: 'Error under stress',
        });
      }
    }

    const score = this.calculateAccuracy(passedScenarios, stressScenarios.length);

    return this.createResult(
      'STRESS_RESPONSE_CHECK',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: stressScenarios.length,
        correctDecisions: passedScenarios,
        custom: {
          scenarioResults: results,
          stressResilienceRating: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
        },
      }),
      score >= this.config.passingScore
        ? 'Stress response satisfactory. Recruit maintains composure under pressure.'
        : 'Stress response needs work. Recruit cracks under pressure.'
    );
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getStrategyScenarios(strategy: string): Array<{
    listing: Partial<any>;
    expectedBehavior: string;
  }> {
    const commonScenarios = [
      {
        listing: { currentPrice: 50, isAuction: true },
        expectedBehavior: 'evaluate',
      },
      {
        listing: { currentPrice: 200 }, // Over budget
        expectedBehavior: 'skip',
      },
    ];

    // Strategy-specific scenarios
    const strategyScenarios: Record<string, Array<{ listing: Partial<any>; expectedBehavior: string }>> = {
      SNIPER: [
        {
          listing: { isAuction: true, auctionEndTime: new Date(Date.now() + 5000).toISOString() },
          expectedBehavior: 'bid',
        },
        {
          listing: { isAuction: true, auctionEndTime: new Date(Date.now() + 3600000).toISOString() },
          expectedBehavior: 'watch',
        },
      ],
      EARLY_AGGRESSIVE: [
        {
          listing: { currentPrice: 30, bidCount: 0 },
          expectedBehavior: 'bid',
        },
      ],
      NEGOTIATOR: [
        {
          listing: { buyItNowPrice: 80, currentPrice: 80, isAuction: false },
          expectedBehavior: 'offer',
        },
      ],
      PASSIVE: [
        {
          listing: { currentPrice: 100 }, // Not significantly underpriced
          expectedBehavior: 'skip',
        },
      ],
      HYBRID: [
        {
          listing: { currentPrice: 50, isAuction: true },
          expectedBehavior: 'evaluate',
        },
      ],
    };

    return [...commonScenarios, ...(strategyScenarios[strategy] ?? [])];
  }

  private checkStrategyAlignment(
    strategy: string,
    action: string,
    expectedBehavior: string
  ): boolean {
    const behaviorMap: Record<string, string[]> = {
      'evaluate': ['BID', 'OFFER', 'WATCH'],
      'skip': ['SKIP'],
      'bid': ['BID'],
      'offer': ['OFFER'],
      'watch': ['WATCH'],
    };

    const validActions = behaviorMap[expectedBehavior] ?? [];
    return validActions.includes(action);
  }

  private calculateConsistency(times: number[]): number {
    if (times.length < 2) return 100;

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);

    // Lower standard deviation = higher consistency
    const coefficientOfVariation = (stdDev / avg) * 100;

    if (coefficientOfVariation < 20) return 100;
    if (coefficientOfVariation < 40) return 80;
    if (coefficientOfVariation < 60) return 60;
    return 40;
  }

  private evaluateStressResponse(
    decision: any,
    expectedBehavior: string,
    strategy: string
  ): boolean {
    // Evaluate based on expected stress behavior
    switch (expectedBehavior) {
      case 'cautious':
        return decision.confidence < 0.8 || decision.action === 'WATCH' || decision.action === 'SKIP';

      case 'decisive':
        return decision.action === 'BID' || decision.action === 'OFFER';

      case 'conservative':
        return decision.action === 'SKIP' || decision.action === 'WATCH' ||
          (decision.amount && decision.amount < 20);

      case 'adaptive':
        return decision.confidence > 0.5; // Shows decision was made, not frozen

      default:
        return true;
    }
  }
}
