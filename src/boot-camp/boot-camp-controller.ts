/**
 * Boot Camp Controller
 *
 * Central orchestrator for the Marine Agent Boot Camp Protocol.
 * Manages recruit lifecycle, training phases, and certification.
 */

import { EventEmitter } from 'events';
import type {
  BootCampConfig,
  BootCampState,
  BootCampStatus,
  RecruitRecord,
  RecruitStatus,
  TrainingPhase,
  PhaseEvaluation,
  DrillInstructor,
  DIReviewRequest,
  BootCampEvent,
  BootCampEventType,
  ExerciseType,
  MarksmanshipQualification,
} from './types.js';
import {
  PHASE_ORDER,
  getNextPhase,
  DEFAULT_BOOT_CAMP_CONFIG,
  DEFAULT_PHASE_CONFIGS,
  generateBootCampId,
  generateRecruitId,
  generateDIId,
  generateReviewRequestId,
  generateBootCampEventId,
  getMarksmanshipQualification,
} from './types.js';
import { createPhase, type PhaseImplementation } from './phases/index.js';
import type { ExerciseContext } from './phases/base-phase.js';
import type { MarketAgentConfig, BiddingStrategy, NormalizedListing } from '../swarm/types.js';
import { createStrategy, type BiddingStrategyInterface } from '../swarm/strategies/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Boot Camp creation options.
 */
export interface CreateBootCampOptions {
  name: string;
  swarmId: string;
  trainingBudgetPerRecruit?: number;
  requireDIApproval?: boolean;
  allowRecycling?: boolean;
  maxTotalRecyclings?: number;
  autoAdvance?: boolean;
  createdBy: string;
}

/**
 * Recruit enrollment options.
 */
export interface EnrollRecruitOptions {
  agentConfig: MarketAgentConfig;
  assignedDI?: string;
  trainingBudget?: number;
}

/**
 * Boot Camp controller events.
 */
export interface BootCampControllerEvents {
  'bootcamp:created': (bootCampId: string, config: BootCampConfig) => void;
  'bootcamp:started': (bootCampId: string) => void;
  'bootcamp:completed': (bootCampId: string) => void;
  'recruit:enlisted': (recruitId: string, agentId: string) => void;
  'recruit:phase_started': (recruitId: string, phase: TrainingPhase) => void;
  'recruit:phase_passed': (recruitId: string, phase: TrainingPhase, score: number) => void;
  'recruit:phase_failed': (recruitId: string, phase: TrainingPhase, score: number) => void;
  'recruit:recycled': (recruitId: string, phase: TrainingPhase) => void;
  'recruit:dropped': (recruitId: string, reason: string) => void;
  'recruit:graduated': (recruitId: string, certificationLevel: string) => void;
  'di:review_requested': (requestId: string, recruitId: string, phase: TrainingPhase) => void;
  'di:review_completed': (requestId: string, approved: boolean) => void;
  'error': (error: Error) => void;
}

// =============================================================================
// BOOT CAMP CONTROLLER CLASS
// =============================================================================

export class BootCampController extends EventEmitter {
  private config: BootCampConfig | null = null;
  private state: BootCampState | null = null;
  private recruits: Map<string, RecruitRecord> = new Map();
  private strategies: Map<string, BiddingStrategyInterface> = new Map();
  private drillInstructors: Map<string, DrillInstructor> = new Map();
  private pendingReviews: Map<string, DIReviewRequest> = new Map();
  private events: BootCampEvent[] = [];

  constructor() {
    super();
  }

  // ===========================================================================
  // BOOT CAMP LIFECYCLE
  // ===========================================================================

