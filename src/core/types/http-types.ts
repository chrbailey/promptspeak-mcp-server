/**
 * ===============================================================================
 * SHARED HTTP TYPES
 * ===============================================================================
 *
 * Common HTTP-related type definitions used across the HTTP layer.
 * Consolidates duplicate definitions from error-handler.ts and routes/*.ts
 *
 * ===============================================================================
 */

/**
 * Standard error response format for HTTP endpoints.
 */
export interface ErrorResponse {
  /** Always false for errors */
  success: false;
  /** Machine-readable error code */
  error: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details (optional) */
  details?: Record<string, unknown>;
  /** HTTP status code */
  statusCode?: number;
  /** Request correlation ID for tracing */
  correlationId?: string;
  /** ISO timestamp */
  timestamp?: string;
}

/**
 * Standard success response format for HTTP endpoints.
 */
export interface SuccessResponse<T = unknown> {
  /** Always true for success */
  success: true;
  /** Response data */
  data: T;
  /** ISO timestamp */
  timestamp?: string;
  /** Request correlation ID for tracing */
  correlationId?: string;
}

/**
 * Union type for API responses.
 */
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Pagination parameters for list endpoints.
 */
export interface PaginationParams {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  /** Response items */
  items: T[];
  /** Pagination metadata */
  pagination: {
    /** Current page number */
    page: number;
    /** Items per page */
    limit: number;
    /** Total number of items */
    total: number;
    /** Total number of pages */
    totalPages: number;
    /** Whether there's a next page */
    hasNext: boolean;
    /** Whether there's a previous page */
    hasPrev: boolean;
  };
}

/**
 * Create an error response object.
 */
export function createErrorResponse(
  error: string,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    statusCode?: number;
    correlationId?: string;
  }
): ErrorResponse {
  return {
    success: false,
    error,
    message,
    details: options?.details,
    statusCode: options?.statusCode,
    correlationId: options?.correlationId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a success response object.
 */
export function createSuccessResponse<T>(
  data: T,
  correlationId?: string
): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    correlationId,
  };
}
