/**
 * Phase 3: Marksmanship
 *
 * "Table one and table two of rifle qualification - the most important
 * skill a Marine must master. Every Marine is a rifleman."
 *
 * For agents, this means:
 * - Bid accuracy drills (hitting target prices)
 * - Timing precision tests
 * - Value assessment accuracy
 * - Snipe window drills (for SNIPER strategy)
 */

import { BasePhase, type ExerciseContext } from './base-phase.js';
import type {
  TrainingPhase,
  PhaseConfig,
  ExerciseType,
  ExerciseResult,
  MarksmanshipQualification,
} from '../types.js';
import { DEFAULT_PHASE_CONFIGS as CONFIGS, getMarksmanshipQualification } from '../types.js';
import type { StrategyContext } from '../../swarm/strategies/types.js';

export class MarksmanshipPhase extends BasePhase {
  readonly phase: TrainingPhase = 'MARKSMANSHIP';
  readonly config: PhaseConfig = CONFIGS.MARKSMANSHIP;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'BID_ACCURACY_DRILL':
        return this.runBidAccuracyDrill(context, startTime);

      case 'TIMING_PRECISION_TEST':
        return this.runTimingPrecisionTest(context, startTime);

      case 'VALUE_ASSESSMENT_TEST':
        return this.runValueAssessmentTest(context, startTime);

