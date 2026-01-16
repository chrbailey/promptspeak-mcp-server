/**
 * ===============================================================================
 * MCP RESPONSE ADAPTER
 * ===============================================================================
 *
 * Bridges the unified Result<T> pattern to MCP's CallToolResult format.
 * Provides consistent response formatting for all MCP tool handlers.
 *
 * Usage:
 *   import { toMcpResult, mcpSuccess, mcpFailure } from '../core/result/mcp-adapter.js';
 *
 *   // From a Result<T>
 *   const result = await someOperation();
 *   return toMcpResult(result);
 *
 *   // Direct creation
 *   return mcpSuccess({ id: 1, name: 'test' });
 *   return mcpFailure('NOT_FOUND', 'Item not found');
 *
 * ===============================================================================
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Result, Failure } from './types.js';
import { isSuccess, success, failure as createFailure, fromError } from './builders.js';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

/**
 * Options for MCP response formatting.
 */
export interface McpResponseOptions {
  /** Pretty print JSON output (default: true) */
  prettyPrint?: boolean;
  /** Include metadata in response (default: false for cleaner output) */
  includeMetadata?: boolean;
  /** Include timestamp in response (default: true) */
  includeTimestamp?: boolean;
}

/**
 * Standard success response structure for MCP tools.
 */
export interface McpSuccessPayload<T = unknown> {
  success: true;
  data: T;
  timestamp?: string;
}

/**
 * Standard error response structure for MCP tools.
 */
export interface McpErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  };
  timestamp: string;
}

// -----------------------------------------------------------------------------
// MCP RESULT CONVERTERS
// -----------------------------------------------------------------------------

/**
 * Converts a Result<T> to MCP's CallToolResult format.
 *
 * @param result - The Result to convert
 * @param options - Formatting options
 * @returns CallToolResult for MCP response
 *
 * @example
 * ```typescript
 * const result = await validateSymbol(input);
 * return toMcpResult(result);
 * ```
 */
export function toMcpResult<T>(
  result: Result<T>,
  options: McpResponseOptions = {}
): CallToolResult {
  const { prettyPrint = true, includeTimestamp = true } = options;

  if (isSuccess(result)) {
    const payload: McpSuccessPayload<T> = {
      success: true,
      data: result.data,
    };

    if (includeTimestamp) {
      payload.timestamp = new Date().toISOString();
    }

    return {
      content: [{
        type: 'text',
        text: prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
      }],
    };
  }

  // Failure case
  const errorPayload: McpErrorPayload = {
    success: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      details: result.error.details,
      retryable: result.error.retryable,
    },
    timestamp: new Date().toISOString(),
  };

  return {
    content: [{
      type: 'text',
      text: prettyPrint ? JSON.stringify(errorPayload, null, 2) : JSON.stringify(errorPayload),
    }],
    isError: true,
  };
}

/**
 * Creates an MCP success response directly from data.
 *
 * @param data - The success data
 * @param options - Formatting options
 * @returns CallToolResult for MCP response
 *
 * @example
 * ```typescript
 * return mcpSuccess({ validated: true, symbolId: 'Ξ.COMPANY.NVDA' });
 * ```
 */
export function mcpSuccess<T>(
  data: T,
  options: McpResponseOptions = {}
): CallToolResult {
  return toMcpResult(success(data), options);
}

/**
 * Creates an MCP failure response directly.
 *
 * @param code - Machine-readable error code
 * @param message - Human-readable error message
 * @param details - Optional additional details
 * @param options - Formatting options
 * @returns CallToolResult with isError: true
 *
 * @example
 * ```typescript
 * return mcpFailure('VALIDATION_FAILED', 'Invalid symbol format', { input });
 * ```
 */
export function mcpFailure(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  options: McpResponseOptions = {}
): CallToolResult {
  return toMcpResult(
    createFailure(code, message, { details }),
    options
  );
}

/**
 * Creates an MCP failure response in legacy format for backwards compatibility.
 * Uses simple { error: "message" } format instead of structured error.
 *
 * @param message - Error message
 * @param options - Formatting options
 * @returns CallToolResult with isError: true
 *
 * @deprecated Use mcpFailure for new code
 */
export function mcpLegacyFailure(
  message: string,
  options: McpResponseOptions = {}
): CallToolResult {
  const { prettyPrint = true } = options;
  const payload = { error: message };

  return {
    content: [{
      type: 'text',
      text: prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
    }],
    isError: true,
  };
}

