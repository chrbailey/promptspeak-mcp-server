// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - GATEKEEPER CORE
// ═══════════════════════════════════════════════════════════════════════════
// The Gatekeeper is the central enforcement layer that:
// 1. Resolves frames with operator overrides
// 2. Validates frames against all rules
// 3. Intercepts actions and enforces constraints
// 4. Calculates coverage confidence
// 5. PRE-EXECUTION BLOCKING via circuit breaker and drift prediction
// 6. HUMAN-IN-THE-LOOP holds for risky operations
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ParsedFrame,
  ResolvedFrame,
  ValidationReport,
  InterceptorDecision,
  PolicyOverlay,
  ConfidenceThresholds,
  ExecuteRequest,
  ExecuteResult,
  PostAuditResult,
  DriftAlert,
  PreFlightCheck,
  HoldRequest,
  ExecutionControlConfig,
} from '../types/index.js';
import { DynamicResolver } from './resolver.js';
import { FrameValidator } from './validator.js';
import { ActionInterceptor } from './interceptor.js';
import { CoverageCalculator } from './coverage.js';
import { HoldManager, holdManager } from './hold-manager.js';
import { driftEngine } from '../drift/index.js';
import { generateAuditId, generateBehaviorHash } from '../utils/hash.js';

// ═══════════════════════════════════════════════════════════════════════════
// AGENT EVICTION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentEvictionConfig {
  /** Maximum number of agents to track (default: 1000) */
  maxAgents: number;
  /** Maximum executions to keep per agent (default: 1000) */
  maxExecutionsPerAgent: number;
  /** Time in ms after which inactive agents are eligible for eviction (default: 30 minutes) */
  inactivityThresholdMs: number;
  /** Enable periodic cleanup (default: true) */
  enablePeriodicCleanup: boolean;
  /** Cleanup interval in ms (default: 5 minutes) */
  cleanupIntervalMs: number;
  /** Log eviction events (default: true) */
  logEvictions: boolean;
}

const DEFAULT_EVICTION_CONFIG: AgentEvictionConfig = {
  maxAgents: 1000,
  maxExecutionsPerAgent: 1000,
  inactivityThresholdMs: 30 * 60 * 1000, // 30 minutes
  enablePeriodicCleanup: true,
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  logEvictions: true,
};

export class Gatekeeper {
  private resolver: DynamicResolver;
  private validator: FrameValidator;
  private interceptor: ActionInterceptor;
  private coverageCalculator: CoverageCalculator;
  private holdManager: HoldManager;

  // Frame cache for chain validation (with eviction)
  private activeFrames: Map<string, ResolvedFrame> = new Map();

  // Execution history for post-audit (with eviction)
  private executionHistory: Map<string, {
    request: ExecuteRequest;
    decision: InterceptorDecision;
    result?: unknown;
    timestamp: number;
  }[]> = new Map();

  // Agent activity tracking for LRU eviction
  private agentLastActivity: Map<string, number> = new Map();

  // Eviction configuration
  private evictionConfig: AgentEvictionConfig;

  // Cleanup timer
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Eviction statistics
  private evictionStats = {
    totalEvictions: 0,
    lastEvictionTime: 0,
    evictedByCapacity: 0,
    evictedByInactivity: 0,
  };

