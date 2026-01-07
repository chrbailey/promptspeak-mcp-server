/**
 * Log Output Formatters for PromptSpeak MCP Server
 *
 * Provides different output formats for log entries:
 * - ConsoleFormatter: Human-readable, colored output for development
 * - JSONFormatter: Structured JSON output for production/log aggregation
 */

import { LogEntry, LogLevel } from './types.js';

/**
 * Interface for log formatters
 */
export interface LogFormatter {
  /**
   * Formats a log entry into a string for output
   */
  format(entry: LogEntry): string;
}

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  // Level colors
  debug: '\x1b[36m',    // Cyan
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
  critical: '\x1b[35m', // Magenta (bold applied separately)

  // Component colors
  timestamp: '\x1b[90m', // Gray
  module: '\x1b[34m',    // Blue
  data: '\x1b[90m',      // Gray
} as const;

/**
 * Level labels with fixed width for alignment
 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  critical: 'CRIT ',
};

/**
 * Human-readable console formatter with optional color support.
 *
 * Output format:
 * [2024-01-06T12:34:56.789Z] INFO  [ModuleName] Message here { data: "value" }
 */
export class ConsoleFormatter implements LogFormatter {
  constructor(private colorize: boolean = true) {}

  format(entry: LogEntry): string {
    const parts: string[] = [];

    // Timestamp
    const timestamp = this.colorize
      ? `${COLORS.timestamp}[${entry.timestamp}]${COLORS.reset}`
      : `[${entry.timestamp}]`;
    parts.push(timestamp);

    // Level
    const levelColor = this.colorize ? COLORS[entry.level] : '';
    const levelReset = this.colorize ? COLORS.reset : '';
    const levelBold = entry.level === 'critical' && this.colorize ? COLORS.bold : '';
    parts.push(`${levelBold}${levelColor}${LEVEL_LABELS[entry.level]}${levelReset}`);

    // Module (if present)
    if (entry.module) {
      const module = this.colorize
        ? `${COLORS.module}[${entry.module}]${COLORS.reset}`
        : `[${entry.module}]`;
      parts.push(module);
    }

    // Correlation ID (if present, abbreviated)
    if (entry.correlationId) {
      const shortId = entry.correlationId.substring(0, 8);
      const corrId = this.colorize
        ? `${COLORS.dim}(${shortId})${COLORS.reset}`
        : `(${shortId})`;
      parts.push(corrId);
    }

    // Message
    parts.push(entry.message);

    // Duration (if present)
    if (entry.duration !== undefined) {
      const duration = this.colorize
        ? `${COLORS.dim}(${entry.duration}ms)${COLORS.reset}`
        : `(${entry.duration}ms)`;
      parts.push(duration);
    }

    // Data (if present and non-empty)
    if (entry.data && Object.keys(entry.data).length > 0) {
      const dataStr = this.formatData(entry.data);
      const data = this.colorize
        ? `${COLORS.data}${dataStr}${COLORS.reset}`
        : dataStr;
      parts.push(data);
    }

    // Error (if present)
    if (entry.error) {
      parts.push('\n' + this.formatError(entry.error));
    }

    return parts.join(' ');
  }

  private formatData(data: Record<string, unknown>): string {
    try {
      // Compact single-line JSON for inline display
      return JSON.stringify(data);
    } catch {
      return '[Circular or non-serializable data]';
    }
  }

  private formatError(error: LogEntry['error']): string {
    if (!error) return '';

    const parts: string[] = [];
    const errorColor = this.colorize ? COLORS.error : '';
    const reset = this.colorize ? COLORS.reset : '';

    parts.push(`${errorColor}  Error: ${error.name}: ${error.message}${reset}`);

    if (error.code) {
      parts.push(`${errorColor}  Code: ${error.code}${reset}`);
    }

    if (error.stack) {
      // Indent stack trace lines
      const stackLines = error.stack.split('\n').slice(1); // Skip first line (already have message)
      for (const line of stackLines) {
        parts.push(`${COLORS.dim}${line}${reset}`);
      }
    }

    return parts.join('\n');
  }
}

/**
 * JSON formatter for structured logging.
 * Each log entry is output as a single line of JSON.
 * Suitable for log aggregation systems (ELK, CloudWatch, etc.)
 */
export class JSONFormatter implements LogFormatter {
  constructor(private pretty: boolean = false) {}

  format(entry: LogEntry): string {
    const output: Record<string, unknown> = {
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
    };

    // Add optional fields only if present
    if (entry.module) {
      output.module = entry.module;
    }

    if (entry.correlationId) {
      output.correlationId = entry.correlationId;
    }

    if (entry.traceId) {
      output.traceId = entry.traceId;
    }

    if (entry.duration !== undefined) {
      output.duration = entry.duration;
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
      output.data = entry.data;
    }

    if (entry.error) {
      output.error = entry.error;
    }

    try {
      return this.pretty
        ? JSON.stringify(output, null, 2)
        : JSON.stringify(output);
    } catch {
      // Fallback for circular references or other serialization issues
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        error: { message: 'Failed to serialize log entry' },
      });
    }
  }
}

/**
 * Factory function to create the appropriate formatter based on configuration
 */
export function createFormatter(format: 'json' | 'console', options?: {
  colorize?: boolean;
  pretty?: boolean;
}): LogFormatter {
  if (format === 'json') {
    return new JSONFormatter(options?.pretty ?? false);
  }
  return new ConsoleFormatter(options?.colorize ?? true);
}
