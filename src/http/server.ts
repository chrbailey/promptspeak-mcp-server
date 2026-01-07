/**
 * HTTP Server Entry Point
 *
 * Starts the Express HTTP server for REST API access.
 * This is separate from the MCP server (src/server.ts).
 *
 * Usage:
 *   npm run start:http    - Start production server
 *   npm run dev:http      - Start development server with hot reload
 */

import { createApp } from './app.js';
import { loadConfig, getConfig } from './config.js';
import { initializeDatabase } from '../symbols/database.js';
import { initializeSymbolManager } from '../symbols/manager.js';
import { ensureDefaultApiKey, initializeApiKeyTable } from '../auth/api-key.js';
import { createLogger } from '../core/logging/index.js';
import * as path from 'path';
import * as fs from 'fs';

const logger = createLogger('HttpServer');

async function main(): Promise<void> {
  logger.info('PromptSpeak HTTP API Server starting...');
  logger.info('REST API for CustomGPT Actions');

  // Load configuration
  const config = loadConfig();
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Port: ${config.port}`);
  logger.info(`Database: ${config.dbPath}`);

  // Ensure data directory exists
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info(`Created data directory: ${dataDir}`);
  }

  // Initialize database
  logger.info('Initializing database...');
  initializeDatabase(config.dbPath);

  // Initialize API key table
  logger.info('Initializing API key table...');
  initializeApiKeyTable();

  // Initialize symbol manager
  logger.info('Initializing symbol manager...');
  initializeSymbolManager(dataDir);

  // Create default API key if none exist
  logger.info('Checking for default API key...');
  await ensureDefaultApiKey();

  // Create Express app
  const app = createApp();

  // Start server
  const server = app.listen(config.port, config.host, () => {
    logger.info(`Server running at http://${config.host}:${config.port}`);
    logger.info(`Auth header: ${config.auth.apiKeyHeader}`);
    logger.info('Endpoints: /health, /api/v1/symbols, /api/v1/symbols/:id');
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
  logger.error('Failed to start server:', error);
  process.exit(1);
});
