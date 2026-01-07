/**
 * ===============================================================================
 * ERROR TYPES - Specific Error Classes for PromptSpeak
 * ===============================================================================
 *
 * Provides concrete error classes for different error scenarios.
 * All errors extend PromptSpeakError and implement the required abstract members.
 *
 * ===============================================================================
 */

import {
  PromptSpeakError,
  PromptSpeakErrorOptions,
} from './base.js';
import {
  ErrorCode,
  ErrorSeverity,
  ERROR_CODE_SEVERITY,
  ERROR_CODE_TO_STATUS,
  ERROR_CODE_RETRYABLE,
} from './codes.js';

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends PromptSpeakError {
  readonly code = ErrorCode.VALIDATION_ERROR;
  readonly severity: ErrorSeverity;

  /**
   * Creates a new ValidationError.
   *
   * @param message - Description of the validation failure
   * @param options - Additional error options
   */
  constructor(message: string, options?: PromptSpeakErrorOptions) {
    super(message, options);
    this.name = 'ValidationError';
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates a ValidationError for a missing required field.
   */
  static requiredField(fieldName: string): ValidationError {
    return new ValidationError(`Required field missing: ${fieldName}`, {
      details: { field: fieldName },
    });
  }

  /**
   * Creates a ValidationError for an invalid field value.
   */
  static invalidValue(
    fieldName: string,
    value: unknown,
    expectedType?: string
  ): ValidationError {
    const message = expectedType
      ? `Invalid value for '${fieldName}': expected ${expectedType}`
      : `Invalid value for '${fieldName}'`;
    return new ValidationError(message, {
      details: { field: fieldName, value, expectedType },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOURCE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends PromptSpeakError {
  readonly code = ErrorCode.NOT_FOUND;
  readonly severity: ErrorSeverity;

  /**
   * The type of resource that was not found.
   */
  readonly resourceType: string;

  /**
   * The identifier of the resource that was not found.
   */
  readonly resourceId?: string;

  /**
   * Creates a new NotFoundError.
   *
   * @param resourceType - The type of resource (e.g., 'User', 'Document')
   * @param resourceId - The identifier of the resource
   * @param options - Additional error options
   */
  constructor(
    resourceType: string,
    resourceId?: string,
    options?: PromptSpeakErrorOptions
  ) {
    const message = resourceId
      ? `${resourceType} '${resourceId}' not found`
      : `${resourceType} not found`;
    super(message, options);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      resourceType: this.resourceType,
      resourceId: this.resourceId,
    };
  }
}

/**
 * Error thrown when there is a conflict with existing resources.
 */
export class ConflictError extends PromptSpeakError {
  readonly code = ErrorCode.CONFLICT;
  readonly severity: ErrorSeverity;

  constructor(message: string, options?: PromptSpeakErrorOptions) {
    super(message, options);
    this.name = 'ConflictError';
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when a network operation fails.
 */
export class NetworkError extends PromptSpeakError {
  readonly code = ErrorCode.NETWORK_ERROR;
  readonly severity: ErrorSeverity;

  /**
   * The URL that was being accessed when the error occurred.
   */
  readonly url?: string;

  constructor(message: string, options?: PromptSpeakErrorOptions & { url?: string }) {
    super(message, options);
    this.name = 'NetworkError';
    this.url = options?.url;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      url: this.url,
    };
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutError extends PromptSpeakError {
  readonly code = ErrorCode.TIMEOUT;
  readonly severity: ErrorSeverity;

  /**
   * The timeout duration in milliseconds.
   */
  readonly timeoutMs?: number;

  constructor(
    message: string = 'Request timed out',
    options?: PromptSpeakErrorOptions & { timeoutMs?: number }
  ) {
    super(message, options);
    this.name = 'TimeoutError';
    this.timeoutMs = options?.timeoutMs;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      timeoutMs: this.timeoutMs,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING & CIRCUIT BREAKER ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitError extends PromptSpeakError {
  readonly code = ErrorCode.RATE_LIMITED;
  readonly severity: ErrorSeverity;

  /**
   * Number of seconds until the rate limit resets.
   */
  readonly retryAfter?: number;

  /**
   * The limit that was exceeded.
   */
  readonly limit?: number;

  /**
   * The time window for the limit (e.g., 'minute', 'hour').
   */
  readonly window?: string;

  constructor(
    message: string = 'Rate limit exceeded',
    options?: PromptSpeakErrorOptions & {
      retryAfter?: number;
      limit?: number;
      window?: string;
    }
  ) {
    super(message, options);
    this.name = 'RateLimitError';
    this.retryAfter = options?.retryAfter;
    this.limit = options?.limit;
    this.window = options?.window;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      retryAfter: this.retryAfter,
      limit: this.limit,
      window: this.window,
    };
  }
}

/**
 * Error thrown when the circuit breaker is open.
 */
export class CircuitBreakerError extends PromptSpeakError {
  readonly code = ErrorCode.CIRCUIT_OPEN;
  readonly severity: ErrorSeverity;

  /**
   * Name of the service protected by the circuit breaker.
   */
  readonly serviceName?: string;

  /**
   * When the circuit breaker will attempt to half-open.
   */
  readonly resetAfter?: number;

  constructor(
    message: string = 'Circuit breaker is open',
    options?: PromptSpeakErrorOptions & {
      serviceName?: string;
      resetAfter?: number;
    }
  ) {
    super(message, options);
    this.name = 'CircuitBreakerError';
    this.serviceName = options?.serviceName;
    this.resetAfter = options?.resetAfter;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      serviceName: this.serviceName,
      resetAfter: this.resetAfter,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION & AUTHORIZATION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends PromptSpeakError {
  readonly code = ErrorCode.AUTH_FAILED;
  readonly severity: ErrorSeverity;

  constructor(
    message: string = 'Authentication failed',
    options?: PromptSpeakErrorOptions
  ) {
    super(message, options);
    this.name = 'AuthenticationError';
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }
}

/**
 * Error thrown when access is forbidden.
 */
export class ForbiddenError extends PromptSpeakError {
  readonly code = ErrorCode.FORBIDDEN;
  readonly severity: ErrorSeverity;

  /**
   * The resource or action that was forbidden.
   */
  readonly resource?: string;

  constructor(
    message: string = 'Access denied',
    options?: PromptSpeakErrorOptions & { resource?: string }
  ) {
    super(message, options);
    this.name = 'ForbiddenError';
    this.resource = options?.resource;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      resource: this.resource,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown by external API adapters.
 * Compatible with the existing AdapterError pattern in base-adapter.ts.
 */
export class AdapterError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The name of the adapter that threw the error.
   */
  readonly adapterName?: string;

  /**
   * The original adapter error code (for backwards compatibility).
   */
  readonly adapterCode?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      adapterName?: string;
      adapterCode?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'AdapterError';
    this.adapterName = options?.adapterName;
    this.adapterCode = options?.adapterCode;
    this.code = options?.code ?? ErrorCode.ADAPTER_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an AdapterError from the legacy AdapterError format.
   * For backwards compatibility with existing code.
   */
  static fromLegacy(
    message: string,
    legacyCode: string,
    statusCode?: number,
    retryable = false,
    originalError?: Error
  ): AdapterError {
    // Map legacy codes to ErrorCode
    const codeMap: Record<string, ErrorCode> = {
      NETWORK_ERROR: ErrorCode.NETWORK_ERROR,
      TIMEOUT: ErrorCode.TIMEOUT,
      RATE_LIMITED: ErrorCode.RATE_LIMITED,
      AUTH_FAILED: ErrorCode.AUTH_FAILED,
      NOT_FOUND: ErrorCode.NOT_FOUND,
      INVALID_RESPONSE: ErrorCode.INVALID_RESPONSE,
      SERVER_ERROR: ErrorCode.SERVER_ERROR,
      VALIDATION_ERROR: ErrorCode.VALIDATION_ERROR,
      CIRCUIT_OPEN: ErrorCode.CIRCUIT_OPEN,
      UNKNOWN: ErrorCode.UNKNOWN,
    };

    return new AdapterError(message, {
      code: codeMap[legacyCode] ?? ErrorCode.ADAPTER_ERROR,
      adapterCode: legacyCode,
      statusCode,
      retryable,
      originalError,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      adapterName: this.adapterName,
      adapterCode: this.adapterCode,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown by the agent system.
 */
export class AgentError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The ID of the agent that threw the error.
   */
  readonly agentId?: string;

  /**
   * The task or operation that failed.
   */
  readonly operation?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      agentId?: string;
      operation?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'AgentError';
    this.agentId = options?.agentId;
    this.operation = options?.operation;
    this.code = options?.code ?? ErrorCode.AGENT_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for agent not found.
   */
  static notFound(agentId: string): AgentError {
    return new AgentError(`Agent not found: ${agentId}`, {
      agentId,
      code: ErrorCode.AGENT_NOT_FOUND,
    });
  }

  /**
   * Creates an error for agent already registered.
   */
  static alreadyRegistered(agentId: string): AgentError {
    return new AgentError(`Agent already registered: ${agentId}`, {
      agentId,
      code: ErrorCode.AGENT_ALREADY_REGISTERED,
    });
  }

  /**
   * Creates an error for delegation depth exceeded.
   */
  static delegationDepthExceeded(maxDepth: number): AgentError {
    return new AgentError(`Maximum delegation depth (${maxDepth}) exceeded`, {
      details: { maxDepth },
      code: ErrorCode.DELEGATION_DEPTH_EXCEEDED,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      agentId: this.agentId,
      operation: this.operation,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when intent processing fails.
 */
export class IntentError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The raw input that failed to parse.
   */
  readonly rawInput?: string;

  /**
   * The intent type, if known.
   */
  readonly intentType?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      rawInput?: string;
      intentType?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'IntentError';
    this.rawInput = options?.rawInput;
    this.intentType = options?.intentType;
    this.code = options?.code ?? ErrorCode.INTENT_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for intent parsing failure.
   */
  static parseError(rawInput: string, reason?: string): IntentError {
    const message = reason
      ? `Failed to parse intent: ${reason}`
      : 'Failed to parse intent';
    return new IntentError(message, {
      rawInput,
      code: ErrorCode.INTENT_PARSE_ERROR,
    });
  }

  /**
   * Creates an error for unknown intent.
   */
  static unknownIntent(intentType: string): IntentError {
    return new IntentError(`Unknown intent type: ${intentType}`, {
      intentType,
      code: ErrorCode.INTENT_UNKNOWN,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      rawInput: this.rawInput,
      intentType: this.intentType,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when mission operations fail.
 */
export class MissionError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The ID of the mission that caused the error.
   */
  readonly missionId?: string;

  /**
   * The current state of the mission.
   */
  readonly missionState?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      missionId?: string;
      missionState?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'MissionError';
    this.missionId = options?.missionId;
    this.missionState = options?.missionState;
    this.code = options?.code ?? ErrorCode.MISSION_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for mission not found.
   */
  static notFound(missionId: string): MissionError {
    return new MissionError(`Mission not found: ${missionId}`, {
      missionId,
      code: ErrorCode.MISSION_NOT_FOUND,
    });
  }

  /**
   * Creates an error for mission already completed.
   */
  static alreadyCompleted(missionId: string): MissionError {
    return new MissionError(`Mission already completed: ${missionId}`, {
      missionId,
      missionState: 'completed',
      code: ErrorCode.MISSION_COMPLETED,
    });
  }

  /**
   * Creates an error for mission expired.
   */
  static expired(missionId: string): MissionError {
    return new MissionError(`Mission has expired: ${missionId}`, {
      missionId,
      code: ErrorCode.MISSION_EXPIRED,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      missionId: this.missionId,
      missionState: this.missionState,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when proposal operations fail.
 */
export class ProposalError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The ID of the proposal that caused the error.
   */
  readonly proposalId?: string;

  /**
   * The current state of the proposal.
   */
  readonly proposalState?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      proposalId?: string;
      proposalState?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'ProposalError';
    this.proposalId = options?.proposalId;
    this.proposalState = options?.proposalState;
    this.code = options?.code ?? ErrorCode.PROPOSAL_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for proposal not found.
   */
  static notFound(proposalId: string): ProposalError {
    return new ProposalError(`Proposal not found: ${proposalId}`, {
      proposalId,
      code: ErrorCode.PROPOSAL_NOT_FOUND,
    });
  }

  /**
   * Creates an error for proposal not pending.
   */
  static notPending(proposalId: string, currentState: string): ProposalError {
    return new ProposalError(`Proposal is not pending: ${currentState}`, {
      proposalId,
      proposalState: currentState,
      code: ErrorCode.PROPOSAL_NOT_PENDING,
    });
  }

  /**
   * Creates an error for proposal expired.
   */
  static expired(proposalId: string): ProposalError {
    return new ProposalError('Proposal has expired', {
      proposalId,
      code: ErrorCode.PROPOSAL_EXPIRED,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      proposalId: this.proposalId,
      proposalState: this.proposalState,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when document operations fail.
 */
export class DocumentError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The path or identifier of the document.
   */
  readonly documentPath?: string;

  /**
   * The format of the document.
   */
  readonly format?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      documentPath?: string;
      format?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'DocumentError';
    this.documentPath = options?.documentPath;
    this.format = options?.format;
    this.code = options?.code ?? ErrorCode.DOCUMENT_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for document not found.
   */
  static notFound(path: string): DocumentError {
    return new DocumentError(`Document not found: ${path}`, {
      documentPath: path,
      code: ErrorCode.DOCUMENT_NOT_FOUND,
    });
  }

  /**
   * Creates an error for unsupported format.
   */
  static unsupportedFormat(format: string): DocumentError {
    return new DocumentError(`Unsupported document format: ${format}`, {
      format,
      code: ErrorCode.UNSUPPORTED_FORMAT,
    });
  }

  /**
   * Creates an error for parse failure.
   */
  static parseError(path: string, reason?: string): DocumentError {
    const message = reason
      ? `Failed to parse document: ${reason}`
      : `Failed to parse document: ${path}`;
    return new DocumentError(message, {
      documentPath: path,
      code: ErrorCode.DOCUMENT_PARSE_ERROR,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      documentPath: this.documentPath,
      format: this.format,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when translation/symbol resolution fails.
 */
export class TranslationError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The symbol or alias that could not be resolved.
   */
  readonly symbol?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      symbol?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'TranslationError';
    this.symbol = options?.symbol;
    this.code = options?.code ?? ErrorCode.TRANSLATION_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for unknown symbol.
   */
  static unknownSymbol(symbol: string): TranslationError {
    return new TranslationError(`Unknown symbol or alias: ${symbol}`, {
      symbol,
      code: ErrorCode.UNKNOWN_SYMBOL,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      symbol: this.symbol,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when database operations fail.
 */
export class DatabaseError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The operation that failed.
   */
  readonly operation?: string;

  /**
   * The table/collection involved.
   */
  readonly table?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      operation?: string;
      table?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'DatabaseError';
    this.operation = options?.operation;
    this.table = options?.table;
    this.code = options?.code ?? ErrorCode.DATABASE_QUERY_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for database not initialized.
   */
  static notInitialized(component: string): DatabaseError {
    return new DatabaseError(
      `${component} database not initialized. Call initialize${component}Database() first.`,
      {
        code: ErrorCode.DATABASE_NOT_INITIALIZED,
      }
    );
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      operation: this.operation,
      table: this.table,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when tool operations fail.
 */
export class ToolError extends PromptSpeakError {
  readonly code: ErrorCode;
  readonly severity: ErrorSeverity;

  /**
   * The name of the tool that failed.
   */
  readonly toolName?: string;

  constructor(
    message: string,
    options?: PromptSpeakErrorOptions & {
      toolName?: string;
      code?: ErrorCode;
    }
  ) {
    super(message, options);
    this.name = 'ToolError';
    this.toolName = options?.toolName;
    this.code = options?.code ?? ErrorCode.TOOL_EXECUTION_ERROR;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  /**
   * Creates an error for unknown tool.
   */
  static unknownTool(toolName: string): ToolError {
    return new ToolError(`Unknown tool: ${toolName}`, {
      toolName,
      code: ErrorCode.UNKNOWN_TOOL,
    });
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      toolName: this.toolName,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Error thrown for internal server errors.
 */
export class InternalError extends PromptSpeakError {
  readonly code = ErrorCode.INTERNAL_ERROR;
  readonly severity: ErrorSeverity;

  constructor(
    message: string = 'Internal server error',
    options?: PromptSpeakErrorOptions
  ) {
    super(message, options);
    this.name = 'InternalError';
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }
}

/**
 * Error thrown for unimplemented features.
 */
export class NotImplementedError extends PromptSpeakError {
  readonly code = ErrorCode.NOT_IMPLEMENTED;
  readonly severity: ErrorSeverity;

  /**
   * The feature that is not implemented.
   */
  readonly feature?: string;

  constructor(
    message: string = 'Not implemented',
    options?: PromptSpeakErrorOptions & { feature?: string }
  ) {
    super(message, options);
    this.name = 'NotImplementedError';
    this.feature = options?.feature;
    this.severity = options?.severity ?? ERROR_CODE_SEVERITY[this.code];
    this.initializeDefaults(options);
  }

  override toJSON(includeStack = false) {
    return {
      ...super.toJSON(includeStack),
      feature: this.feature,
    };
  }
}
