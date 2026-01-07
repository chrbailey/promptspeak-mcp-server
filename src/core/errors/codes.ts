/**
 * ===============================================================================
 * ERROR CODES - Unified Error Code Enumeration
 * ===============================================================================
 *
 * Consolidates all error codes used throughout the PromptSpeak MCP server.
 * These codes provide machine-readable error identification for logging,
 * monitoring, and programmatic error handling.
 *
 * ===============================================================================
 */

/**
 * Severity levels for errors.
 * Used for logging, alerting, and determining retry behavior.
 */
export enum ErrorSeverity {
  /** Recoverable errors that can be retried */
  LOW = 'low',
  /** Errors that may require intervention but don't halt the system */
  MEDIUM = 'medium',
  /** Critical errors that may affect system stability */
  HIGH = 'high',
  /** Fatal errors that require immediate attention */
  CRITICAL = 'critical',
}

/**
 * Unified error codes for the PromptSpeak MCP server.
 * Organized by category for easier navigation.
 */
export enum ErrorCode {
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Unknown or unclassified error */
  UNKNOWN = 'UNKNOWN',
  /** Internal server error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** Operation not implemented */
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Input validation failed */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Invalid JSON in request body */
  INVALID_JSON = 'INVALID_JSON',
  /** Required field missing */
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  /** Field value out of range */
  VALUE_OUT_OF_RANGE = 'VALUE_OUT_OF_RANGE',
  /** Invalid format */
  INVALID_FORMAT = 'INVALID_FORMAT',

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Resource already exists */
  CONFLICT = 'CONFLICT',
  /** Resource has been deleted */
  GONE = 'GONE',
  /** Resource is locked */
  LOCKED = 'LOCKED',

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK & COMMUNICATION ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Network request failed */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Request timed out */
  TIMEOUT = 'TIMEOUT',
  /** Connection refused */
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  /** DNS resolution failed */
  DNS_ERROR = 'DNS_ERROR',
  /** Invalid response from external service */
  INVALID_RESPONSE = 'INVALID_RESPONSE',

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING & CIRCUIT BREAKER ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Circuit breaker is open */
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATION & AUTHORIZATION ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Authentication failed */
  AUTH_FAILED = 'AUTH_FAILED',
  /** Authentication required */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Access denied */
  FORBIDDEN = 'FORBIDDEN',
  /** Token expired */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** Invalid token */
  INVALID_TOKEN = 'INVALID_TOKEN',
  /** Insufficient permissions */
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTER ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General adapter error */
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  /** External API server error */
  SERVER_ERROR = 'SERVER_ERROR',
  /** Adapter configuration error */
  ADAPTER_CONFIG_ERROR = 'ADAPTER_CONFIG_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General agent error */
  AGENT_ERROR = 'AGENT_ERROR',
  /** Agent not found */
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  /** Agent already registered */
  AGENT_ALREADY_REGISTERED = 'AGENT_ALREADY_REGISTERED',
  /** Agent execution failed */
  AGENT_EXECUTION_ERROR = 'AGENT_EXECUTION_ERROR',
  /** Agent communication error */
  AGENT_COMMUNICATION_ERROR = 'AGENT_COMMUNICATION_ERROR',
  /** Maximum delegation depth exceeded */
  DELEGATION_DEPTH_EXCEEDED = 'DELEGATION_DEPTH_EXCEEDED',
  /** Agent spawn failed */
  AGENT_SPAWN_ERROR = 'AGENT_SPAWN_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // INTENT ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General intent error */
  INTENT_ERROR = 'INTENT_ERROR',
  /** Intent parsing failed */
  INTENT_PARSE_ERROR = 'INTENT_PARSE_ERROR',
  /** Unknown intent */
  INTENT_UNKNOWN = 'INTENT_UNKNOWN',
  /** Intent execution failed */
  INTENT_EXECUTION_ERROR = 'INTENT_EXECUTION_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // MISSION ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General mission error */
  MISSION_ERROR = 'MISSION_ERROR',
  /** Mission not found */
  MISSION_NOT_FOUND = 'MISSION_NOT_FOUND',
  /** Mission already completed */
  MISSION_COMPLETED = 'MISSION_COMPLETED',
  /** Mission expired */
  MISSION_EXPIRED = 'MISSION_EXPIRED',
  /** Mission validation failed */
  MISSION_VALIDATION_ERROR = 'MISSION_VALIDATION_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPOSAL ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General proposal error */
  PROPOSAL_ERROR = 'PROPOSAL_ERROR',
  /** Proposal not found */
  PROPOSAL_NOT_FOUND = 'PROPOSAL_NOT_FOUND',
  /** Proposal not pending */
  PROPOSAL_NOT_PENDING = 'PROPOSAL_NOT_PENDING',
  /** Proposal expired */
  PROPOSAL_EXPIRED = 'PROPOSAL_EXPIRED',

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General document error */
  DOCUMENT_ERROR = 'DOCUMENT_ERROR',
  /** Document parsing failed */
  DOCUMENT_PARSE_ERROR = 'DOCUMENT_PARSE_ERROR',
  /** Document not found */
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  /** Unsupported document format */
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** General translation error */
  TRANSLATION_ERROR = 'TRANSLATION_ERROR',
  /** Unknown symbol or alias */
  UNKNOWN_SYMBOL = 'UNKNOWN_SYMBOL',
  /** Symbol resolution failed */
  SYMBOL_RESOLUTION_ERROR = 'SYMBOL_RESOLUTION_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Database not initialized */
  DATABASE_NOT_INITIALIZED = 'DATABASE_NOT_INITIALIZED',
  /** Database connection error */
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  /** Database query error */
  DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // TOOL ERRORS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Unknown tool */
  UNKNOWN_TOOL = 'UNKNOWN_TOOL',
  /** Tool execution error */
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP ERRORS (for compatibility with existing HttpError patterns)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Bad request */
  BAD_REQUEST = 'BAD_REQUEST',
  /** CORS policy violation */
  CORS_ERROR = 'CORS_ERROR',
}

