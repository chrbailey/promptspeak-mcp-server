/**
 * ps_execute Tool
 *
 * Executes an action under a PromptSpeak frame's governance.
 * The gatekeeper intercepts the action and enforces frame constraints.
 */

import { Gatekeeper } from '../gatekeeper/index.js';
import { driftEngine } from '../drift/index.js';  // Use singleton
import { operatorConfig } from '../operator/config.js';
import { recordAudit } from '../operator/index.js';
import type { ExecuteRequest, ExecuteResult, InterceptorDecision } from '../types/index.js';

const gatekeeper = new Gatekeeper();

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface PSExecuteRequest {
  agentId: string;
  frame: string;
  action: {
    tool: string;
    arguments: Record<string, unknown>;
    description?: string;
  };
  parentFrame?: string;
  metadata?: Record<string, unknown>;
}

export interface PSExecuteResult {
  success: boolean;
  agentId: string;
  frame: string;
  action: string;
  decision: InterceptorDecision;
  result?: unknown;
  driftStatus?: {
    score: number;
    alert: boolean;
    circuitState: string;
  };
  executionTime: number;
  auditId: string;
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export async function ps_execute(request: PSExecuteRequest): Promise<PSExecuteResult> {
  const startTime = Date.now();
  const auditId = generateAuditId();

  // Normalize action input - allow string or object format
  const normalizedAction = typeof request.action === 'string'
    ? { tool: request.action, arguments: {} }
    : request.action;
  const actionTool = normalizedAction.tool;

  // Record audit entry
  recordAudit('execute_start', request.agentId, {
    auditId,
    frame: request.frame,
    tool: actionTool
  });

  try {
    // Step 1: Check circuit breaker state (FIRST - before any other processing)
    const agentStatus = driftEngine.getAgentStatus(request.agentId);
    if (agentStatus && agentStatus.circuitBreakerState === 'open') {
      recordAudit('execute_blocked', request.agentId, {
        auditId,
        reason: 'circuit_breaker_open'
      });
      return {
        success: false,
        agentId: request.agentId,
        frame: request.frame,
        action: actionTool,
        decision: {
          allowed: false,
          frame: request.frame,
          proposedAction: actionTool,
          action: 'block',
          reason: 'Circuit breaker is open - agent has been halted',
          coverageConfidence: 1.0,
          confidence: 1.0,
          timestamp: Date.now(),
          auditId,
        },
        driftStatus: {
          score: agentStatus.driftScore,
          alert: true,
          circuitState: 'open'
        },
        executionTime: Date.now() - startTime,
        auditId
      };
    }

    // Step 2: Build execute request for gatekeeper
    const executeRequest: ExecuteRequest = {
      frame: request.frame,
      tool: actionTool,
      action: actionTool,  // Alias for backward compatibility
      arguments: normalizedAction.arguments,
      agentId: request.agentId,
    };

    // Step 3: Execute through gatekeeper
    const executeResult = await gatekeeper.execute(executeRequest);

    // Step 4: Record drift metrics
    const driftAlert = driftEngine.recordOperation(
      request.agentId,
      request.frame,
      actionTool,
      executeResult.success
    );

    // Step 5: Get updated drift status
    const updatedStatus = driftEngine.getAgentStatus(request.agentId);

    // Step 6: Record completion audit
    recordAudit('execute_complete', request.agentId, {
      auditId,
      success: executeResult.success,
      decision: executeResult.decision?.action ?? executeResult.interceptorDecision?.action,
      driftScore: updatedStatus?.driftScore
    });

    return {
      success: executeResult.success,
      agentId: request.agentId,
      frame: request.frame,
      action: actionTool,
      decision: executeResult.decision ?? executeResult.interceptorDecision,
      result: executeResult.result,
      driftStatus: updatedStatus ? {
        score: updatedStatus.driftScore,
        alert: driftAlert !== null,
        circuitState: updatedStatus.circuitBreakerState
      } : undefined,
      executionTime: Date.now() - startTime,
      auditId
    };

  } catch (error) {
    recordAudit('execute_error', request.agentId, {
      auditId,
      error: String(error)
    });

    // Record failure for drift tracking
    driftEngine.recordOperation(
      request.agentId,
      request.frame,
      actionTool,
      false
    );

    return {
      success: false,
      agentId: request.agentId,
      frame: request.frame,
      action: actionTool,
      decision: {
        allowed: false,
        frame: request.frame,
        proposedAction: actionTool,
        action: 'block',
        reason: `Execution error: ${error}`,
        coverageConfidence: 1.0,
        confidence: 1.0,
        timestamp: Date.now(),
        auditId,
      },
      executionTime: Date.now() - startTime,
      auditId
    };
  }
}

// ============================================================================
// BATCH EXECUTION
// ============================================================================

export interface BatchExecuteRequest {
  agentId: string;
  frame: string;
  actions: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    description?: string;
  }>;
  parentFrame?: string;
  stopOnFirstFailure?: boolean;
  parallel?: boolean;
}

