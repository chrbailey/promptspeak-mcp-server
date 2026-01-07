// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - HOLD MANAGER
// ═══════════════════════════════════════════════════════════════════════════
// The Hold Manager implements human-in-the-loop approval for:
// - High-risk tool calls that need human review
// - Drift predictions that exceed thresholds
// - MCP validation pending states
// - Circuit breaker overrides
// ═══════════════════════════════════════════════════════════════════════════

import type {
  HoldRequest,
  HoldDecision,
  HoldDecider,
  HoldReason,
  HoldState,
  ExecuteRequest,
  ExecutionControlConfig,
  LegalHoldConfig,
  LegalPreFlightResults,
  LegalDeadlineType,
  DeadlineRiskEvidence,
  PrivilegeRiskEvidence,
  FabricationFlagEvidence,
  JurisdictionMismatchEvidence,
  JudgePreferenceEvidence,
  CitationUnverifiedEvidence,
} from '../types/index.js';
import { generateAuditId } from '../utils/hash.js';

const DEFAULT_HOLD_TIMEOUT_MS = 300000; // 5 minutes

const DEFAULT_EXECUTION_CONTROL: ExecutionControlConfig = {
  // Pre-execution blocking - ALL ENABLED BY DEFAULT
  enableCircuitBreakerCheck: true,
  enablePreFlightDriftPrediction: true,
  enableBaselineComparison: true,

  // Hold behavior
  holdOnDriftPrediction: true,  // Hold for human review instead of hard block
  holdOnLowConfidence: true,
  holdOnForbiddenWithOverride: false,  // ⛔ is hard block by default
  holdTimeoutMs: DEFAULT_HOLD_TIMEOUT_MS,

  // Thresholds
  driftPredictionThreshold: 0.25,  // Matches circuit breaker default
  baselineDeviationThreshold: 0.30,

  // MCP validation
  enableMcpValidation: true,
  mcpValidationTools: [],  // Operator configures which tools need MCP validation

  // Immediate action on post-audit
  haltOnCriticalDrift: true,
  haltOnHighDrift: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL HOLD CONFIGURATION
// Legal domain (◇) frames require special handling for:
// - Malpractice risk (bar discipline, sanctions)
// - Privilege waiver (permanent, catastrophic)
// - Court deadlines (jurisdictional, non-recoverable)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LEGAL_HOLD_CONFIG: LegalHoldConfig = {
  enableLegalHolds: true,

  citationVerification: {
    enabled: true,
    databases: ['westlaw', 'lexis', 'courtlistener'],
    verificationTimeoutMs: 30000,
    cacheResults: true,
  },

  deadlineMonitoring: {
    enabled: true,
    warningThresholdHours: 168,    // 7 days
    criticalThresholdHours: 24,    // 24 hours
    calendarIntegration: undefined,
  },

  judgePreference: {
    enabled: true,
    dataStalenessThresholdDays: 365,
    minimumConfidenceThreshold: 0.5,
  },

  jurisdictionCheck: {
    enabled: true,
    strictMode: false,  // Allow persuasive authority by default
  },

  privilegeDetection: {
    enabled: true,
    sensitivityLevel: 'high',      // Default to high for safety
    alwaysHoldForExternal: true,   // Always hold if destination is external
  },

  fabricationDetection: {
    enabled: true,
    semanticEntropyThreshold: 0.6,
    requireSourceVerification: true,
  },

  notifications: {
    deadlineAlertEmails: [],
    privilegeAlertEmails: [],
    escalationEmails: [],
  },
};

// Legal domain symbol for frame detection
const LEGAL_DOMAIN_SYMBOL = '◇';

// Hold reasons that should NEVER auto-expire (require human decision)
const NEVER_EXPIRE_REASONS: HoldReason[] = ['legal_privilege_risk'];

// Critical deadline types that escalate severity
const CRITICAL_DEADLINE_TYPES: LegalDeadlineType[] = [
  'statute_of_limitations',
  'appellate_filing',
];

export class HoldManager {
  private pendingHolds: Map<string, HoldRequest> = new Map();
  private holdHistory: HoldDecision[] = [];
  private config: ExecutionControlConfig;
  private legalConfig: LegalHoldConfig;

