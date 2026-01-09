/**
 * HTTP Server Initialization
 *
 * Initializes all server subsystems in the correct order.
 * Separates initialization from the main server entry point.
 * Follows the same pattern as the MCP server's server-init.ts.
 *
 * Subsystems initialized:
 * - Database: SQLite connection for symbols and API keys
 * - API key table: Authentication infrastructure
 * - Symbol manager: Directive symbol registry
 */

import * as path from 'path';
import * as fs from 'fs';
import { createLogger } from '../core/logging/index.js';
import { HttpConfig } from './config.js';

// Subsystem imports
import { initializeDatabase, getDatabase } from '../symbols/database.js';
import { initializeSymbolManager, getSymbolManager } from '../symbols/manager.js';
import { ensureDefaultApiKey, initializeApiKeyTable } from '../auth/api-key.js';

const logger = createLogger('HttpServerInit');

// ===============================================================================
// TYPES
// ===============================================================================

export interface HttpServerConfig {
  /** Configuration loaded from environment */
  config: HttpConfig;
  /** Whether to skip subsystem initialization (for testing) */
  skipSubsystems?: boolean;
  /** Skip individual subsystems */
  skipDatabase?: boolean;
  skipApiKeyTable?: boolean;
  skipSymbolManager?: boolean;
  skipDefaultApiKey?: boolean;
}

export interface SubsystemStatus {
  initialized: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface HttpInitializationResult {
  success: boolean;
  subsystems: {
    database: SubsystemStatus;
    apiKeyTable: SubsystemStatus;
    symbolManager: SubsystemStatus;
    defaultApiKey: SubsystemStatus;
  };
  errors: string[];
  config: HttpConfig;
}

// ===============================================================================
// SUBSYSTEM INITIALIZERS
// ===============================================================================

/**
 * Ensure the data directory exists.
 */
function ensureDataDirectory(dbPath: string): void {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info('Created data directory', { path: dataDir });
  }
}

/**
 * Initialize the database subsystem.
 */
