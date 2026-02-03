/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TYPING SIMULATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Simulates human typing behavior to make the agent appear more natural.
 * Generates keystroke timings, pauses, and rhythm patterns that mimic
 * how humans actually type.
 *
 * Key Features:
 * - Variable typing speed based on WPM range
 * - Burst typing (fast start, slower middle, fast end)
 * - Natural pauses at punctuation and word boundaries
 * - Speed variation based on word complexity
 * - Fatigue simulation over time
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { TypingConfig, BehavioralConfig } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single keystroke event.
 */
export interface Keystroke {
  /** Character being typed */
  char: string;

  /** Delay before this keystroke (ms) */
  delay_ms: number;

  /** Is this a backspace (correction)? */
  is_backspace: boolean;

  /** Is this a pause (thinking)? */
  is_pause: boolean;
}

/**
 * A typing simulation result.
 */
export interface TypingSimulation {
  /** The message being typed */
  message: string;

  /** Keystroke sequence */
  keystrokes: Keystroke[];

  /** Total duration (ms) */
  total_duration_ms: number;

  /** Effective WPM */
  effective_wpm: number;

  /** Number of corrections simulated */
  correction_count: number;
}

/**
 * Typing state for fatigue simulation.
 */
export interface TypingState {
  /** Session start time */
  session_start: number;

  /** Characters typed this session */
  chars_typed: number;

  /** Current fatigue level (0-1) */
  fatigue_level: number;

  /** Current speed modifier (0.5-1.2) */
  speed_modifier: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulates human typing behavior.
 */
export class TypingSimulator {
  private config: TypingConfig;
  private behavioralConfig: BehavioralConfig;
  private state: TypingState;

  // Character categories for timing adjustments
  private static readonly PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', "'", '"']);
  private static readonly SHIFT_CHARS = new Set([
    '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+',
    '{', '}', '|', ':', '"', '<', '>', '?', '~',
    ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  ]);
  private static readonly COMMON_WORDS = new Set([
    'the', 'and', 'is', 'it', 'to', 'a', 'of', 'in', 'that', 'for',
    'you', 'was', 'with', 'on', 'are', 'as', 'be', 'this', 'have', 'from',
    'i', 'my', 'we', 'they', 'can', 'but', 'not', 'what', 'all', 'your',
  ]);

  constructor(config: TypingConfig, behavioralConfig: BehavioralConfig) {
    this.config = config;
    this.behavioralConfig = behavioralConfig;
    this.state = {
      session_start: Date.now(),
      chars_typed: 0,
      fatigue_level: 0,
      speed_modifier: 1.0,
    };
  }

  /**
   * Simulate typing a message.
   */
  simulateTyping(message: string): TypingSimulation {
    // Update fatigue if enabled
    if (this.behavioralConfig.fatigue_simulation) {
      this.updateFatigue();
    }

    const keystrokes: Keystroke[] = [];
    let totalDuration = 0;
    let correctionCount = 0;

    // Calculate base delay per character
    const baseWpm = this.getBaseWpm();
    const charsPerMinute = baseWpm * 5; // Average 5 chars per word
    const baseDelayMs = 60000 / charsPerMinute;

    // Process each character
    const chars = message.split('');
    let wordBuffer = '';
    let positionInWord = 0;
    let isStartOfMessage = true;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const prevChar = i > 0 ? chars[i - 1] : '';
      const nextChar = i < chars.length - 1 ? chars[i + 1] : '';

      // Calculate delay for this character
      let delay = this.calculateCharDelay(
        char,
        prevChar,
        nextChar,
        baseDelayMs,
        positionInWord,
        isStartOfMessage,
        wordBuffer
      );

      // Apply speed modifier from fatigue
      delay *= this.state.speed_modifier;

      // Apply overall variance
      delay *= 1 + (Math.random() - 0.5) * this.config.speed_variance * 2;

      // Add keystroke
      keystrokes.push({
        char,
        delay_ms: Math.round(delay),
        is_backspace: false,
        is_pause: false,
      });
      totalDuration += delay;

      // Track word progress
      if (char === ' ' || TypingSimulator.PUNCTUATION.has(char)) {
        wordBuffer = '';
        positionInWord = 0;
      } else {
        wordBuffer += char;
        positionInWord++;
      }

      isStartOfMessage = false;

      // Maybe add a pause
      if (this.shouldPause(char, i, chars.length)) {
        const pauseDuration = this.generatePauseDuration(char);
        keystrokes.push({
          char: '',
          delay_ms: pauseDuration,
          is_backspace: false,
          is_pause: true,
        });
        totalDuration += pauseDuration;
      }
    }

