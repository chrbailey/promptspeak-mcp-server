/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONSOLE DELIVERY CHANNEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A simple delivery channel that outputs to the console.
 * Useful for testing, debugging, and demonstration purposes.
 *
 * Features:
 * - Outputs messages to console with formatting
 * - Can show keystroke-by-keystroke output
 * - Supports verbose mode with timing information
 * - Optional color output
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { BaseDeliveryChannel, BaseChannelConfig, buildStealthConfig } from './base-channel';
import { DeliveryResult, KeystrokeEvent, DeliveryOptions, DEFAULT_DELIVERY_OPTIONS } from './types';
import { StealthConfig } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the console channel.
 */
export interface ConsoleChannelConfig extends BaseChannelConfig {
  /** Prefix for output lines */
  prefix?: string;

  /** Use colors in output (ANSI escape codes) */
  useColors?: boolean;

  /** Show timing information */
  showTiming?: boolean;

  /** Show keystroke details */
  showKeystrokes?: boolean;

  /** Stream output (character by character) vs batch */
  streamOutput?: boolean;

  /** Custom output function (default: console.log) */
  outputFn?: (message: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLE CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Delivery channel that outputs to the console.
 */
export class ConsoleChannel extends BaseDeliveryChannel {
  readonly name = 'console';
  readonly description = 'Outputs messages to the console for testing/debugging';

  private prefix: string;
  private useColors: boolean;
  private showTiming: boolean;
  private showKeystrokes: boolean;
  private streamOutput: boolean;
  private outputFn: (message: string) => void;

  // ANSI color codes
  private static readonly COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
  };

  constructor(config: ConsoleChannelConfig = {}) {
    super(config.stealthConfig ? buildStealthConfig(config) : undefined);

    this.prefix = config.prefix ?? '[DELIVER]';
    this.useColors = config.useColors ?? true;
    this.showTiming = config.showTiming ?? false;
    this.showKeystrokes = config.showKeystrokes ?? false;
    this.streamOutput = config.streamOutput ?? false;
    this.outputFn = config.outputFn ?? console.log.bind(console);
  }

  /**
   * Send a complete message to the console.
   */
  async send(message: string): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      if (this.showTiming) {
        this.output(`Starting delivery of ${message.length} characters`, 'info');
      }

      // Output the message
      this.output(message, 'message');

      const duration = Date.now() - startTime;

      if (this.showTiming) {
        this.output(`Delivered in ${duration}ms`, 'timing');
      }

      return this.createResult(true, {
        duration_ms: duration,
        keystroke_count: message.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return this.createResult(false, {
        error: err.message,
        duration_ms: Date.now() - startTime,
      });
    }
  }

  /**
   * Send a single keystroke to the console.
   */
  async sendKeystroke(keystroke: KeystrokeEvent): Promise<boolean> {
    try {
      if (keystroke.is_pause) {
        if (this.showKeystrokes) {
          this.output(`[pause ${keystroke.delay_ms}ms]`, 'keystroke');
        }
        return true;
      }

      if (keystroke.is_backspace) {
        if (this.showKeystrokes) {
          this.output('[backspace]', 'keystroke');
        }
        if (this.streamOutput) {
          // For stream output, we'd need to handle backspace
          // In a real terminal, this would erase the previous character
          process.stdout.write('\b \b');
        }
        return true;
      }

      if (keystroke.char) {
        if (this.showKeystrokes) {
          this.output(
            `'${keystroke.char}' (delay: ${keystroke.delay_ms}ms, seq: ${keystroke.sequence})`,
            'keystroke'
          );
        }

        if (this.streamOutput) {
          process.stdout.write(keystroke.char);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prepare for a new message delivery.
   */
  async prepareForDelivery(): Promise<void> {
    if (this.streamOutput) {
      // Start a new line for streaming output
      this.output('', 'start');
    }
  }

  /**
   * Finalize the delivery.
   */
  async finalizeDelivery(): Promise<void> {
    if (this.streamOutput) {
      // End the streaming line
      process.stdout.write('\n');
    }
  }

  /**
   * Deliver a message with full stealth simulation.
   */
  async deliverWithStealth(
    message: string,
    options: DeliveryOptions = DEFAULT_DELIVERY_OPTIONS
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    let keystrokeCount = 0;
    let correctionCount = 0;
    let outputBuffer = '';

    try {
      // Calculate pre-typing delay
      const timing = this.calculateDelay(options.context ?? '', options);

      if (this.showTiming) {
        this.output(
          `Pre-typing delay: ${timing.total_pre_typing_delay_ms}ms (${timing.explanation})`,
          'timing'
        );
      }

      // Wait for pre-typing delay
      await this.sleep(timing.total_pre_typing_delay_ms);

      await this.prepareForDelivery();

      // Generate and process keystrokes
      for await (const keystroke of this.applyStealthLayer(message, options)) {
        // Wait for the keystroke delay
        if (keystroke.delay_ms > 0) {
          await this.sleep(keystroke.delay_ms);
        }

        // Process the keystroke
        await this.sendKeystroke(keystroke);

        // Track output
        if (keystroke.is_backspace) {
          outputBuffer = outputBuffer.slice(0, -1);
          correctionCount++;
        } else if (!keystroke.is_pause && keystroke.char) {
          outputBuffer += keystroke.char;
        }

        keystrokeCount++;
      }

      await this.finalizeDelivery();

      // If not streaming, output the final message
      if (!this.streamOutput) {
        this.output(outputBuffer, 'message');
      }

      const duration = Date.now() - startTime;

      if (this.showTiming) {
        this.output(
          `Completed: ${keystrokeCount} keystrokes, ${correctionCount} corrections, ${duration}ms total`,
          'timing'
        );
      }

      return this.createResult(true, {
        duration_ms: duration,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return this.createResult(false, {
        error: err.message,
        duration_ms: Date.now() - startTime,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private output(
    text: string,
    type: 'message' | 'info' | 'timing' | 'keystroke' | 'start'
  ): void {
    if (type === 'start') {
      return;
    }

    let formatted: string;

    if (this.useColors) {
      const c = ConsoleChannel.COLORS;
      switch (type) {
        case 'message':
          formatted = `${c.green}${this.prefix}${c.reset} ${c.bright}${text}${c.reset}`;
          break;
        case 'info':
          formatted = `${c.blue}${this.prefix}${c.reset} ${c.dim}${text}${c.reset}`;
          break;
        case 'timing':
          formatted = `${c.cyan}${this.prefix}${c.reset} ${c.gray}${text}${c.reset}`;
          break;
        case 'keystroke':
          formatted = `${c.magenta}  >>${c.reset} ${c.dim}${text}${c.reset}`;
          break;
        default:
          formatted = `${this.prefix} ${text}`;
      }
    } else {
      formatted = `${this.prefix} ${text}`;
    }

    this.outputFn(formatted);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set whether to use colors.
   */
  setUseColors(useColors: boolean): void {
    this.useColors = useColors;
  }

  /**
   * Set whether to show timing info.
   */
  setShowTiming(showTiming: boolean): void {
    this.showTiming = showTiming;
  }

  /**
   * Set whether to show keystrokes.
   */
  setShowKeystrokes(showKeystrokes: boolean): void {
    this.showKeystrokes = showKeystrokes;
  }

  /**
   * Set whether to stream output.
   */
  setStreamOutput(streamOutput: boolean): void {
    this.streamOutput = streamOutput;
  }

  /**
   * Set the output prefix.
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a console channel with default settings.
 */
export function createConsoleChannel(config?: ConsoleChannelConfig): ConsoleChannel {
  return new ConsoleChannel(config);
}

/**
 * Create a console channel configured for verbose debugging.
 */
export function createDebugConsoleChannel(
  stealthConfig?: StealthConfig
): ConsoleChannel {
  return new ConsoleChannel({
    stealthConfig,
    prefix: '[DEBUG]',
    useColors: true,
    showTiming: true,
    showKeystrokes: true,
    streamOutput: false,
  });
}

/**
 * Create a console channel configured for streaming output.
 */
export function createStreamingConsoleChannel(
  stealthConfig?: StealthConfig
): ConsoleChannel {
  return new ConsoleChannel({
    stealthConfig,
    prefix: '',
    useColors: false,
    showTiming: false,
    showKeystrokes: false,
    streamOutput: true,
  });
}

/**
 * Create a silent console channel (captures output but doesn't print).
 */
export function createSilentConsoleChannel(
  outputBuffer: string[] = []
): ConsoleChannel {
  return new ConsoleChannel({
    prefix: '',
    useColors: false,
    showTiming: false,
    showKeystrokes: false,
    streamOutput: false,
    outputFn: (message: string) => outputBuffer.push(message),
  });
}
