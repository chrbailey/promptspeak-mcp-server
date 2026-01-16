/**
 * Marine Agent Boot Camp Protocol - Type Definitions
 *
 * Training system based on United States Marine Corps Recruit Training doctrine.
 * Agents must complete all 6 phases before being certified for live trading.
 *
 * Phase Mapping:
 * 1. Receiving (Week 1-2)     -> Agent initialization and configuration
 * 2. Conditioning (Week 3-4)  -> Strategy calibration
 * 3. Marksmanship (Week 5-6)  -> Bid accuracy training
 * 4. Combat (Week 7-9)        -> Live market simulation
 * 5. Crucible (Week 10-11)    -> Stress testing with limited budget
 * 6. Graduation (Week 12-13)  -> Certification for live trading
 */

import type { BiddingStrategy, MarketAgentConfig, Money, Currency } from '../swarm/types.js';

// =============================================================================
// TRAINING PHASES
// =============================================================================

/**
 * Boot Camp training phases - mirrors USMC recruit training structure.
 */
export type TrainingPhase =
  | 'RECEIVING'       // Phase 1: Initial processing, configuration, basic orientation
  | 'CONDITIONING'    // Phase 2: Physical/mental conditioning - strategy calibration
  | 'MARKSMANSHIP'    // Phase 3: Rifle qualification - bid accuracy training
  | 'COMBAT'          // Phase 4: Field training - live market simulation
  | 'CRUCIBLE'        // Phase 5: Final challenge - stress testing with limited resources
  | 'GRADUATION';     // Phase 6: Final inspection and certification

/**
 * Phase progression order.
 */
export const PHASE_ORDER: TrainingPhase[] = [
  'RECEIVING',
  'CONDITIONING',
  'MARKSMANSHIP',
  'COMBAT',
  'CRUCIBLE',
  'GRADUATION',
];

/**
 * Get the next phase after a given phase.
 */
export function getNextPhase(current: TrainingPhase): TrainingPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

/**
 * Phase-specific configuration.
 */
export interface PhaseConfig {
  /** Phase identifier */
  phase: TrainingPhase;
  /** Minimum duration in milliseconds */
  minDurationMs: number;
  /** Maximum attempts before washout */
  maxAttempts: number;
  /** Required score to pass (0-100) */
  passingScore: number;
  /** Phase description */
  description: string;
  /** Training exercises for this phase */
  exercises: string[];
}

/**
 * Default phase configurations - based on USMC 13-week program.
 */
export const DEFAULT_PHASE_CONFIGS: Record<TrainingPhase, PhaseConfig> = {
  RECEIVING: {
    phase: 'RECEIVING',
    minDurationMs: 60000,  // 1 minute (simulated 2 weeks)
    maxAttempts: 3,
    passingScore: 70,
    description: 'Initial processing, haircut, gear issue, initial strength test',
    exercises: [
      'CONFIGURATION_VALIDATION',
      'CREDENTIAL_VERIFICATION',
      'BUDGET_ALLOCATION_TEST',
      'BASIC_API_CONNECTION',
    ],
  },
  CONDITIONING: {
    phase: 'CONDITIONING',
    minDurationMs: 120000, // 2 minutes (simulated 2 weeks)
    maxAttempts: 5,
    passingScore: 75,
    description: 'Physical and mental conditioning - close order drill, PT',
    exercises: [
      'STRATEGY_ALIGNMENT_DRILL',
      'DECISION_SPEED_TEST',
      'PARAMETER_TUNING',
      'STRESS_RESPONSE_CHECK',
    ],
  },
  MARKSMANSHIP: {
    phase: 'MARKSMANSHIP',
    minDurationMs: 180000, // 3 minutes (simulated 2 weeks)
    maxAttempts: 5,
    passingScore: 80,
    description: 'Rifle range qualification - snap in, known distance course',
    exercises: [
      'BID_ACCURACY_DRILL',
      'TIMING_PRECISION_TEST',
      'VALUE_ASSESSMENT_TEST',
      'SNIPE_WINDOW_DRILL',
    ],
  },
  COMBAT: {
    phase: 'COMBAT',
    minDurationMs: 300000, // 5 minutes (simulated 3 weeks)
    maxAttempts: 3,
    passingScore: 75,
    description: 'Field training exercises - MOUT, patrolling, defensive operations',
    exercises: [
      'LIVE_SANDBOX_SIMULATION',
      'COMPETITIVE_SCENARIO',
      'MULTI_LISTING_MANAGEMENT',
      'SELLER_INTERACTION_DRILL',
    ],
  },
  CRUCIBLE: {
    phase: 'CRUCIBLE',
    minDurationMs: 240000, // 4 minutes (simulated 54 hours)
    maxAttempts: 2,
    passingScore: 85,
    description: '54-hour final challenge with food/sleep deprivation simulation',
    exercises: [
      'LIMITED_BUDGET_OPERATION',
      'HIGH_COMPETITION_SCENARIO',
      'RAPID_DECISION_SEQUENCE',
      'RECOVERY_FROM_LOSS',
    ],
  },
  GRADUATION: {
    phase: 'GRADUATION',
    minDurationMs: 60000,  // 1 minute (final inspection)
    maxAttempts: 1,
    passingScore: 90,
    description: 'Final inspection, EGA ceremony, graduation parade',
    exercises: [
      'FULL_CAPABILITY_ASSESSMENT',
      'FINAL_INSPECTION',
      'CERTIFICATION_EXAM',
    ],
  },
};

