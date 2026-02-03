/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BASE DELIVERY CHANNEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstract base class for delivery channels that integrates with the stealth layer.
 * Provides common functionality for:
 * - Applying typing simulation
 * - Calculating human-like delays
 * - Generating and handling typos
 *
 * Subclasses only need to implement the actual send mechanism.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  DeliveryChannel,
  DeliveryResult,
  DeliveryOptions,
  KeystrokeEvent,
  DeliveryProgress,
  DEFAULT_DELIVERY_OPTIONS,
} from './types';
import {
  TypingSimulator,
  createTypingSimulator,
  Keystroke,
  TypingSimulation,
} from '../stealth/typing-simulator';
import {
  TimingCalculator,
  createTimingCalculator,
  ResponseTiming,
} from '../stealth/timing-calculator';
import {
  TypoGenerator,
  createTypoGenerator,
  TypoResult,
} from '../stealth/typo-generator';
import {
  StealthConfig,
  TypingConfig,
  TimingConfig,
  ErrorConfig,
  BehavioralConfig,
  createDefaultStealthConfig,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstract base class for delivery channels with stealth integration.
 */
export abstract class BaseDeliveryChannel implements DeliveryChannel {
  abstract readonly name: string;
  abstract readonly description: string;

  protected typingSimulator: TypingSimulator;
  protected timingCalculator: TimingCalculator;
  protected typoGenerator: TypoGenerator;
  protected stealthConfig: StealthConfig;

  constructor(stealthConfig?: StealthConfig) {
    this.stealthConfig = stealthConfig ?? createDefaultStealthConfig();

    this.typingSimulator = createTypingSimulator(
      this.stealthConfig.typing,
      this.stealthConfig.behavioral
    );

    this.timingCalculator = createTimingCalculator(
      this.stealthConfig.timing,
      this.stealthConfig.behavioral
    );

    this.typoGenerator = createTypoGenerator(this.stealthConfig.errors);
  }

  /**
   * Check if the channel is available.
   * Override in subclasses that need availability checks.
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Send a message. Must be implemented by subclasses.
   */
  abstract send(message: string): Promise<DeliveryResult>;

  /**
   * Send a single keystroke. Must be implemented by subclasses.
   */
  abstract sendKeystroke(keystroke: KeystrokeEvent): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────────────────
  // STEALTH LAYER INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply the stealth layer to generate keystroke events for a message.
   *
   * @param message The message to process
   * @param options Delivery options
   * @returns Async generator yielding keystroke events
   */
  async *applyStealthLayer(
    message: string,
    options: DeliveryOptions = DEFAULT_DELIVERY_OPTIONS
  ): AsyncGenerator<KeystrokeEvent> {
    const startTime = Date.now();
    let cumulativeTime = 0;
    let sequence = 0;
    let messagePosition = 0;

    // Apply typos if enabled
    let messageToType = message;
    let typoResult: TypoResult | null = null;
    const correctionPositions: number[] = [];

    if (options.useTypos && this.stealthConfig.errors.typo_probability > 0) {
      typoResult = this.typoGenerator.generateTypos(message);
      correctionPositions.push(...typoResult.correction_positions);
    }

    // Generate typing simulation
    let simulation: TypingSimulation;
    if (options.useTypingSimulation) {
      if (typoResult && correctionPositions.length > 0) {
        simulation = this.typingSimulator.simulateTypingWithCorrections(
          message,
          correctionPositions
        );
      } else {
        simulation = this.typingSimulator.simulateTyping(message);
      }
    } else {
      // No simulation - just create instant keystrokes
      simulation = this.createInstantSimulation(message);
    }

    // Apply timing multiplier
    const multiplier = options.timingMultiplier;

    // Yield keystroke events
    for (const keystroke of simulation.keystrokes) {
      const adjustedDelay = Math.round(keystroke.delay_ms * multiplier);
      cumulativeTime += adjustedDelay;

      // Track message position
      if (!keystroke.is_backspace && !keystroke.is_pause && keystroke.char) {
        messagePosition++;
      } else if (keystroke.is_backspace && messagePosition > 0) {
        messagePosition--;
      }

      const event: KeystrokeEvent = {
        ...keystroke,
        delay_ms: adjustedDelay,
        sequence: sequence++,
        cumulative_time_ms: cumulativeTime,
        message_position: messagePosition,
        delivered: false,
      };

      yield event;
    }
  }

  /**
   * Calculate the pre-typing delay for responding to a message.
   *
   * @param theirMessage The message we're responding to
   * @param options Delivery options
   * @returns Response timing information
   */
  calculateDelay(
    theirMessage: string,
    options: DeliveryOptions = DEFAULT_DELIVERY_OPTIONS
  ): ResponseTiming {
    if (options.skipPreDelay) {
      return {
        read_time_ms: 0,
        think_time_ms: 0,
        distraction_delay_ms: 0,
        total_pre_typing_delay_ms: options.preDelayOverride ?? 0,
        explanation: 'Pre-delay skipped',
      };
    }

    if (options.preDelayOverride !== undefined) {
      return {
        read_time_ms: 0,
        think_time_ms: 0,
        distraction_delay_ms: 0,
        total_pre_typing_delay_ms: options.preDelayOverride,
        explanation: `Pre-delay override: ${options.preDelayOverride}ms`,
      };
    }

    const timing = this.timingCalculator.calculateResponseTiming(theirMessage);

    // Apply timing multiplier
    const multiplier = options.timingMultiplier;
    return {
      ...timing,
      read_time_ms: Math.round(timing.read_time_ms * multiplier),
      think_time_ms: Math.round(timing.think_time_ms * multiplier),
      distraction_delay_ms: Math.round(timing.distraction_delay_ms * multiplier),
      total_pre_typing_delay_ms: Math.round(timing.total_pre_typing_delay_ms * multiplier),
    };
  }

  /**
   * Generate typos for a message.
   *
   * @param message The message to add typos to
   * @returns Typo result with original, typo version, and corrections
   */
  generateTypos(message: string): TypoResult {
    return this.typoGenerator.generateTypos(message);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a delivery result.
   */
  protected createResult(
    success: boolean,
    options: {
      error?: string;
      metadata?: Record<string, unknown>;
      duration_ms?: number;
      keystroke_count?: number;
      correction_count?: number;
    } = {}
  ): DeliveryResult {
    return {
      success,
      timestamp: new Date().toISOString(),
      channel: this.name,
      ...options,
    };
  }

  /**
   * Create an instant (no delay) typing simulation.
   */
  protected createInstantSimulation(message: string): TypingSimulation {
    const keystrokes: Keystroke[] = message.split('').map((char) => ({
      char,
      delay_ms: 0,
      is_backspace: false,
      is_pause: false,
    }));

    return {
      message,
      keystrokes,
      total_duration_ms: 0,
      effective_wpm: Infinity,
      correction_count: 0,
    };
  }

  /**
   * Sleep for specified duration.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a progress update.
   */
  protected createProgress(
    delivered: number,
    total: number,
    currentKeystroke?: KeystrokeEvent,
    estimatedRemaining?: number
  ): DeliveryProgress {
    return {
      characters_delivered: delivered,
      total_characters: total,
      percent_complete: total > 0 ? Math.round((delivered / total) * 100) : 100,
      current_keystroke: currentKeystroke,
      estimated_remaining_ms: estimatedRemaining,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the current stealth configuration.
   */
  getStealthConfig(): StealthConfig {
    return { ...this.stealthConfig };
  }

  /**
   * Update the stealth configuration.
   */
  updateStealthConfig(config: Partial<StealthConfig>): void {
    this.stealthConfig = { ...this.stealthConfig, ...config };

    // Recreate components with new config
    if (config.typing || config.behavioral) {
      this.typingSimulator = createTypingSimulator(
        this.stealthConfig.typing,
        this.stealthConfig.behavioral
      );
    }

    if (config.timing || config.behavioral) {
      this.timingCalculator = createTimingCalculator(
        this.stealthConfig.timing,
        this.stealthConfig.behavioral
      );
    }

    if (config.errors) {
      this.typoGenerator = createTypoGenerator(this.stealthConfig.errors);
    }
  }

  /**
   * Get typing simulator state.
   */
  getTypingState() {
    return this.typingSimulator.getState();
  }

  /**
   * Get timing calculator state.
   */
  getTimingState() {
    return this.timingCalculator.getState();
  }

  /**
   * Reset all internal state.
   */
  resetState(): void {
    this.typingSimulator.resetState();
    this.timingCalculator.resetState();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for creating a base channel.
 */
export interface BaseChannelConfig {
  /** Stealth configuration */
  stealthConfig?: StealthConfig;

  /** Typing configuration (overrides stealthConfig.typing) */
  typingConfig?: TypingConfig;

  /** Timing configuration (overrides stealthConfig.timing) */
  timingConfig?: TimingConfig;

  /** Error configuration (overrides stealthConfig.errors) */
  errorConfig?: ErrorConfig;

  /** Behavioral configuration (overrides stealthConfig.behavioral) */
  behavioralConfig?: BehavioralConfig;
}

/**
 * Build a stealth config from individual configs.
 */
export function buildStealthConfig(config: BaseChannelConfig): StealthConfig {
  const base = config.stealthConfig ?? createDefaultStealthConfig();

  return {
    ...base,
    typing: config.typingConfig ?? base.typing,
    timing: config.timingConfig ?? base.timing,
    errors: config.errorConfig ?? base.errors,
    behavioral: config.behavioralConfig ?? base.behavioral,
  };
}
