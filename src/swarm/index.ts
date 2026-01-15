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
 *     targetCriteria: { searchTerms: ['mink pelt'] },
 *     timeWindow: { start: new Date(), end: new Date(Date.now() + 86400000) }
 *   });
 *   await controller.startSwarm();
 */

// Core types
export * from './types.js';

// Database
export { getSwarmDatabase, SwarmDatabase } from './database.js';

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
  getSwarmToolDefinitions,
  executeSwarmTool,
} from './tools.js';
