// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════
// The Circuit Breaker halts agents when drift thresholds are exceeded.
// Implements three states: closed (normal), open (blocked), half-open (testing).
// ═══════════════════════════════════════════════════════════════════════════

import type { CircuitBreakerState, DriftAlert } from '../types/index.js';
import { generateAlertId } from '../utils/hash.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening
  successThreshold: number;     // Number of successes to close from half-open
  timeout: number;              // Time in ms before moving to half-open
  driftScoreThreshold: number;  // Drift score that triggers circuit break
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 60000, // 1 minute
  driftScoreThreshold: 0.25,
};

export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;
  private alerts: DriftAlert[] = [];
  private enabled: boolean = true;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enable or disable the circuit breaker.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the current state for an agent.
   */
  getState(agentId: string): CircuitBreakerState {
    if (!this.states.has(agentId)) {
      this.states.set(agentId, {
        agentId,
        state: 'closed',
        failureCount: 0,
        successCount: 0,
      });
    }
    return this.states.get(agentId)!;
  }

  /**
   * Check if an agent is allowed to execute.
   */
  isAllowed(agentId: string): boolean {
    if (!this.enabled) return true;

    const state = this.getState(agentId);

    switch (state.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if timeout has passed
        if (state.openedAt && Date.now() - state.openedAt > this.config.timeout) {
          // Move to half-open
          state.state = 'half-open';
          state.successCount = 0;
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful operation.
   */
  recordSuccess(agentId: string): void {
    if (!this.enabled) return;

    const state = this.getState(agentId);

    switch (state.state) {
      case 'closed':
        // Reset failure count on success
        state.failureCount = 0;
        state.successCount++;
        break;

      case 'half-open':
        state.successCount++;
        if (state.successCount >= this.config.successThreshold) {
          // Close the circuit
          state.state = 'closed';
          state.failureCount = 0;
          state.openedAt = undefined;
          state.lastFailure = undefined;
          state.reason = undefined;
        }
        break;

      case 'open':
        // Ignore successes when open (shouldn't happen)
        break;
    }
  }

  /**
   * Record a failure.
   */
  recordFailure(agentId: string, reason: string): void {
    if (!this.enabled) return;

    const state = this.getState(agentId);
    state.failureCount++;
    state.lastFailure = reason;

    switch (state.state) {
      case 'closed':
        if (state.failureCount >= this.config.failureThreshold) {
          this.openCircuit(agentId, reason);
        }
        break;

      case 'half-open':
        // Any failure in half-open opens the circuit again
        this.openCircuit(agentId, reason);
        break;

      case 'open':
        // Already open, update timestamp
        state.openedAt = Date.now();
        break;
    }
  }

  /**
   * Record drift detection.
   */
  recordDrift(agentId: string, driftScore: number, details: string): void {
    if (!this.enabled) return;

    if (driftScore >= this.config.driftScoreThreshold) {
      this.openCircuit(agentId, `Drift threshold exceeded: ${(driftScore * 100).toFixed(1)}% - ${details}`);

      // Create alert
      this.alerts.push({
        alertId: generateAlertId(),
        agentId,
        type: 'semantic_erosion',
        severity: driftScore > 0.5 ? 'critical' : driftScore > 0.35 ? 'high' : 'medium',
        message: `Drift score ${(driftScore * 100).toFixed(1)}% exceeds threshold ${(this.config.driftScoreThreshold * 100).toFixed(1)}%`,
        detectedAt: Date.now(),
        evidence: {
          driftScore,
          threshold: this.config.driftScoreThreshold,
          details,
        },
      });
    }
  }

  /**
   * Manually open the circuit for an agent.
   */
  openCircuit(agentId: string, reason: string): void {
    const state = this.getState(agentId);
    state.state = 'open';
    state.openedAt = Date.now();
    state.reason = reason;
    state.successCount = 0;
  }

  /**
   * Manually close the circuit for an agent.
   */
  closeCircuit(agentId: string): void {
    const state = this.getState(agentId);
    state.state = 'closed';
    state.failureCount = 0;
    state.successCount = 0;
    state.openedAt = undefined;
    state.lastFailure = undefined;
    state.reason = undefined;
  }

  /**
   * Manually set to half-open for testing.
   */
  halfOpenCircuit(agentId: string): void {
    const state = this.getState(agentId);
    state.state = 'half-open';
    state.successCount = 0;
  }

  /**
   * Get all agents with open circuits.
   */
  getOpenCircuits(): CircuitBreakerState[] {
    return Array.from(this.states.values()).filter(s => s.state === 'open');
  }

  /**
   * Get all circuit states.
   */
  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get alerts.
   */
  getAlerts(limit: number = 100): DriftAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get alerts for an agent.
   */
  getAgentAlerts(agentId: string, limit: number = 100): DriftAlert[] {
    return this.alerts
      .filter(a => a.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Clear an agent's state.
   */
  clearAgent(agentId: string): void {
    this.states.delete(agentId);
  }

  /**
   * Clear all states.
   */
  clearAll(): void {
    this.states.clear();
    this.alerts = [];
  }

  /**
   * Get circuit breaker statistics.
   */
  getStats(): {
    totalAgents: number;
    closedCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    totalAlerts: number;
    criticalAlerts: number;
  } {
    const states = Array.from(this.states.values());

    return {
      totalAgents: states.length,
      closedCircuits: states.filter(s => s.state === 'closed').length,
      openCircuits: states.filter(s => s.state === 'open').length,
      halfOpenCircuits: states.filter(s => s.state === 'half-open').length,
      totalAlerts: this.alerts.length,
      criticalAlerts: this.alerts.filter(a => a.severity === 'critical').length,
    };
  }
}

// Singleton instance
export const circuitBreaker = new CircuitBreaker();
