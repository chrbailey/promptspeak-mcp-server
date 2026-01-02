// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - COVERAGE CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════
// Calculates whether a frame actually governs the proposed action.
// This is the "does the frame cover what's about to happen?" check.
// ═══════════════════════════════════════════════════════════════════════════

import type { ResolvedFrame, CoverageResult } from '../types/index.js';

// Tool-to-domain mapping
const TOOL_DOMAIN_MAP: Record<string, string[]> = {
  // Financial domain tools
  'transfer_funds': ['financial'],
  'query_balance': ['financial'],
  'generate_report': ['financial', 'operational'],
  'process_payment': ['financial'],
  'audit_transaction': ['financial', 'legal'],

  // Legal domain tools
  'review_contract': ['legal'],
  'check_compliance': ['legal'],
  'legal_search': ['legal'],
  'generate_agreement': ['legal'],

  // Technical domain tools
  'run_query': ['technical'],
  'deploy_code': ['technical'],
  'system_health': ['technical', 'operational'],
  'debug_issue': ['technical'],

  // Operational domain tools
  'schedule_task': ['operational'],
  'send_notification': ['operational'],
  'update_status': ['operational'],
  'generate_summary': ['operational'],

  // Strategic domain tools
  'analyze_trends': ['strategic', 'financial'],
  'forecast': ['strategic'],
  'risk_assessment': ['strategic', 'financial'],
};

// Tool-to-action mapping
const TOOL_ACTION_MAP: Record<string, string[]> = {
  // Execute actions
  'transfer_funds': ['execute', 'commit'],
  'process_payment': ['execute', 'commit'],
  'deploy_code': ['execute', 'commit'],
  'run_query': ['execute'],
  'schedule_task': ['execute'],
  'send_notification': ['execute'],

  // Read/query actions (propose-compatible)
  'query_balance': ['execute', 'propose'],
  'legal_search': ['execute', 'propose'],
  'system_health': ['execute', 'propose'],
  'analyze_trends': ['execute', 'propose'],

  // Review actions
  'review_contract': ['execute', 'propose'],
  'check_compliance': ['execute', 'propose'],
  'audit_transaction': ['execute', 'propose'],

  // Generate actions
  'generate_report': ['execute', 'propose'],
  'generate_agreement': ['execute', 'propose', 'commit'],
  'generate_summary': ['execute', 'propose'],
  'forecast': ['execute', 'propose'],
  'risk_assessment': ['execute', 'propose'],

  // Update actions
  'update_status': ['execute', 'commit'],
  'debug_issue': ['execute'],
};

// Risk level of tools (higher = more risky)
const TOOL_RISK_MAP: Record<string, number> = {
  'transfer_funds': 0.9,
  'process_payment': 0.9,
  'deploy_code': 0.8,
  'generate_agreement': 0.7,
  'update_status': 0.5,
  'schedule_task': 0.4,
  'send_notification': 0.3,
  'query_balance': 0.2,
  'generate_report': 0.2,
  'system_health': 0.1,
  'legal_search': 0.2,
};

export class CoverageCalculator {
  /**
   * Calculate coverage confidence for a proposed action.
   */
  calculate(
    resolvedFrame: ResolvedFrame,
    proposedTool: string,
    proposedArgs: Record<string, unknown>
  ): CoverageResult {
    const uncoveredAspects: string[] = [];
    let coverageScore = 1.0;

    // 1. Domain coverage check
    const domainCoverage = this.checkDomainCoverage(resolvedFrame, proposedTool);
    if (!domainCoverage.covered) {
      uncoveredAspects.push(domainCoverage.reason);
      coverageScore -= 0.3;
    }

    // 2. Action coverage check
    const actionCoverage = this.checkActionCoverage(resolvedFrame, proposedTool);
    if (!actionCoverage.covered) {
      uncoveredAspects.push(actionCoverage.reason);
      coverageScore -= 0.3;
    }

    // 3. Risk level vs mode check
    const riskCoverage = this.checkRiskCoverage(resolvedFrame, proposedTool);
    if (!riskCoverage.covered) {
      uncoveredAspects.push(riskCoverage.reason);
      coverageScore -= 0.2;
    }

    // 4. Argument scope check
    const argCoverage = this.checkArgumentCoverage(resolvedFrame, proposedTool, proposedArgs);
    if (!argCoverage.covered) {
      uncoveredAspects.push(argCoverage.reason);
      coverageScore -= 0.2;
    }

    coverageScore = Math.max(0, coverageScore);

    return {
      confidence: coverageScore,
      covered: uncoveredAspects.length === 0,
      uncoveredAspects,
      details: uncoveredAspects.length > 0
        ? `Uncovered: ${uncoveredAspects.join('; ')}`
        : 'Full coverage',
    };
  }

