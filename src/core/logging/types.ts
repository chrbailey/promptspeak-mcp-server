/**
 * Unified Logging Types for PromptSpeak MCP Server
 *
 * Provides type definitions for structured logging throughout the application.
 */

/**
 * Log levels in order of severity (lowest to highest)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * Numeric priority values for log levels (used for filtering)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

/**
 * Context information attached to log entries
 */
export interface LogContext {
  /** ISO 8601 timestamp of when the log entry was created */
  timestamp: string;
  /** Severity level of the log entry */
  level: LogLevel;
  /** Module or component that generated the log entry */
  module?: string;
  /** Correlation ID for tracking related operations across modules */
  correlationId?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Duration in milliseconds (for operation timing) */
  duration?: number;
}

/**
 * Complete log entry with message and optional data
 */
export interface LogEntry extends LogContext {
  /** Human-readable log message */
  message: string;
  /** Additional structured data to include with the log entry */
  data?: Record<string, unknown>;
  /** Error information if this log entry is related to an error */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

/**
 * Configuration options for the logger
 */
export interface LoggerConfig {
  /** Minimum log level to output (default: 'info' in production, 'debug' in development) */
  minLevel: LogLevel;
  /** Output format: 'json' for structured logs, 'console' for human-readable */
  format: 'json' | 'console';
  /** Whether to include stack traces in error logs */
  includeStackTraces: boolean;
  /** Whether to colorize console output (only applies to 'console' format) */
  colorize: boolean;
}

/**
 * Default logger configuration based on environment
 */
export function getDefaultConfig(): LoggerConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug');

  return {
    minLevel: logLevel,
    format: isProduction ? 'json' : 'console',
    includeStackTraces: !isProduction,
    colorize: !isProduction && process.stdout.isTTY === true,
  };
}
