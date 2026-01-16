/**
 * Boot Camp MCP Tool Definitions
 *
 * Exposes Boot Camp functionality through the MCP protocol.
 * These tools allow LLM agents and users to manage agent training.
 */

import { z } from 'zod';
import { getBootCampController } from './boot-camp-controller.js';
import { getBootCampSwarmIntegration } from './swarm-integration.js';
import { PHASE_ORDER } from './types.js';
import { getPhaseDescription, getMarineCorpsEquivalent } from './phases/phase-factory.js';

// =============================================================================
// TOOL SCHEMAS
// =============================================================================

export const BootCampCreateSchema = z.object({
  name: z.string().describe('Boot Camp name (e.g., "Alpha Company 2024")'),
  swarmId: z.string().describe('Associated swarm ID'),
  trainingBudgetPerRecruit: z.number().min(10).max(1000).optional()
    .describe('Training budget per recruit in USD (default: 100)'),
  requireDIApproval: z.boolean().optional()
    .describe('Whether to require Drill Instructor approval for phase advancement (default: true)'),
  autoAdvance: z.boolean().optional()
    .describe('Auto-advance through phases without DI review (default: false)'),
  createdBy: z.string().describe('User ID creating the Boot Camp'),
});

export const TrainingSwarmCreateSchema = z.object({
  name: z.string().describe('Training swarm name'),
  agentCount: z.number().min(1).max(20).describe('Number of agents to train'),
  trainingBudget: z.number().min(50).max(10000).describe('Total training budget in USD'),
  trainingBudgetPerRecruit: z.number().min(10).max(1000).optional()
    .describe('Budget per recruit (auto-calculated if not provided)'),
  requireDIApproval: z.boolean().optional()
    .describe('Require DI approval for phase advancement'),
  autoAdvance: z.boolean().optional()
    .describe('Auto-advance through phases'),
  createdBy: z.string().describe('User ID'),
});

export const RecruitEnrollSchema = z.object({
  agentId: z.string().describe('Agent ID to enroll'),
  strategy: z.enum(['SNIPER', 'EARLY_AGGRESSIVE', 'NEGOTIATOR', 'HYBRID', 'PASSIVE'])
    .describe('Agent bidding strategy'),
  swarmId: z.string().describe('Associated swarm ID'),
  trainingBudget: z.number().min(10).max(1000).optional()
    .describe('Training budget for this recruit'),
  assignedDI: z.string().optional().describe('Assigned Drill Instructor ID'),
});