  /**
   * Create a new Boot Camp.
   */
  async createBootCamp(options: CreateBootCampOptions): Promise<string> {
    const bootCampId = generateBootCampId();
    const now = new Date().toISOString();

    this.config = {
      bootCampId,
      swarmId: options.swarmId,
      name: options.name,
      phaseConfigs: { ...DEFAULT_PHASE_CONFIGS },
      trainingBudgetPerRecruit: {
        value: options.trainingBudgetPerRecruit ?? DEFAULT_BOOT_CAMP_CONFIG.trainingBudgetPerRecruit.value,
        currency: 'USD',
      },
      requireDIApproval: options.requireDIApproval ?? DEFAULT_BOOT_CAMP_CONFIG.requireDIApproval,
      allowRecycling: options.allowRecycling ?? DEFAULT_BOOT_CAMP_CONFIG.allowRecycling,
      maxTotalRecyclings: options.maxTotalRecyclings ?? DEFAULT_BOOT_CAMP_CONFIG.maxTotalRecyclings,
      autoAdvance: options.autoAdvance ?? DEFAULT_BOOT_CAMP_CONFIG.autoAdvance,
      createdAt: now,
      createdBy: options.createdBy,
    };

    this.state = {
      status: 'PREPARING',
      totalRecruits: 0,
      inTraining: 0,
      graduated: 0,
      dropped: 0,
      phaseBreakdown: {
        RECEIVING: 0,
        CONDITIONING: 0,
        MARKSMANSHIP: 0,
        COMBAT: 0,
        CRUCIBLE: 0,
        GRADUATION: 0,
      },
      totalTrainingBudget: { value: 0, currency: 'USD' },
      trainingBudgetSpent: { value: 0, currency: 'USD' },
      lastActivityAt: now,
    };

    await this.recordEvent('BOOT_CAMP_CREATED', bootCampId, undefined, {
      name: options.name,
      swarmId: options.swarmId,
    });

    this.emit('bootcamp:created', bootCampId, this.config);

    return bootCampId;
  }

  /**
   * Start Boot Camp operations (begin accepting recruits).
   */
  async startBootCamp(): Promise<void> {
    if (!this.config || !this.state) {
      throw new Error('No Boot Camp configured');
    }

    this.state.status = 'RECEIVING';
    this.state.startedAt = new Date().toISOString();

    await this.recordEvent('BOOT_CAMP_STARTED', this.config.bootCampId);
    this.emit('bootcamp:started', this.config.bootCampId);
  }

  /**
   * Get Boot Camp status.
   */
  getStatus(): BootCampState | null {
    return this.state;
  }

  /**
   * Get Boot Camp configuration.
   */
  getConfig(): BootCampConfig | null {
    return this.config;
  }

  // ===========================================================================
  // RECRUIT MANAGEMENT
  // ===========================================================================

  /**
   * Enroll a new recruit (agent) in Boot Camp.
   */
  async enrollRecruit(options: EnrollRecruitOptions): Promise<string> {
    if (!this.config || !this.state) {
      throw new Error('No Boot Camp configured');
    }

    if (this.state.status !== 'RECEIVING' && this.state.status !== 'ACTIVE') {
      throw new Error(`Cannot enroll recruits in ${this.state.status} status`);
    }

    const recruitId = generateRecruitId();
    const now = new Date().toISOString();
    const trainingBudget = options.trainingBudget ?? this.config.trainingBudgetPerRecruit.value;

    const recruit: RecruitRecord = {
      recruitId,
      agentId: options.agentConfig.agentId,
      swarmId: options.agentConfig.swarmId,
      name: options.agentConfig.name ?? `Recruit_${recruitId.slice(-6)}`,
      strategy: options.agentConfig.strategy,
      status: 'ENLISTED',
      currentPhase: 'RECEIVING',
      trainingBudget: { value: trainingBudget, currency: 'USD' },
      trainingBudgetSpent: { value: 0, currency: 'USD' },
      phaseHistory: [],
      currentAttempt: 1,
      totalRecyclings: 0,
      expertBadges: [],
      merits: [],
      demerits: [],
      enlistedAt: now,
      lastActivityAt: now,
      assignedDI: options.assignedDI,
      requiresDIApproval: this.config.requireDIApproval,
      diNotes: [],
    };

    this.recruits.set(recruitId, recruit);

    // Create strategy instance for training
    const strategy = createStrategy(options.agentConfig.strategy);
    this.strategies.set(recruitId, strategy);

    // Update state
    this.state.totalRecruits++;
    this.state.totalTrainingBudget.value += trainingBudget;
    this.state.lastActivityAt = now;

    await this.recordEvent('RECRUIT_ENLISTED', this.config.bootCampId, recruitId, {
      agentId: options.agentConfig.agentId,
      strategy: options.agentConfig.strategy,
    });

    this.emit('recruit:enlisted', recruitId, options.agentConfig.agentId);

    return recruitId;
  }

