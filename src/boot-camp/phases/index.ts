/**
 * Boot Camp Training Phases
 *
 * Exports all phase implementations.
 */

export { ReceivingPhase } from './receiving.js';
export { ConditioningPhase } from './conditioning.js';
export { MarksmanshipPhase } from './marksmanship.js';
export { CombatPhase } from './combat.js';
export { CruciblePhase } from './crucible.js';
export { GraduationPhase } from './graduation.js';
export { BasePhase, type PhaseImplementation, type ExerciseContext } from './base-phase.js';
export { createPhase, getAllPhases, getPhaseDescription, getMarineCorpsEquivalent } from './phase-factory.js';
