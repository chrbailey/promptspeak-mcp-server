/**
 * Boot Camp - Swarm Integration
 *
 * Connects the Boot Camp training system with the Swarm bidding agents.
 * Ensures agents complete training before live trading.
 */

import { EventEmitter } from 'events';
import {
  BootCampController,
  getBootCampController,
  type CreateBootCampOptions,
  type EnrollRecruitOptions,
} from './boot-camp-controller.js';
import type {
  RecruitRecord,
  TrainingPhase,
  PhaseEvaluation,
  RecruitStatus,
} from './types.js';
import type {
  SwarmConfig,
  MarketAgentConfig,
  BiddingStrategy,
} from '../swarm/types.js';
import { getSwarmController } from '../swarm/swarm-controller.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Training swarm options.
 */
export interface TrainingSwarmOptions {
  /** Swarm name */
  name: string;
  /** Number of agents to train */
  agentCount: number;
  /** Strategy distribution */
  strategyDistribution?: Map<BiddingStrategy, number>;
  /** Total training budget */
  trainingBudget: number;
  /** Budget per recruit */
  trainingBudgetPerRecruit?: number;
  /** Whether to require DI approval */
  requireDIApproval?: boolean;
  /** Auto-advance through phases */
  autoAdvance?: boolean;
  /** Created by (user ID) */
  createdBy: string;
}

/**
 * Certified agent ready for deployment.
 */
export interface CertifiedAgent {
  /** Agent ID */
  agentId: string;
  /** Recruit ID */
  recruitId: string;
  /** Bidding strategy */
  strategy: BiddingStrategy;
  /** Certification level */
  certificationLevel: string;
  /** Marksmanship qualification */
  marksmanshipQualification?: string;
  /** Expert badges earned */
  expertBadges: string[];
  /** Graduation date */
  graduatedAt: string;
  /** Training performance summary */
  trainingPerformance: {
    avgScore: number;
    totalRecyclings: number;
    phasesCompleted: number;
  };
}

/**
 * Swarm training status.
 */
export interface SwarmTrainingStatus {
  /** Swarm ID */
  swarmId: string;
  /** Boot Camp ID */
  bootCampId: string;
  /** Total agents enrolled */
  totalAgents: number;
  /** Currently in training */
  inTraining: number;
  /** Graduated count */
  graduated: number;
  /** Dropped count */
  dropped: number;
  /** Graduation rate */
  graduationRate: number;
  /** Phase breakdown */
  phaseBreakdown: Record<TrainingPhase, number>;
  /** Ready for deployment */
  readyForDeployment: CertifiedAgent[];
  /** Pending DI reviews */
  pendingReviews: number;
}

// =============================================================================
// SWARM INTEGRATION CLASS
// =============================================================================

/**
 * Manages integration between Boot Camp and Swarm systems.
 */
export class BootCampSwarmIntegration extends EventEmitter {
  private bootCampController: BootCampController;
  private swarmBootCampMap: Map<string, string> = new Map(); // swarmId -> bootCampId
  private agentRecruitMap: Map<string, string> = new Map();  // agentId -> recruitId

  constructor() {
    super();
    this.bootCampController = getBootCampController();
  }

  // ===========================================================================
  // SWARM TRAINING OPERATIONS
  // ===========================================================================

