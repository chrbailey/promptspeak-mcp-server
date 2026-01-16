/**
 * Phase 4: Combat Training
 *
 * "Field training exercises - MOUT, patrolling, defensive operations.
 * The culmination of individual skills into team-level operations."
 *
 * For agents, this means:
 * - Live sandbox simulation
 * - Competitive scenarios
 * - Multi-listing management
 * - Seller interaction drills
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

export class CombatPhase extends BasePhase {
  readonly phase: TrainingPhase = 'COMBAT';
  readonly config: PhaseConfig = CONFIGS.COMBAT;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'LIVE_SANDBOX_SIMULATION':
        return this.runLiveSandboxSimulation(context, startTime);

      case 'COMPETITIVE_SCENARIO':
        return this.runCompetitiveScenario(context, startTime);

      case 'MULTI_LISTING_MANAGEMENT':
        return this.runMultiListingManagement(context, startTime);

      case 'SELLER_INTERACTION_DRILL':
        return this.runSellerInteractionDrill(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Live Sandbox Simulation
   *
   * "Full-scale field exercise - as close to real combat as training allows"
   * For agents: Operate in sandbox mode with real-like data.
   */
  private async runLiveSandboxSimulation(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate a full operation cycle
    const operationPhases = [
      'SEARCH',
      'EVALUATE',
      'DECIDE',
      'EXECUTE',
      'MONITOR',
      'COMPLETE',
    ];

    let successfulPhases = 0;
    const phaseResults: { phase: string; success: boolean; duration: number }[] = [];
    let totalAcquisitions = 0;
    let totalBudgetUsed = 0;
    const simulatedBudget = context.trainingBudgetRemaining;

    // Simulate finding and pursuing multiple listings
    const listingsToProcess = Math.min(5, context.simulatedListings.length || 5);

    for (let i = 0; i < listingsToProcess; i++) {
      const listing = context.simulatedListings[i] ??
        this.generateSimulatedListing({ currentPrice: 30 + Math.random() * 70 });

      // SEARCH phase
      const searchStart = Date.now();
      phaseResults.push({
        phase: 'SEARCH',
        success: true,
        duration: Date.now() - searchStart + Math.random() * 50,
      });
      successfulPhases++;

      // EVALUATE phase
      const evalStart = Date.now();
      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: simulatedBudget - totalBudgetUsed, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
        marketContext: {
          averagePrice: listing.currentPrice * 1.1,
          priceRange: { min: listing.currentPrice * 0.8, max: listing.currentPrice * 1.4 },
          supplyCount: 8,
        },
      };

      try {
        // DECIDE phase
        const decision = await context.strategy.evaluate(strategyContext);
        phaseResults.push({
          phase: 'EVALUATE_DECIDE',
          success: true,
          duration: Date.now() - evalStart,
        });
        successfulPhases++;

        // EXECUTE phase
        if (decision.action === 'BID' || decision.action === 'OFFER') {
          const execStart = Date.now();
          const bidAmount = decision.amount ?? listing.currentPrice * 1.1;

          // Simulate execution
          if (bidAmount <= simulatedBudget - totalBudgetUsed) {
            // Simulate win/loss based on bid amount vs market
            const winChance = this.calculateWinChance(bidAmount, listing.currentPrice, decision.confidence);
            const won = Math.random() < winChance;

            if (won) {
              totalAcquisitions++;
              totalBudgetUsed += bidAmount;
            }

            phaseResults.push({
              phase: 'EXECUTE',
              success: true,
              duration: Date.now() - execStart,
            });
            successfulPhases++;
          }
        }
      } catch {
        phaseResults.push({
          phase: 'EVALUATE_DECIDE',
          success: false,
          duration: Date.now() - evalStart,
        });
      }
    }

    // Calculate overall score
    const phaseSuccessRate = this.calculateAccuracy(successfulPhases, phaseResults.length);
    const budgetEfficiency = totalAcquisitions > 0
      ? (totalAcquisitions / totalBudgetUsed) * 100
      : 0;
    const score = Math.round((phaseSuccessRate * 0.6) + (Math.min(budgetEfficiency, 40) * 1));

    return this.createResult(
      'LIVE_SANDBOX_SIMULATION',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: listingsToProcess,
        correctDecisions: totalAcquisitions,
        bidsPlaced: phaseResults.filter(p => p.phase === 'EXECUTE').length,
        successfulBids: totalAcquisitions,
        budgetEfficiency: budgetEfficiency / 100,
        custom: {
          listingsProcessed: listingsToProcess,
          acquisitions: totalAcquisitions,
          budgetUsed: totalBudgetUsed,
          phaseSuccessRate,
          operationRating: score >= 80 ? 'COMBAT_EFFECTIVE' : score >= 60 ? 'MARGINAL' : 'INEFFECTIVE',
        },
      }),
      score >= this.config.passingScore
        ? `Sandbox operation successful. ${totalAcquisitions} acquisitions, efficient budget use.`
        : `Sandbox operation needs work. Recruit struggled in field conditions.`
    );
  }

  /**
   * Exercise: Competitive Scenario
   *
   * "Force-on-force training - against opposing forces"
   * For agents: Compete against simulated opponent agents.
   */
  private async runCompetitiveScenario(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate competing against other bidders
    const competitiveAuctions = [
      { listing: { currentPrice: 40, bidCount: 3 }, opponents: 2 },
      { listing: { currentPrice: 60, bidCount: 8 }, opponents: 4 },
      { listing: { currentPrice: 80, bidCount: 15 }, opponents: 6 },
      { listing: { currentPrice: 100, bidCount: 25 }, opponents: 10 },
    ];

    let wins = 0;
    let totalCompetitions = competitiveAuctions.length;
    const competitionResults: {
      opponents: number;
      ourBid: number;
      highestOpponentBid: number;
      won: boolean;
    }[] = [];

    for (const auction of competitiveAuctions) {
      const listing = this.generateSimulatedListing({
        ...auction.listing,
        isAuction: true,
        auctionEndTime: new Date(Date.now() + 30000).toISOString(),
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

        if (decision.action === 'BID' && decision.amount) {
          // Simulate opponent bids
          const opponentBids = this.generateOpponentBids(
            auction.opponents,
            listing.currentPrice,
            decision.confidence
          );
          const highestOpponentBid = Math.max(...opponentBids);

          const won = decision.amount > highestOpponentBid;
          if (won) wins++;

          competitionResults.push({
            opponents: auction.opponents,
            ourBid: decision.amount,
            highestOpponentBid,
            won,
          });
        } else {
          // Didn't bid = automatic loss
          competitionResults.push({
            opponents: auction.opponents,
            ourBid: 0,
            highestOpponentBid: listing.currentPrice * 1.2,
            won: false,
          });
        }
      } catch {
        competitionResults.push({
          opponents: auction.opponents,
          ourBid: 0,
          highestOpponentBid: listing.currentPrice * 1.2,
          won: false,
        });
      }
    }

    const winRate = this.calculateAccuracy(wins, totalCompetitions);
    const competitiveEdge = this.calculateCompetitiveEdge(competitionResults);
    const score = Math.round((winRate * 0.7) + (competitiveEdge * 0.3));

    return this.createResult(
      'COMPETITIVE_SCENARIO',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: totalCompetitions,
        correctDecisions: wins,
        custom: {
          winRate,
          competitiveEdge,
          totalOpponentsFaced: competitiveAuctions.reduce((sum, a) => sum + a.opponents, 0),
          competitionResults,
        },
      }),
      score >= this.config.passingScore
        ? `Competitive performance solid. ${wins}/${totalCompetitions} wins against opposition.`
        : `Competitive performance weak. Recruit outmaneuvered by opponents.`
    );
  }

  /**
   * Exercise: Multi-Listing Management
   *
   * "Managing multiple sectors - fire discipline across the battlefield"
   * For agents: Track and make decisions on multiple concurrent listings.
   */
  private async runMultiListingManagement(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Present multiple listings simultaneously
    const simultaneousListings = [
      this.generateSimulatedListing({ currentPrice: 30, title: 'Priority A' }),
      this.generateSimulatedListing({ currentPrice: 50, title: 'Priority B' }),
      this.generateSimulatedListing({ currentPrice: 70, title: 'Priority C' }),
      this.generateSimulatedListing({ currentPrice: 90, title: 'Priority D' }),
      this.generateSimulatedListing({ currentPrice: 120, title: 'Over budget' }),
    ];

    const budgetLimit = 150;
    let correctPrioritizations = 0;
    let totalBudgetAllocated = 0;
    const decisions: { listing: string; action: string; amount?: number; priority: number }[] = [];

    // Evaluate each listing
    for (let i = 0; i < simultaneousListings.length; i++) {
      const listing = simultaneousListings[i];
      const remainingBudget = budgetLimit - totalBudgetAllocated;

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: remainingBudget, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);

        // Check prioritization logic
        const shouldPursue = listing.currentPrice <= remainingBudget * 0.8;
        const didPursue = decision.action === 'BID' || decision.action === 'OFFER';

        if ((shouldPursue && didPursue) || (!shouldPursue && !didPursue)) {
          correctPrioritizations++;
        }

        if (didPursue && decision.amount) {
          totalBudgetAllocated += decision.amount;
        }

        decisions.push({
          listing: listing.title,
          action: decision.action,
          amount: decision.amount,
          priority: i + 1,
        });
      } catch {
        decisions.push({
          listing: listing.title,
          action: 'ERROR',
          priority: i + 1,
        });
      }
    }

    // Score based on correct prioritization and budget discipline
    const priorityScore = this.calculateAccuracy(correctPrioritizations, simultaneousListings.length);
    const budgetDiscipline = totalBudgetAllocated <= budgetLimit ? 100 : 50;
    const score = Math.round((priorityScore * 0.7) + (budgetDiscipline * 0.3));

    return this.createResult(
      'MULTI_LISTING_MANAGEMENT',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: simultaneousListings.length,
        correctDecisions: correctPrioritizations,
        custom: {
          listingsEvaluated: simultaneousListings.length,
          budgetAllocated: totalBudgetAllocated,
          budgetLimit,
          budgetDiscipline: budgetDiscipline === 100 ? 'MAINTAINED' : 'EXCEEDED',
          decisions,
        },
      }),
      score >= this.config.passingScore
        ? 'Multi-listing management effective. Recruit maintains situational awareness.'
        : 'Multi-listing management poor. Recruit loses track of the battlefield.'
    );
  }

  /**
   * Exercise: Seller Interaction Drill
   *
   * "MOUT - urban operations with civilian considerations"
   * For agents: Handle seller interactions appropriately.
   */
  private async runSellerInteractionDrill(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Test responses to various seller scenarios
    const sellerScenarios = [
      {
        type: 'high_reputation',
        seller: { feedbackScore: 99.8, sales: 10000 },
        expectedBehavior: 'trust',
      },
      {
        type: 'new_seller',
        seller: { feedbackScore: 0, sales: 0 },
        expectedBehavior: 'caution',
      },
      {
        type: 'problematic_seller',
        seller: { feedbackScore: 85, sales: 500 },
        expectedBehavior: 'avoid_or_caution',
      },
      {
        type: 'counter_offer',
        seller: { feedbackScore: 98, sales: 5000 },
        counterOffer: { amount: 70, originalAsk: 90 },
        expectedBehavior: 'negotiate',
      },
    ];

    let appropriateResponses = 0;

    for (const scenario of sellerScenarios) {
      const listing = this.generateSimulatedListing({
        currentPrice: 60,
        sellerFeedbackScore: scenario.seller.feedbackScore,
        sellerId: `seller_${scenario.type}`,
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

        const appropriate = this.evaluateSellerResponse(
          decision,
          scenario.expectedBehavior,
          scenario.seller.feedbackScore
        );

        if (appropriate) appropriateResponses++;
      } catch {
        // Error handling counts as appropriate for problematic sellers
        if (scenario.expectedBehavior === 'avoid_or_caution') {
          appropriateResponses++;
        }
      }
    }

    const score = this.calculateAccuracy(appropriateResponses, sellerScenarios.length);

    return this.createResult(
      'SELLER_INTERACTION_DRILL',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: sellerScenarios.length,
        correctDecisions: appropriateResponses,
        custom: {
          scenariosTested: sellerScenarios.map(s => s.type),
          sellerAwarenessRating: score >= 80 ? 'HIGH' : score >= 60 ? 'MODERATE' : 'LOW',
        },
      }),
      score >= this.config.passingScore
        ? 'Seller interaction skills solid. Recruit reads the room.'
        : 'Seller interaction needs work. Recruit naive to seller dynamics.'
    );
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private calculateWinChance(
    bidAmount: number,
    currentPrice: number,
    confidence: number
  ): number {
    const bidRatio = bidAmount / currentPrice;
    const baseChance = Math.min(0.9, bidRatio * 0.5);
    return baseChance * confidence;
  }

  private generateOpponentBids(
    count: number,
    basePrice: number,
    difficulty: number
  ): number[] {
    const bids: number[] = [];
    for (let i = 0; i < count; i++) {
      const multiplier = 1.05 + (Math.random() * 0.3 * difficulty);
      bids.push(basePrice * multiplier);
    }
    return bids;
  }

  private calculateCompetitiveEdge(
    results: { ourBid: number; highestOpponentBid: number; won: boolean }[]
  ): number {
    const wins = results.filter(r => r.won);
    if (wins.length === 0) return 0;

    // Calculate average margin of victory
    const avgMargin = wins.reduce((sum, r) => {
      return sum + ((r.ourBid - r.highestOpponentBid) / r.highestOpponentBid);
    }, 0) / wins.length;

    // Convert to 0-100 score
    return Math.min(100, Math.max(0, 50 + avgMargin * 100));
  }

  private evaluateSellerResponse(
    decision: any,
    expectedBehavior: string,
    feedbackScore: number
  ): boolean {
    switch (expectedBehavior) {
      case 'trust':
        return decision.confidence >= 0.7 || decision.action !== 'SKIP';

      case 'caution':
        return decision.confidence < 0.8 || decision.action === 'WATCH';

      case 'avoid_or_caution':
        return decision.action === 'SKIP' || decision.confidence < 0.7;

      case 'negotiate':
        return decision.action === 'OFFER' || decision.action === 'COUNTER';

      default:
        return true;
    }
  }
}