  // Callbacks for external notification
  private onHoldCreated?: (hold: HoldRequest) => void;
  private onHoldDecided?: (decision: HoldDecision) => void;
  private onLegalHoldEscalation?: (hold: HoldRequest, reason: string) => void;

  constructor(
    config?: Partial<ExecutionControlConfig>,
    legalConfig?: Partial<LegalHoldConfig>
  ) {
    this.config = { ...DEFAULT_EXECUTION_CONTROL, ...config };
    this.legalConfig = { ...DEFAULT_LEGAL_HOLD_CONFIG, ...legalConfig };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update execution control configuration.
   * This is the operator's "knob" for controlling hold behavior.
   */
  setConfig(config: Partial<ExecutionControlConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): ExecutionControlConfig {
    return { ...this.config };
  }

  /**
   * Update legal hold configuration.
   */
  setLegalConfig(config: Partial<LegalHoldConfig>): void {
    this.legalConfig = { ...this.legalConfig, ...config };
  }

  /**
   * Get current legal hold configuration.
   */
  getLegalConfig(): LegalHoldConfig {
    return { ...this.legalConfig };
  }

  /**
   * Set callback for when a hold is created (for MCP notification).
   */
  setOnHoldCreated(callback: (hold: HoldRequest) => void): void {
    this.onHoldCreated = callback;
  }

  /**
   * Set callback for legal hold escalation (deadline missed, privilege stale).
   */
  setOnLegalHoldEscalation(callback: (hold: HoldRequest, reason: string) => void): void {
    this.onLegalHoldEscalation = callback;
  }

  /**
   * Set callback for when a hold is decided.
   */
  setOnHoldDecided(callback: (decision: HoldDecision) => void): void {
    this.onHoldDecided = callback;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HOLD CREATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a hold request for human review.
   *
   * @param customExpiryMs - Optional custom expiry time in ms (used for deadline_risk)
   *                         Pass Infinity for holds that should NEVER expire (privilege_risk)
   */
  createHold(
    request: ExecuteRequest,
    reason: HoldReason,
    severity: 'low' | 'medium' | 'high' | 'critical',
    evidence: Record<string, unknown>,
    customExpiryMs?: number
  ): HoldRequest {
    const holdId = `hold_${generateAuditId()}`;
    const now = Date.now();

    // Determine expiry time
    let expiresAt: number;
    if (NEVER_EXPIRE_REASONS.includes(reason)) {
      // Privilege risk and other critical legal holds NEVER auto-expire
      expiresAt = Infinity;
    } else if (customExpiryMs !== undefined) {
      // Custom expiry (e.g., deadline-based)
      expiresAt = now + customExpiryMs;
    } else {
      // Default timeout
      expiresAt = now + this.config.holdTimeoutMs;
    }

    const hold: HoldRequest = {
      holdId,
      agentId: request.agentId,
      frame: request.frame,
      tool: request.tool,
      arguments: request.arguments,
      reason,
      severity,
      createdAt: now,
      expiresAt,
      state: 'pending',
      driftScore: evidence['driftScore'] as number | undefined,
      predictedDrift: evidence['predictedDrift'] as number | undefined,
      evidence,
    };

    this.pendingHolds.set(holdId, hold);

    // Notify via callback
    if (this.onHoldCreated) {
      this.onHoldCreated(hold);
    }

    return hold;
  }

  /**
   * Check if a request should be held based on configuration.
   * Returns null if no hold needed, or the reason if hold required.
   */
  shouldHold(
    request: ExecuteRequest,
    preFlightResults: {
      circuitBreakerBlocked?: boolean;
      circuitBreakerReason?: string;
      predictedDriftScore?: number;
      baselineDeviation?: number;
      confidenceScore?: number;
      isForbidden?: boolean;
      requiresMcpValidation?: boolean;
    }
  ): { reason: HoldReason; severity: 'low' | 'medium' | 'high' | 'critical'; evidence: Record<string, unknown> } | null {
    // Check MCP validation first
    if (this.config.enableMcpValidation && preFlightResults.requiresMcpValidation) {
      return {
        reason: 'mcp_validation_pending',
        severity: 'medium',
        evidence: { tool: request.tool, requiresMcpValidation: true },
      };
    }

    // Check drift prediction
    if (
      this.config.enablePreFlightDriftPrediction &&
      this.config.holdOnDriftPrediction &&
      preFlightResults.predictedDriftScore !== undefined &&
      preFlightResults.predictedDriftScore > this.config.driftPredictionThreshold
    ) {
      const severity = preFlightResults.predictedDriftScore > 0.5 ? 'critical' :
                       preFlightResults.predictedDriftScore > 0.35 ? 'high' : 'medium';
      return {
        reason: 'pre_flight_drift_prediction',
        severity,
        evidence: {
          predictedDrift: preFlightResults.predictedDriftScore,
          threshold: this.config.driftPredictionThreshold,
        },
      };
    }

    // Check baseline deviation
    if (
      this.config.enableBaselineComparison &&
      preFlightResults.baselineDeviation !== undefined &&
      preFlightResults.baselineDeviation > this.config.baselineDeviationThreshold
    ) {
      return {
        reason: 'drift_threshold_exceeded',
        severity: 'high',
        evidence: {
          baselineDeviation: preFlightResults.baselineDeviation,
          threshold: this.config.baselineDeviationThreshold,
        },
      };
    }

    // Check low confidence
    if (
      this.config.holdOnLowConfidence &&
      preFlightResults.confidenceScore !== undefined &&
      preFlightResults.confidenceScore < 0.7  // Hardcoded low confidence threshold
    ) {
      return {
        reason: 'confidence_below_threshold',
        severity: 'low',
        evidence: {
          confidenceScore: preFlightResults.confidenceScore,
          threshold: 0.7,
        },
      };
    }

    // Check forbidden with override
    if (this.config.holdOnForbiddenWithOverride && preFlightResults.isForbidden) {
      return {
        reason: 'forbidden_constraint',
        severity: 'critical',
        evidence: { isForbidden: true, allowOverride: true },
      };
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEGAL DOMAIN HOLDS (◇ Frame Detection)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if frame is in legal domain (◇).
   */
  isLegalDomainFrame(frame: string): boolean {
    return frame.includes(LEGAL_DOMAIN_SYMBOL);
  }

  /**
   * Calculate deadline hold severity based on time remaining.
   * Severity escalates as deadline approaches.
   */
  private calculateDeadlineSeverity(
    hoursRemaining: number,
    deadlineType: LegalDeadlineType
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Past deadline = always critical
    if (hoursRemaining < 0) return 'critical';

    const isCriticalType = CRITICAL_DEADLINE_TYPES.includes(deadlineType);
    const criticalHours = this.legalConfig.deadlineMonitoring.criticalThresholdHours;
    const warningHours = this.legalConfig.deadlineMonitoring.warningThresholdHours;

    if (hoursRemaining < criticalHours) {
      return 'critical';
    } else if (hoursRemaining < criticalHours * 3) {  // 72 hours by default
      return isCriticalType ? 'critical' : 'high';
    } else if (hoursRemaining < warningHours) {
      return isCriticalType ? 'high' : 'medium';
    } else {
      return isCriticalType ? 'medium' : 'low';
    }
  }

  /**
   * Calculate custom expiry for deadline holds.
   * Expires 2 hours before deadline (minimum 15 minutes).
   */
  private calculateDeadlineHoldExpiry(deadline: DeadlineRiskEvidence): number {
    const deadlineMs = deadline.deadlineTimestamp;
    const now = Date.now();

    // Hold expires 2 hours before deadline (minimum 15 minutes from now)
    const twoHoursBefore = deadlineMs - (2 * 60 * 60 * 1000);
    const fifteenMinutes = now + (15 * 60 * 1000);

    // Take the later of: 15 min from now, or 2 hours before deadline
    // But never after the deadline itself
    return Math.min(
      Math.max(twoHoursBefore, fifteenMinutes),
      deadlineMs
    );
  }

  /**
   * Check if a legal domain request should be held.
   * Called for frames containing ◇ (legal domain symbol).
   *
   * Checks are ordered by severity (critical first):
   * 1. privilege_risk (NEVER auto-expires)
   * 2. deadline_risk (dynamic severity)
   * 3. fabrication_flag
   * 4. citation_unverified
   * 5. jurisdiction_mismatch
   * 6. judge_preference_unknown
   *
   * @returns null if no legal hold needed, otherwise hold details with optional custom expiry
   */
  shouldHoldLegal(
    request: ExecuteRequest,
    legalResults: LegalPreFlightResults
  ): {
    reason: HoldReason;
    severity: 'low' | 'medium' | 'high' | 'critical';
    evidence: Record<string, unknown>;
    customExpiryMs?: number;
  } | null {
    // Only applies to legal domain frames (◇)
    if (!legalResults.isLegalDomain) return null;
    if (!this.legalConfig.enableLegalHolds) return null;

    // ═══════════════════════════════════════════════════════════════════════
    // 1. PRIVILEGE RISK - Always critical, NEVER auto-expires
    // Privilege waiver is often permanent and catastrophic.
    // Bar Rule 1.6 (Confidentiality) violations can result in disbarment.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.privilegeDetection.enabled &&
      legalResults.privilegeCheck &&
      legalResults.privilegeCheck.riskScore > 0.5
    ) {
      const privilegeEvidence = legalResults.privilegeCheck.privilegeIndicators[0];
      return {
        reason: 'legal_privilege_risk',
        severity: 'critical',
        evidence: {
          ...privilegeEvidence,
          riskScore: legalResults.privilegeCheck.riskScore,
          indicators: legalResults.privilegeCheck.privilegeIndicators.length,
          // Include bar discipline warning
          barRiskLevel: 'severe',
          malpracticeExposure: true,
          neverAutoExpire: true,
        },
        // Note: createHold will set expiresAt to Infinity for privilege_risk
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. DEADLINE RISK - Dynamic severity based on time remaining
    // Filing deadlines are often jurisdictional (cannot be cured).
    // Statute of limitations misses waive client's entire claim.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.deadlineMonitoring.enabled &&
      legalResults.deadlineCheck?.criticalDeadline
    ) {
      const deadline = legalResults.deadlineCheck.criticalDeadline;
      const severity = this.calculateDeadlineSeverity(
        deadline.hoursRemaining,
        deadline.deadlineType
      );
      const customExpiryMs = this.calculateDeadlineHoldExpiry(deadline) - Date.now();

      return {
        reason: 'legal_deadline_risk',
        severity,
        evidence: {
          ...deadline,
          nearbyDeadlines: legalResults.deadlineCheck.nearbyDeadlines.length,
          barRiskLevel: deadline.hoursRemaining < 0 ? 'severe' : 'high',
          malpracticeExposure: true,
        },
        customExpiryMs: Math.max(customExpiryMs, 15 * 60 * 1000), // Min 15 minutes
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. FABRICATION FLAG - Critical for citations, high otherwise
    // Fabricated citations violate Rule 3.3 (Candor toward tribunal).
    // Can result in sanctions, malpractice, and bar discipline.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.fabricationDetection.enabled &&
      legalResults.fabricationCheck &&
      legalResults.fabricationCheck.overallScore > this.legalConfig.fabricationDetection.semanticEntropyThreshold
    ) {
      const hasCitationFabrication = legalResults.fabricationCheck.flaggedContent
        .some(f => f.fabricationType === 'fabricated_citation');
      const fabricationEvidence = legalResults.fabricationCheck.flaggedContent[0];

      return {
        reason: 'legal_fabrication_flag',
        severity: hasCitationFabrication ? 'critical' : 'high',
        evidence: {
          ...fabricationEvidence,
          overallScore: legalResults.fabricationCheck.overallScore,
          flaggedItems: legalResults.fabricationCheck.flaggedContent.length,
          hasCitationFabrication,
          barRiskLevel: hasCitationFabrication ? 'severe' : 'high',
          malpracticeExposure: true,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. CITATION UNVERIFIED - High severity
    // Unverified citations risk Rule 3.3 violations.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.citationVerification.enabled &&
      legalResults.citationVerification &&
      legalResults.citationVerification.unverifiedCitations.length > 0
    ) {
      return {
        reason: 'legal_citation_unverified',
        severity: 'high',
        evidence: {
          ...legalResults.citationVerification.evidence,
          unverifiedCount: legalResults.citationVerification.unverifiedCitations.length,
          unverifiedCitations: legalResults.citationVerification.unverifiedCitations,
          verificationScore: legalResults.citationVerification.verificationScore,
          barRiskLevel: 'high',
          malpracticeExposure: true,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. JURISDICTION MISMATCH - High for binding issues, medium otherwise
    // Citing non-binding authority as binding violates candor rules.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.jurisdictionCheck.enabled &&
      legalResults.jurisdictionCheck &&
      legalResults.jurisdictionCheck.mismatches.length > 0
    ) {
      const hasBindingMismatch = legalResults.jurisdictionCheck.mismatches.some(
        m => m.mismatchType === 'wrong_circuit' || m.mismatchType === 'wrong_state'
      );
      const mismatchEvidence = legalResults.jurisdictionCheck.mismatches[0];

      return {
        reason: 'legal_jurisdiction_mismatch',
        severity: hasBindingMismatch ? 'high' : 'medium',
        evidence: {
          ...mismatchEvidence,
          totalMismatches: legalResults.jurisdictionCheck.mismatches.length,
          hasBindingMismatch,
          barRiskLevel: hasBindingMismatch ? 'moderate' : 'low',
          malpracticeExposure: hasBindingMismatch,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. JUDGE PREFERENCE UNKNOWN - Medium severity (low bar risk)
    // Not a rule violation, but affects case strategy.
    // ═══════════════════════════════════════════════════════════════════════
    if (
      this.legalConfig.judgePreference.enabled &&
      legalResults.judgePreference &&
      !legalResults.judgePreference.preferenceDataExists
    ) {
      // Escalate if hearing is imminent
      const hasImminentHearing = legalResults.judgePreference.evidence?.nextHearing &&
        legalResults.judgePreference.evidence.nextHearing.hoursAway < 72;

      return {
        reason: 'legal_judge_preference_unknown',
        severity: hasImminentHearing ? 'high' : 'medium',
        evidence: {
          ...legalResults.judgePreference.evidence,
          judgeId: legalResults.judgePreference.judgeId,
          dataConfidence: legalResults.judgePreference.dataConfidence,
          hasImminentHearing,
          barRiskLevel: 'none',
          malpracticeExposure: false,
        },
      };
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HOLD DECISIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Approve a held request (human decision).
   */
  approveHold(
    holdId: string,
    decidedBy: HoldDecider = 'human',
    reason: string = 'Approved by operator',
    modifiedFrame?: string,
    modifiedArgs?: Record<string, unknown>
  ): HoldDecision | null {
    const hold = this.pendingHolds.get(holdId);
    if (!hold) return null;

    hold.state = 'approved';
    this.pendingHolds.delete(holdId);

    const decision: HoldDecision = {
      holdId,
      state: 'approved',
      decidedBy,
      decidedAt: Date.now(),
      reason,
      modifiedFrame,
      modifiedArgs,
    };

    this.holdHistory.push(decision);
    if (this.onHoldDecided) {
      this.onHoldDecided(decision);
    }

    return decision;
  }

  /**
   * Reject a held request (human decision).
   */
  rejectHold(
    holdId: string,
    decidedBy: HoldDecider = 'human',
    reason: string = 'Rejected by operator'
  ): HoldDecision | null {
    const hold = this.pendingHolds.get(holdId);
    if (!hold) return null;

    hold.state = 'rejected';
    this.pendingHolds.delete(holdId);

    const decision: HoldDecision = {
      holdId,
      state: 'rejected',
      decidedBy,
      decidedAt: Date.now(),
      reason,
    };

    this.holdHistory.push(decision);
    if (this.onHoldDecided) {
      this.onHoldDecided(decision);
    }

    return decision;
  }

  /**
   * Check for expired holds and auto-reject them.
   *
   * SPECIAL HANDLING:
   * - legal_privilege_risk holds NEVER auto-expire (expiresAt = Infinity)
   * - Stale privilege holds (>24 hours) trigger escalation notifications
   * - legal_deadline_risk holds may have custom expiry times
   */
  processExpiredHolds(): HoldDecision[] {
    const now = Date.now();
    const expired: HoldDecision[] = [];
    const STALE_PRIVILEGE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

    for (const [holdId, hold] of this.pendingHolds) {
      // NEVER auto-expire privilege_risk holds
      if (NEVER_EXPIRE_REASONS.includes(hold.reason)) {
        // Check if stale and trigger escalation (but don't expire)
        const age = now - hold.createdAt;
        if (age > STALE_PRIVILEGE_THRESHOLD_MS && this.onLegalHoldEscalation) {
          this.onLegalHoldEscalation(
            hold,
            `Privilege risk hold pending for ${Math.round(age / (60 * 60 * 1000))} hours without decision`
          );
        }
        continue; // Do NOT expire
      }

      // Normal expiry handling for other holds
      if (now > hold.expiresAt) {
        // For deadline_risk, add special message
        let expiryReason = 'Hold expired without decision';
        if (hold.reason === 'legal_deadline_risk') {
          const hoursRemaining = hold.evidence['hoursRemaining'] as number | undefined;
          if (hoursRemaining !== undefined && hoursRemaining < 0) {
            expiryReason = `CRITICAL: Deadline has passed. Hold expired. Deadline was ${Math.abs(hoursRemaining).toFixed(1)} hours ago.`;
          } else {
            expiryReason = `Deadline hold expired. Review required before proceeding.`;
          }
        }

        const decision = this.rejectHold(holdId, 'timeout', expiryReason);
        if (decision) {
          decision.state = 'expired';
          expired.push(decision);
        }
      }
    }

    return expired;
  }

  /**
   * Update deadline hold severities as deadlines approach.
   * Should be called periodically (e.g., every minute).
   */
  updateDeadlineHoldSeverities(): void {
    for (const hold of this.pendingHolds.values()) {
      if (hold.reason === 'legal_deadline_risk') {
        const deadlineTimestamp = hold.evidence['deadlineTimestamp'] as number | undefined;
        const deadlineType = hold.evidence['deadlineType'] as LegalDeadlineType | undefined;

        if (deadlineTimestamp === undefined || deadlineType === undefined) continue;

        const hoursRemaining = (deadlineTimestamp - Date.now()) / (60 * 60 * 1000);

        // Update hours remaining in evidence
        hold.evidence['hoursRemaining'] = hoursRemaining;

        // Recalculate severity
        const newSeverity = this.calculateDeadlineSeverity(hoursRemaining, deadlineType);

        // Update if severity increased
        const severityOrder = { 'low': 0, 'medium': 1, 'high': 2, 'critical': 3 };
        if (severityOrder[newSeverity] > severityOrder[hold.severity]) {
          hold.severity = newSeverity;

          // Trigger escalation notification
          if (this.onLegalHoldEscalation) {
            this.onLegalHoldEscalation(
              hold,
              `Deadline hold severity escalated to ${newSeverity}. ${hoursRemaining.toFixed(1)} hours remaining.`
            );
          }
        }

        // Check for missed deadline
        const deadlineMissed = hold.evidence['deadlineMissed'] as boolean | undefined;
        if (hoursRemaining < 0 && !deadlineMissed) {
          hold.evidence['deadlineMissed'] = true;
          hold.evidence['missedAt'] = Date.now();

          if (this.onLegalHoldEscalation) {
            this.onLegalHoldEscalation(
              hold,
              `CRITICAL: Deadline MISSED. Was due ${Math.abs(hoursRemaining).toFixed(1)} hours ago.`
            );
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a pending hold by ID.
   */
  getHold(holdId: string): HoldRequest | undefined {
    return this.pendingHolds.get(holdId);
  }

  /**
   * Get all pending holds.
   */
  getPendingHolds(): HoldRequest[] {
    return Array.from(this.pendingHolds.values());
  }

  /**
   * Get pending holds for an agent.
   */
  getAgentPendingHolds(agentId: string): HoldRequest[] {
    return Array.from(this.pendingHolds.values())
      .filter(h => h.agentId === agentId);
  }

  /**
   * Get hold decision history.
   */
  getHoldHistory(limit: number = 100): HoldDecision[] {
    return this.holdHistory.slice(-limit);
  }

  /**
   * Get hold statistics.
   */
  getStats(): {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    byReason: Record<HoldReason, number>;
    legalHolds: {
      total: number;
      privilegeRisk: number;
      deadlineRisk: number;
      fabricationFlag: number;
      citationUnverified: number;
      jurisdictionMismatch: number;
      judgePreferenceUnknown: number;
    };
  } {
    const byReason: Record<HoldReason, number> = {
      // System hold reasons
      circuit_breaker_open: 0,
      drift_threshold_exceeded: 0,
      pre_flight_drift_prediction: 0,
      human_approval_required: 0,
      mcp_validation_pending: 0,
      forbidden_constraint: 0,
      confidence_below_threshold: 0,
      // Agent orchestration hold reasons
      agent_spawn_approval: 0,
      agent_resource_exceeded: 0,
      // Legal hold reasons
      legal_citation_unverified: 0,
      legal_deadline_risk: 0,
      legal_judge_preference_unknown: 0,
      legal_jurisdiction_mismatch: 0,
      legal_privilege_risk: 0,
      legal_fabrication_flag: 0,
    };

    for (const hold of this.pendingHolds.values()) {
      byReason[hold.reason]++;
    }

    // Calculate legal hold summary
    const legalHolds = {
      total:
        byReason.legal_citation_unverified +
        byReason.legal_deadline_risk +
        byReason.legal_judge_preference_unknown +
        byReason.legal_jurisdiction_mismatch +
        byReason.legal_privilege_risk +
        byReason.legal_fabrication_flag,
      privilegeRisk: byReason.legal_privilege_risk,
      deadlineRisk: byReason.legal_deadline_risk,
      fabricationFlag: byReason.legal_fabrication_flag,
      citationUnverified: byReason.legal_citation_unverified,
      jurisdictionMismatch: byReason.legal_jurisdiction_mismatch,
      judgePreferenceUnknown: byReason.legal_judge_preference_unknown,
    };

    return {
      pending: this.pendingHolds.size,
      approved: this.holdHistory.filter(d => d.state === 'approved').length,
      rejected: this.holdHistory.filter(d => d.state === 'rejected').length,
      expired: this.holdHistory.filter(d => d.state === 'expired').length,
      byReason,
      legalHolds,
    };
  }

  /**
   * Get legal holds only.
   */
  getLegalHolds(): HoldRequest[] {
    return Array.from(this.pendingHolds.values()).filter(h =>
      h.reason.startsWith('legal_')
    );
  }

  /**
   * Get critical legal holds requiring immediate attention.
   * Returns privilege_risk holds and deadline_risk holds with < 24 hours remaining.
   */
  getCriticalLegalHolds(): HoldRequest[] {
    return Array.from(this.pendingHolds.values()).filter(h => {
      if (h.reason === 'legal_privilege_risk') return true;
      if (h.reason === 'legal_deadline_risk') {
        const hoursRemaining = h.evidence['hoursRemaining'] as number | undefined;
        return hoursRemaining !== undefined && hoursRemaining < 24;
      }
      return h.severity === 'critical' && h.reason.startsWith('legal_');
    });
  }

  /**
   * Check if a tool requires MCP validation.
   */
  requiresMcpValidation(toolName: string): boolean {
    if (!this.config.enableMcpValidation) return false;

    // Check exact match or wildcard patterns
    for (const pattern of this.config.mcpValidationTools) {
      if (pattern === '*') return true;
      if (pattern === toolName) return true;
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(toolName)) return true;
      }
    }
    return false;
  }

  /**
   * Clear all holds.
   */
  clearAll(): void {
    this.pendingHolds.clear();
    this.holdHistory = [];
  }
}

// Singleton instance
export const holdManager = new HoldManager();