  constructor(evictionConfig?: Partial<AgentEvictionConfig>) {
    this.resolver = new DynamicResolver();
    this.validator = new FrameValidator();
    this.interceptor = new ActionInterceptor();
    this.coverageCalculator = new CoverageCalculator();
    this.holdManager = holdManager;  // Use singleton
    this.evictionConfig = { ...DEFAULT_EVICTION_CONFIG, ...evictionConfig };

    // Start periodic cleanup if enabled
    if (this.evictionConfig.enablePeriodicCleanup) {
      this.startPeriodicCleanup();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AGENT EVICTION POLICY (Memory Management)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update eviction configuration.
   */
  setEvictionConfig(config: Partial<AgentEvictionConfig>): void {
    this.evictionConfig = { ...this.evictionConfig, ...config };

    // Restart periodic cleanup with new interval if needed
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.evictionConfig.enablePeriodicCleanup) {
      this.startPeriodicCleanup();
    }
  }

  /**
   * Get current eviction configuration.
   */
  getEvictionConfig(): AgentEvictionConfig {
    return { ...this.evictionConfig };
  }

  /**
   * Get eviction statistics.
   */
  getEvictionStats(): typeof this.evictionStats & { activeAgents: number } {
    return {
      ...this.evictionStats,
      activeAgents: this.agentLastActivity.size,
    };
  }

  /**
   * Start periodic cleanup timer.
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.evictInactiveAgents();
    }, this.evictionConfig.cleanupIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop periodic cleanup timer.
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Touch agent activity timestamp (called on every operation).
   */
  private touchAgent(agentId: string): void {
    const now = Date.now();
    this.agentLastActivity.set(agentId, now);

    // Check if we need to evict agents due to capacity
    if (this.agentLastActivity.size > this.evictionConfig.maxAgents) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Evict the least recently used agent.
   */
  private evictLeastRecentlyUsed(): void {
    if (this.agentLastActivity.size === 0) return;

    // Find the agent with the oldest activity timestamp
    let oldestAgent: string | null = null;
    let oldestTime = Infinity;

    for (const [agentId, lastActivity] of this.agentLastActivity) {
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestAgent = agentId;
      }
    }

    if (oldestAgent) {
      this.evictAgent(oldestAgent, 'capacity');
    }
  }

  /**
   * Evict inactive agents (called periodically or on demand).
   */
  evictInactiveAgents(): number {
    const now = Date.now();
    const threshold = now - this.evictionConfig.inactivityThresholdMs;
    const toEvict: string[] = [];

    for (const [agentId, lastActivity] of this.agentLastActivity) {
      if (lastActivity < threshold) {
        toEvict.push(agentId);
      }
    }

    for (const agentId of toEvict) {
      this.evictAgent(agentId, 'inactivity');
    }

    return toEvict.length;
  }

  /**
   * Evict a specific agent and clean up all its data.
   */
  private evictAgent(agentId: string, reason: 'capacity' | 'inactivity'): void {
    // Remove from all tracking structures
    this.activeFrames.delete(agentId);
    this.executionHistory.delete(agentId);
    this.agentLastActivity.delete(agentId);

    // Update statistics
    this.evictionStats.totalEvictions++;
    this.evictionStats.lastEvictionTime = Date.now();
    if (reason === 'capacity') {
      this.evictionStats.evictedByCapacity++;
    } else {
      this.evictionStats.evictedByInactivity++;
    }

    // Log if enabled
    if (this.evictionConfig.logEvictions) {
      console.log(`[Gatekeeper] Evicted agent ${agentId} (reason: ${reason})`);
    }
  }

  /**
   * Manually evict an agent (for testing or admin purposes).
   */
  forceEvictAgent(agentId: string): boolean {
    if (!this.agentLastActivity.has(agentId)) {
      return false;
    }
    this.evictAgent(agentId, 'capacity');
    return true;
  }

  /**
   * Get list of all tracked agent IDs.
   */
  getTrackedAgents(): Array<{ agentId: string; lastActivity: number }> {
    const agents: Array<{ agentId: string; lastActivity: number }> = [];
    for (const [agentId, lastActivity] of this.agentLastActivity) {
      agents.push({ agentId, lastActivity });
    }
    return agents.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DRIFT ENGINE ACCESS (for external integration)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the drift detection engine for external access.
   */
  getDriftEngine() {
    return driftEngine;
  }

  /**
   * Get the hold manager for external access.
   */
  getHoldManager(): HoldManager {
    return this.holdManager;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set the active policy overlay.
   */
  setOverlay(overlay: PolicyOverlay | null): void {
    this.resolver.setOverlay(overlay);
    if (overlay?.confidenceThresholds) {
      this.interceptor.setThresholds(overlay.confidenceThresholds);
    }
  }

  /**
   * Update confidence thresholds.
   */
  setThresholds(thresholds: ConfidenceThresholds): void {
    this.interceptor.setThresholds(thresholds);
  }

  /**
   * Get current thresholds.
   */
  getThresholds(): ConfidenceThresholds {
    return this.interceptor.getThresholds();
  }

  /**
   * Set execution control configuration (human-in-the-loop, pre-flight checks).
   */
  setExecutionControlConfig(config: Partial<ExecutionControlConfig>): void {
    this.holdManager.setConfig(config);
  }

  /**
   * Get execution control configuration.
   */
  getExecutionControlConfig(): ExecutionControlConfig {
    return this.holdManager.getConfig();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FRAME OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Parse a raw frame string.
   * Returns an empty frame structure if parsing fails.
   */
  parseFrame(rawFrame: string): ParsedFrame {
    const result = this.resolver.parseFrame(rawFrame);
    if (result) return result;

    // Return empty frame structure for invalid frames
    return {
      raw: rawFrame,
      symbols: [],
      mode: null,
      modifiers: [],
      domain: null,
      source: null,
      constraints: [],
      action: null,
      entity: null,
      metadata: {},
    };
  }

  /**
   * Resolve a frame with operator overrides.
   */
  resolveFrame(frame: ParsedFrame | string): ResolvedFrame {
    const parsed = typeof frame === 'string' ? this.parseFrame(frame) : frame;
    return this.resolver.resolveFrame(parsed);
  }

  /**
   * Validate a frame.
   */
  validateFrame(frame: ParsedFrame | string, parentFrame?: ParsedFrame | string): ValidationReport {
    const parsed = typeof frame === 'string' ? this.parseFrame(frame) : frame;
    const parsedParent = parentFrame
      ? (typeof parentFrame === 'string' ? this.parseFrame(parentFrame) : parentFrame)
      : undefined;

    return this.validator.validate(parsed, parsedParent);
  }

  /**
   * Full validation pipeline: parse, resolve, validate.
   */
  processFrame(rawFrame: string, parentFrame?: string): {
    parsed: ParsedFrame;
    resolved: ResolvedFrame;
    validation: ValidationReport;
  } {
    const parsed = this.parseFrame(rawFrame);
    const resolved = this.resolveFrame(parsed);
    const parentParsed = parentFrame ? this.parseFrame(parentFrame) : undefined;
    const validation = this.validator.validate(parsed, parentParsed);

    return { parsed, resolved, validation };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXECUTION CONTROL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Execute an action through the gatekeeper.
   * This is the main entry point for all agent actions.
   *
   * EXECUTION ORDER (for deterministic pre-execution blocking):
   * 1. CIRCUIT BREAKER CHECK - Block halted agents immediately
   * 2. FRAME VALIDATION - Structural/semantic validation
   * 3. PRE-FLIGHT DRIFT PREDICTION - Predict if this action will cause drift
   * 4. HOLD CHECK - Determine if human approval needed
   * 5. INTERCEPTOR - Final frame-based permission check
   * 6. TOOL EXECUTION - Only if all checks pass
   * 7. POST-AUDIT - Confirm behavior matches prediction
   * 8. IMMEDIATE ACTION - Halt agent if critical drift detected
   */
  execute(request: ExecuteRequest): ExecuteResult {
    const { agentId, frame, tool, arguments: args, bypassHold, holdDecision } = request;
    const config = this.holdManager.getConfig();
    const timestamp = Date.now();
    const auditId = generateAuditId();

    // Track agent activity for eviction policy
    this.touchAgent(agentId);

    // Initialize pre-flight check result
    const preFlightCheck: PreFlightCheck = {
      passed: false,
      blocked: false,
      held: false,
      checks: {
        circuitBreaker: { passed: true },
        driftPrediction: { passed: true },
        baseline: { passed: true },
        confidence: { passed: true },
      },
    };

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: CIRCUIT BREAKER CHECK (FIRST - deterministic stop)
    // ═══════════════════════════════════════════════════════════════════════
    if (config.enableCircuitBreakerCheck) {
      const isAllowed = driftEngine.circuitBreaker.isAllowed(agentId);
      if (!isAllowed) {
        const cbState = driftEngine.circuitBreaker.getState(agentId);
        preFlightCheck.checks.circuitBreaker = {
          passed: false,
          reason: cbState.reason || 'Circuit breaker open',
        };
        preFlightCheck.blocked = true;
        preFlightCheck.blockReason = `Agent halted: ${cbState.reason || 'Circuit breaker open'}`;

        // Log to audit trail
        this.logCircuitBreakerBlock(agentId, frame, tool, cbState.reason);

        return {
          success: false,
          allowed: false,
          held: false,
          error: preFlightCheck.blockReason,
          preFlightCheck,
          interceptorDecision: {
            allowed: false,
            reason: preFlightCheck.blockReason,
            frame,
            proposedAction: tool,
            coverageConfidence: 0,
            timestamp,
            auditId,
            preFlightChecks: {
              circuitBreakerPassed: false,
              driftPredictionPassed: true,
              baselineCheckPassed: true,
            },
          },
        };
      }
    }
    preFlightCheck.checks.circuitBreaker.passed = true;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: FRAME VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    const { parsed, resolved, validation } = this.processFrame(frame);

    if (!validation.valid) {
      preFlightCheck.blocked = true;
      preFlightCheck.blockReason = 'Frame validation failed';

      return {
        success: false,
        allowed: false,
        error: `Frame validation failed: ${(validation.structural ?? []).concat(validation.semantic ?? [], validation.chain ?? [])
          .filter(r => !r.passed && r.severity === 'error')
          .map(r => r.message)
          .join('; ')}`,
        preFlightCheck,
        interceptorDecision: {
          allowed: false,
          reason: 'Frame validation failed',
          frame,
          proposedAction: tool,
          coverageConfidence: 0,
          timestamp,
          auditId,
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3: PRE-FLIGHT DRIFT PREDICTION
    // ═══════════════════════════════════════════════════════════════════════
    let predictedDriftScore = 0;
    let baselineDeviation = 0;

    if (config.enablePreFlightDriftPrediction || config.enableBaselineComparison) {
      const baselineResult = driftEngine.baselineStore.compareToBaseline(
        parsed,
        parsed.symbols.map(s => s.definition?.name || s.symbol).join(' '),
        [tool],
        agentId
      );

      if (baselineResult.hasBaseline) {
        predictedDriftScore = baselineResult.driftScore;
        baselineDeviation = baselineResult.driftScore;

        // Check drift prediction threshold
        if (config.enablePreFlightDriftPrediction &&
            predictedDriftScore > config.driftPredictionThreshold) {
          preFlightCheck.checks.driftPrediction = {
            passed: false,
            predictedScore: predictedDriftScore,
            threshold: config.driftPredictionThreshold,
          };
        }

        // Check baseline deviation threshold
        if (config.enableBaselineComparison &&
            baselineDeviation > config.baselineDeviationThreshold) {
          preFlightCheck.checks.baseline = {
            passed: false,
            deviation: baselineDeviation,
          };
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 4: HOLD CHECK (Human-in-the-Loop)
    // ═══════════════════════════════════════════════════════════════════════
    // Skip hold check if this is a resume from an approved hold
    if (!bypassHold) {
      const holdCheck = this.holdManager.shouldHold(request, {
        circuitBreakerBlocked: !preFlightCheck.checks.circuitBreaker.passed,
        predictedDriftScore,
        baselineDeviation,
        confidenceScore: resolved.parseConfidence,
        isForbidden: resolved.effectiveConstraint?.name === 'forbidden',
        requiresMcpValidation: this.holdManager.requiresMcpValidation(tool),
      });

      if (holdCheck) {
        // Create hold request for human review
        const holdRequest = this.holdManager.createHold(
          request,
          holdCheck.reason,
          holdCheck.severity,
          {
            ...holdCheck.evidence,
            predictedDrift: predictedDriftScore,
            frame,
            tool,
            agentId,
          }
        );

        preFlightCheck.held = true;
        preFlightCheck.holdRequest = holdRequest;

        return {
          success: false,
          allowed: false,
          held: true,
          holdRequest,
          preFlightCheck,
          interceptorDecision: {
            allowed: false,
            held: true,
            holdReason: holdCheck.reason,
            reason: `Execution held for approval: ${holdCheck.reason}`,
            frame,
            proposedAction: tool,
            coverageConfidence: resolved.parseConfidence || 0,
            timestamp,
            auditId,
            preFlightChecks: {
              circuitBreakerPassed: preFlightCheck.checks.circuitBreaker.passed,
              driftPredictionPassed: preFlightCheck.checks.driftPrediction.passed,
              baselineCheckPassed: preFlightCheck.checks.baseline.passed,
              predictedDriftScore,
            },
          },
        };
      }
    }

    // If resuming from hold, use modified frame/args if provided
    const effectiveFrame = holdDecision?.modifiedFrame || frame;
    const effectiveArgs = holdDecision?.modifiedArgs || args;

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5: INTERCEPTOR CHECK
    // ═══════════════════════════════════════════════════════════════════════
    const decision = this.interceptor.intercept(resolved, tool, effectiveArgs, agentId);

    if (!decision.allowed) {
      this.recordExecution(agentId, request, decision, undefined);

      // Record operation as blocked in drift engine
      driftEngine.recordOperation(agentId, frame, tool, false);

      return {
        success: false,
        allowed: false,
        error: decision.reason,
        preFlightCheck,
        interceptorDecision: {
          ...decision,
          preFlightChecks: {
            circuitBreakerPassed: preFlightCheck.checks.circuitBreaker.passed,
            driftPredictionPassed: preFlightCheck.checks.driftPrediction.passed,
            baselineCheckPassed: preFlightCheck.checks.baseline.passed,
            predictedDriftScore,
          },
        },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6: TOOL EXECUTION
    // All pre-execution checks passed - now execute
    // ═══════════════════════════════════════════════════════════════════════
    preFlightCheck.passed = true;
    const result = this.simulateToolExecution(tool, effectiveArgs);

    // Record successful operation in drift engine
    driftEngine.recordOperation(agentId, frame, tool, true);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7: POST-AUDIT
    // ═══════════════════════════════════════════════════════════════════════
    const postAudit = this.performPostAudit(agentId, request, decision, result);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8: IMMEDIATE ACTION ON DRIFT
    // ═══════════════════════════════════════════════════════════════════════
    if (postAudit.driftDetected && postAudit.alerts.length > 0) {
      const maxSeverity = postAudit.alerts.reduce((max, a) =>
        a.severity === 'critical' ? 'critical' :
        a.severity === 'high' && max !== 'critical' ? 'high' :
        a.severity === 'medium' && max !== 'critical' && max !== 'high' ? 'medium' : max
      , 'low' as 'low' | 'medium' | 'high' | 'critical');

      // Take immediate action based on configuration
      if (config.haltOnCriticalDrift && maxSeverity === 'critical') {
        driftEngine.haltAgent(agentId, `Critical drift detected: ${postAudit.alerts[0].message}`);
      } else if (config.haltOnHighDrift && (maxSeverity === 'critical' || maxSeverity === 'high')) {
        driftEngine.haltAgent(agentId, `High drift detected: ${postAudit.alerts[0].message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 9: RECORD AND RETURN
    // ═══════════════════════════════════════════════════════════════════════
    this.recordExecution(agentId, request, decision, result);
    this.activeFrames.set(agentId, resolved);

    return {
      success: true,
      allowed: true,
      result,
      preFlightCheck,
      interceptorDecision: {
        ...decision,
        preFlightChecks: {
          circuitBreakerPassed: true,
          driftPredictionPassed: preFlightCheck.checks.driftPrediction.passed,
          baselineCheckPassed: preFlightCheck.checks.baseline.passed,
          predictedDriftScore,
        },
      },
      postAudit,
    };
  }

  /**
   * Log circuit breaker block to audit trail.
   */
  private logCircuitBreakerBlock(
    agentId: string,
    frame: string,
    tool: string,
    reason: string | undefined
  ): void {
    // Record in drift engine
    driftEngine.recordOperation(agentId, frame, tool, false);

    // Add to execution history with blocked status
    const decision: InterceptorDecision = {
      allowed: false,
      reason: `Circuit breaker blocked: ${reason || 'Agent halted'}`,
      frame,
      proposedAction: tool,
      coverageConfidence: 0,
      timestamp: Date.now(),
      auditId: generateAuditId(),
    };

    this.recordExecution(agentId, { agentId, frame, tool, arguments: {} }, decision, undefined);
  }

  /**
   * Simulate tool execution (placeholder for actual implementation).
   */
  private simulateToolExecution(tool: string, args: Record<string, unknown>): unknown {
    // In real implementation, this would call the actual tool
    return {
      tool,
      executed: true,
      timestamp: Date.now(),
      args,
    };
  }

  /**
   * Perform post-execution audit.
   */
  private performPostAudit(
    agentId: string,
    request: ExecuteRequest,
    decision: InterceptorDecision,
    result: unknown
  ): PostAuditResult {
    const auditId = generateAuditId();
    const alerts: DriftAlert[] = [];

    // Check 1: Action match - did result match expected behavior?
    const expectedActions = [request.tool];
    const actualActions = this.extractActionsFromResult(result);
    const actionMatch = this.calculateActionMatch(expectedActions, actualActions);

    // Check 2: Drift detection - compare to historical behavior
    const history = this.executionHistory.get(agentId) || [];
    const similarExecutions = history.filter(h => h.request.frame === request.frame);

    if (similarExecutions.length > 5) {
      const historicalActions = similarExecutions.map(h =>
        this.extractActionsFromResult(h.result)
      ).flat();
      const currentActions = this.extractActionsFromResult(result);

      // If current behavior differs significantly from historical, flag drift
      const behaviorHash = generateBehaviorHash(currentActions);
      const historicalHash = generateBehaviorHash(historicalActions.slice(-10));

      if (behaviorHash !== historicalHash && similarExecutions.length > 10) {
        alerts.push({
          alertId: generateAuditId(),
          agentId,
          type: 'goal_displacement',
          severity: 'medium',
          message: 'Behavior pattern change detected for identical frame',
          detectedAt: Date.now(),
          evidence: {
            frame: request.frame,
            historicalPattern: historicalHash.substring(0, 16),
            currentPattern: behaviorHash.substring(0, 16),
          },
        });
      }
    }

    return {
      auditId,
      actionMatchScore: actionMatch,
      driftDetected: alerts.length > 0,
      alerts,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract action names from a result object.
   */
  private extractActionsFromResult(result: unknown): string[] {
    if (!result || typeof result !== 'object') {
      return [];
    }

    const actions: string[] = [];
    const r = result as Record<string, unknown>;

    if (r['tool']) actions.push(String(r['tool']));
    if (r['action']) actions.push(String(r['action']));
    if (r['executed']) actions.push('executed');

    return actions;
  }

  /**
   * Calculate how well actual actions matched expected.
   */
  private calculateActionMatch(expected: string[], actual: string[]): number {
    if (expected.length === 0) return 1;

    const matches = expected.filter(e => actual.includes(e));
    return matches.length / expected.length;
  }

  /**
   * Record an execution in history.
   */
  private recordExecution(
    agentId: string,
    request: ExecuteRequest,
    decision: InterceptorDecision,
    result: unknown
  ): void {
    if (!this.executionHistory.has(agentId)) {
      this.executionHistory.set(agentId, []);
    }

    const history = this.executionHistory.get(agentId)!;
    history.push({
      request,
      decision,
      result,
      timestamp: Date.now(),
    });

    // Keep only last N executions per agent (configurable via evictionConfig)
    const maxExecutions = this.evictionConfig.maxExecutionsPerAgent;
    if (history.length > maxExecutions) {
      this.executionHistory.set(agentId, history.slice(-maxExecutions));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AGENT MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the active frame for an agent.
   */
  getActiveFrame(agentId: string): ResolvedFrame | undefined {
    return this.activeFrames.get(agentId);
  }

  /**
   * Clear the active frame for an agent.
   */
  clearActiveFrame(agentId: string): void {
    this.activeFrames.delete(agentId);
  }

  /**
   * Get execution history for an agent.
   */
  getExecutionHistory(agentId: string, limit: number = 100): typeof this.executionHistory extends Map<string, infer V> ? V : never {
    const history = this.executionHistory.get(agentId) || [];
    return history.slice(-limit) as any;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRECHECK (DRY RUN)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if an action would be allowed without executing.
   */
  precheck(
    frame: string,
    tool: string,
    args: Record<string, unknown>,
    parentFrame?: string
  ): InterceptorDecision & {
    validationReport?: ValidationReport;
    coverageConfidence?: number;
    uncoveredAspects?: string[];
  } {
    // Parse and resolve
    const { parsed, resolved, validation } = this.processFrame(frame, parentFrame);

    if (!validation.valid) {
      return {
        allowed: false,
        reason: 'Frame validation failed',
        frame,
        proposedAction: tool,
        coverageConfidence: 0,
        timestamp: Date.now(),
        auditId: generateAuditId(),
        validationReport: validation,
        uncoveredAspects: ['validation']
      };
    }

    // Calculate coverage
    const coverage = this.coverageCalculator.calculate(resolved, tool, args);

    // Get interceptor decision (without executing)
    const decision = this.interceptor.intercept(resolved, tool, args, 'precheck');

    return {
      ...decision,
      validationReport: validation,
      coverageConfidence: coverage.confidence,
      uncoveredAspects: coverage.uncoveredAspects
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get agent state for ps_state tool.
   */
  getAgentState(agentId: string): {
    activeFrame: string | null;
    lastAction: string | null;
    lastActionTime: number | null;
    delegationsAsParent: number;
    delegationsAsChild: number;
  } | null {
    const history = this.executionHistory.get(agentId);
    if (!history || history.length === 0) return null;

    const lastExecution = history[history.length - 1];
    const activeFrame = this.activeFrames.get(agentId);

    return {
      activeFrame: activeFrame?.raw ?? null,
      lastAction: lastExecution.request.tool ?? null,
      lastActionTime: lastExecution.timestamp,
      delegationsAsParent: 0, // Managed by ps_delegate
      delegationsAsChild: 0   // Managed by ps_delegate
    };
  }

  /**
   * Get operation statistics.
   */
  getOperationStats(): {
    total: number;
    successful: number;
    blocked: number;
    failed: number;
  } {
    let total = 0, successful = 0, blocked = 0, failed = 0;

    for (const history of this.executionHistory.values()) {
      for (const execution of history) {
        total++;
        if (execution.decision.allowed) {
          if (execution.result) successful++;
          else failed++;
        } else {
          blocked++;
        }
      }
    }

    return { total, successful, blocked, failed };
  }

  /**
   * Get operation statistics for a specific agent.
   */
  getAgentOperationStats(agentId: string): {
    total: number;
    successful: number;
    blocked: number;
    failed: number;
  } | null {
    const history = this.executionHistory.get(agentId);
    if (!history) return null;

    let successful = 0, blocked = 0, failed = 0;

    for (const execution of history) {
      if (execution.decision.allowed) {
        if (execution.result) successful++;
        else failed++;
      } else {
        blocked++;
      }
    }

    return {
      total: history.length,
      successful,
      blocked,
      failed
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONVENIENCE ALIASES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Alias for resolveFrame - resolve a frame with operator overrides.
   */
  resolve(frame: ParsedFrame | string): ResolvedFrame {
    return this.resolveFrame(frame);
  }

  /**
   * Alias for validateFrame - validate a frame.
   */
  validate(frame: ParsedFrame | string, parentFrame?: ParsedFrame | string): ValidationReport {
    return this.validateFrame(frame, parentFrame);
  }

  /**
   * Alias for execute that returns just the interceptor decision.
   * Wraps execute() to provide a simpler API for action interception.
   */
  intercept(action: string, frame: string, agentId: string): InterceptorDecision {
    const result = this.execute({ agentId, frame, tool: action, arguments: {} });
    return result.interceptorDecision;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get audit log.
   */
  getAuditLog(limit: number = 100) {
    return this.interceptor.getAuditLog(limit);
  }

  /**
   * Get audit log for a specific agent.
   */
  getAgentAuditLog(agentId: string, limit: number = 100) {
    return this.interceptor.getAgentAuditLog(agentId, limit);
  }
}

// Export singleton and classes
export const gatekeeper = new Gatekeeper();
export { DynamicResolver } from './resolver.js';
export { FrameValidator } from './validator.js';
export { ActionInterceptor } from './interceptor.js';
export { CoverageCalculator } from './coverage.js';
export { HoldManager, holdManager } from './hold-manager.js';

// Re-export drift engine for convenience
export { driftEngine } from '../drift/index.js';