function initializeDatabaseSubsystem(dbPath: string): SubsystemStatus {
  try {
    logger.info('Initializing database', { path: dbPath });
    ensureDataDirectory(dbPath);
    initializeDatabase(dbPath);

    // Verify database is accessible
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as test').get() as { test: number };
    if (result.test !== 1) {
      throw new Error('Database verification failed');
    }

    logger.info('Database initialized successfully');
    return {
      initialized: true,
      details: { path: dbPath },
    };
  } catch (error) {
    const msg = `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the API key table subsystem.
 */
function initializeApiKeyTableSubsystem(): SubsystemStatus {
  try {
    logger.info('Initializing API key table');
    initializeApiKeyTable();
    logger.info('API key table initialized');
    return { initialized: true };
  } catch (error) {
    const msg = `API key table initialization failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the symbol manager subsystem.
 */
function initializeSymbolManagerSubsystem(dbPath: string): SubsystemStatus {
  try {
    const dataDir = path.dirname(dbPath);
    logger.info('Initializing symbol manager', { dataDir });
    const manager = initializeSymbolManager(dataDir);
    const stats = manager.getStats();
    logger.info('Symbol manager initialized', {
      totalSymbols: stats.total_symbols,
      byCategory: stats.by_category,
    });
    return {
      initialized: true,
      details: {
        totalSymbols: stats.total_symbols,
        byCategory: stats.by_category,
      },
    };
  } catch (error) {
    const msg = `Symbol manager initialization failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the default API key subsystem.
 */
async function initializeDefaultApiKeySubsystem(): Promise<SubsystemStatus> {
  try {
    logger.info('Checking for default API key');
    await ensureDefaultApiKey();
    logger.info('Default API key check complete');
    return { initialized: true };
  } catch (error) {
    const msg = `Default API key initialization failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

// ===============================================================================
// MAIN INITIALIZATION
// ===============================================================================

/**
 * Initialize all HTTP server subsystems.
 *
 * @param serverConfig - Configuration for the HTTP server
 * @returns Structured result indicating success/failure per subsystem
 *
 * @example
 * ```typescript
 * // Initialize with config
 * const config = loadConfig();
 * const result = await initializeHttpServer({ config });
 *
 * // Initialize for testing (skip all subsystems)
 * const result = await initializeHttpServer({ config, skipSubsystems: true });
 *
 * // Check results
 * if (!result.success) {
 *   console.warn('Some subsystems failed:', result.errors);
 * }
 * ```
 */
export async function initializeHttpServer(
  serverConfig: HttpServerConfig
): Promise<HttpInitializationResult> {
  const { config } = serverConfig;

  const result: HttpInitializationResult = {
    success: true,
    subsystems: {
      database: { initialized: false },
      apiKeyTable: { initialized: false },
      symbolManager: { initialized: false },
      defaultApiKey: { initialized: false },
    },
    errors: [],
    config,
  };

  // Handle test mode - skip all subsystems
  if (serverConfig.skipSubsystems) {
    logger.info('Skipping subsystem initialization (test mode)');
    return result;
  }

  logger.info('Beginning HTTP server initialization', {
    environment: config.nodeEnv,
    port: config.port,
    dbPath: config.dbPath,
  });

  // ---------------------------------------------------------------------------
  // Initialize database (required for other subsystems)
  // ---------------------------------------------------------------------------
  if (!serverConfig.skipDatabase) {
    result.subsystems.database = initializeDatabaseSubsystem(config.dbPath);
    if (!result.subsystems.database.initialized && result.subsystems.database.error) {
      result.errors.push(result.subsystems.database.error);
      // Database is critical - if it fails, skip dependent subsystems
      logger.error('Database failed - skipping dependent subsystems');
      result.success = false;
      return result;
    }
  } else {
    logger.info('Skipping database initialization');
    result.subsystems.database = { initialized: false, error: 'Skipped by configuration' };
  }

  // ---------------------------------------------------------------------------
  // Initialize API key table
  // ---------------------------------------------------------------------------
  if (!serverConfig.skipApiKeyTable) {
    result.subsystems.apiKeyTable = initializeApiKeyTableSubsystem();
    if (!result.subsystems.apiKeyTable.initialized && result.subsystems.apiKeyTable.error) {
      result.errors.push(result.subsystems.apiKeyTable.error);
    }
  } else {
    logger.info('Skipping API key table initialization');
    result.subsystems.apiKeyTable = { initialized: false, error: 'Skipped by configuration' };
  }

  // ---------------------------------------------------------------------------
  // Initialize symbol manager
  // ---------------------------------------------------------------------------
  if (!serverConfig.skipSymbolManager) {
    result.subsystems.symbolManager = initializeSymbolManagerSubsystem(config.dbPath);
    if (!result.subsystems.symbolManager.initialized && result.subsystems.symbolManager.error) {
      result.errors.push(result.subsystems.symbolManager.error);
    }
  } else {
    logger.info('Skipping symbol manager initialization');
    result.subsystems.symbolManager = { initialized: false, error: 'Skipped by configuration' };
  }

  // ---------------------------------------------------------------------------
  // Initialize default API key
  // ---------------------------------------------------------------------------
  if (!serverConfig.skipDefaultApiKey) {
    result.subsystems.defaultApiKey = await initializeDefaultApiKeySubsystem();
    if (!result.subsystems.defaultApiKey.initialized && result.subsystems.defaultApiKey.error) {
      result.errors.push(result.subsystems.defaultApiKey.error);
    }
  } else {
    logger.info('Skipping default API key initialization');
    result.subsystems.defaultApiKey = { initialized: false, error: 'Skipped by configuration' };
  }

  // ---------------------------------------------------------------------------
  // Final status
  // ---------------------------------------------------------------------------
  result.success = result.errors.length === 0;

  if (result.success) {
    logger.info('All HTTP server subsystems initialized successfully');
  } else {
    logger.warn('Some HTTP server subsystems failed to initialize', {
      errors: result.errors,
      database: result.subsystems.database.initialized,
      apiKeyTable: result.subsystems.apiKeyTable.initialized,
      symbolManager: result.subsystems.symbolManager.initialized,
      defaultApiKey: result.subsystems.defaultApiKey.initialized,
    });
  }

  return result;
}

/**
 * Check if the HTTP server has been initialized.
 */
export function isHttpServerInitialized(): boolean {
  try {
    getDatabase();
    getSymbolManager();
    return true;
  } catch {
    return false;
  }
}

// Re-export logging utilities for server use
export { createLogger } from '../core/logging/index.js';