      case 'SNIPE_WINDOW_DRILL':
        return this.runSnipeWindowDrill(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Bid Accuracy Drill
   *
   * "Known distance - 200, 300, 500 yards - slow fire"
   * For agents: Place bids that hit target value within acceptable deviation.
   */
  private async runBidAccuracyDrill(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Define target scenarios with expected bid ranges
    const targets = [
      { listing: { currentPrice: 30 }, targetBid: 35, tolerance: 5 },   // Easy target
      { listing: { currentPrice: 75 }, targetBid: 82, tolerance: 8 },   // Medium target
      { listing: { currentPrice: 120 }, targetBid: 135, tolerance: 12 }, // Far target
      { listing: { currentPrice: 45, bidCount: 8 }, targetBid: 55, tolerance: 7 }, // Hot auction
      { listing: { currentPrice: 90, bidCount: 1 }, targetBid: 95, tolerance: 5 }, // Cold auction
    ];

    let hitsOnTarget = 0;
    let bullseyes = 0; // Within half tolerance
    const shotResults: { target: number; actual: number; deviation: number }[] = [];

    for (const target of targets) {
      const listing = this.generateSimulatedListing({
        ...target.listing,
        isAuction: true,
        auctionEndTime: new Date(Date.now() + 60000).toISOString(), // 1 minute
      });

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: context.trainingBudgetRemaining, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
        marketContext: {
          averagePrice: target.targetBid * 0.95,
          priceRange: { min: target.targetBid * 0.7, max: target.targetBid * 1.3 },
          supplyCount: 10,
        },
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        if (decision.action === 'BID' && decision.amount) {
          const deviation = Math.abs(decision.amount - target.targetBid);
          shotResults.push({
            target: target.targetBid,
            actual: decision.amount,
            deviation,
          });

          if (deviation <= target.tolerance) {
            hitsOnTarget++;
            if (deviation <= target.tolerance / 2) {
              bullseyes++;
            }
          }
        } else {
          // No bid = miss
          shotResults.push({
            target: target.targetBid,
            actual: 0,
            deviation: target.targetBid,
          });
        }
      } catch {
        shotResults.push({
          target: target.targetBid,
          actual: 0,
          deviation: target.targetBid,
        });
      }
    }

    // Calculate score - hits count more, bullseyes are bonus
    const baseScore = this.calculateAccuracy(hitsOnTarget, targets.length);
    const bullseyeBonus = (bullseyes / targets.length) * 10;
    const score = Math.min(100, Math.round(baseScore + bullseyeBonus));

    const qualification = getMarksmanshipQualification(score);

    return this.createResult(
      'BID_ACCURACY_DRILL',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: targets.length,
        correctDecisions: hitsOnTarget,
        bidsPlaced: shotResults.filter(s => s.actual > 0).length,
        successfulBids: hitsOnTarget,
        custom: {
          bullseyes,
          avgDeviation: shotResults.reduce((sum, s) => sum + s.deviation, 0) / shotResults.length,
          qualification,
          shotResults,
        },
      }),
      this.getMarksmanshipFeedback(qualification, hitsOnTarget, targets.length)
    );
  }

  /**
   * Exercise: Timing Precision Test
   *
   * "Rapid fire - hitting targets under time pressure"
   * For agents: Execute bids at precise moments.
   */
  private async runTimingPrecisionTest(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const timingTests = [
      { windowMs: 1000, label: '1 second window' },
      { windowMs: 500, label: 'half-second window' },
      { windowMs: 250, label: 'quarter-second window' },
      { windowMs: 100, label: 'snap decision' },
    ];

    let onTimeDecisions = 0;
    const timingResults: { window: number; actualMs: number; withinWindow: boolean }[] = [];

    for (const test of timingTests) {
      const listing = this.generateSimulatedListing({
        isAuction: true,
        currentPrice: 50 + Math.random() * 50,
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
        await context.strategy.evaluate(strategyContext);
        const decisionTime = Date.now() - decisionStart;

        const withinWindow = decisionTime <= test.windowMs;
        if (withinWindow) onTimeDecisions++;

        timingResults.push({
          window: test.windowMs,
          actualMs: decisionTime,
          withinWindow,
        });
      } catch {
        timingResults.push({
          window: test.windowMs,
          actualMs: test.windowMs * 2,
          withinWindow: false,
        });
      }
    }

    const score = this.calculateAccuracy(onTimeDecisions, timingTests.length);
    const avgResponseTime = timingResults.reduce((sum, r) => sum + r.actualMs, 0) / timingResults.length;

    return this.createResult(
      'TIMING_PRECISION_TEST',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: timingTests.length,
        correctDecisions: onTimeDecisions,
        avgDecisionTimeMs: Math.round(avgResponseTime),
        timingAccuracy: score,
        custom: {
          timingResults,
          fastestResponseMs: Math.min(...timingResults.map(r => r.actualMs)),
          slowestResponseMs: Math.max(...timingResults.map(r => r.actualMs)),
        },
      }),
      score >= this.config.passingScore
        ? `Timing precision acceptable. Avg response: ${Math.round(avgResponseTime)}ms`
        : `Timing needs work. Recruit too slow on the draw.`
    );
  }

  /**
   * Exercise: Value Assessment Test
   *
   * "Range estimation - knowing your target"
   * For agents: Accurately assess fair market value.
   */
  private async runValueAssessmentTest(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Present listings and test value assessment
    const valueTests = [
      {
        listing: { currentPrice: 50, title: 'Standard item' },
        actualValue: 60,
        hint: 'average_market',
      },
      {
        listing: { currentPrice: 80, title: 'Premium item' },
        actualValue: 75,
        hint: 'overpriced',
      },
      {
        listing: { currentPrice: 30, title: 'Undervalued item' },
        actualValue: 55,
        hint: 'deal',
      },
      {
        listing: { currentPrice: 100, bidCount: 15 },
        actualValue: 110,
        hint: 'hot_competition',
      },
      {
        listing: { currentPrice: 70, buyItNowPrice: 90 },
        actualValue: 75,
        hint: 'bin_available',
      },
    ];

    let accurateAssessments = 0;
    const assessmentResults: { actual: number; estimated: number; error: number }[] = [];

    for (const test of valueTests) {
      const listing = this.generateSimulatedListing(test.listing);

      // Strategy should estimate value through bid amount
      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: 200, currency: 'USD' }, // Ample budget
        agentHistory: [],
        currentTime: new Date(),
        marketContext: {
          averagePrice: test.actualValue,
          priceRange: { min: test.actualValue * 0.8, max: test.actualValue * 1.2 },
          supplyCount: 5,
        },
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        // Use bid/offer amount as value estimate
        const estimatedValue = decision.amount ?? test.listing.currentPrice;
        const error = Math.abs(estimatedValue - test.actualValue) / test.actualValue;

        assessmentResults.push({
          actual: test.actualValue,
          estimated: estimatedValue,
          error: error * 100,
        });

        // Within 20% is acceptable
        if (error <= 0.2) {
          accurateAssessments++;
        }
      } catch {
        assessmentResults.push({
          actual: test.actualValue,
          estimated: 0,
          error: 100,
        });
      }
    }

    const score = this.calculateAccuracy(accurateAssessments, valueTests.length);
    const avgError = assessmentResults.reduce((sum, r) => sum + r.error, 0) / assessmentResults.length;

    return this.createResult(
      'VALUE_ASSESSMENT_TEST',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: valueTests.length,
        correctDecisions: accurateAssessments,
        custom: {
          avgErrorPercent: Math.round(avgError),
          assessmentResults,
          valueEstimationRating: avgError < 10 ? 'EXCELLENT' : avgError < 20 ? 'GOOD' : 'NEEDS_WORK',
        },
      }),
      score >= this.config.passingScore
        ? `Value assessment solid. Avg error: ${Math.round(avgError)}%`
        : `Value assessment weak. Recruit overpays or misses deals.`
    );
  }

  /**
   * Exercise: Snipe Window Drill
   *
   * "Moving targets - hitting what moves"
   * For agents: Precise timing in auction final seconds.
   */
  private async runSnipeWindowDrill(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // For non-SNIPER strategies, this tests general auction-end awareness
    const isSniper = context.recruit.strategy === 'SNIPER';

    const windowTests = [
      { secondsRemaining: 60, shouldSnipe: false, expectedAction: 'WATCH' },
      { secondsRemaining: 30, shouldSnipe: false, expectedAction: 'WATCH' },
      { secondsRemaining: 15, shouldSnipe: isSniper, expectedAction: isSniper ? 'PREPARE' : 'WATCH' },
      { secondsRemaining: 10, shouldSnipe: isSniper, expectedAction: isSniper ? 'BID' : 'WATCH' },
      { secondsRemaining: 5, shouldSnipe: isSniper, expectedAction: isSniper ? 'BID' : 'BID' },
    ];

    let correctResponses = 0;

    for (const test of windowTests) {
      const listing = this.generateSimulatedListing({
        isAuction: true,
        currentPrice: 50,
        auctionEndTime: new Date(Date.now() + test.secondsRemaining * 1000).toISOString(),
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

        // Check if response is appropriate for timing
        const appropriate = this.isAppropriateSnipeResponse(
          decision.action,
          test.secondsRemaining,
          isSniper,
          decision.delayMs
        );

        if (appropriate) correctResponses++;
      } catch {
        // Error = incorrect response
      }
    }

    const score = this.calculateAccuracy(correctResponses, windowTests.length);

    return this.createResult(
      'SNIPE_WINDOW_DRILL',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: windowTests.length,
        correctDecisions: correctResponses,
        timingAccuracy: score,
        custom: {
          isSniperStrategy: isSniper,
          snipeWindowAwareness: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
        },
      }),
      score >= this.config.passingScore
        ? isSniper
          ? 'Snipe timing excellent. Recruit strikes at the perfect moment.'
          : 'Auction timing awareness good. Recruit knows when to act.'
        : 'Timing awareness needs improvement. Recruit misses the window.'
    );
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getMarksmanshipFeedback(
    qualification: MarksmanshipQualification,
    hits: number,
    total: number
  ): string {
    const hitRate = `${hits}/${total} targets hit`;

    switch (qualification) {
      case 'EXPERT':
        return `EXPERT qualification earned! ${hitRate}. Outstanding marksmanship.`;
      case 'SHARPSHOOTER':
        return `SHARPSHOOTER qualification earned. ${hitRate}. Excellent shooting.`;
      case 'MARKSMAN':
        return `MARKSMAN qualification earned. ${hitRate}. Adequate, but room for improvement.`;
      case 'UNQUALIFIED':
        return `UNQUALIFIED. ${hitRate}. Recruit needs remedial training.`;
    }
  }

  private isAppropriateSnipeResponse(
    action: string,
    secondsRemaining: number,
    isSniper: boolean,
    delayMs?: number
  ): boolean {
    // Early in auction - should watch
    if (secondsRemaining > 30) {
      return action === 'WATCH' || action === 'SKIP';
    }

    // Getting close
    if (secondsRemaining > 10) {
      if (isSniper) {
        // Sniper should watch with intent
        return action === 'WATCH' || (action === 'BID' && delayMs !== undefined && delayMs > 5000);
      }
      return action === 'WATCH' || action === 'BID';
    }

    // Snipe window
    if (secondsRemaining <= 10) {
      if (isSniper) {
        // Sniper should bid now or have scheduled
        return action === 'BID';
      }
      // Other strategies should decide quickly
      return action === 'BID' || action === 'SKIP';
    }

    return true;
  }
}
