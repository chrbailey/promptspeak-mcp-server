/**
 * Main Logger Class for PromptSpeak MCP Server
 *
 * Provides a structured, configurable logging interface with support for:
 * - Multiple log levels (debug, info, warn, error, critical)
 * - Structured data logging
 * - Error serialization
 * - Correlation ID tracking
 * - Child loggers with module prefixes
 * - Environment-based configuration
 */

import {
  LogLevel,
  LogEntry,
  LogContext,
  LoggerConfig,
  LOG_LEVEL_PRIORITY,
  getDefaultConfig,
} from './types.js';
import { LogContextManager } from './context.js';
import { LogFormatter, createFormatter } from './formatters.js';

/**
 * Global logger configuration
 */
let globalConfig: LoggerConfig = getDefaultConfig();
let globalFormatter: LogFormatter = createFormatter(globalConfig.format, {
  colorize: globalConfig.colorize,
});

/**
 * Configure the global logger settings
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  globalFormatter = createFormatter(globalConfig.format, {
    colorize: globalConfig.colorize,
  });
}

/**
 * Get the current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

/**
 * Main Logger class providing structured logging capabilities.
 */
export class Logger {
  private additionalContext: Partial<LogContext> = {};

  /**
   * Creates a new Logger instance.
   *
   * @param module - Module name to prefix log entries with (e.g., 'IntentManager')
   */
  constructor(private module: string) {}

  /**
   * Log a debug message. Used for detailed debugging information.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log an info message. Used for general informational messages.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log a warning message. Used for potentially problematic situations.
   */
  warn(message: string, data?: Record<string, unknown>, error?: Error): void {
    this.log('warn', message, data, error);
  }

  /**
   * Log an error message. Used for error conditions.
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, data, error);
  }

  /**
   * Log a critical message. Used for severe errors requiring immediate attention.
   */
  critical(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('critical', message, data, error);
  }

  /**
   * Create a child logger with an extended module path.
   *
   * @param subModule - Sub-module name to append to the current module
   * @returns A new Logger instance with the combined module path
   *
   * @example
   * const logger = createLogger('IntentManager');
   * const childLogger = logger.child('Parser');
   * // childLogger's module will be 'IntentManager:Parser'
   */
  child(subModule: string): Logger {
    const childLogger = new Logger(`${this.module}:${subModule}`);
    childLogger.additionalContext = { ...this.additionalContext };
    return childLogger;
  }

  /**
   * Create a new logger with additional context that will be included in all log entries.
   *
   * @param context - Additional context to include in log entries
   * @returns A new Logger instance with the additional context
   *
   * @example
   * const logger = createLogger('API').withContext({ traceId: 'abc123' });
   */
  withContext(context: Partial<LogContext>): Logger {
    const contextLogger = new Logger(this.module);
    contextLogger.additionalContext = { ...this.additionalContext, ...context };
    return contextLogger;
  }

  /**
   * Time an operation and log its duration.
   *
   * @param operationName - Name of the operation being timed
   * @param fn - Function to execute and time
   * @returns The result of the function
   *
   * @example
   * const result = await logger.time('fetchData', async () => {
   *   return await fetch('/api/data');
   * });
   */
  async time<T>(operationName: string, fn: () => T | Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - startTime);
      this.debug(`${operationName} completed`, { duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      this.error(`${operationName} failed`, error instanceof Error ? error : undefined, { duration });
      throw error;
    }
  }

  /**
   * Core logging method that constructs and outputs log entries.
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    // Check if this level should be logged
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[globalConfig.minLevel]) {
      return;
    }

    // Build the log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.module,
      correlationId: this.additionalContext.correlationId ?? LogContextManager.getCorrelationId(),
      traceId: this.additionalContext.traceId ?? LogContextManager.getTraceId(),
      duration: this.additionalContext.duration,
    };

    // Add data if present
    if (data && Object.keys(data).length > 0) {
      entry.data = data;
    }

    // Serialize error if present
    if (error) {
      entry.error = this.serializeError(error);
    }

    // Format and output
    const output = globalFormatter.format(entry);
    this.write(level, output);
  }

  /**
   * Serialize an Error object for logging.
   */
  private serializeError(error: Error): LogEntry['error'] {
    const serialized: LogEntry['error'] = {
      name: error.name,
      message: error.message,
    };

    if (globalConfig.includeStackTraces && error.stack) {
      serialized.stack = error.stack;
    }

    // Capture error code if present (common in Node.js errors)
    if ('code' in error && typeof error.code === 'string') {
      serialized.code = error.code;
    }

    return serialized;
  }

  /**
   * Write the formatted log entry to the appropriate output stream.
   */
  private write(level: LogLevel, output: string): void {
    // Use stderr for errors and critical, stdout for everything else
    if (level === 'error' || level === 'critical') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

/**
 * Factory function to create a new Logger instance.
 *
 * @param module - Module name for the logger
 * @returns A new Logger instance
 *
 * @example
 * import { createLogger } from './core/logging';
 *
 * const logger = createLogger('IntentManager');
 * logger.info('Processing intent', { intentType: 'query' });
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

/**
 * Default application logger for use when a specific module isn't relevant.
 */
export const rootLogger = createLogger('App');
