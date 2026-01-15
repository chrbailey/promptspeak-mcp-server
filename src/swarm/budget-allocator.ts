/**
 * Budget Allocator
 *
 * Manages budget distribution across swarm agents.
 * Enforces hard limits and provides reallocation capabilities.
 *
 * Key principles:
 * - Total allocations never exceed swarm budget
 * - Fee reserve maintained for eBay fees
 * - Agents cannot exceed their individual allocation
 * - Supports dynamic reallocation based on performance
 */

import type {
  MonetaryBudget,
  MarketAgentConfig,
  SwarmConfig,
  BiddingStrategy,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Budget allocation for a single agent.
 */
export interface AgentAllocation {
  agentId: string;
  allocated: MonetaryBudget;
  spent: MonetaryBudget;
  reserved: MonetaryBudget; // Currently tied up in pending bids/offers
  available: MonetaryBudget;
}

/**
 * Overall budget status for the swarm.
 */
export interface SwarmBudgetStatus {
  total: MonetaryBudget;
  allocated: MonetaryBudget;
  spent: MonetaryBudget;
  reserved: MonetaryBudget;
  available: MonetaryBudget;
  feeReserve: MonetaryBudget;
  agentAllocations: AgentAllocation[];
}

/**
 * Allocation strategy options.
 */
export type AllocationStrategy =
  | 'EQUAL'           // Equal split across all agents
  | 'WEIGHTED'        // Based on strategy effectiveness
  | 'PERFORMANCE'     // Based on agent performance metrics
  | 'CUSTOM';         // Manual allocation

/**
 * Allocation request.
 */
export interface AllocationRequest {
  agentId: string;
  strategy: BiddingStrategy;
  requestedAmount?: number;
  priority?: number; // 1-10, higher = more allocation
}

/**
 * Reallocation result.
 */
export interface ReallocationResult {
  success: boolean;
  fromAgentId: string;
  toAgentId: string;
  amount: number;
  newFromAllocation: number;
  newToAllocation: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGET ALLOCATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class BudgetAllocator {
  private totalBudget: MonetaryBudget;
  private feeReservePercent: number;
  private allocations: Map<string, AgentAllocation> = new Map();
  private currency: string;

  constructor(config: SwarmConfig) {
    this.totalBudget = { ...config.totalBudget };
    this.feeReservePercent = config.feeReservePercent ?? 5;
    this.currency = config.totalBudget.currency;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize allocations for a set of agents.
   */
  initializeAllocations(
    requests: AllocationRequest[],
    strategy: AllocationStrategy = 'EQUAL'
  ): AgentAllocation[] {
    // Calculate available budget (total - fee reserve)
    const feeReserve = this.totalBudget.value * (this.feeReservePercent / 100);
    const availableForAllocation = this.totalBudget.value - feeReserve;

    // Clear existing allocations
    this.allocations.clear();

    let allocations: number[];

    switch (strategy) {
      case 'EQUAL':
        allocations = this.calculateEqualAllocations(requests.length, availableForAllocation);
        break;

      case 'WEIGHTED':
        allocations = this.calculateWeightedAllocations(requests, availableForAllocation);
        break;

      case 'PERFORMANCE':
        // Performance-based starts as equal, adjusted over time
        allocations = this.calculateEqualAllocations(requests.length, availableForAllocation);
        break;

      case 'CUSTOM':
        allocations = this.calculateCustomAllocations(requests, availableForAllocation);
        break;

      default:
        allocations = this.calculateEqualAllocations(requests.length, availableForAllocation);
    }

    // Create allocations
    const result: AgentAllocation[] = [];

    requests.forEach((request, index) => {
      const allocation: AgentAllocation = {
        agentId: request.agentId,
        allocated: { value: allocations[index], currency: this.currency },
        spent: { value: 0, currency: this.currency },
        reserved: { value: 0, currency: this.currency },
        available: { value: allocations[index], currency: this.currency },
      };

      this.allocations.set(request.agentId, allocation);
      result.push(allocation);
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLOCATION CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate equal allocations.
   */
  private calculateEqualAllocations(agentCount: number, available: number): number[] {
    const perAgent = Math.floor((available / agentCount) * 100) / 100; // Round down to cents
    return Array(agentCount).fill(perAgent);
  }

  /**
   * Calculate weighted allocations based on strategy type.
   */
  private calculateWeightedAllocations(
    requests: AllocationRequest[],
    available: number
  ): number[] {
    // Strategy weights (higher = more allocation)
    const strategyWeights: Record<BiddingStrategy, number> = {
      'HYBRID': 1.2,          // Most flexible
      'NEGOTIATOR': 1.1,      // Can get discounts
      'SNIPER': 1.0,          // Standard
      'EARLY_AGGRESSIVE': 0.9, // May overpay
      'PASSIVE': 0.8,         // Low activity
    };

    // Calculate total weight
    let totalWeight = 0;
    const weights: number[] = requests.map(req => {
      const strategyWeight = strategyWeights[req.strategy] ?? 1.0;
      const priorityMultiplier = req.priority ? (0.5 + req.priority * 0.1) : 1.0;
      const weight = strategyWeight * priorityMultiplier;
      totalWeight += weight;
      return weight;
    });

    // Allocate proportionally
    return weights.map(w => Math.floor((w / totalWeight) * available * 100) / 100);
  }

  /**
   * Calculate custom allocations from requested amounts.
   */
  private calculateCustomAllocations(
    requests: AllocationRequest[],
    available: number
  ): number[] {
    // Sum requested amounts
    let totalRequested = 0;
    const requested = requests.map(req => {
      const amount = req.requestedAmount ?? 0;
      totalRequested += amount;
      return amount;
    });

    // If requests exceed available, scale down proportionally
    if (totalRequested > available) {
      const scaleFactor = available / totalRequested;
      return requested.map(r => Math.floor(r * scaleFactor * 100) / 100);
    }

    // If requests are less than available, distribute remainder equally
    const remainder = available - totalRequested;
    const perAgent = Math.floor((remainder / requests.length) * 100) / 100;

    return requested.map(r => r + perAgent);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUDGET OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an agent can make a purchase.
   */
  canAfford(agentId: string, amount: number): boolean {
    const allocation = this.allocations.get(agentId);
    if (!allocation) return false;
    return allocation.available.value >= amount;
  }

  /**
   * Reserve funds for a pending bid/offer.
   */
  reserveFunds(agentId: string, amount: number): boolean {
    const allocation = this.allocations.get(agentId);
    if (!allocation || allocation.available.value < amount) {
      return false;
    }

    allocation.reserved.value += amount;
    allocation.available.value -= amount;
    return true;
  }

  /**
   * Release reserved funds (bid lost or offer declined).
   */
  releaseFunds(agentId: string, amount: number): boolean {
    const allocation = this.allocations.get(agentId);
    if (!allocation) return false;

    // Release from reserved back to available
    const releaseAmount = Math.min(amount, allocation.reserved.value);
    allocation.reserved.value -= releaseAmount;
    allocation.available.value += releaseAmount;
    return true;
  }

  /**
   * Record a completed purchase.
   */
  recordPurchase(agentId: string, amount: number, wasReserved: boolean = true): boolean {
    const allocation = this.allocations.get(agentId);
    if (!allocation) return false;

    if (wasReserved) {
      // Move from reserved to spent
      if (allocation.reserved.value < amount) return false;
      allocation.reserved.value -= amount;
    } else {
      // Direct purchase from available
      if (allocation.available.value < amount) return false;
      allocation.available.value -= amount;
    }

    allocation.spent.value += amount;
    return true;
  }

  /**
   * Reallocate funds from one agent to another.
   */
  reallocate(fromAgentId: string, toAgentId: string, amount: number): ReallocationResult {
    const fromAllocation = this.allocations.get(fromAgentId);
    const toAllocation = this.allocations.get(toAgentId);

    if (!fromAllocation) {
      return {
        success: false,
        fromAgentId,
        toAgentId,
        amount,
        newFromAllocation: 0,
        newToAllocation: 0,
        error: `Source agent ${fromAgentId} not found`,
      };
    }

    if (!toAllocation) {
      return {
        success: false,
        fromAgentId,
        toAgentId,
        amount,
        newFromAllocation: fromAllocation.available.value,
        newToAllocation: 0,
        error: `Target agent ${toAgentId} not found`,
      };
    }

    // Can only reallocate available funds (not reserved or spent)
    if (fromAllocation.available.value < amount) {
      return {
        success: false,
        fromAgentId,
        toAgentId,
        amount,
        newFromAllocation: fromAllocation.available.value,
        newToAllocation: toAllocation.available.value,
        error: `Insufficient available funds: ${fromAllocation.available.value} < ${amount}`,
      };
    }

    // Perform reallocation
    fromAllocation.allocated.value -= amount;
    fromAllocation.available.value -= amount;
    toAllocation.allocated.value += amount;
    toAllocation.available.value += amount;

    return {
      success: true,
      fromAgentId,
      toAgentId,
      amount,
      newFromAllocation: fromAllocation.available.value,
      newToAllocation: toAllocation.available.value,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS & REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get allocation for a specific agent.
   */
  getAllocation(agentId: string): AgentAllocation | undefined {
    return this.allocations.get(agentId);
  }

  /**
   * Get overall swarm budget status.
   */
  getSwarmStatus(): SwarmBudgetStatus {
    let allocated = 0;
    let spent = 0;
    let reserved = 0;
    let available = 0;

    const agentAllocations = Array.from(this.allocations.values());

    for (const allocation of agentAllocations) {
      allocated += allocation.allocated.value;
      spent += allocation.spent.value;
      reserved += allocation.reserved.value;
      available += allocation.available.value;
    }

    const feeReserve = this.totalBudget.value * (this.feeReservePercent / 100);

    return {
      total: { ...this.totalBudget },
      allocated: { value: allocated, currency: this.currency },
      spent: { value: spent, currency: this.currency },
      reserved: { value: reserved, currency: this.currency },
      available: { value: available, currency: this.currency },
      feeReserve: { value: feeReserve, currency: this.currency },
      agentAllocations,
    };
  }

  /**
   * Get agents sorted by available budget (for reallocation candidates).
   */
  getAgentsByAvailable(ascending: boolean = true): AgentAllocation[] {
    const allocations = Array.from(this.allocations.values());
    return allocations.sort((a, b) =>
      ascending
        ? a.available.value - b.available.value
        : b.available.value - a.available.value
    );
  }

  /**
   * Get agents sorted by spent (for performance analysis).
   */
  getAgentsBySpent(ascending: boolean = false): AgentAllocation[] {
    const allocations = Array.from(this.allocations.values());
    return allocations.sort((a, b) =>
      ascending
        ? a.spent.value - b.spent.value
        : b.spent.value - a.spent.value
    );
  }

  /**
   * Get agent efficiency (spent / allocated ratio).
   */
  getAgentEfficiency(agentId: string): number {
    const allocation = this.allocations.get(agentId);
    if (!allocation || allocation.allocated.value === 0) return 0;
    return allocation.spent.value / allocation.allocated.value;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE-BASED REALLOCATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Automatically reallocate from underperforming to high-performing agents.
   *
   * @param performanceScores Map of agentId -> performance score (0-1)
   * @param threshold Minimum performance to keep full allocation
   * @param maxReallocationPercent Maximum % of budget to reallocate at once
   */
  performanceBasedReallocation(
    performanceScores: Map<string, number>,
    threshold: number = 0.3,
    maxReallocationPercent: number = 20
  ): ReallocationResult[] {
    const results: ReallocationResult[] = [];

    // Sort agents by performance
    const sortedAgents = Array.from(this.allocations.entries())
      .map(([agentId, allocation]) => ({
        agentId,
        allocation,
        score: performanceScores.get(agentId) ?? 0.5,
      }))
      .sort((a, b) => b.score - a.score);

    // Find donors (low performers with available funds) and recipients (high performers)
    const donors = sortedAgents.filter(a => a.score < threshold && a.allocation.available.value > 0);
    const recipients = sortedAgents.filter(a => a.score >= threshold);

    if (donors.length === 0 || recipients.length === 0) {
      return results;
    }

    // Calculate total available for reallocation
    let availableForReallocation = 0;
    for (const donor of donors) {
      const maxFromDonor = donor.allocation.allocated.value * (maxReallocationPercent / 100);
      const actualFromDonor = Math.min(maxFromDonor, donor.allocation.available.value);
      availableForReallocation += actualFromDonor;
    }

    // Distribute to recipients based on their relative performance
    const totalRecipientScore = recipients.reduce((sum, r) => sum + r.score, 0);

    for (const recipient of recipients) {
      const recipientShare = (recipient.score / totalRecipientScore) * availableForReallocation;

      // Take from donors until share is fulfilled
      let remaining = recipientShare;

      for (const donor of donors) {
        if (remaining <= 0) break;

        const maxFromDonor = donor.allocation.allocated.value * (maxReallocationPercent / 100);
        const actualFromDonor = Math.min(
          maxFromDonor,
          donor.allocation.available.value,
          remaining
        );

        if (actualFromDonor > 0) {
          const result = this.reallocate(donor.agentId, recipient.agentId, actualFromDonor);
          results.push(result);
          remaining -= actualFromDonor;
        }
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export state for persistence.
   */
  exportState(): {
    totalBudget: MonetaryBudget;
    feeReservePercent: number;
    allocations: AgentAllocation[];
  } {
    return {
      totalBudget: { ...this.totalBudget },
      feeReservePercent: this.feeReservePercent,
      allocations: Array.from(this.allocations.values()),
    };
  }

  /**
   * Import state from persistence.
   */
  importState(state: {
    totalBudget: MonetaryBudget;
    feeReservePercent: number;
    allocations: AgentAllocation[];
  }): void {
    this.totalBudget = { ...state.totalBudget };
    this.feeReservePercent = state.feeReservePercent;
    this.currency = state.totalBudget.currency;

    this.allocations.clear();
    for (const allocation of state.allocations) {
      this.allocations.set(allocation.agentId, { ...allocation });
    }
  }
}
