/**
 * Pinecone Sync Hook
 *
 * Syncs observations to Pinecone vector indexes for semantic search.
 * Automatically routes observations to the appropriate index based on type.
 *
 * Index Routing:
 * - LISTING_DISCOVERED → listings-intel (listing similarity)
 * - PRICE_OBSERVED, OPPORTUNITY_IDENTIFIED → price-intel (price patterns)
 * - SELLER_BEHAVIOR_OBSERVED → seller-intel (seller profiles)
 */

import type { Observation } from '../types.js';
import { createHook, type ObservationHook } from './observation-hooks.js';
import {
  getIntelligencePineconeClient,
  PINECONE_INDEXES,
  type PriceRecord,
  type SellerRecord,
  buildPriceRecord,
} from '../vectors/pinecone-client.js';
import { getSellerProfile } from '../database.js';
import { createSecureLogger } from '../../core/security/index.js';

// Use SecureLogger for market intelligence - protects listing/seller/price data
const logger = createSecureLogger('PineconeSyncHook');

/**
 * Configuration for the Pinecone sync hook.
 */
export interface PineconeSyncConfig {
  /** Enable syncing to listings index */
  syncListings?: boolean;
  /** Enable syncing to price intelligence index */
  syncPrices?: boolean;
  /** Enable syncing to seller profiles index */
  syncSellers?: boolean;
  /** Minimum confidence to sync price observations */
  minConfidenceForSync?: number;
  /** Namespace for Pinecone records */
  namespace?: string;
  /** Batch size for upserts (future use) */
  batchSize?: number;
}

const DEFAULT_CONFIG: PineconeSyncConfig = {
  syncListings: true,
  syncPrices: true,
  syncSellers: true,
  minConfidenceForSync: 0.5,
  namespace: 'swarm',
  batchSize: 100,
};

/**
 * Pending upserts queue for batching.
 * Key: index name, Value: array of records to upsert.
 */
interface PendingUpserts {
  [PINECONE_INDEXES.LISTINGS]: unknown[];
  [PINECONE_INDEXES.PRICES]: PriceRecord[];
  [PINECONE_INDEXES.SELLERS]: SellerRecord[];
}

/**
 * Create a Pinecone sync hook for observation processing.
 *
 * This hook:
 * 1. Receives observations from the hook registry
 * 2. Transforms them into Pinecone records
 * 3. Queues them for upsert to the appropriate index
 *
 * Note: Actual Pinecone upserts are performed via MCP tools.
 * This hook prepares the data and logs what would be synced.
 */
export function createPineconeSyncHook(config?: Partial<PineconeSyncConfig>): ObservationHook {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const client = getIntelligencePineconeClient(cfg.namespace);

  // Track pending upserts for logging/batching
  const pendingUpserts: PendingUpserts = {
    [PINECONE_INDEXES.LISTINGS]: [],
    [PINECONE_INDEXES.PRICES]: [],
    [PINECONE_INDEXES.SELLERS]: [],
  };

  return createHook()
    .id('pinecone-sync')
    .name('Pinecone Vector Sync')
    .priority(70) // After database sync (100) and alert engine (80)
    .forTypes(
      'LISTING_DISCOVERED',
      'PRICE_OBSERVED',
      'OPPORTUNITY_IDENTIFIED',
      'SELLER_BEHAVIOR_OBSERVED'
    )
    .minConfidence(cfg.minConfidenceForSync ?? 0.5)
    .handler(async (observation: Observation) => {
      try {
        // Route to appropriate index based on observation type
        switch (observation.observationType) {
          case 'LISTING_DISCOVERED':
            if (cfg.syncListings) {
              await syncListingObservation(observation, client, pendingUpserts);
            }
            break;

          case 'PRICE_OBSERVED':
          case 'OPPORTUNITY_IDENTIFIED':
            if (cfg.syncPrices) {
              await syncPriceObservation(observation, client, pendingUpserts);
            }
            break;

          case 'SELLER_BEHAVIOR_OBSERVED':
            if (cfg.syncSellers) {
              await syncSellerObservation(observation, client, pendingUpserts);
            }
            break;
        }
      } catch (error) {
        logger.error('Error syncing observation', error as Error, {
          observationType: observation.observationType,
          listingId: observation.listingId,
        });
        // Don't throw - other hooks should continue
      }
    })
    .build();
}

