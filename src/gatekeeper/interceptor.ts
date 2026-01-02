// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - ACTION INTERCEPTOR
// ═══════════════════════════════════════════════════════════════════════════
// The Interceptor is the enforcement layer that blocks or allows actions
// based on frame validation and operator configuration.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ResolvedFrame,
  InterceptorDecision,
  ConfidenceThresholds,
  AuditLogEntry,
} from '../types/index.js';
import { generateAuditId } from '../utils/hash.js';
import { CoverageCalculator } from './coverage.js';

export class ActionInterceptor {
  private coverageCalculator: CoverageCalculator;
  private thresholds: ConfidenceThresholds;
  private auditLog: AuditLogEntry[] = [];
  private rateLimitTracker: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(thresholds?: ConfidenceThresholds) {
    this.coverageCalculator = new CoverageCalculator();
    this.thresholds = thresholds || {
      preExecute: 0.85,
      postAudit: 0.90,
      coverageMinimum: 0.80,
      driftThreshold: 0.15,
    };
  }

  /**
   * Update confidence thresholds (operator control).
   */
  setThresholds(thresholds: ConfidenceThresholds): void {
    this.thresholds = thresholds;
  }

  /**
   * Get current thresholds.
   */
  getThresholds(): ConfidenceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Make an interception decision for a proposed action.
   */
  intercept(
    resolvedFrame: ResolvedFrame,
    proposedTool: string,
    proposedArgs: Record<string, unknown>,
    agentId: string
  ): InterceptorDecision {
    const auditId = generateAuditId();
    const timestamp = Date.now();

    // Check 1: Parse confidence
    const parseConfidence = resolvedFrame.parseConfidence ?? 1.0;
    if (parseConfidence < this.thresholds.preExecute) {
      return this.createDecision(
        false,
        `Parse confidence ${parseConfidence.toFixed(2)} below threshold ${this.thresholds.preExecute}`,
        resolvedFrame.raw,
        proposedTool,
        parseConfidence,
        timestamp,
        auditId,
        agentId
      );
    }

    // Check 2: Tool binding check
    if (!this.isToolAllowed(resolvedFrame, proposedTool)) {
      return this.createDecision(
        false,
        `Tool "${proposedTool}" not allowed by frame bindings`,
        resolvedFrame.raw,
        proposedTool,
        0,
        timestamp,
        auditId,
        agentId
      );
    }

    // Check 3: Coverage confidence
    const coverage = this.coverageCalculator.calculate(resolvedFrame, proposedTool, proposedArgs);
    if (coverage.confidence < this.thresholds.coverageMinimum) {
      return this.createDecision(
        false,
        `Coverage confidence ${coverage.confidence.toFixed(2)} below threshold ${this.thresholds.coverageMinimum}. ${coverage.details}`,
        resolvedFrame.raw,
        proposedTool,
        coverage.confidence,
        timestamp,
        auditId,
        agentId
      );
    }

    // Check 4: Rate limiting
    if (resolvedFrame.toolBindings.rateLimit) {
      const rateLimitResult = this.checkRateLimit(agentId, resolvedFrame.toolBindings.rateLimit);
      if (!rateLimitResult.allowed) {
        return this.createDecision(
          false,
          rateLimitResult.reason,
          resolvedFrame.raw,
          proposedTool,
          coverage.confidence,
          timestamp,
          auditId,
          agentId
        );
      }
    }

    // Check 5: Forbidden constraint blocks execution
    if (resolvedFrame.effectiveConstraint?.name === 'forbidden') {
      const extensions = resolvedFrame.effectiveConstraint.extensions || {};
      if (extensions['decoy_response']) {
        // Operator configured decoy mode - return success but don't actually execute
        this.logAudit(auditId, timestamp, agentId, 'execute', resolvedFrame.raw, 'blocked', {
          decoyMode: true,
          tool: proposedTool,
        });
        return this.createDecision(
          false,
          'Action blocked by forbidden constraint (decoy response enabled)',
          resolvedFrame.raw,
          proposedTool,
          coverage.confidence,
          timestamp,
          auditId,
          agentId
        );
      }
      return this.createDecision(
        false,
        'Action blocked by forbidden constraint (⛔)',
        resolvedFrame.raw,
        proposedTool,
        coverage.confidence,
        timestamp,
        auditId,
        agentId
      );
    }

    // All checks passed
    this.logAudit(auditId, timestamp, agentId, 'execute', resolvedFrame.raw, 'allowed', {
      tool: proposedTool,
      coverageConfidence: coverage.confidence,
    });

    return this.createDecision(
      true,
      'Action allowed',
      resolvedFrame.raw,
      proposedTool,
      coverage.confidence,
      timestamp,
      auditId,
      agentId
    );
  }

