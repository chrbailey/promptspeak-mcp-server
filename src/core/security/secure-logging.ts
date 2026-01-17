/**
 * ===============================================================================
 * SECURE LOGGING UTILITIES
 * ===============================================================================
 *
 * Provides secure logging wrappers that automatically redact sensitive data.
 * Use these utilities in any code that handles PII, financial data, or
 * business-sensitive information.
 *
 * IMPORTANT: This module MUST be used in:
 * - Government/SAP/ERP adapters
 * - Payment processing
 * - User data handlers
 * - Authentication flows
 * - Any external API integration that returns sensitive data
 *
 * @example
 * ```typescript
 * import { createSecureLogger } from '../core/security/index.js';
 *
 * const logger = createSecureLogger('SamAdapter');
 *
 * // Safe debug - automatically redacts sensitive fields
 * logger.safeDebug('Processing entity', {
 *   customerId: '12345',      // Will be redacted
 *   email: 'john@example.com', // Will be redacted
 *   action: 'lookup'           // Not sensitive, passed through
 * });
 *
 * // Force redact everything
 * logger.safeDebug('Raw API response', responseData, { redactAll: true });
 * ```
 *
 * ===============================================================================
 */

import { Logger, createLogger } from '../logging/index.js';
import {
  redact,
  redactObject,
  redactString,
  isSensitiveField,
  type RedactedValue,
} from './redaction.js';

/**
 * Options for secure debug logging.
 */
export interface SafeDebugOptions {
  /** Redact ALL fields, not just detected sensitive ones */
  redactAll?: boolean;
  /** Include hash prefixes for correlation across logs */
  includeHashes?: boolean;
  /** Additional field names to treat as sensitive */
  additionalSensitive?: string[];
  /** Field names to explicitly allow through (whitelist) */
  allowList?: string[];
}

/**
 * A secure logger wrapper that provides safe logging methods.
 */
export class SecureLogger {
  private logger: Logger;

  constructor(module: string) {
    this.logger = createLogger(module);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STANDARD LOGGING (for messages known to be safe)
  // Use these when you've verified the data doesn't contain sensitive values.
  // When in doubt, use the safe* variants instead.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Log debug message (no auto-redaction).
   * Use safeDebug() if data might contain sensitive fields.
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data);
  }

  /**
   * Log info message (no auto-redaction).
   * Use safeInfo() if data might contain sensitive fields.
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, data);
  }

  /**
   * Log warning message (no auto-redaction).
   * Use safeWarn() if data might contain sensitive fields.
   */
  warn(message: string, data?: Record<string, unknown>, error?: Error): void {
    this.logger.warn(message, data, error);
  }

  /**
   * Log error message (no auto-redaction).
   * Use safeError() if data might contain sensitive fields.
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.logger.error(message, error, data);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SAFE LOGGING (with automatic redaction)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Safely log debug information with automatic redaction.
   *
   * @param message - Log message (will be scanned for sensitive patterns)
   * @param data - Optional data object (sensitive fields auto-redacted)
   * @param options - Redaction options
   *
   * @example
   * ```typescript
   * logger.safeDebug('User lookup', { userId: '123', email: 'test@example.com' });
   * // Logs: "User lookup" { userId: { type: 'string', length: 3 }, email: '<redacted>' }
   * ```
   */
  safeDebug(
    message: string,
    data?: Record<string, unknown>,
    options?: SafeDebugOptions
  ): void {
    const safeMessage = redactString(message);
    const safeData = data ? redactObject(data, options) : undefined;
    this.logger.debug(safeMessage, safeData);
  }

  /**
   * Safely log info with automatic redaction.
   */
  safeInfo(
    message: string,
    data?: Record<string, unknown>,
    options?: SafeDebugOptions
  ): void {
    const safeMessage = redactString(message);
    const safeData = data ? redactObject(data, options) : undefined;
    this.logger.info(safeMessage, safeData);
  }

  /**
   * Safely log warning with automatic redaction.
   */
  safeWarn(
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
    options?: SafeDebugOptions
  ): void {
    const safeMessage = redactString(message);
    const safeData = data ? redactObject(data, options) : undefined;
    this.logger.warn(safeMessage, safeData, error);
  }

  /**
   * Safely log error with automatic redaction.
   */
  safeError(
    message: string,
    error?: Error,
    data?: Record<string, unknown>,
    options?: SafeDebugOptions
  ): void {
    const safeMessage = redactString(message);
    const safeData = data ? redactObject(data, options) : undefined;
    this.logger.error(safeMessage, error, safeData);
  }

  /**
   * Log a single redacted value for debugging.
   * Use when you need to log a specific value safely.
   *
   * @example
   * ```typescript
   * logger.safeValue('customerId', rawCustomerId);
   * // Logs: { customerId: { type: 'string', length: 10, preview: 'cust***' } }
   * ```
   */
  safeValue(fieldName: string, value: unknown, includeHash = false): void {
    const redactedValue = redact(value, includeHash);
    this.logger.debug('Value', { [fieldName]: redactedValue });
  }

  /**
   * Create a child secure logger with extended module path.
   */
  child(subModule: string): SecureLogger {
    const child = new SecureLogger(`${this.module}:${subModule}`);
    return child;
  }

  /**
   * Access the underlying logger for non-sensitive operations.
   * CAUTION: Only use for data you've verified is not sensitive.
   */
  get unsafe(): Logger {
    return this.logger;
  }

  /**
   * Get the module name for this logger.
   */
  private get module(): string {
    // Access the module from the wrapped logger
    // This is a workaround since Logger doesn't expose module publicly
    return (this.logger as unknown as { module: string }).module;
  }
}