/**
 * Sync a listing discovery observation.
 */
async function syncListingObservation(
  observation: Observation,
  client: ReturnType<typeof getIntelligencePineconeClient>,
  _pendingUpserts: PendingUpserts
): Promise<void> {
  // For listing observations, we'd typically need the full listing data
  // which isn't stored in the observation itself. Log for now.
  logger.debug('Listing sync prepared', {
    listingId: observation.listingId,
    itemTitle: observation.itemTitle?.substring(0, 40),
  });

  // In a full implementation, we'd fetch the listing and upsert:
  // const listing = await fetchListing(observation.listingId);
  // const { record } = client.prepareListingUpsert(listing, observation);
  // await upsertToPinecone(PINECONE_INDEXES.LISTINGS, record);
}

/**
 * Sync a price observation.
 */
async function syncPriceObservation(
  observation: Observation,
  client: ReturnType<typeof getIntelligencePineconeClient>,
  pendingUpserts: PendingUpserts
): Promise<void> {
  const { record } = client.preparePriceUpsert(observation);
  pendingUpserts[PINECONE_INDEXES.PRICES].push(record);

  logger.debug('Price record prepared', {
    recordId: record.id,
    price: observation.currentPrice,
    marketCondition: observation.marketCondition,
    queueSize: pendingUpserts[PINECONE_INDEXES.PRICES].length,
  });

  // Log the record that would be upserted
  // Actual upsert would use MCP tool: mcp__plugin_pinecone_pinecone__upsert-records
}

/**
 * Sync a seller behavior observation.
 */
async function syncSellerObservation(
  observation: Observation,
  client: ReturnType<typeof getIntelligencePineconeClient>,
  pendingUpserts: PendingUpserts
): Promise<void> {
  if (!observation.sellerId) {
    return;
  }

  // Get the seller profile from database
  const profile = getSellerProfile(observation.sellerId);
  if (!profile) {
    logger.debug('No seller profile found', { sellerId: observation.sellerId });
    return;
  }

  const { record } = client.prepareSellerUpsert(profile);
  pendingUpserts[PINECONE_INDEXES.SELLERS].push(record);

  logger.debug('Seller record prepared', {
    recordId: record.id,
    negotiationStyle: profile.negotiationStyle,
    riskLevel: profile.riskLevel,
    queueSize: pendingUpserts[PINECONE_INDEXES.SELLERS].length,
  });
}

/**
 * Create an enhanced Pinecone sync hook with metrics tracking.
 */
export function createEnhancedPineconeSyncHook(
  config?: Partial<PineconeSyncConfig>
): ObservationHook {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Metrics
  let syncCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  const baseHook = createPineconeSyncHook(cfg);

  return createHook()
    .id('pinecone-sync-enhanced')
    .name('Pinecone Vector Sync (Enhanced)')
    .priority(baseHook.priority)
    .forTypes(...baseHook.observationTypes)
    .minConfidence(cfg.minConfidenceForSync ?? 0.5)
    .handler(async (observation: Observation) => {
      try {
        await baseHook.handler(observation);
        syncCount++;

        // Log metrics periodically
        if (syncCount % 100 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          logger.info('Sync metrics', {
            synced: syncCount,
            errors: errorCount,
            rate: parseFloat((syncCount / elapsed).toFixed(1)),
          });
        }
      } catch (error) {
        errorCount++;
        logger.error('Sync error', error as Error);
      }
    })
    .build();
}

/**
 * Flush pending upserts to Pinecone.
 * Call this periodically or when shutting down.
 *
 * Note: This is a placeholder. In production, this would call
 * the Pinecone MCP upsert-records tool with the batched records.
 */
export async function flushPendingUpserts(): Promise<{
  listings: number;
  prices: number;
  sellers: number;
}> {
  // In production, this would:
  // 1. Get pending records from each queue
  // 2. Batch them into appropriate sizes
  // 3. Call mcp__plugin_pinecone_pinecone__upsert-records for each batch
  // 4. Clear the queues

  logger.debug('Flush requested (no-op in current implementation)');

  return {
    listings: 0,
    prices: 0,
    sellers: 0,
  };
}
