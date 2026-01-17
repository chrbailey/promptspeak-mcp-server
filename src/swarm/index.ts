/**
 * Market Agent Swarm Module
 *
 * Autonomous bidding swarm for eBay marketplace.
 *
 * Usage:
 *   import { getSwarmController, swarmTools } from './swarm';
 *
 *   // Create and start a swarm
 *   const controller = getSwarmController();
 *   const swarmId = await controller.createSwarm({
 *     totalBudget: { value: 500, currency: 'USD' },
 *     agentCount: 5,
 *     targetCriteria: { searchTerms: ['gold bars', 'silver coins'] },
 *     timeWindow: { start: new Date(), end: new Date(Date.now() + 86400000) }
 *   });
 *   await controller.startSwarm();
 */

// Core types
export * from './types.js';

// Database
export {
  getSwarmDatabase,
  type SwarmDatabase,
  // Observation operations (RECONNAISSANCE mode)
  recordObservation,
  queryObservations,
  getListingObservations,
  getHighConfidenceOpportunities,
  // Alert operations
  createAlert,
  getAlert,
  updateAlertStatus,
  getPendingAlerts,
  expireOverdueAlerts,
  // Seller profile operations
  upsertSellerProfile,
  getSellerProfile,
  listSellersByRisk,
} from './database.js';

// Budget management
export { BudgetAllocator, type AgentAllocation, type SwarmBudgetStatus } from './budget-allocator.js';

// Strategies
export {
  createStrategy,
  getAvailableStrategies,
  getRecommendedDistribution,
  SniperStrategy,
  EarlyAggressiveStrategy,
  NegotiatorStrategy,
  HybridStrategy,
  PassiveStrategy,
} from './strategies/index.js';

// Controller
export {
  SwarmController,
  getSwarmController,
  createSwarmController,
  type CreateSwarmOptions,
} from './swarm-controller.js';

// eBay client
export {
  EbayClient,
  getEbayClient,
  initializeEbayClient,
  EbayApiError,
} from './ebay/index.js';

// Registry integration
export {
  SwarmEventBus,
  getEventBus,
  publishEvent,
  subscribeToEvents,
  InsightComputer,
  getInsightComputer,
  mapEventToSymbol,
  mapAgentToSymbol,
  SYMBOL_PREFIXES,
  INSIGHT_SYMBOLS,
} from './registry/index.js';

// MCP Tools
export {
  swarmTools,
  swarmToolDefinitions,
  getSwarmToolDefinitions,
  executeSwarmTool,
} from './tools.js';

// Observation Hooks (RECONNAISSANCE mode)
export {
  ObservationHookRegistry,
  getObservationHookRegistry,
  createObservationHookRegistry,
  HookBuilder,
  createHook,
  createDatabaseSyncHook,
  createEnhancedDatabaseSyncHook,
  createWebhookAlertHook,
  createSlackAlertHook,
  createDiscordAlertHook,
  createAlertHook,
  createAlertHookWithEngine,
  createPineconeSyncHook,
  createEnhancedPineconeSyncHook,
  flushPendingUpserts,
  initializeDefaultHooks,
  initializeHooksFromEnv,
  type ObservationHook,
  type HookFilter,
  type HookExecutionResult,
  type WebhookConfig,
  type PineconeSyncConfig,
  type InitializeHooksOptions,
} from './hooks/index.js';

// Alert Engine (RECONNAISSANCE mode)
export {
  AlertEngine,
  getAlertEngine,
  createAlertEngine,
} from './alerts/index.js';

// Vector Storage (RECONNAISSANCE mode)
export {
  IntelligencePineconeClient,
  getIntelligencePineconeClient,
  createIntelligencePineconeClient,
  PINECONE_INDEXES,
  INDEX_CONFIGS,
  buildListingRecord,
  buildPriceRecord,
  buildSellerRecord,
  type PineconeIndexName,
  type ListingRecord,
  type PriceRecord,
  type SellerRecord,
  type ScoredResult,
  type SearchOptions,
} from './vectors/index.js';

// MCP Resources (RECONNAISSANCE mode)
export {
  IntelligenceResourceRegistry,
  getIntelligenceResourceRegistry,
  listIntelligenceResources,
  readIntelligenceResource,
  INTELLIGENCE_RESOURCES,
  type IntelligenceResource,
  type ResourceContent,
} from './resources/index.js';

// Intelligence Tools (RECONNAISSANCE mode)
export {
  intelligenceToolDefinitions,
  getIntelligenceToolDefinitions,
  executeIntelligenceTool,
  isIntelligenceTool,
} from './tools/index.js';
