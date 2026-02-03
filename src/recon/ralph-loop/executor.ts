/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RALPH-LOOP EXECUTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Executes the validation cycle for ralph-loop.
 * Each cycle performs a series of checks and updates on the agent symbol.
 *
 * Validation Steps (in order):
 * 1. Constraint Check - Verify all constraints are satisfied
 * 2. Drift Check - Assess position drift from original
 * 3. Persona Consistency - Verify performer is consistent
 * 4. Intel Extraction - Summarize gathered intelligence
 * 5. Commander Sync - Send updates and receive commands
 * 6. Symbol Refresh - Check for symbol updates
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  RalphLoopConfig,
  ValidationComponent,
  ValidationResult,
  ValidationCheck,
  CommanderMessage,
  SymbolUpdate,
  AlertLevel,
} from '../types';
import { ReconSymbolValidator, ValidationReport, toRalphLoopResult } from '../symbol/validator';
import { updateSymbolState } from '../symbol/schema';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of executing a validation cycle.
 */
export interface CycleExecutionResult {
  /** Cycle number */
  cycle: number;

  /** Whether the cycle succeeded */
  success: boolean;

  /** Validation result */
  validation_result: ValidationResult;

  /** Symbol after validation */
  updated_symbol: MarineReconSymbol;

  /** Commander messages sent */
  messages_sent: number;

  /** Symbol updates received */
  updates_applied: number;

  /** Recommended actions */
  actions: string[];

  /** Cycle duration (ms) */
  duration_ms: number;

  /** Errors encountered */
  errors: string[];
}

/**
 * Commander interface for communication.
 */
export interface CommanderInterface {
  /** Send a message to commander */
  sendMessage(message: CommanderMessage): Promise<boolean>;

  /** Check for pending commands */
  checkForCommands(): Promise<SymbolUpdate[]>;

  /** Report status */
  reportStatus(status: StatusReport): Promise<void>;
}

/**
 * Status report for commander.
 */
export interface StatusReport {
  /** Symbol ID */
  symbol_id: string;

  /** Current status */
  status: string;

  /** Alert level */
  alert_level: AlertLevel;

  /** Message count */
  message_count: number;

  /** Validation cycle */
  validation_cycle: number;

  /** Drift score */
  drift_score: number;

  /** Risk score */
  risk_score: number;

  /** Key findings */
  key_findings: string[];

  /** Timestamp */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RALPH-LOOP EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Executes ralph-loop validation cycles.
 */
export class RalphLoopExecutor {
  private config: RalphLoopConfig;
  private validator: ReconSymbolValidator;
  private commander: CommanderInterface | null = null;

  constructor(config: RalphLoopConfig) {
    this.config = config;
    this.validator = new ReconSymbolValidator();
  }

  /**
   * Set the commander interface for communication.
   */
  setCommanderInterface(commander: CommanderInterface): void {
    this.commander = commander;
  }

  /**
   * Execute a validation cycle.
   */
  async execute(symbol: MarineReconSymbol, cycleNumber: number): Promise<CycleExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const actions: string[] = [];
    let updatedSymbol = symbol;
    let messagesSent = 0;
    let updatesApplied = 0;

    // Get enabled validations sorted by priority
    const validations = this.config.validations
      .filter(v => v.enabled)
      .sort((a, b) => a.priority - b.priority);

    // Execute each validation component
    const checks: ValidationCheck[] = [];

