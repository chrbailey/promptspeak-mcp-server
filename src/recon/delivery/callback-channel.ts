/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CALLBACK DELIVERY CHANNEL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A delivery channel that calls provided callback functions for message delivery.
 * Designed for integration with external systems like browser automation,
 * chat APIs, or custom message handlers.
 *
 * Features:
 * - Customizable callbacks for send, keystroke, and finalize
 * - Support for async callbacks
 * - Error handling with optional retry
 * - Progress tracking
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
 * Callback for sending a complete message.
 */
export type SendCallback = (message: string) => Promise<boolean> | boolean;

/**
 * Callback for sending a single keystroke.
 */
export type KeystrokeCallback = (keystroke: KeystrokeEvent) => Promise<boolean> | boolean;

/**
 * Callback for preparing before delivery.
 */
export type PrepareCallback = () => Promise<void> | void;

/**
 * Callback for finalizing after delivery.
 */
export type FinalizeCallback = () => Promise<void> | void;

/**
 * Callback for checking availability.
 */
export type AvailabilityCallback = () => Promise<boolean> | boolean;

/**
 * Configuration for the callback channel.
 */
export interface CallbackChannelConfig extends BaseChannelConfig {
  /** Channel name (default: 'callback') */
  name?: string;

  /** Channel description */
  description?: string;

  /** Callback for sending complete message (instant) */
  onSend?: SendCallback;

  /** Callback for sending individual keystrokes */
  onKeystroke?: KeystrokeCallback;

  /** Callback before starting delivery */
  onPrepare?: PrepareCallback;

  /** Callback after delivery completes */
  onFinalize?: FinalizeCallback;

  /** Callback to check availability */
  onCheckAvailability?: AvailabilityCallback;

  /** Whether to continue on keystroke failure */
  continueOnKeystrokeFailure?: boolean;

  /** Maximum keystroke failures before aborting */
  maxKeystrokeFailures?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALLBACK CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Delivery channel that uses callbacks for message delivery.
 */
export class CallbackChannel extends BaseDeliveryChannel {
  readonly name: string;
  readonly description: string;

  private onSend?: SendCallback;
  private onKeystroke?: KeystrokeCallback;
  private onPrepare?: PrepareCallback;
  private onFinalize?: FinalizeCallback;
  private onCheckAvailability?: AvailabilityCallback;
  private continueOnKeystrokeFailure: boolean;
  private maxKeystrokeFailures: number;

  constructor(config: CallbackChannelConfig = {}) {
    super(config.stealthConfig ? buildStealthConfig(config) : undefined);

    this.name = config.name ?? 'callback';
    this.description = config.description ?? 'Callback-based delivery channel';

    this.onSend = config.onSend;
    this.onKeystroke = config.onKeystroke;
    this.onPrepare = config.onPrepare;
    this.onFinalize = config.onFinalize;
    this.onCheckAvailability = config.onCheckAvailability;
    this.continueOnKeystrokeFailure = config.continueOnKeystrokeFailure ?? false;
    this.maxKeystrokeFailures = config.maxKeystrokeFailures ?? 3;
  }

  /**
   * Check if the channel is available.
   */
  async isAvailable(): Promise<boolean> {
    if (this.onCheckAvailability) {
      return await this.onCheckAvailability();
    }
    return true;
  }

  /**
   * Send a complete message using the send callback.
   */
  async send(message: string): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      if (!this.onSend) {
        throw new Error('No send callback configured');
      }

      const success = await this.onSend(message);

