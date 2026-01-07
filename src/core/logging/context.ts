/**
 * Correlation ID and Context Management for PromptSpeak MCP Server
 *
 * Provides thread-safe (async-safe) correlation ID management using AsyncLocalStorage.
 * This enables tracking related log entries across async operations.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Context stored in AsyncLocalStorage for each async execution context
 */
interface ExecutionContext {
  correlationId: string;
  traceId?: string;
  additionalContext?: Record<string, unknown>;
}

/**
 * Manages logging context including correlation IDs and trace IDs.
 * Uses AsyncLocalStorage for proper async context propagation.
 */
export class LogContextManager {
  private static storage = new AsyncLocalStorage<ExecutionContext>();

  /**
   * Sets the correlation ID for the current execution context.
   * Note: This only works within a runWithContext call.
   */
  static setCorrelationId(id: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.correlationId = id;
    }
  }

  /**
   * Gets the correlation ID for the current execution context.
   * Returns undefined if not in a managed context.
   */
  static getCorrelationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  /**
   * Sets the trace ID for the current execution context.
   */
  static setTraceId(id: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.traceId = id;
    }
  }

  /**
   * Gets the trace ID for the current execution context.
   */
  static getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  /**
   * Generates a new correlation ID using UUID v4.
   */
  static generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Generates a shorter correlation ID for more compact logs.
   * Format: 8 character hex string
   */
  static generateShortCorrelationId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 8);
  }

  /**
   * Runs a function within a new correlation context.
   * All async operations within the function will have access to the correlation ID.
   *
   * @param fn - Function to run within the context
   * @param correlationId - Optional correlation ID (auto-generated if not provided)
   * @returns The result of the function
   */
  static runWithCorrelation<T>(fn: () => T, correlationId?: string): T {
    const context: ExecutionContext = {
      correlationId: correlationId ?? this.generateCorrelationId(),
    };
    return this.storage.run(context, fn);
  }

  /**
   * Runs an async function within a new correlation context.
   *
   * @param fn - Async function to run within the context
   * @param correlationId - Optional correlation ID (auto-generated if not provided)
   * @returns Promise resolving to the result of the function
   */
  static async runWithCorrelationAsync<T>(
    fn: () => Promise<T>,
    correlationId?: string
  ): Promise<T> {
    const context: ExecutionContext = {
      correlationId: correlationId ?? this.generateCorrelationId(),
    };
    return this.storage.run(context, fn);
  }

  /**
   * Gets all context data for the current execution.
   */
  static getContext(): ExecutionContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Sets additional context data for the current execution.
   */
  static setAdditionalContext(data: Record<string, unknown>): void {
    const store = this.storage.getStore();
    if (store) {
      store.additionalContext = { ...store.additionalContext, ...data };
    }
  }

  /**
   * Gets additional context data for the current execution.
   */
  static getAdditionalContext(): Record<string, unknown> | undefined {
    return this.storage.getStore()?.additionalContext;
  }
}

/**
 * Decorator for wrapping methods with correlation context.
 * Usage: @withCorrelation()
 */
export function withCorrelation() {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      return LogContextManager.runWithCorrelation(() => {
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}