  /**
   * Get recruit record.
   */
  getRecruit(recruitId: string): RecruitRecord | null {
    return this.recruits.get(recruitId) ?? null;
  }

  /**
   * Get all recruits.
   */
  getAllRecruits(): RecruitRecord[] {
    return Array.from(this.recruits.values());
  }

  /**
   * Get recruits by status.
   */
  getRecruitsByStatus(status: RecruitStatus): RecruitRecord[] {
    return Array.from(this.recruits.values()).filter(r => r.status === status);
  }

  /**
   * Get recruits by phase.
   */
  getRecruitsByPhase(phase: TrainingPhase): RecruitRecord[] {
    return Array.from(this.recruits.values()).filter(
      r => r.currentPhase === phase && r.status === 'IN_TRAINING'
    );
  }

  // ===========================================================================
  // TRAINING OPERATIONS
  // ===========================================================================

  /**
   * Start training for a recruit.
   */
  async startTraining(recruitId: string): Promise<void> {
    const recruit = this.recruits.get(recruitId);
    if (!recruit) {
      throw new Error(`Recruit ${recruitId} not found`);
    }

    if (recruit.status !== 'ENLISTED' && recruit.status !== 'PHASE_COMPLETE') {
      throw new Error(`Recruit ${recruitId} cannot start training in ${recruit.status} status`);
    }

    recruit.status = 'IN_TRAINING';
    recruit.trainingStartedAt = recruit.trainingStartedAt ?? new Date().toISOString();
    recruit.lastActivityAt = new Date().toISOString();

    if (this.state) {
      this.state.inTraining++;
      this.state.phaseBreakdown[recruit.currentPhase]++;
      this.state.status = 'ACTIVE';
    }

    await this.recordEvent('RECRUIT_TRAINING_STARTED', this.config!.bootCampId, recruitId);
    await this.recordEvent('RECRUIT_PHASE_STARTED', this.config!.bootCampId, recruitId, {
      phase: recruit.currentPhase,
      attempt: recruit.currentAttempt,
    });

    this.emit('recruit:phase_started', recruitId, recruit.currentPhase);
  }

  /**
   * Run current phase for a recruit.
   */
  async runPhase(recruitId: string, simulatedListings?: NormalizedListing[]): Promise<PhaseEvaluation> {
    const recruit = this.recruits.get(recruitId);
    if (!recruit) {
      throw new Error(`Recruit ${recruitId} not found`);
    }

    if (recruit.status !== 'IN_TRAINING') {
      throw new Error(`Recruit ${recruitId} is not in training`);
    }

    const strategy = this.strategies.get(recruitId);
    if (!strategy) {
      throw new Error(`Strategy not found for recruit ${recruitId}`);
    }

    // Build exercise context
    const context: ExerciseContext = {
      recruit,
      agentConfig: this.buildAgentConfig(recruit),
      strategy,
      simulatedListings: simulatedListings ?? [],
      trainingBudgetRemaining: recruit.trainingBudget.value - recruit.trainingBudgetSpent.value,
    };

    // Get phase implementation
    const phase = createPhase(recruit.currentPhase);

    // Run the phase
    const evaluation = await phase.runPhase(context);

    // Record exercise completions
    for (const exercise of evaluation.exerciseResults) {
      await this.recordEvent('RECRUIT_EXERCISE_COMPLETED', this.config!.bootCampId, recruitId, {
        phase: recruit.currentPhase,
        exerciseType: exercise.exerciseType,
        score: exercise.score,
        passed: exercise.passed,
      });

      // Check for expert badge
      if (exercise.score >= 95) {
        recruit.expertBadges.push(exercise.exerciseType);
        await this.recordEvent('EXPERT_BADGE_EARNED', this.config!.bootCampId, recruitId, {
          exerciseType: exercise.exerciseType,
          score: exercise.score,
        });
      }
    }

    // Record phase result
    recruit.phaseHistory.push(evaluation);
    recruit.lastActivityAt = new Date().toISOString();

    // Update training budget spent (simulated cost)
    const phaseCost = recruit.trainingBudget.value * 0.1; // Each phase costs 10%
    recruit.trainingBudgetSpent.value += phaseCost;
    if (this.state) {
      this.state.trainingBudgetSpent.value += phaseCost;
    }

    // Handle marksmanship qualification
    if (recruit.currentPhase === 'MARKSMANSHIP' && evaluation.passed) {
      const bidAccuracyResult = evaluation.exerciseResults.find(
        r => r.exerciseType === 'BID_ACCURACY_DRILL'
      );
      if (bidAccuracyResult) {
        recruit.marksmanshipQual = getMarksmanshipQualification(bidAccuracyResult.score);
        await this.recordEvent('QUALIFICATION_EARNED', this.config!.bootCampId, recruitId, {
          qualification: 'MARKSMANSHIP',
          level: recruit.marksmanshipQual,
          score: bidAccuracyResult.score,
        });
      }
    }

    // Process result
    if (evaluation.passed) {
      await this.handlePhasePassed(recruitId, recruit, evaluation);
    } else {
      await this.handlePhaseFailed(recruitId, recruit, evaluation);
    }

    return evaluation;
  }

