/**
 * Database Sync Hook
 *
 * Writes observations to SQLite for immutable event stream storage.
 * This is the primary audit trail for all reconnaissance activities.
 */

import type { Observation } from '../types.js';
import { recordObservation } from '../database.js';
import { createHook, type ObservationHook } from './observation-hooks.js';
import { createSecureLogger } from '../../core/security/index.js';

// Use SecureLogger for market intelligence hooks - protects seller/listing data
const logger = createSecureLogger('DatabaseSyncHook');

/**
 * Create the database sync hook.
 *
 * This hook runs with high priority (100) to ensure observations
 * are persisted before other hooks process them.
 */
export function createDatabaseSyncHook(): ObservationHook {
  return createHook()
    .id('database-sync')
    .name('Database Sync')
    .priority(100) // High priority - run first
    .forAllTypes()
    .handler(async (observation: Observation) => {
      // The observation is already recorded by the swarm controller,
      // but this hook can add additional processing like:
      // - Logging
      // - Metrics collection
      // - Triggering downstream updates

      // For now, this is a passthrough that confirms database recording
      // In production, you might add retry logic or backup storage here

      // Log high-confidence opportunities
      if (
        observation.observationType === 'OPPORTUNITY_IDENTIFIED' &&
        observation.confidenceScore >= 0.8
      ) {
        logger.info('High-confidence opportunity identified', {
          itemTitle: observation.itemTitle,
          price: observation.currentPrice,
          confidence: observation.confidenceScore,
        });
      }

      // Log probe requests that need human attention
      if (observation.observationType === 'PROBE_REQUESTED') {
        logger.info('Probe requested - awaiting human approval', {
          itemTitle: observation.itemTitle,
          listingId: observation.listingId,
        });
      }
    })
    .build();
}

/**
 * Enhanced database sync hook that also updates seller profiles.
 */
export function createEnhancedDatabaseSyncHook(): ObservationHook {
  // Track sellers seen in this session
  const sellerObservations = new Map<string, number>();

  return createHook()
    .id('database-sync-enhanced')
    .name('Enhanced Database Sync')
    .priority(100)
    .forAllTypes()
    .handler(async (observation: Observation) => {
      // Track seller interactions
      if (observation.sellerId) {
        const count = sellerObservations.get(observation.sellerId) ?? 0;
        sellerObservations.set(observation.sellerId, count + 1);
      }

      // Additional processing based on observation type
      switch (observation.observationType) {
        case 'OPPORTUNITY_IDENTIFIED':
          handleOpportunity(observation);
          break;

        case 'SELLER_BEHAVIOR_OBSERVED':
          handleSellerBehavior(observation);
          break;

        case 'PROBE_REQUESTED':
          handleProbeRequest(observation);
          break;

        case 'MARKET_CONDITION_DETECTED':
          handleMarketCondition(observation);
          break;
      }
    })
    .cleanup(async () => {
      // Log final stats on shutdown
      logger.info('Session complete', { uniqueSellers: sellerObservations.size });
      sellerObservations.clear();
    })
    .build();
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function handleOpportunity(obs: Observation): void {
  const urgency = obs.timeRemaining && obs.timeRemaining < 3600 ? 'URGENT' : 'NORMAL';

  logger.info('Opportunity detected', {
    itemTitle: obs.itemTitle?.substring(0, 50),
    price: obs.currentPrice,
    discountPercent: obs.discountPercent,
    urgency,
  });
}

function handleSellerBehavior(obs: Observation): void {
  logger.info('Seller behavior observed', {
    sellerId: obs.sellerId,
    reasoning: obs.reasoning?.substring(0, 100),
  });
}

function handleProbeRequest(obs: Observation): void {
  logger.info('Probe request pending', {
    listingId: obs.listingId,
    recommendedAction: obs.recommendedAction,
    recommendedAmount: obs.recommendedAmount,
  });
}

function handleMarketCondition(obs: Observation): void {
  logger.info('Market condition detected', {
    condition: obs.marketCondition,
    reasoning: obs.reasoning?.substring(0, 100),
  });
}
