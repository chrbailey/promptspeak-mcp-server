/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERY MANAGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Central manager for coordinating message delivery across multiple channels.
 * Provides a unified interface for delivering messages with stealth simulation.
 *
 * Features:
 * - Channel registration and management
 * - Default channel selection
 * - Fallback delivery on failure
 * - Event emission for monitoring
 * - Both instant and keystroke-by-keystroke delivery modes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  DeliveryChannel,
  DeliveryResult,
  DeliveryOptions,
  DeliveryManagerConfig,
  DeliveryEvent,
  DeliveryEventListener,
  DeliveryEventType,
  KeystrokeEvent,
  DeliveryProgress,
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_MANAGER_CONFIG,
} from './types';
import { BaseDeliveryChannel } from './base-channel';
import { StealthConfig, createDefaultStealthConfig } from '../types';
import {
  TypingSimulator,
  createTypingSimulator,
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

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERY MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages message delivery across multiple channels.
 */
export class DeliveryManager {
  private channels: Map<string, DeliveryChannel> = new Map();
  private defaultChannel?: string;
  private config: DeliveryManagerConfig;
  private listeners: Map<DeliveryEventType, Set<DeliveryEventListener>> = new Map();
  private stealthConfig: StealthConfig;

  // Stealth components for generating keystrokes
  private typingSimulator: TypingSimulator;
  private timingCalculator: TimingCalculator;
  private typoGenerator: TypoGenerator;

  constructor(
    config: Partial<DeliveryManagerConfig> = {},
    stealthConfig?: StealthConfig
  ) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
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

  // ─────────────────────────────────────────────────────────────────────────────
  // CHANNEL MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register a delivery channel.
   *
   * @param name Unique name for the channel
   * @param channel The channel implementation
   * @param setAsDefault Whether to set this as the default channel
   */
  registerChannel(
    name: string,
    channel: DeliveryChannel,
    setAsDefault: boolean = false
  ): void {
    this.channels.set(name, channel);

    if (setAsDefault || !this.defaultChannel) {
      this.defaultChannel = name;
    }
  }

  /**
   * Unregister a delivery channel.
   */
  unregisterChannel(name: string): boolean {
    const removed = this.channels.delete(name);

    if (this.defaultChannel === name) {
      // Set a new default if available
      const remaining = Array.from(this.channels.keys());
      this.defaultChannel = remaining.length > 0 ? remaining[0] : undefined;
    }

    return removed;
  }

  /**
   * Get a registered channel by name.
   */
  getChannel(name: string): DeliveryChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * Get all registered channel names.
   */
  getChannelNames(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * Set the default channel.
   */
  setDefaultChannel(name: string): boolean {
    if (!this.channels.has(name)) {
      return false;
    }
    this.defaultChannel = name;
    return true;
  }

  /**
   * Get the default channel name.
   */
  getDefaultChannel(): string | undefined {
    return this.defaultChannel;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELIVERY METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Deliver a message through the specified channel.
   *
   * @param channelName Name of the channel to use (or undefined for default)
   * @param message The message to deliver
   * @param options Delivery options
   * @returns Delivery result
   */
  async deliver(
    channelName: string | undefined,
    message: string,
    options: Partial<DeliveryOptions> = {}
  ): Promise<DeliveryResult> {
    const mergedOptions: DeliveryOptions = {
      ...this.config.defaultOptions,
      ...options,
    };

    const actualChannelName = channelName ?? this.defaultChannel;

    if (!actualChannelName) {
      return this.createFailureResult('No channel specified and no default channel set');
    }

    const channel = this.channels.get(actualChannelName);

    if (!channel) {
      return this.createFailureResult(`Channel '${actualChannelName}' not found`);
    }

    // Check availability
    if (!(await channel.isAvailable())) {
      // Try fallback if configured
      if (this.config.fallbackChannel && this.config.fallbackChannel !== actualChannelName) {
        this.emit('channel_switched', actualChannelName, { message });
        return this.deliver(this.config.fallbackChannel, message, options);
      }
      return this.createFailureResult(`Channel '${actualChannelName}' is not available`);
    }

    // Emit start event
    this.emit('delivery_start', actualChannelName, { message });

    // Attempt delivery with retry
    let lastResult: DeliveryResult | undefined;
    let attempts = 0;

    while (attempts < (this.config.autoRetry ? this.config.maxRetries : 1)) {
      attempts++;

      if (mergedOptions.useTypingSimulation && channel instanceof BaseDeliveryChannel) {
        // Use stealth delivery
        lastResult = await this.deliverWithStealthInternal(
          channel as BaseDeliveryChannel,
          message,
          mergedOptions
        );
      } else {
        // Instant delivery
        lastResult = await channel.send(message);
      }

      if (lastResult.success) {
        this.emit('delivery_complete', actualChannelName, { message, result: lastResult });
        return lastResult;
      }

      // Wait before retry
      if (attempts < this.config.maxRetries && this.config.autoRetry) {
        await this.sleep(this.config.retryDelay);
      }
    }

    // All attempts failed
    this.emit('delivery_error', actualChannelName, {
      message,
      result: lastResult,
      error: new Error(lastResult?.error ?? 'Delivery failed'),
    });

    // Try fallback
    if (this.config.fallbackChannel && this.config.fallbackChannel !== actualChannelName) {
      this.emit('channel_switched', actualChannelName, { message });
      return this.deliver(this.config.fallbackChannel, message, options);
    }

    return lastResult ?? this.createFailureResult('Delivery failed after all retries');
  }

  /**
   * Deliver a message with stealth simulation, yielding keystrokes as they occur.
   * Use this for fine-grained control over the delivery process.
   *
   * @param channelName Name of the channel to use
   * @param message The message to deliver
   * @param options Delivery options
   * @returns Async generator yielding keystroke events
   */
  async *deliverWithStealth(
    channelName: string | undefined,
    message: string,
    options: Partial<DeliveryOptions> = {}
  ): AsyncGenerator<KeystrokeEvent> {
    const mergedOptions: DeliveryOptions = {
      ...this.config.defaultOptions,
      ...options,
    };

    const actualChannelName = channelName ?? this.defaultChannel;

    if (!actualChannelName) {
      throw new Error('No channel specified and no default channel set');
    }

    const channel = this.channels.get(actualChannelName);

    if (!channel) {
      throw new Error(`Channel '${actualChannelName}' not found`);
    }

    // Check availability
    if (!(await channel.isAvailable())) {
      throw new Error(`Channel '${actualChannelName}' is not available`);
    }

    // Calculate pre-typing delay
    const timing = this.timingCalculator.calculateResponseTiming(
      mergedOptions.context ?? ''
    );

    if (!mergedOptions.skipPreDelay) {
      const delay = mergedOptions.preDelayOverride ?? timing.total_pre_typing_delay_ms;
      await this.sleep(Math.round(delay * mergedOptions.timingMultiplier));
    }

    // Prepare channel
    if (channel.prepareForDelivery) {
      await channel.prepareForDelivery();
    }

    this.emit('delivery_start', actualChannelName, { message });

    // Generate keystroke events
    const startTime = Date.now();
    let cumulativeTime = 0;
    let sequence = 0;
    let messagePosition = 0;

    // Apply typos if configured
    let typoResult: TypoResult | null = null;
    const correctionPositions: number[] = [];

    if (mergedOptions.useTypos && this.stealthConfig.errors.typo_probability > 0) {
      typoResult = this.typoGenerator.generateTypos(message);
      correctionPositions.push(...typoResult.correction_positions);
    }

    // Generate typing simulation
    const simulation = correctionPositions.length > 0
      ? this.typingSimulator.simulateTypingWithCorrections(message, correctionPositions)
      : this.typingSimulator.simulateTyping(message);

    const multiplier = mergedOptions.timingMultiplier;

    for (const keystroke of simulation.keystrokes) {
      const adjustedDelay = Math.round(keystroke.delay_ms * multiplier);
      cumulativeTime += adjustedDelay;

      // Track position
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

      // Wait for the delay
      if (adjustedDelay > 0) {
        await this.sleep(adjustedDelay);
      }

      // Send to channel
      const success = await channel.sendKeystroke(event);
      event.delivered = success;
      event.delivered_at = new Date().toISOString();

      // Emit keystroke event
      this.emit('keystroke_sent', actualChannelName, { keystroke: event });

      // Report progress
      if (mergedOptions.onProgress) {
        mergedOptions.onProgress({
          characters_delivered: messagePosition,
          total_characters: message.length,
          percent_complete: Math.round((messagePosition / message.length) * 100),
          current_keystroke: event,
          estimated_remaining_ms: cumulativeTime > 0
            ? Math.round(((message.length - messagePosition) / messagePosition) * cumulativeTime)
            : undefined,
        });
      }

      yield event;
    }

    // Finalize
    if (channel.finalizeDelivery) {
      await channel.finalizeDelivery();
    }

    const result: DeliveryResult = {
      success: true,
      timestamp: new Date().toISOString(),
      channel: actualChannelName,
      duration_ms: Date.now() - startTime,
      keystroke_count: sequence,
      correction_count: simulation.correction_count,
    };

    this.emit('delivery_complete', actualChannelName, { message, result });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add an event listener.
   */
  on(eventType: DeliveryEventType, listener: DeliveryEventListener): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  /**
   * Remove an event listener.
   */
  off(eventType: DeliveryEventType, listener: DeliveryEventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  /**
   * Add a one-time event listener.
   */
  once(eventType: DeliveryEventType, listener: DeliveryEventListener): void {
    const wrapper: DeliveryEventListener = (event) => {
      this.off(eventType, wrapper);
      listener(event);
    };
    this.on(eventType, wrapper);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update manager configuration.
   */
  updateConfig(config: Partial<DeliveryManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): DeliveryManagerConfig {
    return { ...this.config };
  }

  /**
   * Update stealth configuration.
   */
  updateStealthConfig(config: Partial<StealthConfig>): void {
    this.stealthConfig = { ...this.stealthConfig, ...config };

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
   * Get current stealth configuration.
   */
  getStealthConfig(): StealthConfig {
    return { ...this.stealthConfig };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async deliverWithStealthInternal(
    channel: BaseDeliveryChannel,
    message: string,
    options: DeliveryOptions
  ): Promise<DeliveryResult> {
    // If the channel has its own deliverWithStealth, use it
    if ('deliverWithStealth' in channel && typeof (channel as any).deliverWithStealth === 'function') {
      return (channel as any).deliverWithStealth(message, options);
    }

    // Otherwise, use the generator
    const startTime = Date.now();
    let keystrokeCount = 0;
    let correctionCount = 0;

    try {
      for await (const keystroke of this.deliverWithStealth(undefined, message, options)) {
        keystrokeCount++;
        if (keystroke.is_backspace) {
          correctionCount++;
        }
      }

      return {
        success: true,
        timestamp: new Date().toISOString(),
        channel: channel.name,
        duration_ms: Date.now() - startTime,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        timestamp: new Date().toISOString(),
        channel: channel.name,
        error: err.message,
        duration_ms: Date.now() - startTime,
        keystroke_count: keystrokeCount,
        correction_count: correctionCount,
      };
    }
  }

  private emit(
    type: DeliveryEventType,
    channel: string,
    data: Partial<Omit<DeliveryEvent, 'type' | 'timestamp' | 'channel'>>
  ): void {
    const event: DeliveryEvent = {
      type,
      timestamp: new Date().toISOString(),
      channel,
      ...data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  private createFailureResult(error: string): DeliveryResult {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      channel: 'none',
      error,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Close all channels and clean up.
   */
  async close(): Promise<void> {
    for (const channel of this.channels.values()) {
      if (channel.close) {
        await channel.close();
      }
    }
    this.channels.clear();
    this.listeners.clear();
    this.defaultChannel = undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a delivery manager with default configuration.
 */
export function createDeliveryManager(
  config?: Partial<DeliveryManagerConfig>,
  stealthConfig?: StealthConfig
): DeliveryManager {
  return new DeliveryManager(config, stealthConfig);
}

/**
 * Create a delivery manager from a Marine Recon symbol.
 */
export function createDeliveryManagerFromSymbol(
  symbol: { config: { stealth: StealthConfig } },
  config?: Partial<DeliveryManagerConfig>
): DeliveryManager {
  return new DeliveryManager(config, symbol.config.stealth);
}
