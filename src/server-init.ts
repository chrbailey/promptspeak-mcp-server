/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVER INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Initializes all server subsystems in the correct order.
 * Separates initialization from the main server entry point.
 *
 * Subsystems initialized:
 * - Policy loader: Loads and merges policy files from disk
 * - Symbol manager: Manages directive symbol registry (SQLite-backed)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from './core/logging/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Subsystem imports
import { initializePolicyLoader, getPolicyLoader, type PolicyLoader } from './policies/loader.js';
import { operatorConfig } from './operator/config.js';
import { initializeSymbolManager, getSymbolManager, type SymbolManager } from './symbols/index.js';
import { initializeGovernanceDb, type GovernanceDatabase } from './persistence/database.js';
import { holdManager } from './gatekeeper/hold-manager.js';
import { circuitBreaker } from './drift/circuit-breaker.js';
import { VerbRegistryDB, seedCoreVerbs, seedProcurementVerbs, seedProcurementModifiers } from './registry/index.js';
import { setRegistryDB } from './tools/ps_registry.js';
import { HandshakeProtocol } from './handshake/index.js';
import { setHandshakeProtocol } from './tools/ps_handshake.js';


const logger = createLogger('ServerInit');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ServerConfig {
  /** Root directory for policy files */
  policiesRoot?: string;
  /** Root directory for symbol registry */
  symbolsRoot?: string;
  /** Root directory for governance persistence (holds, circuit breakers) */
  governanceRoot?: string;
  /** Root directory for the verb registry DB (defaults to governanceRoot) */
  verbRegistryRoot?: string;
  /** Whether to skip subsystem initialization (for testing) */
  skipSubsystems?: boolean;
  /** Skip individual subsystems */
  skipPolicyLoader?: boolean;
  skipSymbolManager?: boolean;
  skipGovernanceDb?: boolean;
  skipVerbRegistry?: boolean;
  skipHandshake?: boolean;
}