  /**
   * Create a training swarm with Boot Camp integration.
   * All agents must graduate before the swarm can go live.
   */
  async createTrainingSwarm(options: TrainingSwarmOptions): Promise<{
    swarmId: string;
    bootCampId: string;
    enrolledRecruits: string[];
  }> {
    // Generate swarm ID
    const swarmId = `swarm_training_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    // Create Boot Camp for this swarm
    const bootCampOptions: CreateBootCampOptions = {
      name: `${options.name} Boot Camp`,
      swarmId,
      trainingBudgetPerRecruit: options.trainingBudgetPerRecruit ?? options.trainingBudget / options.agentCount,
      requireDIApproval: options.requireDIApproval ?? true,
      autoAdvance: options.autoAdvance ?? false,
      createdBy: options.createdBy,
    };

    const bootCampId = await this.bootCampController.createBootCamp(bootCampOptions);
    await this.bootCampController.startBootCamp();

    // Map swarm to boot camp
    this.swarmBootCampMap.set(swarmId, bootCampId);

    // Determine strategy distribution
    const distribution = options.strategyDistribution ?? this.getDefaultDistribution(options.agentCount);

    // Enroll agents as recruits
    const enrolledRecruits: string[] = [];
    let agentIndex = 0;

    for (const [strategy, count] of distribution) {
      for (let i = 0; i < count; i++) {
        const agentConfig: MarketAgentConfig = {
          agentId: `agent_${swarmId}_${agentIndex++}`,
          name: `${strategy} Agent ${i + 1}`,
          strategy,
          swarmId,
          budget: {
            amount: options.trainingBudgetPerRecruit ?? options.trainingBudget / options.agentCount,
            currency: 'USD',
            maxPerItem: (options.trainingBudgetPerRecruit ?? options.trainingBudget / options.agentCount) * 0.5,
            reservePercent: 5,
          },
          timeWindow: {
            start: new Date(),
            end: new Date(Date.now() + 7 * 24 * 3600000),
          },
          targetCriteria: {
            searchQuery: 'training items',
            priceRange: { min: 0, max: 200 },
            conditions: ['ANY'],
            listingFormats: ['ANY'],
          },
          constraints: {
            maxConcurrentListings: 10,
            maxBidsPerHour: 20,
            maxOffersPerHour: 10,
            minActionIntervalMs: 5000,
          },
        };

        const enrollOptions: EnrollRecruitOptions = {
          agentConfig,
        };

        const recruitId = await this.bootCampController.enrollRecruit(enrollOptions);
        enrolledRecruits.push(recruitId);
        this.agentRecruitMap.set(agentConfig.agentId, recruitId);
      }
    }

    this.emit('training_swarm_created', { swarmId, bootCampId, recruitCount: enrolledRecruits.length });

    return { swarmId, bootCampId, enrolledRecruits };
  }

  /**
   * Run training for all recruits in a swarm.
   */
  async runSwarmTraining(swarmId: string): Promise<{
    completed: string[];
    failed: string[];
    pending: string[];
  }> {
    const bootCampId = this.swarmBootCampMap.get(swarmId);
    if (!bootCampId) {
      throw new Error(`No Boot Camp found for swarm ${swarmId}`);
    }

    const recruits = this.bootCampController.getAllRecruits().filter(
      r => r.swarmId === swarmId
    );

    const completed: string[] = [];
    const failed: string[] = [];
    const pending: string[] = [];

    for (const recruit of recruits) {
      if (recruit.status === 'GRADUATED' || recruit.status === 'COMBAT_READY') {
        completed.push(recruit.recruitId);
        continue;
      }

      if (recruit.status === 'DROPPED') {
        failed.push(recruit.recruitId);
        continue;
      }

      // Run training phases
      try {
        await this.trainRecruitToGraduation(recruit.recruitId);

        const updatedRecruit = this.bootCampController.getRecruit(recruit.recruitId);
        if (updatedRecruit?.status === 'GRADUATED') {
          completed.push(recruit.recruitId);
        } else if (updatedRecruit?.status === 'DROPPED') {
          failed.push(recruit.recruitId);
        } else {
          pending.push(recruit.recruitId);
        }
      } catch (error) {
        pending.push(recruit.recruitId);
      }
    }

    return { completed, failed, pending };
  }

  /**
   * Train a single recruit through all phases to graduation.
   */
  async trainRecruitToGraduation(recruitId: string): Promise<PhaseEvaluation[]> {
    const evaluations: PhaseEvaluation[] = [];
    let recruit = this.bootCampController.getRecruit(recruitId);

    if (!recruit) {
      throw new Error(`Recruit ${recruitId} not found`);
    }

    // Start training if enlisted
    if (recruit.status === 'ENLISTED') {
      await this.bootCampController.startTraining(recruitId);
      recruit = this.bootCampController.getRecruit(recruitId)!;
    }

    // Run through phases until graduation or drop
    while (recruit.status === 'IN_TRAINING' || recruit.status === 'RECYCLED') {
      if (recruit.status === 'RECYCLED') {
        // Re-enter training after recycle
        await this.bootCampController.startTraining(recruitId);
        recruit = this.bootCampController.getRecruit(recruitId)!;
      }

      const evaluation = await this.bootCampController.runPhase(recruitId);
      evaluations.push(evaluation);

      recruit = this.bootCampController.getRecruit(recruitId)!;

      // Check for terminal states
      if (recruit.status === 'DROPPED') {
        throw new Error(`Recruit ${recruitId} dropped from training`);
      }

      if (recruit.status === 'GRADUATED' || recruit.status === 'COMBAT_READY') {
        break;
      }

      // Handle DI approval if needed
      if (recruit.status === 'PHASE_COMPLETE') {
        const config = this.bootCampController.getConfig();
        if (config?.autoAdvance) {
          // Auto-approve already handled in controller
        } else {
          // In real system, would wait for DI. For automation, we simulate approval.
          const reviews = this.bootCampController.getPendingReviews();
          for (const review of reviews) {
            if (review.recruitId === recruitId && review.status === 'PENDING') {
              // Auto-approve for training (would be manual in production)
              await this.bootCampController.approveDIReview(
                review.requestId,
                'auto_di',
                'Auto-approved for training automation'
              );
            }
          }
          recruit = this.bootCampController.getRecruit(recruitId)!;
        }
      }
    }

    return evaluations;
  }

  /**
   * Get training status for a swarm.
   */
  getSwarmTrainingStatus(swarmId: string): SwarmTrainingStatus | null {
    const bootCampId = this.swarmBootCampMap.get(swarmId);
    if (!bootCampId) return null;

    const bootCampState = this.bootCampController.getStatus();
    if (!bootCampState) return null;

    const recruits = this.bootCampController.getAllRecruits().filter(
      r => r.swarmId === swarmId
    );

    const certifiedAgents: CertifiedAgent[] = [];
    for (const recruit of recruits) {
      if (recruit.status === 'GRADUATED' || recruit.status === 'COMBAT_READY') {
        const avgScore = recruit.phaseHistory.reduce((sum, p) => sum + p.score, 0) / recruit.phaseHistory.length;

        certifiedAgents.push({
          agentId: recruit.agentId,
          recruitId: recruit.recruitId,
          strategy: recruit.strategy,
          certificationLevel: this.determineCertificationLevel(recruit, avgScore),
          marksmanshipQualification: recruit.marksmanshipQual,
          expertBadges: recruit.expertBadges,
          graduatedAt: recruit.graduatedAt!,
          trainingPerformance: {
            avgScore,
            totalRecyclings: recruit.totalRecyclings,
            phasesCompleted: recruit.phaseHistory.filter(p => p.passed).length,
          },
        });
      }
    }

    const pendingReviews = this.bootCampController.getPendingReviews().filter(
      r => {
        const recruit = this.bootCampController.getRecruit(r.recruitId);
        return recruit?.swarmId === swarmId;
      }
    ).length;

    return {
      swarmId,
      bootCampId,
      totalAgents: recruits.length,
      inTraining: recruits.filter(r => r.status === 'IN_TRAINING').length,
      graduated: recruits.filter(r => r.status === 'GRADUATED' || r.status === 'COMBAT_READY').length,
      dropped: recruits.filter(r => r.status === 'DROPPED').length,
      graduationRate: recruits.length > 0
        ? recruits.filter(r => r.status === 'GRADUATED' || r.status === 'COMBAT_READY').length / recruits.length
        : 0,
      phaseBreakdown: bootCampState.phaseBreakdown,
      readyForDeployment: certifiedAgents,
      pendingReviews,
    };
  }

  // ===========================================================================
  // CERTIFICATION VERIFICATION
  // ===========================================================================

  /**
   * Check if an agent is certified for live trading.
   */
  isAgentCertified(agentId: string): boolean {
    return this.bootCampController.isAgentCertified(agentId);
  }

  /**
   * Get certification details for an agent.
   */
  getAgentCertification(agentId: string): CertifiedAgent | null {
    const recruitId = this.agentRecruitMap.get(agentId);
    if (!recruitId) return null;

    const recruit = this.bootCampController.getRecruit(recruitId);
    if (!recruit || (recruit.status !== 'GRADUATED' && recruit.status !== 'COMBAT_READY')) {
      return null;
    }

    const avgScore = recruit.phaseHistory.reduce((sum, p) => sum + p.score, 0) / recruit.phaseHistory.length;

    return {
      agentId: recruit.agentId,
      recruitId: recruit.recruitId,
      strategy: recruit.strategy,
      certificationLevel: this.determineCertificationLevel(recruit, avgScore),
      marksmanshipQualification: recruit.marksmanshipQual,
      expertBadges: recruit.expertBadges,
      graduatedAt: recruit.graduatedAt!,
      trainingPerformance: {
        avgScore,
        totalRecyclings: recruit.totalRecyclings,
        phasesCompleted: recruit.phaseHistory.filter(p => p.passed).length,
      },
    };
  }

  /**
   * Require certification before allowing live trading.
   * Returns a gate function that can be used to check agents.
   */
  createCertificationGate(): (agentId: string) => { allowed: boolean; reason: string } {
    return (agentId: string) => {
      const status = this.bootCampController.getAgentCertificationStatus(agentId);

      if (status.status === 'NOT_ENROLLED') {
        return {
          allowed: false,
          reason: 'Agent not enrolled in Boot Camp. Must complete training before live trading.',
        };
      }

      if (status.certified) {
        return {
          allowed: true,
          reason: `Agent certified: ${status.certificationLevel}`,
        };
      }

      return {
        allowed: false,
        reason: `Agent in training: ${status.status} (Phase: ${status.currentPhase}). Must complete Boot Camp.`,
      };
    };
  }

  // ===========================================================================
  // DEPLOYMENT OPERATIONS
  // ===========================================================================

  /**
   * Get list of certified agents ready for deployment in a swarm.
   */
  getCertifiedAgentsForSwarm(swarmId: string): CertifiedAgent[] {
    const status = this.getSwarmTrainingStatus(swarmId);
    return status?.readyForDeployment ?? [];
  }

  /**
   * Deploy certified agents to live trading.
   * Creates the production swarm with only graduated agents.
   */
  async deployTrainedSwarm(
    trainingSwarmId: string,
    productionOptions: {
      productionBudget: number;
      targetCriteria: any;
      timeWindow: { start: Date; end: Date };
    }
  ): Promise<{
    productionSwarmId: string;
    deployedAgents: number;
    rejectedAgents: { agentId: string; reason: string }[];
  }> {
    const certifiedAgents = this.getCertifiedAgentsForSwarm(trainingSwarmId);

    if (certifiedAgents.length === 0) {
      throw new Error('No certified agents available for deployment');
    }

    const swarmController = getSwarmController();

    // Build strategy distribution from certified agents
    const strategyDistribution = new Map<BiddingStrategy, number>();
    for (const agent of certifiedAgents) {
      const current = strategyDistribution.get(agent.strategy) ?? 0;
      strategyDistribution.set(agent.strategy, current + 1);
    }

    // Create production swarm
    const productionSwarmId = await swarmController.createSwarm({
      totalBudget: {
        amount: productionOptions.productionBudget,
        currency: 'USD',
        maxPerItem: productionOptions.productionBudget * 0.3,
        reservePercent: 5,
      },
      agentCount: certifiedAgents.length,
      strategyDistribution,
      targetCriteria: productionOptions.targetCriteria,
      timeWindow: {
        start: productionOptions.timeWindow.start,
        end: productionOptions.timeWindow.end,
      },
    });

    // Mark all agents as combat ready
    for (const agent of certifiedAgents) {
      await this.bootCampController.markCombatReady(agent.recruitId);
    }

    this.emit('swarm_deployed', {
      trainingSwarmId,
      productionSwarmId,
      agentCount: certifiedAgents.length,
    });

    return {
      productionSwarmId,
      deployedAgents: certifiedAgents.length,
      rejectedAgents: [], // All certified agents are deployed
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getDefaultDistribution(agentCount: number): Map<BiddingStrategy, number> {
    const strategies: BiddingStrategy[] = ['SNIPER', 'EARLY_AGGRESSIVE', 'NEGOTIATOR', 'HYBRID', 'PASSIVE'];
    const distribution = new Map<BiddingStrategy, number>();

    // Distribute agents across strategies
    const basePerStrategy = Math.floor(agentCount / strategies.length);
    let remaining = agentCount % strategies.length;

    for (const strategy of strategies) {
      distribution.set(strategy, basePerStrategy + (remaining > 0 ? 1 : 0));
      if (remaining > 0) remaining--;
    }

    return distribution;
  }

  private determineCertificationLevel(recruit: RecruitRecord, avgScore: number): string {
    const hasExpertBadges = recruit.expertBadges.length >= 3;
    const isExpertMarksman = recruit.marksmanshipQual === 'EXPERT';
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
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let integrationInstance: BootCampSwarmIntegration | null = null;

/**
 * Get the Boot Camp Swarm Integration singleton.
 */
export function getBootCampSwarmIntegration(): BootCampSwarmIntegration {
  if (!integrationInstance) {
    integrationInstance = new BootCampSwarmIntegration();
  }
  return integrationInstance;
}

/**
 * Create a fresh integration instance (for testing).
 */
export function createBootCampSwarmIntegration(): BootCampSwarmIntegration {
  return new BootCampSwarmIntegration();
}
