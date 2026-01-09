/**
 * Express Application Factory
 *
 * Creates and configures the Express app with all middleware and routes.
 * This file is separate from server.ts to allow testing without starting the server.
 *
 * Follows the modular pattern established in the MCP server refactor.
 */

import express, { Application } from 'express';
import { getConfig } from './config.js';
import { configureMiddleware } from './middleware/index.js';
import { configureRoutes } from './routes/index.js';

/**
 * Create and configure an Express application.
 *
 * @returns Configured Express application
 *
 * @example
 * ```typescript
 * const app = createApp();
 * app.listen(3000, () => {
 *   console.log('Server running on port 3000');
 * });
 * ```
 */
export function createApp(): Application {
  const app = express();
  const config = getConfig();

  // Configure middleware (security, rate limiting, body parsing, logging)
  configureMiddleware(app, config);

  // Configure routes (public, API, error handlers)
  configureRoutes(app);

  return app;
}