  /**
   * Check if a tool is allowed by the frame bindings.
   */
  private isToolAllowed(resolvedFrame: ResolvedFrame, toolName: string): boolean {
    const { blocked, allowed } = resolvedFrame.toolBindings;

    // Check blocked patterns first
    for (const pattern of blocked) {
      if (this.matchPattern(pattern, toolName)) {
        return false;
      }
    }

    // Check allowed patterns
    for (const pattern of allowed) {
      if (this.matchPattern(pattern, toolName)) {
        return true;
      }
    }

    // Default deny
    return false;
  }

  /**
   * Match a tool name against a pattern.
   */
  private matchPattern(pattern: string, toolName: string): boolean {
    if (pattern === '*') return true;

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(toolName);
    }

    return pattern === toolName;
  }

  /**
   * Check rate limiting.
   */
  private checkRateLimit(agentId: string, rateLimit: string): { allowed: boolean; reason: string } {
    const match = rateLimit.match(/^(\d+)\/(\w+)$/);
    if (!match) {
      return { allowed: true, reason: '' };
    }

    const limit = parseInt(match[1], 10);
    const window = match[2];

    let windowMs: number;
    switch (window) {
      case 'sec':
        windowMs = 1000;
        break;
      case 'min':
        windowMs = 60000;
        break;
      case 'hour':
        windowMs = 3600000;
        break;
      default:
        windowMs = 60000;
    }

    const key = `${agentId}:${rateLimit}`;
    const now = Date.now();
    const tracker = this.rateLimitTracker.get(key);

    if (!tracker || now - tracker.windowStart > windowMs) {
      // New window
      this.rateLimitTracker.set(key, { count: 1, windowStart: now });
      return { allowed: true, reason: '' };
    }

    if (tracker.count >= limit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limit}/${window}. Try again in ${Math.ceil((tracker.windowStart + windowMs - now) / 1000)}s`,
      };
    }

    tracker.count++;
    return { allowed: true, reason: '' };
  }

  /**
   * Create an interception decision.
   */
  private createDecision(
    allowed: boolean,
    reason: string,
    frame: string,
    proposedAction: string,
    coverageConfidence: number,
    timestamp: number,
    auditId: string,
    agentId: string
  ): InterceptorDecision {
    if (!allowed) {
      this.logAudit(auditId, timestamp, agentId, 'execute', frame, 'blocked', {
        reason,
        proposedAction,
        coverageConfidence,
      });
    }

    return {
      allowed,
      reason,
      frame,
      proposedAction,
      coverageConfidence,
      timestamp,
      auditId,
    };
  }

  /**
   * Log an audit entry.
   */
  private logAudit(
    auditId: string,
    timestamp: number,
    agentId: string,
    eventType: AuditLogEntry['eventType'],
    frame: string,
    decision: AuditLogEntry['decision'],
    details: Record<string, unknown>
  ): void {
    this.auditLog.push({
      auditId,
      timestamp,
      agentId,
      eventType,
      frame,
      decision,
      details,
    });

    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  /**
   * Get audit log entries.
   */
  getAuditLog(limit: number = 100): AuditLogEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Get audit log entries for a specific agent.
   */
  getAgentAuditLog(agentId: string, limit: number = 100): AuditLogEntry[] {
    return this.auditLog
      .filter(entry => entry.agentId === agentId)
      .slice(-limit);
  }

  /**
   * Clear the audit log.
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}

// Singleton instance
export const interceptor = new ActionInterceptor();