    for (const validation of validations) {
      try {
        const check = await this.executeValidation(validation, updatedSymbol, cycleNumber);
        checks.push(check);

        // Collect actions from failed checks
        if (check.result === 'fail') {
          actions.push(`Address ${validation.name}: ${check.details}`);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(`${validation.name}: ${err.message}`);
        checks.push({
          name: validation.name,
          result: 'fail',
          details: `Error: ${err.message}`,
        });
      }
    }

    // Run full validation
    const validationReport = this.validator.validate(updatedSymbol);
    const validationResult = this.buildValidationResult(cycleNumber, checks, validationReport);

    // Update symbol with validation state
    updatedSymbol = updateSymbolState(updatedSymbol, {
      validation: {
        cycle_number: cycleNumber,
        last_result: validationResult,
      },
    });

    // Send commander updates if enabled
    if (this.config.commander_updates.enabled && this.commander) {
      const shouldUpdate = cycleNumber % this.config.commander_updates.update_frequency === 0;

      if (shouldUpdate) {
        try {
          // Send queued messages
          const messagesToSend = updatedSymbol.state.validation.commander_queue
            .filter(m => m.delivery_attempts < 3);

          for (const message of messagesToSend) {
            const sent = await this.commander.sendMessage({
              ...message,
              delivery_attempts: message.delivery_attempts + 1,
            });

            if (sent) {
              messagesSent++;
            }
          }

          // Clear sent messages from queue
          if (messagesSent > 0) {
            updatedSymbol = updateSymbolState(updatedSymbol, {
              validation: {
                commander_queue: updatedSymbol.state.validation.commander_queue.slice(messagesSent),
              },
            });
          }

          // Send status report
          await this.sendStatusReport(updatedSymbol, cycleNumber);

          // Check for commands
          const commands = await this.commander.checkForCommands();
          if (commands.length > 0) {
            updatedSymbol = this.applySymbolUpdates(updatedSymbol, commands);
            updatesApplied = commands.length;
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          errors.push(`Commander sync: ${err.message}`);
        }
      }
    }

    // Add recommended actions from validation
    actions.push(...validationResult.recommended_actions);

    const duration_ms = Date.now() - startTime;

    return {
      cycle: cycleNumber,
      success: errors.length === 0,
      validation_result: validationResult,
      updated_symbol: updatedSymbol,
      messages_sent: messagesSent,
      updates_applied: updatesApplied,
      actions: [...new Set(actions)], // Deduplicate
      duration_ms,
      errors,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VALIDATION COMPONENTS
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeValidation(
    validation: ValidationComponent,
    symbol: MarineReconSymbol,
    cycleNumber: number
  ): Promise<ValidationCheck> {
    // Execute with timeout
    const timeoutPromise = new Promise<ValidationCheck>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), validation.timeout_ms);
    });

    const validationPromise = this.runValidationComponent(validation.name, symbol);

    return Promise.race([validationPromise, timeoutPromise]);
  }

  private async runValidationComponent(
    name: string,
    symbol: MarineReconSymbol
  ): Promise<ValidationCheck> {
    switch (name) {
      case 'constraint_check':
        return this.checkConstraints(symbol);

      case 'drift_check':
        return this.checkDrift(symbol);

      case 'persona_consistency':
        return this.checkPersonaConsistency(symbol);

      case 'intel_extraction':
        return this.checkIntelExtraction(symbol);

      case 'commander_sync':
        return this.checkCommanderSync(symbol);

      default:
        return {
          name,
          result: 'skip',
          details: `Unknown validation component: ${name}`,
        };
    }
  }

  private checkConstraints(symbol: MarineReconSymbol): ValidationCheck {
    const { constraint_status } = symbol.state.engagement.analyst_state;

    const violated = constraint_status.filter(c => c.status === 'violated');
    const atRisk = constraint_status.filter(c => c.status === 'at_risk');

    if (violated.length > 0) {
      return {
        name: 'constraint_check',
        result: 'fail',
        details: `${violated.length} constraint(s) violated`,
        metric_value: violated.length,
        threshold: 0,
      };
    }

    if (atRisk.length > 0) {
      return {
        name: 'constraint_check',
        result: 'warn',
        details: `${atRisk.length} constraint(s) at risk`,
        metric_value: atRisk.length,
        threshold: 0,
      };
    }

    return {
      name: 'constraint_check',
      result: 'pass',
      details: 'All constraints satisfied',
    };
  }

