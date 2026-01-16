/**
 * Phase 1: Receiving
 *
 * "The first phase of recruit training, Receiving, begins when the new recruits
 * arrive at the Marine Corps Recruit Depot. This phase marks the initial
 * transition from civilian to Marine recruit."
 *
 * For agents, this means:
 * - Configuration validation
 * - Credential verification
 * - Budget allocation testing
 * - Basic API connection testing
 */

import { BasePhase, type ExerciseContext } from './base-phase.js';
import type {
  TrainingPhase,
  PhaseConfig,
  ExerciseType,
  ExerciseResult,
  DEFAULT_PHASE_CONFIGS,
} from '../types.js';
import { DEFAULT_PHASE_CONFIGS as CONFIGS } from '../types.js';

export class ReceivingPhase extends BasePhase {
  readonly phase: TrainingPhase = 'RECEIVING';
  readonly config: PhaseConfig = CONFIGS.RECEIVING;

  async runExercise(
    exerciseType: ExerciseType,
    context: ExerciseContext
  ): Promise<ExerciseResult> {
    const startTime = Date.now();

    switch (exerciseType) {
      case 'CONFIGURATION_VALIDATION':
        return this.runConfigurationValidation(context, startTime);

      case 'CREDENTIAL_VERIFICATION':
        return this.runCredentialVerification(context, startTime);

      case 'BUDGET_ALLOCATION_TEST':
        return this.runBudgetAllocationTest(context, startTime);

      case 'BASIC_API_CONNECTION':
        return this.runBasicApiConnection(context, startTime);

      default:
        throw new Error(`Unknown exercise type: ${exerciseType}`);
    }
  }

  // ===========================================================================
  // EXERCISE IMPLEMENTATIONS
  // ===========================================================================