    // Update state
    this.state.chars_typed += chars.length;

    // Calculate effective WPM
    const minutes = totalDuration / 60000;
    const words = message.split(/\s+/).length;
    const effectiveWpm = minutes > 0 ? words / minutes : 0;

    return {
      message,
      keystrokes,
      total_duration_ms: Math.round(totalDuration),
      effective_wpm: Math.round(effectiveWpm),
      correction_count: correctionCount,
    };
  }

  /**
   * Get the keystrokes needed to type and potentially correct a message.
   * Includes typo simulation and corrections.
   */
  simulateTypingWithCorrections(
    originalMessage: string,
    typoPositions: number[]
  ): TypingSimulation {
    const keystrokes: Keystroke[] = [];
    let totalDuration = 0;
    let correctionCount = 0;

    const baseWpm = this.getBaseWpm();
    const charsPerMinute = baseWpm * 5;
    const baseDelayMs = 60000 / charsPerMinute;

    // Sort typo positions in ascending order
    const sortedTypos = [...typoPositions].sort((a, b) => a - b);
    let typoIndex = 0;

    const chars = originalMessage.split('');
    let position = 0;

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];

      // Check if this position should have a typo
      if (typoIndex < sortedTypos.length && i === sortedTypos[typoIndex]) {
        // Type the wrong character first
        const wrongChar = this.getAdjacentKey(char);
        const wrongDelay = baseDelayMs * (0.8 + Math.random() * 0.4);

        keystrokes.push({
          char: wrongChar,
          delay_ms: Math.round(wrongDelay),
          is_backspace: false,
          is_pause: false,
        });
        totalDuration += wrongDelay;

        // Maybe notice the mistake and correct it
        // Small delay before noticing
        const noticeDelay = 100 + Math.random() * 300;
        keystrokes.push({
          char: '',
          delay_ms: Math.round(noticeDelay),
          is_backspace: false,
          is_pause: true,
        });
        totalDuration += noticeDelay;

        // Backspace
        const backspaceDelay = 50 + Math.random() * 100;
        keystrokes.push({
          char: '',
          delay_ms: Math.round(backspaceDelay),
          is_backspace: true,
          is_pause: false,
        });
        totalDuration += backspaceDelay;

        correctionCount++;
        typoIndex++;
      }

