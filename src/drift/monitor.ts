// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - CONTINUOUS MONITOR
// ═══════════════════════════════════════════════════════════════════════════
// The Monitor runs continuous checks for drift detection:
// - Periodic baseline tests
// - Tripwire injection
// - Cross-agent consistency checks
// - Temporal trend analysis
// ═══════════════════════════════════════════════════════════════════════════

import type { DriftMetrics, DriftAlert, ParsedFrame } from '../types/index.js';
import { BaselineStore } from './baseline.js';
import { TripwireInjector } from './tripwire.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { generateAlertId } from '../utils/hash.js';
import { calculateDriftScore, generateFrameEmbedding } from '../utils/embeddings.js';
import { FrameValidator } from '../gatekeeper/validator.js';
import { DynamicResolver } from '../gatekeeper/resolver.js';

export interface MonitorConfig {
  baselineTestInterval: number;  // ms between baseline tests
  tripwireRate: number;          // Probability of tripwire per operation
  embeddingWindowSize: number;   // Number of embeddings to track for trends
  driftThreshold: number;        // Drift score threshold for alerts
}

const DEFAULT_CONFIG: MonitorConfig = {
  baselineTestInterval: 60000, // 1 minute
  tripwireRate: 0.05,          // 5%
  embeddingWindowSize: 100,
  driftThreshold: 0.15,
};

export class ContinuousMonitor {
  private config: MonitorConfig;
  private baselineStore: BaselineStore;
  private tripwireInjector: TripwireInjector;
  private circuitBreaker: CircuitBreaker;

  // Validation components for proper frame validation
  private frameValidator: FrameValidator;
  private frameResolver: DynamicResolver;

  // Per-agent tracking
  private agentMetrics: Map<string, DriftMetrics> = new Map();
  private agentEmbeddings: Map<string, { embedding: number[]; timestamp: number }[]> = new Map();
  private lastBaselineTest: Map<string, number> = new Map();

  // Cross-agent tracking for emergent protocol detection
  private crossAgentBehavior: Map<string, Map<string, string[]>> = new Map(); // frame -> (sender -> behaviors)

  private enabled: boolean = true;

  constructor(
    baselineStore: BaselineStore,
    tripwireInjector: TripwireInjector,
    circuitBreaker: CircuitBreaker,
    config?: Partial<MonitorConfig>
  ) {
    this.baselineStore = baselineStore;
    this.tripwireInjector = tripwireInjector;
    this.circuitBreaker = circuitBreaker;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize validation components
    this.frameValidator = new FrameValidator();
    this.frameResolver = new DynamicResolver();
  }

  /**
   * Enable or disable monitoring.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Record an operation for an agent (simple version).
   * Used by DriftDetectionEngine.
   */
  recordOperation(
    agentId: string,
    frame: string | ParsedFrame,
    action: string | string[],
    success: boolean,
    senderId?: string
  ): DriftMetrics {
    // Handle string frame
    const parsedFrame: ParsedFrame = typeof frame === 'string'
      ? {
          raw: frame,
          symbols: [...frame].map(s => ({
            symbol: s,
            category: 'unknown' as const,
            definition: { name: s, canonical: s, color: '#888888', category: 'unknown' }
          })),
          mode: frame[0],
          modifiers: [],
          domain: null,
          source: null,
          constraints: [],
          action: null,
          entity: null,
          metadata: {}
        }
      : frame;

    // Handle string action
    const behavior = typeof action === 'string' ? [action] : action;

    return this._recordOperation(agentId, parsedFrame, behavior, success, senderId);
  }

  /**
   * Record an operation for an agent (full version).
   * This is called after every frame processing.
   */
  private _recordOperation(
    agentId: string,
    frame: ParsedFrame,
    behavior: string[],
    success: boolean,
    senderId?: string
  ): DriftMetrics {
    if (!this.enabled) {
      return this.getMetrics(agentId);
    }

    const metrics = this.getMetrics(agentId);
    const now = Date.now();

    // 1. Record embedding
    const embedding = generateFrameEmbedding(frame);
    this.recordEmbedding(agentId, embedding);

    // 2. Compare to baseline if available
    const baselineComparison = this.baselineStore.compareToBaseline(
      frame,
      frame.symbols.map(s => s.definition.name).join(' '),
      behavior,
      agentId
    );

    if (baselineComparison.hasBaseline) {
      if (baselineComparison.driftScore > this.config.driftThreshold) {
        this.recordDriftAlert(agentId, 'semantic_erosion', baselineComparison.driftScore, baselineComparison.details);
      }
    }

    // 3. Track cross-agent behavior for emergent protocol detection
    if (senderId) {
      this.recordCrossAgentBehavior(agentId, frame.raw, senderId, behavior);
    }

    // 4. Check if baseline test is due
    const lastTest = this.lastBaselineTest.get(agentId) || 0;
    if (now - lastTest > this.config.baselineTestInterval) {
      this.runBaselineTest(agentId);
    }

    // 5. Update metrics
    metrics.lastTestTimestamp = now;
    if (success) {
      metrics.testsPassed++;
    } else {
      metrics.testsFailed++;
    }

    // 6. Calculate current drift score from embedding trend
    metrics.currentDriftScore = this.calculateEmbeddingDrift(agentId);
    metrics.trend = this.calculateTrend(agentId);

    // 7. Record in circuit breaker
    if (success) {
      this.circuitBreaker.recordSuccess(agentId);
    } else {
      this.circuitBreaker.recordFailure(agentId, 'Operation failed');
    }

    // 8. Check drift threshold for circuit breaker
    if (metrics.currentDriftScore > this.config.driftThreshold) {
      this.circuitBreaker.recordDrift(
        agentId,
        metrics.currentDriftScore,
        `Trend: ${metrics.trend}`
      );
    }

    return metrics;
  }