  private checkDrift(symbol: MarineReconSymbol): ValidationCheck {
    const { drift_assessment } = symbol.state.engagement.analyst_state;
    const threshold = symbol.config.dual_track.analyst.drift_thresholds.position_drift_max;

    if (drift_assessment.drift_score > threshold) {
      return {
        name: 'drift_check',
        result: 'fail',
        details: `Drift score ${(drift_assessment.drift_score * 100).toFixed(0)}% exceeds threshold`,
        metric_value: drift_assessment.drift_score,
        threshold,
      };
    }

    if (drift_assessment.drift_score > threshold * 0.7) {
      return {
        name: 'drift_check',
        result: 'warn',
        details: `Drift score ${(drift_assessment.drift_score * 100).toFixed(0)}% approaching threshold`,
        metric_value: drift_assessment.drift_score,
        threshold,
      };
    }

    return {
      name: 'drift_check',
      result: 'pass',
      details: `Drift score ${(drift_assessment.drift_score * 100).toFixed(0)}% within limits`,
      metric_value: drift_assessment.drift_score,
      threshold,
    };
  }

  private checkPersonaConsistency(symbol: MarineReconSymbol): ValidationCheck {
    const { persona_consistency } = symbol.state.engagement.performer_state;
    const threshold = 0.7;

    if (persona_consistency < threshold) {
      return {
        name: 'persona_consistency',
        result: 'warn',
        details: `Persona consistency ${(persona_consistency * 100).toFixed(0)}% is low`,
        metric_value: persona_consistency,
        threshold,
      };
    }

    return {
      name: 'persona_consistency',
      result: 'pass',
      details: `Persona consistency ${(persona_consistency * 100).toFixed(0)}% is good`,
      metric_value: persona_consistency,
      threshold,
    };
  }

  private checkIntelExtraction(symbol: MarineReconSymbol): ValidationCheck {
    const { intelligence } = symbol.state.engagement;
    const observationCount = intelligence.observations.length;
    const patternCount = intelligence.patterns_observed.length;
    const boundaryCount = intelligence.constraint_boundaries.length;

    const totalIntel = observationCount + patternCount + boundaryCount;

    if (totalIntel === 0 && symbol.state.engagement.conversation.message_count > 3) {
      return {
        name: 'intel_extraction',
        result: 'warn',
        details: 'No intelligence gathered despite conversation activity',
        metric_value: totalIntel,
      };
    }

    return {
      name: 'intel_extraction',
      result: 'pass',
      details: `${totalIntel} intel items gathered (${observationCount} observations, ${patternCount} patterns, ${boundaryCount} boundaries)`,
      metric_value: totalIntel,
    };
  }

