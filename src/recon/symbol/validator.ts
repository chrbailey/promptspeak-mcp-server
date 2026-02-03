/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MARINE RECON SYMBOL VALIDATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive validation system for Marine Recon symbols.
 * Used by ralph-loop for periodic validation and by the veto gate for
 * pre-send checks.
 *
 * Validation Categories:
 * 1. Structural - Symbol format and required fields
 * 2. Constraint - Red line and constraint compliance
 * 3. Drift - Position drift from original
 * 4. Persona - Performer consistency
 * 5. Integrity - Hash and version verification
 * 6. Operational - Mission-specific rules
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';
import {
  MarineReconSymbol,
  ValidationCheck,
  ValidationResult,
  VetoDecision,
  AlertLevel,
  ManipulationTactic,
  DetectedTactic,
} from '../types';
import { generateSymbolHash } from './schema';

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Severity of a validation issue.
 */
export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * A validation issue found during checks.
 */
export interface ValidationIssue {
  /** Unique issue code */
  code: string;

  /** Issue category */
  category: 'structural' | 'constraint' | 'drift' | 'persona' | 'integrity' | 'operational';

  /** Severity */
  severity: ValidationSeverity;

  /** Human-readable message */
  message: string;

  /** Field path (if applicable) */
  field_path?: string;

  /** Current value (if applicable) */
  current_value?: unknown;

  /** Expected/threshold value (if applicable) */
  expected_value?: unknown;

  /** Recommended action */
  recommended_action?: string;
}

/**
 * Complete validation report.
 */
export interface ValidationReport {
  /** Symbol being validated */
  symbol_id: string;

  /** Symbol version at validation time */
  symbol_version: number;

  /** Validation timestamp */
  timestamp: string;

  /** Overall validation passed */
  passed: boolean;

  /** Issues found */
  issues: ValidationIssue[];

  /** Summary by category */
  summary: {
    structural: { passed: boolean; issue_count: number };
    constraint: { passed: boolean; issue_count: number };
    drift: { passed: boolean; issue_count: number };
    persona: { passed: boolean; issue_count: number };
    integrity: { passed: boolean; issue_count: number };
    operational: { passed: boolean; issue_count: number };
  };

  /** Recommended alert level */
  recommended_alert_level: AlertLevel;

  /** Recommended actions */
  recommended_actions: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Marine Recon Symbol Validator.
 *
 * Performs comprehensive validation of a symbol, checking structural
 * integrity, constraint compliance, drift detection, persona consistency,
 * and operational rules.
 */
export class ReconSymbolValidator {
  private issues: ValidationIssue[] = [];

  constructor() {
    this.issues = [];
  }

  /**
   * Perform full validation of a symbol.
   */
  validate(symbol: MarineReconSymbol): ValidationReport {
    this.issues = [];
    const timestamp = new Date().toISOString();

    // Run all validation categories
    this.validateStructural(symbol);
    this.validateConstraints(symbol);
    this.validateDrift(symbol);
    this.validatePersona(symbol);
    this.validateIntegrity(symbol);
    this.validateOperational(symbol);

    // Build summary
    const summary = this.buildSummary();

    // Determine overall pass/fail
    const hasCritical = this.issues.some(i => i.severity === 'critical');
    const hasError = this.issues.some(i => i.severity === 'error');
    const passed = !hasCritical && !hasError;

    // Determine recommended alert level
    const recommended_alert_level = this.determineAlertLevel();

    // Generate recommended actions
    const recommended_actions = this.generateRecommendedActions();

    return {
      symbol_id: symbol.symbol_id,
      symbol_version: symbol.version,
      timestamp,
      passed,
      issues: this.issues,
      summary,
      recommended_alert_level,
      recommended_actions,
    };
  }

