/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERY TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for the delivery layer that connects stealth components
 * to actual message delivery channels.
 *
 * Key Concepts:
 * - DeliveryChannel: Interface for different delivery mechanisms
 * - DeliveryResult: Outcome of a delivery attempt
 * - DeliveryOptions: Configuration for how to deliver
 * - KeystrokeEvent: Extended keystroke with delivery context
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Keystroke } from '../stealth/typing-simulator';

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of a delivery attempt.
 */
export interface DeliveryResult {
  /** Whether delivery succeeded */
  success: boolean;

  /** Timestamp of delivery completion */
  timestamp: string;

  /** Channel used for delivery */
  channel: string;

  /** Error message if failed */
  error?: string;

  /** Additional metadata from the channel */
  metadata?: Record<string, unknown>;

  /** Total time taken for delivery (ms) */
  duration_ms?: number;

  /** Number of keystrokes delivered */
  keystroke_count?: number;

  /** Number of corrections made during typing */
  correction_count?: number;
}

/**
 * Options for message delivery.
 */
export interface DeliveryOptions {
  /** Use typing simulation (character by character) */
  useTypingSimulation: boolean;

  /** Use typo generation and corrections */
  useTypos: boolean;

  /** Multiplier for all timing delays (0.5 = faster, 2.0 = slower) */
  timingMultiplier: number;

  /** Context for timing calculations (e.g., the message we're replying to) */
  context?: string;

  /** Skip pre-typing delay (read/think time) */
  skipPreDelay?: boolean;

  /** Custom pre-typing delay override (ms) */
  preDelayOverride?: number;

  /** Callback for progress updates */
  onProgress?: (progress: DeliveryProgress) => void;
}

/**
 * Progress update during delivery.
 */
export interface DeliveryProgress {
  /** Characters delivered so far */
  characters_delivered: number;

  /** Total characters to deliver */
  total_characters: number;

  /** Percentage complete (0-100) */
  percent_complete: number;

  /** Current keystroke being processed */
  current_keystroke?: KeystrokeEvent;

  /** Estimated time remaining (ms) */
  estimated_remaining_ms?: number;
}

/**
 * Extended keystroke event with delivery context.
 */
export interface KeystrokeEvent extends Keystroke {
  /** Sequence number in the delivery */
  sequence: number;

  /** Cumulative time since delivery start (ms) */
  cumulative_time_ms: number;

  /** Original message position this keystroke corresponds to */
  message_position: number;

  /** Whether this keystroke has been delivered */
  delivered: boolean;

  /** Timestamp when delivered */
  delivered_at?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANNEL INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Interface for delivery channels.
 * Implement this to create custom delivery mechanisms.
 */
export interface DeliveryChannel {
  /** Unique name of this channel */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Whether this channel is currently available */
  isAvailable(): Promise<boolean>;

  /**
   * Send a complete message (instant delivery).
   * @param message The message to send
   * @returns Result of the delivery
   */
  send(message: string): Promise<DeliveryResult>;

  /**
   * Send a single keystroke.
   * @param keystroke The keystroke event to send
   * @returns Whether the keystroke was delivered
   */
  sendKeystroke(keystroke: KeystrokeEvent): Promise<boolean>;

  /**
   * Perform any cleanup needed before delivery.
   * Called at the start of a new message delivery.
   */
  prepareForDelivery?(): Promise<void>;

  /**
   * Finalize delivery (e.g., press Enter to send).
   * Called after all keystrokes have been delivered.
   */
  finalizeDelivery?(): Promise<void>;

  /**
   * Close/cleanup the channel.
   */
  close?(): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANNEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for a delivery channel.
 */
export interface ChannelConfig {
  /** Channel name */
  name: string;

  /** Whether this channel is enabled */
  enabled: boolean;

  /** Priority for fallback selection (lower = higher priority) */
  priority: number;

  /** Channel-specific settings */
  settings?: Record<string, unknown>;
}

/**
 * Configuration for the delivery manager.
 */
export interface DeliveryManagerConfig {
  /** Default delivery options */
  defaultOptions: DeliveryOptions;

  /** Whether to automatically retry on failure */
  autoRetry: boolean;

  /** Maximum retry attempts */
  maxRetries: number;

  /** Delay between retries (ms) */
  retryDelay: number;

  /** Fallback channel name if primary fails */
  fallbackChannel?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default delivery options.
 */
export const DEFAULT_DELIVERY_OPTIONS: DeliveryOptions = {
  useTypingSimulation: true,
  useTypos: true,
  timingMultiplier: 1.0,
};

/**
 * Default delivery manager configuration.
 */
export const DEFAULT_MANAGER_CONFIG: DeliveryManagerConfig = {
  defaultOptions: DEFAULT_DELIVERY_OPTIONS,
  autoRetry: true,
  maxRetries: 3,
  retryDelay: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Delivery event types for event listeners.
 */
export type DeliveryEventType =
  | 'delivery_start'
  | 'delivery_progress'
  | 'delivery_complete'
  | 'delivery_error'
  | 'keystroke_sent'
  | 'channel_switched';

/**
 * Delivery event payload.
 */
export interface DeliveryEvent {
  /** Event type */
  type: DeliveryEventType;

  /** Timestamp */
  timestamp: string;

  /** Channel name */
  channel: string;

  /** Message being delivered (partial for progress events) */
  message?: string;

  /** Progress info (for progress events) */
  progress?: DeliveryProgress;

  /** Result (for complete events) */
  result?: DeliveryResult;

  /** Error (for error events) */
  error?: Error;

  /** Keystroke (for keystroke events) */
  keystroke?: KeystrokeEvent;
}

/**
 * Listener for delivery events.
 */
export type DeliveryEventListener = (event: DeliveryEvent) => void;
