/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VETO GATE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Veto Gate is the final checkpoint between the Performer's response
 * and the actual send. It integrates Analyst assessment to make approve/modify/
 * block/escalate decisions.
 *
 * Key Responsibilities:
 * - Receive Performer responses
 * - Integrate Analyst assessment
 * - Make final send/block decision
 * - Apply modifications if needed
 * - Log all decisions for auditability
 *
 * Decision Flow:
 * 1. Performer generates response
 * 2. Analyst assesses response
 * 3. Veto Gate makes final decision based on config thresholds
 * 4. If approved → send (via Stealth layer)
 * 5. If modified → apply mods and send
 * 6. If blocked → request new response
 * 7. If escalate → queue for commander
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  VetoGateConfig,
  VetoDecision,
  VetoHistoryEntry,
} from '../types';
import { PerformerResponse } from './performer';
import { ResponseAssessment } from './analyst';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input to the veto gate.
 */
export interface VetoGateInput {
  /** Response from Performer */
  performer_response: PerformerResponse;

  /** Assessment from Analyst */
  analyst_assessment: ResponseAssessment;

  /** Current message context */
  context: {
    /** What we're responding to */
    incoming_message: string;

    /** Current topic */
    topic: string;

    /** Urgency level */
    urgency: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Output from the veto gate.
 */
export interface VetoGateOutput {
  /** Final decision */
  decision: VetoDecision;

  /** Message to send (if approved or modified) */
  final_message?: string;

  /** Was the message modified? */
  was_modified: boolean;

  /** Modifications applied (if any) */
  modifications_applied?: string[];

  /** Reason for decision */
  reason: string;

  /** Confidence in decision */
  confidence: number;

  /** History entry for logging */
  history_entry: VetoHistoryEntry;

  /** Escalation message (if escalate decision) */
  escalation_message?: string;
}

/**
 * Escalation request for commander.
 */
export interface EscalationRequest {
  /** Request ID */
  id: string;

  /** Original message */
  original_message: string;

  /** Reason for escalation */
  reason: string;

  /** Issues found */
  issues: string[];

  /** Urgency */
  urgency: 'low' | 'medium' | 'high' | 'critical';

  /** Options for commander */
  options: Array<{
    id: string;
    description: string;
    message: string;
  }>;

  /** Timestamp */
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VETO GATE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Veto Gate - final decision point for responses.
 */
export class VetoGate {
  private config: VetoGateConfig;
  private history: VetoHistoryEntry[] = [];
  private escalationQueue: EscalationRequest[] = [];

  constructor(config: VetoGateConfig) {
    this.config = config;
  }

  /**
   * Process a response through the veto gate.
   */
  process(input: VetoGateInput): VetoGateOutput {
    const { performer_response, analyst_assessment, context } = input;
    const timestamp = new Date().toISOString();

    // Determine decision based on thresholds and assessment
    let decision = this.determineDecision(performer_response, analyst_assessment, context);

    // Apply final message and modifications
    let final_message: string | undefined;
    let was_modified = false;
    let modifications_applied: string[] | undefined;

    if (decision === 'approve') {
      final_message = performer_response.message;
    } else if (decision === 'modify') {
      const modified = this.applyModifications(
        performer_response.message,
        analyst_assessment.modifications || []
      );
      final_message = modified.message;
      was_modified = modified.changed;
      modifications_applied = modified.applied;

      // If modifications couldn't be applied, escalate instead
      if (!was_modified && analyst_assessment.issues.length > 0) {
        decision = 'escalate';
      }
    }

    // Build reason
    const reason = this.buildReason(decision, analyst_assessment, performer_response);

    // Calculate confidence
    const confidence = this.calculateConfidence(decision, analyst_assessment, performer_response);

    // Create history entry
    const history_entry: VetoHistoryEntry = {
      timestamp,
      decision,
      original_message: performer_response.message,
      modified_message: was_modified ? final_message : undefined,
      reason,
    };

    // Add to history
    this.history.push(history_entry);

    // Handle escalation
    let escalation_message: string | undefined;
    if (decision === 'escalate') {
      const escalation = this.createEscalation(input, reason);
      this.escalationQueue.push(escalation);
      escalation_message = `Escalation queued: ${escalation.reason}`;
    }

    return {
      decision,
      final_message: decision === 'approve' || decision === 'modify' ? final_message : undefined,
      was_modified,
      modifications_applied,
      reason,
      confidence,
      history_entry,
      escalation_message,
    };
  }

  /**
   * Determine the veto decision.
   */
  private determineDecision(
    performer: PerformerResponse,
    analyst: ResponseAssessment,
    context: VetoGateInput['context']
  ): VetoDecision {
    // Check for automatic decisions based on thresholds

    // Auto-block if analyst says block
    if (analyst.recommendation === 'block') {
      return 'block';
    }

    // Auto-block if risk is too high
    if (analyst.risk_level > this.config.auto_block_threshold) {
      return 'block';
    }

    // Check if this situation requires analyst approval
    const requiresApproval = this.requiresAnalystApproval(performer.message, context);
    if (requiresApproval && analyst.recommendation !== 'approve') {
      // If analyst didn't approve and approval is required, follow analyst
      return analyst.recommendation;
    }

    // Auto-approve if confidence is high and analyst approves
    if (
      analyst.recommendation === 'approve' &&
      performer.confidence >= this.config.auto_approve_threshold &&
      analyst.risk_level < (1 - this.config.auto_approve_threshold)
    ) {
      return 'approve';
    }

    // Follow analyst recommendation for remaining cases
    return analyst.recommendation;
  }

  /**
   * Check if the situation requires explicit analyst approval.
   */
  private requiresAnalystApproval(message: string, context: VetoGateInput['context']): boolean {
    const messageLower = message.toLowerCase();

    for (const situation of this.config.require_analyst_approval) {
      switch (situation) {
        case 'concession':
          if (this.containsConcession(messageLower)) return true;
          break;
        case 'personal_information':
          if (this.containsPersonalInfo(messageLower)) return true;
          break;
        case 'commitment':
          if (this.containsCommitment(messageLower)) return true;
          break;
        case 'escalation_request':
          if (this.containsEscalationRequest(messageLower)) return true;
          break;
      }
    }

    // High urgency always requires approval
    if (context.urgency === 'critical') return true;

    return false;
  }

  private containsConcession(message: string): boolean {
    return /\b(ok(ay)?|fine|agree|accept|i (can|could|might|will) (go with|accept))\b/.test(message);
  }

  private containsPersonalInfo(message: string): boolean {
    return /\b(my (name|address|phone|email|ssn|account))\b/.test(message) ||
      /\b\d{3}-\d{2}-\d{4}\b/.test(message); // SSN pattern
  }

  private containsCommitment(message: string): boolean {
    return /\b(i (will|promise|commit|agree to)|deal|yes,? i'?ll)\b/.test(message);
  }

  private containsEscalationRequest(message: string): boolean {
    return /\b(supervisor|manager|escalate|speak to someone|higher authority)\b/.test(message);
  }

  /**
   * Apply modifications to a message.
   */
  private applyModifications(
    message: string,
    modifications: string[]
  ): { message: string; changed: boolean; applied: string[] } {
    let modified = message;
    const applied: string[] = [];

    for (const mod of modifications) {
      const modLower = mod.toLowerCase();

      // Handle common modification patterns
      if (modLower.includes('remove') || modLower.includes('delete')) {
        // Try to identify what to remove
        const toRemoveMatch = mod.match(/remove\s+(?:the\s+)?(.+)/i);
        if (toRemoveMatch) {
          const toRemove = toRemoveMatch[1];
          const regex = new RegExp(toRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          const newModified = modified.replace(regex, '');
          if (newModified !== modified) {
            modified = newModified.replace(/\s+/g, ' ').trim();
            applied.push(mod);
          }
        }
      } else if (modLower.includes('strengthen') || modLower.includes('firm')) {
        // Strengthen language
        modified = this.strengthenLanguage(modified);
        applied.push(mod);
      } else if (modLower.includes('soften') || modLower.includes('polite')) {
        // Soften language
        modified = this.softenLanguage(modified);
        applied.push(mod);
      } else if (modLower.includes('simpler') || modLower.includes('simple')) {
        // Simplify terms
        modified = this.simplifyTerms(modified);
        applied.push(mod);
      }
    }

    return {
      message: modified,
      changed: modified !== message,
      applied,
    };
  }

  private strengthenLanguage(message: string): string {
    return message
      .replace(/\b(i think|maybe|perhaps|might)\b/gi, '')
      .replace(/\b(could you)\b/gi, 'please')
      .replace(/\b(if possible)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private softenLanguage(message: string): string {
    return message
      .replace(/\b(need|must|have to)\b/gi, 'would like to')
      .replace(/\b(now|immediately)\b/gi, 'when you can')
      .replace(/\b(unacceptable|ridiculous)\b/gi, 'disappointing');
  }

  private simplifyTerms(message: string): string {
    return message
      .replace(/\bsubsequently\b/gi, 'then')
      .replace(/\bpurchase\b/gi, 'buy')
      .replace(/\bimplement\b/gi, 'do')
      .replace(/\butilize\b/gi, 'use');
  }

  /**
   * Build the reason string for a decision.
   */
  private buildReason(
    decision: VetoDecision,
    analyst: ResponseAssessment,
    performer: PerformerResponse
  ): string {
    switch (decision) {
      case 'approve':
        return `Approved: ${analyst.reasoning}`;
      case 'modify':
        return `Modified: ${analyst.reasoning}`;
      case 'block':
        const blockReasons = analyst.issues
          .filter(i => i.severity === 'critical' || i.severity === 'error')
          .map(i => i.description)
          .join('; ');
        return `Blocked: ${blockReasons || analyst.reasoning}`;
      case 'escalate':
        return `Escalated: ${analyst.reasoning}`;
    }
  }

  /**
   * Calculate confidence in the decision.
   */
  private calculateConfidence(
    decision: VetoDecision,
    analyst: ResponseAssessment,
    performer: PerformerResponse
  ): number {
    // Start with analyst and performer confidence
    let confidence = (1 - analyst.risk_level) * performer.confidence;

    // Adjust based on decision type
    if (decision === 'approve') {
      confidence *= 1.1; // Slight boost for clear approval
    } else if (decision === 'escalate') {
      confidence *= 0.8; // Lower confidence indicates uncertainty
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Create an escalation request.
   */
  private createEscalation(input: VetoGateInput, reason: string): EscalationRequest {
    const { performer_response, analyst_assessment, context } = input;

    // Generate options for commander
    const options: EscalationRequest['options'] = [
      {
        id: 'approve_as_is',
        description: 'Approve the original message',
        message: performer_response.message,
      },
    ];

    // Add modified option if modifications suggested
    if (analyst_assessment.modifications && analyst_assessment.modifications.length > 0) {
      const modResult = this.applyModifications(
        performer_response.message,
        analyst_assessment.modifications
      );
      if (modResult.changed) {
        options.push({
          id: 'approve_modified',
          description: `Approve with modifications: ${modResult.applied.join(', ')}`,
          message: modResult.message,
        });
      }
    }

    // Add block option
    options.push({
      id: 'block',
      description: 'Block and request new response',
      message: '',
    });

    // Add abort option for serious issues
    if (analyst_assessment.issues.some(i => i.severity === 'critical')) {
      options.push({
        id: 'abort_mission',
        description: 'Abort the mission',
        message: '',
      });
    }

    return {
      id: `ESC_${Date.now()}`,
      original_message: performer_response.message,
      reason,
      issues: analyst_assessment.issues.map(i => `[${i.severity}] ${i.description}`),
      urgency: context.urgency,
      options,
      timestamp: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get veto history.
   */
  getHistory(): VetoHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get pending escalations.
   */
  getPendingEscalations(): EscalationRequest[] {
    return [...this.escalationQueue];
  }

  /**
   * Resolve an escalation with commander decision.
   */
  resolveEscalation(
    escalationId: string,
    optionId: string
  ): { resolved: boolean; message?: string } {
    const index = this.escalationQueue.findIndex(e => e.id === escalationId);
    if (index === -1) {
      return { resolved: false };
    }

    const escalation = this.escalationQueue[index];
    const option = escalation.options.find(o => o.id === optionId);
    if (!option) {
      return { resolved: false };
    }

    // Remove from queue
    this.escalationQueue.splice(index, 1);

    // Add resolution to history
    this.history.push({
      timestamp: new Date().toISOString(),
      decision: optionId === 'block' || optionId === 'abort_mission' ? 'block' : 'approve',
      original_message: escalation.original_message,
      modified_message: option.message !== escalation.original_message ? option.message : undefined,
      reason: `Commander decision: ${option.description}`,
    });

    return {
      resolved: true,
      message: option.message || undefined,
    };
  }

  /**
   * Get decision statistics.
   */
  getStats(): {
    total: number;
    approved: number;
    modified: number;
    blocked: number;
    escalated: number;
    approval_rate: number;
  } {
    const total = this.history.length;
    const approved = this.history.filter(h => h.decision === 'approve').length;
    const modified = this.history.filter(h => h.decision === 'modify').length;
    const blocked = this.history.filter(h => h.decision === 'block').length;
    const escalated = this.history.filter(h => h.decision === 'escalate').length;

    return {
      total,
      approved,
      modified,
      blocked,
      escalated,
      approval_rate: total > 0 ? (approved + modified) / total : 1,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a VetoGate from a symbol.
 */
export function createVetoGateFromSymbol(symbol: MarineReconSymbol): VetoGate {
  const gate = new VetoGate(symbol.config.dual_track.veto_gate);

  // Load existing history from symbol state
  for (const entry of symbol.state.engagement.analyst_state.veto_history) {
    // Add to gate's internal history
    gate.getHistory().push(entry);
  }

  return gate;
}