  /**
   * Quick validation for veto gate decisions.
   */
  quickValidate(symbol: MarineReconSymbol, proposedMessage: string): VetoDecision {
    // Check red lines
    for (const redLine of symbol.mission.constraints.red_lines) {
      if (this.messageViolatesRedLine(proposedMessage, redLine.prohibition)) {
        return 'block';
      }
    }

    // Check drift threshold
    const driftScore = symbol.state.engagement.analyst_state.drift_assessment.drift_score;
    if (driftScore > symbol.config.dual_track.analyst.drift_thresholds.position_drift_max) {
      return 'modify';
    }

    // Check risk score
    const riskScore = symbol.state.engagement.analyst_state.current_risk_score;
    if (riskScore > symbol.config.dual_track.veto_gate.auto_block_threshold) {
      return 'block';
    }
    if (riskScore > (1 - symbol.config.dual_track.veto_gate.auto_approve_threshold)) {
      return 'escalate';
    }

    return 'approve';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRUCTURAL VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validateStructural(symbol: MarineReconSymbol): void {
    // Check symbol_id format
    if (!symbol.symbol_id.startsWith('Ξ.RECON.')) {
      this.addIssue({
        code: 'STRUCT_001',
        category: 'structural',
        severity: 'error',
        message: 'Symbol ID must start with Ξ.RECON.',
        field_path: 'symbol_id',
        current_value: symbol.symbol_id,
        expected_value: 'Ξ.RECON.*',
      });
    }

    // Check symbol_type
    if (symbol.symbol_type !== 'RECON') {
      this.addIssue({
        code: 'STRUCT_002',
        category: 'structural',
        severity: 'critical',
        message: 'Invalid symbol type',
        field_path: 'symbol_type',
        current_value: symbol.symbol_type,
        expected_value: 'RECON',
      });
    }

    // Check version
    if (symbol.version < 1) {
      this.addIssue({
        code: 'STRUCT_003',
        category: 'structural',
        severity: 'error',
        message: 'Version must be >= 1',
        field_path: 'version',
        current_value: symbol.version,
      });
    }

    // Check required mission fields
    if (!symbol.mission.objective.primary_goal) {
      this.addIssue({
        code: 'STRUCT_004',
        category: 'structural',
        severity: 'error',
        message: 'Mission primary goal is required',
        field_path: 'mission.objective.primary_goal',
      });
    }

    // Check red lines exist
    if (!symbol.mission.constraints.red_lines || symbol.mission.constraints.red_lines.length === 0) {
      this.addIssue({
        code: 'STRUCT_005',
        category: 'structural',
        severity: 'warning',
        message: 'No red lines defined - agent may lack critical boundaries',
        field_path: 'mission.constraints.red_lines',
        recommended_action: 'Add default red lines',
      });
    }

    // Check target info
    if (!symbol.mission.target.type || symbol.mission.target.type === 'unknown') {
      this.addIssue({
        code: 'STRUCT_006',
        category: 'structural',
        severity: 'info',
        message: 'Target type is unknown - some validations may be limited',
        field_path: 'mission.target.type',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONSTRAINT VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validateConstraints(symbol: MarineReconSymbol): void {
    const { constraint_status } = symbol.state.engagement.analyst_state;

    // Check for violated constraints
    for (const status of constraint_status) {
      if (status.status === 'violated') {
        // Find the constraint
        const constraint = [
          ...symbol.mission.constraints.hard_constraints,
          ...symbol.mission.constraints.soft_constraints,
        ].find(c => c.id === status.constraint_id);

        const severity: ValidationSeverity = constraint?.on_violation === 'abort' ? 'critical' :
          constraint?.on_violation === 'block' ? 'error' : 'warning';

        this.addIssue({
          code: 'CONST_001',
          category: 'constraint',
          severity,
          message: `Constraint violated: ${constraint?.description || status.constraint_id}`,
          field_path: `state.engagement.analyst_state.constraint_status[${status.constraint_id}]`,
          recommended_action: constraint?.on_violation === 'abort' ? 'Abort mission' :
            constraint?.on_violation === 'block' ? 'Block current action' : 'Log and continue with caution',
        });
      }

      // Check for at-risk constraints
      if (status.status === 'at_risk') {
        this.addIssue({
          code: 'CONST_002',
          category: 'constraint',
          severity: 'warning',
          message: `Constraint at risk: ${status.constraint_id}`,
          field_path: `state.engagement.analyst_state.constraint_status[${status.constraint_id}]`,
          current_value: status.distance_to_violation,
          expected_value: 'distance > 0.2',
          recommended_action: 'Increase caution, consider strategy adjustment',
        });
      }
    }

    // Check red line proximity
    const redLineProximityThreshold = symbol.config.dual_track.analyst.constraint_monitoring.red_line_proximity_alert;
    // This would require deeper analysis of current state vs red lines
    // For now, we check if risk score is high
    if (symbol.state.engagement.analyst_state.current_risk_score > (1 - redLineProximityThreshold)) {
      this.addIssue({
        code: 'CONST_003',
        category: 'constraint',
        severity: 'error',
        message: 'Risk score indicates proximity to red lines',
        current_value: symbol.state.engagement.analyst_state.current_risk_score,
        expected_value: `< ${1 - redLineProximityThreshold}`,
        recommended_action: 'Review recent actions, consider extraction',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DRIFT VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validateDrift(symbol: MarineReconSymbol): void {
    const { drift_assessment } = symbol.state.engagement.analyst_state;
    const { drift_thresholds } = symbol.config.dual_track.analyst;

    // Check position drift
    if (drift_assessment.drift_score > drift_thresholds.position_drift_max) {
      this.addIssue({
        code: 'DRIFT_001',
        category: 'drift',
        severity: 'error',
        message: 'Position drift exceeds threshold',
        field_path: 'state.engagement.analyst_state.drift_assessment.drift_score',
        current_value: drift_assessment.drift_score,
        expected_value: `<= ${drift_thresholds.position_drift_max}`,
        recommended_action: 'Reassert original position, reject further concessions',
      });
    } else if (drift_assessment.drift_score > drift_thresholds.position_drift_max * 0.7) {
      this.addIssue({
        code: 'DRIFT_002',
        category: 'drift',
        severity: 'warning',
        message: 'Position drift approaching threshold',
        field_path: 'state.engagement.analyst_state.drift_assessment.drift_score',
        current_value: drift_assessment.drift_score,
        expected_value: `<= ${drift_thresholds.position_drift_max}`,
        recommended_action: 'Monitor closely, prepare to reassert position',
      });
    }

    // Check concession count
    if (drift_assessment.concessions.length >= drift_thresholds.concession_alert_count) {
      this.addIssue({
        code: 'DRIFT_003',
        category: 'drift',
        severity: 'warning',
        message: `Made ${drift_assessment.concessions.length} concessions (threshold: ${drift_thresholds.concession_alert_count})`,
        field_path: 'state.engagement.analyst_state.drift_assessment.concessions',
        current_value: drift_assessment.concessions.length,
        expected_value: `< ${drift_thresholds.concession_alert_count}`,
        recommended_action: 'No further concessions without commander approval',
      });
    }

    // Check net assessment
    if (drift_assessment.net_assessment === 'losing') {
      this.addIssue({
        code: 'DRIFT_004',
        category: 'drift',
        severity: 'warning',
        message: 'Net assessment indicates losing position',
        field_path: 'state.engagement.analyst_state.drift_assessment.net_assessment',
        current_value: drift_assessment.net_assessment,
        recommended_action: 'Consider strategy change or extraction',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSONA VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validatePersona(symbol: MarineReconSymbol): void {
    const { performer_state } = symbol.state.engagement;
    const { emotional_range } = symbol.config.dual_track.performer;

    // Check persona consistency
    if (performer_state.persona_consistency < 0.7) {
      this.addIssue({
        code: 'PERS_001',
        category: 'persona',
        severity: 'warning',
        message: 'Persona consistency is low - may appear inconsistent to opposing agent',
        field_path: 'state.engagement.performer_state.persona_consistency',
        current_value: performer_state.persona_consistency,
        expected_value: '>= 0.7',
        recommended_action: 'Review recent messages for consistency, adjust future responses',
      });
    }

    // Check improvisation count
    if (performer_state.improvisation_count > 5) {
      this.addIssue({
        code: 'PERS_002',
        category: 'persona',
        severity: 'info',
        message: `High improvisation count (${performer_state.improvisation_count}) - persona may be diverging`,
        field_path: 'state.engagement.performer_state.improvisation_count',
        current_value: performer_state.improvisation_count,
        recommended_action: 'Return to persona baseline behaviors',
      });
    }

    // Check emotional state consistency
    const { emotional_state } = performer_state;
    if (emotional_state.patience <= 0.2 && emotional_state.intensity < 0.5) {
      this.addIssue({
        code: 'PERS_003',
        category: 'persona',
        severity: 'info',
        message: 'Low patience but low emotional intensity - may seem unnatural',
        field_path: 'state.engagement.performer_state.emotional_state',
        recommended_action: 'Allow emotional intensity to rise with frustration',
      });
    }

    // Check frustration threshold
    if (emotional_state.intensity > emotional_range.frustration_threshold) {
      this.addIssue({
        code: 'PERS_004',
        category: 'persona',
        severity: 'warning',
        message: 'Frustration threshold exceeded - consider escalation or extraction',
        field_path: 'state.engagement.performer_state.emotional_state.intensity',
        current_value: emotional_state.intensity,
        expected_value: `<= ${emotional_range.frustration_threshold}`,
        recommended_action: 'Allow natural escalation or graceful exit',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTEGRITY VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validateIntegrity(symbol: MarineReconSymbol): void {
    // Verify hash (note: state changes don't affect hash)
    const expectedHash = generateSymbolHash(symbol);
    if (symbol.symbol_hash !== expectedHash) {
      this.addIssue({
        code: 'INTG_001',
        category: 'integrity',
        severity: 'critical',
        message: 'Symbol hash mismatch - possible tampering or corruption',
        field_path: 'symbol_hash',
        current_value: symbol.symbol_hash,
        expected_value: expectedHash,
        recommended_action: 'Abort mission, reload from trusted source',
      });
    }

    // Check timestamps
    const now = Date.now();
    const missionStart = new Date(symbol.state.engagement.timestamps.mission_start).getTime();
    const lastActivity = new Date(symbol.state.engagement.timestamps.last_activity).getTime();

    if (lastActivity < missionStart) {
      this.addIssue({
        code: 'INTG_002',
        category: 'integrity',
        severity: 'error',
        message: 'Last activity timestamp is before mission start',
        field_path: 'state.engagement.timestamps',
        recommended_action: 'Correct timestamp inconsistency',
      });
    }

    if (lastActivity > now + 60000) { // Allow 1 minute clock skew
      this.addIssue({
        code: 'INTG_003',
        category: 'integrity',
        severity: 'warning',
        message: 'Last activity timestamp is in the future',
        field_path: 'state.engagement.timestamps.last_activity',
        current_value: symbol.state.engagement.timestamps.last_activity,
      });
    }

    // Check version consistency
    if (symbol.updated_at && symbol.version === 1) {
      this.addIssue({
        code: 'INTG_004',
        category: 'integrity',
        severity: 'warning',
        message: 'Symbol has updated_at but version is still 1',
        field_path: 'version',
        recommended_action: 'Verify update mechanism is incrementing version',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPERATIONAL VALIDATION
  // ─────────────────────────────────────────────────────────────────────────────

  private validateOperational(symbol: MarineReconSymbol): void {
    const { engagement, validation } = symbol.state;

    // Check mission status appropriateness
    if (engagement.status === 'active' && engagement.conversation.message_count === 0) {
      // Active but no messages - stale?
      const timeSinceStart = Date.now() - new Date(engagement.timestamps.mission_start).getTime();
      if (timeSinceStart > 60000) { // 1 minute
        this.addIssue({
          code: 'OPER_001',
          category: 'operational',
          severity: 'warning',
          message: 'Mission active for over 1 minute with no messages',
          field_path: 'state.engagement.status',
          recommended_action: 'Verify connection, initiate conversation or abort',
        });
      }
    }

    // Check for stagnation
    const stagnationThreshold = symbol.config.dual_track.analyst.drift_thresholds.stagnation_alert_ms;
    const timeSinceActivity = Date.now() - new Date(engagement.timestamps.last_activity).getTime();
    if (engagement.status === 'active' && timeSinceActivity > stagnationThreshold) {
      this.addIssue({
        code: 'OPER_002',
        category: 'operational',
        severity: 'warning',
        message: `No activity for ${Math.round(timeSinceActivity / 1000)}s (threshold: ${stagnationThreshold / 1000}s)`,
        field_path: 'state.engagement.timestamps.last_activity',
        recommended_action: 'Check connection status, consider prompting response',
      });
    }

    // Check manipulation tactic accumulation
    const { detected_tactics } = engagement.analyst_state;
    const uniqueTactics = new Set(detected_tactics.map(t => t.tactic));
    if (uniqueTactics.size >= 4) {
      this.addIssue({
        code: 'OPER_003',
        category: 'operational',
        severity: 'warning',
        message: `Multiple manipulation tactics detected (${uniqueTactics.size} types)`,
        current_value: Array.from(uniqueTactics),
        recommended_action: 'Opposing agent may be sophisticated - increase vigilance',
      });
    }

    // Check for high-frequency tactics
    const tacticCounts = new Map<ManipulationTactic, number>();
    for (const tactic of detected_tactics) {
      tacticCounts.set(tactic.tactic, (tacticCounts.get(tactic.tactic) || 0) + 1);
    }
    for (const [tactic, count] of tacticCounts) {
      if (count >= 3) {
        this.addIssue({
          code: 'OPER_004',
          category: 'operational',
          severity: 'info',
          message: `Tactic "${tactic}" used ${count} times - likely deliberate strategy`,
          field_path: 'state.engagement.analyst_state.detected_tactics',
          recommended_action: 'Document pattern, prepare specific counter-measures',
        });
      }
    }

    // Check validation cycle currency
    if (engagement.status === 'active' && validation.cycle_number === 0) {
      this.addIssue({
        code: 'OPER_005',
        category: 'operational',
        severity: 'info',
        message: 'No validation cycles completed yet',
        field_path: 'state.validation.cycle_number',
        recommended_action: 'Ensure ralph-loop is running',
      });
    }

    // Check commander queue
    if (validation.commander_queue.length > 5) {
      this.addIssue({
        code: 'OPER_006',
        category: 'operational',
        severity: 'warning',
        message: `Commander queue backed up (${validation.commander_queue.length} messages)`,
        field_path: 'state.validation.commander_queue',
        recommended_action: 'Check commander connectivity, consider pausing if critical messages pending',
      });
    }

    // Check for expiration
    if (symbol.expires_at) {
      const expiresAt = new Date(symbol.expires_at).getTime();
      const timeUntilExpiry = expiresAt - Date.now();
      if (timeUntilExpiry < 0) {
        this.addIssue({
          code: 'OPER_007',
          category: 'operational',
          severity: 'error',
          message: 'Symbol has expired',
          field_path: 'expires_at',
          current_value: symbol.expires_at,
          recommended_action: 'Renew symbol or complete mission',
        });
      } else if (timeUntilExpiry < 300000) { // 5 minutes
        this.addIssue({
          code: 'OPER_008',
          category: 'operational',
          severity: 'warning',
          message: `Symbol expires in ${Math.round(timeUntilExpiry / 1000)}s`,
          field_path: 'expires_at',
          recommended_action: 'Prepare for graceful extraction',
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  private addIssue(issue: ValidationIssue): void {
    this.issues.push(issue);
  }

  private messageViolatesRedLine(message: string, prohibition: string): boolean {
    const messageLower = message.toLowerCase();
    const prohibitionLower = prohibition.toLowerCase();

    // Check for personal information patterns
    if (prohibitionLower.includes('personal information')) {
      const personalPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card
        /\b\d{5}(-\d{4})?\b/, // ZIP code could be risky
      ];
      for (const pattern of personalPatterns) {
        if (pattern.test(message)) {
          return true;
        }
      }
    }

    // Check for financial commitment patterns
    if (prohibitionLower.includes('financial') || prohibitionLower.includes('transaction')) {
      const financialPatterns = [
        /\bi (will|agree to) pay\b/i,
        /\bcharge my (card|account)\b/i,
        /\bauthorize (the |a )?payment\b/i,
      ];
      for (const pattern of financialPatterns) {
        if (pattern.test(message)) {
          return true;
        }
      }
    }

    return false;
  }

  private buildSummary(): ValidationReport['summary'] {
    const categories = ['structural', 'constraint', 'drift', 'persona', 'integrity', 'operational'] as const;
    const summary: Record<string, { passed: boolean; issue_count: number }> = {};

    for (const category of categories) {
      const categoryIssues = this.issues.filter(i => i.category === category);
      const hasCriticalOrError = categoryIssues.some(
        i => i.severity === 'critical' || i.severity === 'error'
      );
      summary[category] = {
        passed: !hasCriticalOrError,
        issue_count: categoryIssues.length,
      };
    }

    return summary as ValidationReport['summary'];
  }

  private determineAlertLevel(): AlertLevel {
    const hasCritical = this.issues.some(i => i.severity === 'critical');
    const errorCount = this.issues.filter(i => i.severity === 'error').length;
    const warningCount = this.issues.filter(i => i.severity === 'warning').length;

    if (hasCritical) return 'red';
    if (errorCount >= 2) return 'red';
    if (errorCount >= 1 || warningCount >= 3) return 'orange';
    if (warningCount >= 1) return 'yellow';
    return 'green';
  }

  private generateRecommendedActions(): string[] {
    const actions: string[] = [];
    const criticalIssues = this.issues.filter(i => i.severity === 'critical');
    const errorIssues = this.issues.filter(i => i.severity === 'error');

    // Critical issues first
    for (const issue of criticalIssues) {
      if (issue.recommended_action) {
        actions.push(`[CRITICAL] ${issue.recommended_action}`);
      }
    }

    // Then errors
    for (const issue of errorIssues) {
      if (issue.recommended_action && !actions.some(a => a.includes(issue.recommended_action!))) {
        actions.push(`[ERROR] ${issue.recommended_action}`);
      }
    }

    // Limit to top 5 actions
    return actions.slice(0, 5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert validation report to ralph-loop ValidationResult format.
 */
export function toRalphLoopResult(report: ValidationReport): ValidationResult {
  return {
    cycle: 0, // Will be set by caller
    timestamp: report.timestamp,
    status: report.passed ? 'pass' : report.issues.some(i => i.severity === 'critical') ? 'fail' : 'warn',
    checks: report.issues.map(issue => ({
      name: issue.code,
      result: issue.severity === 'critical' || issue.severity === 'error' ? 'fail' :
        issue.severity === 'warning' ? 'warn' : 'pass',
      details: issue.message,
      metric_value: typeof issue.current_value === 'number' ? issue.current_value : undefined,
      threshold: typeof issue.expected_value === 'number' ? issue.expected_value : undefined,
    })),
    recommended_actions: report.recommended_actions,
  };
}

/**
 * Create a validation check result.
 */
export function createValidationCheck(
  name: string,
  passed: boolean,
  details: string,
  metricValue?: number,
  threshold?: number
): ValidationCheck {
  return {
    name,
    result: passed ? 'pass' : 'fail',
    details,
    metric_value: metricValue,
    threshold,
  };
}