/**
 * Creates an MCP failure response from an Error object.
 *
 * @param error - The error to convert
 * @param defaultCode - Default error code if not present on error
 * @param options - Formatting options
 * @returns CallToolResult with isError: true
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   return mcpFromError(err, 'OPERATION_FAILED');
 * }
 * ```
 */
export function mcpFromError(
  error: Error | unknown,
  defaultCode: string = 'UNKNOWN_ERROR',
  options: McpResponseOptions = {}
): CallToolResult {
  return toMcpResult(fromError(error, defaultCode), options);
}

// -----------------------------------------------------------------------------
// LEGACY FORMAT SUPPORT
// -----------------------------------------------------------------------------

/**
 * Legacy response format used by existing tool handlers.
 * For migration purposes only.
 */
export interface LegacyToolResponse {
  success?: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Converts a legacy tool response to MCP format.
 * Use this to wrap existing tool handlers during migration.
 *
 * @param response - Legacy response object
 * @param options - Formatting options
 * @returns CallToolResult for MCP response
 *
 * @example
 * ```typescript
 * const legacyResult = await oldToolHandler(args);
 * return fromLegacyResponse(legacyResult);
 * ```
 */
export function fromLegacyResponse(
  response: LegacyToolResponse,
  options: McpResponseOptions = {}
): CallToolResult {
  const { prettyPrint = true } = options;

  // Check if it's an error response
  const isError = response.success === false || !!response.error;

  return {
    content: [{
      type: 'text',
      text: prettyPrint ? JSON.stringify(response, null, 2) : JSON.stringify(response),
    }],
    ...(isError && { isError: true }),
  };
}

// -----------------------------------------------------------------------------
// BATCH RESPONSE HELPERS
// -----------------------------------------------------------------------------

/**
 * Creates an MCP response for batch operations with summary.
 *
 * @param results - Array of individual results
 * @param summary - Batch operation summary
 * @param options - Formatting options
 * @returns CallToolResult for MCP response
 */
export function mcpBatchResult<T>(
  results: Array<{ key: string; result: Result<T> }>,
  summary: { total: number; succeeded: number; failed: number },
  options: McpResponseOptions = {}
): CallToolResult {
  const { prettyPrint = true } = options;

  const formattedResults = results.map(({ key, result }) => ({
    key,
    success: isSuccess(result),
    ...(isSuccess(result)
      ? { data: result.data }
      : { error: { code: result.error.code, message: result.error.message } }
    ),
  }));

  const payload = {
    success: summary.failed === 0,
    summary,
    results: formattedResults,
    timestamp: new Date().toISOString(),
  };

  return {
    content: [{
      type: 'text',
      text: prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload),
    }],
    ...(summary.failed > 0 && summary.succeeded === 0 && { isError: true }),
  };
}

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Wraps an async tool handler to automatically convert Results to MCP format.
 *
 * @param handler - Async function returning Result<T>
 * @param errorCode - Default error code for unexpected errors
 * @returns Wrapped handler returning CallToolResult
 *
 * @example
 * ```typescript
 * const handler = wrapToolHandler(
 *   async (args) => validateSymbol(args.symbol),
 *   'VALIDATION_FAILED'
 * );
 * ```
 */
export function wrapToolHandler<TArgs, TResult>(
  handler: (args: TArgs) => Promise<Result<TResult>>,
  errorCode: string = 'HANDLER_ERROR'
): (args: TArgs) => Promise<CallToolResult> {
  return async (args: TArgs): Promise<CallToolResult> => {
    try {
      const result = await handler(args);
      return toMcpResult(result);
    } catch (error) {
      return mcpFromError(error, errorCode);
    }
  };
}

/**
 * Wraps a sync tool handler to automatically convert Results to MCP format.
 *
 * @param handler - Sync function returning Result<T>
 * @param errorCode - Default error code for unexpected errors
 * @returns Wrapped handler returning CallToolResult
 */
export function wrapToolHandlerSync<TArgs, TResult>(
  handler: (args: TArgs) => Result<TResult>,
  errorCode: string = 'HANDLER_ERROR'
): (args: TArgs) => CallToolResult {
  return (args: TArgs): CallToolResult => {
    try {
      const result = handler(args);
      return toMcpResult(result);
    } catch (error) {
      return mcpFromError(error, errorCode);
    }
  };
}
