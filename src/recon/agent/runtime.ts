/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON AGENT RUNTIME
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Runtime is the coordinator that orchestrates the dual-track agent.
 * It manages the flow between Performer, Analyst, and Veto Gate, handles
 * state synchronization with the symbol, and interfaces with external systems.
 *
 * Key Responsibilities:
 * - Coordinate message processing flow
 * - Manage dual-track synchronization
 * - Handle symbol state updates
 * - Interface with ralph-loop
 * - Manage mission lifecycle
 *
 * Message Flow:
 * 1. Incoming message received
 * 2. Analyst analyzes message (parallel)
 * 3. Performer generates response using analyst guidance
 * 4. Analyst assesses proposed response
 * 5. Veto Gate makes final decision
 * 6. Stealth layer applies human-like timing
 * 7. Message sent
 * 8. State updated in symbol
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  ReconMissionStatus,
  AlertLevel,
  ConversationState,
  EngagementTimestamps,
  CommanderMessage,
} from '../types';
import { updateSymbolState, createSymbolSummary } from '../symbol/schema';
import { ReconSymbolValidator, ValidationReport } from '../symbol/validator';
import { Performer, createPerformerFromSymbol, ResponseContext, ConversationMessage, AnalystGuidance } from './performer';
import { Analyst, createAnalystFromSymbol, MessageAnalysis, ResponseAssessment } from './analyst';
import { VetoGate, createVetoGateFromSymbol, VetoGateInput, VetoGateOutput } from './veto-gate';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the runtime.
 */
export interface RuntimeConfig {
  /** Enable verbose logging */
  verbose: boolean;

  /** Max conversation history to keep */
  max_history: number;

  /** Auto-validate on each message */
  auto_validate: boolean;
}

/**
 * Result of processing an incoming message.
 */
export interface ProcessMessageResult {
  /** Whether processing succeeded */
  success: boolean;

  /** Our response (if approved) */
  response?: string;

  /** Veto gate decision */
  veto_decision: string;

  /** Was response modified? */
  was_modified: boolean;

  /** Analysis summary */
  analysis_summary: string;

  /** Updated symbol */
  updated_symbol: MarineReconSymbol;

  /** Any errors */
  error?: string;
}

/**
 * Runtime state for internal tracking.
 */
interface RuntimeState {
  /** Is the runtime running */
  running: boolean;

  /** Conversation history */
  conversation: ConversationMessage[];

  /** Current response objective */
  current_objective: string;

  /** Pending response to send */
  pending_response?: string;
}

/**
 * Events emitted by the runtime.
 */
export type RuntimeEvent =
  | { type: 'message_received'; message: string }
  | { type: 'analysis_complete'; analysis: MessageAnalysis }
  | { type: 'response_generated'; response: string }
  | { type: 'veto_decision'; decision: VetoGateOutput }
  | { type: 'response_sent'; response: string }
  | { type: 'status_change'; old: ReconMissionStatus; new: ReconMissionStatus }
  | { type: 'alert_level_change'; old: AlertLevel; new: AlertLevel }
  | { type: 'validation_complete'; report: ValidationReport }
  | { type: 'error'; error: Error };

/**
 * Event listener type.
 */
export type RuntimeEventListener = (event: RuntimeEvent) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// RECON AGENT RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Recon Agent Runtime - coordinates the dual-track agent.
 */
export class ReconAgentRuntime {
  private symbol: MarineReconSymbol;
  private config: RuntimeConfig;
  private performer: Performer;
  private analyst: Analyst;
  private vetoGate: VetoGate;
  private validator: ReconSymbolValidator;
  private state: RuntimeState;
  private listeners: RuntimeEventListener[] = [];

