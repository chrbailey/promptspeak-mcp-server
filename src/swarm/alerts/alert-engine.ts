/**
 * Alert Engine
 *
 * Analyzes observations to generate actionable alerts.
 * Supports three trigger types (per user selection):
 * 1. Price Anomaly - Listing significantly below market average
 * 2. Pattern Match - Seller/listing matches saved criteria
 * 3. Multi-Agent Consensus - Multiple agents flag same opportunity
 */

import type {
  Observation,
  Alert,
  AlertType,
  AlertSeverity,
  AlertConfig,
  PatternRule,
  RecommendedAction,
} from '../types.js';
import {
  generateAlertId,
  DEFAULT_ALERT_CONFIG,
} from '../types.js';
import {
  createAlert as dbCreateAlert,
  getListingObservations,
  queryObservations,
} from '../database.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ALERT ENGINE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class AlertEngine {
  private config: AlertConfig;
  private recentAlerts: Map<string, string> = new Map(); // listingId -> alertId (dedup)

  constructor(config?: Partial<AlertConfig>) {
    this.config = { ...DEFAULT_ALERT_CONFIG, ...config };
  }

  /**
   * Process an observation and generate alerts if conditions are met.
   */
  async processObservation(observation: Observation): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check for price anomaly
    const priceAnomalyAlert = this.checkPriceAnomaly(observation);
    if (priceAnomalyAlert) {
      alerts.push(priceAnomalyAlert);
    }

    // Check pattern matches
    const patternMatchAlert = this.checkPatternMatch(observation);
    if (patternMatchAlert) {
      alerts.push(patternMatchAlert);
    }

    // Check multi-agent consensus
    const consensusAlert = await this.checkMultiAgentConsensus(observation);
    if (consensusAlert) {
      alerts.push(consensusAlert);
    }

    // Store and deduplicate alerts
    for (const alert of alerts) {
      // Skip if we already have an alert for this listing (dedup)
      if (this.recentAlerts.has(alert.listingId)) {
        continue;
      }

      // Store in database
      dbCreateAlert(alert);
      this.recentAlerts.set(alert.listingId, alert.alertId);
    }

    return alerts;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRICE ANOMALY DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if observation indicates a price anomaly.
   *
   * A price anomaly occurs when:
   * - Current price is X% below market average
   * - Listing is marked as UNDERPRICED
   * - Confidence score meets threshold
   */
  checkPriceAnomaly(observation: Observation): Alert | null {
    // Only check for actionable observations
    if (!['BID', 'OFFER'].includes(observation.recommendedAction)) {
      return null;
    }

    // Must have discount info or be marked underpriced
    const hasDiscount = observation.discountPercent !== undefined &&
      observation.discountPercent >= this.config.priceAnomalyThreshold;

    const isUnderpriced = observation.marketCondition === 'UNDERPRICED' &&
      observation.confidenceScore >= this.config.confidenceThreshold;

    if (!hasDiscount && !isUnderpriced) {
      return null;
    }

    const severity = this.calculatePriceAnomalySeverity(observation);
    const now = new Date().toISOString();

    return {
      alertId: generateAlertId(),
      alertType: 'PRICE_ANOMALY',
      severity,
      swarmId: observation.swarmId,

      triggerObservationIds: [observation.observationId],
      listingId: observation.listingId ?? '',

      recommendedAction: observation.recommendedAction,
      recommendedAmount: observation.recommendedAmount,
      estimatedValue: this.estimateOpportunityValue(observation),
      confidence: observation.confidenceScore,
      summary: this.generatePriceAnomalySummary(observation),

      requiresApproval: true,
      approvalDeadline: this.calculateDeadline(observation),
      status: 'PENDING',

      createdAt: now,
      updatedAt: now,
    };
  }

  private calculatePriceAnomalySeverity(obs: Observation): AlertSeverity {
    const discount = obs.discountPercent ?? 0;
    const confidence = obs.confidenceScore;

    if (discount >= 30 && confidence >= 0.9) return 'CRITICAL';
    if (discount >= 20 && confidence >= 0.8) return 'HIGH';
    if (discount >= 15 && confidence >= 0.7) return 'MEDIUM';
    return 'LOW';
  }

  private generatePriceAnomalySummary(obs: Observation): string {
    const discount = obs.discountPercent ?? 0;
    return `${obs.itemTitle?.substring(0, 50) || 'Item'} is ${discount.toFixed(0)}% below market. ` +
      `Current: $${obs.currentPrice.toFixed(2)} | ` +
      `Recommend: ${obs.recommendedAction} @ $${obs.recommendedAmount?.toFixed(2) ?? 'N/A'}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATTERN MATCHING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if observation matches any saved pattern rules.
   */
  checkPatternMatch(observation: Observation): Alert | null {
    const rules = this.config.patternMatchRules.filter(r => r.enabled);

    for (const rule of rules) {
      if (this.matchesRule(observation, rule)) {
        const now = new Date().toISOString();

        return {
          alertId: generateAlertId(),
          alertType: 'PATTERN_MATCH',
          severity: this.rulePriorityToSeverity(rule.priority),
          swarmId: observation.swarmId,

          triggerObservationIds: [observation.observationId],
          listingId: observation.listingId ?? '',

          recommendedAction: observation.recommendedAction,
          recommendedAmount: observation.recommendedAmount,
          estimatedValue: this.estimateOpportunityValue(observation),
          confidence: observation.confidenceScore,
          summary: `Matched rule "${rule.name}": ${rule.description || observation.reasoning}`,

          requiresApproval: rule.action !== 'LOG_ONLY',
          approvalDeadline: this.calculateDeadline(observation),
          status: 'PENDING',

          createdAt: now,
          updatedAt: now,
        };
      }
    }

    return null;
  }

  private matchesRule(obs: Observation, rule: PatternRule): boolean {
    const conditions = rule.conditions;

    // Check discount threshold
    if (conditions.minDiscountPercent !== undefined) {
      if ((obs.discountPercent ?? 0) < conditions.minDiscountPercent) {
        return false;
      }
    }

    // Check confidence
    if (conditions.minConfidence !== undefined) {
      if (obs.confidenceScore < conditions.minConfidence) {
        return false;
      }
    }

    // Check title keywords
    if (conditions.titleKeywords?.length) {
      const title = obs.itemTitle?.toLowerCase() ?? '';
      const hasKeyword = conditions.titleKeywords.some(kw => title.includes(kw.toLowerCase()));
      if (!hasKeyword) return false;
    }

    // Check time remaining
    if (conditions.maxTimeRemaining !== undefined) {
      const hoursRemaining = (obs.timeRemaining ?? Infinity) / 3600;
      if (hoursRemaining > conditions.maxTimeRemaining) {
        return false;
      }
    }

    // Check listing formats
    if (conditions.listingFormats?.length) {
      const metadata = obs.metadata as { isAuction?: boolean; hasBestOffer?: boolean } | undefined;
      const isAuction = metadata?.isAuction;
      const hasBestOffer = metadata?.hasBestOffer;

      const matchesFormat = conditions.listingFormats.some(format => {
        if (format === 'AUCTION' && isAuction) return true;
        if (format === 'BEST_OFFER' && hasBestOffer) return true;
        if (format === 'FIXED_PRICE' && !isAuction) return true;
        return false;
      });

      if (!matchesFormat) return false;
    }

    return true;
  }

  private rulePriorityToSeverity(priority: number): AlertSeverity {
    if (priority >= 8) return 'CRITICAL';
    if (priority >= 6) return 'HIGH';
    if (priority >= 4) return 'MEDIUM';
    return 'LOW';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-AGENT CONSENSUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if multiple agents have flagged the same listing.
   *
   * Consensus is reached when:
   * - N agents (configurable) recommend action on same listing
   * - Average confidence meets threshold
   */
  async checkMultiAgentConsensus(observation: Observation): Promise<Alert | null> {
    if (!observation.listingId) return null;

    // Get all observations for this listing
    const listingObs = getListingObservations(observation.listingId);

    // Filter to actionable recommendations
    const actionableObs = listingObs.filter(obs =>
      ['BID', 'OFFER'].includes(obs.recommendedAction)
    );

    // Get unique agents
    const uniqueAgents = new Set(actionableObs.map(obs => obs.agentId));

    // Check if we have enough agents
    if (uniqueAgents.size < this.config.minAgentsForConsensus) {
      return null;
    }

    // Calculate average confidence
    const avgConfidence = actionableObs.reduce((sum, obs) => sum + obs.confidenceScore, 0)
      / actionableObs.length;

    if (avgConfidence < this.config.confidenceThreshold) {
      return null;
    }

    // Determine consensus action (most common recommendation)
    const actionCounts = new Map<RecommendedAction, number>();
    for (const obs of actionableObs) {
      const count = actionCounts.get(obs.recommendedAction) ?? 0;
      actionCounts.set(obs.recommendedAction, count + 1);
    }

    let consensusAction: RecommendedAction = 'WATCH';
    let maxCount = 0;
    for (const [action, count] of actionCounts) {
      if (count > maxCount) {
        maxCount = count;
        consensusAction = action;
      }
    }

    // Calculate consensus amount (average of recommendations)
    const amounts = actionableObs
      .filter(obs => obs.recommendedAmount !== undefined)
      .map(obs => obs.recommendedAmount!);
    const consensusAmount = amounts.length > 0
      ? amounts.reduce((sum, a) => sum + a, 0) / amounts.length
      : undefined;

    const now = new Date().toISOString();

    return {
      alertId: generateAlertId(),
      alertType: 'MULTI_AGENT_CONSENSUS',
      severity: this.calculateConsensusSeverity(uniqueAgents.size, avgConfidence),
      swarmId: observation.swarmId,

      triggerObservationIds: actionableObs.map(obs => obs.observationId),
      listingId: observation.listingId,

      recommendedAction: consensusAction,
      recommendedAmount: consensusAmount,
      estimatedValue: this.estimateOpportunityValue(observation),
      confidence: avgConfidence,
      summary: `${uniqueAgents.size} agents agree: ${consensusAction} @ $${consensusAmount?.toFixed(2) ?? 'N/A'} ` +
        `(${(avgConfidence * 100).toFixed(0)}% avg confidence)`,

      requiresApproval: true,
      approvalDeadline: this.calculateDeadline(observation),
      status: 'PENDING',

      createdAt: now,
      updatedAt: now,
    };
  }

  private calculateConsensusSeverity(agentCount: number, avgConfidence: number): AlertSeverity {
    // More agents + higher confidence = higher severity
    const score = agentCount * avgConfidence;

    if (score >= 4.5) return 'CRITICAL';
    if (score >= 3.5) return 'HIGH';
    if (score >= 2.5) return 'MEDIUM';
    return 'LOW';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private estimateOpportunityValue(obs: Observation): number {
    // Estimate potential savings
    const currentPrice = obs.currentPrice;
    const marketAvg = obs.marketAverage ?? currentPrice;
    const discount = obs.discountPercent ?? 0;

    // Value = potential savings + confidence bonus
    return (marketAvg - currentPrice) + (currentPrice * discount / 100 * obs.confidenceScore);
  }

  private calculateDeadline(obs: Observation): string {
    // If auction has time remaining, use that
    if (obs.timeRemaining && obs.timeRemaining > 0) {
      const deadline = new Date(Date.now() + obs.timeRemaining * 1000);
      return deadline.toISOString();
    }

    // Otherwise, use config default
    const hours = this.config.alertExpiryHours;
    const deadline = new Date(Date.now() + hours * 60 * 60 * 1000);
    return deadline.toISOString();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clear recent alerts cache (for testing or manual reset).
   */
  clearCache(): void {
    this.recentAlerts.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let engineInstance: AlertEngine | null = null;

/**
 * Get the alert engine singleton.
 */
export function getAlertEngine(config?: Partial<AlertConfig>): AlertEngine {
  if (!engineInstance) {
    engineInstance = new AlertEngine(config);
  } else if (config) {
    engineInstance.updateConfig(config);
  }
  return engineInstance;
}

/**
 * Create a fresh alert engine (for testing).
 */
export function createAlertEngine(config?: Partial<AlertConfig>): AlertEngine {
  return new AlertEngine(config);
}
