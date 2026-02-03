/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DELIVERY MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A delivery abstraction layer that connects the stealth components to actual
 * message delivery channels. Provides a unified interface for delivering
 * messages with human-like typing simulation.
 *
 * Components:
 * - **Types**: Core interfaces for delivery channels, results, and options
 * - **BaseChannel**: Abstract base class with stealth integration
 * - **ConsoleChannel**: Console output for testing/debugging
 * - **CallbackChannel**: Callback-based delivery for integrations
 * - **DeliveryManager**: Central coordinator for multiple channels
 *
 * Usage:
 * ```typescript
 * import {
 *   DeliveryManager,
 *   createConsoleChannel,
 *   createCallbackChannel,
 * } from './delivery';
 *
 * // Create manager
 * const manager = new DeliveryManager();
 *
 * // Register channels
 * manager.registerChannel('console', createConsoleChannel({ showTiming: true }));
 * manager.registerChannel('browser', createBrowserCallbackChannel(...));
 *
 * // Deliver with stealth
 * const result = await manager.deliver('console', 'Hello, world!', {
 *   useTypingSimulation: true,
 *   useTypos: true,
 *   timingMultiplier: 1.0,
 * });
 *
 * // Or stream keystrokes
 * for await (const keystroke of manager.deliverWithStealth('browser', message)) {
 *   console.log(`Keystroke: ${keystroke.char} (${keystroke.delay_ms}ms)`);
 * }
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Core types
  type DeliveryChannel,
  type DeliveryResult,
  type DeliveryOptions,
  type DeliveryProgress,
  type KeystrokeEvent,

  // Configuration types
  type ChannelConfig,
  type DeliveryManagerConfig,

  // Event types
  type DeliveryEventType,
  type DeliveryEvent,
  type DeliveryEventListener,

  // Defaults
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_MANAGER_CONFIG,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Base class
  BaseDeliveryChannel,

  // Configuration
  type BaseChannelConfig,
  buildStealthConfig,
} from './base-channel';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLE CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Channel
  ConsoleChannel,

  // Configuration
  type ConsoleChannelConfig,

  // Factories
  createConsoleChannel,
  createDebugConsoleChannel,
  createStreamingConsoleChannel,
  createSilentConsoleChannel,
} from './console-channel';

// ═══════════════════════════════════════════════════════════════════════════════
// CALLBACK CHANNEL
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Channel
  CallbackChannel,

  // Callback types
  type SendCallback,
  type KeystrokeCallback,
  type PrepareCallback,
  type FinalizeCallback,
  type AvailabilityCallback,

  // Configuration
  type CallbackChannelConfig,

  // Factories
  createCallbackChannel,
  createBrowserCallbackChannel,
  createBufferCallbackChannel,
  createApiCallbackChannel,
} from './callback-channel';

// ═══════════════════════════════════════════════════════════════════════════════
// DELIVERY MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Manager
  DeliveryManager,

  // Factories
  createDeliveryManager,
  createDeliveryManagerFromSymbol,
} from './delivery-manager';
