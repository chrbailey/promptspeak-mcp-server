/**
 * Intelligence Tools
 *
 * MCP tools for querying market intelligence and managing probes.
 * These tools enable human-in-the-loop decision making for RECONNAISSANCE mode.
 *
 * Tools:
 * - ps_intel_list_opportunities - List high-confidence opportunities
 * - ps_intel_query_market - Query market intelligence
 * - ps_intel_approve_probe - Approve a probe request
 * - ps_intel_reject_probe - Reject a probe request
 * - ps_intel_get_alerts - Get pending alerts
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  queryObservations,
  getHighConfidenceOpportunities,
  getPendingAlerts,
  getAlert,
  updateAlertStatus,
  getSellerProfile,
  recordObservation,
} from '../database.js';
import type { Observation, Alert, AlertStatus } from '../types.js';
import { generateObservationId } from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Intelligence tool definitions for MCP.
 */
export const intelligenceToolDefinitions: Tool[] = [
  {
    name: 'ps_intel_list_opportunities',
    description: 'List high-confidence market opportunities identified by the swarm. Returns opportunities with recommended actions (BID/OFFER) sorted by confidence score.',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'Filter by swarm ID (optional - omit for all swarms)',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence score (0-1). Default: 0.7',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Default: 20',
        },
        marketCondition: {
          type: 'string',
          enum: ['UNDERPRICED', 'FAIR', 'OVERPRICED'],
          description: 'Filter by market condition',
        },
      },
    },
  },
  {
    name: 'ps_intel_query_market',
    description: 'Query market intelligence with flexible filters. Search observations by various criteria including time range, agent, listing, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'Filter by swarm ID (optional)',
        },
        observationTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by observation types (e.g., PRICE_OBSERVED, OPPORTUNITY_IDENTIFIED)',
        },
        listingId: {
          type: 'string',
          description: 'Filter by specific listing ID',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence score (0-1)',
        },
        since: {
          type: 'string',
          description: 'ISO timestamp - only return observations after this time',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Default: 50',
        },
      },
    },
  },
  {
    name: 'ps_intel_get_alerts',
    description: 'Get pending alerts that require human review or action. Returns alerts sorted by severity and creation time.',
    inputSchema: {
      type: 'object',
      properties: {
        swarmId: {
          type: 'string',
          description: 'Filter by swarm ID (required)',
        },
        alertType: {
          type: 'string',
          enum: ['PRICE_ANOMALY', 'PATTERN_MATCH', 'MULTI_AGENT_CONSENSUS'],
          description: 'Filter by alert type',
        },
        severity: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          description: 'Filter by minimum severity',
        },
      },
      required: ['swarmId'],
    },
  },
  {
    name: 'ps_intel_approve_probe',
    description: 'Approve a probe request to make an offer on a listing. This will authorize the swarm agent to execute the recommended action.',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Alert ID to approve',
        },
        adjustedAmount: {
          type: 'number',
          description: 'Optional: Adjusted offer amount (overrides agent recommendation)',
        },
        notes: {
          type: 'string',
          description: 'Optional: Notes about the approval decision',
        },
      },
      required: ['alertId'],
    },
  },
  {
    name: 'ps_intel_reject_probe',
    description: 'Reject a probe request. The opportunity will be logged for learning but no action taken.',
    inputSchema: {
      type: 'object',
      properties: {
        alertId: {
          type: 'string',
          description: 'Alert ID to reject',
        },
        reason: {
          type: 'string',
          description: 'Reason for rejection (for learning)',
        },
      },
      required: ['alertId'],
    },
  },
  {
    name: 'ps_intel_seller_profile',
    description: 'Get detailed profile for a seller including negotiation history and risk assessment.',
    inputSchema: {
      type: 'object',
      properties: {
        sellerId: {
          type: 'string',
          description: 'eBay seller ID',
        },
      },
      required: ['sellerId'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute an intelligence tool.
 */
export async function executeIntelligenceTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case 'ps_intel_list_opportunities':
      return handleListOpportunities(args);

    case 'ps_intel_query_market':
      return handleQueryMarket(args);

    case 'ps_intel_get_alerts':
      return handleGetAlerts(args);

    case 'ps_intel_approve_probe':
      return handleApproveProbe(args);

    case 'ps_intel_reject_probe':
      return handleRejectProbe(args);

    case 'ps_intel_seller_profile':
      return handleSellerProfile(args);

    default:
      throw new Error(`Unknown intelligence tool: ${toolName}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List high-confidence opportunities.
 */
async function handleListOpportunities(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const swarmId = args.swarmId as string | undefined;
  const minConfidence = (args.minConfidence as number) ?? 0.7;
  const limit = (args.limit as number) ?? 20;
  const marketCondition = args.marketCondition as string | undefined;

  // Query observations
  const observations = queryObservations({
    swarmId,
    minConfidence,
    marketCondition,
    limit,
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
      sellerId: obs.sellerId,
      timeRemaining: obs.timeRemaining,
      timestamp: obs.timestamp,
    }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: opportunities.length,
          opportunities,
          filters: { swarmId, minConfidence, marketCondition, limit },
        }, null, 2),
      },
    ],
  };
}

/**
 * Query market intelligence with flexible filters.
 */
async function handleQueryMarket(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const filters = {
    swarmId: args.swarmId as string | undefined,
    observationTypes: args.observationTypes as string[] | undefined,
    listingId: args.listingId as string | undefined,
    minConfidence: args.minConfidence as number | undefined,
    since: args.since as string | undefined,
    limit: (args.limit as number) ?? 50,
  };

  const observations = queryObservations(filters);

  // Compute summary statistics
  const summary = {
    totalCount: observations.length,
    byMarketCondition: {} as Record<string, number>,
    byRecommendedAction: {} as Record<string, number>,
    avgConfidence: 0,
    avgDiscount: 0,
  };

  let discountCount = 0;
  for (const obs of observations) {
    summary.byMarketCondition[obs.marketCondition] =
      (summary.byMarketCondition[obs.marketCondition] || 0) + 1;
    summary.byRecommendedAction[obs.recommendedAction] =
      (summary.byRecommendedAction[obs.recommendedAction] || 0) + 1;
    summary.avgConfidence += obs.confidenceScore;
    if (obs.discountPercent !== undefined) {
      summary.avgDiscount += obs.discountPercent;
      discountCount++;
    }
  }

  if (observations.length > 0) {
    summary.avgConfidence /= observations.length;
  }
  if (discountCount > 0) {
    summary.avgDiscount /= discountCount;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          summary,
          observations: observations.slice(0, 20).map(obs => ({
            observationId: obs.observationId,
            type: obs.observationType,
            itemTitle: obs.itemTitle,
            price: obs.currentPrice,
            marketCondition: obs.marketCondition,
            confidence: obs.confidenceScore,
            timestamp: obs.timestamp,
          })),
          filters,
        }, null, 2),
      },
    ],
  };
}

/**
 * Get pending alerts.
 */
async function handleGetAlerts(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const swarmId = args.swarmId as string;
  const alertType = args.alertType as string | undefined;
  const minSeverity = args.severity as string | undefined;

  if (!swarmId) {
    throw new Error('swarmId is required');
  }

  let alerts = getPendingAlerts(swarmId);

  // Apply filters
  if (alertType) {
    alerts = alerts.filter(a => a.alertType === alertType);
  }
  if (minSeverity) {
    const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const minIndex = severityOrder.indexOf(minSeverity);
    alerts = alerts.filter(a => severityOrder.indexOf(a.severity) >= minIndex);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: alerts.length,
          alerts: alerts.map(a => ({
            alertId: a.alertId,
            alertType: a.alertType,
            severity: a.severity,
            listingId: a.listingId,
            recommendedAction: a.recommendedAction,
            recommendedAmount: a.recommendedAmount,
            confidence: a.confidence,
            summary: a.summary,
            requiresApproval: a.requiresApproval,
            approvalDeadline: a.approvalDeadline,
            createdAt: a.createdAt,
          })),
        }, null, 2),
      },
    ],
  };
}

/**
 * Approve a probe request.
 */
async function handleApproveProbe(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const alertId = args.alertId as string;
  const adjustedAmount = args.adjustedAmount as number | undefined;
  const notes = args.notes as string | undefined;

  if (!alertId) {
    throw new Error('alertId is required');
  }

  // Get the alert
  const alert = getAlert(alertId);
  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`);
  }

  if (alert.status !== 'PENDING') {
    throw new Error(`Alert is not pending: ${alert.status}`);
  }

  // Update alert status to approved
  const resolutionNotes = notes
    ? `Approved. ${adjustedAmount ? `Adjusted to $${adjustedAmount}. ` : ''}${notes}`
    : adjustedAmount
      ? `Approved with adjusted amount: $${adjustedAmount}`
      : 'Approved';

  const updated = updateAlertStatus(alertId, 'APPROVED', 'human', resolutionNotes);

  if (!updated) {
    throw new Error('Failed to update alert status');
  }

  // Record the probe execution observation
  const observation: Observation = {
    observationId: generateObservationId(),
    observationType: 'PROBE_EXECUTED',
    agentId: 'human-approved',
    swarmId: alert.swarmId,
    listingId: alert.listingId,
    recommendedAction: alert.recommendedAction,
    recommendedAmount: adjustedAmount ?? alert.recommendedAmount,
    marketCondition: 'FAIR', // Human-approved probes treated as fair market assessment
    confidenceScore: alert.confidence,
    reasoning: `Human approved probe. ${resolutionNotes}`,
    currentPrice: alert.estimatedValue, // Use estimated value as proxy
    competitionLevel: 'LOW', // Not applicable for human-approved probes
    timestamp: new Date().toISOString(),
    metadata: {
      alertId,
      approvedBy: 'human',
      originalAmount: alert.recommendedAmount,
      adjustedAmount,
    },
  };

  recordObservation(observation);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          alertId,
          status: 'APPROVED',
          action: alert.recommendedAction,
          amount: adjustedAmount ?? alert.recommendedAmount,
          listingId: alert.listingId,
          message: `Probe approved. ${alert.recommendedAction} at $${(adjustedAmount ?? alert.recommendedAmount)?.toFixed(2) ?? 'N/A'}`,
        }, null, 2),
      },
    ],
  };
}

