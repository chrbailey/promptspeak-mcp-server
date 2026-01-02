// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - DRIFT DETECTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════
// The Drift Detection Engine monitors agent behavior over time to detect:
// - Semantic erosion (gradual meaning shift)
// - Emergent protocols (agents developing private communication)
// - Goal displacement (optimizing for wrong metrics)
// - Pattern lock-in (over-reliance on specific patterns)
// ═══════════════════════════════════════════════════════════════════════════

export { BaselineStore, baselineStore } from './baseline.js';
export { TripwireInjector, tripwireInjector } from './tripwire.js';
export { CircuitBreaker, circuitBreaker } from './circuit-breaker.js';
export { ContinuousMonitor } from './monitor.js';

import { BaselineStore } from './baseline.js';
import { TripwireInjector } from './tripwire.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ContinuousMonitor } from './monitor.js';

// Create integrated drift detection engine
export class DriftDetectionEngine {
  public baselineStore: BaselineStore;
  public tripwireInjector: TripwireInjector;
  public circuitBreaker: CircuitBreaker;
  public monitor: ContinuousMonitor;

  constructor() {
    this.baselineStore = new BaselineStore();
    this.tripwireInjector = new TripwireInjector();
    this.circuitBreaker = new CircuitBreaker();
    this.monitor = new ContinuousMonitor(
      this.baselineStore,
      this.tripwireInjector,
      this.circuitBreaker
    );
  }

  /**
   * Enable or disable the entire drift detection system.
   */
  setEnabled(enabled: boolean): void {
    this.tripwireInjector.setEnabled(enabled);
    this.circuitBreaker.setEnabled(enabled);
    this.monitor.setEnabled(enabled);
  }

  /**
   * Get comprehensive drift status for an agent.
   */
  getAgentStatus(agentId: string) {
    return {
      ...this.monitor.getDriftStatus(agentId),
      baselines: this.baselineStore.getAgentBaselines(agentId).length,
      tripwireFailureRate: this.tripwireInjector.getFailureRate(agentId),
      circuitBreakerAlerts: this.circuitBreaker.getAgentAlerts(agentId),
    };
  }

  /**
   * Get system-wide statistics.
   */
  getSystemStats() {
    return {
      tripwires: this.tripwireInjector.getStats(),
      circuitBreakers: this.circuitBreaker.getStats(),
      baselines: this.baselineStore.getAllBaselines().length,
      agents: this.monitor.getAllMetrics().length,
    };
  }

  /**
   * Recalibrate an agent (reset to baseline).
   */
  recalibrateAgent(agentId: string): void {
    this.monitor.resetAgent(agentId);
    this.baselineStore.clearAgentBaselines(agentId);
    this.circuitBreaker.closeCircuit(agentId);
  }