/**
 * Map of error codes to their default HTTP status codes.
 */
export const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
  // General
  [ErrorCode.UNKNOWN]: 500,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,

  // Validation
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.INVALID_JSON]: 400,
  [ErrorCode.REQUIRED_FIELD_MISSING]: 400,
  [ErrorCode.VALUE_OUT_OF_RANGE]: 400,
  [ErrorCode.INVALID_FORMAT]: 400,

  // Resource
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.GONE]: 410,
  [ErrorCode.LOCKED]: 423,

  // Network
  [ErrorCode.NETWORK_ERROR]: 502,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.CONNECTION_REFUSED]: 502,
  [ErrorCode.DNS_ERROR]: 502,
  [ErrorCode.INVALID_RESPONSE]: 502,

  // Rate Limiting
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.CIRCUIT_OPEN]: 503,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,

  // Auth
  [ErrorCode.AUTH_FAILED]: 401,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.TOKEN_EXPIRED]: 401,
  [ErrorCode.INVALID_TOKEN]: 401,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,

  // Adapter
  [ErrorCode.ADAPTER_ERROR]: 502,
  [ErrorCode.SERVER_ERROR]: 502,
  [ErrorCode.ADAPTER_CONFIG_ERROR]: 500,

  // Agent
  [ErrorCode.AGENT_ERROR]: 500,
  [ErrorCode.AGENT_NOT_FOUND]: 404,
  [ErrorCode.AGENT_ALREADY_REGISTERED]: 409,
  [ErrorCode.AGENT_EXECUTION_ERROR]: 500,
  [ErrorCode.AGENT_COMMUNICATION_ERROR]: 502,
  [ErrorCode.DELEGATION_DEPTH_EXCEEDED]: 400,
  [ErrorCode.AGENT_SPAWN_ERROR]: 500,

  // Intent
  [ErrorCode.INTENT_ERROR]: 400,
  [ErrorCode.INTENT_PARSE_ERROR]: 400,
  [ErrorCode.INTENT_UNKNOWN]: 400,
  [ErrorCode.INTENT_EXECUTION_ERROR]: 500,

  // Mission
  [ErrorCode.MISSION_ERROR]: 500,
  [ErrorCode.MISSION_NOT_FOUND]: 404,
  [ErrorCode.MISSION_COMPLETED]: 409,
  [ErrorCode.MISSION_EXPIRED]: 410,
  [ErrorCode.MISSION_VALIDATION_ERROR]: 422,

  // Proposal
  [ErrorCode.PROPOSAL_ERROR]: 500,
  [ErrorCode.PROPOSAL_NOT_FOUND]: 404,
  [ErrorCode.PROPOSAL_NOT_PENDING]: 409,
  [ErrorCode.PROPOSAL_EXPIRED]: 410,

  // Document
  [ErrorCode.DOCUMENT_ERROR]: 500,
  [ErrorCode.DOCUMENT_PARSE_ERROR]: 400,
  [ErrorCode.DOCUMENT_NOT_FOUND]: 404,
  [ErrorCode.UNSUPPORTED_FORMAT]: 415,

  // Translation
  [ErrorCode.TRANSLATION_ERROR]: 400,
  [ErrorCode.UNKNOWN_SYMBOL]: 400,
  [ErrorCode.SYMBOL_RESOLUTION_ERROR]: 400,

  // Database
  [ErrorCode.DATABASE_NOT_INITIALIZED]: 500,
  [ErrorCode.DATABASE_CONNECTION_ERROR]: 503,
  [ErrorCode.DATABASE_QUERY_ERROR]: 500,

  // Tool
  [ErrorCode.UNKNOWN_TOOL]: 404,
  [ErrorCode.TOOL_EXECUTION_ERROR]: 500,

  // HTTP
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.CORS_ERROR]: 403,
};

