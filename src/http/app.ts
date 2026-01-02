/**
 * Express Application Configuration
 *
 * Sets up the Express app with all middleware and routes.
 * This file is separate from server.ts to allow testing without starting the server.
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { getConfig } from './config.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth.js';
import symbolRoutes from './routes/symbols.js';
import healthRoutes from './routes/health.js';
import openapiRoutes from './routes/openapi.js';

export function createApp(): Application {
  const app = express();
  const config = getConfig();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY MIDDLEWARE
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // BODY PARSING
  // ═══════════════════════════════════════════════════════════════════════════

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUEST LOGGING
  // ═══════════════════════════════════════════════════════════════════════════

  app.use(requestLogger);

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // Health check (no auth required)
  app.use('/health', healthRoutes);

  // OpenAPI spec (no auth required)
  app.use('/', openapiRoutes);

  // API routes (auth required)
  app.use('/api/v1/symbols', authMiddleware, symbolRoutes);

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
