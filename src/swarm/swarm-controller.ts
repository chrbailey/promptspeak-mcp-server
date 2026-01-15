/**
 * Swarm Controller
 *
 * Central orchestrator for the market agent swarm.
 * Manages agent lifecycle, coordinates operations, and enforces constraints.
 *
 * Responsibilities:
 * - Create and manage swarm instances
 * - Spawn and terminate agents
 * - Coordinate search and bidding operations
 * - Emit events for registry integration
 * - Enforce budget and safety limits
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  SwarmConfig,
  SwarmState,
  SwarmStatus,
  MarketAgentConfig,
  MarketAgentState,
  MonetaryBudget,
  TargetCriteria,
  TimeWindow,
  SwarmEvent,
  SwarmEventType,
  BiddingStrategy,
  NormalizedListing,
} from './types.js';
import { BudgetAllocator, AllocationRequest } from './budget-allocator.js';
import { createStrategy, getRecommendedDistribution, BiddingStrategyInterface } from './strategies/index.js';
import { getEbayClient, EbayClient } from './ebay/client.js';
import { getSwarmDatabase, SwarmDatabase } from './database.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Active agent instance.
 */
interface ActiveAgent {
  config: MarketAgentConfig;
  state: MarketAgentState;
  strategy: BiddingStrategyInterface;
  searchInterval?: NodeJS.Timeout;
}

/**
 * Swarm creation options.
 */
export interface CreateSwarmOptions {
  totalBudget: MonetaryBudget;
  agentCount?: number;
  strategyDistribution?: Map<BiddingStrategy, number>;
  targetCriteria: TargetCriteria;
  timeWindow: TimeWindow;
  feeReservePercent?: number;
  searchIntervalMs?: number;
}

/**
 * Swarm controller events.
 */