  /**
   * Exercise: Configuration Validation
   *
   * "Hair cut and uniform issue - stripping away the civilian."
   * For agents: Validate all required configuration fields are present and valid.
   */
  private async runConfigurationValidation(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const checks = [
      { name: 'agentId', valid: !!context.agentConfig.agentId },
      { name: 'strategy', valid: !!context.agentConfig.strategy },
      { name: 'budget', valid: (context.agentConfig.budget?.amount ?? 0) > 0 },
      { name: 'targetCriteria', valid: !!context.agentConfig.targetCriteria },
      { name: 'timeWindow', valid: !!context.agentConfig.timeWindow },
      { name: 'swarmId', valid: !!context.agentConfig.swarmId },
      { name: 'constraints', valid: !!context.agentConfig.constraints },
    ];

    const validChecks = checks.filter(c => c.valid).length;
    const score = this.calculateAccuracy(validChecks, checks.length);

    return this.createResult(
      'CONFIGURATION_VALIDATION',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: checks.length,
        correctDecisions: validChecks,
        custom: {
          missingFields: checks.filter(c => !c.valid).length,
        },
      }),
      validChecks === checks.length
        ? 'All configuration fields validated successfully. Recruit properly outfitted.'
        : `Configuration incomplete. Missing: ${checks.filter(c => !c.valid).map(c => c.name).join(', ')}`
    );
  }

  /**
   * Exercise: Credential Verification
   *
   * "ID card issue and processing"
   * For agents: Verify API credentials and authentication.
   */
  private async runCredentialVerification(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate credential verification
    // In real implementation, this would test actual API credentials
    const credentialChecks = [
      { name: 'apiKey', valid: true },        // Would check actual key
      { name: 'apiSecret', valid: true },     // Would check actual secret
      { name: 'scope', valid: true },         // Would verify permissions
      { name: 'expiration', valid: true },    // Would check token expiry
    ];

    // Simulate some failures for training variation
    const baseSkill = this.getBaseSkillForStrategy(context.recruit.strategy);
    const adjustedScore = this.simulateScore(baseSkill + 15, 10); // Credentials usually pass

    const passed = adjustedScore >= 70;
    const validCount = passed ? credentialChecks.length : credentialChecks.length - 1;

    return this.createResult(
      'CREDENTIAL_VERIFICATION',
      adjustedScore,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: credentialChecks.length,
        correctDecisions: validCount,
        custom: {
          authenticationAttempts: 1,
          tokenRefreshRequired: passed ? 0 : 1,
        },
      }),
      passed
        ? 'Credentials verified. Recruit cleared for duty.'
        : 'Credential issues detected. Requires remediation.'
    );
  }

  /**
   * Exercise: Budget Allocation Test
   *
   * "Gear issue and accountability check"
   * For agents: Test budget allocation and tracking systems.
   */
  private async runBudgetAllocationTest(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    const testAllocations = [
      { amount: 10, expected: true, description: 'Small allocation' },
      { amount: 50, expected: true, description: 'Medium allocation' },
      { amount: context.trainingBudgetRemaining * 0.5, expected: true, description: 'Half budget' },
      { amount: context.trainingBudgetRemaining * 1.5, expected: false, description: 'Over budget' },
      { amount: -10, expected: false, description: 'Negative amount' },
    ];

    let correctResults = 0;
    const results: boolean[] = [];

    for (const test of testAllocations) {
      // Simulate budget validation logic
      const canAllocate =
        test.amount > 0 &&
        test.amount <= context.trainingBudgetRemaining;

      const correct = canAllocate === test.expected;
      if (correct) correctResults++;
      results.push(correct);
    }

    const score = this.calculateAccuracy(correctResults, testAllocations.length);

    return this.createResult(
      'BUDGET_ALLOCATION_TEST',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: testAllocations.length,
        correctDecisions: correctResults,
        budgetEfficiency: 1.0, // Initial test
        custom: {
          trainingBudget: context.trainingBudgetRemaining,
          allocationTestsPassed: correctResults,
        },
      }),
      score >= this.config.passingScore
        ? 'Budget allocation systems operational. Recruit understands resource management.'
        : 'Budget allocation errors detected. Additional drill required.'
    );
  }

  /**
   * Exercise: Basic API Connection
   *
   * "First formation and basic drill movements"
   * For agents: Test basic API connectivity and response handling.
   */
  private async runBasicApiConnection(
    context: ExerciseContext,
    startTime: number
  ): Promise<ExerciseResult> {
    // Simulate API connection tests
    const connectionTests = [
      { endpoint: 'search', latencyMs: 150 + Math.random() * 100, success: true },
      { endpoint: 'item', latencyMs: 100 + Math.random() * 50, success: true },
      { endpoint: 'bid', latencyMs: 200 + Math.random() * 100, success: Math.random() > 0.1 },
      { endpoint: 'offer', latencyMs: 180 + Math.random() * 80, success: Math.random() > 0.1 },
    ];

    const successfulConnections = connectionTests.filter(t => t.success).length;
    const avgLatency = connectionTests.reduce((sum, t) => sum + t.latencyMs, 0) / connectionTests.length;

    // Score based on success rate and latency
    const successScore = this.calculateAccuracy(successfulConnections, connectionTests.length);
    const latencyScore = avgLatency < 200 ? 100 : avgLatency < 300 ? 80 : avgLatency < 500 ? 60 : 40;
    const score = Math.round((successScore * 0.7) + (latencyScore * 0.3));

    return this.createResult(
      'BASIC_API_CONNECTION',
      score,
      Date.now() - startTime,
      this.createMetrics({
        decisionsCount: connectionTests.length,
        correctDecisions: successfulConnections,
        avgDecisionTimeMs: avgLatency,
        custom: {
          avgLatencyMs: Math.round(avgLatency),
          successRate: successScore,
          endpointsTested: connectionTests.length,
        },
      }),
      score >= this.config.passingScore
        ? 'API connections established. Recruit ready for conditioning.'
        : 'Connection issues detected. Network drills required.'
    );
  }
}