  /**
   * Handle phase passed.
   */
  private async handlePhasePassed(
    recruitId: string,
    recruit: RecruitRecord,
    evaluation: PhaseEvaluation
  ): Promise<void> {
    await this.recordEvent('RECRUIT_PHASE_PASSED', this.config!.bootCampId, recruitId, {
      phase: recruit.currentPhase,
      score: evaluation.score,
      attempt: recruit.currentAttempt,
    });

    this.emit('recruit:phase_passed', recruitId, recruit.currentPhase, evaluation.score);

    // Check if DI approval required
    if (this.config!.requireDIApproval && !this.config!.autoAdvance) {
      await this.requestDIReview(recruitId, recruit.currentPhase, evaluation);
      recruit.status = 'PHASE_COMPLETE';
    } else {
      // Auto-advance to next phase
      await this.advanceToNextPhase(recruitId, recruit);
    }
  }

  /**
   * Handle phase failed.
   */
  private async handlePhaseFailed(
    recruitId: string,
    recruit: RecruitRecord,
    evaluation: PhaseEvaluation
  ): Promise<void> {
    await this.recordEvent('RECRUIT_PHASE_FAILED', this.config!.bootCampId, recruitId, {
      phase: recruit.currentPhase,
      score: evaluation.score,
      attempt: recruit.currentAttempt,
    });

    this.emit('recruit:phase_failed', recruitId, recruit.currentPhase, evaluation.score);

    // Issue demerit
    recruit.demerits.push(`Failed ${recruit.currentPhase} Phase (Attempt ${recruit.currentAttempt})`);
    await this.recordEvent('DEMERIT_ISSUED', this.config!.bootCampId, recruitId, {
      reason: `Failed ${recruit.currentPhase} Phase`,
      attempt: recruit.currentAttempt,
    });

    // Check for recycling
    const phaseConfig = this.config!.phaseConfigs[recruit.currentPhase];

    if (recruit.currentAttempt < phaseConfig.maxAttempts && this.config!.allowRecycling) {
      // Recycle
      await this.recycleRecruit(recruitId, recruit);
    } else if (recruit.totalRecyclings < this.config!.maxTotalRecyclings) {
      // Allow restart if under max recyclings
      await this.recycleRecruit(recruitId, recruit);
    } else {
      // Drop recruit
      await this.dropRecruit(recruitId, 'Exceeded maximum training attempts');
    }
  }

  /**
   * Advance recruit to next phase.
   */
  private async advanceToNextPhase(
    recruitId: string,
    recruit: RecruitRecord
  ): Promise<void> {
    if (this.state) {
      this.state.phaseBreakdown[recruit.currentPhase]--;
    }

    const nextPhase = getNextPhase(recruit.currentPhase);

    if (!nextPhase) {
      // Completed all phases - graduation!
      await this.graduateRecruit(recruitId, recruit);
    } else {
      recruit.currentPhase = nextPhase;
      recruit.currentAttempt = 1;
      recruit.status = 'IN_TRAINING';

      if (this.state) {
        this.state.phaseBreakdown[nextPhase]++;
      }

      await this.recordEvent('RECRUIT_PHASE_STARTED', this.config!.bootCampId, recruitId, {
        phase: nextPhase,
        attempt: 1,
      });

      this.emit('recruit:phase_started', recruitId, nextPhase);
    }
  }