/**
 * Reject a probe request.
 */
async function handleRejectProbe(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const alertId = args.alertId as string;
  const reason = args.reason as string | undefined;

  if (!alertId) {
    throw new Error('alertId is required');
  }

  // Get the alert
  const alert = getAlert(alertId);
  if (!alert) {
    throw new Error(`Alert not found: ${alertId}`);
  }

  if (alert.status !== 'PENDING') {
    throw new Error(`Alert is not pending: ${alert.status}`);
  }

  // Update alert status to rejected
  const updated = updateAlertStatus(
    alertId,
    'REJECTED',
    'human',
    reason ?? 'Rejected by human'
  );

  if (!updated) {
    throw new Error('Failed to update alert status');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          alertId,
          status: 'REJECTED',
          reason: reason ?? 'No reason provided',
          listingId: alert.listingId,
          message: 'Probe rejected. Logged for learning.',
        }, null, 2),
      },
    ],
  };
}

/**
 * Get seller profile.
 */
async function handleSellerProfile(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const sellerId = args.sellerId as string;

  if (!sellerId) {
    throw new Error('sellerId is required');
  }

  const profile = getSellerProfile(sellerId);

  if (!profile) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            found: false,
            sellerId,
            message: 'Seller not found in database. No prior interactions recorded.',
          }, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          found: true,
          profile: {
            sellerId: profile.sellerId,
            feedbackScore: profile.feedbackScore,
            feedbackPercent: profile.feedbackPercent,
            totalInteractions: profile.totalInteractions,
            successfulAcquisitions: profile.successfulAcquisitions,
            avgDiscountAchieved: profile.avgDiscountAchieved,
            negotiationStyle: profile.negotiationStyle,
            bestOfferAcceptanceRate: profile.bestOfferAcceptanceRate,
            riskLevel: profile.riskLevel,
            firstSeenAt: profile.firstSeenAt,
            lastUpdatedAt: profile.lastUpdatedAt,
          },
        }, null, 2),
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a tool name is an intelligence tool.
 */
export function isIntelligenceTool(toolName: string): boolean {
  return toolName.startsWith('ps_intel_');
}

/**
 * Get all intelligence tool definitions.
 */
export function getIntelligenceToolDefinitions(): Tool[] {
  return intelligenceToolDefinitions;
}
