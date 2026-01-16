/**
 * HTTP Middleware Module
 *
 * Consolidates all middleware configuration for the Express app.
 * This follows the same pattern as the MCP server's modular architecture.
 */

import { Application, Request, Response, NextFunction } from 'express';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { HttpConfig } from '../config.js';
import { requestLogger } from './request-logger.js';

// Re-export middleware for direct use
export { authMiddleware, optionalAuthMiddleware, requireScopes } from './auth.js';
export type { AuthenticatedRequest, AuthenticatedUser } from './auth.js';
export { errorHandler, HttpError, BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, ValidationError, RateLimitError, InternalError } from './error-handler.js';
export { requestLogger } from './request-logger.js';

/**
 * Configure security middleware (helmet, cors).
 */
export function configureSecurityMiddleware(app: Application, config: HttpConfig): void {
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for some API clients
  }));

  // CORS configuration for CustomGPT and other clients
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (config.cors.origins.includes(origin) || config.cors.origins.includes('*')) {
        callback(null, true);
      } else if (config.nodeEnv === 'development') {
        // In development, allow any origin
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', config.auth.apiKeyHeader, 'X-Lens'],
    exposedHeaders: ['X-Request-Id', 'X-Rate-Limit-Remaining'],
  }));
}

/**
 * Configure rate limiting middleware.
 */
export function configureRateLimiting(app: Application, config: HttpConfig): void {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
    },
    keyGenerator: (req: Request) => {
      // Use API key if present, otherwise IP
      const apiKey = req.headers[config.auth.apiKeyHeader.toLowerCase()] as string;
      if (apiKey) {
        return `key:${apiKey.substring(0, 16)}`;
      }
      // Use x-forwarded-for or direct IP, normalized for IPv6
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || 'unknown';
      return `ip:${ip}`;
    },
    validate: { xForwardedForHeader: false }, // Disable IPv6 validation warning
  });

  app.use('/api/', limiter);
}

/**
 * Configure body parsing middleware.
 */
export function configureBodyParsing(app: Application): void {
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
}

/**
 * Configure request logging middleware.
 */
export function configureRequestLogging(app: Application): void {
  app.use(requestLogger);
}

/**
 * Configure 404 handler.
 */
export function configure404Handler(app: Application): void {
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });
}

/**
 * Configure all middleware for the Express app.
 * This is the main entry point for middleware configuration.
 */
export function configureMiddleware(app: Application, config: HttpConfig): void {
  // Security first
  configureSecurityMiddleware(app, config);

  // Rate limiting on API routes
  configureRateLimiting(app, config);

  // Body parsing
  configureBodyParsing(app);

  // Request logging
  configureRequestLogging(app);
}
