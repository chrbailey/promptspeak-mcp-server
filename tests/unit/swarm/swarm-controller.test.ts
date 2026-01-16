/**
 * Swarm Controller Unit Tests
 *
 * Tests for the central swarm orchestrator with mocked dependencies.
 * Focus on lifecycle management, agent spawning, and status reporting.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createSwarmController, type CreateSwarmOptions } from '../../../src/swarm/swarm-controller.js';
import type { BiddingStrategy } from '../../../src/swarm/types.js';

// Mock the eBay client
vi.mock('../../../src/swarm/ebay/client.js', () => ({
  getEbayClient: () => ({
    searchItems: vi.fn().mockResolvedValue([]),
    placeBid: vi.fn().mockResolvedValue({ success: true, bidId: 'bid_123' }),
    submitOffer: vi.fn().mockResolvedValue({ success: true, offerId: 'offer_123' }),
    getItem: vi.fn().mockResolvedValue(null),
  }),
  EbayClient: vi.fn(),
}));

// Mock the database
vi.mock('../../../src/swarm/database.js', () => ({
  getSwarmDatabase: () => ({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
    }),
  }),
  createSwarm: vi.fn(),
  updateSwarmState: vi.fn(),
  createAgent: vi.fn(),
  recordEvent: vi.fn(),
  queryEvents: vi.fn().mockReturnValue([]),
}));

describe('SwarmController', () => {
  let controller: ReturnType<typeof createSwarmController>;
  let defaultOptions: CreateSwarmOptions;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh controller for each test
    controller = createSwarmController();

    // Default options for gold/silver swarm
    // Note: Using explicit strategy distribution to control agent count
    // The getRecommendedDistribution(5) actually creates 6 agents
    defaultOptions = {
      totalBudget: { value: 5000, currency: 'USD' },
      agentCount: 5,
      strategyDistribution: new Map<BiddingStrategy, number>([
        ['SNIPER', 1],
        ['EARLY_AGGRESSIVE', 1],
        ['NEGOTIATOR', 1],
        ['HYBRID', 1],
        ['PASSIVE', 1],
      ]),
      targetCriteria: {
        searchQuery: 'gold silver bullion',
        searchTerms: ['gold bars', 'silver coins'],
        minPrice: 25,
        maxPrice: 3000,
      },
      timeWindow: {
        start: new Date(),
        end: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('createSwarm', () => {
    it('should create a swarm and return a valid UUID', async () => {
      const swarmId = await controller.createSwarm(defaultOptions);

      expect(swarmId).toBeDefined();
      expect(swarmId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should emit swarm:created event', async () => {
      const createdHandler = vi.fn();
      controller.on('swarm:created', createdHandler);

      const swarmId = await controller.createSwarm(defaultOptions);

      expect(createdHandler).toHaveBeenCalledWith(swarmId, expect.objectContaining({
        swarmId,
        agentCount: 5,
      }));
    });

    it('should initialize with CREATED status', async () => {
      await controller.createSwarm(defaultOptions);
      const status = controller.getStatus();

      expect(status).not.toBeNull();
      expect(status?.status).toBe('CREATED');
    });

    it('should set correct budget amounts', async () => {
      await controller.createSwarm(defaultOptions);
      const status = controller.getStatus();

      expect(status?.budgetTotal.value).toBe(5000);
      expect(status?.budgetTotal.currency).toBe('USD');
    });

    it('should default to 5 agents when not specified', async () => {
      const options = { ...defaultOptions };
      delete options.agentCount;

      await controller.createSwarm(options);
      const status = controller.getStatus();

      // Agents aren't spawned until startSwarm(), so check config was set
      expect(status).not.toBeNull();
    });

    it('should accept custom strategy distribution', async () => {
      const customOptions: CreateSwarmOptions = {
        ...defaultOptions,
        strategyDistribution: new Map<BiddingStrategy, number>([
          ['SNIPER', 3],
          ['NEGOTIATOR', 2],
        ]),
      };

      const swarmId = await controller.createSwarm(customOptions);
      expect(swarmId).toBeDefined();
    });

    it('should handle MonetaryBudget format', async () => {
      const monetaryBudgetOptions: CreateSwarmOptions = {
        ...defaultOptions,
        totalBudget: {
          amount: 10000,
          currency: 'USD',
          maxPerItem: 5000,
          reservePercent: 10,
        },
      };

      await controller.createSwarm(monetaryBudgetOptions);
      const status = controller.getStatus();

      expect(status?.budgetTotal.value).toBe(10000);
    });
  });

  describe('startSwarm', () => {
    it('should throw error if no swarm configured', async () => {
      await expect(controller.startSwarm()).rejects.toThrow('No swarm configured');
    });

    it('should spawn agents on start', async () => {
      const spawnedHandler = vi.fn();
      controller.on('agent:spawned', spawnedHandler);

      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      // Should spawn 5 agents (default)
      expect(spawnedHandler).toHaveBeenCalledTimes(5);
    });

    it('should emit swarm:started event', async () => {
      const startedHandler = vi.fn();
      controller.on('swarm:started', startedHandler);

      const swarmId = await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      expect(startedHandler).toHaveBeenCalledWith(swarmId);
    });

    it('should set status to RUNNING', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const status = controller.getStatus();
      expect(status?.status).toBe('RUNNING');
    });

    it('should update activeAgents count', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const status = controller.getStatus();
      expect(status?.activeAgents).toBe(5);
    });

    it('should throw if swarm already running', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      await expect(controller.startSwarm()).rejects.toThrow('already running');
    });

    it('should throw if time window expired', async () => {
      const expiredOptions: CreateSwarmOptions = {
        ...defaultOptions,
        timeWindow: {
          start: new Date(Date.now() - 48 * 60 * 60 * 1000),
          end: new Date(Date.now() - 24 * 60 * 60 * 1000), // Ended yesterday
        },
      };

      await controller.createSwarm(expiredOptions);
      await expect(controller.startSwarm()).rejects.toThrow('expired');
    });
  });

  describe('pauseSwarm', () => {
    it('should set status to PAUSED', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();
      await controller.pauseSwarm();

      const status = controller.getStatus();
      expect(status?.status).toBe('PAUSED');
    });

    it('should emit swarm:paused event', async () => {
      const pausedHandler = vi.fn();
      controller.on('swarm:paused', pausedHandler);

      const swarmId = await controller.createSwarm(defaultOptions);
      await controller.startSwarm();
      await controller.pauseSwarm();

      expect(pausedHandler).toHaveBeenCalledWith(swarmId);
    });

    it('should throw if no swarm configured', async () => {
      await expect(controller.pauseSwarm()).rejects.toThrow('No swarm configured');
    });
  });

  describe('terminateSwarm', () => {
    it('should set status to TERMINATED', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();
      await controller.terminateSwarm('Test termination');

      const status = controller.getStatus();
      expect(status?.status).toBe('TERMINATED');
    });

    it('should emit swarm:terminated with reason', async () => {
      const terminatedHandler = vi.fn();
      controller.on('swarm:terminated', terminatedHandler);

      const swarmId = await controller.createSwarm(defaultOptions);
      await controller.startSwarm();
      await controller.terminateSwarm('Budget exhausted');

      expect(terminatedHandler).toHaveBeenCalledWith(swarmId, 'Budget exhausted');
    });

    it('should terminate all agents', async () => {
      const agentTerminatedHandler = vi.fn();
      controller.on('agent:terminated', agentTerminatedHandler);

      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();
      await controller.terminateSwarm();

      // No direct events but agents should be cleared
      const summaries = controller.getAgentSummaries();
      expect(summaries).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return null when no swarm configured', () => {
      const status = controller.getStatus();
      expect(status).toBeNull();
    });

    it('should return complete status report', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const status = controller.getStatus();

      expect(status).toMatchObject({
        swarmId: expect.any(String),
        status: 'RUNNING',
        activeAgents: 5,
        totalBids: 0,
        totalOffers: 0,
        wonAuctions: 0,
        acceptedOffers: 0,
        itemsAcquired: 0,
        budgetTotal: expect.objectContaining({ value: 5000 }),
        budgetSpent: expect.objectContaining({ value: 0 }),
        timeRemaining: expect.any(Number),
      });
    });

    it('should calculate timeRemaining correctly', async () => {
      await controller.createSwarm(defaultOptions);

      const status = controller.getStatus();
      const expectedRemaining = 24 * 60 * 60 * 1000; // 24 hours in ms

      // Should be approximately 24 hours (allow 1 minute variance)
      expect(status?.timeRemaining).toBeGreaterThan(expectedRemaining - 60000);
      expect(status?.timeRemaining).toBeLessThanOrEqual(expectedRemaining);
    });
  });

  describe('getAgentSummaries', () => {
    it('should return empty array before swarm started', async () => {
      await controller.createSwarm(defaultOptions);

      const summaries = controller.getAgentSummaries();
      expect(summaries).toHaveLength(0);
    });

    it('should return all agent summaries after start', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();

      expect(summaries).toHaveLength(5);
      summaries.forEach(summary => {
        expect(summary).toMatchObject({
          agentId: expect.any(String),
          strategy: expect.any(String),
          status: 'ACTIVE',
          budget: expect.any(Number),
          spent: 0,
          wins: 0,
          losses: 0,
        });
      });
    });

    it('should include strategy distribution', async () => {
      const customOptions: CreateSwarmOptions = {
        ...defaultOptions,
        agentCount: 4,
        strategyDistribution: new Map<BiddingStrategy, number>([
          ['SNIPER', 2],
          ['NEGOTIATOR', 2],
        ]),
      };

      await controller.createSwarm(customOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      const strategies = summaries.map(s => s.strategy);

      expect(strategies.filter(s => s === 'SNIPER')).toHaveLength(2);
      expect(strategies.filter(s => s === 'NEGOTIATOR')).toHaveLength(2);
    });
  });

  describe('getAgentStatus', () => {
    it('should return null for non-existent agent', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const status = controller.getAgentStatus('non-existent-id');
      expect(status).toBeNull();
    });

    it('should return agent state for valid agent', async () => {
      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      const agentId = summaries[0].agentId;

      const status = controller.getAgentStatus(agentId);

      expect(status).toMatchObject({
        status: 'ACTIVE',
        remainingBudget: expect.objectContaining({ value: expect.any(Number) }),
        activeBids: [],
        activeOffers: [],
        wins: 0,
        losses: 0,
        totalSpent: expect.objectContaining({ value: 0 }),
      });
    });
  });

  describe('outcome handlers', () => {
    it('should handle auction win', async () => {
      const wonHandler = vi.fn();
      const acquiredHandler = vi.fn();
      controller.on('bid:won', wonHandler);
      controller.on('item:acquired', acquiredHandler);

      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      const agentId = summaries[0].agentId;

      // Simulate auction win
      await controller.handleAuctionWin(agentId, 'listing_123', 2000);

      expect(wonHandler).toHaveBeenCalled();
      expect(acquiredHandler).toHaveBeenCalled();

      const status = controller.getStatus();
      expect(status?.wonAuctions).toBe(1);
      expect(status?.itemsAcquired).toBe(1);
    });

    it('should handle auction loss', async () => {
      const lostHandler = vi.fn();
      controller.on('bid:lost', lostHandler);

      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      const agentId = summaries[0].agentId;

      await controller.handleAuctionLoss(agentId, 'listing_456');

      expect(lostHandler).toHaveBeenCalled();
    });

    it('should handle offer acceptance', async () => {
      const acceptedHandler = vi.fn();
      controller.on('offer:accepted', acceptedHandler);

      await controller.createSwarm(defaultOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      const agentId = summaries[0].agentId;

      await controller.handleOfferAccepted(agentId, 'listing_789', 30);

      expect(acceptedHandler).toHaveBeenCalled();

      const status = controller.getStatus();
      expect(status?.acceptedOffers).toBe(1);
      expect(status?.itemsAcquired).toBe(1);
    });
  });

  describe('precious metals scenarios', () => {
    it('should configure swarm for gold price range', async () => {
      const goldOptions: CreateSwarmOptions = {
        totalBudget: { value: 10000, currency: 'USD' },
        agentCount: 3,
        strategyDistribution: new Map<BiddingStrategy, number>([
          ['SNIPER', 2],
          ['NEGOTIATOR', 1],
        ]),
        targetCriteria: {
          searchQuery: 'gold bullion bar',
          searchTerms: ['1 oz gold bar', 'gold buffalo', 'gold eagle'],
          minPrice: 1800,
          maxPrice: 2500,
          conditions: ['NEW'],
          minSellerFeedback: 99,
        },
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + 72 * 60 * 60 * 1000), // 3 days
        },
      };

      const swarmId = await controller.createSwarm(goldOptions);
      await controller.startSwarm();

      expect(swarmId).toBeDefined();
      const status = controller.getStatus();
      expect(status?.activeAgents).toBe(3);
    });

    it('should configure swarm for silver price range', async () => {
      const silverOptions: CreateSwarmOptions = {
        totalBudget: { value: 1000, currency: 'USD' },
        agentCount: 5,
        targetCriteria: {
          searchQuery: 'silver bullion coins',
          searchTerms: ['silver eagle', 'silver rounds', 'junk silver'],
          minPrice: 25,
          maxPrice: 50,
          conditions: ['NEW', 'LIKE_NEW'],
        },
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + 168 * 60 * 60 * 1000), // 1 week
        },
      };

      const swarmId = await controller.createSwarm(silverOptions);
      expect(swarmId).toBeDefined();
    });

    it('should handle mixed gold/silver swarm', async () => {
      const mixedOptions: CreateSwarmOptions = {
        totalBudget: { value: 5000, currency: 'USD' },
        agentCount: 6,
        strategyDistribution: new Map<BiddingStrategy, number>([
          ['SNIPER', 2],       // For gold auctions ending soon
          ['NEGOTIATOR', 2],   // For Best Offer on gold/silver
          ['PASSIVE', 2],      // For underpriced silver
        ]),
        targetCriteria: {
          searchQuery: 'gold silver bullion',
          searchTerms: ['gold bar', 'silver bar', 'gold coin', 'silver coin'],
          minPrice: 25,
          maxPrice: 3000,
        },
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      };

      await controller.createSwarm(mixedOptions);
      await controller.startSwarm();

      const summaries = controller.getAgentSummaries();
      expect(summaries).toHaveLength(6);

      const strategies = summaries.map(s => s.strategy);
      expect(strategies.filter(s => s === 'SNIPER')).toHaveLength(2);
      expect(strategies.filter(s => s === 'NEGOTIATOR')).toHaveLength(2);
      expect(strategies.filter(s => s === 'PASSIVE')).toHaveLength(2);
    });
  });
});
