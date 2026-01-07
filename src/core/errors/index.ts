/**
 * ===============================================================================
 * ERROR HANDLING MODULE - Unified Error System for PromptSpeak
 * ===============================================================================
 *
 * This module provides a comprehensive error handling system for the PromptSpeak
 * MCP server. It includes:
 *
 *   - ErrorCode enum for machine-readable error identification
 *   - ErrorSeverity enum for error categorization
 *   - PromptSpeakError base class for structured errors
 *   - Specific error classes for different error scenarios
 *   - Type guards and utility functions for error handling
 *
 * Usage:
 * ```typescript
 * import {
 *   ValidationError,
 *   NotFoundError,
 *   ErrorCode,
 *   isPromptSpeakError,
 * } from './core/errors/index.js';
 *
 * // Throw a specific error
 * throw new ValidationError('Invalid input', {
 *   details: { field: 'email', value: 'invalid' }
 * });
 *
 * // Check error type
 * if (isPromptSpeakError(error)) {
 *   console.log(error.toJSON());
 * }
 * ```
 *
 * ===============================================================================
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CODES & SEVERITY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ErrorCode,
  ErrorSeverity,
  ERROR_CODE_TO_STATUS,
  ERROR_CODE_RETRYABLE,
  ERROR_CODE_SEVERITY,
} from './codes.js';

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ERROR CLASS & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  PromptSpeakError,
  PromptSpeakErrorOptions,
  SerializedError,
  isPromptSpeakError,
  hasErrorCode,
  toPromptSpeakError,
} from './base.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIFIC ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Validation
  ValidationError,

  // Resource
  NotFoundError,
  ConflictError,

  // Network
  NetworkError,
  TimeoutError,

  // Rate Limiting & Circuit Breaker
  RateLimitError,
  CircuitBreakerError,

  // Authentication & Authorization
  AuthenticationError,
  ForbiddenError,

  // Adapter
  AdapterError,

  // Agent
  AgentError,

  // Intent
  IntentError,

  // Mission
  MissionError,

  // Proposal
  ProposalError,

  // Document
  DocumentError,

  // Translation
  TranslationError,

  // Database
  DatabaseError,

  // Tool
  ToolError,

  // General
  InternalError,
  NotImplementedError,
} from './types.js';