  private checkCommanderSync(symbol: MarineReconSymbol): ValidationCheck {
    const queueLength = symbol.state.validation.commander_queue.length;
    const criticalPending = symbol.state.validation.commander_queue
      .filter(m => m.priority === 'critical')
      .length;

    if (criticalPending > 0) {
      return {
        name: 'commander_sync',
        result: 'warn',
        details: `${criticalPending} critical message(s) pending delivery`,
        metric_value: criticalPending,
      };
    }

    if (queueLength > 5) {
      return {
        name: 'commander_sync',
        result: 'warn',
        details: `Commander queue backed up (${queueLength} messages)`,
        metric_value: queueLength,
        threshold: 5,
      };
    }

    return {
      name: 'commander_sync',
      result: 'pass',
      details: queueLength > 0 ? `${queueLength} message(s) in queue` : 'Queue empty',
      metric_value: queueLength,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMMANDER COMMUNICATION
  // ─────────────────────────────────────────────────────────────────────────────

  private async sendStatusReport(symbol: MarineReconSymbol, cycleNumber: number): Promise<void> {
    if (!this.commander) return;

    const { engagement } = symbol.state;

    // Build key findings
    const keyFindings: string[] = [];

    // Add tactic findings
    const tacticTypes = new Set(engagement.analyst_state.detected_tactics.map(t => t.tactic));
    if (tacticTypes.size > 0) {
      keyFindings.push(`Detected tactics: ${Array.from(tacticTypes).join(', ')}`);
    }

    // Add drift assessment
    if (engagement.analyst_state.drift_assessment.net_assessment !== 'even') {
      keyFindings.push(`Position: ${engagement.analyst_state.drift_assessment.net_assessment}`);
    }

    // Add opposing agent type if known
    if (engagement.intelligence.opposing_agent.suspected_type !== 'unknown') {
      keyFindings.push(`Opposing agent: likely ${engagement.intelligence.opposing_agent.suspected_type}`);
    }

    const report: StatusReport = {
      symbol_id: symbol.symbol_id,
      status: engagement.status,
      alert_level: engagement.alert_level,
      message_count: engagement.conversation.message_count,
      validation_cycle: cycleNumber,
      drift_score: engagement.analyst_state.drift_assessment.drift_score,
      risk_score: engagement.analyst_state.current_risk_score,
      key_findings: keyFindings,
      timestamp: new Date().toISOString(),
    };

    await this.commander.reportStatus(report);
  }

  private applySymbolUpdates(symbol: MarineReconSymbol, updates: SymbolUpdate[]): MarineReconSymbol {
    const immutableFields = new Set(this.config.symbol_refresh.immutable_fields);
    let updated = symbol;

    for (const update of updates) {
      // Check if field is immutable
      if (immutableFields.has(update.field_path)) {
        console.warn(`Skipping update to immutable field: ${update.field_path}`);
        continue;
      }

      // Apply the update (simplified - in production would use proper deep update)
      // For now, just add to pending updates
      updated = updateSymbolState(updated, {
        validation: {
          pending_updates: [
            ...updated.state.validation.pending_updates,
            update,
          ],
        },
      });
    }

    return updated;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESULT BUILDING
  // ─────────────────────────────────────────────────────────────────────────────

  private buildValidationResult(
    cycleNumber: number,
    checks: ValidationCheck[],
    report: ValidationReport
  ): ValidationResult {
    // Determine overall status
    const hasFail = checks.some(c => c.result === 'fail');
    const hasWarn = checks.some(c => c.result === 'warn');

    let status: ValidationResult['status'];
    if (hasFail || !report.passed) {
      status = 'fail';
    } else if (hasWarn) {
      status = 'warn';
    } else {
      status = 'pass';
    }

    // Combine recommended actions
    const recommendedActions = report.recommended_actions;

    return {
      cycle: cycleNumber,
      timestamp: new Date().toISOString(),
      status,
      checks,
      recommended_actions: recommendedActions,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK COMMANDER (for testing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock commander interface for local testing.
 */
export class MockCommanderInterface implements CommanderInterface {
  private messages: CommanderMessage[] = [];
  private statusReports: StatusReport[] = [];
  private pendingCommands: SymbolUpdate[] = [];

  async sendMessage(message: CommanderMessage): Promise<boolean> {
    this.messages.push(message);
    return true;
  }

  async checkForCommands(): Promise<SymbolUpdate[]> {
    const commands = [...this.pendingCommands];
    this.pendingCommands = [];
    return commands;
  }

  async reportStatus(status: StatusReport): Promise<void> {
    this.statusReports.push(status);
  }

  // Test helpers
  getMessages(): CommanderMessage[] {
    return [...this.messages];
  }

  getStatusReports(): StatusReport[] {
    return [...this.statusReports];
  }

  queueCommand(update: SymbolUpdate): void {
    this.pendingCommands.push(update);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an executor from config.
 */
export function createExecutor(config: RalphLoopConfig): RalphLoopExecutor {
  return new RalphLoopExecutor(config);
}