      // Type the correct character
      const delay = baseDelayMs * (0.8 + Math.random() * 0.4) * this.state.speed_modifier;
      keystrokes.push({
        char,
        delay_ms: Math.round(delay),
        is_backspace: false,
        is_pause: false,
      });
      totalDuration += delay;
      position++;
    }

    this.state.chars_typed += chars.length + correctionCount * 2;

    const minutes = totalDuration / 60000;
    const words = originalMessage.split(/\s+/).length;
    const effectiveWpm = minutes > 0 ? words / minutes : 0;

    return {
      message: originalMessage,
      keystrokes,
      total_duration_ms: Math.round(totalDuration),
      effective_wpm: Math.round(effectiveWpm),
      correction_count: correctionCount,
    };
  }

  /**
   * Execute the typing simulation as async generator.
   * Yields keystrokes at appropriate intervals.
   */
  async *executeTyping(simulation: TypingSimulation): AsyncGenerator<Keystroke> {
    for (const keystroke of simulation.keystrokes) {
      // Wait for the delay
      if (keystroke.delay_ms > 0) {
        await this.sleep(keystroke.delay_ms);
      }

      // Yield the keystroke
      yield keystroke;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private getBaseWpm(): number {
    const { min, max } = this.config.wpm_range;
    // Use a normal distribution centered at the middle
    const mean = (min + max) / 2;
    const std = (max - min) / 4;
    let wpm = mean + this.gaussianRandom() * std;
    return Math.max(min, Math.min(max, wpm));
  }

  private calculateCharDelay(
    char: string,
    prevChar: string,
    nextChar: string,
    baseDelay: number,
    positionInWord: number,
    isStartOfMessage: boolean,
    currentWord: string
  ): number {
    let delay = baseDelay;

    // Burst typing: faster at word starts and ends
    if (this.config.burst_enabled) {
      if (positionInWord === 0) {
        // First char of word - slightly faster (momentum)
        delay *= 0.9;
      } else if (positionInWord >= 3) {
        // Middle of word - building rhythm, faster
        delay *= 0.85;
      }
    }

    // Shift characters take longer
    if (TypingSimulator.SHIFT_CHARS.has(char)) {
      delay *= 1.3;
    }

    // Punctuation often has a slight hesitation before
    if (TypingSimulator.PUNCTUATION.has(char)) {
      delay *= 1.2;
    }

    // Space after punctuation has natural pause
    if (char === ' ' && TypingSimulator.PUNCTUATION.has(prevChar)) {
      delay *= 1.4;
    }

    // Common words are typed faster (muscle memory)
    if (TypingSimulator.COMMON_WORDS.has(currentWord.toLowerCase())) {
      delay *= 0.85;
    }

    // Start of message is slower (thinking what to say)
    if (isStartOfMessage) {
      delay *= 1.5;
    }

    return delay;
  }

  private shouldPause(char: string, position: number, totalLength: number): boolean {
    // Pause at end of sentences
    if ((char === '.' || char === '!' || char === '?') && position < totalLength - 1) {
      return Math.random() < 0.6;
    }

    // Occasional pause at commas
    if (char === ',') {
      return Math.random() < this.config.pause_probability;
    }

    // Random thought pauses
    return Math.random() < this.config.pause_probability * 0.3;
  }

  private generatePauseDuration(char: string): number {
    // Longer pauses at sentence ends
    if (char === '.' || char === '!' || char === '?') {
      return 500 + Math.random() * 1000;
    }

    // Medium pauses at commas
    if (char === ',') {
      return 200 + Math.random() * 400;
    }

    // Short thinking pauses
    return 100 + Math.random() * 300;
  }

  private updateFatigue(): void {
    const sessionDuration = Date.now() - this.state.session_start;
    const fatigueOnset = this.behavioralConfig.fatigue_onset_ms;

    if (sessionDuration > fatigueOnset) {
      // Fatigue increases logarithmically after onset
      const fatigueTime = sessionDuration - fatigueOnset;
      this.state.fatigue_level = Math.min(0.5, Math.log(fatigueTime / 60000 + 1) * 0.1);

      // Speed decreases with fatigue
      this.state.speed_modifier = 1 + this.state.fatigue_level * 0.3;
    }
  }

  private getAdjacentKey(char: string): string {
    // Simple QWERTY adjacent key mapping
    const adjacentKeys: Record<string, string[]> = {
      'a': ['s', 'q', 'w', 'z'],
      'b': ['v', 'g', 'h', 'n'],
      'c': ['x', 'd', 'f', 'v'],
      'd': ['s', 'e', 'r', 'f', 'c', 'x'],
      'e': ['w', 'r', 'd', 's'],
      'f': ['d', 'r', 't', 'g', 'v', 'c'],
      'g': ['f', 't', 'y', 'h', 'b', 'v'],
      'h': ['g', 'y', 'u', 'j', 'n', 'b'],
      'i': ['u', 'o', 'k', 'j'],
      'j': ['h', 'u', 'i', 'k', 'm', 'n'],
      'k': ['j', 'i', 'o', 'l', 'm'],
      'l': ['k', 'o', 'p'],
      'm': ['n', 'j', 'k'],
      'n': ['b', 'h', 'j', 'm'],
      'o': ['i', 'p', 'l', 'k'],
      'p': ['o', 'l'],
      'q': ['w', 'a'],
      'r': ['e', 't', 'f', 'd'],
      's': ['a', 'w', 'e', 'd', 'x', 'z'],
      't': ['r', 'y', 'g', 'f'],
      'u': ['y', 'i', 'j', 'h'],
      'v': ['c', 'f', 'g', 'b'],
      'w': ['q', 'e', 's', 'a'],
      'x': ['z', 's', 'd', 'c'],
      'y': ['t', 'u', 'h', 'g'],
      'z': ['a', 's', 'x'],
    };

    const lowerChar = char.toLowerCase();
    const adjacent = adjacentKeys[lowerChar];

    if (adjacent && adjacent.length > 0) {
      const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];
      // Preserve case
      return char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
    }

    return char; // No adjacent key found, return original
  }

  private gaussianRandom(): number {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current typing state.
   */
  getState(): TypingState {
    return { ...this.state };
  }

  /**
   * Reset typing state (e.g., after a break).
   */
  resetState(): void {
    this.state = {
      session_start: Date.now(),
      chars_typed: 0,
      fatigue_level: 0,
      speed_modifier: 1.0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a TypingSimulator from config.
 */
export function createTypingSimulator(
  typingConfig: TypingConfig,
  behavioralConfig: BehavioralConfig
): TypingSimulator {
  return new TypingSimulator(typingConfig, behavioralConfig);
}