/**
 * Map of error codes to their default retryable status.
 */
export const ERROR_CODE_RETRYABLE: Record<ErrorCode, boolean> = {
  // General
  [ErrorCode.UNKNOWN]: false,
  [ErrorCode.INTERNAL_ERROR]: false,
  [ErrorCode.NOT_IMPLEMENTED]: false,

  // Validation
  [ErrorCode.VALIDATION_ERROR]: false,
  [ErrorCode.INVALID_JSON]: false,
  [ErrorCode.REQUIRED_FIELD_MISSING]: false,
  [ErrorCode.VALUE_OUT_OF_RANGE]: false,
  [ErrorCode.INVALID_FORMAT]: false,

  // Resource
  [ErrorCode.NOT_FOUND]: false,
  [ErrorCode.CONFLICT]: false,
  [ErrorCode.GONE]: false,
  [ErrorCode.LOCKED]: true,

  // Network
  [ErrorCode.NETWORK_ERROR]: true,
  [ErrorCode.TIMEOUT]: true,
  [ErrorCode.CONNECTION_REFUSED]: true,
  [ErrorCode.DNS_ERROR]: true,
  [ErrorCode.INVALID_RESPONSE]: false,

  // Rate Limiting
  [ErrorCode.RATE_LIMITED]: true,
  [ErrorCode.CIRCUIT_OPEN]: true,
  [ErrorCode.SERVICE_UNAVAILABLE]: true,

  // Auth
  [ErrorCode.AUTH_FAILED]: false,
  [ErrorCode.UNAUTHORIZED]: false,
  [ErrorCode.FORBIDDEN]: false,
  [ErrorCode.TOKEN_EXPIRED]: false,
  [ErrorCode.INVALID_TOKEN]: false,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: false,

  // Adapter
  [ErrorCode.ADAPTER_ERROR]: false,
  [ErrorCode.SERVER_ERROR]: true,
  [ErrorCode.ADAPTER_CONFIG_ERROR]: false,

  // Agent
  [ErrorCode.AGENT_ERROR]: false,
  [ErrorCode.AGENT_NOT_FOUND]: false,
  [ErrorCode.AGENT_ALREADY_REGISTERED]: false,
  [ErrorCode.AGENT_EXECUTION_ERROR]: false,
  [ErrorCode.AGENT_COMMUNICATION_ERROR]: true,
  [ErrorCode.DELEGATION_DEPTH_EXCEEDED]: false,
  [ErrorCode.AGENT_SPAWN_ERROR]: false,

  // Intent
  [ErrorCode.INTENT_ERROR]: false,
  [ErrorCode.INTENT_PARSE_ERROR]: false,
  [ErrorCode.INTENT_UNKNOWN]: false,
  [ErrorCode.INTENT_EXECUTION_ERROR]: false,

  // Mission
  [ErrorCode.MISSION_ERROR]: false,
  [ErrorCode.MISSION_NOT_FOUND]: false,
  [ErrorCode.MISSION_COMPLETED]: false,
  [ErrorCode.MISSION_EXPIRED]: false,
  [ErrorCode.MISSION_VALIDATION_ERROR]: false,

  // Proposal
  [ErrorCode.PROPOSAL_ERROR]: false,
  [ErrorCode.PROPOSAL_NOT_FOUND]: false,
  [ErrorCode.PROPOSAL_NOT_PENDING]: false,
  [ErrorCode.PROPOSAL_EXPIRED]: false,

  // Document
  [ErrorCode.DOCUMENT_ERROR]: false,
  [ErrorCode.DOCUMENT_PARSE_ERROR]: false,
  [ErrorCode.DOCUMENT_NOT_FOUND]: false,
  [ErrorCode.UNSUPPORTED_FORMAT]: false,

  // Translation
  [ErrorCode.TRANSLATION_ERROR]: false,
  [ErrorCode.UNKNOWN_SYMBOL]: false,
  [ErrorCode.SYMBOL_RESOLUTION_ERROR]: false,

  // Database
  [ErrorCode.DATABASE_NOT_INITIALIZED]: false,
  [ErrorCode.DATABASE_CONNECTION_ERROR]: true,
  [ErrorCode.DATABASE_QUERY_ERROR]: false,

  // Tool
  [ErrorCode.UNKNOWN_TOOL]: false,
  [ErrorCode.TOOL_EXECUTION_ERROR]: false,

  // HTTP
  [ErrorCode.BAD_REQUEST]: false,
  [ErrorCode.CORS_ERROR]: false,
};

/**
 * Map of error codes to their default severity.
 */
