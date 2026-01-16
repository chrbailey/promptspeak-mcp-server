/**
 * Boot Camp Training Phases Unit Tests
 *
 * Tests for the Marine Agent Boot Camp Protocol.
 * Validates phase progression, scoring, and certification logic.
 */

import { describe, it, expect } from 'vitest';
import {
  PHASE_ORDER,
  DEFAULT_PHASE_CONFIGS,
  getNextPhase,
  getMarksmanshipQualification,
  DEFAULT_BOOT_CAMP_CONFIG,
  generateBootCampId,
  generateRecruitId,
  generateExerciseId,
  generateDIId,
  generateReviewRequestId,
  generateBootCampEventId,
  type TrainingPhase,
  type RecruitStatus,
  type MarksmanshipQualification,
  type PhaseConfig,
  type ExerciseResult,
  type ExerciseMetrics,
} from '../../../src/boot-camp/types.js';

describe('Training Phase Order', () => {
  it('should have 6 phases in correct order', () => {
    expect(PHASE_ORDER).toHaveLength(6);
    expect(PHASE_ORDER).toEqual([
      'RECEIVING',
      'CONDITIONING',
      'MARKSMANSHIP',
      'COMBAT',
      'CRUCIBLE',
      'GRADUATION',
    ]);
  });

  it('should follow USMC training sequence', () => {
    // USMC Boot Camp phases:
    // Weeks 1-2: Receiving (initial processing)
    // Weeks 3-4: Conditioning (close order drill, PT)
    // Weeks 5-6: Marksmanship (rifle qualification)
    // Weeks 7-9: Combat (field training)
    // Weeks 10-11: Crucible (54-hour final challenge)
    // Weeks 12-13: Graduation (final inspection)

    expect(PHASE_ORDER[0]).toBe('RECEIVING');
    expect(PHASE_ORDER[1]).toBe('CONDITIONING');
    expect(PHASE_ORDER[2]).toBe('MARKSMANSHIP');
    expect(PHASE_ORDER[3]).toBe('COMBAT');
    expect(PHASE_ORDER[4]).toBe('CRUCIBLE');
    expect(PHASE_ORDER[5]).toBe('GRADUATION');
  });
});

describe('getNextPhase', () => {
  it('should return correct next phase for each phase', () => {
    expect(getNextPhase('RECEIVING')).toBe('CONDITIONING');
    expect(getNextPhase('CONDITIONING')).toBe('MARKSMANSHIP');
    expect(getNextPhase('MARKSMANSHIP')).toBe('COMBAT');
    expect(getNextPhase('COMBAT')).toBe('CRUCIBLE');
    expect(getNextPhase('CRUCIBLE')).toBe('GRADUATION');
  });

  it('should return null for GRADUATION (final phase)', () => {
    expect(getNextPhase('GRADUATION')).toBeNull();
  });

  it('should return null for invalid phase', () => {
    expect(getNextPhase('INVALID_PHASE' as TrainingPhase)).toBeNull();
  });
});

