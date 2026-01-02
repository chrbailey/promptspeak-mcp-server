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
import * as path from 'path';
import * as fs from 'fs';

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     PromptSpeak HTTP API Server                                 ║');
  console.log('║     REST API for CustomGPT Actions                             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log();

  // Load configuration
  const config = loadConfig();
  console.log(`[Config] Environment: ${config.nodeEnv}`);
  console.log(`[Config] Port: ${config.port}`);
  console.log(`[Config] Database: ${config.dbPath}`);

  // Ensure data directory exists
  const dataDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`[Init] Created data directory: ${dataDir}`);
  }

  // Initialize database
  console.log('[Init] Initializing database...');
  initializeDatabase(config.dbPath);

  // Initialize API key table
  console.log('[Init] Initializing API key table...');
  initializeApiKeyTable();

  // Initialize symbol manager
  console.log('[Init] Initializing symbol manager...');
  initializeSymbolManager(dataDir);

  // Create default API key if none exist
  console.log('[Init] Checking for default API key...');
  await ensureDefaultApiKey();

  // Create Express app
  const app = createApp();

  // Start server
  const server = app.listen(config.port, config.host, () => {
    console.log();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log(`║  Server running at http://${config.host}:${config.port}`.padEnd(67) + '║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Endpoints:                                                    ║');
    console.log('║    GET    /health                 - Health check               ║');
    console.log('║    GET    /api/v1/symbols         - List symbols               ║');
    console.log('║    POST   /api/v1/symbols         - Create symbol              ║');
    console.log('║    GET    /api/v1/symbols/:id     - Get symbol                 ║');
    console.log('║    PATCH  /api/v1/symbols/:id     - Update symbol              ║');
    console.log('║    DELETE /api/v1/symbols/:id     - Delete symbol              ║');
    console.log('║    POST   /api/v1/symbols/import  - Bulk import                ║');
    console.log('║    GET    /api/v1/symbols/stats   - Registry stats             ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  Authentication:                                               ║');
    console.log(`║    Header: ${config.auth.apiKeyHeader}`.padEnd(67) + '║');
    console.log('║    Format: ps_live_xxxxxxxxxxxx                                ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║  For CustomGPT Actions:                                        ║');
    console.log('║    1. Use ngrok or cloudflared to expose this server           ║');
    console.log('║    2. Add the public URL as an Action in your CustomGPT        ║');
    console.log('║    3. Use the generated OpenAPI spec as the schema             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);
    server.close(() => {
      console.log('[Shutdown] HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('[Shutdown] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
