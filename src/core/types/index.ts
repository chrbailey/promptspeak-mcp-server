/**
 * ===============================================================================
 * CORE TYPES MODULE
 * ===============================================================================
 *
 * Shared type definitions and utilities used across the codebase.
 *
 * ===============================================================================
 */

// ID Generators
export {
  generateId,
  createIdGenerator,
  generateCorrelationId,
  generateSessionId,
  generateUuidLike,
} from './id-generators.js';

// HTTP Types
export {
  createErrorResponse,
  createSuccessResponse,
} from './http-types.js';

export type {
  ErrorResponse,
  SuccessResponse,
  ApiResponse,
  PaginationParams,
  PaginatedResponse,
} from './http-types.js';