export interface SubsystemStatus {
  initialized: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

export interface InitializationResult {
  success: boolean;
  subsystems: {
    policyLoader: SubsystemStatus;
    symbolManager: SubsystemStatus;
    governanceDb: SubsystemStatus;
    verbRegistry: SubsystemStatus;
    handshake: SubsystemStatus;
  };
  errors: string[];
  /** Reference to initialized subsystems for direct access */
  instances: {
    policyLoader?: PolicyLoader;
    symbolManager?: SymbolManager;
    governanceDb?: GovernanceDatabase;
    verbRegistry?: VerbRegistryDB;
    handshake?: HandshakeProtocol;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT PATHS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get default paths relative to the module location.
 */
function getDefaultPaths(): Required<Pick<ServerConfig, 'policiesRoot' | 'symbolsRoot' | 'governanceRoot'>> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  return {
    policiesRoot: path.join(__dirname, '..', 'policies'),
    symbolsRoot: path.join(__dirname, '..', 'symbols'),
    governanceRoot: path.join(__dirname, '..', 'data'),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSYSTEM INITIALIZERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the policy loader subsystem.
 * Loads policy files from disk and activates the default overlay.
 */
function initializePolicies(policiesRoot: string): SubsystemStatus & { instance?: PolicyLoader } {
  try {
    logger.info('Initializing policy loader', { root: policiesRoot });

    const loader = initializePolicyLoader(policiesRoot);

    // Load default policy as active overlay
    const defaultOverlay = loader.toPolicyOverlay('default');
    if (defaultOverlay) {
      operatorConfig.registerOverlay(defaultOverlay);
      operatorConfig.setActiveOverlay('default');
      logger.debug('Default policy overlay activated');
    }

    const policies = loader.listPolicies();
    logger.info('Policy loader initialized', { policies: policies.join(', ') });

    return {
      initialized: true,
      details: {
        policiesLoaded: policies.length,
        policyIds: policies,
        defaultOverlayActive: defaultOverlay !== undefined,
      },
      instance: loader,
    };
  } catch (error) {
    const msg = `Policy loader failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the symbol manager subsystem.
 * Sets up the SQLite-backed directive symbol registry.
 */
function initializeSymbols(symbolsRoot: string): SubsystemStatus & { instance?: SymbolManager } {
  try {
    logger.info('Initializing symbol manager', { root: symbolsRoot });

    const symbolManager = initializeSymbolManager(symbolsRoot);
    const stats = symbolManager.getStats();

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
      instance: symbolManager,
    };
  } catch (error) {
    const msg = `Symbol manager failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the governance persistence subsystem.
 * Sets up SQLite-backed persistence for holds and circuit breakers,
 * then wires into the singleton instances so state survives restarts.
 */
function initializeGovernance(governanceRoot: string): SubsystemStatus & { instance?: GovernanceDatabase } {
  try {
    logger.info('Initializing governance persistence', { root: governanceRoot });

    const dbPath = path.join(governanceRoot, 'governance.db');
    const db = initializeGovernanceDb(dbPath);

    // Wire persistence into singletons
    holdManager.attachDb(db);
    circuitBreaker.attachDb(db);

    const pendingHolds = db.getPendingHolds();
    const breakers = db.getAllCircuitBreakers();

    logger.info('Governance persistence initialized', {
      pendingHolds: pendingHolds.length,
      circuitBreakers: breakers.length,
    });

    return {
      initialized: true,
      details: {
        dbPath,
        pendingHoldsRestored: pendingHolds.length,
        circuitBreakersRestored: breakers.length,
      },
      instance: db,
    };
  } catch (error) {
    const msg = `Governance persistence failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the verb registry subsystem (spec §4.2–4.4).
 * Creates the SQLite-backed VerbRegistryDB, seeds the 30 core verbs,
 * 6 procurement verbs, and 6 procurement modifiers on first run, and
 * wires the DB into the ps_registry_* tool handlers.
 *
 * Idempotent: if the DB already contains verbs, the seed step is skipped.
 */
function initializeVerbRegistry(verbRoot: string): SubsystemStatus & { instance?: VerbRegistryDB } {
  try {
    logger.info('Initializing verb registry', { root: verbRoot });

    const dbPath = path.join(verbRoot, 'verb-registry.db');
    const db = new VerbRegistryDB(dbPath);

    const existingTotal = db.getStats().total;
    let seededOnThisRun = 0;
    if (existingTotal === 0) {
      seedCoreVerbs(db);
      seedProcurementVerbs(db);
      seedProcurementModifiers(db);
      seededOnThisRun = db.getStats().total;
    }

    setRegistryDB(db);

    const stats = db.getStats();
    logger.info('Verb registry initialized', {
      dbPath,
      total: stats.total,
      byNamespace: stats.byNamespace,
      byStatus: stats.byStatus,
      seededOnThisRun,
    });

    return {
      initialized: true,
      details: {
        dbPath,
        totalVerbs: stats.total,
        byNamespace: stats.byNamespace,
        byStatus: stats.byStatus,
        seededOnThisRun,
      },
      instance: db,
    };
  } catch (error) {
    const msg = `Verb registry failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

/**
 * Initialize the handshake protocol subsystem (spec §5.2).
 * Instantiates a HandshakeProtocol with capabilities derived from the
 * live verb registry (count, namespaces) and wires it into the
 * ps_handshake_* tool handlers.
 */
function initializeHandshake(verbRegistry?: VerbRegistryDB): SubsystemStatus & { instance?: HandshakeProtocol } {
  try {
    const stats = verbRegistry?.getStats();
    const namespaces = stats ? Object.keys(stats.byNamespace).sort() : ['ps:core'];
    const verbCount = stats?.total ?? 0;

    const protocol = new HandshakeProtocol({
      version: '0.2',
      verbCount,
      status: 'active',
      namespaces,
    });

    setHandshakeProtocol(protocol);

    logger.info('Handshake protocol initialized', { verbCount, namespaces });

    return {
      initialized: true,
      details: { verbCount, namespaces },
      instance: protocol,
    };
  } catch (error) {
    const msg = `Handshake protocol failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(msg, error instanceof Error ? error : undefined);
    return {
      initialized: false,
      error: msg,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize all server subsystems.
 *
 * @param config - Optional configuration to override default paths
 * @returns Structured result indicating success/failure per subsystem
 *
 * @example
 * ```typescript
 * // Initialize with defaults
 * const result = await initializeServer();
 *
 * // Initialize for testing (skip all subsystems)
 * const result = await initializeServer({ skipSubsystems: true });
 *
 * // Initialize with custom paths
 * const result = await initializeServer({
 *   policiesRoot: '/custom/policies',
 *   symbolsRoot: '/custom/symbols',
 * });
 *
 * // Check results
 * if (!result.success) {
 *   console.warn('Some subsystems failed:', result.errors);
 * }
 * ```
 */
export async function initializeServer(
  config: ServerConfig = {}
): Promise<InitializationResult> {
  const result: InitializationResult = {
    success: true,
    subsystems: {
      policyLoader: { initialized: false },
      symbolManager: { initialized: false },
      governanceDb: { initialized: false },
      verbRegistry: { initialized: false },
      handshake: { initialized: false },
    },
    errors: [],
    instances: {},
  };

  // Handle test mode - skip all subsystems
  if (config.skipSubsystems) {
    logger.info('Skipping subsystem initialization (test mode)');
    return result;
  }

  const defaults = getDefaultPaths();
  const paths = {
    policiesRoot: config.policiesRoot ?? defaults.policiesRoot,
    symbolsRoot: config.symbolsRoot ?? defaults.symbolsRoot,
    governanceRoot: config.governanceRoot ?? defaults.governanceRoot,
    verbRegistryRoot: config.verbRegistryRoot ?? config.governanceRoot ?? defaults.governanceRoot,
  };

  logger.info('Beginning server initialization', {
    policiesRoot: paths.policiesRoot,
    symbolsRoot: paths.symbolsRoot,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize policy loader
  // ─────────────────────────────────────────────────────────────────────────
  if (!config.skipPolicyLoader) {
    const policyResult = initializePolicies(paths.policiesRoot);
    result.subsystems.policyLoader = {
      initialized: policyResult.initialized,
      error: policyResult.error,
      details: policyResult.details,
    };
    if (policyResult.instance) {
      result.instances.policyLoader = policyResult.instance;
    }
    if (!policyResult.initialized && policyResult.error) {
      result.errors.push(policyResult.error);
    }
  } else {
    logger.info('Skipping policy loader initialization');
    result.subsystems.policyLoader = { initialized: false, error: 'Skipped by configuration' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize symbol manager
  // ─────────────────────────────────────────────────────────────────────────
  if (!config.skipSymbolManager) {
    const symbolResult = initializeSymbols(paths.symbolsRoot);
    result.subsystems.symbolManager = {
      initialized: symbolResult.initialized,
      error: symbolResult.error,
      details: symbolResult.details,
    };
    if (symbolResult.instance) {
      result.instances.symbolManager = symbolResult.instance;
    }
    if (!symbolResult.initialized && symbolResult.error) {
      result.errors.push(symbolResult.error);
    }
  } else {
    logger.info('Skipping symbol manager initialization');
    result.subsystems.symbolManager = { initialized: false, error: 'Skipped by configuration' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize governance persistence
  // ─────────────────────────────────────────────────────────────────────────
  if (!config.skipGovernanceDb) {
    const govResult = initializeGovernance(paths.governanceRoot);
    result.subsystems.governanceDb = {
      initialized: govResult.initialized,
      error: govResult.error,
      details: govResult.details,
    };
    if (govResult.instance) {
      result.instances.governanceDb = govResult.instance;
    }
    if (!govResult.initialized && govResult.error) {
      result.errors.push(govResult.error);
    }
  } else {
    logger.info('Skipping governance persistence initialization');
    result.subsystems.governanceDb = { initialized: false, error: 'Skipped by configuration' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize verb registry (spec §4.2–4.4)
  // ─────────────────────────────────────────────────────────────────────────
  if (!config.skipVerbRegistry) {
    const verbResult = initializeVerbRegistry(paths.verbRegistryRoot);
    result.subsystems.verbRegistry = {
      initialized: verbResult.initialized,
      error: verbResult.error,
      details: verbResult.details,
    };
    if (verbResult.instance) {
      result.instances.verbRegistry = verbResult.instance;
    }
    if (!verbResult.initialized && verbResult.error) {
      result.errors.push(verbResult.error);
    }
  } else {
    logger.info('Skipping verb registry initialization');
    result.subsystems.verbRegistry = { initialized: false, error: 'Skipped by configuration' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize handshake protocol (spec §5.2)
  // Depends on verb registry to report accurate capabilities.
  // ─────────────────────────────────────────────────────────────────────────
  if (!config.skipHandshake) {
    const handshakeResult = initializeHandshake(result.instances.verbRegistry);
    result.subsystems.handshake = {
      initialized: handshakeResult.initialized,
      error: handshakeResult.error,
      details: handshakeResult.details,
    };
    if (handshakeResult.instance) {
      result.instances.handshake = handshakeResult.instance;
    }
    if (!handshakeResult.initialized && handshakeResult.error) {
      result.errors.push(handshakeResult.error);
    }
  } else {
    logger.info('Skipping handshake protocol initialization');
    result.subsystems.handshake = { initialized: false, error: 'Skipped by configuration' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Final status
  // ─────────────────────────────────────────────────────────────────────────
  result.success = result.errors.length === 0;

  if (result.success) {
    logger.info('All subsystems initialized successfully');
  } else {
    logger.warn('Some subsystems failed to initialize', {
      errors: result.errors,
      policyLoader: result.subsystems.policyLoader.initialized,
      symbolManager: result.subsystems.symbolManager.initialized,
      governanceDb: result.subsystems.governanceDb.initialized,
      verbRegistry: result.subsystems.verbRegistry.initialized,
      handshake: result.subsystems.handshake.initialized,
    });
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if the server has been initialized.
 */
export function isServerInitialized(): boolean {
  try {
    // Check if all core subsystems are available
    getPolicyLoader();
    getSymbolManager();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get default paths for server initialization.
 * Useful for testing or custom initialization.
 */
export { getDefaultPaths };

// Re-export types for convenience
export type { PolicyLoader } from './policies/loader.js';
export type { SymbolManager } from './symbols/index.js';

// Re-export logging utilities for server use
export { createLogger } from './core/logging/index.js';