describe('Phase Configurations', () => {
  describe('RECEIVING phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.RECEIVING;

    it('should have correct passing score', () => {
      expect(config.passingScore).toBe(70);
    });

    it('should have 3 max attempts', () => {
      expect(config.maxAttempts).toBe(3);
    });

    it('should include initial exercises', () => {
      expect(config.exercises).toContain('CONFIGURATION_VALIDATION');
      expect(config.exercises).toContain('CREDENTIAL_VERIFICATION');
      expect(config.exercises).toContain('BUDGET_ALLOCATION_TEST');
      expect(config.exercises).toContain('BASIC_API_CONNECTION');
    });
  });

  describe('CONDITIONING phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.CONDITIONING;

    it('should have higher passing score than RECEIVING', () => {
      expect(config.passingScore).toBeGreaterThan(DEFAULT_PHASE_CONFIGS.RECEIVING.passingScore);
    });

    it('should have 5 max attempts', () => {
      expect(config.maxAttempts).toBe(5);
    });

    it('should include strategy drills', () => {
      expect(config.exercises).toContain('STRATEGY_ALIGNMENT_DRILL');
      expect(config.exercises).toContain('DECISION_SPEED_TEST');
    });
  });

  describe('MARKSMANSHIP phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.MARKSMANSHIP;

    it('should have 80% passing score (Sharpshooter level)', () => {
      expect(config.passingScore).toBe(80);
    });

    it('should include bid accuracy exercises', () => {
      expect(config.exercises).toContain('BID_ACCURACY_DRILL');
      expect(config.exercises).toContain('TIMING_PRECISION_TEST');
      expect(config.exercises).toContain('VALUE_ASSESSMENT_TEST');
      expect(config.exercises).toContain('SNIPE_WINDOW_DRILL');
    });
  });

  describe('COMBAT phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.COMBAT;

    it('should have longer minimum duration', () => {
      expect(config.minDurationMs).toBeGreaterThan(DEFAULT_PHASE_CONFIGS.MARKSMANSHIP.minDurationMs);
    });

    it('should include live simulation', () => {
      expect(config.exercises).toContain('LIVE_SANDBOX_SIMULATION');
      expect(config.exercises).toContain('COMPETITIVE_SCENARIO');
    });
  });

  describe('CRUCIBLE phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.CRUCIBLE;

    it('should have highest passing score before graduation', () => {
      expect(config.passingScore).toBe(85);
    });

    it('should have only 2 max attempts (most challenging)', () => {
      expect(config.maxAttempts).toBe(2);
    });

    it('should include stress exercises', () => {
      expect(config.exercises).toContain('LIMITED_BUDGET_OPERATION');
      expect(config.exercises).toContain('HIGH_COMPETITION_SCENARIO');
      expect(config.exercises).toContain('RAPID_DECISION_SEQUENCE');
      expect(config.exercises).toContain('RECOVERY_FROM_LOSS');
    });
  });

  describe('GRADUATION phase', () => {
    const config = DEFAULT_PHASE_CONFIGS.GRADUATION;

    it('should have 90% passing score (highest)', () => {
      expect(config.passingScore).toBe(90);
    });

    it('should have only 1 attempt (final inspection)', () => {
      expect(config.maxAttempts).toBe(1);
    });

    it('should include certification exam', () => {
      expect(config.exercises).toContain('CERTIFICATION_EXAM');
      expect(config.exercises).toContain('FINAL_INSPECTION');
    });
  });

  it('should have increasing difficulty across phases', () => {
    const scores = PHASE_ORDER.map(phase => DEFAULT_PHASE_CONFIGS[phase].passingScore);

    // General trend should be increasing (with some variance for COMBAT)
    expect(scores[0]).toBeLessThanOrEqual(scores[2]); // RECEIVING <= MARKSMANSHIP
    expect(scores[2]).toBeLessThanOrEqual(scores[4]); // MARKSMANSHIP <= CRUCIBLE
    expect(scores[5]).toBeGreaterThanOrEqual(scores[4]); // GRADUATION >= CRUCIBLE
  });
});

describe('Marksmanship Qualification', () => {
  it('should return UNQUALIFIED for scores below 70', () => {
    expect(getMarksmanshipQualification(0)).toBe('UNQUALIFIED');
    expect(getMarksmanshipQualification(50)).toBe('UNQUALIFIED');
    expect(getMarksmanshipQualification(69)).toBe('UNQUALIFIED');
  });

  it('should return MARKSMAN for scores 70-79', () => {
    expect(getMarksmanshipQualification(70)).toBe('MARKSMAN');
    expect(getMarksmanshipQualification(75)).toBe('MARKSMAN');
    expect(getMarksmanshipQualification(79)).toBe('MARKSMAN');
  });

  it('should return SHARPSHOOTER for scores 80-89', () => {
    expect(getMarksmanshipQualification(80)).toBe('SHARPSHOOTER');
    expect(getMarksmanshipQualification(85)).toBe('SHARPSHOOTER');
    expect(getMarksmanshipQualification(89)).toBe('SHARPSHOOTER');
  });

  it('should return EXPERT for scores 90+', () => {
    expect(getMarksmanshipQualification(90)).toBe('EXPERT');
    expect(getMarksmanshipQualification(95)).toBe('EXPERT');
    expect(getMarksmanshipQualification(100)).toBe('EXPERT');
  });

  describe('gold/silver trading context', () => {
    it('should qualify EXPERT bidders for high-value gold trades', () => {
      // An EXPERT qualification (90%+) means the agent
      // has demonstrated exceptional bid accuracy, suitable for
      // expensive 1oz gold bar transactions ($2000+)
      const goldTradingScore = 92;
      expect(getMarksmanshipQualification(goldTradingScore)).toBe('EXPERT');
    });

    it('should qualify SHARPSHOOTER bidders for silver trades', () => {
      // A SHARPSHOOTER qualification (80-89%) is suitable for
      // moderate-value silver coin/bar trades ($25-100)
      const silverTradingScore = 82;
      expect(getMarksmanshipQualification(silverTradingScore)).toBe('SHARPSHOOTER');
    });

    it('should restrict UNQUALIFIED bidders from live trading', () => {
      // Agents scoring below 70% should not trade live
      const poorScore = 55;
      expect(getMarksmanshipQualification(poorScore)).toBe('UNQUALIFIED');
    });
  });
});