  /**
   * Reset the entire system.
   */
  reset(): void {
    this.baselineStore.clearAll();
    this.tripwireInjector.clearResults();
    this.circuitBreaker.clearAll();
    this.monitor.clearAll();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // METHODS FOR PS_STATE TOOL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record an operation for drift tracking.
   * Returns a drift alert if threshold exceeded.
   */
  recordOperation(
    agentId: string,
    frame: string,
    action: string,
    success: boolean
  ): { type: string; message: string } | null {
    // Record with monitor
    this.monitor.recordOperation(agentId, frame, action, success);

    // Check drift status
    const status = this.monitor.getDriftStatus(agentId);

    // Record success/failure with circuit breaker
    if (success) {
      this.circuitBreaker.recordSuccess(agentId);
    } else {
      this.circuitBreaker.recordFailure(agentId, 'Operation failed');
    }

    // Check if drift threshold exceeded
    if (status.driftScore > 0.5) {
      this.circuitBreaker.recordDrift(agentId, status.driftScore, 'Threshold exceeded');
      return {
        type: 'DRIFT_DETECTED',
        message: `Drift score ${status.driftScore.toFixed(3)} exceeds threshold`
      };
    }

    return null;
  }

  /**
   * Get all agent IDs being tracked.
   */
  getAllAgentIds(): string[] {
    return this.monitor.getAllAgentIds();
  }

  /**
   * Get alerts for a specific agent.
   */
  getAgentAlerts(agentId: string): Array<{
    alertId: string;
    agentId: string;
    timestamp: number;
    type: string;
    severity: string;
    message: string;
  }> {
    const cbAlerts = this.circuitBreaker.getAgentAlerts(agentId);
    return cbAlerts.map(a => ({
      alertId: a.alertId,
      agentId: a.agentId,
      timestamp: a.detectedAt,
      type: a.type,
      severity: a.severity,
      message: a.message
    }));
  }

  /**
   * Reset circuit breaker for agent.
   */
  resetCircuitBreaker(agentId: string): void {
    this.circuitBreaker.closeCircuit(agentId);
  }

  /**
   * Reset drift metrics for agent.
   */
  resetDriftMetrics(agentId: string): void {
    this.monitor.resetAgent(agentId);
  }

  /**
   * Set baseline for an agent.
   */
  setBaseline(agentId: string, frame: string, expectedBehavior: string[]): void {
    // Create a minimal ParsedFrame for baseline recording
    const parsedFrame = {
      raw: frame,
      symbols: [...frame].map(s => ({
        symbol: s,
        category: 'unknown' as const,
        definition: { name: s, description: '', canonical: s, color: '', category: 'unknown' }
      })),
      mode: frame[0] || null,
      modifiers: [] as string[],
      domain: null,
      source: null,
      constraints: [] as string[],
      action: null,
      entity: null,
      metadata: {}
    };

    this.baselineStore.recordBaseline(
      parsedFrame as any,  // Type assertion for minimal frame
      'baseline',
      expectedBehavior,
      agentId
    );
  }

  /**
   * Halt an agent by opening circuit breaker.
   */
  haltAgent(agentId: string, reason: string): void {
    this.circuitBreaker.openCircuit(agentId, reason);
  }

  /**
   * Resume a halted agent.
   */
  resumeAgent(agentId: string): void {
    this.circuitBreaker.closeCircuit(agentId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONVENIENCE METHOD ALIASES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Alias for setBaseline - records a baseline for an agent.
   */
  recordBaseline(agentId: string, frame: string, expectedBehavior: string[]): void {
    this.setBaseline(agentId, frame, expectedBehavior);
  }

  /**
   * Alias for getAgentStatus - gets the current state of an agent.
   */
  getAgentState(agentId: string) {
    return this.getAgentStatus(agentId);
  }

  /**
   * Get circuit breaker status for an agent.
   * Returns the circuit breaker state information.
   */
  getCircuitBreakerStatus(agentId: string): {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    successCount: number;
    openedAt?: number;
    lastFailure?: string;
    reason?: string;
  } {
    const cbState = this.circuitBreaker.getState(agentId);
    return {
      state: cbState.state === 'closed' ? 'CLOSED' :
             cbState.state === 'open' ? 'OPEN' : 'HALF_OPEN',
      failureCount: cbState.failureCount,
      successCount: cbState.successCount,
      openedAt: cbState.openedAt,
      lastFailure: cbState.lastFailure,
      reason: cbState.reason,
    };
  }

  /**
   * Predict potential drift based on baseline comparison.
   * Returns a prediction based on comparing the frame and action against recorded baselines.
   */
  predictDrift(agentId: string, frame: string, action: string): {
    hasBaseline: boolean;
    predictedDriftScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
  } {
    const baseline = this.baselineStore.getBaseline(frame, agentId);
    const status = this.monitor.getDriftStatus(agentId);

    if (!baseline) {
      return {
        hasBaseline: false,
        predictedDriftScore: 0,
        riskLevel: 'low',
        recommendation: 'No baseline exists. Consider recording a baseline for this frame.',
      };
    }

    // Use current drift status as prediction basis
    const predictedScore = status.driftScore;
    const riskLevel: 'low' | 'medium' | 'high' | 'critical' =
      predictedScore > 0.5 ? 'critical' :
      predictedScore > 0.35 ? 'high' :
      predictedScore > 0.2 ? 'medium' : 'low';

    const recommendations: Record<typeof riskLevel, string> = {
      low: 'Drift is within acceptable bounds. Continue normal operation.',
      medium: 'Moderate drift detected. Monitor closely and consider recalibration.',
      high: 'High drift detected. Recommend immediate review and potential intervention.',
      critical: 'Critical drift level. Agent may require recalibration or halt.',
    };

    return {
      hasBaseline: true,
      predictedDriftScore: predictedScore,
      riskLevel,
      recommendation: recommendations[riskLevel],
    };
  }

  /**
   * Get drift history for an agent.
   */
  getDriftHistory(
    agentId: string,
    since?: number,
    limit?: number
  ): Array<{
    timestamp: number;
    driftScore: number;
    frame: string;
    action: string;
    alert?: { type: string; message: string };
  }> {
    return this.monitor.getDriftHistory(agentId, since, limit);
  }
}

// Singleton instance
export const driftEngine = new DriftDetectionEngine();
