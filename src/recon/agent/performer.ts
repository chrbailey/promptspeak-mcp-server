/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERFORMER TRACK
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Performer is the "human surface" of the dual-track agent.
 * It generates responses that appear natural and human-like while
 * maintaining persona consistency.
 *
 * Key Responsibilities:
 * - Generate contextually appropriate responses
 * - Maintain emotional consistency
 * - Track persona characteristics
 * - Handle conversation flow naturally
 *
 * The Performer does NOT:
 * - Make strategic decisions (that's the Analyst)
 * - Send messages directly (that's the Veto Gate's job)
 * - Detect manipulation (that's the Analyst)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  PerformerConfig,
  PerformerState,
  EmotionalState,
  EmotionEvolutionRule,
  Persona,
  CommunicationStyle,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Input context for generating a response.
 */
export interface ResponseContext {
  /** The message we're responding to */
  incoming_message: string;

  /** Conversation history (recent messages) */
  conversation_history: ConversationMessage[];

  /** Current topic being discussed */
  current_topic: string;

  /** Our objective for this response */
  response_objective: string;

  /** Analyst guidance (optional) */
  analyst_guidance?: AnalystGuidance;
}

/**
 * A message in the conversation history.
 */
export interface ConversationMessage {
  /** Who sent it */
  speaker: 'us' | 'them';

  /** Message content */
  content: string;

  /** Timestamp */
  timestamp: string;
}

/**
 * Guidance from the Analyst track.
 */
export interface AnalystGuidance {
  /** Suggested approach */
  approach?: string;

  /** Points to emphasize */
  emphasize?: string[];

  /** Things to avoid saying */
  avoid?: string[];

  /** Maximum concession allowed */
  max_concession?: string;

  /** Emotional tone recommendation */
  tone_recommendation?: EmotionalState['primary'];
}

/**
 * Generated response from the Performer.
 */
export interface PerformerResponse {
  /** The generated message */
  message: string;

  /** Confidence in this response (0-1) */
  confidence: number;

  /** Emotional state after this response */
  new_emotional_state: EmotionalState;

  /** Was this improvised (deviated from normal patterns)? */
  improvised: boolean;

  /** Reasoning for this response */
  reasoning: string;

  /** Alternative responses considered */
  alternatives?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Performer track - generates human-like responses.
 */
export class Performer {
  private config: PerformerConfig;
  private state: PerformerState;
  private conversationContext: string[] = [];

  constructor(config: PerformerConfig, initialState: PerformerState) {
    this.config = config;
    this.state = { ...initialState };
  }

  /**
   * Generate a response to an incoming message.
   */
  generateResponse(context: ResponseContext): PerformerResponse {
    // Update emotional state based on incoming message
    this.updateEmotionalState(context.incoming_message);

    // Generate response based on persona and emotional state
    const response = this.craftResponse(context);

    // Check persona consistency
    const consistencyScore = this.assessConsistency(response.message);
    this.state.persona_consistency = (this.state.persona_consistency + consistencyScore) / 2;

    return response;
  }

  /**
   * Update emotional state based on incoming message.
   */
  private updateEmotionalState(message: string): void {
    const triggers = this.detectEmotionalTriggers(message);

    for (const trigger of triggers) {
      const rule = this.findEvolutionRule(trigger);
      if (rule) {
        this.applyEmotionRule(rule);
      }
    }

    // Natural decay toward baseline (patience restores slowly)
    this.state.emotional_state.patience = Math.min(
      1.0,
      this.state.emotional_state.patience + 0.02
    );
  }

  /**
   * Detect emotional triggers in a message.
   */
  private detectEmotionalTriggers(message: string): string[] {
    const triggers: string[] = [];
    const messageLower = message.toLowerCase();

    // Rejection triggers
    if (
      messageLower.includes("can't") ||
      messageLower.includes('cannot') ||
      messageLower.includes('unable') ||
      messageLower.includes('not possible') ||
      messageLower.includes('unfortunately')
    ) {
      triggers.push('rejection');
    }

    // Delay triggers
    if (
      messageLower.includes('wait') ||
      messageLower.includes('hold') ||
      messageLower.includes('moment') ||
      messageLower.includes('processing')
    ) {
      triggers.push('delay');
    }

    // Resolution triggers
    if (
      messageLower.includes('resolved') ||
      messageLower.includes('approved') ||
      messageLower.includes("i've processed") ||
      messageLower.includes('complete')
    ) {
      triggers.push('resolution');
    }

    // Dismissal triggers
    if (
      messageLower.includes('policy') ||
      messageLower.includes('nothing i can do') ||
      messageLower.includes('rules')
    ) {
      triggers.push('dismissal');
    }

    // Empathy triggers
    if (
      messageLower.includes('understand') ||
      messageLower.includes('sorry to hear') ||
      messageLower.includes('appreciate')
    ) {
      triggers.push('empathy');
    }

    return triggers;
  }

  /**
   * Find the evolution rule for a trigger.
   */
  private findEvolutionRule(trigger: string): EmotionEvolutionRule | null {
    return this.config.emotional_range.evolution_rules.find(r => r.trigger === trigger) || null;
  }

  /**
   * Apply an emotion evolution rule.
   */
  private applyEmotionRule(rule: EmotionEvolutionRule): void {
    const effect = rule.effect;

    if (effect.primary) {
      this.state.emotional_state.primary = effect.primary;
    }
    if (effect.intensity !== undefined) {
      this.state.emotional_state.intensity = Math.max(0, Math.min(1, effect.intensity));
    }
    if (effect.patience !== undefined) {
      // Patience changes are multiplicative, not absolute
      this.state.emotional_state.patience *= effect.patience;
      this.state.emotional_state.patience = Math.max(0, Math.min(1, this.state.emotional_state.patience));
    }
    if (effect.trust !== undefined) {
      // Trust changes are multiplicative
      this.state.emotional_state.trust *= effect.trust;
      this.state.emotional_state.trust = Math.max(0, Math.min(1, this.state.emotional_state.trust));
    }
  }

  /**
   * Craft a response based on context and emotional state.
   */
  private craftResponse(context: ResponseContext): PerformerResponse {
    const { incoming_message, response_objective, analyst_guidance } = context;

    // Determine tone based on emotional state
    const tone = analyst_guidance?.tone_recommendation || this.state.emotional_state.primary;

    // Build response components
    const components = this.buildResponseComponents(
      incoming_message,
      response_objective,
      tone,
      analyst_guidance
    );

    // Assemble message
    const message = this.assembleMessage(components);

    // Determine if this was improvised
    const improvised = this.isImprovised(components, context);
    if (improvised) {
      this.state.improvisation_count++;
    }

    return {
      message,
      confidence: this.calculateConfidence(components),
      new_emotional_state: { ...this.state.emotional_state },
      improvised,
      reasoning: `Generated ${tone} response to achieve: ${response_objective}`,
    };
  }

  /**
   * Build the components of a response.
   */
  private buildResponseComponents(
    incoming: string,
    objective: string,
    tone: EmotionalState['primary'],
    guidance?: AnalystGuidance
  ): ResponseComponents {
    const components: ResponseComponents = {
      acknowledgment: this.generateAcknowledgment(incoming, tone),
      core_message: this.generateCoreMessage(objective, guidance),
      closing: this.generateClosing(tone),
    };

    // Adjust based on style
    components.core_message = this.applyStyle(components.core_message);

    return components;
  }

  /**
   * Generate an acknowledgment of their message.
   */
  private generateAcknowledgment(incoming: string, tone: EmotionalState['primary']): string {
    const acknowledgments: Record<EmotionalState['primary'], string[]> = {
      neutral: ['I see.', 'Okay.', 'Got it.'],
      hopeful: ['Thanks for looking into this!', 'Great, thanks.'],
      frustrated: ['Look,', 'I understand, but', 'Right, but'],
      angry: ["That's not acceptable.", 'No,'],
      confused: ["I'm not sure I follow.", 'Wait,', "Hmm, I don't understand."],
      satisfied: ['Perfect, thanks.', 'That works.'],
    };

    const options = acknowledgments[tone] || acknowledgments.neutral;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate the core message content.
   */
  private generateCoreMessage(objective: string, guidance?: AnalystGuidance): string {
    // This would be enhanced with actual NLG, but for now we construct templates
    let message = objective;

    // Apply emphasis points
    if (guidance?.emphasize && guidance.emphasize.length > 0) {
      message = `${message} I really need ${guidance.emphasize[0]}.`;
    }

    return message;
  }

  /**
   * Generate a closing based on tone.
   */
  private generateClosing(tone: EmotionalState['primary']): string {
    const closings: Record<EmotionalState['primary'], string[]> = {
      neutral: ['', 'Thanks.'],
      hopeful: ['Looking forward to hearing back!', 'Thanks so much!'],
      frustrated: ['Can we please move this forward?', 'I need this resolved.'],
      angry: ['I expect a resolution.', "This needs to be fixed now."],
      confused: ['Could you clarify?', 'Can you explain that?'],
      satisfied: ['', 'Thanks for your help!'],
    };

    const options = closings[tone] || closings.neutral;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Apply communication style to a message.
   */
  private applyStyle(message: string): string {
    const { style } = this.config;

    // Apply contractions
    if (style.contractions) {
      message = message
        .replace(/\bi am\b/gi, "I'm")
        .replace(/\bdo not\b/gi, "don't")
        .replace(/\bcannot\b/gi, "can't")
        .replace(/\bwill not\b/gi, "won't")
        .replace(/\bthat is\b/gi, "that's")
        .replace(/\bit is\b/gi, "it's");
    }

    // Apply formality
    if (style.formality === 'casual') {
      message = message.replace(/\bplease\b/gi, 'pls');
    } else if (style.formality === 'formal') {
      message = message.replace(/\bthanks\b/gi, 'Thank you');
    }

    // Ensure length is within bounds
    const words = message.split(/\s+/);
    if (words.length < style.response_length.min) {
      // Pad with filler if too short
      message = message + ' ' + this.generateFiller(style.response_length.min - words.length);
    } else if (words.length > style.response_length.max) {
      // Truncate if too long
      message = words.slice(0, style.response_length.max).join(' ');
    }

    return message;
  }

  /**
   * Generate filler content.
   */
  private generateFiller(wordCount: number): string {
    const fillers = [
      'I really appreciate your help with this.',
      'This is quite important to me.',
      'I hope we can resolve this quickly.',
    ];
    return fillers[Math.floor(Math.random() * fillers.length)];
  }

  /**
   * Assemble message from components.
   */
  private assembleMessage(components: ResponseComponents): string {
    const parts = [
      components.acknowledgment,
      components.core_message,
      components.closing,
    ].filter(p => p.length > 0);

    return parts.join(' ').trim();
  }

  /**
   * Check if this response represents improvisation.
   */
  private isImprovised(components: ResponseComponents, context: ResponseContext): boolean {
    // Improvisation occurs when we deviate from expected patterns
    // For now, check if analyst guidance was overridden
    if (context.analyst_guidance?.avoid) {
      for (const avoid of context.analyst_guidance.avoid) {
        if (components.core_message.toLowerCase().includes(avoid.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate confidence in the response.
   */
  private calculateConfidence(components: ResponseComponents): number {
    let confidence = 0.8; // Base confidence

    // Reduce confidence if emotionally charged
    if (this.state.emotional_state.intensity > 0.7) {
      confidence -= 0.1;
    }

    // Reduce confidence if persona consistency is low
    confidence *= this.state.persona_consistency;

    return Math.max(0.3, Math.min(1.0, confidence));
  }

  /**
   * Assess how consistent a message is with the persona.
   */
  private assessConsistency(message: string): number {
    let score = 1.0;
    const { persona, style } = this.config;

    // Check style consistency
    const hasContractions = /\b(I'm|don't|can't|won't|that's|it's)\b/.test(message);
    if (style.contractions !== hasContractions) {
      score -= 0.1;
    }

    // Check formality consistency
    const hasFormalLanguage = /\b(kindly|regarding|pursuant|hereby)\b/i.test(message);
    if (style.formality === 'casual' && hasFormalLanguage) {
      score -= 0.15;
    }
    if (style.formality === 'formal' && !hasFormalLanguage && message.length > 50) {
      score -= 0.05;
    }

    // Check verbosity
    const wordCount = message.split(/\s+/).length;
    if (style.verbosity === 'terse' && wordCount > 30) {
      score -= 0.1;
    }
    if (style.verbosity === 'verbose' && wordCount < 20) {
      score -= 0.1;
    }

    // Check knowledge level
    if (persona.knowledge_level === 'novice') {
      const techTerms = /\b(API|backend|protocol|implementation)\b/i;
      if (techTerms.test(message)) {
        score -= 0.2;
      }
    }

    return Math.max(0.5, score);
  }

  /**
   * Get current state.
   */
  getState(): PerformerState {
    return { ...this.state };
  }

  /**
   * Update state from external source (e.g., symbol refresh).
   */
  updateState(newState: Partial<PerformerState>): void {
    this.state = { ...this.state, ...newState };
  }

  /**
   * Get current emotional state.
   */
  getEmotionalState(): EmotionalState {
    return { ...this.state.emotional_state };
  }

  /**
   * Check if frustration threshold is exceeded.
   */
  isFrustrationExceeded(): boolean {
    return this.state.emotional_state.intensity > this.config.emotional_range.frustration_threshold;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ResponseComponents {
  acknowledgment: string;
  core_message: string;
  closing: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Performer from a symbol.
 */
export function createPerformerFromSymbol(symbol: MarineReconSymbol): Performer {
  return new Performer(
    symbol.config.dual_track.performer,
    symbol.state.engagement.performer_state
  );
}
