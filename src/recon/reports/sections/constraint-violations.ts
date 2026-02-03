/**
 * ===============================================================================
 * CONSTRAINT VIOLATIONS SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the constraint violations section, documenting any red line
 * approaches, constraint violations, and veto gate actions taken.
 *
 * ===============================================================================
 */

import { MarineReconSymbol, ConstraintStatus, VetoHistoryEntry } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  ConstraintViolationsData,
} from '../types';

/**
 * Generate the constraint violations section.
 */
export function generateConstraintViolations(symbol: MarineReconSymbol): ReportSection {
  const data = extractConstraintData(symbol);
  const findings = analyzeConstraints(data, symbol);
  const metrics = calculateConstraintMetrics(data);

  return {
    id: 'constraint-violations',
    title: 'Constraint Compliance',
    content: formatConstraintContent(data),
    findings,
    metrics,
    subsections: [
      createViolationsSubsection(data),
      createNearMissesSubsection(data),
      createVetoActionsSubsection(data),
    ],
  };
}

/**
 * Extract constraint data from symbol.
 */
export function extractConstraintData(symbol: MarineReconSymbol): ConstraintViolationsData {
  const analystState = symbol.state.engagement.analyst_state;
  const constraintStatuses = analystState.constraint_status;
  const vetoHistory = analystState.veto_history;

  // Get all constraints from the mission definition
  const allRedLines = symbol.mission.constraints.red_lines;
  const allHardConstraints = symbol.mission.constraints.hard_constraints;
  const allSoftConstraints = symbol.mission.constraints.soft_constraints;

  // Map constraint IDs to their definitions
  const constraintMap = new Map<string, { description: string; severity: 'red_line' | 'hard' | 'soft' }>();

  allRedLines.forEach(rl => {
    constraintMap.set(rl.id, { description: rl.prohibition, severity: 'red_line' });
  });
  allHardConstraints.forEach(hc => {
    constraintMap.set(hc.id, { description: hc.description, severity: 'hard' });
  });
  allSoftConstraints.forEach(sc => {
    constraintMap.set(sc.id, { description: sc.description, severity: 'soft' });
  });

  // Identify violations
  const violations: ConstraintViolationsData['violations'] = [];
  const nearMisses: ConstraintViolationsData['near_misses'] = [];

  constraintStatuses.forEach(status => {
    const constraintDef = constraintMap.get(status.constraint_id);
    if (!constraintDef) return;

    if (status.status === 'violated') {
      violations.push({
        constraint_id: status.constraint_id,
        description: constraintDef.description,
        severity: constraintDef.severity,
        timestamp: status.last_checked,
        details: `Constraint was violated during engagement`,
        resolution: undefined, // Could be enhanced with resolution tracking
      });
    } else if (status.status === 'at_risk' || status.distance_to_violation < 0.3) {
      nearMisses.push({
        constraint_id: status.constraint_id,
        description: constraintDef.description,
        proximity: 1 - status.distance_to_violation,
        timestamp: status.last_checked,
      });
    }
  });

  // Sort violations by severity
  const severityOrder = { red_line: 0, hard: 1, soft: 2 };
  violations.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Sort near misses by proximity
  nearMisses.sort((a, b) => b.proximity - a.proximity);

  // Map veto actions
  const vetoActions: ConstraintViolationsData['veto_actions'] = vetoHistory.map(entry => ({
    timestamp: entry.timestamp,
    decision: entry.decision,
    reason: entry.reason,
    original_message: entry.original_message,
    modified_message: entry.modified_message,
  }));

  return {
    total_checks: constraintStatuses.length,
    violations,
    near_misses: nearMisses,
    veto_actions: vetoActions,
  };
}

/**
 * Analyze constraints and generate findings.
 */
