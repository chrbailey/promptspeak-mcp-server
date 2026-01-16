/**
 * Base Phase Implementation
 *
 * Abstract base class that all training phases extend.
 */

import type {
  TrainingPhase,
  PhaseConfig,
  PhaseEvaluation,
  ExerciseResult,
  ExerciseType,
  ExerciseMetrics,
  RecruitRecord,
} from '../types.js';
import type { MarketAgentConfig, NormalizedListing } from '../../swarm/types.js';
import type { BiddingStrategyInterface, StrategyContext } from '../../swarm/strategies/types.js';
import { generateExerciseId } from '../types.js';

// =============================================================================
// PHASE INTERFACE
// =============================================================================

/**
 * Context provided to exercises.
 */
export interface ExerciseContext {
  /** Recruit being evaluated */
  recruit: RecruitRecord;
  /** Agent configuration */
  agentConfig: MarketAgentConfig;
  /** Strategy instance */
  strategy: BiddingStrategyInterface;
  /** Simulated listings for training */
  simulatedListings: NormalizedListing[];
  /** Training budget remaining */
  trainingBudgetRemaining: number;
  /** Random seed for reproducibility */
  randomSeed?: number;
}

/**
 * Interface for phase implementations.
 */
export interface PhaseImplementation {
  /** Phase identifier */
  readonly phase: TrainingPhase;
  /** Phase configuration */
  readonly config: PhaseConfig;
  /** Run all exercises for this phase */
  runPhase(context: ExerciseContext): Promise<PhaseEvaluation>;
  /** Run a specific exercise */
  runExercise(exerciseType: ExerciseType, context: ExerciseContext): Promise<ExerciseResult>;
  /** Calculate overall phase score from exercise results */
  calculatePhaseScore(results: ExerciseResult[]): number;
}

// =============================================================================
// BASE PHASE CLASS
// =============================================================================

/**
 * Abstract base class for training phases.
 */
export abstract class BasePhase implements PhaseImplementation {
  abstract readonly phase: TrainingPhase;
  abstract readonly config: PhaseConfig;

  /**
   * Run all exercises for this phase.
   */
  async runPhase(context: ExerciseContext): Promise<PhaseEvaluation> {
    const startedAt = new Date().toISOString();
    const exerciseResults: ExerciseResult[] = [];

    // Run each exercise defined in the config
    for (const exerciseType of this.config.exercises) {
      const result = await this.runExercise(exerciseType as ExerciseType, context);
      exerciseResults.push(result);
    }

    // Calculate overall score
    const score = this.calculatePhaseScore(exerciseResults);
    const passed = score >= this.config.passingScore;

    return {
      phase: this.phase,
      score,
      passed,
      attemptNumber: context.recruit.currentAttempt,
      exerciseResults,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Abstract method - each phase implements specific exercises.
   */
  abstract runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult>;

  /**
   * Calculate overall phase score from exercise results.
   * Default implementation is weighted average.
   */
  calculatePhaseScore(results: ExerciseResult[]): number {
    if (results.length === 0) return 0;

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    return Math.round(totalScore / results.length);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Create a successful exercise result.
   */
  protected createResult(
    exerciseType: ExerciseType,
    score: number,
    durationMs: number,
    metrics: ExerciseMetrics,
    feedback?: string
  ): ExerciseResult {
    return {
      exerciseId: generateExerciseId(),
      exerciseType,
      phase: this.phase,
      score,
      passed: score >= this.config.passingScore,
      durationMs,
      completedAt: new Date().toISOString(),
      metrics,
      feedback,
    };
  }

  /**
   * Create default metrics object.
   */
  protected createMetrics(overrides: Partial<ExerciseMetrics> = {}): ExerciseMetrics {
    return {
      decisionsCount: 0,
      correctDecisions: 0,
      avgDecisionTimeMs: 0,
      ...overrides,
    };
  }

  /**
   * Generate random score with bias toward skill level.
   * Used for simulation when actual execution isn't possible.
   */
  protected simulateScore(baseSkill: number, variance: number = 15): number {
    const random = Math.random() * 2 - 1; // -1 to 1
    const score = baseSkill + (random * variance);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Simulate decision making with time tracking.
   */
  protected async simulateDecision(
    strategy: BiddingStrategyInterface,
    context: StrategyContext,
    correctAnswer: boolean
  ): Promise<{ correct: boolean; timeMs: number }> {
    const startTime = Date.now();

    try {
      const decision = await strategy.evaluate(context);
      const timeMs = Date.now() - startTime;

      // Determine if decision was "correct" based on the scenario
      const correct = this.evaluateDecision(decision.action, correctAnswer);

      return { correct, timeMs };
    } catch {
      return { correct: false, timeMs: Date.now() - startTime };
    }
  }

  /**
   * Evaluate if a decision was correct for the scenario.
   */
  protected evaluateDecision(action: string, shouldBid: boolean): boolean {
    if (shouldBid) {
      return action === 'BID' || action === 'OFFER';
    }
    return action === 'SKIP' || action === 'WATCH';
  }

  /**
   * Generate simulated listing for training.
   */
  protected generateSimulatedListing(
    options: Partial<NormalizedListing> = {}
  ): NormalizedListing {
    const basePrice = 50 + Math.random() * 100;

    const itemId = options.itemId ?? `sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const isAuction = options.isAuction ?? Math.random() > 0.5;

    const sellerId = options.sellerId ?? `seller_${Math.random().toString(36).substr(2, 6)}`;

    return {
      itemId,
      id: options.id ?? itemId,
      title: options.title ?? 'Simulated Training Listing',
      price: options.price ?? basePrice,
      currentPrice: options.currentPrice ?? basePrice,
      currency: options.currency ?? 'USD',
      buyItNowPrice: options.buyItNowPrice ?? basePrice * 1.3,
      buyingOptions: options.buyingOptions ?? (isAuction ? ['AUCTION'] : ['FIXED_PRICE']),
      isAuction,
      hasBestOffer: options.hasBestOffer ?? false,
      bestOfferEnabled: options.bestOfferEnabled ?? false,
      auctionEndTime: options.auctionEndTime ??
        new Date(Date.now() + 3600000 + Math.random() * 86400000).toISOString(),
      bidCount: options.bidCount ?? Math.floor(Math.random() * 10),
      condition: options.condition ?? 'Used',
      sellerId,
      sellerUsername: options.sellerUsername ?? sellerId,
      sellerFeedbackScore: options.sellerFeedbackScore ?? 95 + Math.random() * 5,
      sellerFeedbackPercent: options.sellerFeedbackPercent ?? 98 + Math.random() * 2,
      location: options.location ?? { country: 'US' },
      shippingCost: options.shippingCost ?? 5 + Math.random() * 10,
      imageUrl: options.imageUrl ?? '',
      itemUrl: options.itemUrl ?? `https://ebay.com/itm/${itemId}`,
      ...options,
    };
  }

  /**
   * Calculate accuracy percentage.
   */
  protected calculateAccuracy(correct: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((correct / total) * 100);
  }

  /**
   * Get strategy-specific base skill level.
   * Different strategies have different learning curves.
   */
  protected getBaseSkillForStrategy(strategy: string): number {
    const skillMap: Record<string, number> = {
      'PASSIVE': 75,       // Easiest to learn
      'EARLY_AGGRESSIVE': 70,
      'NEGOTIATOR': 65,
      'HYBRID': 60,        // Most complex
      'SNIPER': 55,        // Requires precision timing
    };
    return skillMap[strategy] ?? 60;
  }
}
