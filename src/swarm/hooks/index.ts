/**
 * Observation Hooks Module
 *
 * Exports hook infrastructure for RECONNAISSANCE mode.
 */

// Core hook system
export {
  ObservationHookRegistry,
  getObservationHookRegistry,
  createObservationHookRegistry,
  HookBuilder,
  createHook,
  type ObservationHook,
  type HookFilter,
  type HookExecutionResult,
} from './observation-hooks.js';

// Built-in hooks
export {
  createDatabaseSyncHook,
  createEnhancedDatabaseSyncHook,
} from './database-sync-hook.js';

export {
  createWebhookAlertHook,
  createSlackAlertHook,
  createDiscordAlertHook,
  type WebhookConfig,
} from './webhook-alert-hook.js';

export {
  createAlertHook,
  createAlertHookWithEngine,
} from './alert-hook.js';

export {
  createPineconeSyncHook,
  createEnhancedPineconeSyncHook,
  flushPendingUpserts,
  type PineconeSyncConfig,
} from './pinecone-sync-hook.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

import { getObservationHookRegistry } from './observation-hooks.js';
import { createEnhancedDatabaseSyncHook } from './database-sync-hook.js';
import { createSlackAlertHook, createDiscordAlertHook } from './webhook-alert-hook.js';
import { createAlertHook } from './alert-hook.js';
import { createEnhancedPineconeSyncHook, type PineconeSyncConfig } from './pinecone-sync-hook.js';
import type { AlertConfig } from '../types.js';

/**
 * Options for initializing the default hooks.
 */
export interface InitializeHooksOptions {
  /** Enable database sync hook */
  enableDatabaseSync?: boolean;
  /** Enable alert engine hook */
  enableAlertEngine?: boolean;
  /** Enable Pinecone vector sync hook */
  enablePineconeSync?: boolean;
  /** Alert engine configuration */
  alertConfig?: Partial<AlertConfig>;
  /** Pinecone sync configuration */
  pineconeConfig?: Partial<PineconeSyncConfig>;
  /** Slack webhook URL for alerts */
  slackWebhookUrl?: string;
  /** Discord webhook URL for alerts */
  discordWebhookUrl?: string;
  /** Custom hooks to register */
  customHooks?: import('./observation-hooks.js').ObservationHook[];
}

/**
 * Initialize default hooks for RECONNAISSANCE mode.
 *
 * This sets up:
 * 1. Database sync hook (always enabled by default)
 * 2. Alert engine hook (enabled by default)
 * 3. Pinecone vector sync hook (if enabled)
 * 4. Slack webhook (if URL provided)
 * 5. Discord webhook (if URL provided)
 * 6. Any custom hooks provided
 */
export function initializeDefaultHooks(options: InitializeHooksOptions = {}): void {
  const registry = getObservationHookRegistry();

  // Database sync hook (high priority, runs first)
  if (options.enableDatabaseSync !== false) {
    registry.register(createEnhancedDatabaseSyncHook());
  }

  // Alert engine hook (enabled by default, processes observations for alerts)
  if (options.enableAlertEngine !== false) {
    registry.register(createAlertHook(options.alertConfig));
  }

  // Pinecone vector sync hook (disabled by default - requires index setup)
  if (options.enablePineconeSync) {
    registry.register(createEnhancedPineconeSyncHook(options.pineconeConfig));
  }

  // Slack webhook
  if (options.slackWebhookUrl) {
    registry.register(createSlackAlertHook(options.slackWebhookUrl));
  }

  // Discord webhook
  if (options.discordWebhookUrl) {
    registry.register(createDiscordAlertHook(options.discordWebhookUrl));
  }

  // Custom hooks
  if (options.customHooks) {
    for (const hook of options.customHooks) {
      registry.register(hook);
    }
  }

  console.log(`[HOOKS] Initialized ${registry.getAllHooks().length} observation hooks`);
}

/**
 * Initialize hooks from environment variables.
 *
 * Environment variables:
 * - SWARM_ENABLE_DB_SYNC: Set to 'false' to disable database sync hook
 * - SWARM_ENABLE_ALERT_ENGINE: Set to 'false' to disable alert engine
 * - SWARM_ENABLE_PINECONE_SYNC: Set to 'true' to enable Pinecone vector sync
 * - SWARM_PRICE_ANOMALY_THRESHOLD: Minimum % below market for price anomaly alerts (default: 15)
 * - SWARM_CONFIDENCE_THRESHOLD: Minimum confidence for alerts (default: 0.75)
 * - SWARM_MIN_AGENTS_CONSENSUS: Agents needed for consensus (default: 3)
 * - SWARM_PINECONE_NAMESPACE: Pinecone namespace for vector storage (default: 'swarm')
 * - SWARM_SLACK_WEBHOOK_URL: Slack webhook URL for notifications
 * - SWARM_DISCORD_WEBHOOK_URL: Discord webhook URL for notifications
 */
export function initializeHooksFromEnv(): void {
  // Build alert config from environment
  const alertConfig: Partial<AlertConfig> = {};

  if (process.env.SWARM_PRICE_ANOMALY_THRESHOLD) {
    alertConfig.priceAnomalyThreshold = parseFloat(process.env.SWARM_PRICE_ANOMALY_THRESHOLD);
  }
  if (process.env.SWARM_CONFIDENCE_THRESHOLD) {
    alertConfig.confidenceThreshold = parseFloat(process.env.SWARM_CONFIDENCE_THRESHOLD);
  }
  if (process.env.SWARM_MIN_AGENTS_CONSENSUS) {
    alertConfig.minAgentsForConsensus = parseInt(process.env.SWARM_MIN_AGENTS_CONSENSUS, 10);
  }

  // Build Pinecone config from environment
  const pineconeConfig: Partial<PineconeSyncConfig> = {};

  if (process.env.SWARM_PINECONE_NAMESPACE) {
    pineconeConfig.namespace = process.env.SWARM_PINECONE_NAMESPACE;
  }

  initializeDefaultHooks({
    enableDatabaseSync: process.env.SWARM_ENABLE_DB_SYNC !== 'false',
    enableAlertEngine: process.env.SWARM_ENABLE_ALERT_ENGINE !== 'false',
    enablePineconeSync: process.env.SWARM_ENABLE_PINECONE_SYNC === 'true',
    alertConfig: Object.keys(alertConfig).length > 0 ? alertConfig : undefined,
    pineconeConfig: Object.keys(pineconeConfig).length > 0 ? pineconeConfig : undefined,
    slackWebhookUrl: process.env.SWARM_SLACK_WEBHOOK_URL,
    discordWebhookUrl: process.env.SWARM_DISCORD_WEBHOOK_URL,
  });
}