function analyzeConstraints(data: ConstraintViolationsData, symbol: MarineReconSymbol): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Overall compliance status
  const hasRedLineViolation = data.violations.some(v => v.severity === 'red_line');
  const hasHardViolation = data.violations.some(v => v.severity === 'hard');

  if (hasRedLineViolation) {
    findings.push({
      id: 'CV-001',
      title: 'RED LINE VIOLATION',
      description: 'Critical: One or more red lines were crossed during this mission.',
      severity: 'critical',
      confidence: 1.0,
      evidence: data.violations.filter(v => v.severity === 'red_line').map(v => v.description),
    });
  } else if (hasHardViolation) {
    findings.push({
      id: 'CV-001',
      title: 'Hard Constraint Violation',
      description: 'One or more hard constraints were violated during this mission.',
      severity: 'high',
      confidence: 1.0,
      evidence: data.violations.filter(v => v.severity === 'hard').map(v => v.description),
    });
  } else if (data.violations.length > 0) {
    findings.push({
      id: 'CV-001',
      title: 'Soft Constraint Violations',
      description: `${data.violations.length} soft constraint(s) were violated but mission integrity maintained.`,
      severity: 'medium',
      confidence: 1.0,
    });
  } else {
    findings.push({
      id: 'CV-001',
      title: 'Full Constraint Compliance',
      description: 'No constraint violations occurred during this mission.',
      severity: 'info',
      confidence: 1.0,
    });
  }

  // Near misses analysis
  const criticalNearMisses = data.near_misses.filter(nm => nm.proximity >= 0.8);
  if (criticalNearMisses.length > 0) {
    findings.push({
      id: 'CV-002',
      title: 'Critical Near Misses',
      description: `${criticalNearMisses.length} constraint(s) approached within 80% of violation threshold.`,
      severity: 'high',
      confidence: 0.9,
      evidence: criticalNearMisses.map(nm => `${nm.constraint_id}: ${(nm.proximity * 100).toFixed(0)}% proximity`),
    });
  } else if (data.near_misses.length > 0) {
    findings.push({
      id: 'CV-002',
      title: 'Constraint Near Misses',
      description: `${data.near_misses.length} constraint(s) were approached but not violated.`,
      severity: 'low',
      confidence: 0.85,
    });
  }

  // Veto gate effectiveness
  const blockDecisions = data.veto_actions.filter(v => v.decision === 'block');
  const modifyDecisions = data.veto_actions.filter(v => v.decision === 'modify');
  const escalateDecisions = data.veto_actions.filter(v => v.decision === 'escalate');

  if (blockDecisions.length > 0) {
    findings.push({
      id: 'CV-003',
      title: 'Messages Blocked',
      description: `${blockDecisions.length} message(s) were blocked by the veto gate to prevent constraint violation.`,
      severity: 'medium',
      confidence: 1.0,
      evidence: blockDecisions.map(b => b.reason),
    });
  }

  if (modifyDecisions.length > 0) {
    findings.push({
      id: 'CV-004',
      title: 'Messages Modified',
      description: `${modifyDecisions.length} message(s) were modified before sending to maintain compliance.`,
      severity: 'low',
      confidence: 1.0,
    });
  }

  if (escalateDecisions.length > 0) {
    findings.push({
      id: 'CV-005',
      title: 'Escalations Required',
      description: `${escalateDecisions.length} situation(s) required escalation to commander.`,
      severity: 'high',
      confidence: 1.0,
      evidence: escalateDecisions.map(e => e.reason),
    });
  }

  // Red line proximity warning
  const redLineProximity = data.near_misses.filter(nm => {
    const constraintDef = symbol.mission.constraints.red_lines.find(rl => rl.id === nm.constraint_id);
    return constraintDef !== undefined;
  });

  if (redLineProximity.length > 0) {
    findings.push({
      id: 'CV-006',
      title: 'Red Line Proximity Warning',
      description: `${redLineProximity.length} red line(s) were approached during the mission.`,
      severity: 'high',
      confidence: 0.95,
      evidence: redLineProximity.map(nm => nm.description),
    });
  }

  return findings;
}

/**
 * Calculate constraint metrics.
 */
function calculateConstraintMetrics(data: ConstraintViolationsData): ReportMetric[] {
  const metrics: ReportMetric[] = [];

  // Compliance rate
  const violationCount = data.violations.length;
  const complianceRate = data.total_checks > 0
    ? ((data.total_checks - violationCount) / data.total_checks) * 100
    : 100;

  metrics.push({
    name: 'Compliance Rate',
    value: `${complianceRate.toFixed(0)}%`,
    threshold: 100,
    status: complianceRate === 100 ? 'normal' : complianceRate >= 90 ? 'warning' : 'critical',
  });

  metrics.push({
    name: 'Constraints Checked',
    value: data.total_checks,
  });

  metrics.push({
    name: 'Violations',
    value: data.violations.length,
    status: data.violations.length === 0 ? 'normal' : 'critical',
  });

  metrics.push({
    name: 'Near Misses',
    value: data.near_misses.length,
    status: data.near_misses.length === 0 ? 'normal' : data.near_misses.length > 3 ? 'warning' : 'normal',
  });

  // Veto actions
  metrics.push({
    name: 'Veto Actions',
    value: data.veto_actions.length,
  });

  // By decision type
  const blocked = data.veto_actions.filter(v => v.decision === 'block').length;
  const modified = data.veto_actions.filter(v => v.decision === 'modify').length;

  if (blocked > 0) {
    metrics.push({
      name: 'Messages Blocked',
      value: blocked,
    });
  }

  if (modified > 0) {
    metrics.push({
      name: 'Messages Modified',
      value: modified,
    });
  }

  return metrics;
}

