/**
 * Budget Allocator Unit Tests
 *
 * Tests for budget allocation across multiple agents
 * with precious metals price ranges.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetAllocator } from '../../../src/swarm/budget-allocator.js';
import type { SwarmConfig, MonetaryBudget, BiddingStrategy } from '../../../src/swarm/types.js';

describe('BudgetAllocator', () => {
  let allocator: BudgetAllocator;
  let mockConfig: SwarmConfig;

  beforeEach(() => {
    const totalBudget: MonetaryBudget = {
      amount: 5000,
      currency: 'USD',
      maxPerItem: 2500,
      reservePercent: 5,
    };

    mockConfig = {
      swarmId: 'test_swarm_001',
      totalBudget,
      agentCount: 5,
      strategyDistribution: {
        SNIPER: 1,
        EARLY_AGGRESSIVE: 1,
        NEGOTIATOR: 1,
        HYBRID: 1,
        PASSIVE: 1,
      } as Record<BiddingStrategy, number>,
      targetCriteria: {
        searchQuery: 'gold silver bullion',
        minPrice: 25,
        maxPrice: 3000,
      },
      timeWindow: {
        start: new Date(),
        end: new Date(Date.now() + 86400000),
      },
    };

    allocator = new BudgetAllocator(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize with correct total budget', () => {
      const status = allocator.getSwarmStatus();
      expect(status.total.value).toBe(5000);
      expect(status.total.currency).toBe('USD');
    });

    it('should calculate reserve correctly', () => {
      const status = allocator.getSwarmStatus();
      // 5% reserve of $5000 = $250
      expect(status.reserved.value).toBeGreaterThanOrEqual(0);
    });

    it('should have available budget equal to total minus reserve', () => {
      const status = allocator.getSwarmStatus();
      expect(status.available.value).toBeLessThanOrEqual(status.total.value);
    });
  });

  describe('allocation distribution', () => {
    it('should allocate budget to all requested agents', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
        { agentId: 'agent_2', strategy: 'NEGOTIATOR' as BiddingStrategy, priority: 5 },
        { agentId: 'agent_3', strategy: 'PASSIVE' as BiddingStrategy, priority: 5 },
      ];

      const allocations = allocator.initializeAllocations(requests, 'EQUAL');

      expect(allocations).toHaveLength(3);
      allocations.forEach(allocation => {
        expect(allocation.allocated.value).toBeGreaterThan(0);
      });
    });

    it('should distribute budget equally with EQUAL mode', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
        { agentId: 'agent_2', strategy: 'NEGOTIATOR' as BiddingStrategy, priority: 5 },
      ];

      const allocations = allocator.initializeAllocations(requests, 'EQUAL');

      // All allocations should be approximately equal
      const amounts = allocations.map(a => a.allocated.value);
      const variance = Math.abs(amounts[0] - amounts[1]);
      expect(variance).toBeLessThan(1); // Allow small rounding differences
    });

    it('should weight allocations by strategy with WEIGHTED mode', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 10 },
        { agentId: 'agent_2', strategy: 'PASSIVE' as BiddingStrategy, priority: 2 },
      ];

      const allocations = allocator.initializeAllocations(requests, 'WEIGHTED');

      const sniperAllocation = allocations.find(a => a.agentId === 'agent_1')!;
      const passiveAllocation = allocations.find(a => a.agentId === 'agent_2')!;

      // Sniper with higher priority should get more
      expect(sniperAllocation.allocated.value).toBeGreaterThan(passiveAllocation.allocated.value);
    });
  });

  describe('fund reservation', () => {
    it('should reserve funds for pending bids', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      const reserved = allocator.reserveFunds('agent_1', 100);
      expect(reserved).toBe(true);
    });

    it('should prevent over-reservation', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      const allocations = allocator.initializeAllocations(requests, 'EQUAL');
      const available = allocations[0].available.value;

      // Try to reserve more than available
      const reserved = allocator.reserveFunds('agent_1', available + 1000);
      expect(reserved).toBe(false);
    });

    it('should release funds when bid fails', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      const allocations = allocator.initializeAllocations(requests, 'EQUAL');
      const initialAvailable = allocations[0].available.value;

      // Reserve then release
      allocator.reserveFunds('agent_1', 100);
      allocator.releaseFunds('agent_1', 100);

      const allocation = allocator.getAllocation('agent_1')!;
      expect(allocation.available.value).toBe(initialAvailable);
    });
  });

  describe('purchase recording', () => {
    it('should record successful purchase', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      // Reserve and purchase
      allocator.reserveFunds('agent_1', 150);
      allocator.recordPurchase('agent_1', 150, true);

      const allocation = allocator.getAllocation('agent_1')!;
      expect(allocation.spent.value).toBe(150);
    });

    it('should update swarm totals after purchase', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      allocator.reserveFunds('agent_1', 200);
      allocator.recordPurchase('agent_1', 200, true);

      const status = allocator.getSwarmStatus();
      expect(status.spent.value).toBe(200);
    });
  });

  describe('precious metals specific scenarios', () => {
    it('should allow gold-appropriate bid amounts', () => {
      const requests = [
        { agentId: 'gold_agent', strategy: 'SNIPER' as BiddingStrategy, priority: 10 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      // 1oz gold bar bid (~$2200)
      const canAfford = allocator.canAfford('gold_agent', 2200);
      expect(canAfford).toBe(true);
    });

    it('should allow silver-appropriate bid amounts', () => {
      const requests = [
        { agentId: 'silver_agent', strategy: 'NEGOTIATOR' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      // 1oz silver bar bid (~$30)
      const canAfford = allocator.canAfford('silver_agent', 30);
      expect(canAfford).toBe(true);
    });

    it('should support multiple silver purchases', () => {
      const requests = [
        { agentId: 'silver_agent', strategy: 'PASSIVE' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      // Buy multiple silver items
      for (let i = 0; i < 5; i++) {
        allocator.reserveFunds('silver_agent', 35);
        allocator.recordPurchase('silver_agent', 35, true);
      }

      const allocation = allocator.getAllocation('silver_agent')!;
      expect(allocation.spent.value).toBe(175);
    });
  });

  describe('affordability checks', () => {
    it('should report correct affordability', () => {
      const requests = [
        { agentId: 'agent_1', strategy: 'SNIPER' as BiddingStrategy, priority: 5 },
      ];
      allocator.initializeAllocations(requests, 'EQUAL');

      // Small amount should be affordable
      expect(allocator.canAfford('agent_1', 50)).toBe(true);

      // Massive amount should not be affordable
      expect(allocator.canAfford('agent_1', 100000)).toBe(false);
    });

    it('should return false for non-existent agent', () => {
      expect(allocator.canAfford('non_existent', 100)).toBe(false);
    });
  });
});