// =============================================================================
// RECRUIT (AGENT) STATUS
// =============================================================================

/**
 * Recruit status in Boot Camp.
 */
export type RecruitStatus =
  | 'ENLISTED'           // Signed up but not yet started
  | 'IN_TRAINING'        // Currently in a phase
  | 'PHASE_COMPLETE'     // Completed current phase, awaiting advancement
  | 'RECYCLED'           // Failed and restarting current phase
  | 'MEDICAL_HOLD'       // Paused (equivalent to agent paused)
  | 'DROPPED'            // Washed out, cannot continue
  | 'GRADUATED'          // Completed all phases, certified for combat
  | 'COMBAT_READY';      // Graduated and cleared for live operations

/**
 * Qualification levels for marksmanship (bid accuracy).
 */
export type MarksmanshipQualification =
  | 'UNQUALIFIED'        // < 70%
  | 'MARKSMAN'           // 70-79%
  | 'SHARPSHOOTER'       // 80-89%
  | 'EXPERT';            // 90%+

/**
 * Get qualification level from score.
 */
export function getMarksmanshipQualification(score: number): MarksmanshipQualification {
  if (score >= 90) return 'EXPERT';
  if (score >= 80) return 'SHARPSHOOTER';
  if (score >= 70) return 'MARKSMAN';
  return 'UNQUALIFIED';
}

// =============================================================================
// EXERCISE & EVALUATION TYPES
// =============================================================================

/**
 * Exercise type for training.
 */
export type ExerciseType =
  // Receiving exercises
  | 'CONFIGURATION_VALIDATION'
  | 'CREDENTIAL_VERIFICATION'
  | 'BUDGET_ALLOCATION_TEST'
  | 'BASIC_API_CONNECTION'
  // Conditioning exercises
  | 'STRATEGY_ALIGNMENT_DRILL'
  | 'DECISION_SPEED_TEST'
  | 'PARAMETER_TUNING'
  | 'STRESS_RESPONSE_CHECK'
  // Marksmanship exercises
  | 'BID_ACCURACY_DRILL'
  | 'TIMING_PRECISION_TEST'
  | 'VALUE_ASSESSMENT_TEST'
  | 'SNIPE_WINDOW_DRILL'
  // Combat exercises
  | 'LIVE_SANDBOX_SIMULATION'
  | 'COMPETITIVE_SCENARIO'
  | 'MULTI_LISTING_MANAGEMENT'
  | 'SELLER_INTERACTION_DRILL'
  // Crucible exercises
  | 'LIMITED_BUDGET_OPERATION'
  | 'HIGH_COMPETITION_SCENARIO'
  | 'RAPID_DECISION_SEQUENCE'
  | 'RECOVERY_FROM_LOSS'
  // Graduation exercises
  | 'FULL_CAPABILITY_ASSESSMENT'
  | 'FINAL_INSPECTION'
  | 'CERTIFICATION_EXAM';

/**
 * Result of a single exercise.
 */
export interface ExerciseResult {
  /** Exercise identifier */
  exerciseId: string;
  /** Type of exercise */
  exerciseType: ExerciseType;
  /** Phase this exercise belongs to */
  phase: TrainingPhase;
  /** Score achieved (0-100) */
  score: number;
  /** Whether the exercise was passed */
  passed: boolean;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Timestamp of completion */
  completedAt: string;
  /** Detailed metrics from the exercise */
  metrics: ExerciseMetrics;
  /** Instructor notes/feedback */
  feedback?: string;
}

/**
 * Metrics collected during an exercise.
 */