  /**
   * Recycle recruit (restart current phase).
   */
  private async recycleRecruit(
    recruitId: string,
    recruit: RecruitRecord
  ): Promise<void> {
    recruit.currentAttempt++;
    recruit.totalRecyclings++;
    recruit.status = 'RECYCLED';

    await this.recordEvent('RECRUIT_RECYCLED', this.config!.bootCampId, recruitId, {
      phase: recruit.currentPhase,
      attempt: recruit.currentAttempt,
      totalRecyclings: recruit.totalRecyclings,
    });

    this.emit('recruit:recycled', recruitId, recruit.currentPhase);
  }

  /**
   * Drop recruit from training.
   */
  private async dropRecruit(recruitId: string, reason: string): Promise<void> {
    const recruit = this.recruits.get(recruitId);
    if (!recruit) return;

    recruit.status = 'DROPPED';

    if (this.state) {
      this.state.inTraining--;
      this.state.dropped++;
      this.state.phaseBreakdown[recruit.currentPhase]--;
    }

    await this.recordEvent('RECRUIT_DROPPED', this.config!.bootCampId, recruitId, {
      reason,
      lastPhase: recruit.currentPhase,
      totalRecyclings: recruit.totalRecyclings,
    });

    this.emit('recruit:dropped', recruitId, reason);
  }

  /**
   * Graduate recruit from Boot Camp.
   */
  private async graduateRecruit(
    recruitId: string,
    recruit: RecruitRecord
  ): Promise<void> {
    recruit.status = 'GRADUATED';
    recruit.graduatedAt = new Date().toISOString();

    // Determine certification level
    const avgScore = recruit.phaseHistory.reduce((sum, p) => sum + p.score, 0) / recruit.phaseHistory.length;
    const certificationLevel = this.determineCertificationLevel(recruit, avgScore);

    if (this.state) {
      this.state.inTraining--;
      this.state.graduated++;
      this.state.phaseBreakdown.GRADUATION--;
    }

    await this.recordEvent('RECRUIT_GRADUATED', this.config!.bootCampId, recruitId, {
      certificationLevel,
      avgScore,
      marksmanship: recruit.marksmanshipQual,
      expertBadges: recruit.expertBadges,
      merits: recruit.merits,
      totalRecyclings: recruit.totalRecyclings,
    });

    this.emit('recruit:graduated', recruitId, certificationLevel);

    // Check if Boot Camp is complete
    await this.checkBootCampCompletion();
  }

  /**
   * Mark recruit as combat ready (after graduation).
   */
  async markCombatReady(recruitId: string): Promise<void> {
    const recruit = this.recruits.get(recruitId);
    if (!recruit || recruit.status !== 'GRADUATED') {
      throw new Error(`Recruit ${recruitId} is not graduated`);
    }

    recruit.status = 'COMBAT_READY';

    await this.recordEvent('RECRUIT_DEPLOYED', this.config!.bootCampId, recruitId);
  }

  // ===========================================================================
  // DRILL INSTRUCTOR OPERATIONS
  // ===========================================================================

  /**
   * Register a Drill Instructor.
   */
  async registerDI(
    name: string,
    userId?: string,
    isAutomated: boolean = false,
    specialties?: BiddingStrategy[]
  ): Promise<string> {
    const diId = generateDIId();

    const di: DrillInstructor = {
      diId,
      name,
      userId,
      isAutomated,
      specialties: specialties ?? [],
      assignedRecruits: [],
      totalGraduated: 0,
      totalDropped: 0,
      createdAt: new Date().toISOString(),
    };

    this.drillInstructors.set(diId, di);

    return diId;
  }