export const DIReviewSchema = z.object({
  requestId: z.string().describe('Review request ID'),
  diId: z.string().describe('Drill Instructor ID'),
  approved: z.boolean().describe('Whether to approve advancement'),
  notes: z.string().optional().describe('Review notes'),
});

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const bootCampTools = {
  // ===========================================================================
  // ps_bootcamp_create
  // ===========================================================================
  ps_bootcamp_create: {
    name: 'ps_bootcamp_create',
    description: `Create a new Marine Agent Boot Camp for training market agents.

Boot Camp follows USMC recruit training structure:
- Phase 1 (RECEIVING): Agent initialization and configuration
- Phase 2 (CONDITIONING): Strategy calibration and stress testing
- Phase 3 (MARKSMANSHIP): Bid accuracy and timing training
- Phase 4 (COMBAT): Live market simulation
- Phase 5 (CRUCIBLE): Stress testing with limited budget
- Phase 6 (GRADUATION): Final certification exam

Agents MUST graduate Boot Camp before being allowed to trade live.`,
    inputSchema: BootCampCreateSchema,
    handler: async (input: z.infer<typeof BootCampCreateSchema>) => {
      const controller = getBootCampController();

      const bootCampId = await controller.createBootCamp({
        name: input.name,
        swarmId: input.swarmId,
        trainingBudgetPerRecruit: input.trainingBudgetPerRecruit,
        requireDIApproval: input.requireDIApproval ?? true,
        autoAdvance: input.autoAdvance ?? false,
        createdBy: input.createdBy,
      });

      await controller.startBootCamp();

      return {
        success: true,
        bootCampId,
        message: `Boot Camp "${input.name}" created and ready to receive recruits`,
        phases: PHASE_ORDER.map(phase => ({
          phase,
          description: getPhaseDescription(phase),
          usmcEquivalent: getMarineCorpsEquivalent(phase),
        })),
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_training_swarm_create
  // ===========================================================================
  ps_bootcamp_training_swarm_create: {
    name: 'ps_bootcamp_training_swarm_create',
    description: `Create a complete training swarm with automatic Boot Camp enrollment.

This is the recommended way to train a new swarm of agents. It:
1. Creates a Boot Camp for the swarm
2. Enrolls agents as recruits with assigned strategies
3. Prepares them for training

After creation, use ps_bootcamp_run_training to run the training.`,
    inputSchema: TrainingSwarmCreateSchema,
    handler: async (input: z.infer<typeof TrainingSwarmCreateSchema>) => {
      const integration = getBootCampSwarmIntegration();

      const result = await integration.createTrainingSwarm({
        name: input.name,
        agentCount: input.agentCount,
        trainingBudget: input.trainingBudget,
        trainingBudgetPerRecruit: input.trainingBudgetPerRecruit,
        requireDIApproval: input.requireDIApproval,
        autoAdvance: input.autoAdvance,
        createdBy: input.createdBy,
      });

      return {
        success: true,
        swarmId: result.swarmId,
        bootCampId: result.bootCampId,
        enrolledRecruits: result.enrolledRecruits.length,
        message: `Training swarm created with ${result.enrolledRecruits.length} recruits enrolled`,
        nextStep: 'Use ps_bootcamp_run_training to begin training',
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_enroll_recruit
  // ===========================================================================
  ps_bootcamp_enroll_recruit: {
    name: 'ps_bootcamp_enroll_recruit',
    description: `Enroll an individual agent in Boot Camp training.

Use this for adding single agents to an existing Boot Camp.
For bulk enrollment, use ps_bootcamp_training_swarm_create instead.`,
    inputSchema: RecruitEnrollSchema,
    handler: async (input: z.infer<typeof RecruitEnrollSchema>) => {
      const controller = getBootCampController();

      const recruitId = await controller.enrollRecruit({
        agentConfig: {
          agentId: input.agentId,
          name: `${input.strategy} Recruit`,
          strategy: input.strategy,
          swarmId: input.swarmId,
          budget: {
            amount: input.trainingBudget ?? 100,
            currency: 'USD',
            maxPerItem: (input.trainingBudget ?? 100) * 0.5,
            reservePercent: 5,
          },
          timeWindow: {
            start: new Date(),
            end: new Date(Date.now() + 7 * 24 * 3600000),
          },
          targetCriteria: {
            searchQuery: 'training',
            priceRange: { min: 0, max: input.trainingBudget ?? 100 },
            conditions: ['ANY'],
            listingFormats: ['ANY'],
          },
          constraints: {
            maxConcurrentListings: 10,
            maxBidsPerHour: 20,
            maxOffersPerHour: 10,
            minActionIntervalMs: 5000,
          },
        },
        assignedDI: input.assignedDI,
        trainingBudget: input.trainingBudget,
      });

      return {
        success: true,
        recruitId,
        agentId: input.agentId,
        strategy: input.strategy,
        message: `Agent ${input.agentId} enlisted as recruit ${recruitId}`,
        nextStep: 'Use ps_bootcamp_start_training to begin Phase 1 (Receiving)',
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_start_training
  // ===========================================================================
  ps_bootcamp_start_training: {
    name: 'ps_bootcamp_start_training',
    description: 'Start training for an enlisted recruit.',
    inputSchema: z.object({
      recruitId: z.string().describe('Recruit ID to start training'),
    }),
    handler: async (input: { recruitId: string }) => {
      const controller = getBootCampController();
      await controller.startTraining(input.recruitId);
      const recruit = controller.getRecruit(input.recruitId);

      return {
        success: true,
        recruitId: input.recruitId,
        status: recruit?.status,
        currentPhase: recruit?.currentPhase,
        message: `Training started for recruit ${input.recruitId}`,
        phase: {
          current: recruit?.currentPhase,
          description: recruit?.currentPhase ? getPhaseDescription(recruit.currentPhase) : undefined,
        },
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_run_phase
  // ===========================================================================
  ps_bootcamp_run_phase: {
    name: 'ps_bootcamp_run_phase',
    description: `Run the current training phase for a recruit.

This executes all exercises for the current phase and evaluates performance.
Passing score varies by phase (70-90%). Failing may result in recycling.`,
    inputSchema: z.object({
      recruitId: z.string().describe('Recruit ID'),
    }),
    handler: async (input: { recruitId: string }) => {
      const controller = getBootCampController();
      const recruit = controller.getRecruit(input.recruitId);

      if (!recruit) {
        return { success: false, error: `Recruit ${input.recruitId} not found` };
      }

      const evaluation = await controller.runPhase(input.recruitId);
      const updatedRecruit = controller.getRecruit(input.recruitId);

      return {
        success: true,
        recruitId: input.recruitId,
        phase: evaluation.phase,
        score: evaluation.score,
        passed: evaluation.passed,
        attempt: evaluation.attemptNumber,
        exerciseResults: evaluation.exerciseResults.map(e => ({
          exercise: e.exerciseType,
          score: e.score,
          passed: e.passed,
          feedback: e.feedback,
        })),
        recruitStatus: updatedRecruit?.status,
        nextPhase: updatedRecruit?.currentPhase,
        message: evaluation.passed
          ? `Phase ${evaluation.phase} PASSED with ${evaluation.score}% score`
          : `Phase ${evaluation.phase} FAILED with ${evaluation.score}% score`,
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_run_training
  // ===========================================================================
  ps_bootcamp_run_training: {
    name: 'ps_bootcamp_run_training',
    description: `Run complete training cycle for a swarm.

This will train all enlisted recruits through all phases to graduation.
Returns summary of graduated, dropped, and pending recruits.`,
    inputSchema: z.object({
      swarmId: z.string().describe('Training swarm ID'),
    }),
    handler: async (input: { swarmId: string }) => {
      const integration = getBootCampSwarmIntegration();
      const result = await integration.runSwarmTraining(input.swarmId);

      const status = integration.getSwarmTrainingStatus(input.swarmId);

      return {
        success: true,
        swarmId: input.swarmId,
        completed: result.completed.length,
        failed: result.failed.length,
        pending: result.pending.length,
        graduationRate: status?.graduationRate ?? 0,
        certifiedAgents: status?.readyForDeployment.map(a => ({
          agentId: a.agentId,
          strategy: a.strategy,
          certificationLevel: a.certificationLevel,
          marksmanship: a.marksmanshipQualification,
          avgScore: a.trainingPerformance.avgScore,
        })),
        message: `Training complete: ${result.completed.length} graduated, ${result.failed.length} dropped, ${result.pending.length} pending`,
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_status
  // ===========================================================================
  ps_bootcamp_status: {
    name: 'ps_bootcamp_status',
    description: 'Get Boot Camp status and recruit breakdown.',
    inputSchema: z.object({}),
    handler: async () => {
      const controller = getBootCampController();
      const status = controller.getStatus();
      const config = controller.getConfig();

      if (!status || !config) {
        return { success: false, error: 'No Boot Camp configured' };
      }

      const recruits = controller.getAllRecruits();

      return {
        success: true,
        bootCampId: config.bootCampId,
        name: config.name,
        status: status.status,
        totalRecruits: status.totalRecruits,
        inTraining: status.inTraining,
        graduated: status.graduated,
        dropped: status.dropped,
        graduationRate: status.totalRecruits > 0
          ? Math.round((status.graduated / status.totalRecruits) * 100)
          : 0,
        phaseBreakdown: status.phaseBreakdown,
        recruits: recruits.map(r => ({
          recruitId: r.recruitId,
          agentId: r.agentId,
          strategy: r.strategy,
          status: r.status,
          currentPhase: r.currentPhase,
          currentAttempt: r.currentAttempt,
          recyclings: r.totalRecyclings,
          marksmanship: r.marksmanshipQual,
          expertBadges: r.expertBadges.length,
        })),
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_recruit_status
  // ===========================================================================
  ps_bootcamp_recruit_status: {
    name: 'ps_bootcamp_recruit_status',
    description: 'Get detailed status for a specific recruit.',
    inputSchema: z.object({
      recruitId: z.string().describe('Recruit ID'),
    }),
    handler: async (input: { recruitId: string }) => {
      const controller = getBootCampController();
      const recruit = controller.getRecruit(input.recruitId);

      if (!recruit) {
        return { success: false, error: `Recruit ${input.recruitId} not found` };
      }

      return {
        success: true,
        recruit: {
          recruitId: recruit.recruitId,
          agentId: recruit.agentId,
          name: recruit.name,
          strategy: recruit.strategy,
          status: recruit.status,
          currentPhase: recruit.currentPhase,
          phaseDescription: getPhaseDescription(recruit.currentPhase),
          usmcEquivalent: getMarineCorpsEquivalent(recruit.currentPhase),
          currentAttempt: recruit.currentAttempt,
          totalRecyclings: recruit.totalRecyclings,
          trainingBudget: recruit.trainingBudget.value,
          trainingBudgetSpent: recruit.trainingBudgetSpent.value,
          marksmanshipQual: recruit.marksmanshipQual,
          expertBadges: recruit.expertBadges,
          merits: recruit.merits,
          demerits: recruit.demerits,
          phaseHistory: recruit.phaseHistory.map(p => ({
            phase: p.phase,
            score: p.score,
            passed: p.passed,
            attempt: p.attemptNumber,
          })),
          enlistedAt: recruit.enlistedAt,
          graduatedAt: recruit.graduatedAt,
          assignedDI: recruit.assignedDI,
          diNotes: recruit.diNotes,
        },
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_swarm_status
  // ===========================================================================
  ps_bootcamp_swarm_status: {
    name: 'ps_bootcamp_swarm_status',
    description: 'Get training status for a specific swarm.',
    inputSchema: z.object({
      swarmId: z.string().describe('Swarm ID'),
    }),
    handler: async (input: { swarmId: string }) => {
      const integration = getBootCampSwarmIntegration();
      const status = integration.getSwarmTrainingStatus(input.swarmId);

      if (!status) {
        return { success: false, error: `No training status found for swarm ${input.swarmId}` };
      }

      return {
        success: true,
        swarmId: status.swarmId,
        bootCampId: status.bootCampId,
        totalAgents: status.totalAgents,
        inTraining: status.inTraining,
        graduated: status.graduated,
        dropped: status.dropped,
        graduationRate: Math.round(status.graduationRate * 100),
        phaseBreakdown: status.phaseBreakdown,
        pendingReviews: status.pendingReviews,
        readyForDeployment: status.readyForDeployment.length,
        certifiedAgents: status.readyForDeployment.map(a => ({
          agentId: a.agentId,
          strategy: a.strategy,
          certificationLevel: a.certificationLevel,
          marksmanship: a.marksmanshipQualification,
          expertBadges: a.expertBadges.length,
          avgScore: Math.round(a.trainingPerformance.avgScore),
        })),
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_check_certification
  // ===========================================================================
  ps_bootcamp_check_certification: {
    name: 'ps_bootcamp_check_certification',
    description: `Check if an agent is certified for live trading.

Agents MUST complete Boot Camp before being allowed to trade live.
This returns the certification status and any requirements.`,
    inputSchema: z.object({
      agentId: z.string().describe('Agent ID to check'),
    }),
    handler: async (input: { agentId: string }) => {
      const controller = getBootCampController();
      const status = controller.getAgentCertificationStatus(input.agentId);
      const integration = getBootCampSwarmIntegration();

      if (status.certified) {
        const certification = integration.getAgentCertification(input.agentId);
        return {
          success: true,
          certified: true,
          agentId: input.agentId,
          certificationLevel: status.certificationLevel,
          graduatedAt: status.graduatedAt,
          details: certification ? {
            marksmanship: certification.marksmanshipQualification,
            expertBadges: certification.expertBadges,
            avgScore: certification.trainingPerformance.avgScore,
            recyclings: certification.trainingPerformance.totalRecyclings,
          } : undefined,
          message: 'Agent is certified for live trading',
        };
      }

      return {
        success: true,
        certified: false,
        agentId: input.agentId,
        status: status.status,
        currentPhase: status.currentPhase,
        message: status.status === 'NOT_ENROLLED'
          ? 'Agent not enrolled in Boot Camp. Must complete training before live trading.'
          : `Agent in training (${status.status}) at Phase ${status.currentPhase}. Must graduate to trade live.`,
        requirement: 'Complete all 6 Boot Camp phases and pass graduation exam',
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_di_review
  // ===========================================================================
  ps_bootcamp_di_review: {
    name: 'ps_bootcamp_di_review',
    description: `Drill Instructor review for phase advancement.

When DI approval is required, recruits cannot advance until a DI reviews
and approves their phase completion. This tool handles that approval.`,
    inputSchema: DIReviewSchema,
    handler: async (input: z.infer<typeof DIReviewSchema>) => {
      const controller = getBootCampController();

      if (input.approved) {
        await controller.approveDIReview(input.requestId, input.diId, input.notes);
        return {
          success: true,
          requestId: input.requestId,
          approved: true,
          message: 'Phase advancement approved by DI',
        };
      } else {
        await controller.rejectDIReview(input.requestId, input.diId, input.notes ?? 'Not meeting standards');
        return {
          success: true,
          requestId: input.requestId,
          approved: false,
          message: 'Phase advancement rejected - recruit recycled',
        };
      }
    },
  },

  // ===========================================================================
  // ps_bootcamp_pending_reviews
  // ===========================================================================
  ps_bootcamp_pending_reviews: {
    name: 'ps_bootcamp_pending_reviews',
    description: 'Get pending DI reviews requiring action.',
    inputSchema: z.object({
      diId: z.string().optional().describe('Filter by DI ID'),
    }),
    handler: async (input: { diId?: string }) => {
      const controller = getBootCampController();
      const reviews = controller.getPendingReviews(input.diId);

      return {
        success: true,
        pendingReviews: reviews.map(r => ({
          requestId: r.requestId,
          recruitId: r.recruitId,
          phase: r.phase,
          score: r.evaluation.score,
          passed: r.evaluation.passed,
          assignedDI: r.assignedDI,
          createdAt: r.createdAt,
          exerciseSummary: r.evaluation.exerciseResults.map(e => ({
            exercise: e.exerciseType,
            score: e.score,
            passed: e.passed,
          })),
        })),
        count: reviews.length,
      };
    },
  },

  // ===========================================================================
  // ps_bootcamp_deploy_swarm
  // ===========================================================================
  ps_bootcamp_deploy_swarm: {
    name: 'ps_bootcamp_deploy_swarm',
    description: `Deploy a trained swarm to live trading.

This creates a production swarm using only certified/graduated agents.
Uncertified agents will be rejected from deployment.`,
    inputSchema: z.object({
      trainingSwarmId: z.string().describe('Training swarm ID'),
      productionBudget: z.number().min(50).max(10000).describe('Production budget in USD'),
      searchTerms: z.array(z.string()).describe('What to search for'),
      maxPricePerItem: z.number().optional().describe('Max price per item'),
      durationHours: z.number().min(1).max(168).optional().describe('Operation duration in hours'),
    }),
    handler: async (input: {
      trainingSwarmId: string;
      productionBudget: number;
      searchTerms: string[];
      maxPricePerItem?: number;
      durationHours?: number;
    }) => {
      const integration = getBootCampSwarmIntegration();

      const result = await integration.deployTrainedSwarm(input.trainingSwarmId, {
        productionBudget: input.productionBudget,
        targetCriteria: {
          searchTerms: input.searchTerms,
          maxPrice: input.maxPricePerItem,
        },
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + (input.durationHours ?? 24) * 3600000),
        },
      });

      return {
        success: true,
        trainingSwarmId: input.trainingSwarmId,
        productionSwarmId: result.productionSwarmId,
        deployedAgents: result.deployedAgents,
        rejectedAgents: result.rejectedAgents.length,
        message: `Deployed ${result.deployedAgents} certified agents to production swarm`,
        nextStep: 'Use ps_swarm_start to begin live operations',
      };
    },
  },
};

// =============================================================================
// TOOL REGISTRATION HELPER
// =============================================================================

/**
 * Get all Boot Camp tool definitions for MCP registration.
 */
export function getBootCampToolDefinitions() {
  return Object.values(bootCampTools).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/**
 * Execute a Boot Camp tool by name.
 */
export async function executeBootCampTool(
  toolName: string,
  input: unknown
): Promise<unknown> {
  const tool = bootCampTools[toolName as keyof typeof bootCampTools];

  if (!tool) {
    throw new Error(`Unknown Boot Camp tool: ${toolName}`);
  }

  // Validate input
  const validatedInput = tool.inputSchema.parse(input);

  // Execute handler
  return tool.handler(validatedInput as any);
}