export interface SwarmControllerEvents {
  'swarm:created': (swarmId: string, config: SwarmConfig) => void;
  'swarm:started': (swarmId: string) => void;
  'swarm:paused': (swarmId: string) => void;
  'swarm:terminated': (swarmId: string, reason: string) => void;
  'agent:spawned': (swarmId: string, agentId: string, strategy: BiddingStrategy) => void;
  'agent:terminated': (swarmId: string, agentId: string, reason: string) => void;
  'bid:placed': (swarmId: string, agentId: string, listingId: string, amount: number) => void;
  'bid:won': (swarmId: string, agentId: string, listingId: string, amount: number) => void;
  'bid:lost': (swarmId: string, agentId: string, listingId: string) => void;
  'offer:submitted': (swarmId: string, agentId: string, listingId: string, amount: number) => void;
  'offer:accepted': (swarmId: string, agentId: string, listingId: string, amount: number) => void;
  'item:acquired': (swarmId: string, agentId: string, listingId: string, cost: number) => void;
  'error': (swarmId: string, error: Error) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SWARM CONTROLLER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SwarmController extends EventEmitter {
  private swarmConfig: SwarmConfig | null = null;
  private swarmState: SwarmState | null = null;
  private budgetAllocator: BudgetAllocator | null = null;
  private agents: Map<string, ActiveAgent> = new Map();
  private ebayClient: EbayClient;
  private database: SwarmDatabase;
  private searchIntervalMs: number = 60000; // Default: 1 minute
  private isRunning: boolean = false;

  constructor() {
    super();
    this.ebayClient = getEbayClient();
    this.database = getSwarmDatabase();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWARM LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new swarm.
   */
  async createSwarm(options: CreateSwarmOptions): Promise<string> {
    const swarmId = uuidv4();
    const now = new Date();

    // Determine strategy distribution
    const agentCount = options.agentCount ?? 5;
    const strategyDistribution = options.strategyDistribution ??
      getRecommendedDistribution(agentCount);

    // Create swarm config
    this.swarmConfig = {
      swarmId,
      totalBudget: options.totalBudget,
      agentCount,
      strategyDistribution,
      targetCriteria: options.targetCriteria,
      timeWindow: options.timeWindow,
      feeReservePercent: options.feeReservePercent ?? 5,
      createdAt: now,
    };

    // Initialize state
    this.swarmState = {
      status: 'CREATED',
      activeAgents: 0,
      totalBids: 0,
      totalOffers: 0,
      wonAuctions: 0,
      acceptedOffers: 0,
      totalSpent: { value: 0, currency: options.totalBudget.currency },
      itemsAcquired: 0,
      lastActivity: now,
    };

    // Initialize budget allocator
    this.budgetAllocator = new BudgetAllocator(this.swarmConfig);
    this.searchIntervalMs = options.searchIntervalMs ?? 60000;

    // Save to database
    await this.database.createSwarm({
      swarm_id: swarmId,
      config: JSON.stringify(this.swarmConfig),
      status: 'CREATED',
      total_budget: options.totalBudget.value,
      spent_budget: 0,
      agents_active: 0,
      created_at: now.toISOString(),
    });

    // Emit event
    await this.recordEvent('SWARM_CREATED', swarmId, undefined, {
      config: this.swarmConfig,
    });

    this.emit('swarm:created', swarmId, this.swarmConfig);

    return swarmId;
  }

  /**
   * Start swarm operations.
   */
  async startSwarm(): Promise<void> {
    if (!this.swarmConfig || !this.swarmState) {
      throw new Error('No swarm configured. Call createSwarm first.');
    }

    if (this.isRunning) {
      throw new Error('Swarm is already running');
    }

    // Check if within time window
    const now = new Date();
    if (now > new Date(this.swarmConfig.timeWindow.end)) {
      throw new Error('Swarm time window has expired');
    }

    // Spawn agents based on strategy distribution
    await this.spawnAgents();

    // Update state
    this.swarmState.status = 'RUNNING';
    this.isRunning = true;

    // Start search loops for all agents
    for (const [agentId, agent] of this.agents) {
      this.startAgentSearchLoop(agentId, agent);
    }

    // Update database
    await this.database.updateSwarmStatus(this.swarmConfig.swarmId, 'RUNNING');

    // Emit event
    await this.recordEvent('SWARM_STARTED', this.swarmConfig.swarmId);
    this.emit('swarm:started', this.swarmConfig.swarmId);
  }

  /**
   * Pause swarm operations.
   */
  async pauseSwarm(): Promise<void> {
    if (!this.swarmConfig || !this.swarmState) {
      throw new Error('No swarm configured');
    }

    // Stop all search loops
    for (const [, agent] of this.agents) {
      if (agent.searchInterval) {
        clearInterval(agent.searchInterval);
        agent.searchInterval = undefined;
      }
    }

    this.swarmState.status = 'PAUSED';
    this.isRunning = false;

    await this.database.updateSwarmStatus(this.swarmConfig.swarmId, 'PAUSED');
    await this.recordEvent('SWARM_PAUSED', this.swarmConfig.swarmId);
    this.emit('swarm:paused', this.swarmConfig.swarmId);
  }

  /**
   * Terminate swarm and compute final insights.
   */
  async terminateSwarm(reason: string = 'Manual termination'): Promise<void> {
    if (!this.swarmConfig || !this.swarmState) {
      throw new Error('No swarm configured');
    }

    // Stop all agent operations
    for (const [agentId, agent] of this.agents) {
      if (agent.searchInterval) {
        clearInterval(agent.searchInterval);
      }
      await this.recordEvent('AGENT_TERMINATED', this.swarmConfig.swarmId, agentId, { reason });
    }

    this.swarmState.status = 'TERMINATED';
    this.isRunning = false;

    await this.database.updateSwarmStatus(this.swarmConfig.swarmId, 'TERMINATED');
    await this.recordEvent('SWARM_TERMINATED', this.swarmConfig.swarmId, undefined, { reason });
    this.emit('swarm:terminated', this.swarmConfig.swarmId, reason);

    // Clear agent references
    this.agents.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn agents based on strategy distribution.
   */
  private async spawnAgents(): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) {
      throw new Error('Swarm not configured');
    }

    const allocationRequests: AllocationRequest[] = [];
    const agentsToCreate: { strategy: BiddingStrategy; agentId: string }[] = [];

    // Create agent configs from distribution
    for (const [strategy, count] of this.swarmConfig.strategyDistribution) {
      for (let i = 0; i < count; i++) {
        const agentId = uuidv4();
        agentsToCreate.push({ strategy, agentId });
        allocationRequests.push({
          agentId,
          strategy,
          priority: 5, // Default priority
        });
      }
    }

    // Initialize budget allocations
    const allocations = this.budgetAllocator.initializeAllocations(
      allocationRequests,
      'WEIGHTED'
    );

    // Create agent instances
    for (let i = 0; i < agentsToCreate.length; i++) {
      const { strategy, agentId } = agentsToCreate[i];
      const allocation = allocations[i];

      const config: MarketAgentConfig = {
        agentId,
        swarmId: this.swarmConfig.swarmId,
        strategy,
        budgetAllocation: allocation.allocated,
        targetCriteria: this.swarmConfig.targetCriteria,
        timeWindow: this.swarmConfig.timeWindow,
        createdAt: new Date(),
      };

      const state: MarketAgentState = {
        status: 'ACTIVE',
        remainingBudget: { ...allocation.allocated },
        activeBids: [],
        activeOffers: [],
        wins: 0,
        losses: 0,
        totalSpent: { value: 0, currency: allocation.allocated.currency },
      };

      const strategyInstance = createStrategy(strategy);

      this.agents.set(agentId, {
        config,
        state,
        strategy: strategyInstance,
      });

      // Save to database
      await this.database.createAgent({
        agent_id: agentId,
        swarm_id: this.swarmConfig.swarmId,
        strategy,
        budget_allocated: allocation.allocated.value,
        budget_spent: 0,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      });

      await this.recordEvent('AGENT_SPAWNED', this.swarmConfig.swarmId, agentId, {
        strategy,
        budget: allocation.allocated.value,
      });

      this.emit('agent:spawned', this.swarmConfig.swarmId, agentId, strategy);
    }

    if (this.swarmState) {
      this.swarmState.activeAgents = this.agents.size;
    }
  }

  /**
   * Start search loop for an agent.
   */
  private startAgentSearchLoop(agentId: string, agent: ActiveAgent): void {
    // Initial search
    this.executeAgentSearch(agentId, agent).catch(err => {
      this.emit('error', this.swarmConfig?.swarmId ?? 'unknown', err);
    });

    // Set up interval
    agent.searchInterval = setInterval(() => {
      if (this.isRunning) {
        this.executeAgentSearch(agentId, agent).catch(err => {
          this.emit('error', this.swarmConfig?.swarmId ?? 'unknown', err);
        });
      }
    }, this.searchIntervalMs);
  }

  /**
   * Execute a search cycle for an agent.
   */
  private async executeAgentSearch(agentId: string, agent: ActiveAgent): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const allocation = this.budgetAllocator.getAllocation(agentId);
    if (!allocation || allocation.available.value <= 0) {
      return; // No budget available
    }

    try {
      // Build search query from target criteria
      const searchQuery = {
        query: this.swarmConfig.targetCriteria.searchTerms?.join(' ') ?? 'mink pelt',
        categoryIds: this.swarmConfig.targetCriteria.categoryIds,
        minPrice: this.swarmConfig.targetCriteria.minPrice,
        maxPrice: Math.min(
          this.swarmConfig.targetCriteria.maxPrice ?? allocation.available.value,
          allocation.available.value
        ),
        conditions: this.swarmConfig.targetCriteria.conditions,
        limit: 20,
      };

      // Search eBay
      const listings = await this.ebayClient.searchItems(searchQuery);

      // Record search event
      await this.recordEvent('SEARCH_EXECUTED', this.swarmConfig.swarmId, agentId, {
        query: searchQuery,
        resultsCount: listings.length,
      });

      // Evaluate each listing
      for (const listing of listings) {
        await this.evaluateListing(agentId, agent, listing, allocation);
      }

      // Update last activity
      if (this.swarmState) {
        this.swarmState.lastActivity = new Date();
      }
    } catch (error) {
      await this.recordEvent('ERROR', this.swarmConfig.swarmId, agentId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'search',
      });
    }
  }

  /**
   * Evaluate a listing and decide whether to act.
   */
  private async evaluateListing(
    agentId: string,
    agent: ActiveAgent,
    listing: NormalizedListing,
    allocation: { available: MonetaryBudget }
  ): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    // Get agent's listing history
    const listingHistory = await this.database.getEventsForListing(listing.id);

    // Build context for strategy
    const context = {
      listing,
      agentConfig: agent.config,
      remainingBudget: allocation.available,
      agentHistory: await this.database.getEventsForAgent(agentId),
      currentTime: new Date(),
      listingHistory,
      // Note: marketContext would come from historical data analysis
    };

    // Get strategy decision
    const decision = await agent.strategy.evaluate(context);

    // Act on decision
    switch (decision.action) {
      case 'BID':
        if (decision.amount && this.budgetAllocator.canAfford(agentId, decision.amount)) {
          await this.placeBid(agentId, listing, decision.amount, decision.delayMs);
        }
        break;

      case 'OFFER':
        if (decision.amount && this.budgetAllocator.canAfford(agentId, decision.amount)) {
          await this.submitOffer(agentId, listing, decision.amount);
        }
        break;

      case 'WATCH':
        await this.watchListing(agentId, listing);
        break;

      case 'SKIP':
        // Do nothing
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BIDDING & OFFER OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Place a bid on an auction.
   */
  private async placeBid(
    agentId: string,
    listing: NormalizedListing,
    amount: number,
    delayMs?: number
  ): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Apply snipe delay if specified
    if (delayMs && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      // Reserve funds
      if (!this.budgetAllocator.reserveFunds(agentId, amount)) {
        return; // Couldn't reserve
      }

      // Place bid via eBay API
      const response = await this.ebayClient.placeBid(listing.id, amount);

      // Record event
      await this.recordEvent('BID_PLACED', this.swarmConfig.swarmId, agentId, {
        listingId: listing.id,
        amount,
        response,
      });

      // Update agent state
      agent.state.activeBids.push({
        listingId: listing.id,
        amount,
        timestamp: new Date(),
      });

      if (this.swarmState) {
        this.swarmState.totalBids++;
      }

      this.emit('bid:placed', this.swarmConfig.swarmId, agentId, listing.id, amount);

    } catch (error) {
      // Release reserved funds on failure
      this.budgetAllocator.releaseFunds(agentId, amount);

      await this.recordEvent('ERROR', this.swarmConfig.swarmId, agentId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'bid',
        listingId: listing.id,
      });
    }
  }

  /**
   * Submit a Best Offer.
   */
  private async submitOffer(
    agentId: string,
    listing: NormalizedListing,
    amount: number
  ): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    try {
      // Reserve funds
      if (!this.budgetAllocator.reserveFunds(agentId, amount)) {
        return;
      }

      // Submit offer via eBay API
      const response = await this.ebayClient.submitOffer(listing.id, amount);

      // Record event
      await this.recordEvent('OFFER_SUBMITTED', this.swarmConfig.swarmId, agentId, {
        listingId: listing.id,
        amount,
        response,
      });

      // Update agent state
      agent.state.activeOffers.push({
        listingId: listing.id,
        amount,
        timestamp: new Date(),
        offerId: response.offerId,
      });

      if (this.swarmState) {
        this.swarmState.totalOffers++;
      }

      this.emit('offer:submitted', this.swarmConfig.swarmId, agentId, listing.id, amount);

    } catch (error) {
      this.budgetAllocator.releaseFunds(agentId, amount);

      await this.recordEvent('ERROR', this.swarmConfig.swarmId, agentId, {
        error: error instanceof Error ? error.message : 'Unknown error',
        phase: 'offer',
        listingId: listing.id,
      });
    }
  }

  /**
   * Add listing to watchlist.
   */
  private async watchListing(agentId: string, listing: NormalizedListing): Promise<void> {
    if (!this.swarmConfig) return;

    await this.recordEvent('LISTING_TRACKED', this.swarmConfig.swarmId, agentId, {
      listingId: listing.id,
      currentPrice: listing.currentPrice,
      auctionEndTime: listing.auctionEndTime,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTCOME HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle auction win notification.
   */
  async handleAuctionWin(agentId: string, listingId: string, finalAmount: number): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Record purchase
    this.budgetAllocator.recordPurchase(agentId, finalAmount, true);

    // Update agent state
    agent.state.wins++;
    agent.state.totalSpent.value += finalAmount;
    agent.state.remainingBudget.value -= finalAmount;
    agent.state.activeBids = agent.state.activeBids.filter(b => b.listingId !== listingId);

    // Update swarm state
    if (this.swarmState) {
      this.swarmState.wonAuctions++;
      this.swarmState.itemsAcquired++;
      this.swarmState.totalSpent.value += finalAmount;
    }

    await this.recordEvent('BID_WON', this.swarmConfig.swarmId, agentId, {
      listingId,
      amount: finalAmount,
    });

    await this.recordEvent('ITEM_ACQUIRED', this.swarmConfig.swarmId, agentId, {
      listingId,
      cost: finalAmount,
      acquisitionMethod: 'AUCTION',
    });

    this.emit('bid:won', this.swarmConfig.swarmId, agentId, listingId, finalAmount);
    this.emit('item:acquired', this.swarmConfig.swarmId, agentId, listingId, finalAmount);
  }

  /**
   * Handle auction loss notification.
   */
  async handleAuctionLoss(agentId: string, listingId: string): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Find the bid amount and release funds
    const bid = agent.state.activeBids.find(b => b.listingId === listingId);
    if (bid) {
      this.budgetAllocator.releaseFunds(agentId, bid.amount);
      agent.state.activeBids = agent.state.activeBids.filter(b => b.listingId !== listingId);
    }

    agent.state.losses++;

    await this.recordEvent('BID_LOST', this.swarmConfig.swarmId, agentId, { listingId });
    this.emit('bid:lost', this.swarmConfig.swarmId, agentId, listingId);
  }

  /**
   * Handle offer acceptance.
   */
  async handleOfferAccepted(agentId: string, listingId: string, finalAmount: number): Promise<void> {
    if (!this.swarmConfig || !this.budgetAllocator) return;

    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.budgetAllocator.recordPurchase(agentId, finalAmount, true);

    agent.state.totalSpent.value += finalAmount;
    agent.state.remainingBudget.value -= finalAmount;
    agent.state.activeOffers = agent.state.activeOffers.filter(o => o.listingId !== listingId);

    if (this.swarmState) {
      this.swarmState.acceptedOffers++;
      this.swarmState.itemsAcquired++;
      this.swarmState.totalSpent.value += finalAmount;
    }

    await this.recordEvent('OFFER_ACCEPTED', this.swarmConfig.swarmId, agentId, {
      listingId,
      amount: finalAmount,
    });

    await this.recordEvent('ITEM_ACQUIRED', this.swarmConfig.swarmId, agentId, {
      listingId,
      cost: finalAmount,
      acquisitionMethod: 'BEST_OFFER',
    });

    this.emit('offer:accepted', this.swarmConfig.swarmId, agentId, listingId, finalAmount);
    this.emit('item:acquired', this.swarmConfig.swarmId, agentId, listingId, finalAmount);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS & REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current swarm status.
   */
  getStatus(): SwarmStatus | null {
    if (!this.swarmConfig || !this.swarmState || !this.budgetAllocator) {
      return null;
    }

    const budgetStatus = this.budgetAllocator.getSwarmStatus();

    return {
      swarmId: this.swarmConfig.swarmId,
      status: this.swarmState.status,
      activeAgents: this.swarmState.activeAgents,
      totalBids: this.swarmState.totalBids,
      totalOffers: this.swarmState.totalOffers,
      wonAuctions: this.swarmState.wonAuctions,
      acceptedOffers: this.swarmState.acceptedOffers,
      itemsAcquired: this.swarmState.itemsAcquired,
      budgetTotal: budgetStatus.total,
      budgetSpent: budgetStatus.spent,
      budgetAvailable: budgetStatus.available,
      timeRemaining: this.calculateTimeRemaining(),
      lastActivity: this.swarmState.lastActivity,
    };
  }

  /**
   * Get detailed agent status.
   */
  getAgentStatus(agentId: string): MarketAgentState | null {
    const agent = this.agents.get(agentId);
    return agent?.state ?? null;
  }

  /**
   * Get all agent summaries.
   */
  getAgentSummaries(): Array<{
    agentId: string;
    strategy: BiddingStrategy;
    status: string;
    budget: number;
    spent: number;
    wins: number;
    losses: number;
  }> {
    const summaries = [];

    for (const [agentId, agent] of this.agents) {
      summaries.push({
        agentId,
        strategy: agent.config.strategy,
        status: agent.state.status,
        budget: agent.config.budgetAllocation.value,
        spent: agent.state.totalSpent.value,
        wins: agent.state.wins,
        losses: agent.state.losses,
      });
    }

    return summaries;
  }

  /**
   * Calculate time remaining in swarm window.
   */
  private calculateTimeRemaining(): number {
    if (!this.swarmConfig) return 0;

    const now = new Date();
    const end = new Date(this.swarmConfig.timeWindow.end);
    return Math.max(0, end.getTime() - now.getTime());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT RECORDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record an event to the database.
   */
  private async recordEvent(
    eventType: SwarmEventType,
    swarmId: string,
    agentId?: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const event: SwarmEvent = {
      eventId: uuidv4(),
      eventType,
      swarmId,
      agentId,
      timestamp: new Date(),
      data,
    };

    await this.database.recordEvent({
      event_id: event.eventId,
      swarm_id: swarmId,
      agent_id: agentId,
      event_type: eventType,
      event_data: JSON.stringify(data ?? {}),
      timestamp: event.timestamp.toISOString(),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let controllerInstance: SwarmController | null = null;

/**
 * Get the swarm controller singleton.
 */
export function getSwarmController(): SwarmController {
  if (!controllerInstance) {
    controllerInstance = new SwarmController();
  }
  return controllerInstance;
}

/**
 * Create a fresh swarm controller (for testing).
 */
export function createSwarmController(): SwarmController {
  return new SwarmController();
}