export interface ExerciseMetrics {
  /** Number of decisions made */
  decisionsCount: number;
  /** Correct decisions */
  correctDecisions: number;
  /** Average decision time in ms */
  avgDecisionTimeMs: number;
  /** Bids placed */
  bidsPlaced?: number;
  /** Successful bids */
  successfulBids?: number;
  /** Budget efficiency (value acquired / budget spent) */
  budgetEfficiency?: number;
  /** Timing accuracy percentage */
  timingAccuracy?: number;
  /** Custom metrics per exercise type (supports any JSON-serializable values) */
  custom?: Record<string, unknown>;
}

/**
 * Phase evaluation result.
 */
export interface PhaseEvaluation {
  /** Phase being evaluated */
  phase: TrainingPhase;
  /** Overall score for the phase (0-100) */
  score: number;
  /** Whether the phase was passed */
  passed: boolean;
  /** Attempt number */
  attemptNumber: number;
  /** Exercise results for this phase */
  exerciseResults: ExerciseResult[];
  /** Started at timestamp */
  startedAt: string;
  /** Completed at timestamp */
  completedAt: string;
  /** Drill Instructor who certified the pass/fail */
  certifiedBy?: string;
  /** Notes from evaluation */
  notes?: string;
}

// =============================================================================
// RECRUIT RECORD (Training Jacket)
// =============================================================================

/**
 * Complete training record for a recruit (agent).
 * This is the "Service Record Book" (SRB) equivalent.
 */
export interface RecruitRecord {
  /** Unique recruit ID (same as agent ID) */
  recruitId: string;
  /** Agent configuration reference */
  agentId: string;
  /** Swarm this recruit belongs to */
  swarmId: string;
  /** Human-readable name */
  name: string;
  /** Assigned bidding strategy */
  strategy: BiddingStrategy;
  /** Current status */
  status: RecruitStatus;
  /** Current phase in training */
  currentPhase: TrainingPhase;
  /** Training budget allocation (for simulated exercises) */
  trainingBudget: Money;
  /** Training budget spent */
  trainingBudgetSpent: Money;

  // Progression tracking
  /** Phase evaluations (history) */
  phaseHistory: PhaseEvaluation[];
  /** Current phase attempt number */
  currentAttempt: number;
  /** Total recyclings (restarts) */
  totalRecyclings: number;

  // Qualification badges
  /** Marksmanship qualification achieved */
  marksmanshipQual?: MarksmanshipQualification;
  /** Expert badges earned */
  expertBadges: ExerciseType[];
  /** Merits earned (above and beyond performance) */
  merits: string[];
  /** Demerits accumulated (failures, issues) */
  demerits: string[];

  // Timestamps
  /** Enlistment date */
  enlistedAt: string;
  /** Training start date */
  trainingStartedAt?: string;
  /** Graduation date */
  graduatedAt?: string;
  /** Last activity */
  lastActivityAt: string;

  // Drill Instructor oversight
  /** Assigned DI (for oversight) */
  assignedDI?: string;
  /** Requires DI approval for advancement */
  requiresDIApproval: boolean;
  /** DI notes/observations */
  diNotes: string[];
}

// =============================================================================
// BOOT CAMP CONFIGURATION
// =============================================================================

/**
 * Boot Camp configuration for a swarm.
 */
export interface BootCampConfig {
  /** Boot Camp ID */
  bootCampId: string;
  /** Associated swarm ID */
  swarmId: string;
  /** Boot Camp name (e.g., "MCRD San Diego Class 2024-01") */
  name: string;
  /** Phase configurations (can override defaults) */
  phaseConfigs: Record<TrainingPhase, PhaseConfig>;
  /** Training budget per recruit */
  trainingBudgetPerRecruit: Money;
  /** Whether to require DI approval for graduation */
  requireDIApproval: boolean;
  /** Whether to allow phase recycling */
  allowRecycling: boolean;
  /** Maximum total recyclings allowed */
  maxTotalRecyclings: number;
  /** Automatic advancement (skip DI review) */
  autoAdvance: boolean;
  /** Created at */
  createdAt: string;
  /** Created by */
  createdBy: string;
}

/**
 * Default Boot Camp configuration.
 */
export const DEFAULT_BOOT_CAMP_CONFIG: Omit<BootCampConfig, 'bootCampId' | 'swarmId' | 'name' | 'createdAt' | 'createdBy'> = {
  phaseConfigs: DEFAULT_PHASE_CONFIGS,
  trainingBudgetPerRecruit: { value: 100, currency: 'USD' },
  requireDIApproval: true,
  allowRecycling: true,
  maxTotalRecyclings: 3,
  autoAdvance: false,
};

// =============================================================================
// BOOT CAMP STATE
// =============================================================================

/**
 * Boot Camp operational status.
 */