      return this.createResult(success, {
        duration_ms: Date.now() - startTime,
        keystroke_count: message.length,
        error: success ? undefined : 'Send callback returned false',
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
   * Send a single keystroke using the keystroke callback.
   */
  async sendKeystroke(keystroke: KeystrokeEvent): Promise<boolean> {
    if (!this.onKeystroke) {
      // No keystroke callback - silently succeed
      return true;
    }

    try {
      return await this.onKeystroke(keystroke);
    } catch {
      return false;
    }
  }

  /**
   * Prepare for delivery.
   */
  async prepareForDelivery(): Promise<void> {
    if (this.onPrepare) {
      await this.onPrepare();
    }
  }

  /**
   * Finalize the delivery.
   */
  async finalizeDelivery(): Promise<void> {
    if (this.onFinalize) {
      await this.onFinalize();
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
    let failures = 0;

    try {
      // Check availability
      if (!(await this.isAvailable())) {
        return this.createResult(false, {
          error: 'Channel not available',
          duration_ms: Date.now() - startTime,
        });
      }

      // Calculate pre-typing delay
      const timing = this.calculateDelay(options.context ?? '', options);

      // Wait for pre-typing delay
      await this.sleep(timing.total_pre_typing_delay_ms);

      // Prepare for delivery
      await this.prepareForDelivery();

      // Generate and process keystrokes
      for await (const keystroke of this.applyStealthLayer(message, options)) {
        // Wait for the keystroke delay
        if (keystroke.delay_ms > 0) {
          await this.sleep(keystroke.delay_ms);
        }

        // Send the keystroke
        const success = await this.sendKeystroke(keystroke);

        if (!success) {
          failures++;
          if (!this.continueOnKeystrokeFailure || failures >= this.maxKeystrokeFailures) {
            throw new Error(`Keystroke delivery failed at sequence ${keystroke.sequence}`);
          }
        }

        // Track stats
        if (keystroke.is_backspace) {
          correctionCount++;
        }
        keystrokeCount++;

        // Report progress
        if (options.onProgress) {
          options.onProgress(
            this.createProgress(
              keystroke.message_position,
              message.length,
              keystroke
            )
          );
        }
      }

      // Finalize delivery
      await this.finalizeDelivery();

      return this.createResult(true, {
        duration_ms: Date.now() - startTime,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
        metadata: { failures },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return this.createResult(false, {
        error: err.message,
        duration_ms: Date.now() - startTime,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
        metadata: { failures },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CALLBACK MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set the send callback.
   */
  setSendCallback(callback: SendCallback): void {
    this.onSend = callback;
  }

  /**
   * Set the keystroke callback.
   */
  setKeystrokeCallback(callback: KeystrokeCallback): void {
    this.onKeystroke = callback;
  }

  /**
   * Set the prepare callback.
   */
  setPrepareCallback(callback: PrepareCallback): void {
    this.onPrepare = callback;
  }

  /**
   * Set the finalize callback.
   */
  setFinalizeCallback(callback: FinalizeCallback): void {
    this.onFinalize = callback;
  }

  /**
   * Set the availability callback.
   */
  setAvailabilityCallback(callback: AvailabilityCallback): void {
    this.onCheckAvailability = callback;
  }

  /**
   * Set failure handling options.
   */
  setFailureHandling(continueOnFailure: boolean, maxFailures: number): void {
    this.continueOnKeystrokeFailure = continueOnFailure;
    this.maxKeystrokeFailures = maxFailures;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a callback channel with the specified callbacks.
 */
export function createCallbackChannel(config: CallbackChannelConfig): CallbackChannel {
  return new CallbackChannel(config);
}

/**
 * Create a callback channel for browser automation.
 *
 * @param typeChar Function to type a character into the browser
 * @param pressBackspace Function to press backspace
 * @param pressEnter Function to press enter/send
 * @param focusInput Function to focus the input element
 * @param stealthConfig Optional stealth configuration
 */
export function createBrowserCallbackChannel(
  typeChar: (char: string) => Promise<void> | void,
  pressBackspace: () => Promise<void> | void,
  pressEnter: () => Promise<void> | void,
  focusInput?: () => Promise<void> | void,
  stealthConfig?: StealthConfig
): CallbackChannel {
  return new CallbackChannel({
    name: 'browser',
    description: 'Browser automation callback channel',
    stealthConfig,

    onPrepare: focusInput,

    onKeystroke: async (keystroke) => {
      if (keystroke.is_pause) {
        return true;
      }
      if (keystroke.is_backspace) {
        await pressBackspace();
        return true;
      }
      if (keystroke.char) {
        await typeChar(keystroke.char);
        return true;
      }
      return true;
    },

    onFinalize: pressEnter,

    continueOnKeystrokeFailure: false,
    maxKeystrokeFailures: 3,
  });
}

/**
 * Create a callback channel that collects keystrokes into a buffer.
 * Useful for testing or capturing output without side effects.
 */
export function createBufferCallbackChannel(
  buffer: { text: string; keystrokes: KeystrokeEvent[] } = { text: '', keystrokes: [] },
  stealthConfig?: StealthConfig
): CallbackChannel {
  return new CallbackChannel({
    name: 'buffer',
    description: 'Buffer callback channel for testing',
    stealthConfig,

    onPrepare: () => {
      buffer.text = '';
      buffer.keystrokes = [];
    },

    onKeystroke: (keystroke) => {
      buffer.keystrokes.push(keystroke);
      if (keystroke.is_backspace) {
        buffer.text = buffer.text.slice(0, -1);
      } else if (!keystroke.is_pause && keystroke.char) {
        buffer.text += keystroke.char;
      }
      return true;
    },

    onSend: (message) => {
      buffer.text = message;
      return true;
    },
  });
}

/**
 * Create a callback channel that integrates with an API endpoint.
 *
 * @param sendToApi Function to send a message to the API
 * @param stealthConfig Optional stealth configuration
 */
export function createApiCallbackChannel(
  sendToApi: (message: string) => Promise<boolean>,
  stealthConfig?: StealthConfig
): CallbackChannel {
  let messageBuffer = '';

  return new CallbackChannel({
    name: 'api',
    description: 'API callback channel',
    stealthConfig,

    onPrepare: () => {
      messageBuffer = '';
    },

    onKeystroke: (keystroke) => {
      if (keystroke.is_backspace) {
        messageBuffer = messageBuffer.slice(0, -1);
      } else if (!keystroke.is_pause && keystroke.char) {
        messageBuffer += keystroke.char;
      }
      return true;
    },

    onFinalize: async () => {
      await sendToApi(messageBuffer);
    },

    onSend: sendToApi,
  });
}
