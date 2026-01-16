/**
 * Marine Agent Boot Camp Protocol
 *
 * Training system for market agents based on USMC recruit training doctrine.
 * Agents must complete all 6 phases before being certified for live trading.
 *
 * Training Phases:
 * 1. RECEIVING     - Agent initialization and configuration
 * 2. CONDITIONING  - Strategy calibration and stress testing
 * 3. MARKSMANSHIP  - Bid accuracy and timing training
 * 4. COMBAT        - Live market simulation
 * 5. CRUCIBLE      - Stress testing with limited resources
 * 6. GRADUATION    - Final certification exam
 *
 * Key Features:
 * - Mandatory training before live trading
 * - Drill Instructor oversight and approval
 * - Marksmanship qualifications (Marksman, Sharpshooter, Expert)
 * - Merit/demerit tracking
 * - Certification levels (Standard, Meritorious, Honor Graduate)
 *
 * @module boot-camp
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export * from './types.js';

// =============================================================================
// CONTROLLER EXPORTS
// =============================================================================

export {
  BootCampController,
  getBootCampController,
  createBootCampController,
  type CreateBootCampOptions,
  type EnrollRecruitOptions,
  type BootCampControllerEvents,
} from './boot-camp-controller.js';

// =============================================================================
// SWARM INTEGRATION EXPORTS
// =============================================================================

export {
  BootCampSwarmIntegration,
  getBootCampSwarmIntegration,
  createBootCampSwarmIntegration,
  type TrainingSwarmOptions,
  type CertifiedAgent,
  type SwarmTrainingStatus,
} from './swarm-integration.js';

// =============================================================================
// PHASE EXPORTS
// =============================================================================

export {
  BasePhase,
  createPhase,
  getAllPhases,
  getPhaseDescription,
  type PhaseImplementation,
  type ExerciseContext,
} from './phases/index.js';

export { ReceivingPhase } from './phases/receiving.js';
export { ConditioningPhase } from './phases/conditioning.js';
export { MarksmanshipPhase } from './phases/marksmanship.js';
export { CombatPhase } from './phases/combat.js';
export { CruciblePhase } from './phases/crucible.js';
export { GraduationPhase } from './phases/graduation.js';

// =============================================================================
// TOOL EXPORTS
// =============================================================================

export {
  bootCampTools,
  getBootCampToolDefinitions,
  executeBootCampTool,
} from './tools.js';

// =============================================================================
// DATABASE EXPORTS
// =============================================================================

export {
  initializeBootCampDatabase,
  getBootCampDatabase,
  closeBootCampDatabase,
  saveBootCamp,
  getBootCampById,
  saveRecruit,
  getRecruitById,
  getRecruitByAgentId,
  listRecruitsForSwarm,
  saveCertification,
  isAgentCertified,
  getCertificationByAgentId,
  recordBootCampEvent,
  queryBootCampEvents,
} from './database.js';

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

import { getBootCampSwarmIntegration } from './swarm-integration.js';

/**
 * Quick start: Create and run a training swarm.
 *
 * This is a convenience function that:
 * 1. Creates a Boot Camp for the swarm
 * 2. Enrolls agents as recruits
 * 3. Runs all training phases
 * 4. Returns certified agents ready for deployment
 *
 * @example
 * ```ts
 * const result = await quickTrainSwarm({
 *   name: 'Mink Pelt Acquisition Team',
 *   agentCount: 5,
 *   trainingBudget: 500,
 *   createdBy: 'user_123',
 * });
 *
 * console.log(`${result.certifiedAgents.length} agents ready for deployment`);
 * ```
 */
export async function quickTrainSwarm(options: {
  name: string;
  agentCount: number;
  trainingBudget: number;
  createdBy: string;
  autoAdvance?: boolean;
}): Promise<{
  swarmId: string;
  bootCampId: string;
  certifiedAgents: {
    agentId: string;
    strategy: string;
    certificationLevel: string;
    avgScore: number;
  }[];
  droppedCount: number;
}> {
  const integration = getBootCampSwarmIntegration();

  // Create training swarm
  const { swarmId, bootCampId } = await integration.createTrainingSwarm({
    name: options.name,
    agentCount: options.agentCount,
    trainingBudget: options.trainingBudget,
    createdBy: options.createdBy,
    autoAdvance: options.autoAdvance ?? true, // Auto-advance for quick training
    requireDIApproval: false,
  });

  // Run training
  const trainingResult = await integration.runSwarmTraining(swarmId);

  // Get status
  const status = integration.getSwarmTrainingStatus(swarmId);

  return {
    swarmId,
    bootCampId,
    certifiedAgents: status?.readyForDeployment.map(a => ({
      agentId: a.agentId,
      strategy: a.strategy,
      certificationLevel: a.certificationLevel,
      avgScore: a.trainingPerformance.avgScore,
    })) ?? [],
    droppedCount: trainingResult.failed.length,
  };
}

/**
 * Check if an agent is certified for live trading.
 *
 * @example
 * ```ts
 * const gate = createCertificationGate();
 *
 * const result = gate('agent_123');
 * if (!result.allowed) {
 *   console.log(result.reason);
 *   // "Agent not enrolled in Boot Camp. Must complete training before live trading."
 * }
 * ```
 */
export function createCertificationGate(): (agentId: string) => {
  allowed: boolean;
  reason: string;
} {
  const integration = getBootCampSwarmIntegration();
  return integration.createCertificationGate();
}

/**
 * Get USMC equivalents for all training phases.
 *
 * @returns Phase descriptions and USMC parallels
 */
export function getTrainingPhaseInfo(): Array<{
  phase: string;
  description: string;
  usmcEquivalent: string;
  passingScore: number;
  exercises: string[];
}> {
  const { PHASE_ORDER, DEFAULT_PHASE_CONFIGS } = require('./types.js');
  const { getPhaseDescription, getMarineCorpsEquivalent } = require('./phases/phase-factory.js');

  return PHASE_ORDER.map((phase: string) => ({
    phase,
    description: getPhaseDescription(phase),
    usmcEquivalent: getMarineCorpsEquivalent(phase),
    passingScore: DEFAULT_PHASE_CONFIGS[phase].passingScore,
    exercises: DEFAULT_PHASE_CONFIGS[phase].exercises,
  }));
}
