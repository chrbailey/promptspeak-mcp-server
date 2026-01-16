/**
 * Alert Hook
 *
 * Integrates the AlertEngine with the observation hook system.
 * Automatically generates alerts when observations meet trigger conditions.
 */

import type { Observation, AlertConfig } from '../types.js';
import { createHook, type ObservationHook } from './observation-hooks.js';
import { getAlertEngine, AlertEngine } from '../alerts/alert-engine.js';

/**
 * Create an alert hook that processes observations for alert triggers.
 */
export function createAlertHook(config?: Partial<AlertConfig>): ObservationHook {
  const engine = getAlertEngine(config);

  return createHook()
    .id('alert-engine')
    .name('Alert Engine')
    .priority(80) // High priority, but after database sync
    .forTypes(
      'OPPORTUNITY_IDENTIFIED',
      'PRICE_OBSERVED',
      'LISTING_DISCOVERED',
      'SELLER_BEHAVIOR_OBSERVED'
    )
    .minConfidence(0.5) // Only process observations with reasonable confidence
    .handler(async (observation: Observation) => {
      // Process observation through alert engine
      const alerts = await engine.processObservation(observation);

      // Log generated alerts
      for (const alert of alerts) {
        console.log(
          `[ALERT] ${alert.severity} ${alert.alertType}: ${alert.summary.substring(0, 80)}...`
        );
      }
    })
    .build();
}

/**
 * Create an alert hook with custom engine instance (for testing).
 */
export function createAlertHookWithEngine(engine: AlertEngine): ObservationHook {
  return createHook()
    .id('alert-engine-custom')
    .name('Alert Engine (Custom)')
    .priority(80)
    .forTypes(
      'OPPORTUNITY_IDENTIFIED',
      'PRICE_OBSERVED',
      'LISTING_DISCOVERED',
      'SELLER_BEHAVIOR_OBSERVED'
    )
    .handler(async (observation: Observation) => {
      await engine.processObservation(observation);
    })
    .build();
}
