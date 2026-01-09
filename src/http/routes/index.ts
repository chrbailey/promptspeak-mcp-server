/**
 * HTTP Routes Module
 *
 * Consolidates all route configuration for the Express app.
 * This follows the same pattern as the MCP server's modular architecture.
 */

import { Application } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { errorHandler } from '../middleware/error-handler.js';
import { configure404Handler } from '../middleware/index.js';

// Import route modules
import healthRoutes from './health.js';
import symbolRoutes from './symbols.js';
import openapiRoutes from './openapi.js';
import agentRoutes from './agents.js';

// Re-export route modules for direct use
export { default as healthRoutes } from './health.js';
export { default as symbolRoutes } from './symbols.js';
export { default as openapiRoutes } from './openapi.js';
export { default as agentRoutes } from './agents.js';

/**
 * Configure public routes (no authentication required).
 */
export function configurePublicRoutes(app: Application): void {
  // Health check endpoints
  app.use('/health', healthRoutes);

  // OpenAPI spec endpoints
  app.use('/', openapiRoutes);
}

/**
 * Configure authenticated API routes.
 */
export function configureApiRoutes(app: Application): void {
  // Symbol management (requires authentication)
  app.use('/api/v1/symbols', authMiddleware, symbolRoutes);

  // Agent approval routes (webhook callbacks - no auth for one-click links)
  // These are the URLs sent in Slack/Discord/Email notifications
  app.use('/api/v1/agents', agentRoutes);
}

/**
 * Configure error handling routes (must be last).
 */
export function configureErrorHandling(app: Application): void {
  // 404 handler
  configure404Handler(app);

  // Global error handler
  app.use(errorHandler);
}

/**
 * Configure all routes for the Express app.
 * This is the main entry point for route configuration.
 *
 * Route order:
 * 1. Public routes (health, OpenAPI)
 * 2. Authenticated API routes
 * 3. Error handlers (404, global)
 */
export function configureRoutes(app: Application): void {
  // Public routes first
  configurePublicRoutes(app);

  // API routes
  configureApiRoutes(app);

  // Error handling last
  configureErrorHandling(app);
}
