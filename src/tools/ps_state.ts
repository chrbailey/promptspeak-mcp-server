/**
 * ps_state Tool
 *
 * Manages and queries agent state, drift metrics,
 * circuit breaker status, and system health.
 */

import { Gatekeeper } from '../gatekeeper/index.js';
import { driftEngine } from '../drift/index.js';  // Use singleton
import { operatorConfig } from '../operator/config.js';
import { recordAudit } from '../operator/index.js';
import type { AgentState, CircuitBreakerStateValue } from '../types/index.js';

const gatekeeper = new Gatekeeper();

// ============================================================================
// AGENT STATE TYPES
// ============================================================================

export interface AgentStateResult {
  agentId: string;
  exists: boolean;
  state?: {
    activeFrame: string | null;
    lastAction: string | null;
    lastActionTime: number | null;
    operationCount: number;
    successRate: number;
    driftScore: number;
    circuitBreakerState: CircuitBreakerStateValue;
    delegations: {
      asParent: number;
      asChild: number;
    };
  };
  health: 'healthy' | 'warning' | 'critical' | 'halted';
  recommendations: string[];
}

export interface SystemStateResult {
  timestamp: number;
  agents: {
    total: number;
    healthy: number;
    warning: number;
    critical: number;
    halted: number;
  };
  operations: {
    total: number;
    successful: number;
    blocked: number;
    failed: number;
  };
  drift: {
    alertCount: number;
    activeAlerts: Array<{
      alertId: string;
      agentId: string;
      timestamp: number;
      type: string;
      severity: string;
      message: string;
      resolved?: boolean;
    }>;
    meanDriftScore: number;
    maxDriftScore: number;
  };
  circuitBreakers: {
    closed: number;
    open: number;
    halfOpen: number;
  };
  thresholds: {
    preExecute: number;
    postAudit: number;
    coverageMinimum: number;
    driftThreshold: number;
  };
}

// ============================================================================
// GET AGENT STATE
// ============================================================================

export function ps_state_get(agentId: string): AgentStateResult {
  const status = driftEngine.getAgentStatus(agentId);
  const gatekeeperState = gatekeeper.getAgentState(agentId);

  // Check if agent actually has any operations recorded
  // getMetrics creates default metrics, so we need to check operationCount
  const operationCount = status?.operationCount ?? 0;
  const hasGatekeeperHistory = gatekeeperState !== null;
  const circuitState: CircuitBreakerStateValue = (status?.circuitBreakerState ?? 'closed') as CircuitBreakerStateValue;

  // If agent is halted, always return state info even without operation history
  if (operationCount === 0 && !hasGatekeeperHistory && circuitState === 'closed') {
    return {
      agentId,
      exists: false,
      health: 'healthy',
      recommendations: ['Agent not found - may not have performed any operations yet']
    };
  }

  const driftScore = status?.driftScore ?? 0;
  // circuitState already declared above
  const successRate = calculateSuccessRate(agentId);

  // Determine health
  let health: AgentStateResult['health'] = 'healthy';
  const recommendations: string[] = [];

  if (circuitState === 'open') {
    health = 'halted';
    recommendations.push('Agent halted by circuit breaker - requires manual intervention');
    recommendations.push('Use ps_state_reset to reset circuit breaker after investigation');
  } else if (driftScore > 0.7) {
    health = 'critical';
    recommendations.push('High drift detected - review recent operations');
    recommendations.push('Consider recalibrating baseline with ps_state_recalibrate');
  } else if (driftScore > 0.4 || circuitState === 'half-open') {
    health = 'warning';
    recommendations.push('Elevated drift - monitor closely');
  } else if (successRate < 0.5) {
    health = 'warning';
    recommendations.push('Low success rate - review frame constraints');
  }

  return {
    agentId,
    exists: true,
    state: {
      activeFrame: gatekeeperState?.activeFrame ?? null,
      lastAction: gatekeeperState?.lastAction ?? null,
      lastActionTime: gatekeeperState?.lastActionTime ?? null,
      operationCount: status?.operationCount ?? 0,
      successRate,
      driftScore,
      circuitBreakerState: circuitState,
      delegations: {
        asParent: gatekeeperState?.delegationsAsParent ?? 0,
        asChild: gatekeeperState?.delegationsAsChild ?? 0
      }
    },
    health,
    recommendations
  };
}

