/**
 * Error Handling Middleware
 *
 * Centralized error handling for the HTTP API.
 * Converts various error types to appropriate HTTP responses.
 */

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config.js';

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Access denied') {
    super(403, message, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`;
    super(404, message, 'NOT_FOUND', { resource, id });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, message, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, errors?: Record<string, string[]>) {
    super(422, message, 'VALIDATION_ERROR', { errors });
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends HttpError {
  constructor(retryAfter: number) {
    super(429, 'Rate limit exceeded', 'RATE_LIMIT', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class InternalError extends HttpError {
  constructor(message: string = 'Internal server error') {
    super(500, message, 'INTERNAL_ERROR');
    this.name = 'InternalError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLER MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  stack?: string;
  requestId?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const config = getConfig();
  const requestId = req.headers['x-request-id'] as string;

  // Log the error
  console.error(`[${new Date().toISOString()}] Error:`, {
    requestId,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });

  // Determine status code and build response
  let statusCode = 500;
  let response: ErrorResponse = {
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    requestId,
  };

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    response = {
      error: err.name.replace('Error', ''),
      message: err.message,
      code: err.code,
      details: err.details,
      requestId,
    };
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // JSON parse error
    statusCode = 400;
    response = {
      error: 'Bad Request',
      message: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
      requestId,
    };
  } else if (err.message?.includes('CORS')) {
    statusCode = 403;
    response = {
      error: 'Forbidden',
      message: 'CORS policy violation',
      code: 'CORS_ERROR',
      requestId,
    };
  }

  // Include stack trace in development
  if (config.nodeEnv === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