  constructor(symbol: MarineReconSymbol, config?: Partial<RuntimeConfig>) {
    this.symbol = symbol;
    this.config = {
      verbose: config?.verbose ?? false,
      max_history: config?.max_history ?? 50,
      auto_validate: config?.auto_validate ?? true,
    };

    // Initialize tracks
    this.performer = createPerformerFromSymbol(symbol);
    this.analyst = createAnalystFromSymbol(symbol);
    this.vetoGate = createVetoGateFromSymbol(symbol);
    this.validator = new ReconSymbolValidator();

    // Initialize state
    this.state = {
      running: false,
      conversation: [],
      current_objective: symbol.mission.objective.primary_goal,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start the runtime.
   */
  start(): void {
    if (this.state.running) {
      throw new Error('Runtime is already running');
    }

    this.state.running = true;
    this.updateStatus('active');
    this.log('Runtime started');
  }

  /**
   * Pause the runtime.
   */
  pause(): void {
    if (!this.state.running) return;

    this.state.running = false;
    this.updateStatus('paused');
    this.log('Runtime paused');
  }

  /**
   * Resume the runtime.
   */
  resume(): void {
    if (this.state.running) return;

    this.state.running = true;
    this.updateStatus('active');
    this.log('Runtime resumed');
  }

  /**
   * Stop the runtime and complete the mission.
   */
  complete(status: 'completed' | 'aborted' | 'compromised' = 'completed'): void {
    this.state.running = false;
    this.updateStatus(status);

    // Update timestamps
    this.symbol = updateSymbolState(this.symbol, {
      engagement: {
        timestamps: {
          ...this.symbol.state.engagement.timestamps,
          mission_end: new Date().toISOString(),
        },
      },
    });

    this.log(`Mission ${status}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MESSAGE PROCESSING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Process an incoming message from the opposing agent.
   */
  async processIncomingMessage(message: string): Promise<ProcessMessageResult> {
    if (!this.state.running) {
      return {
        success: false,
        veto_decision: 'block',
        was_modified: false,
        analysis_summary: 'Runtime not running',
        updated_symbol: this.symbol,
        error: 'Runtime is not running',
      };
    }

    try {
      // Emit event
      this.emit({ type: 'message_received', message });

      // Add to conversation history
      this.addToConversation('them', message);

      // Step 1: Analyst analyzes the message
      const analysis = this.analyst.analyzeIncomingMessage(message, this.state.conversation);
      this.emit({ type: 'analysis_complete', analysis });
      this.log(`Analysis: ${analysis.summary}`);

      // Check for alert level changes
      this.updateAlertLevel(analysis);

      // Step 2: Build response context
      const context: ResponseContext = {
        incoming_message: message,
        conversation_history: this.state.conversation,
        current_topic: this.symbol.state.engagement.conversation.current_topic || 'general',
        response_objective: this.state.current_objective,
        analyst_guidance: analysis.guidance,
      };

      // Step 3: Performer generates response
      const performerResponse = this.performer.generateResponse(context);
      this.emit({ type: 'response_generated', response: performerResponse.message });
      this.log(`Performer: "${performerResponse.message.substring(0, 50)}..."`);

      // Step 4: Analyst assesses proposed response
      const assessment = this.analyst.assessProposedResponse(performerResponse.message);
      this.log(`Assessment: ${assessment.recommendation} (risk: ${(assessment.risk_level * 100).toFixed(0)}%)`);

      // Step 5: Veto gate makes decision
      const vetoInput: VetoGateInput = {
        performer_response: performerResponse,
        analyst_assessment: assessment,
        context: {
          incoming_message: message,
          topic: context.current_topic,
          urgency: 'medium', // Could be enhanced to detect urgency
        },
      };
      const vetoOutput = this.vetoGate.process(vetoInput);
      this.emit({ type: 'veto_decision', decision: vetoOutput });
      this.log(`Veto: ${vetoOutput.decision} - ${vetoOutput.reason}`);

      // Step 6: Handle the decision
      let response: string | undefined;
      if (vetoOutput.decision === 'approve' || vetoOutput.decision === 'modify') {
        response = vetoOutput.final_message;
        this.state.pending_response = response;

        // Add our response to conversation
        if (response) {
          this.addToConversation('us', response);

          // Update drift assessment
          this.analyst.updateDriftAssessment(response, message);
        }
      } else if (vetoOutput.decision === 'escalate') {
        this.queueCommanderMessage({
          id: `CMD_${Date.now()}`,
          priority: 'high',
          type: 'request',
          content: vetoOutput.escalation_message || 'Escalation required',
          queued_at: new Date().toISOString(),
          delivery_attempts: 0,
        });
      }

      // Step 7: Update symbol state
      this.updateSymbolFromState(performerResponse, analysis, vetoOutput);

      // Step 8: Auto-validate if enabled
      if (this.config.auto_validate) {
        const report = this.validator.validate(this.symbol);
        this.emit({ type: 'validation_complete', report });

        if (!report.passed) {
          this.log(`Validation issues: ${report.issues.length}`);
        }
      }

      return {
        success: true,
        response,
        veto_decision: vetoOutput.decision,
        was_modified: vetoOutput.was_modified,
        analysis_summary: analysis.summary,
        updated_symbol: this.symbol,
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit({ type: 'error', error: err });
      this.log(`Error: ${err.message}`);

      return {
        success: false,
        veto_decision: 'block',
        was_modified: false,
        analysis_summary: `Error: ${err.message}`,
        updated_symbol: this.symbol,
        error: err.message,
      };
    }
  }

  /**
   * Get the pending response to send.
   * Call this after processIncomingMessage to get the response to send.
   * The Stealth layer should be applied to this before actual sending.
   */
  getPendingResponse(): string | undefined {
    const response = this.state.pending_response;
    this.state.pending_response = undefined;
    return response;
  }

  /**
   * Confirm that a response was sent.
   * Call this after the Stealth layer has sent the message.
   */
  confirmResponseSent(response: string): void {
    this.emit({ type: 'response_sent', response });
    this.log(`Sent: "${response.substring(0, 50)}..."`);

    // Update conversation state
    const newConversationState: Partial<ConversationState> = {
      message_count: this.state.conversation.length,
      our_message_count: this.state.conversation.filter(m => m.speaker === 'us').length,
      their_message_count: this.state.conversation.filter(m => m.speaker === 'them').length,
      last_speaker: 'us',
    };

    this.symbol = updateSymbolState(this.symbol, {
      engagement: {
        conversation: {
          ...this.symbol.state.engagement.conversation,
          ...newConversationState,
        },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current symbol.
   */
  getSymbol(): MarineReconSymbol {
    return this.symbol;
  }

  /**
   * Get symbol summary for logging/display.
   */
  getSymbolSummary(): object {
    return createSymbolSummary(this.symbol);
  }

  /**
   * Update the symbol from an external source (e.g., ralph-loop refresh).
   */
  refreshSymbol(newSymbol: MarineReconSymbol): void {
    // Verify this is the same symbol
    if (newSymbol.symbol_id !== this.symbol.symbol_id) {
      throw new Error('Symbol ID mismatch');
    }

    // Check for immutable field changes
    const immutableFields = this.symbol.config.ralph_loop.symbol_refresh.immutable_fields;
    for (const field of immutableFields) {
      const oldValue = this.getNestedValue(this.symbol, field);
      const newValue = this.getNestedValue(newSymbol, field);
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        this.log(`Warning: Immutable field ${field} was changed in refresh`);
        // Depending on config, could reject or accept
      }
    }

    // Merge or replace based on config
    const onChangePolicy = this.symbol.config.ralph_loop.symbol_refresh.on_change;
    if (onChangePolicy === 'accept') {
      this.symbol = newSymbol;
    } else if (onChangePolicy === 'merge') {
      // Keep local state, accept config changes
      this.symbol = {
        ...newSymbol,
        state: this.symbol.state, // Keep local state
        version: Math.max(this.symbol.version, newSymbol.version),
      };
    } else if (onChangePolicy === 'alert') {
      // Queue alert but don't change
      this.queueCommanderMessage({
        id: `ALERT_${Date.now()}`,
        priority: 'medium',
        type: 'alert',
        content: 'Symbol refresh available but not applied (policy: alert)',
        queued_at: new Date().toISOString(),
        delivery_attempts: 0,
      });
    }
    // 'reject' does nothing

    // Re-initialize tracks with updated config
    this.performer = createPerformerFromSymbol(this.symbol);
    this.analyst = createAnalystFromSymbol(this.symbol);
    this.vetoGate = createVetoGateFromSymbol(this.symbol);

    this.log('Symbol refreshed');
  }

  /**
   * Run manual validation.
   */
  validate(): ValidationReport {
    const report = this.validator.validate(this.symbol);
    this.emit({ type: 'validation_complete', report });
    return report;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add an event listener.
   */
  addEventListener(listener: RuntimeEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(listener: RuntimeEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event to all listeners.
   */
  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private addToConversation(speaker: 'us' | 'them', content: string): void {
    const message: ConversationMessage = {
      speaker,
      content,
      timestamp: new Date().toISOString(),
    };

    this.state.conversation.push(message);

    // Trim history if needed
    if (this.state.conversation.length > this.config.max_history) {
      this.state.conversation = this.state.conversation.slice(-this.config.max_history);
    }
  }

  private updateStatus(newStatus: ReconMissionStatus): void {
    const oldStatus = this.symbol.state.engagement.status;
    if (oldStatus !== newStatus) {
      this.emit({ type: 'status_change', old: oldStatus, new: newStatus });
      this.symbol = updateSymbolState(this.symbol, {
        engagement: { status: newStatus },
      });
    }
  }

  private updateAlertLevel(analysis: MessageAnalysis): void {
    // Determine appropriate alert level based on analysis
    let newLevel: AlertLevel = 'green';

    if (analysis.risk_score > 0.7) {
      newLevel = 'red';
    } else if (analysis.risk_score > 0.5 || analysis.tactics_detected.length >= 3) {
      newLevel = 'orange';
    } else if (analysis.risk_score > 0.3 || analysis.tactics_detected.length >= 1) {
      newLevel = 'yellow';
    }

    const oldLevel = this.symbol.state.engagement.alert_level;
    if (oldLevel !== newLevel) {
      this.emit({ type: 'alert_level_change', old: oldLevel, new: newLevel });
      this.symbol = updateSymbolState(this.symbol, {
        engagement: { alert_level: newLevel },
      });
    }
  }

  private updateSymbolFromState(
    performerResponse: ReturnType<Performer['generateResponse']>,
    analysis: MessageAnalysis,
    vetoOutput: VetoGateOutput
  ): void {
    // Compute conversation counts from internal state
    const conversationUpdate = {
      ...this.symbol.state.engagement.conversation,
      message_count: this.state.conversation.length,
      our_message_count: this.state.conversation.filter(m => m.speaker === 'us').length,
      their_message_count: this.state.conversation.filter(m => m.speaker === 'them').length,
      last_speaker: (this.state.conversation.length > 0
        ? this.state.conversation[this.state.conversation.length - 1].speaker === 'us' ? 'us' : 'them'
        : 'us') as 'us' | 'them',
    };

    this.symbol = updateSymbolState(this.symbol, {
      engagement: {
        conversation: conversationUpdate,
        performer_state: this.performer.getState(),
        analyst_state: this.analyst.getState(),
        intelligence: {
          ...this.symbol.state.engagement.intelligence,
          observations: [
            ...this.symbol.state.engagement.intelligence.observations,
            ...analysis.extracted_info.map(info => ({
              timestamp: new Date().toISOString(),
              content: `[${info.type}] ${info.content}`,
              category: 'behavior' as const,
              significance: info.confidence,
            })),
          ],
        },
      },
    });
  }

  private queueCommanderMessage(message: CommanderMessage): void {
    this.symbol = updateSymbolState(this.symbol, {
      validation: {
        commander_queue: [
          ...this.symbol.state.validation.commander_queue,
          message,
        ],
      },
    });
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[ReconRuntime] ${message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a runtime from a symbol.
 */
export function createRuntime(
  symbol: MarineReconSymbol,
  config?: Partial<RuntimeConfig>
): ReconAgentRuntime {
  return new ReconAgentRuntime(symbol, config);
}