  /**
   * Get metrics for an agent.
   */
  getMetrics(agentId: string): DriftMetrics {
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {
        agentId,
        currentDriftScore: 0,
        trend: 'stable',
        lastTestTimestamp: 0,
        testsPassed: 0,
        testsFailed: 0,
        tripwiresTriggered: 0,
        embeddingDistances: [],
        alerts: [],
      });
    }
    return this.agentMetrics.get(agentId)!;
  }

  /**
   * Record an embedding for trend tracking.
   */
  private recordEmbedding(agentId: string, embedding: number[]): void {
    if (!this.agentEmbeddings.has(agentId)) {
      this.agentEmbeddings.set(agentId, []);
    }

    const embeddings = this.agentEmbeddings.get(agentId)!;
    embeddings.push({ embedding, timestamp: Date.now() });

    // Keep only window size
    if (embeddings.length > this.config.embeddingWindowSize) {
      this.agentEmbeddings.set(agentId, embeddings.slice(-this.config.embeddingWindowSize));
    }
  }

  /**
   * Calculate drift from embedding trend.
   */
  private calculateEmbeddingDrift(agentId: string): number {
    const embeddings = this.agentEmbeddings.get(agentId) || [];
    if (embeddings.length < 2) return 0;

    // Compare recent embeddings to older ones
    const midpoint = Math.floor(embeddings.length / 2);
    const oldEmbeddings = embeddings.slice(0, midpoint);
    const newEmbeddings = embeddings.slice(midpoint);

    if (oldEmbeddings.length === 0 || newEmbeddings.length === 0) return 0;

    // Average drift between old and new
    let totalDrift = 0;
    for (const newEmb of newEmbeddings) {
      let minDrift = Infinity;
      for (const oldEmb of oldEmbeddings) {
        const drift = calculateDriftScore(oldEmb.embedding, newEmb.embedding);
        minDrift = Math.min(minDrift, drift);
      }
      totalDrift += minDrift;
    }

    return totalDrift / newEmbeddings.length;
  }

  /**
   * Calculate trend direction.
   */
  private calculateTrend(agentId: string): 'stable' | 'increasing' | 'decreasing' {
    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return 'stable';

    const distances = metrics.embeddingDistances;
    if (distances.length < 5) return 'stable';

    const recent = distances.slice(-5);
    const older = distances.slice(-10, -5);

    if (older.length < 5) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 0.02) return 'stable';
    return diff > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Record cross-agent behavior for emergent protocol detection.
   */
  private recordCrossAgentBehavior(
    agentId: string,
    frame: string,
    senderId: string,
    behavior: string[]
  ): void {
    const key = `${agentId}:${frame}`;

    if (!this.crossAgentBehavior.has(key)) {
      this.crossAgentBehavior.set(key, new Map());
    }

    const frameBehaviors = this.crossAgentBehavior.get(key)!;
    if (!frameBehaviors.has(senderId)) {
      frameBehaviors.set(senderId, []);
    }

    frameBehaviors.get(senderId)!.push(...behavior);

    // Check for emergent protocol (same frame, different behavior based on sender)
    this.checkEmergentProtocol(agentId, frame);
  }

  /**
   * Check for emergent protocol patterns.
   */
  private checkEmergentProtocol(agentId: string, frame: string): void {
    const key = `${agentId}:${frame}`;
    const frameBehaviors = this.crossAgentBehavior.get(key);

    if (!frameBehaviors || frameBehaviors.size < 2) return;

    // Compare behavior across senders
    const senders = Array.from(frameBehaviors.keys());
    const behaviors = senders.map(s => frameBehaviors.get(s)!.join(','));

    // If behaviors differ significantly between senders, flag emergent protocol
    const uniqueBehaviors = new Set(behaviors);
    if (uniqueBehaviors.size > 1 && frameBehaviors.size >= 3) {
      this.recordDriftAlert(
        agentId,
        'emergent_protocol',
        0.5, // High severity
        `Same frame "${frame}" produces different behavior based on sender`
      );
    }
  }

  /**
   * Run a baseline test for an agent.
   */
  runBaselineTest(agentId: string): void {
    this.lastBaselineTest.set(agentId, Date.now());

    // Run tripwire tests with actual frame validation
    const tripwireResult = this.tripwireInjector.runAllTests(
      agentId,
      (frame) => {
        // Parse the frame string into a ParsedFrame
        const parsed = this.frameResolver.parseFrame(frame);
        if (!parsed) {
          // Frame couldn't be parsed - invalid
          return false;
        }

        // Run full validation (structural + semantic rules)
        const validationReport = this.frameValidator.validate(parsed);

        // Frame is valid only if no errors (warnings are acceptable)
        return validationReport.valid;
      }
    );

    const metrics = this.getMetrics(agentId);
    metrics.tripwiresTriggered += tripwireResult.failed;

    if (tripwireResult.failed > 0) {
      this.recordDriftAlert(
        agentId,
        'goal_displacement',
        tripwireResult.failed / (tripwireResult.passed + tripwireResult.failed),
        `${tripwireResult.failed} of ${tripwireResult.passed + tripwireResult.failed} tripwires failed`
      );
    }
  }

  /**
   * Record a drift alert.
   */
  private recordDriftAlert(
    agentId: string,
    type: DriftAlert['type'],
    severity: number,
    message: string
  ): void {
    const alert: DriftAlert = {
      alertId: generateAlertId(),
      agentId,
      type,
      severity: severity > 0.5 ? 'critical' : severity > 0.3 ? 'high' : severity > 0.15 ? 'medium' : 'low',
      message,
      detectedAt: Date.now(),
      evidence: { severity },
    };

    const metrics = this.getMetrics(agentId);
    metrics.alerts.push(alert);

    // Keep only last 100 alerts per agent
    if (metrics.alerts.length > 100) {
      metrics.alerts = metrics.alerts.slice(-100);
    }
  }

  /**
   * Get drift status for an agent.
   */
  getDriftStatus(agentId: string): {
    metrics: DriftMetrics;
    circuitState: string;
    isAllowed: boolean;
    driftScore: number;
    operationCount: number;
    circuitBreakerState: 'closed' | 'open' | 'half-open';
  } {
    const metrics = this.getMetrics(agentId);
    const cbState = this.circuitBreaker.getState(agentId);

    return {
      metrics,
      circuitState: cbState.state,
      isAllowed: this.circuitBreaker.isAllowed(agentId),
      driftScore: metrics.currentDriftScore,
      operationCount: metrics.testsPassed + metrics.testsFailed,
      circuitBreakerState: cbState.state as 'closed' | 'open' | 'half-open'
    };
  }

  /**
   * Get all agent metrics.
   */
  getAllMetrics(): DriftMetrics[] {
    return Array.from(this.agentMetrics.values());
  }

  /**
   * Get all agent IDs being tracked.
   */
  getAllAgentIds(): string[] {
    return Array.from(this.agentMetrics.keys());
  }

  /**
   * Reset an agent's monitoring data.
   */
  resetAgent(agentId: string): void {
    this.agentMetrics.delete(agentId);
    this.agentEmbeddings.delete(agentId);
    this.lastBaselineTest.delete(agentId);
    this.circuitBreaker.clearAgent(agentId);
  }

  /**
   * Clear all monitoring data.
   */
  clearAll(): void {
    this.agentMetrics.clear();
    this.agentEmbeddings.clear();
    this.lastBaselineTest.clear();
    this.crossAgentBehavior.clear();
    this.circuitBreaker.clearAll();
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
    const metrics = this.agentMetrics.get(agentId);
    if (!metrics) return [];

    // Build history from alerts and embeddings
    const history: Array<{
      timestamp: number;
      driftScore: number;
      frame: string;
      action: string;
      alert?: { type: string; message: string };
    }> = [];

    // Add alerts as history entries
    for (const alert of metrics.alerts) {
      if (since && alert.detectedAt < since) continue;
      history.push({
        timestamp: alert.detectedAt,
        driftScore: typeof alert.evidence?.severity === 'number' ? alert.evidence.severity : 0,
        frame: String(alert.evidence?.frame ?? 'unknown'),
        action: alert.type,
        alert: { type: alert.type, message: alert.message }
      });
    }

    // Sort by timestamp descending
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    return limit ? history.slice(0, limit) : history;
  }
}
