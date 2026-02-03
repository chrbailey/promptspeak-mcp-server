/**
 * Swarm Intelligence End-to-End Demo
 *
 * Demonstrates the complete swarm flow:
 * 1. Process sample eBay listings
 * 2. Prepare data for Pinecone vector storage
 * 3. Execute price pattern analysis
 * 4. Generate bid recommendations using strategies
 * 5. Output structured results
 *
 * Run with: npx tsx src/swarm/demo/swarm-demo.ts
 */

import {
  SAMPLE_LISTINGS,
  SAMPLE_SELLER_PROFILES,
  getMarketContextForListing,
  generateSampleObservation,
} from './fixtures/index.js';

import {
  createSwarmVectorService,
  type SwarmVectorConfig,
} from '../vectors/index.js';

import {
  createStrategy,
  getAvailableStrategies,
  getRecommendedDistribution,
} from '../strategies/index.js';

import type {
  StrategyContext,
  StrategyDecision,
  MarketContext,
} from '../strategies/types.js';

import type {
  BiddingStrategy,
  NormalizedListing,
  Observation,
  Money,
  MarketAgentConfig,
  SwarmEvent,
} from '../types.js';

import {
  generateAgentId,
  generateSwarmId,
} from '../types.js';

// =============================================================================
// DEMO CONFIGURATION
// =============================================================================

export interface DemoConfig {
  /** Budget per agent in USD */
  agentBudget: number;
  /** Number of agents to simulate */
  agentCount: number;
  /** Whether to enable vector storage (requires PINECONE_API_KEY) */
  enableVectors: boolean;
  /** Show detailed output */
  verbose: boolean;
}

const DEFAULT_DEMO_CONFIG: DemoConfig = {
  agentBudget: 500,
  agentCount: 5,
  enableVectors: false, // Set to true if PINECONE_API_KEY is available
  verbose: true,
};

// =============================================================================
// DEMO RESULT TYPES
// =============================================================================

export interface StrategyEvaluation {
  listingId: string;
  listingTitle: string;
  strategy: BiddingStrategy;
  agentId: string;
  decision: StrategyDecision;
  marketCondition: string;
  currentPrice: number;
  marketAverage?: number;
  discountPercent?: number;
}

export interface VectorPrepResult {
  listingId: string;
  listingRecord: unknown;
  priceRecord: unknown;
  sellerRecord: unknown;
}

export interface DemoResults {
  /** Timestamp of demo run */
  timestamp: string;
  /** Configuration used */
  config: DemoConfig;
  /** Listings processed */
  listingsProcessed: number;
  /** Vector preparation results (if enabled) */
  vectorPrep: VectorPrepResult[];
  /** Strategy evaluations per listing */
  evaluations: StrategyEvaluation[];
  /** Aggregated recommendations */
  recommendations: BidRecommendation[];
  /** Summary statistics */
  summary: DemoSummary;
}

export interface BidRecommendation {
  listingId: string;
  listingTitle: string;
  recommendedAction: string;
  recommendedAmount?: number;
  bestStrategy: BiddingStrategy;
  confidence: number;
  reasoning: string;
  consensusLevel: 'UNANIMOUS' | 'MAJORITY' | 'SPLIT' | 'SINGLE';
  agreeingAgents: number;
  totalAgents: number;
}

export interface DemoSummary {
  totalListings: number;
  recommendedBids: number;
  recommendedOffers: number;
  recommendedWatch: number;
  recommendedSkip: number;
  avgConfidence: number;
  underpricedOpportunities: number;
  fairValueListings: number;
  overpricedListings: number;
}

// =============================================================================
// DEMO RUNNER
// =============================================================================

/**
 * Run the complete swarm intelligence demo.
 */