/**
 * Create a secure logger instance.
 *
 * @param module - Module name for the logger
 * @returns SecureLogger instance with safe logging methods
 *
 * @example
 * ```typescript
 * import { createSecureLogger } from '../core/security/index.js';
 *
 * const logger = createSecureLogger('PaymentProcessor');
 * logger.safeDebug('Processing payment', { amount: 100, cardNumber: '4111...' });
 * ```
 */
export function createSecureLogger(module: string): SecureLogger {
  return new SecureLogger(module);
}

/**
 * Helper to safely log an entire payload that should be fully redacted.
 * Use when logging raw external API responses.
 *
 * @param logger - Logger instance
 * @param message - Log message
 * @param payload - Full payload to redact
 *
 * @example
 * ```typescript
 * safePayloadDebug(logger, 'SAM API response', apiResponse);
 * // Logs: "SAM API response" { payload: { type: 'object', length: 1234, count: 15 } }
 * ```
 */
export function safePayloadDebug(
  logger: Logger | SecureLogger,
  message: string,
  payload: unknown
): void {
  const redactedPayload = redact(payload);
  const safeMessage = redactString(message);

  if (logger instanceof SecureLogger) {
    logger.unsafe.debug(safeMessage, { payload: redactedPayload });
  } else {
    logger.debug(safeMessage, { payload: redactedPayload });
  }
}

/**
 * Decorator-style wrapper to make an existing logger safe.
 * Use when you have an existing Logger but need to log sensitive operations.
 *
 * @param logger - Existing Logger instance
 * @param message - Log message
 * @param data - Data to log (will be auto-redacted)
 * @param options - Redaction options
 *
 * @example
 * ```typescript
 * import { safeDebug } from '../core/security/index.js';
 * import { createLogger } from '../core/logging/index.js';
 *
 * const logger = createLogger('MyModule');
 *
 * // In a sensitive code path:
 * safeDebug(logger, 'Customer lookup result', customerData);
 * ```
 */
export function safeDebug(
  logger: Logger,
  message: string,
  data?: Record<string, unknown>,
  options?: SafeDebugOptions
): void {
  const safeMessage = redactString(message);
  const safeData = data ? redactObject(data, options) : undefined;
  logger.debug(safeMessage, safeData);
}

/**
 * Check if logging data is safe (no sensitive fields detected).
 * Use for validation/testing.
 *
 * @param data - Data object to check
 * @returns Object with safety status and any detected sensitive fields
 */
export function checkLoggingSafety(data: Record<string, unknown>): {
  isSafe: boolean;
  sensitiveFields: string[];
} {
  const sensitiveFields: string[] = [];

  function checkObject(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (isSensitiveField(key)) {
        sensitiveFields.push(fullPath);
      }

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        checkObject(value as Record<string, unknown>, fullPath);
      }
    }
  }

  checkObject(data);

  return {
    isSafe: sensitiveFields.length === 0,
    sensitiveFields,
  };
}
