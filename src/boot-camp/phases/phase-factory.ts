/**
 * Phase Factory
 *
 * Creates phase instances based on phase type.
 */

import type { TrainingPhase } from '../types.js';
import type { PhaseImplementation } from './base-phase.js';
import { ReceivingPhase } from './receiving.js';
import { ConditioningPhase } from './conditioning.js';
import { MarksmanshipPhase } from './marksmanship.js';
import { CombatPhase } from './combat.js';
import { CruciblePhase } from './crucible.js';
import { GraduationPhase } from './graduation.js';

/**
 * Create a phase implementation from phase type.
 */
export function createPhase(phase: TrainingPhase): PhaseImplementation {
  switch (phase) {
    case 'RECEIVING':
      return new ReceivingPhase();

    case 'CONDITIONING':
      return new ConditioningPhase();

    case 'MARKSMANSHIP':
      return new MarksmanshipPhase();

    case 'COMBAT':
      return new CombatPhase();

    case 'CRUCIBLE':
      return new CruciblePhase();

    case 'GRADUATION':
      return new GraduationPhase();

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

/**
 * Get all phase implementations.
 */
export function getAllPhases(): Map<TrainingPhase, PhaseImplementation> {
  const phases = new Map<TrainingPhase, PhaseImplementation>();

  phases.set('RECEIVING', new ReceivingPhase());
  phases.set('CONDITIONING', new ConditioningPhase());
  phases.set('MARKSMANSHIP', new MarksmanshipPhase());
  phases.set('COMBAT', new CombatPhase());
  phases.set('CRUCIBLE', new CruciblePhase());
  phases.set('GRADUATION', new GraduationPhase());

  return phases;
}

/**
 * Get phase description for display.
 */
export function getPhaseDescription(phase: TrainingPhase): string {
  const descriptions: Record<TrainingPhase, string> = {
    RECEIVING: 'Initial processing - configuration validation, credential verification, basic setup',
    CONDITIONING: 'Strategy calibration - decision speed, parameter tuning, stress testing',
    MARKSMANSHIP: 'Bid accuracy training - precision bidding, timing, value assessment',
    COMBAT: 'Live market simulation - sandbox operations, competitive scenarios',
    CRUCIBLE: 'Stress testing - limited budget, high competition, rapid decisions, recovery',
    GRADUATION: 'Final certification - capability assessment, inspection, certification exam',
  };

  return descriptions[phase];
}

/**
 * Get USMC equivalent for phase.
 */
export function getMarineCorpsEquivalent(phase: TrainingPhase): string {
  const equivalents: Record<TrainingPhase, string> = {
    RECEIVING: 'Week 1-2: Receiving - Processing, haircut, uniform issue, IST',
    CONDITIONING: 'Week 3-4: Phase 1 - Close order drill, PT, core values',
    MARKSMANSHIP: 'Week 5-6: Phase 2 - Rifle qualification, known distance course',
    COMBAT: 'Week 7-9: Phase 3 - Field training, MOUT, patrolling',
    CRUCIBLE: 'Week 10-11: The Crucible - 54-hour final challenge',
    GRADUATION: 'Week 12-13: Graduation - EGA ceremony, final inspection, liberty',
  };

  return equivalents[phase];
}