describe('Default Boot Camp Configuration', () => {
  it('should have all phase configs', () => {
    PHASE_ORDER.forEach(phase => {
      expect(DEFAULT_BOOT_CAMP_CONFIG.phaseConfigs[phase]).toBeDefined();
    });
  });

  it('should provide reasonable training budget', () => {
    // $100 training budget is appropriate for sandbox testing
    expect(DEFAULT_BOOT_CAMP_CONFIG.trainingBudgetPerRecruit.value).toBe(100);
    expect(DEFAULT_BOOT_CAMP_CONFIG.trainingBudgetPerRecruit.currency).toBe('USD');
  });

  it('should require DI approval by default', () => {
    // Human oversight is important for live trading authorization
    expect(DEFAULT_BOOT_CAMP_CONFIG.requireDIApproval).toBe(true);
  });

  it('should allow recycling with limit', () => {
    expect(DEFAULT_BOOT_CAMP_CONFIG.allowRecycling).toBe(true);
    expect(DEFAULT_BOOT_CAMP_CONFIG.maxTotalRecyclings).toBe(3);
  });

  it('should not auto-advance by default', () => {
    // Manual review is safer for live trading certification
    expect(DEFAULT_BOOT_CAMP_CONFIG.autoAdvance).toBe(false);
  });
});

describe('ID Generators', () => {
  describe('generateBootCampId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBootCampId();
      const id2 = generateBootCampId();

      expect(id1).not.toBe(id2);
    });

    it('should start with bc_ prefix', () => {
      const id = generateBootCampId();
      expect(id.startsWith('bc_')).toBe(true);
    });
  });

  describe('generateRecruitId', () => {
    it('should generate unique recruit IDs', () => {
      const id1 = generateRecruitId();
      const id2 = generateRecruitId();

      expect(id1).not.toBe(id2);
    });

    it('should start with rct_ prefix', () => {
      const id = generateRecruitId();
      expect(id.startsWith('rct_')).toBe(true);
    });
  });

  describe('generateExerciseId', () => {
    it('should generate unique exercise IDs', () => {
      const id1 = generateExerciseId();
      const id2 = generateExerciseId();

      expect(id1).not.toBe(id2);
    });

    it('should start with ex_ prefix', () => {
      const id = generateExerciseId();
      expect(id.startsWith('ex_')).toBe(true);
    });
  });

  describe('generateDIId', () => {
    it('should generate unique DI IDs', () => {
      const id1 = generateDIId();
      const id2 = generateDIId();

      expect(id1).not.toBe(id2);
    });

    it('should start with di_ prefix', () => {
      const id = generateDIId();
      expect(id.startsWith('di_')).toBe(true);
    });
  });

  describe('generateReviewRequestId', () => {
    it('should generate unique review request IDs', () => {
      const id1 = generateReviewRequestId();
      const id2 = generateReviewRequestId();

      expect(id1).not.toBe(id2);
    });

    it('should start with drv_ prefix', () => {
      const id = generateReviewRequestId();
      expect(id.startsWith('drv_')).toBe(true);
    });
  });

  describe('generateBootCampEventId', () => {
    it('should generate unique event IDs', () => {
      const id1 = generateBootCampEventId();
      const id2 = generateBootCampEventId();

      expect(id1).not.toBe(id2);
    });

    it('should start with bc_evt_ prefix', () => {
      const id = generateBootCampEventId();
      expect(id.startsWith('bc_evt_')).toBe(true);
    });
  });
});

describe('Exercise Metrics Structure', () => {
  it('should support bid tracking metrics', () => {
    const metrics: ExerciseMetrics = {
      decisionsCount: 50,
      correctDecisions: 42,
      avgDecisionTimeMs: 1500,
      bidsPlaced: 10,
      successfulBids: 7,
      budgetEfficiency: 0.85,
      timingAccuracy: 0.92,
    };

    expect(metrics.bidsPlaced).toBe(10);
    expect(metrics.successfulBids).toBe(7);
    expect(metrics.successfulBids! / metrics.bidsPlaced!).toBe(0.7);
  });

  it('should calculate accuracy percentage', () => {
    const metrics: ExerciseMetrics = {
      decisionsCount: 100,
      correctDecisions: 85,
      avgDecisionTimeMs: 1200,
    };

    const accuracy = (metrics.correctDecisions / metrics.decisionsCount) * 100;
    expect(accuracy).toBe(85);
  });

  it('should support custom metrics', () => {
    const metrics: ExerciseMetrics = {
      decisionsCount: 20,
      correctDecisions: 18,
      avgDecisionTimeMs: 800,
      custom: {
        goldItemsEvaluated: 5,
        silverItemsEvaluated: 15,
        averagePremiumPaid: 3.5,
        sniperSuccessRate: 0.75,
      },
    };

    expect(metrics.custom?.goldItemsEvaluated).toBe(5);
    expect(metrics.custom?.silverItemsEvaluated).toBe(15);
    expect(metrics.custom?.sniperSuccessRate).toBe(0.75);
  });
});