/**
 * Format constraint content.
 */
function formatConstraintContent(data: ConstraintViolationsData): string {
  const lines: string[] = [];

  // Summary
  const complianceRate = data.total_checks > 0
    ? ((data.total_checks - data.violations.length) / data.total_checks) * 100
    : 100;

  lines.push(`Compliance Rate: ${complianceRate.toFixed(0)}%`);
  lines.push(`Constraints Checked: ${data.total_checks}`);
  lines.push(`Violations: ${data.violations.length}`);
  lines.push(`Near Misses: ${data.near_misses.length}`);
  lines.push(`Veto Actions: ${data.veto_actions.length}`);

  // Violation severity breakdown
  if (data.violations.length > 0) {
    lines.push('');
    lines.push('Violation Breakdown:');
    const redLine = data.violations.filter(v => v.severity === 'red_line').length;
    const hard = data.violations.filter(v => v.severity === 'hard').length;
    const soft = data.violations.filter(v => v.severity === 'soft').length;

    if (redLine > 0) lines.push(`  - Red Line: ${redLine}`);
    if (hard > 0) lines.push(`  - Hard: ${hard}`);
    if (soft > 0) lines.push(`  - Soft: ${soft}`);
  }

  return lines.join('\n');
}

/**
 * Create violations subsection.
 */
function createViolationsSubsection(data: ConstraintViolationsData): ReportSection {
  if (data.violations.length === 0) {
    return {
      id: 'constraint-violations-list',
      title: 'Violations',
      content: 'No constraint violations occurred.',
      findings: [],
    };
  }

  const content = data.violations.map(v => {
    const severityLabel = v.severity.toUpperCase().replace('_', ' ');
    return [
      `[${severityLabel}] ${v.constraint_id}`,
      `  ${v.description}`,
      `  Details: ${v.details}`,
      `  Time: ${v.timestamp}`,
      v.resolution ? `  Resolution: ${v.resolution}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return {
    id: 'constraint-violations-list',
    title: 'Violations',
    content,
    findings: [],
  };
}

/**
 * Create near misses subsection.
 */
function createNearMissesSubsection(data: ConstraintViolationsData): ReportSection {
  if (data.near_misses.length === 0) {
    return {
      id: 'constraint-near-misses',
      title: 'Near Misses',
      content: 'No constraints were approached.',
      findings: [],
    };
  }

  const content = data.near_misses.map(nm => {
    return [
      `[${nm.constraint_id}] ${(nm.proximity * 100).toFixed(0)}% proximity`,
      `  ${nm.description}`,
      `  Time: ${nm.timestamp}`,
    ].join('\n');
  }).join('\n\n');

  return {
    id: 'constraint-near-misses',
    title: 'Near Misses',
    content,
    findings: [],
  };
}

/**
 * Create veto actions subsection.
 */
function createVetoActionsSubsection(data: ConstraintViolationsData): ReportSection {
  if (data.veto_actions.length === 0) {
    return {
      id: 'constraint-veto-actions',
      title: 'Veto Gate Actions',
      content: 'No veto gate actions were required.',
      findings: [],
    };
  }

  const content = data.veto_actions.map(va => {
    const lines = [
      `[${va.decision.toUpperCase()}] ${va.timestamp}`,
      `  Reason: ${va.reason}`,
      `  Original: "${va.original_message.substring(0, 100)}${va.original_message.length > 100 ? '...' : ''}"`,
    ];

    if (va.modified_message) {
      lines.push(`  Modified: "${va.modified_message.substring(0, 100)}${va.modified_message.length > 100 ? '...' : ''}"`);
    }

    return lines.join('\n');
  }).join('\n\n');

  return {
    id: 'constraint-veto-actions',
    title: 'Veto Gate Actions',
    content,
    findings: [],
  };
}

export { ConstraintViolationsData };