export interface BatchExecuteResult {
  agentId: string;
  frame: string;
  allSucceeded: boolean;
  results: PSExecuteResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    blocked: number;
  };
  totalExecutionTime: number;
}

export async function ps_execute_batch(request: BatchExecuteRequest): Promise<BatchExecuteResult> {
  const startTime = Date.now();
  const results: PSExecuteResult[] = [];
  let blocked = 0;
  let failed = 0;
  let succeeded = 0;

  if (request.parallel) {
    // Execute all actions in parallel
    const promises = request.actions.map(action =>
      ps_execute({
        agentId: request.agentId,
        frame: request.frame,
        action,
        parentFrame: request.parentFrame
      })
    );

    const allResults = await Promise.all(promises);
    results.push(...allResults);

    for (const r of allResults) {
      if (r.success) succeeded++;
      else if (r.decision.action === 'block') blocked++;
      else failed++;
    }
  } else {
    // Execute sequentially
    for (const action of request.actions) {
      const result = await ps_execute({
        agentId: request.agentId,
        frame: request.frame,
        action,
        parentFrame: request.parentFrame
      });

      results.push(result);

      if (result.success) succeeded++;
      else if (result.decision.action === 'block') blocked++;
      else failed++;

      if (request.stopOnFirstFailure && !result.success) {
        break;
      }
    }
  }

  return {
    agentId: request.agentId,
    frame: request.frame,
    allSucceeded: succeeded === request.actions.length,
    results,
    summary: {
      total: results.length,
      succeeded,
      failed,
      blocked
    },
    totalExecutionTime: Date.now() - startTime
  };
}

// ============================================================================
// DRY RUN
// ============================================================================

export interface DryRunRequest {
  agentId: string;
  frame: string;
  action: {
    tool: string;
    arguments: Record<string, unknown>;
  };
  parentFrame?: string;
}

export interface DryRunResult {
  wouldSucceed: boolean;
  decision: InterceptorDecision;
  validationReport: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
  };
  coverageAnalysis: {
    confidence: number;
    uncoveredAspects: string[];
  };
}

export function ps_execute_dry_run(request: DryRunRequest): DryRunResult {
  // Get interceptor decision without executing
  const decision = gatekeeper.precheck(
    request.frame,
    request.action.tool,
    request.action.arguments,
    request.parentFrame
  );

  return {
    wouldSucceed: decision.action === 'allow',
    decision,
    validationReport: {
      valid: decision.validationReport?.valid ?? false,
      errorCount: (decision.validationReport?.errors ?? []).length,
      warningCount: (decision.validationReport?.warnings ?? []).length
    },
    coverageAnalysis: {
      confidence: decision.coverageConfidence ?? 0,
      uncoveredAspects: decision.uncoveredAspects ?? []
    }
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `audit_${timestamp}_${random}`;
}
