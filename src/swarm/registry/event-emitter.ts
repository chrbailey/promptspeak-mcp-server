/**
 * Swarm Event Emitter
 *
 * Publishes swarm events in PromptSpeak-compatible format.
 * Maps internal events to registry symbols for integration.
 */

import { EventEmitter } from 'events';
import type { SwarmEvent, SwarmEventType } from '../types.js';
import { mapEventToSymbol } from './symbol-mapper.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registry event format (PromptSpeak compatible).
 */
export interface RegistryEvent {
  /** PromptSpeak symbol (e.g., Ξ.E.SWARM.BID_PLACED) */
  symbol: string;

  /** Event timestamp */
  timestamp: Date | string;

  /** Source swarm ID */
  swarmId: string;

  /** Source agent ID (if applicable) */
  agentId?: string;

  /** Event-specific payload */
  payload: Record<string, unknown>;

  /** Event metadata */
  metadata: {
    eventId: string;
    originalType: SwarmEventType;
    version: string;
  };
}

/**
 * Event subscriber callback.
 */
export type EventSubscriber = (event: RegistryEvent) => void | Promise<void>;

/**
 * Subscription options.
 */
export interface SubscriptionOptions {
  /** Filter by symbol prefix (e.g., "Ξ.E.SWARM.BID" matches BID_PLACED, BID_WON, etc.) */
  symbolPrefix?: string;

  /** Filter by swarm ID */
  swarmId?: string;

  /** Filter by agent ID */
  agentId?: string;

  /** Filter by event types */
  eventTypes?: SwarmEventType[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWARM EVENT BUS
// ═══════════════════════════════════════════════════════════════════════════════

export class SwarmEventBus extends EventEmitter {
  private static instance: SwarmEventBus | null = null;
  private subscribers: Map<string, { callback: EventSubscriber; options?: SubscriptionOptions }> = new Map();
  private eventHistory: RegistryEvent[] = [];
  private maxHistorySize: number = 10000;

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many subscribers
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): SwarmEventBus {
    if (!SwarmEventBus.instance) {
      SwarmEventBus.instance = new SwarmEventBus();
    }
    return SwarmEventBus.instance;
  }

  /**
   * Publish a swarm event.
   */
  async publish(event: SwarmEvent): Promise<void> {
    // Transform to registry format
    const registryEvent = this.transformToRegistryEvent(event);

    // Add to history
    this.addToHistory(registryEvent);

    // Emit to generic listeners
    this.emit('event', registryEvent);
    this.emit(registryEvent.metadata.originalType, registryEvent);

    // Notify filtered subscribers
    await this.notifySubscribers(registryEvent);
  }

  /**
   * Subscribe to events with optional filtering.
   */
  subscribe(
    subscriberId: string,
    callback: EventSubscriber,
    options?: SubscriptionOptions
  ): () => void {
    this.subscribers.set(subscriberId, { callback, options });

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriberId);
    };
  }

  /**
   * Unsubscribe by ID.
   */
  unsubscribe(subscriberId: string): void {
    this.subscribers.delete(subscriberId);
  }

  /**
   * Get recent events with optional filtering.
   */
  getRecentEvents(options?: {
    limit?: number;
    symbolPrefix?: string;
    swarmId?: string;
    agentId?: string;
    since?: Date;
  }): RegistryEvent[] {
    let events = [...this.eventHistory];

    // Apply filters
    if (options?.symbolPrefix) {
      events = events.filter(e => e.symbol.startsWith(options.symbolPrefix!));
    }
    if (options?.swarmId) {
      events = events.filter(e => e.swarmId === options.swarmId);
    }
    if (options?.agentId) {
      events = events.filter(e => e.agentId === options.agentId);
    }
    if (options?.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }

    // Apply limit
    const limit = options?.limit ?? 100;
    return events.slice(-limit);
  }

  /**
   * Get event counts by type.
   */
  getEventCounts(swarmId?: string): Map<SwarmEventType, number> {
    const counts = new Map<SwarmEventType, number>();

    for (const event of this.eventHistory) {
      if (swarmId && event.swarmId !== swarmId) continue;

      const type = event.metadata.originalType;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    return counts;
  }

  /**
   * Clear event history (for testing).
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transform internal event to registry format.
   */
  private transformToRegistryEvent(event: SwarmEvent): RegistryEvent {
    return {
      symbol: mapEventToSymbol(event.eventType),
      timestamp: event.timestamp,
      swarmId: event.swarmId,
      agentId: event.agentId,
      payload: event.data ?? {},
      metadata: {
        eventId: event.eventId,
        originalType: event.eventType,
        version: '1.0.0',
      },
    };
  }

  /**
   * Add event to history with size management.
   */
  private addToHistory(event: RegistryEvent): void {
    this.eventHistory.push(event);

    // Trim if exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Notify subscribers that match the event.
   */
  private async notifySubscribers(event: RegistryEvent): Promise<void> {
    for (const [, { callback, options }] of this.subscribers) {
      if (this.matchesFilter(event, options)) {
        try {
          await callback(event);
        } catch (error) {
          console.error('Subscriber error:', error);
        }
      }
    }
  }

  /**
   * Check if event matches subscription filter.
   */
  private matchesFilter(event: RegistryEvent, options?: SubscriptionOptions): boolean {
    if (!options) return true;

    if (options.symbolPrefix && !event.symbol.startsWith(options.symbolPrefix)) {
      return false;
    }
    if (options.swarmId && event.swarmId !== options.swarmId) {
      return false;
    }
    if (options.agentId && event.agentId !== options.agentId) {
      return false;
    }
    if (options.eventTypes?.length && !options.eventTypes.includes(event.metadata.originalType)) {
      return false;
    }

    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the event bus singleton.
 */
export function getEventBus(): SwarmEventBus {
  return SwarmEventBus.getInstance();
}

/**
 * Publish an event to the bus.
 */
export async function publishEvent(event: SwarmEvent): Promise<void> {
  await getEventBus().publish(event);
}

/**
 * Subscribe to swarm events.
 */
export function subscribeToEvents(
  subscriberId: string,
  callback: EventSubscriber,
  options?: SubscriptionOptions
): () => void {
  return getEventBus().subscribe(subscriberId, callback, options);
}