export type BootCampStatus =
  | 'PREPARING'     // Being configured
  | 'RECEIVING'     // Accepting new recruits
  | 'ACTIVE'        // Training in progress
  | 'GRADUATED'     // All recruits graduated or dropped
  | 'TERMINATED';   // Forcibly ended

/**
 * Boot Camp runtime state.
 */
export interface BootCampState {
  /** Current status */
  status: BootCampStatus;
  /** Total recruits enrolled */
  totalRecruits: number;
  /** Currently in training */
  inTraining: number;
  /** Graduated count */
  graduated: number;
  /** Dropped count */
  dropped: number;
  /** Current phase breakdown */
  phaseBreakdown: Record<TrainingPhase, number>;
  /** Training budget total */
  totalTrainingBudget: Money;
  /** Training budget spent */
  trainingBudgetSpent: Money;
  /** Start date */
  startedAt?: string;
  /** Completion date */
  completedAt?: string;
  /** Last activity */
  lastActivityAt: string;
}

// =============================================================================
// DRILL INSTRUCTOR TYPES
// =============================================================================

/**
 * Drill Instructor record.
 * DIs are responsible for oversight, evaluation, and certification.
 */
export interface DrillInstructor {
  /** DI identifier */
  diId: string;
  /** DI name/callsign */
  name: string;
  /** User ID (for human oversight) */
  userId?: string;
  /** Is automated DI (AI-based) */
  isAutomated: boolean;
  /** Specialty areas */
  specialties: BiddingStrategy[];
  /** Recruits currently assigned */
  assignedRecruits: string[];
  /** Total recruits graduated */
  totalGraduated: number;
  /** Total recruits dropped */
  totalDropped: number;
  /** Notes/bio */
  notes?: string;
  /** Created at */
  createdAt: string;
}

/**
 * DI review request.
 */
export interface DIReviewRequest {
  /** Request ID */
  requestId: string;
  /** Recruit requesting review */
  recruitId: string;
  /** Phase to be certified */
  phase: TrainingPhase;
  /** Phase evaluation to review */
  evaluation: PhaseEvaluation;
  /** Assigned DI */
  assignedDI?: string;
  /** Request status */
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECYCLED';
  /** Review notes */
  reviewNotes?: string;
  /** Created at */
  createdAt: string;
  /** Reviewed at */
  reviewedAt?: string;
}

// =============================================================================
// BOOT CAMP EVENTS
// =============================================================================

/**
 * Boot Camp event types.
 */
export type BootCampEventType =
  // Recruit lifecycle
  | 'RECRUIT_ENLISTED'
  | 'RECRUIT_TRAINING_STARTED'
  | 'RECRUIT_PHASE_STARTED'
  | 'RECRUIT_EXERCISE_COMPLETED'
  | 'RECRUIT_PHASE_PASSED'
  | 'RECRUIT_PHASE_FAILED'
  | 'RECRUIT_RECYCLED'
  | 'RECRUIT_DROPPED'
  | 'RECRUIT_GRADUATED'
  | 'RECRUIT_DEPLOYED'
  // Boot Camp lifecycle
  | 'BOOT_CAMP_CREATED'
  | 'BOOT_CAMP_STARTED'
  | 'BOOT_CAMP_COMPLETED'
  | 'BOOT_CAMP_TERMINATED'
  // DI events
  | 'DI_ASSIGNED'
  | 'DI_REVIEW_REQUESTED'
  | 'DI_REVIEW_COMPLETED'
  // Merit/Demerit
  | 'MERIT_AWARDED'
  | 'DEMERIT_ISSUED'
  // Badge events
  | 'QUALIFICATION_EARNED'
  | 'EXPERT_BADGE_EARNED';

/**
 * Boot Camp event.
 */
export interface BootCampEvent {
  /** Event ID */
  eventId: string;
  /** Event type */
  eventType: BootCampEventType;
  /** Boot Camp ID */
  bootCampId: string;
  /** Recruit ID (if applicable) */
  recruitId?: string;
  /** DI ID (if applicable) */
  diId?: string;
  /** Timestamp */
  timestamp: string;
  /** Event data */
  data?: Record<string, unknown>;
}

// =============================================================================
// ID GENERATORS
// =============================================================================

/**
 * Generate a Boot Camp ID.
 */
export function generateBootCampId(): string {
  return `bc_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate a recruit ID.
 */
export function generateRecruitId(): string {
  return `rct_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate an exercise ID.
 */
export function generateExerciseId(): string {
  return `ex_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate a DI ID.
 */
export function generateDIId(): string {
  return `di_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate a review request ID.
 */
export function generateReviewRequestId(): string {
  return `drv_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
}

/**
 * Generate an event ID.
 */
export function generateBootCampEventId(): string {
  return `bc_evt_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}
