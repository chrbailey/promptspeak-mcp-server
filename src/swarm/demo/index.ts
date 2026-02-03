/**
 * Swarm Demo Module
 *
 * Provides demo utilities for showcasing swarm intelligence capabilities.
 */

// Main demo runner and types
export {
  runSwarmDemo,
  type DemoConfig,
  type DemoResults,
  type StrategyEvaluation,
  type VectorPrepResult,
  type BidRecommendation,
  type DemoSummary,
} from './swarm-demo.js';

// Helper functions (for testing and extension)
export {
  createDemoAgents,
  prepareVectorRecords,
  evaluateWithAllStrategies,
  generateRecommendation,
  calculateSummary,
  printSummary,
} from './swarm-demo.js';

// Fixtures for testing and demos
export {
  SAMPLE_LISTINGS,
  SAMPLE_SELLER_PROFILES,
  MARKET_AVERAGES,
  getMarketContextForListing,
  generateSampleObservation,
} from './fixtures/index.js';