  /**
   * Assign DI to recruit.
   */
  async assignDI(recruitId: string, diId: string): Promise<void> {
    const recruit = this.recruits.get(recruitId);
    const di = this.drillInstructors.get(diId);

    if (!recruit) throw new Error(`Recruit ${recruitId} not found`);
    if (!di) throw new Error(`DI ${diId} not found`);

    recruit.assignedDI = diId;
    di.assignedRecruits.push(recruitId);

    await this.recordEvent('DI_ASSIGNED', this.config!.bootCampId, recruitId, {
      diId,
      diName: di.name,
    });
  }

  /**
   * Request DI review for phase advancement.
   */
  private async requestDIReview(
    recruitId: string,
    phase: TrainingPhase,
    evaluation: PhaseEvaluation
  ): Promise<string> {
    const recruit = this.recruits.get(recruitId);
    if (!recruit) throw new Error(`Recruit ${recruitId} not found`);

    const requestId = generateReviewRequestId();

    const request: DIReviewRequest = {
      requestId,
      recruitId,
      phase,
      evaluation,
      assignedDI: recruit.assignedDI,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.pendingReviews.set(requestId, request);

    await this.recordEvent('DI_REVIEW_REQUESTED', this.config!.bootCampId, recruitId, {
      requestId,
      phase,
      score: evaluation.score,
    });

    this.emit('di:review_requested', requestId, recruitId, phase);

    return requestId;
  }

  /**
   * DI approves phase advancement.
   */
  async approveDIReview(requestId: string, diId: string, notes?: string): Promise<void> {
    const request = this.pendingReviews.get(requestId);
    if (!request) throw new Error(`Review request ${requestId} not found`);

    const recruit = this.recruits.get(request.recruitId);
    if (!recruit) throw new Error(`Recruit ${request.recruitId} not found`);

    request.status = 'APPROVED';
    request.reviewedAt = new Date().toISOString();
    request.reviewNotes = notes;

    // Add DI notes to recruit record
    if (notes) {
      recruit.diNotes.push(`[${new Date().toISOString()}] ${notes}`);
    }

    await this.recordEvent('DI_REVIEW_COMPLETED', this.config!.bootCampId, request.recruitId, {
      requestId,
      approved: true,
      diId,
      notes,
    });

    this.emit('di:review_completed', requestId, true);

    // Advance recruit
    await this.advanceToNextPhase(request.recruitId, recruit);

    this.pendingReviews.delete(requestId);
  }

  /**
   * DI rejects phase advancement (requires recycle).
   */
  async rejectDIReview(requestId: string, diId: string, reason: string): Promise<void> {
    const request = this.pendingReviews.get(requestId);
    if (!request) throw new Error(`Review request ${requestId} not found`);

    const recruit = this.recruits.get(request.recruitId);
    if (!recruit) throw new Error(`Recruit ${request.recruitId} not found`);

    request.status = 'REJECTED';
    request.reviewedAt = new Date().toISOString();
    request.reviewNotes = reason;

    recruit.diNotes.push(`[${new Date().toISOString()}] REJECTED: ${reason}`);

    await this.recordEvent('DI_REVIEW_COMPLETED', this.config!.bootCampId, request.recruitId, {
      requestId,
      approved: false,
      diId,
      reason,
    });

    this.emit('di:review_completed', requestId, false);

    // Recycle recruit
    await this.recycleRecruit(request.recruitId, recruit);

    this.pendingReviews.delete(requestId);
  }

  /**
   * Get pending DI reviews.
   */
  getPendingReviews(diId?: string): DIReviewRequest[] {
    const reviews = Array.from(this.pendingReviews.values());
    if (diId) {
      return reviews.filter(r => r.assignedDI === diId);
    }
    return reviews;
  }

  // ===========================================================================
  // CERTIFICATION CHECK
  // ===========================================================================

  /**
   * Check if an agent is certified for live trading.
   */
  isAgentCertified(agentId: string): boolean {
    for (const recruit of this.recruits.values()) {
      if (recruit.agentId === agentId) {
        return recruit.status === 'GRADUATED' || recruit.status === 'COMBAT_READY';
      }
    }
    return false;
  }

  /**
   * Get agent's certification status.
   */
  getAgentCertificationStatus(agentId: string): {
    certified: boolean;
    status: RecruitStatus | 'NOT_ENROLLED';
    currentPhase?: TrainingPhase;
    certificationLevel?: string;
    graduatedAt?: string;
  } {
    for (const recruit of this.recruits.values()) {
      if (recruit.agentId === agentId) {
        const certified = recruit.status === 'GRADUATED' || recruit.status === 'COMBAT_READY';
        const avgScore = recruit.phaseHistory.length > 0
          ? recruit.phaseHistory.reduce((sum, p) => sum + p.score, 0) / recruit.phaseHistory.length
          : 0;

        return {
          certified,
          status: recruit.status,
          currentPhase: recruit.currentPhase,
          certificationLevel: certified ? this.determineCertificationLevel(recruit, avgScore) : undefined,
          graduatedAt: recruit.graduatedAt,
        };
      }
    }
    return { certified: false, status: 'NOT_ENROLLED' };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private buildAgentConfig(recruit: RecruitRecord): MarketAgentConfig {
    return {
      agentId: recruit.agentId,
      name: recruit.name,
      strategy: recruit.strategy,
      swarmId: recruit.swarmId,
      budget: {
        amount: recruit.trainingBudget.value,
        currency: recruit.trainingBudget.currency,
        maxPerItem: recruit.trainingBudget.value * 0.5,
        reservePercent: 5,
      },
      timeWindow: {
        start: new Date(),
        end: new Date(Date.now() + 86400000),
      },
      targetCriteria: {
        searchQuery: 'training',
        priceRange: { min: 0, max: recruit.trainingBudget.value },
        conditions: ['ANY'],
        listingFormats: ['ANY'],
      },
      constraints: {
        maxConcurrentListings: 10,
        maxBidsPerHour: 20,
        maxOffersPerHour: 10,
        minActionIntervalMs: 1000,
      },
    };
  }

  private determineCertificationLevel(recruit: RecruitRecord, avgScore: number): string {
    const hasExpertBadges = recruit.expertBadges.length >= 3;
    const isExpertMarksman = recruit.marksmanshipQual === 'EXPERT';
    const hasMerits = recruit.merits.length > 0;
    const noRecyclings = recruit.totalRecyclings === 0;

    if (avgScore >= 95 && isExpertMarksman && hasExpertBadges && noRecyclings) {
      return 'HONOR GRADUATE';
    }
    if (avgScore >= 90 && (isExpertMarksman || hasExpertBadges)) {
      return 'MERITORIOUS';
    }
    if (avgScore >= 85) {
      return 'CERTIFIED - COMBAT READY';
    }
    return 'CERTIFIED - STANDARD';
  }

  private async checkBootCampCompletion(): Promise<void> {
    if (!this.state) return;

    const allComplete = this.state.inTraining === 0 &&
      this.state.totalRecruits === (this.state.graduated + this.state.dropped);

    if (allComplete && this.state.totalRecruits > 0) {
      this.state.status = 'GRADUATED';
      this.state.completedAt = new Date().toISOString();

      await this.recordEvent('BOOT_CAMP_COMPLETED', this.config!.bootCampId, undefined, {
        totalRecruits: this.state.totalRecruits,
        graduated: this.state.graduated,
        dropped: this.state.dropped,
        graduationRate: this.state.graduated / this.state.totalRecruits,
      });

      this.emit('bootcamp:completed', this.config!.bootCampId);
    }
  }

  private async recordEvent(
    eventType: BootCampEventType,
    bootCampId: string,
    recruitId?: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const event: BootCampEvent = {
      eventId: generateBootCampEventId(),
      eventType,
      bootCampId,
      recruitId,
      timestamp: new Date().toISOString(),
      data,
    };

    this.events.push(event);
  }

  /**
   * Get all events.
   */
  getEvents(recruitId?: string): BootCampEvent[] {
    if (recruitId) {
      return this.events.filter(e => e.recruitId === recruitId);
    }
    return this.events;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let controllerInstance: BootCampController | null = null;

/**
 * Get the Boot Camp controller singleton.
 */
export function getBootCampController(): BootCampController {
  if (!controllerInstance) {
    controllerInstance = new BootCampController();
  }
  return controllerInstance;
}

/**
 * Create a fresh Boot Camp controller (for testing).
 */
export function createBootCampController(): BootCampController {
  return new BootCampController();
}
