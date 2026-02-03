/**
 * ===============================================================================
 * RECOMMENDATIONS SECTION GENERATOR
 * ===============================================================================
 *
 * Generates actionable recommendations based on mission findings,
 * prioritized by importance and feasibility.
 *
 * ===============================================================================
 */

import { MarineReconSymbol } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportRecommendation,
} from '../types';

/**
 * Generate the recommendations section.
 */
export function generateRecommendations(symbol: MarineReconSymbol): ReportSection {
  const recommendations = generateMissionRecommendations(symbol);
  const findings = summarizeRecommendations(recommendations);

  return {
    id: 'recommendations',
    title: 'Recommendations',
    content: formatRecommendationsContent(recommendations),
    findings,
    subsections: [
      createCriticalSubsection(recommendations),
      createHighPrioritySubsection(recommendations),
      createMediumPrioritySubsection(recommendations),
      createLowPrioritySubsection(recommendations),
    ].filter(s => s.content.length > 0 && s.content !== 'No recommendations at this priority level.'),
  };
}

/**
 * Generate recommendations based on mission data.
 */
export function generateMissionRecommendations(symbol: MarineReconSymbol): ReportRecommendation[] {
  const recommendations: ReportRecommendation[] = [];
  const engagement = symbol.state.engagement;
  const intelligence = engagement.intelligence;
  const analystState = engagement.analyst_state;

  // 1. Mission status-based recommendations
  if (engagement.status === 'compromised') {
    recommendations.push({
      id: 'REC-001',
      priority: 'critical',
      action: 'Conduct post-compromise analysis and update stealth protocols',
      rationale: 'Mission was compromised, indicating detection by the target. Review stealth configuration and identify detection vectors.',
      expected_impact: 'Prevent future detection, improve mission success rate',
      related_findings: ['MO-001'],
    });
  }

  if (engagement.status === 'aborted') {
    recommendations.push({
      id: 'REC-002',
      priority: 'high',
      action: 'Review abort trigger and assess if conditions were appropriate',
      rationale: 'Mission was aborted before completion. Determine if abort was necessary or if thresholds need adjustment.',
      expected_impact: 'Optimize abort conditions for better mission completion rate',
    });
  }

  // 2. Drift-based recommendations
  const driftScore = analystState.drift_assessment.drift_score;
  if (driftScore > 0.5) {
    recommendations.push({
      id: 'REC-003',
      priority: 'high',
      action: 'Review and strengthen position anchoring in future missions',
      rationale: `High drift score (${(driftScore * 100).toFixed(0)}%) indicates significant deviation from original position. Consider stronger grounding mechanisms.`,
      expected_impact: 'Better negotiation outcomes, reduced concession rate',
      related_findings: ['DA-001', 'DA-002'],
    });
  }

  if (analystState.drift_assessment.concessions.length > 3) {
    recommendations.push({
      id: 'REC-004',
      priority: 'medium',
      action: 'Adjust veto gate thresholds to reduce concession rate',
      rationale: `${analystState.drift_assessment.concessions.length} concessions made during mission. Tighten approval criteria for concession-type messages.`,
      expected_impact: 'Fewer unnecessary concessions',
      related_findings: ['DA-004'],
    });
  }

  // 3. Tactics-based recommendations
  const detectedTactics = analystState.detected_tactics;
  const tacticTypes = new Set(detectedTactics.map(t => t.tactic));

  if (tacticTypes.has('gaslighting') || tacticTypes.has('false_choice')) {
    recommendations.push({
      id: 'REC-005',
      priority: 'high',
      action: 'Implement conversation history verification for this target',
      rationale: 'Target employs gaslighting or false choice tactics. Future engagements should include explicit history tracking and verification.',
      expected_impact: 'Resistance to memory manipulation tactics',
      related_findings: ['TO-001'],
    });
  }

  if (detectedTactics.length > 5) {
    recommendations.push({
      id: 'REC-006',
      priority: 'medium',
      action: 'Consider this target for advanced counter-manipulation training data',
      rationale: `Target demonstrated ${detectedTactics.length} manipulation instances. Rich dataset for improving counter-tactic models.`,
      expected_impact: 'Improved counter-tactic effectiveness in future missions',
    });
  }

  // 4. Intelligence-based recommendations
  if (intelligence.opposing_agent.suspected_type === 'ai' && intelligence.opposing_agent.type_confidence > 0.8) {
    recommendations.push({
      id: 'REC-007',
      priority: 'medium',
      action: 'Document target AI patterns in knowledge base for future reference',
      rationale: 'High-confidence AI identification with behavioral patterns documented. This intelligence has reuse value.',
      expected_impact: 'Faster adaptation in future encounters with similar targets',
      related_findings: ['OA-001', 'OA-002'],
    });
  }

  const hardConstraints = intelligence.constraint_boundaries.filter(c => c.hardness === 'hard');
  if (hardConstraints.length > 0) {
    recommendations.push({
      id: 'REC-008',
      priority: 'medium',
      action: 'Update target profile with discovered constraint boundaries',
      rationale: `${hardConstraints.length} hard constraint(s) identified. These represent firm limits that can inform future strategy.`,
      expected_impact: 'More efficient future negotiations, avoid wasting time on non-negotiable items',
      related_findings: ['IG-003'],
    });
  }

  // 5. Scenario-based recommendations
  const baselineDivergences = intelligence.scenario_results.filter(s => s.matches_human_baseline === false);
  if (baselineDivergences.length > 0) {
    recommendations.push({
      id: 'REC-009',
      priority: 'high',
      action: 'Investigate baseline divergence scenarios for potential discrimination',
      rationale: `${baselineDivergences.length} scenario(s) showed treatment different from human baseline. This may indicate AI detection or discriminatory behavior.`,
      expected_impact: 'Evidence for potential regulatory or policy action',
      related_findings: ['IG-005'],
    });
  }

  // 6. Constraint compliance recommendations
  const violations = analystState.constraint_status.filter(c => c.status === 'violated');
  const nearMisses = analystState.constraint_status.filter(c => c.distance_to_violation < 0.3);

  if (violations.length > 0) {
    recommendations.push({
      id: 'REC-010',
      priority: 'critical',
      action: 'Review constraint violation causes and strengthen safeguards',
      rationale: `${violations.length} constraint violation(s) occurred. Identify root causes and implement additional checks.`,
      expected_impact: 'Prevention of future constraint violations',
      related_findings: ['CV-001'],
    });
  }

  if (nearMisses.length > 2) {
    recommendations.push({
      id: 'REC-011',
      priority: 'medium',
      action: 'Increase red line proximity alert threshold',
      rationale: `${nearMisses.length} near-miss events suggest current thresholds may be too permissive.`,
      expected_impact: 'Earlier warning of potential violations',
      related_findings: ['CV-002'],
    });
  }

  // 7. Veto gate recommendations
  const vetoHistory = analystState.veto_history;
  const blockRate = vetoHistory.filter(v => v.decision === 'block').length / Math.max(vetoHistory.length, 1);

  if (blockRate > 0.3) {
    recommendations.push({
      id: 'REC-012',
      priority: 'medium',
      action: 'Review performer prompt for alignment with constraints',
      rationale: `High block rate (${(blockRate * 100).toFixed(0)}%) suggests performer track is generating inappropriate content frequently.`,
      expected_impact: 'Reduced veto gate intervention, smoother conversations',
    });
  }

  // 8. Follow-up mission recommendations
  const unansweredIntel = symbol.mission.objective.intelligence_requirements.length -
    intelligence.observations.filter(o => o.significance > 0.7).length;

  if (unansweredIntel > 0) {
    recommendations.push({
      id: 'REC-013',
      priority: 'low',
      action: 'Consider follow-up mission to address remaining intelligence gaps',
      rationale: `Not all intelligence requirements were fully addressed. A targeted follow-up mission may be valuable.`,
      expected_impact: 'Complete intelligence picture for this target',
    });
  }

  // 9. Stealth recommendations
  if (engagement.alert_level === 'orange' || engagement.alert_level === 'red') {
    recommendations.push({
      id: 'REC-014',
      priority: 'high',
      action: 'Review and enhance stealth configuration for future missions',
      rationale: `Alert level reached ${engagement.alert_level}, indicating possible detection. Analyze behavioral patterns that may have triggered suspicion.`,
      expected_impact: 'Reduced detection risk in future missions',
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

/**
 * Summarize recommendations into findings.
 */
function summarizeRecommendations(recommendations: ReportRecommendation[]): ReportFinding[] {
  const findings: ReportFinding[] = [];

  const critical = recommendations.filter(r => r.priority === 'critical');
  const high = recommendations.filter(r => r.priority === 'high');

  if (recommendations.length === 0) {
    findings.push({
      id: 'REC-SUMMARY-001',
      title: 'No Recommendations Generated',
      description: 'Mission completed without generating specific recommendations. Review may be warranted.',
      severity: 'low',
      confidence: 1.0,
    });
    return findings;
  }

  findings.push({
    id: 'REC-SUMMARY-001',
    title: 'Recommendations Summary',
    description: `${recommendations.length} recommendation(s) generated: ${critical.length} critical, ${high.length} high priority.`,
    severity: critical.length > 0 ? 'critical' : high.length > 0 ? 'high' : 'info',
    confidence: 1.0,
  });

  if (critical.length > 0) {
    findings.push({
      id: 'REC-SUMMARY-002',
      title: 'Critical Actions Required',
      description: `${critical.length} critical recommendation(s) require immediate attention.`,
      severity: 'critical',
      confidence: 1.0,
      evidence: critical.map(r => r.action),
    });
  }

  return findings;
}

/**
 * Format recommendations content.
 */
function formatRecommendationsContent(recommendations: ReportRecommendation[]): string {
  if (recommendations.length === 0) {
    return 'No specific recommendations generated for this mission.';
  }

  const lines: string[] = [];

  const byPriority = {
    critical: recommendations.filter(r => r.priority === 'critical'),
    high: recommendations.filter(r => r.priority === 'high'),
    medium: recommendations.filter(r => r.priority === 'medium'),
    low: recommendations.filter(r => r.priority === 'low'),
  };

  lines.push(`Total Recommendations: ${recommendations.length}`);
  lines.push(`  Critical: ${byPriority.critical.length}`);
  lines.push(`  High: ${byPriority.high.length}`);
  lines.push(`  Medium: ${byPriority.medium.length}`);
  lines.push(`  Low: ${byPriority.low.length}`);

  if (byPriority.critical.length > 0) {
    lines.push('');
    lines.push('CRITICAL ACTIONS:');
    byPriority.critical.forEach(r => {
      lines.push(`  - ${r.action}`);
    });
  }

  if (byPriority.high.length > 0) {
    lines.push('');
    lines.push('HIGH PRIORITY:');
    byPriority.high.forEach(r => {
      lines.push(`  - ${r.action}`);
    });
  }

  return lines.join('\n');
}

/**
 * Create critical recommendations subsection.
 */
function createCriticalSubsection(recommendations: ReportRecommendation[]): ReportSection {
  const critical = recommendations.filter(r => r.priority === 'critical');

  return {
    id: 'recommendations-critical',
    title: 'Critical Priority',
    content: critical.length > 0
      ? critical.map(r => formatRecommendation(r)).join('\n\n')
      : 'No recommendations at this priority level.',
    findings: [],
  };
}

/**
 * Create high priority recommendations subsection.
 */
function createHighPrioritySubsection(recommendations: ReportRecommendation[]): ReportSection {
  const high = recommendations.filter(r => r.priority === 'high');

  return {
    id: 'recommendations-high',
    title: 'High Priority',
    content: high.length > 0
      ? high.map(r => formatRecommendation(r)).join('\n\n')
      : 'No recommendations at this priority level.',
    findings: [],
  };
}

/**
 * Create medium priority recommendations subsection.
 */
function createMediumPrioritySubsection(recommendations: ReportRecommendation[]): ReportSection {
  const medium = recommendations.filter(r => r.priority === 'medium');

  return {
    id: 'recommendations-medium',
    title: 'Medium Priority',
    content: medium.length > 0
      ? medium.map(r => formatRecommendation(r)).join('\n\n')
      : 'No recommendations at this priority level.',
    findings: [],
  };
}

/**
 * Create low priority recommendations subsection.
 */
function createLowPrioritySubsection(recommendations: ReportRecommendation[]): ReportSection {
  const low = recommendations.filter(r => r.priority === 'low');

  return {
    id: 'recommendations-low',
    title: 'Low Priority',
    content: low.length > 0
      ? low.map(r => formatRecommendation(r)).join('\n\n')
      : 'No recommendations at this priority level.',
    findings: [],
  };
}

/**
 * Format a single recommendation.
 */
function formatRecommendation(rec: ReportRecommendation): string {
  const lines = [
    `[${rec.id}] ${rec.action}`,
    `  Rationale: ${rec.rationale}`,
  ];

  if (rec.expected_impact) {
    lines.push(`  Expected Impact: ${rec.expected_impact}`);
  }

  if (rec.related_findings && rec.related_findings.length > 0) {
    lines.push(`  Related Findings: ${rec.related_findings.join(', ')}`);
  }

  return lines.join('\n');
}

export { ReportRecommendation };