// ============================================================================
// GET SYSTEM STATE
// ============================================================================

export function ps_state_system(): SystemStateResult {
  const systemStats = driftEngine.getSystemStats();
  const allAgentIds = driftEngine.getAllAgentIds();

  // Count agent health states
  let healthy = 0, warning = 0, critical = 0, halted = 0;
  let totalDrift = 0;
  let maxDrift = 0;
  const activeAlerts: Array<{
    alertId: string;
    agentId: string;
    timestamp: number;
    type: string;
    severity: string;
    message: string;
    resolved?: boolean;
  }> = [];
  let circuitClosed = 0, circuitOpen = 0, circuitHalfOpen = 0;

  for (const agentId of allAgentIds) {
    const state = ps_state_get(agentId);
    switch (state.health) {
      case 'healthy': healthy++; break;
      case 'warning': warning++; break;
      case 'critical': critical++; break;
      case 'halted': halted++; break;
    }

    const status = driftEngine.getAgentStatus(agentId);
    if (status) {
      totalDrift += status.driftScore;
      maxDrift = Math.max(maxDrift, status.driftScore);

      switch (status.circuitBreakerState) {
        case 'closed': circuitClosed++; break;
        case 'open': circuitOpen++; break;
        case 'half-open': circuitHalfOpen++; break;
      }

      // Collect active alerts (all alerts from getAgentAlerts are considered active)
      const alerts = driftEngine.getAgentAlerts(agentId);
      activeAlerts.push(...alerts);
    }
  }

  const operationStats = gatekeeper.getOperationStats();

  return {
    timestamp: Date.now(),
    agents: {
      total: allAgentIds.length,
      healthy,
      warning,
      critical,
      halted
    },
    operations: {
      total: operationStats.total,
      successful: operationStats.successful,
      blocked: operationStats.blocked,
      failed: operationStats.failed
    },
    drift: {
      alertCount: activeAlerts.length,
      activeAlerts: activeAlerts.slice(0, 10), // Limit to 10 most recent
      meanDriftScore: allAgentIds.length > 0 ? totalDrift / allAgentIds.length : 0,
      maxDriftScore: maxDrift
    },
    circuitBreakers: {
      closed: circuitClosed,
      open: circuitOpen,
      halfOpen: circuitHalfOpen
    },
    thresholds: operatorConfig.getThresholds()
  };
}

// ============================================================================
// RESET AGENT STATE
// ============================================================================

export interface ResetRequest {
  agentId: string;
  resetCircuitBreaker?: boolean;
  resetDriftMetrics?: boolean;
  resetBaseline?: boolean;
  reason: string;
}

export interface ResetResult {
  success: boolean;
  agentId: string;
  reset: {
    circuitBreaker: boolean;
    driftMetrics: boolean;
    baseline: boolean;
  };
  newState: AgentStateResult;
}

export function ps_state_reset(request: ResetRequest): ResetResult {
  recordAudit('state_reset', 'operator', {
    agentId: request.agentId,
    reason: request.reason,
    resetCircuitBreaker: request.resetCircuitBreaker,
    resetDriftMetrics: request.resetDriftMetrics,
    resetBaseline: request.resetBaseline
  });

  const resetDone = {
    circuitBreaker: false,
    driftMetrics: false,
    baseline: false
  };

  if (request.resetCircuitBreaker) {
    driftEngine.resetCircuitBreaker(request.agentId);
    resetDone.circuitBreaker = true;
  }

  if (request.resetDriftMetrics) {
    driftEngine.resetDriftMetrics(request.agentId);
    resetDone.driftMetrics = true;
  }

  if (request.resetBaseline) {
    driftEngine.recalibrateAgent(request.agentId);
    resetDone.baseline = true;
  }

  return {
    success: true,
    agentId: request.agentId,
    reset: resetDone,
    newState: ps_state_get(request.agentId)
  };
}

// ============================================================================
// RECALIBRATE AGENT
// ============================================================================

export interface RecalibrateRequest {
  agentId: string;
  newBaseline?: {
    frame: string;
    expectedBehavior: string[];
  };
}

export interface RecalibrateResult {
  success: boolean;
  agentId: string;
  previousDriftScore: number;
  newDriftScore: number;
  message: string;
}

