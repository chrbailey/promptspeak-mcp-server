/**
 * Intelligence Resources
 *
 * Exposes market intelligence data as MCP resources for Claude to query.
 *
 * Resources:
 * - swarm://intelligence/opportunities - High-confidence opportunities
 * - swarm://intelligence/alerts - Pending alerts requiring action
 * - swarm://intelligence/sellers/{seller_id} - Seller profile
 * - swarm://intelligence/market-summary - Market conditions summary
 */

import {
  queryObservations,
  getHighConfidenceOpportunities,
  getPendingAlerts,
  getSellerProfile,
  listSellersByRisk,
} from '../database.js';
import type { Observation, Alert, SellerProfile } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MCP Resource definition.
 */
export interface IntelligenceResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Resource content with metadata.
 */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Available intelligence resources.
 */
export const INTELLIGENCE_RESOURCES: IntelligenceResource[] = [
  {
    uri: 'swarm://intelligence/opportunities',
    name: 'Market Opportunities',
    description: 'High-confidence opportunities identified by the swarm agents',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://intelligence/alerts',
    name: 'Pending Alerts',
    description: 'Alerts requiring human review or action',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://intelligence/market-summary',
    name: 'Market Summary',
    description: 'Summary of recent market observations and conditions',
    mimeType: 'application/json',
  },
  {
    uri: 'swarm://intelligence/sellers',
    name: 'Seller Profiles',
    description: 'List of known seller profiles with risk assessments',
    mimeType: 'application/json',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * List all available intelligence resources.
 */
export function listIntelligenceResources(): IntelligenceResource[] {
  return INTELLIGENCE_RESOURCES;
}

/**
 * Read a specific resource by URI.
 */
export function readIntelligenceResource(uri: string): ResourceContent | null {
  // Parse URI
  const parsed = parseResourceUri(uri);
  if (!parsed) {
    return null;
  }

  switch (parsed.type) {
    case 'opportunities':
      return readOpportunities();

    case 'alerts':
      return readAlerts();

    case 'market-summary':
      return readMarketSummary();

    case 'sellers':
      if (parsed.id) {
        return readSellerProfile(parsed.id);
      }
      return readSellerList();

    default:
      return null;
  }
}

/**
 * Parse a resource URI into components.
 */
function parseResourceUri(uri: string): { type: string; id?: string } | null {
  // Format: swarm://intelligence/{type}[/{id}]
  const match = uri.match(/^swarm:\/\/intelligence\/([^/]+)(?:\/(.+))?$/);
  if (!match) {
    return null;
  }
  return {
    type: match[1],
    id: match[2],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE READERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Read high-confidence opportunities.
 */
function readOpportunities(): ResourceContent {
  // Get opportunities from all active swarms
  // For now, query recent high-confidence observations
  const observations = queryObservations({
    minConfidence: 0.7,
    limit: 50,
  });

  // Filter to actionable opportunities
  const opportunities = observations
    .filter(obs => ['BID', 'OFFER'].includes(obs.recommendedAction))
    .map(obs => ({
      observationId: obs.observationId,
      listingId: obs.listingId,
      itemTitle: obs.itemTitle,
      currentPrice: obs.currentPrice,
      marketAverage: obs.marketAverage,
      discountPercent: obs.discountPercent,
      marketCondition: obs.marketCondition,
      recommendedAction: obs.recommendedAction,
      recommendedAmount: obs.recommendedAmount,
      confidence: obs.confidenceScore,
      reasoning: obs.reasoning,
      timestamp: obs.timestamp,
    }));

  return {
    uri: 'swarm://intelligence/opportunities',
    mimeType: 'application/json',
    text: JSON.stringify({
      count: opportunities.length,
      opportunities,
      generatedAt: new Date().toISOString(),
    }, null, 2),
  };
}

/**
 * Read pending alerts.
 */
function readAlerts(): ResourceContent {
  // Get pending alerts from all swarms
  // Note: getPendingAlerts requires swarmId, so we'll query directly
  const observations = queryObservations({
    observationTypes: ['ALERT_TRIGGERED'],
    limit: 100,
  });

  // For a proper implementation, we'd query the alerts table directly
  // For now, return observation-based alert summary
  const alertSummary = {
    pendingCount: observations.length,
    alerts: observations.map(obs => ({
      observationId: obs.observationId,
      type: obs.observationType,
      listingId: obs.listingId,
      itemTitle: obs.itemTitle,
      confidence: obs.confidenceScore,
      timestamp: obs.timestamp,
    })),
    generatedAt: new Date().toISOString(),
  };

  return {
    uri: 'swarm://intelligence/alerts',
    mimeType: 'application/json',
    text: JSON.stringify(alertSummary, null, 2),
  };
}

/**
 * Read market summary.
 */
function readMarketSummary(): ResourceContent {
  // Get recent observations to compute market summary
  const recentObservations = queryObservations({
    limit: 200,
  });

  // Compute statistics
  const stats = computeMarketStats(recentObservations);

  return {
    uri: 'swarm://intelligence/market-summary',
    mimeType: 'application/json',
    text: JSON.stringify({
      ...stats,
      generatedAt: new Date().toISOString(),
    }, null, 2),
  };
}

/**
 * Compute market statistics from observations.
 */
function computeMarketStats(observations: Observation[]): Record<string, unknown> {
  if (observations.length === 0) {
    return {
      totalObservations: 0,
      message: 'No observations recorded yet',
    };
  }

  // Count by market condition
  const conditionCounts: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};
  let totalDiscount = 0;
  let discountCount = 0;
  let totalConfidence = 0;

  for (const obs of observations) {
    // Market condition distribution
    conditionCounts[obs.marketCondition] = (conditionCounts[obs.marketCondition] || 0) + 1;

    // Recommended action distribution
    actionCounts[obs.recommendedAction] = (actionCounts[obs.recommendedAction] || 0) + 1;

    // Average discount
    if (obs.discountPercent !== undefined) {
      totalDiscount += obs.discountPercent;
      discountCount++;
    }

    // Average confidence
    totalConfidence += obs.confidenceScore;
  }

  return {
    totalObservations: observations.length,
    marketConditions: conditionCounts,
    recommendedActions: actionCounts,
    averageDiscount: discountCount > 0 ? totalDiscount / discountCount : null,
    averageConfidence: totalConfidence / observations.length,
    timeRange: {
      earliest: observations[observations.length - 1]?.timestamp,
      latest: observations[0]?.timestamp,
    },
  };
}

/**
 * Read seller list.
 */
function readSellerList(): ResourceContent {
  const sellers = listSellersByRisk();

  return {
    uri: 'swarm://intelligence/sellers',
    mimeType: 'application/json',
    text: JSON.stringify({
      count: sellers.length,
      sellers: sellers.map(s => ({
        sellerId: s.sellerId,
        feedbackScore: s.feedbackScore,
        feedbackPercent: s.feedbackPercent,
        totalInteractions: s.totalInteractions,
        negotiationStyle: s.negotiationStyle,
        riskLevel: s.riskLevel,
        lastUpdatedAt: s.lastUpdatedAt,
      })),
      generatedAt: new Date().toISOString(),
    }, null, 2),
  };
}

/**
 * Read a specific seller profile.
 */
function readSellerProfile(sellerId: string): ResourceContent | null {
  const profile = getSellerProfile(sellerId);

  if (!profile) {
    return {
      uri: `swarm://intelligence/sellers/${sellerId}`,
      mimeType: 'application/json',
      text: JSON.stringify({
        error: 'Seller not found',
        sellerId,
      }, null, 2),
    };
  }

  return {
    uri: `swarm://intelligence/sellers/${sellerId}`,
    mimeType: 'application/json',
    text: JSON.stringify({
      ...profile,
      generatedAt: new Date().toISOString(),
    }, null, 2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Intelligence Resource Registry
 *
 * Manages intelligence resources and provides handlers for MCP resource requests.
 */
export class IntelligenceResourceRegistry {
  /**
   * List all available resources.
   */
  listResources(): IntelligenceResource[] {
    return listIntelligenceResources();
  }

  /**
   * Read a resource by URI.
   */
  readResource(uri: string): ResourceContent | null {
    return readIntelligenceResource(uri);
  }

  /**
   * Check if a URI matches an intelligence resource.
   */
  isIntelligenceResource(uri: string): boolean {
    return uri.startsWith('swarm://intelligence/');
  }
}

// Singleton instance
let registryInstance: IntelligenceResourceRegistry | null = null;

/**
 * Get the intelligence resource registry singleton.
 */
export function getIntelligenceResourceRegistry(): IntelligenceResourceRegistry {
  if (!registryInstance) {
    registryInstance = new IntelligenceResourceRegistry();
  }
  return registryInstance;
}
