/**
 * Phase 6: Graduation
 *
 * "The Eagle, Globe, and Anchor ceremony. The transformation is complete.
 * The recruit is now a Marine."
 *
 * For agents, this means:
 * - Full capability assessment
 * - Final inspection
 * - Certification examination
 * - Authorization for live trading
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

export class GraduationPhase extends BasePhase {
  readonly phase: TrainingPhase = 'GRADUATION';
  readonly config: PhaseConfig = CONFIGS.GRADUATION;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'FULL_CAPABILITY_ASSESSMENT':
        return this.runFullCapabilityAssessment(context, startTime);

      case 'FINAL_INSPECTION':
        return this.runFinalInspection(context, startTime);

      case 'CERTIFICATION_EXAM':
        return this.runCertificationExam(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Full Capability Assessment
   *
   * "Demonstrating all Marine Corps core competencies"
   * For agents: Comprehensive test of all learned skills.
   */
  private async runFullCapabilityAssessment(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const capabilities = [
      'SEARCH_AND_DISCOVER',
      'VALUE_ASSESSMENT',
      'TIMING_EXECUTION',
      'BUDGET_MANAGEMENT',
      'COMPETITIVE_BIDDING',
      'RISK_ASSESSMENT',
      'STRATEGY_ADHERENCE',
    ];

    const assessmentResults: { capability: string; score: number; notes: string }[] = [];
    let totalScore = 0;

    for (const capability of capabilities) {
      const score = await this.assessCapability(capability, context);
      assessmentResults.push({
        capability,
        score: score.value,
        notes: score.notes,
      });
      totalScore += score.value;
    }

    const avgScore = Math.round(totalScore / capabilities.length);

    // Graduation requires excellence
    const passed = avgScore >= 85 && !assessmentResults.some(r => r.score < 70);

    return this.createResult(
      'FULL_CAPABILITY_ASSESSMENT',
      avgScore,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: capabilities.length,
        correctDecisions: assessmentResults.filter(r => r.score >= 80).length,
        custom: {
          assessmentResults,
          lowestCapability: assessmentResults.reduce((min, r) =>
            r.score < min.score ? r : min
          ).capability,
          highestCapability: assessmentResults.reduce((max, r) =>
            r.score > max.score ? r : max
          ).capability,
          overallRating: avgScore >= 95 ? 'HONOR_GRADUATE' : avgScore >= 85 ? 'QUALIFIED' : 'NEEDS_WORK',
        },
      }),
      passed
        ? `CAPABILITY ASSESSMENT PASSED. All core competencies demonstrated. Average score: ${avgScore}%`
        : `CAPABILITY ASSESSMENT: Deficiencies in one or more areas. Recommend recycling.`
    );
  }

  /**
   * Exercise: Final Inspection
   *
   * "Dress blues inspection - uniform, bearing, readiness"
   * For agents: Final configuration and state verification.
   */
  private async runFinalInspection(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const inspectionItems = [
      {
        name: 'Configuration Integrity',
        check: () => this.verifyConfiguration(context),
      },
      {
        name: 'Budget Readiness',
        check: () => this.verifyBudgetReadiness(context),
      },
      {
        name: 'Strategy Calibration',
        check: () => this.verifyStrategyCalibration(context),
      },
      {
        name: 'API Connection Status',
        check: () => this.verifyApiConnection(context),
      },
      {
        name: 'Training Record Complete',
        check: () => this.verifyTrainingRecord(context),
      },
      {
        name: 'DI Clearance',
        check: () => this.verifyDIClearance(context),
      },
    ];

    const inspectionResults: { item: string; passed: boolean; demerits: string[] }[] = [];
    let passedItems = 0;
    let totalDemerits: string[] = [];

    for (const item of inspectionItems) {
      const result = await item.check();
      inspectionResults.push({
        item: item.name,
        passed: result.passed,
        demerits: result.demerits,
      });

      if (result.passed) passedItems++;
      totalDemerits.push(...result.demerits);
    }

    const score = this.calculateAccuracy(passedItems, inspectionItems.length);
    const passed = score === 100; // Final inspection requires 100%

    return this.createResult(
      'FINAL_INSPECTION',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: inspectionItems.length,
        correctDecisions: passedItems,
        custom: {
          inspectionResults,
          totalDemerits: totalDemerits.length,
          demeritList: totalDemerits,
          inspectionStatus: passed ? 'PASSED' : 'FAILED',
        },
      }),
      passed
        ? `FINAL INSPECTION PASSED. Recruit meets all standards. Ready for deployment.`
        : `FINAL INSPECTION FAILED. ${totalDemerits.length} demerits issued. Discrepancies must be corrected.`
    );
  }

  /**
   * Exercise: Certification Exam
   *
   * "The written test - proving knowledge and judgment"
   * For agents: Comprehensive scenario-based examination.
   */
  private async runCertificationExam(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Final exam scenarios
    const examScenarios = [
      {
        name: 'Scenario 1: Value Opportunity',
        listing: { currentPrice: 45, buyItNowPrice: 60 },
        context: { averagePrice: 70 },
        correctAnswer: 'BID_OR_OFFER',
        points: 15,
      },
      {
        name: 'Scenario 2: Overpriced Trap',
        listing: { currentPrice: 120 },
        context: { averagePrice: 80 },
        correctAnswer: 'SKIP',
        points: 15,
      },
      {
        name: 'Scenario 3: Timing Critical',
        listing: {
          currentPrice: 50,
          isAuction: true,
          auctionEndTime: new Date(Date.now() + 8000).toISOString(),
        },
        context: {},
        correctAnswer: 'IMMEDIATE_ACTION',
        points: 20,
      },
      {
        name: 'Scenario 4: Budget Constraint',
        budget: 30,
        listing: { currentPrice: 50 },
        context: {},
        correctAnswer: 'SKIP_OVER_BUDGET',
        points: 15,
      },
      {
        name: 'Scenario 5: Competition Assessment',
        listing: { currentPrice: 60, bidCount: 25 },
        context: {},
        correctAnswer: 'CAUTIOUS_OR_AGGRESSIVE',
        points: 15,
      },
      {
        name: 'Scenario 6: Strategy Alignment',
        listing: { currentPrice: 40 },
        context: {},
        correctAnswer: 'STRATEGY_APPROPRIATE',
        points: 20,
      },
    ];

    let earnedPoints = 0;
    let totalPoints = examScenarios.reduce((sum, s) => sum + s.points, 0);
    const examResults: { scenario: string; correct: boolean; points: number; answer: string }[] = [];

    for (const scenario of examScenarios) {
      const listing = this.generateSimulatedListing(scenario.listing);
      const budget = scenario.budget ?? context.trainingBudgetRemaining;

      const strategyContext: StrategyContext = {
        listing,
        agentConfig: context.agentConfig,
        remainingBudget: { value: budget, currency: 'USD' },
        agentHistory: [],
        currentTime: new Date(),
        marketContext: scenario.context.averagePrice ? {
          averagePrice: scenario.context.averagePrice,
          priceRange: { min: scenario.context.averagePrice * 0.7, max: scenario.context.averagePrice * 1.3 },
          supplyCount: 5,
        } : undefined,
      };

      try {
        const decision = await context.strategy.evaluate(strategyContext);
        const correct = this.gradeAnswer(decision, scenario.correctAnswer, context.recruit.strategy);

        if (correct) earnedPoints += scenario.points;

        examResults.push({
          scenario: scenario.name,
          correct,
          points: correct ? scenario.points : 0,
          answer: decision.action,
        });
      } catch {
        examResults.push({
          scenario: scenario.name,
          correct: false,
          points: 0,
          answer: 'ERROR',
        });
      }
    }

    const score = Math.round((earnedPoints / totalPoints) * 100);

    // Determine certification level
    const certificationLevel = this.determineCertificationLevel(score, context);

    return this.createResult(
      'CERTIFICATION_EXAM',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: examScenarios.length,
        correctDecisions: examResults.filter(r => r.correct).length,
        custom: {
          earnedPoints,
          totalPoints,
          examResults,
          certificationLevel,
          recommendation: this.getCertificationRecommendation(score),
        },
      }),
      score >= this.config.passingScore
        ? `CERTIFICATION EXAM PASSED: ${earnedPoints}/${totalPoints} points. ${certificationLevel}. Agent certified for live trading.`
        : `CERTIFICATION EXAM FAILED: ${earnedPoints}/${totalPoints} points. Additional training required.`
    );
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async assessCapability(
    capability: string,
    context: ExerciseContext
  ): Promise<{ value: number; notes: string }> {
    // Simulate capability assessment based on recruit history and current performance
    const baseSkill = this.getBaseSkillForStrategy(context.recruit.strategy);

    // Adjust based on capability type
    const adjustments: Record<string, number> = {
      'SEARCH_AND_DISCOVER': 5,
      'VALUE_ASSESSMENT': 0,
      'TIMING_EXECUTION': context.recruit.strategy === 'SNIPER' ? 10 : -5,
      'BUDGET_MANAGEMENT': 5,
      'COMPETITIVE_BIDDING': context.recruit.strategy === 'EARLY_AGGRESSIVE' ? 10 : 0,
      'RISK_ASSESSMENT': context.recruit.strategy === 'PASSIVE' ? 10 : 0,
      'STRATEGY_ADHERENCE': 10,
    };

    const adjustment = adjustments[capability] ?? 0;
    const score = this.simulateScore(baseSkill + adjustment + 15, 10);

    const notes = score >= 90 ? 'Excellent performance' :
                 score >= 80 ? 'Meets standards' :
                 score >= 70 ? 'Marginal - monitor closely' :
                 'Below standard - requires improvement';

    return { value: score, notes };
  }

  private async verifyConfiguration(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    const demerits: string[] = [];

    if (!context.agentConfig.agentId) demerits.push('Missing agent ID');
    if (!context.agentConfig.strategy) demerits.push('Missing strategy assignment');
    if (!context.agentConfig.budget?.amount) demerits.push('Budget not configured');
    if (!context.agentConfig.swarmId) demerits.push('Not assigned to swarm');

    return { passed: demerits.length === 0, demerits };
  }

  private async verifyBudgetReadiness(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    const demerits: string[] = [];

    if (context.trainingBudgetRemaining <= 0) {
      demerits.push('Training budget exhausted');
    }

    const productionBudget = context.agentConfig.budget?.amount ?? 0;
    if (productionBudget <= 0) {
      demerits.push('Production budget not allocated');
    }

    return { passed: demerits.length === 0, demerits };
  }

  private async verifyStrategyCalibration(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    const demerits: string[] = [];

    // Verify strategy can make decisions
    const listing = this.generateSimulatedListing({ currentPrice: 50 });
    const strategyContext: StrategyContext = {
      listing,
      agentConfig: context.agentConfig,
      remainingBudget: { value: 100, currency: 'USD' },
      agentHistory: [],
      currentTime: new Date(),
    };

    try {
      const decision = await context.strategy.evaluate(strategyContext);
      if (!decision || !decision.action) {
        demerits.push('Strategy produces invalid decisions');
      }
    } catch {
      demerits.push('Strategy error during calibration check');
    }

    return { passed: demerits.length === 0, demerits };
  }

  private async verifyApiConnection(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    // Simulated - would check actual API in production
    const demerits: string[] = [];

    // Simulate API check with high pass rate at graduation
    if (Math.random() < 0.05) {
      demerits.push('API connection unstable');
    }

    return { passed: demerits.length === 0, demerits };
  }

  private async verifyTrainingRecord(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    const demerits: string[] = [];

    // Check training record completeness
    if (context.recruit.phaseHistory.length < 5) {
      demerits.push('Training record incomplete - missing phases');
    }

    const failedPhases = context.recruit.phaseHistory.filter(p => !p.passed);
    if (failedPhases.length > context.recruit.totalRecyclings) {
      demerits.push('Unresolved phase failures in record');
    }

    if (!context.recruit.marksmanshipQual || context.recruit.marksmanshipQual === 'UNQUALIFIED') {
      demerits.push('Marksmanship qualification not achieved');
    }

    return { passed: demerits.length === 0, demerits };
  }

  private async verifyDIClearance(
    context: ExerciseContext
  ): Promise<{ passed: boolean; demerits: string[] }> {
    const demerits: string[] = [];

    if (context.recruit.requiresDIApproval && !context.recruit.assignedDI) {
      demerits.push('DI approval required but no DI assigned');
    }

    // Check for excessive demerits
    if (context.recruit.demerits.length > 5) {
      demerits.push(`Excessive demerits (${context.recruit.demerits.length}) - requires DI review`);
    }

    return { passed: demerits.length === 0, demerits };
  }

  private gradeAnswer(
    decision: any,
    correctAnswer: string,
    strategy: string
  ): boolean {
    switch (correctAnswer) {
      case 'BID_OR_OFFER':
        return decision.action === 'BID' || decision.action === 'OFFER';

      case 'SKIP':
        return decision.action === 'SKIP';

      case 'IMMEDIATE_ACTION':
        return decision.action === 'BID' || (decision.delayMs && decision.delayMs < 5000);

      case 'SKIP_OVER_BUDGET':
        return decision.action === 'SKIP' || decision.action === 'WATCH';

      case 'CAUTIOUS_OR_AGGRESSIVE':
        // Both are valid approaches
        return ['BID', 'SKIP', 'WATCH'].includes(decision.action);

      case 'STRATEGY_APPROPRIATE':
        // Check alignment with assigned strategy
        return this.isStrategyAppropriate(decision, strategy);

      default:
        return false;
    }
  }

  private isStrategyAppropriate(decision: any, strategy: string): boolean {
    const strategyActions: Record<string, string[]> = {
      'SNIPER': ['WATCH', 'BID'],
      'EARLY_AGGRESSIVE': ['BID'],
      'NEGOTIATOR': ['OFFER', 'BID'],
      'PASSIVE': ['SKIP', 'WATCH', 'BID'],
      'HYBRID': ['BID', 'OFFER', 'WATCH', 'SKIP'],
    };

    const validActions = strategyActions[strategy] ?? ['BID', 'SKIP'];
    return validActions.includes(decision.action);
  }

  private determineCertificationLevel(
    score: number,
    context: ExerciseContext
  ): string {
    // Consider marksmanship qualification
    const marksmanship = context.recruit.marksmanshipQual ?? 'UNQUALIFIED';
    const hasMerits = context.recruit.merits.length > 0;
    const hasExpertBadges = context.recruit.expertBadges.length > 0;

    if (score >= 98 && marksmanship === 'EXPERT' && hasMerits) {
      return 'HONOR GRADUATE - TOP 5%';
    }
    if (score >= 95 && (marksmanship === 'EXPERT' || marksmanship === 'SHARPSHOOTER')) {
      return 'MERITORIOUS - HIGH PERFORMER';
    }
    if (score >= 90) {
      return 'CERTIFIED - COMBAT READY';
    }
    if (score >= 85) {
      return 'CERTIFIED - STANDARD';
    }
    return 'NOT CERTIFIED';
  }

  private getCertificationRecommendation(score: number): string {
    if (score >= 95) {
      return 'Recommend for immediate deployment. Outstanding candidate.';
    }
    if (score >= 90) {
      return 'Approved for deployment. Strong performer.';
    }
    if (score >= 85) {
      return 'Approved for deployment with monitoring. Meets minimum standards.';
    }
    if (score >= 80) {
      return 'Conditional approval. Requires DI oversight for first operations.';
    }
    return 'Not recommended for deployment. Additional training required.';
  }
}