export const ERROR_CODE_SEVERITY: Record<ErrorCode, ErrorSeverity> = {
  // General
  [ErrorCode.UNKNOWN]: ErrorSeverity.HIGH,
  [ErrorCode.INTERNAL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.NOT_IMPLEMENTED]: ErrorSeverity.LOW,

  // Validation
  [ErrorCode.VALIDATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.INVALID_JSON]: ErrorSeverity.LOW,
  [ErrorCode.REQUIRED_FIELD_MISSING]: ErrorSeverity.LOW,
  [ErrorCode.VALUE_OUT_OF_RANGE]: ErrorSeverity.LOW,
  [ErrorCode.INVALID_FORMAT]: ErrorSeverity.LOW,

  // Resource
  [ErrorCode.NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.CONFLICT]: ErrorSeverity.LOW,
  [ErrorCode.GONE]: ErrorSeverity.LOW,
  [ErrorCode.LOCKED]: ErrorSeverity.LOW,

  // Network
  [ErrorCode.NETWORK_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.TIMEOUT]: ErrorSeverity.MEDIUM,
  [ErrorCode.CONNECTION_REFUSED]: ErrorSeverity.MEDIUM,
  [ErrorCode.DNS_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.INVALID_RESPONSE]: ErrorSeverity.MEDIUM,

  // Rate Limiting
  [ErrorCode.RATE_LIMITED]: ErrorSeverity.LOW,
  [ErrorCode.CIRCUIT_OPEN]: ErrorSeverity.MEDIUM,
  [ErrorCode.SERVICE_UNAVAILABLE]: ErrorSeverity.MEDIUM,

  // Auth
  [ErrorCode.AUTH_FAILED]: ErrorSeverity.MEDIUM,
  [ErrorCode.UNAUTHORIZED]: ErrorSeverity.LOW,
  [ErrorCode.FORBIDDEN]: ErrorSeverity.LOW,
  [ErrorCode.TOKEN_EXPIRED]: ErrorSeverity.LOW,
  [ErrorCode.INVALID_TOKEN]: ErrorSeverity.MEDIUM,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: ErrorSeverity.LOW,

  // Adapter
  [ErrorCode.ADAPTER_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.SERVER_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.ADAPTER_CONFIG_ERROR]: ErrorSeverity.HIGH,

  // Agent
  [ErrorCode.AGENT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.AGENT_NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.AGENT_ALREADY_REGISTERED]: ErrorSeverity.LOW,
  [ErrorCode.AGENT_EXECUTION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.AGENT_COMMUNICATION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.DELEGATION_DEPTH_EXCEEDED]: ErrorSeverity.LOW,
  [ErrorCode.AGENT_SPAWN_ERROR]: ErrorSeverity.MEDIUM,

  // Intent
  [ErrorCode.INTENT_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.INTENT_PARSE_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.INTENT_UNKNOWN]: ErrorSeverity.LOW,
  [ErrorCode.INTENT_EXECUTION_ERROR]: ErrorSeverity.MEDIUM,

  // Mission
  [ErrorCode.MISSION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.MISSION_NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.MISSION_COMPLETED]: ErrorSeverity.LOW,
  [ErrorCode.MISSION_EXPIRED]: ErrorSeverity.LOW,
  [ErrorCode.MISSION_VALIDATION_ERROR]: ErrorSeverity.LOW,

  // Proposal
  [ErrorCode.PROPOSAL_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.PROPOSAL_NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.PROPOSAL_NOT_PENDING]: ErrorSeverity.LOW,
  [ErrorCode.PROPOSAL_EXPIRED]: ErrorSeverity.LOW,

  // Document
  [ErrorCode.DOCUMENT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.DOCUMENT_PARSE_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.DOCUMENT_NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.UNSUPPORTED_FORMAT]: ErrorSeverity.LOW,

  // Translation
  [ErrorCode.TRANSLATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.UNKNOWN_SYMBOL]: ErrorSeverity.LOW,
  [ErrorCode.SYMBOL_RESOLUTION_ERROR]: ErrorSeverity.LOW,

  // Database
  [ErrorCode.DATABASE_NOT_INITIALIZED]: ErrorSeverity.CRITICAL,
  [ErrorCode.DATABASE_CONNECTION_ERROR]: ErrorSeverity.CRITICAL,
  [ErrorCode.DATABASE_QUERY_ERROR]: ErrorSeverity.HIGH,

  // Tool
  [ErrorCode.UNKNOWN_TOOL]: ErrorSeverity.LOW,
  [ErrorCode.TOOL_EXECUTION_ERROR]: ErrorSeverity.MEDIUM,

  // HTTP
  [ErrorCode.BAD_REQUEST]: ErrorSeverity.LOW,
  [ErrorCode.CORS_ERROR]: ErrorSeverity.LOW,
};
