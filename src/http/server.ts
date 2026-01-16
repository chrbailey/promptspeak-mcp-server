/**
 * HTTP Server Entry Point
 *
 * Starts the Express HTTP server for REST API access.
 * This is separate from the MCP server (src/server.ts).
 *
 * Usage:
 *   npm run start:http    - Start production server
 *   npm run dev:http      - Start development server with hot reload
 *
 * Follows the modular pattern established in the MCP server refactor.
 */

// Load environment variables first
import 'dotenv/config';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { initializeHttpServer, createLogger } from './server-init.js';

const logger = createLogger('HttpServer');

async function main(): Promise<void> {
  logger.info('PromptSpeak HTTP API Server starting...');
  logger.info('REST API for CustomGPT Actions');

  // Load configuration
  const config = loadConfig();
  logger.info('Configuration loaded', {
    environment: config.nodeEnv,
    port: config.port,
    database: config.dbPath,
  });

  // Initialize all subsystems
  const initResult = await initializeHttpServer({ config });

  if (!initResult.success) {
    logger.error('Server initialization failed', undefined, {
      errors: initResult.errors,
    });
    process.exit(1);
  }

  // Create and start Express app
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info('Server started', {
      url: `http://${config.host}:${config.port}`,
      authHeader: config.auth.apiKeyHeader,
      endpoints: ['/health', '/api/v1/symbols', '/api/v1/agents'],
    });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Failed to start server', error instanceof Error ? error : undefined);
  process.exit(1);
});