export async function runSwarmDemo(
  config: Partial<DemoConfig> = {}
): Promise<DemoResults> {
  const finalConfig = { ...DEFAULT_DEMO_CONFIG, ...config };
  const swarmId = generateSwarmId();

  console.log('\n' + '='.repeat(80));
  console.log('SWARM INTELLIGENCE DEMO');
  console.log('='.repeat(80));
  console.log(`Swarm ID: ${swarmId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Agent Budget: $${finalConfig.agentBudget}`);
  console.log(`Agent Count: ${finalConfig.agentCount}`);
  console.log('='.repeat(80) + '\n');

  // Initialize results
  const results: DemoResults = {
    timestamp: new Date().toISOString(),
    config: finalConfig,
    listingsProcessed: 0,
    vectorPrep: [],
    evaluations: [],
    recommendations: [],
    summary: {
      totalListings: 0,
      recommendedBids: 0,
      recommendedOffers: 0,
      recommendedWatch: 0,
      recommendedSkip: 0,
      avgConfidence: 0,
      underpricedOpportunities: 0,
      fairValueListings: 0,
      overpricedListings: 0,
    },
  };

  // Step 1: Create agent configurations
  console.log('STEP 1: Creating Agent Configurations');
  console.log('-'.repeat(40));
  const agents = createDemoAgents(finalConfig.agentCount, finalConfig.agentBudget, swarmId);
  console.log(`Created ${agents.length} agents with strategies:`);
  agents.forEach(agent => {
    console.log(`  - ${agent.agentId}: ${agent.strategy}`);
  });
  console.log('');

  // Step 2: Initialize vector service (optional)
  console.log('STEP 2: Initializing Vector Service');
  console.log('-'.repeat(40));
  const vectorService = createSwarmVectorService({
    enabled: finalConfig.enableVectors,
    namespace: 'demo',
  });

  if (vectorService.isEnabled()) {
    console.log('Vector service enabled - will prepare records for Pinecone');
    console.log(`Indexes: ${Object.values(vectorService.getIndexNames()).join(', ')}`);
  } else {
    console.log('Vector service disabled (no PINECONE_API_KEY or enableVectors=false)');
    console.log('Skipping vector preparation...');
  }
  console.log('');

  // Step 3: Process each listing
  console.log('STEP 3: Processing Listings');
  console.log('-'.repeat(40));

  for (const listing of SAMPLE_LISTINGS) {
    console.log(`\nProcessing: ${listing.title}`);
    console.log(`  Item ID: ${listing.itemId}`);
    console.log(`  Current Price: $${listing.currentPrice.toFixed(2)}`);
    console.log(`  Type: ${listing.isAuction ? 'Auction' : 'Fixed Price'}${listing.hasBestOffer ? ' + Best Offer' : ''}`);

    // Get market context
    const marketContext = getMarketContextForListing(listing);
    if (marketContext) {
      console.log(`  Market Avg: $${marketContext.averagePrice.toFixed(2)}`);
      const discount = ((marketContext.averagePrice - listing.currentPrice) / marketContext.averagePrice) * 100;
      console.log(`  Discount: ${discount.toFixed(1)}%`);
    }

    // Generate observation
    const observation = generateSampleObservation(
      listing,
      agents[0].agentId,
      swarmId
    );

    // Step 3a: Prepare for vector storage
    if (vectorService.isEnabled()) {
      const vectorPrep = prepareVectorRecords(vectorService, listing, observation);
      results.vectorPrep.push(vectorPrep);

      if (finalConfig.verbose) {
        console.log('  Vector Records Prepared:');
        console.log(`    - Listing: ${vectorPrep.listingRecord ? 'Yes' : 'No'}`);
        console.log(`    - Price: ${vectorPrep.priceRecord ? 'Yes' : 'No'}`);
        console.log(`    - Seller: ${vectorPrep.sellerRecord ? 'Yes' : 'No'}`);
      }
    }

    // Step 3b: Evaluate with each strategy
    const listingEvaluations = await evaluateWithAllStrategies(
      listing,
      agents,
      observation,
      marketContext
    );

    results.evaluations.push(...listingEvaluations);

    if (finalConfig.verbose) {
      console.log('  Strategy Evaluations:');
      listingEvaluations.forEach(ev => {
        console.log(`    ${ev.strategy}: ${ev.decision.action}${ev.decision.amount ? ` ($${ev.decision.amount.toFixed(2)})` : ''} [${(ev.decision.confidence * 100).toFixed(0)}%]`);
      });
    }

    // Step 3c: Generate recommendation
    const recommendation = generateRecommendation(listing, listingEvaluations);
    results.recommendations.push(recommendation);

    console.log(`  RECOMMENDATION: ${recommendation.recommendedAction}${recommendation.recommendedAmount ? ` at $${recommendation.recommendedAmount.toFixed(2)}` : ''}`);
    console.log(`  Best Strategy: ${recommendation.bestStrategy} (${recommendation.consensusLevel} consensus)`);

    results.listingsProcessed++;
  }

  // Step 4: Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4: Summary');
  console.log('='.repeat(80));

  results.summary = calculateSummary(results);
  printSummary(results.summary);

  // Step 5: Show final recommendations
  console.log('\n' + '='.repeat(80));
  console.log('FINAL BID RECOMMENDATIONS');
  console.log('='.repeat(80));

  const actionableRecs = results.recommendations.filter(
    r => r.recommendedAction === 'BID' || r.recommendedAction === 'OFFER'
  );

  if (actionableRecs.length === 0) {
    console.log('No actionable recommendations at this time.');
  } else {
    actionableRecs.forEach((rec, i) => {
      console.log(`\n${i + 1}. ${rec.listingTitle}`);
      console.log(`   Action: ${rec.recommendedAction} at $${rec.recommendedAmount?.toFixed(2) || 'N/A'}`);
      console.log(`   Strategy: ${rec.bestStrategy}`);
      console.log(`   Confidence: ${(rec.confidence * 100).toFixed(0)}%`);
      console.log(`   Reasoning: ${rec.reasoning}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('Demo Complete!');
  console.log('='.repeat(80) + '\n');

  return results;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create demo agent configurations.
 */
export function createDemoAgents(
  count: number,
  budget: number,
  swarmId: string
): MarketAgentConfig[] {
  const distribution = getRecommendedDistribution(count);
  const agents: MarketAgentConfig[] = [];

  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const [strategy, strategyCount] of distribution) {
    for (let i = 0; i < strategyCount; i++) {
      agents.push({
        agentId: generateAgentId(),
        name: `${strategy}-Agent-${i + 1}`,
        strategy,
        budgetAllocation: { value: budget, currency: 'USD' },
        timeWindow: { start: now, end },
        targetCriteria: {
          searchQuery: 'gold silver bullion',
          minPrice: 25,
          maxPrice: 3000,
          conditions: ['NEW', 'LIKE_NEW'],
        },
        swarmId,
      });
    }
  }

  return agents;
}

/**
 * Prepare vector records for a listing.
 */
export function prepareVectorRecords(
  vectorService: ReturnType<typeof createSwarmVectorService>,
  listing: NormalizedListing,
  observation: Observation
): VectorPrepResult {
  const listingRecord = vectorService.prepareListingForStorage(listing, observation);
  const priceRecord = vectorService.preparePriceObservationForStorage(observation);

  // Find seller profile
  const sellerProfile = SAMPLE_SELLER_PROFILES.find(s => s.sellerId === listing.sellerId);
  const sellerRecord = sellerProfile
    ? vectorService.prepareSellerProfileForStorage(sellerProfile)
    : null;

  return {
    listingId: listing.itemId,
    listingRecord: listingRecord?.record || null,
    priceRecord: priceRecord?.record || null,
    sellerRecord: sellerRecord?.record || null,
  };
}

/**
 * Evaluate a listing with all agent strategies.
 */
export async function evaluateWithAllStrategies(
  listing: NormalizedListing,
  agents: MarketAgentConfig[],
  observation: Observation,
  marketContext?: MarketContext
): Promise<StrategyEvaluation[]> {
  const evaluations: StrategyEvaluation[] = [];

  for (const agent of agents) {
    const strategy = createStrategy(agent.strategy);

    const context: StrategyContext = {
      listing,
      agentConfig: agent,
      remainingBudget: agent.budgetAllocation || { value: 500, currency: 'USD' },
      agentHistory: [],
      currentTime: new Date(),
      marketContext,
    };

    try {
      const decision = await strategy.evaluate(context);

      evaluations.push({
        listingId: listing.itemId,
        listingTitle: listing.title,
        strategy: agent.strategy,
        agentId: agent.agentId,
        decision,
        marketCondition: observation.marketCondition,
        currentPrice: listing.currentPrice,
        marketAverage: observation.marketAverage,
        discountPercent: observation.discountPercent,
      });
    } catch (error) {
      console.error(`Strategy ${agent.strategy} failed:`, error);
    }
  }

  return evaluations;
}

/**
 * Generate a consolidated recommendation from strategy evaluations.
 */
export function generateRecommendation(
  listing: NormalizedListing,
  evaluations: StrategyEvaluation[]
): BidRecommendation {
  // Count actions
  const actionCounts: Record<string, StrategyEvaluation[]> = {};
  evaluations.forEach(ev => {
    const action = ev.decision.action;
    if (!actionCounts[action]) {
      actionCounts[action] = [];
    }
    actionCounts[action].push(ev);
  });

  // Find majority action
  let majorityAction = 'SKIP';
  let majorityCount = 0;

  for (const [action, evals] of Object.entries(actionCounts)) {
    if (evals.length > majorityCount) {
      majorityCount = evals.length;
      majorityAction = action;
    }
  }

  const majorityEvaluations = actionCounts[majorityAction] || [];

  // Determine consensus level
  let consensusLevel: BidRecommendation['consensusLevel'];
  const totalAgents = evaluations.length;

  if (majorityCount === totalAgents) {
    consensusLevel = 'UNANIMOUS';
  } else if (majorityCount > totalAgents / 2) {
    consensusLevel = 'MAJORITY';
  } else if (majorityCount > 1) {
    consensusLevel = 'SPLIT';
  } else {
    consensusLevel = 'SINGLE';
  }

  // Calculate average amount and confidence from majority
  let avgAmount: number | undefined;
  let avgConfidence = 0;

  const amounts = majorityEvaluations
    .filter(ev => ev.decision.amount !== undefined)
    .map(ev => ev.decision.amount!);

  if (amounts.length > 0) {
    avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  }

  avgConfidence = majorityEvaluations.reduce(
    (sum, ev) => sum + ev.decision.confidence,
    0
  ) / majorityEvaluations.length;

  // Find best strategy (highest confidence in majority)
  const bestEval = majorityEvaluations.reduce(
    (best, current) =>
      current.decision.confidence > best.decision.confidence ? current : best,
    majorityEvaluations[0]
  );

  return {
    listingId: listing.itemId,
    listingTitle: listing.title,
    recommendedAction: majorityAction,
    recommendedAmount: avgAmount,
    bestStrategy: bestEval.strategy,
    confidence: avgConfidence,
    reasoning: bestEval.decision.reasoning,
    consensusLevel,
    agreeingAgents: majorityCount,
    totalAgents,
  };
}

/**
 * Calculate summary statistics.
 */
export function calculateSummary(results: DemoResults): DemoSummary {
  const summary: DemoSummary = {
    totalListings: results.listingsProcessed,
    recommendedBids: 0,
    recommendedOffers: 0,
    recommendedWatch: 0,
    recommendedSkip: 0,
    avgConfidence: 0,
    underpricedOpportunities: 0,
    fairValueListings: 0,
    overpricedListings: 0,
  };

  // Count recommendations
  results.recommendations.forEach(rec => {
    switch (rec.recommendedAction) {
      case 'BID':
        summary.recommendedBids++;
        break;
      case 'OFFER':
        summary.recommendedOffers++;
        break;
      case 'WATCH':
        summary.recommendedWatch++;
        break;
      case 'SKIP':
      case 'DECLINE':
        summary.recommendedSkip++;
        break;
    }
    summary.avgConfidence += rec.confidence;
  });

  if (results.recommendations.length > 0) {
    summary.avgConfidence /= results.recommendations.length;
  }

  // Count market conditions
  const conditions = new Set(results.evaluations.map(ev => ev.marketCondition));
  results.evaluations.forEach(ev => {
    if (ev.marketCondition === 'UNDERPRICED') {
      summary.underpricedOpportunities++;
    } else if (ev.marketCondition === 'FAIR') {
      summary.fairValueListings++;
    } else if (ev.marketCondition === 'OVERPRICED') {
      summary.overpricedListings++;
    }
  });

  // Normalize by number of agents (each listing is evaluated by all agents)
  const agentCount = results.config.agentCount;
  summary.underpricedOpportunities = Math.round(summary.underpricedOpportunities / agentCount);
  summary.fairValueListings = Math.round(summary.fairValueListings / agentCount);
  summary.overpricedListings = Math.round(summary.overpricedListings / agentCount);

  return summary;
}

/**
 * Print summary to console.
 */
export function printSummary(summary: DemoSummary): void {
  console.log(`\nTotal Listings: ${summary.totalListings}`);
  console.log(`\nRecommendations:`);
  console.log(`  Bids: ${summary.recommendedBids}`);
  console.log(`  Offers: ${summary.recommendedOffers}`);
  console.log(`  Watch: ${summary.recommendedWatch}`);
  console.log(`  Skip: ${summary.recommendedSkip}`);
  console.log(`\nAvg Confidence: ${(summary.avgConfidence * 100).toFixed(1)}%`);
  console.log(`\nMarket Analysis:`);
  console.log(`  Underpriced: ${summary.underpricedOpportunities}`);
  console.log(`  Fair Value: ${summary.fairValueListings}`);
  console.log(`  Overpriced: ${summary.overpricedListings}`);
}

// =============================================================================
// CLI RUNNER
// =============================================================================

/**
 * Main entry point for CLI execution.
 */
async function main(): Promise<void> {
  try {
    // Check for command line args
    const args = process.argv.slice(2);
    const config: Partial<DemoConfig> = {};

    args.forEach(arg => {
      if (arg === '--verbose' || arg === '-v') {
        config.verbose = true;
      }
      if (arg === '--quiet' || arg === '-q') {
        config.verbose = false;
      }
      if (arg === '--vectors') {
        config.enableVectors = true;
      }
      if (arg.startsWith('--agents=')) {
        config.agentCount = parseInt(arg.split('=')[1], 10);
      }
      if (arg.startsWith('--budget=')) {
        config.agentBudget = parseFloat(arg.split('=')[1]);
      }
    });

    const results = await runSwarmDemo(config);

    // Output JSON if requested
    if (args.includes('--json')) {
      console.log('\nJSON Output:');
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
// Note: Works with both direct node execution and tsx
const isMainModule = process.argv[1]?.includes('swarm-demo');
if (isMainModule) {
  main();
}
