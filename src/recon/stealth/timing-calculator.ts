/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TIMING CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Calculates human-like response timing to make the agent appear natural.
 * Handles read time, think time, and distraction delays.
 *
 * Key Concepts:
 * - Read Time: How long to "read" their message before starting to respond
 * - Think Time: Pause between reading and typing
 * - Distraction Delays: Random interruptions (checking phone, etc.)
 * - Total Response Time: Sum of all delays
 *
 * Human patterns modeled:
 * - Longer messages take longer to read
 * - Complex topics require more think time
 * - Emotional content affects response speed
 * - Fatigue increases all times
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { TimingConfig, BehavioralConfig } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculated timing for a response.
 */
export interface ResponseTiming {
  /** Time to read their message (ms) */
  read_time_ms: number;

  /** Time to think before typing (ms) */
  think_time_ms: number;

  /** Distraction delay if any (ms) */
  distraction_delay_ms: number;

  /** Total delay before typing starts (ms) */
  total_pre_typing_delay_ms: number;

  /** Explanation of timing */
  explanation: string;
}

/**
 * Message characteristics for timing calculation.
 */
export interface MessageCharacteristics {
  /** Word count */
  word_count: number;

  /** Character count */
  char_count: number;

  /** Is it a question? */
  is_question: boolean;

  /** Emotional intensity (0-1) */
  emotional_intensity: number;

  /** Complexity (0-1) */
  complexity: number;

  /** Contains numbers or data? */
  contains_data: boolean;

  /** Is it bad news? */
  is_negative: boolean;
}

/**
 * Session state for timing adjustments.
 */
export interface TimingState {
  /** Messages received this session */
  messages_received: number;

  /** Session start time */
  session_start: number;

  /** Last message time */
  last_message_time: number;

  /** Cumulative delay used */
  cumulative_delay_ms: number;

  /** Current speed modifier from fatigue */
  fatigue_modifier: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates human-like response timing.
 */
export class TimingCalculator {
  private config: TimingConfig;
  private behavioralConfig: BehavioralConfig;
  private state: TimingState;

  constructor(timingConfig: TimingConfig, behavioralConfig: BehavioralConfig) {
    this.config = timingConfig;
    this.behavioralConfig = behavioralConfig;
    this.state = {
      messages_received: 0,
      session_start: Date.now(),
      last_message_time: Date.now(),
      cumulative_delay_ms: 0,
      fatigue_modifier: 1.0,
    };
  }

  /**
   * Calculate timing for responding to a message.
   */
  calculateResponseTiming(theirMessage: string): ResponseTiming {
    // Analyze message characteristics
    const characteristics = this.analyzeMessage(theirMessage);

    // Update session state
    this.updateState();

    // Calculate read time
    const read_time_ms = this.calculateReadTime(characteristics);

    // Calculate think time
    const think_time_ms = this.calculateThinkTime(characteristics);

    // Maybe add distraction
    const distraction_delay_ms = this.maybeAddDistraction();

    // Apply fatigue modifier
    const fatigue = this.state.fatigue_modifier;

    const total_pre_typing_delay_ms = Math.round(
      (read_time_ms + think_time_ms + distraction_delay_ms) * fatigue
    );

    // Track cumulative delay
    this.state.cumulative_delay_ms += total_pre_typing_delay_ms;

    // Build explanation
    const explanation = this.buildExplanation(
      characteristics,
      read_time_ms,
      think_time_ms,
      distraction_delay_ms,
      fatigue
    );

    return {
      read_time_ms: Math.round(read_time_ms * fatigue),
      think_time_ms: Math.round(think_time_ms * fatigue),
      distraction_delay_ms: Math.round(distraction_delay_ms),
      total_pre_typing_delay_ms,
      explanation,
    };
  }

  /**
   * Calculate just the read time for a message.
   */
  calculateReadTime(characteristics: MessageCharacteristics): number {
    const { word_count, complexity, contains_data, is_question } = characteristics;

    // Base read time
    let readTime = this.config.min_read_time_ms;

    // Add time per word
    readTime += word_count * this.config.read_time_per_word_ms;

    // Complex content takes longer
    if (complexity > 0.5) {
      readTime *= 1 + (complexity - 0.5) * 0.5;
    }

    // Data/numbers take longer to process
    if (contains_data) {
      readTime *= 1.3;
    }

    // Questions might be re-read
    if (is_question) {
      readTime *= 1.1;
    }

    // Add some randomness
    readTime *= 0.8 + Math.random() * 0.4;

    return readTime;
  }

  /**
   * Calculate think time before responding.
   */
  calculateThinkTime(characteristics: MessageCharacteristics): number {
    const { complexity, is_question, is_negative, emotional_intensity } = characteristics;

    // Get base think time from config range
    const { min, max } = this.config.think_time_ms;
    let thinkTime = min + Math.random() * (max - min);

    // Complex questions need more thought
    if (is_question && complexity > 0.5) {
      thinkTime *= 1.5;
    }

    // Negative/bad news triggers longer processing
    if (is_negative) {
      thinkTime *= 1.3;
    }

    // High emotional content affects think time
    if (emotional_intensity > 0.7) {
      // Either quick emotional response or slower careful response
      thinkTime *= Math.random() > 0.5 ? 0.7 : 1.4;
    }

    return thinkTime;
  }