export function ps_state_recalibrate(request: RecalibrateRequest): RecalibrateResult {
  const previousStatus = driftEngine.getAgentStatus(request.agentId);
  const previousDrift = previousStatus?.driftScore ?? 0;

  if (request.newBaseline) {
    driftEngine.setBaseline(
      request.agentId,
      request.newBaseline.frame,
      request.newBaseline.expectedBehavior
    );
  } else {
    driftEngine.recalibrateAgent(request.agentId);
  }

  const newStatus = driftEngine.getAgentStatus(request.agentId);
  const newDrift = newStatus?.driftScore ?? 0;

  recordAudit('state_recalibrate', 'operator', {
    agentId: request.agentId,
    previousDrift,
    newDrift,
    hasNewBaseline: !!request.newBaseline
  });

  return {
    success: true,
    agentId: request.agentId,
    previousDriftScore: previousDrift,
    newDriftScore: newDrift,
    message: request.newBaseline
      ? 'Baseline updated with new configuration'
      : 'Baseline recalibrated from current state'
  };
}

// ============================================================================
// HALT/RESUME AGENT
// ============================================================================

export interface HaltRequest {
  agentId: string;
  reason: string;
}

export function ps_state_halt(request: HaltRequest): { success: boolean; message: string } {
  recordAudit('state_halt', 'operator', {
    agentId: request.agentId,
    reason: request.reason
  });

  driftEngine.haltAgent(request.agentId, request.reason);

  return {
    success: true,
    message: `Agent ${request.agentId} halted: ${request.reason}`
  };
}

export interface ResumeRequest {
  agentId: string;
  reason: string;
  resetMetrics?: boolean;
}

export function ps_state_resume(request: ResumeRequest): { success: boolean; message: string } {
  const status = driftEngine.getAgentStatus(request.agentId);

  if (!status || status.circuitBreakerState !== 'open') {
    return {
      success: false,
      message: `Agent ${request.agentId} is not halted`
    };
  }

  recordAudit('state_resume', 'operator', {
    agentId: request.agentId,
    reason: request.reason,
    resetMetrics: request.resetMetrics
  });

  if (request.resetMetrics) {
    driftEngine.resetDriftMetrics(request.agentId);
  }

  driftEngine.resumeAgent(request.agentId);

  return {
    success: true,
    message: `Agent ${request.agentId} resumed: ${request.reason}`
  };
}

// ============================================================================
// DRIFT HISTORY
// ============================================================================

export interface DriftHistoryRequest {
  agentId: string;
  since?: number;
  limit?: number;
}

export interface DriftHistoryResult {
  agentId: string;
  entries: Array<{
    timestamp: number;
    driftScore: number;
    frame: string;
    action: string;
    alert?: { type: string; message: string };
  }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  summary: {
    minDrift: number;
    maxDrift: number;
    avgDrift: number;
    alertCount: number;
  };
}

export function ps_state_drift_history(request: DriftHistoryRequest): DriftHistoryResult {
  const history = driftEngine.getDriftHistory(
    request.agentId,
    request.since,
    request.limit ?? 100
  );

  // Calculate summary stats
  const driftScores = history.map(e => e.driftScore);
  const minDrift = Math.min(...driftScores, 1);
  const maxDrift = Math.max(...driftScores, 0);
  const avgDrift = driftScores.length > 0
    ? driftScores.reduce((a, b) => a + b, 0) / driftScores.length
    : 0;

  // Determine trend
  let trend: DriftHistoryResult['trend'] = 'stable';
  if (driftScores.length >= 5) {
    const recentAvg = driftScores.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const olderAvg = driftScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    if (recentAvg > olderAvg + 0.1) trend = 'increasing';
    else if (recentAvg < olderAvg - 0.1) trend = 'decreasing';
  }

  return {
    agentId: request.agentId,
    entries: history,
    trend,
    summary: {
      minDrift,
      maxDrift,
      avgDrift,
      alertCount: history.filter(e => e.alert).length
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateSuccessRate(agentId: string): number {
  const stats = gatekeeper.getAgentOperationStats(agentId);
  if (!stats || stats.total === 0) return 1.0;
  return stats.successful / stats.total;
}