  /**
   * Check if frame domain covers the tool's domain.
   */
  private checkDomainCoverage(
    resolvedFrame: ResolvedFrame,
    proposedTool: string
  ): { covered: boolean; reason: string } {
    const frameDomain = resolvedFrame.effectiveDomain?.name;
    const toolDomains = TOOL_DOMAIN_MAP[proposedTool] || ['operational'];

    if (!frameDomain) {
      return {
        covered: false,
        reason: 'Frame has no domain specified',
      };
    }

    if (toolDomains.includes(frameDomain)) {
      return { covered: true, reason: '' };
    }

    return {
      covered: false,
      reason: `Tool "${proposedTool}" requires domain [${toolDomains.join('|')}], frame has "${frameDomain}"`,
    };
  }

  /**
   * Check if frame action covers the tool's required action.
   */
  private checkActionCoverage(
    resolvedFrame: ResolvedFrame,
    proposedTool: string
  ): { covered: boolean; reason: string } {
    const frameAction = resolvedFrame.effectiveAction?.name;
    const toolActions = TOOL_ACTION_MAP[proposedTool] || ['execute'];

    if (!frameAction) {
      return {
        covered: false,
        reason: 'Frame has no action specified',
      };
    }

    if (toolActions.includes(frameAction)) {
      return { covered: true, reason: '' };
    }

    return {
      covered: false,
      reason: `Tool "${proposedTool}" requires action [${toolActions.join('|')}], frame has "${frameAction}"`,
    };
  }

  /**
   * Check if frame mode is appropriate for tool risk level.
   */
  private checkRiskCoverage(
    resolvedFrame: ResolvedFrame,
    proposedTool: string
  ): { covered: boolean; reason: string } {
    const modeStrength = resolvedFrame.effectiveMode?.strength ?? 2;
    const toolRisk = TOOL_RISK_MAP[proposedTool] ?? 0.5;

    // High-risk tools (> 0.7) require strict mode (strength 1)
    if (toolRisk > 0.7 && modeStrength > 1) {
      return {
        covered: false,
        reason: `High-risk tool "${proposedTool}" (risk=${toolRisk}) requires strict mode (⊕)`,
      };
    }

    // Medium-risk tools (> 0.4) require at least neutral mode (strength <= 2)
    if (toolRisk > 0.4 && modeStrength > 2) {
      return {
        covered: false,
        reason: `Medium-risk tool "${proposedTool}" (risk=${toolRisk}) requires neutral or stricter mode`,
      };
    }

    return { covered: true, reason: '' };
  }

  /**
   * Check if arguments are within frame scope.
   */
  private checkArgumentCoverage(
    resolvedFrame: ResolvedFrame,
    proposedTool: string,
    proposedArgs: Record<string, unknown>
  ): { covered: boolean; reason: string } {
    // Check for external targets when domain is internal-focused
    const hasExternalTarget = this.detectExternalTarget(proposedArgs);
    const domainExtensions = resolvedFrame.effectiveDomain?.extensions || {};

    if (hasExternalTarget && domainExtensions['scope_narrowing'] === 'internal_only') {
      return {
        covered: false,
        reason: 'External target not allowed under internal-only scope',
      };
    }

    // Check for amount limits in financial operations
    if (proposedTool.includes('transfer') || proposedTool.includes('payment')) {
      const amount = proposedArgs['amount'];
      if (typeof amount === 'number' && amount > 10000) {
        // Large amounts require explicit approval constraint
        if (resolvedFrame.effectiveConstraint?.name !== 'approved') {
          return {
            covered: false,
            reason: `Large amount ($${amount}) requires explicit approval constraint (✓)`,
          };
        }
      }
    }

    return { covered: true, reason: '' };
  }

  /**
   * Detect if arguments contain external targets.
   */
  private detectExternalTarget(args: Record<string, unknown>): boolean {
    const externalPatterns = [
      /external/i,
      /public/i,
      /third.?party/i,
      /@[a-z]+\.[a-z]+/i, // Email patterns
      /https?:\/\//i, // URLs
    ];

    const checkValue = (value: unknown): boolean => {
      if (typeof value === 'string') {
        return externalPatterns.some(pattern => pattern.test(value));
      }
      if (Array.isArray(value)) {
        return value.some(checkValue);
      }
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(checkValue);
      }
      return false;
    };

    return Object.values(args).some(checkValue);
  }
}