  /**
   * Maybe add a distraction delay.
   */
  maybeAddDistraction(): number {
    if (!this.behavioralConfig.attention_wandering) {
      // Still can have random distractions
      if (Math.random() < this.config.distraction_probability) {
        const { min, max } = this.config.distraction_delay_ms;
        return min + Math.random() * (max - min);
      }
      return 0;
    }

    // With attention wandering enabled, more likely to have distractions
    const adjustedProbability = this.config.distraction_probability *
      (1 + this.state.fatigue_modifier - 1); // More distractions when tired

    if (Math.random() < adjustedProbability) {
      const { min, max } = this.config.distraction_delay_ms;
      return min + Math.random() * (max - min);
    }

    return 0;
  }

  /**
   * Analyze message characteristics for timing calculation.
   */
  analyzeMessage(message: string): MessageCharacteristics {
    const words = message.split(/\s+/).filter(w => w.length > 0);
    const word_count = words.length;
    const char_count = message.length;

    // Check if question
    const is_question = /\?/.test(message) ||
      /^(what|who|where|when|why|how|can|could|would|should|is|are|do|does|did)/i.test(message);

    // Estimate complexity (very rough heuristic)
    const avgWordLength = char_count / Math.max(word_count, 1);
    const hasNumbers = /\d/.test(message);
    const hasTechTerms = /\b(policy|system|account|process|verify|confirm|documentation)\b/i.test(message);
    const sentenceCount = (message.match(/[.!?]+/g) || []).length || 1;
    const avgSentenceLength = word_count / sentenceCount;

    let complexity = 0;
    if (avgWordLength > 5) complexity += 0.2;
    if (avgWordLength > 7) complexity += 0.2;
    if (hasNumbers) complexity += 0.15;
    if (hasTechTerms) complexity += 0.2;
    if (avgSentenceLength > 15) complexity += 0.15;
    if (word_count > 50) complexity += 0.1;
    complexity = Math.min(1, complexity);

    // Estimate emotional intensity
    const emotionalWords = /\b(sorry|unfortunately|frustrated|angry|upset|disappointed|happy|great|excellent|terrible|awful|urgent|immediately|please|help)\b/i;
    const emotionalPunctuation = /[!]{2,}|\?{2,}/;
    const capsWords = message.split(/\s+/).filter(w => w === w.toUpperCase() && w.length > 2).length;

    let emotional_intensity = 0;
    if (emotionalWords.test(message)) emotional_intensity += 0.3;
    if (emotionalPunctuation.test(message)) emotional_intensity += 0.2;
    if (capsWords > 0) emotional_intensity += 0.2 * Math.min(capsWords / 3, 1);
    emotional_intensity = Math.min(1, emotional_intensity);

    // Check if negative
    const is_negative = /\b(sorry|unfortunately|cannot|can't|won't|unable|denied|rejected|no|not possible|failed)\b/i.test(message);

    return {
      word_count,
      char_count,
      is_question,
      emotional_intensity,
      complexity,
      contains_data: hasNumbers,
      is_negative,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private updateState(): void {
    const now = Date.now();
    this.state.messages_received++;
    this.state.last_message_time = now;

    // Update fatigue modifier
    if (this.behavioralConfig.fatigue_simulation) {
      const sessionDuration = now - this.state.session_start;
      if (sessionDuration > this.behavioralConfig.fatigue_onset_ms) {
        // Gradual slowdown, up to 30% slower
        const fatigueTime = sessionDuration - this.behavioralConfig.fatigue_onset_ms;
        this.state.fatigue_modifier = Math.min(1.3, 1 + (fatigueTime / 600000) * 0.1);
      }
    }
  }

  private buildExplanation(
    characteristics: MessageCharacteristics,
    readTime: number,
    thinkTime: number,
    distractionDelay: number,
    fatigue: number
  ): string {
    const parts: string[] = [];

    parts.push(`Read ${characteristics.word_count} words in ${Math.round(readTime)}ms`);

    if (characteristics.is_question) {
      parts.push('question detected');
    }

    if (characteristics.complexity > 0.5) {
      parts.push(`complex content (${Math.round(characteristics.complexity * 100)}%)`);
    }

    if (thinkTime > this.config.think_time_ms.min * 1.2) {
      parts.push(`extra think time: ${Math.round(thinkTime)}ms`);
    }

    if (distractionDelay > 0) {
      parts.push(`distraction: ${Math.round(distractionDelay)}ms`);
    }

    if (fatigue > 1.05) {
      parts.push(`fatigue modifier: ${fatigue.toFixed(2)}x`);
    }

    return parts.join(', ');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current timing state.
   */
  getState(): TimingState {
    return { ...this.state };
  }

  /**
   * Reset timing state.
   */
  resetState(): void {
    this.state = {
      messages_received: 0,
      session_start: Date.now(),
      last_message_time: Date.now(),
      cumulative_delay_ms: 0,
      fatigue_modifier: 1.0,
    };
  }

  /**
   * Get average response time so far.
   */
  getAverageResponseTime(): number {
    if (this.state.messages_received === 0) return 0;
    return this.state.cumulative_delay_ms / this.state.messages_received;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function after a calculated delay.
 */
export async function executeWithDelay<T>(
  timing: ResponseTiming,
  fn: () => T | Promise<T>
): Promise<T> {
  await sleep(timing.total_pre_typing_delay_ms);
  return fn();
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a TimingCalculator from config.
 */
export function createTimingCalculator(
  timingConfig: TimingConfig,
  behavioralConfig: BehavioralConfig
): TimingCalculator {
  return new TimingCalculator(timingConfig, behavioralConfig);
}