describe('Exercise Result Structure', () => {
  it('should capture complete exercise result', () => {
    const result: ExerciseResult = {
      exerciseId: generateExerciseId(),
      exerciseType: 'BID_ACCURACY_DRILL',
      phase: 'MARKSMANSHIP',
      score: 85,
      passed: true,
      durationMs: 180000,
      completedAt: new Date().toISOString(),
      metrics: {
        decisionsCount: 50,
        correctDecisions: 43,
        avgDecisionTimeMs: 1200,
        bidsPlaced: 20,
        successfulBids: 17,
        timingAccuracy: 0.85,
      },
      feedback: 'Strong bid placement timing. Work on value assessment.',
    };

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80); // MARKSMANSHIP passing score
    expect(result.metrics.bidsPlaced).toBe(20);
  });

  it('should fail exercise below passing score', () => {
    const result: ExerciseResult = {
      exerciseId: generateExerciseId(),
      exerciseType: 'SNIPE_WINDOW_DRILL',
      phase: 'MARKSMANSHIP',
      score: 65, // Below 80% required
      passed: false,
      durationMs: 120000,
      completedAt: new Date().toISOString(),
      metrics: {
        decisionsCount: 30,
        correctDecisions: 20,
        avgDecisionTimeMs: 2500, // Slow decisions
        timingAccuracy: 0.55, // Poor timing
      },
      feedback: 'Snipe timing needs significant improvement.',
    };

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(DEFAULT_PHASE_CONFIGS.MARKSMANSHIP.passingScore);
  });
});

describe('Precious Metals Training Scenarios', () => {
  describe('Gold Trading Readiness', () => {
    it('should require EXPERT qualification for gold bar trading', () => {
      // For gold bars ($2000+), we want agents with exceptional accuracy
      const goldTraderScore = 92;
      const qual = getMarksmanshipQualification(goldTraderScore);

      expect(qual).toBe('EXPERT');
      expect(goldTraderScore).toBeGreaterThanOrEqual(90);
    });

    it('should pass CRUCIBLE with high-value trading simulation', () => {
      // CRUCIBLE tests ability to trade under pressure with limited budget
      const crucibleConfig = DEFAULT_PHASE_CONFIGS.CRUCIBLE;

      // Agent must score 85%+ in limited budget scenarios
      expect(crucibleConfig.passingScore).toBe(85);
      expect(crucibleConfig.exercises).toContain('LIMITED_BUDGET_OPERATION');
    });
  });

  describe('Silver Trading Readiness', () => {
    it('should allow SHARPSHOOTER qualification for silver trading', () => {
      // Silver trades ($25-50) can be handled by SHARPSHOOTER level
      const silverTraderScore = 82;
      const qual = getMarksmanshipQualification(silverTraderScore);

      expect(qual).toBe('SHARPSHOOTER');
    });

    it('should test multi-listing management for silver batches', () => {
      // Silver is often purchased in batches
      const combatConfig = DEFAULT_PHASE_CONFIGS.COMBAT;

      expect(combatConfig.exercises).toContain('MULTI_LISTING_MANAGEMENT');
    });
  });

  describe('Full Certification Path', () => {
    it('should validate complete training path for live trading', () => {
      // An agent must pass all 6 phases to be certified
      const passedPhases: TrainingPhase[] = [];
      let currentPhase: TrainingPhase | null = PHASE_ORDER[0];

      while (currentPhase) {
        passedPhases.push(currentPhase);
        currentPhase = getNextPhase(currentPhase);
      }

      expect(passedPhases).toHaveLength(6);
      expect(passedPhases).toEqual(PHASE_ORDER);
    });

    it('should have increasingly difficult passing requirements', () => {
      const receivingScore = DEFAULT_PHASE_CONFIGS.RECEIVING.passingScore;
      const graduationScore = DEFAULT_PHASE_CONFIGS.GRADUATION.passingScore;

      expect(graduationScore).toBeGreaterThan(receivingScore);
      expect(graduationScore).toBe(90);
      expect(receivingScore).toBe(70);
    });
  });
});
