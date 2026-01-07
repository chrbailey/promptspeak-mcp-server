/**
 * ===============================================================================
 * BASE ERROR CLASSES - Foundation for PromptSpeak Error Handling
 * ===============================================================================
 *
 * Provides the abstract base class for all PromptSpeak errors.
 * Ensures consistent error structure across the entire codebase with:
 *   - Structured error information for logging and debugging
 *   - JSON serialization for API responses
 *   - Error chaining for root cause analysis
 *   - Automatic timestamps
 *   - HTTP status code mapping
 *   - Retry guidance
 *
 * ===============================================================================
 */

import {
  ErrorCode,
  ErrorSeverity,
  ERROR_CODE_TO_STATUS,
  ERROR_CODE_RETRYABLE,
  ERROR_CODE_SEVERITY,
} from './codes.js';

/**
 * Options for constructing a PromptSpeakError.
 */
export interface PromptSpeakErrorOptions {
  /** Additional details about the error */
  details?: Record<string, unknown>;
  /** The original error that caused this error */
  originalError?: Error;
  /** Override the default retryable status */
  retryable?: boolean;
  /** Override the default HTTP status code */
  statusCode?: number;
  /** Override the default severity */
  severity?: ErrorSeverity;
}

/**
 * JSON representation of a PromptSpeakError.
 * Used for API responses and logging.
 */
export interface SerializedError {
  /** Error name/type */
  name: string;
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code: ErrorCode;
  /** Error severity */
  severity: ErrorSeverity;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** HTTP status code */
  statusCode: number;
  /** ISO timestamp when the error occurred */
  timestamp: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Stack trace (only in development) */
  stack?: string;
  /** Original error information */
  cause?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Base error class for all PromptSpeak errors.
 * Provides structured error information for logging and debugging.
 *
 * @abstract
 * @example
 * ```typescript
 * class MyCustomError extends PromptSpeakError {
 *   readonly code = ErrorCode.CUSTOM_ERROR;
 *   readonly severity = ErrorSeverity.MEDIUM;
 *
 *   constructor(message: string, options?: PromptSpeakErrorOptions) {
 *     super(message, options);
 *     this.name = 'MyCustomError';
 *   }
 * }
 * ```
 */
export abstract class PromptSpeakError extends Error {
  /**
   * The error code for programmatic handling.
   */
  abstract readonly code: ErrorCode;

  /**
   * The severity level of the error.
   */
  abstract readonly severity: ErrorSeverity;

  /**
   * Whether the operation that caused this error can be retried.
   */
  readonly retryable: boolean;

  /**
   * The HTTP status code associated with this error.
   */
  readonly statusCode: number;

  /**
   * Additional details about the error.
   */
  readonly details?: Record<string, unknown>;

  /**
   * The original error that caused this error, if any.
   */
  readonly originalError?: Error;

  /**
   * ISO timestamp when the error was created.
   */
  readonly timestamp: string;

  /**
   * Creates a new PromptSpeakError.
   *
   * @param message - Human-readable error message
   * @param options - Additional error options
   */
  constructor(message: string, options?: PromptSpeakErrorOptions) {
    super(message);

    // Set the prototype explicitly for proper instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.timestamp = new Date().toISOString();
    this.details = options?.details;
    this.originalError = options?.originalError;

    // These will be set by subclasses via abstract properties,
    // but we need defaults for the constructor
    // The actual values will be determined after construction
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode ?? 500;

    // Capture stack trace, excluding the constructor
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Initialize properties that depend on abstract members.
   * Call this in subclass constructors after setting code and severity.
   */
  protected initializeDefaults(options?: PromptSpeakErrorOptions): void {
    // Use type assertion to allow setting readonly properties during initialization
    const self = this as {
      -readonly [K in keyof PromptSpeakError]: PromptSpeakError[K];
    };

    self.retryable =
      options?.retryable ?? ERROR_CODE_RETRYABLE[this.code] ?? false;
    self.statusCode =
      options?.statusCode ?? ERROR_CODE_TO_STATUS[this.code] ?? 500;
  }

  /**
   * Serializes the error to a JSON-compatible object.
   * Useful for API responses and structured logging.
   *
   * @param includeStack - Whether to include the stack trace (default: false)
   * @returns Serialized error object
   */
  toJSON(includeStack = false): SerializedError {
    const result: SerializedError = {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    };

    if (this.details && Object.keys(this.details).length > 0) {
      result.details = this.details;
    }

    if (includeStack && this.stack) {
      result.stack = this.stack;
    }

    if (this.originalError) {
      result.cause = {
        name: this.originalError.name,
        message: this.originalError.message,
      };
      if (includeStack && this.originalError.stack) {
        result.cause.stack = this.originalError.stack;
      }
    }

    return result;
  }

  /**
   * Returns a string representation of the error.
   */
  override toString(): string {
    let str = `${this.name} [${this.code}]: ${this.message}`;
    if (this.originalError) {
      str += ` (caused by: ${this.originalError.message})`;
    }
    return str;
  }

  /**
   * Creates a new error of the same type with additional details.
   * Useful for adding context as errors propagate up the call stack.
   *
   * @param additionalDetails - Additional details to merge
   * @returns A new error instance with merged details
   */
  withDetails(additionalDetails: Record<string, unknown>): this {
    const ErrorClass = this.constructor as new (
      message: string,
      options?: PromptSpeakErrorOptions
    ) => this;

    return new ErrorClass(this.message, {
      details: { ...this.details, ...additionalDetails },
      originalError: this.originalError,
      retryable: this.retryable,
      statusCode: this.statusCode,
    });
  }

  /**
   * Wraps an existing error in a PromptSpeakError.
   * Preserves the original error for debugging.
   *
   * @param error - The error to wrap
   * @param message - Optional override message
   * @returns A new error instance wrapping the original
   */
  static wrap<T extends PromptSpeakError>(
    this: new (message: string, options?: PromptSpeakErrorOptions) => T,
    error: Error,
    message?: string
  ): T {
    return new this(message ?? error.message, {
      originalError: error,
    });
  }
}

/**
 * Type guard to check if an error is a PromptSpeakError.
 */
export function isPromptSpeakError(error: unknown): error is PromptSpeakError {
  return error instanceof PromptSpeakError;
}

/**
 * Type guard to check if an error has a specific error code.
 */
export function hasErrorCode<T extends ErrorCode>(
  error: unknown,
  code: T
): error is PromptSpeakError & { code: T } {
  return isPromptSpeakError(error) && error.code === code;
}

/**
 * Converts any error to a PromptSpeakError.
 * If already a PromptSpeakError, returns it unchanged.
 * Otherwise, wraps it in an InternalError.
 */
export function toPromptSpeakError(error: unknown): PromptSpeakError {
  if (isPromptSpeakError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Import dynamically to avoid circular dependency
    const { InternalError } = require('./types.js');
    return new InternalError(error.message, { originalError: error });
  }

  const { InternalError } = require('./types.js');
  return new InternalError(String(error));
}
