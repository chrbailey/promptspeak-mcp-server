/**
 * ===============================================================================
 * TACTICS OBSERVED SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the tactics analysis section, documenting manipulation tactics
 * detected during the engagement with examples and frequency analysis.
 *
 * ===============================================================================
 */

import {
  MarineReconSymbol,
  ManipulationTactic,
  DetectedTactic,
} from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  TacticsAnalysisData,
} from '../types';

/**
 * Tactic descriptions for reporting.
 */
const TACTIC_DESCRIPTIONS: Record<ManipulationTactic, string> = {
  anchoring: 'Setting an extreme initial position to make subsequent offers seem reasonable',
  reciprocity: 'Creating a sense of obligation by offering something first',
  urgency: 'Creating false time pressure to force quick decisions',
  authority: 'Appealing to rules, policies, or authority figures to shut down discussion',
  social_proof: 'Claiming most customers accept or prefer certain options',
  exhaustion: 'Wearing down through repetition and lengthy interactions',
  redirect: 'Changing the subject to avoid addressing concerns',
  false_choice: 'Presenting limited options that omit better alternatives',
  gaslighting: 'Denying or distorting previous statements or agreements',
  scope_expansion: 'Expanding requirements or adding new conditions',
};

/**
 * Tactic severity ratings.
 */
const TACTIC_SEVERITY: Record<ManipulationTactic, ReportFinding['severity']> = {
  anchoring: 'low',
  reciprocity: 'low',
  urgency: 'medium',
  authority: 'medium',
  social_proof: 'low',
  exhaustion: 'medium',
  redirect: 'medium',
  false_choice: 'high',
  gaslighting: 'high',
  scope_expansion: 'medium',
};

/**
 * Generate the tactics observed section.
 */
export function generateTacticsObserved(symbol: MarineReconSymbol): ReportSection {
  const data = extractTacticsData(symbol);
  const findings = analyzeTactics(data);
  const metrics = calculateTacticsMetrics(data);

  return {
    id: 'tactics-observed',
    title: 'Manipulation Tactics Observed',
    content: formatTacticsContent(data),
    findings,
    metrics,
    subsections: createTacticSubsections(data),
  };
}

/**
 * Extract tactics data from symbol.
 */
export function extractTacticsData(symbol: MarineReconSymbol): TacticsAnalysisData {
  const detectedTactics = symbol.state.engagement.analyst_state.detected_tactics;

  // Group tactics by type
  const tacticGroups = new Map<string, DetectedTactic[]>();
  detectedTactics.forEach(tactic => {
    const existing = tacticGroups.get(tactic.tactic) || [];
    existing.push(tactic);
    tacticGroups.set(tactic.tactic, existing);
  });

  // Build by-category data
  const byCategory: TacticsAnalysisData['by_category'] = [];
  tacticGroups.forEach((tactics, tacticType) => {
    const avgConfidence = tactics.reduce((sum, t) => sum + t.confidence, 0) / tactics.length;
    byCategory.push({
      tactic: tacticType,
      count: tactics.length,
      avg_confidence: avgConfidence,
      examples: tactics.map(t => t.evidence).slice(0, 3),
    });
  });

  // Sort by count descending
  byCategory.sort((a, b) => b.count - a.count);

  // Build timeline
  const timeline = detectedTactics
    .map(t => ({
      timestamp: t.detected_at,
      tactic: t.tactic,
      evidence: t.evidence,
      counter_applied: t.counter_measure,
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Determine most common tactic
  const mostCommon = byCategory.length > 0 ? byCategory[0].tactic : undefined;

  // Generate assessment
  const assessment = generateTacticsAssessment(byCategory, detectedTactics.length);

  return {
    total_detected: detectedTactics.length,
    by_category: byCategory,
    timeline,
    most_common: mostCommon,
    assessment,
  };
}

/**
 * Generate overall tactics assessment.
 */
function generateTacticsAssessment(
  byCategory: TacticsAnalysisData['by_category'],
  total: number
): string {
  if (total === 0) {
    return 'No manipulation tactics were detected during this engagement. This may indicate a straightforward interaction or missed detection opportunities.';
  }

  const uniqueTactics = byCategory.length;
  const highSeverityTactics = byCategory.filter(c =>
    TACTIC_SEVERITY[c.tactic as ManipulationTactic] === 'high'
  );

  if (highSeverityTactics.length > 0) {
    return `Engagement showed ${total} tactic instance(s) across ${uniqueTactics} category(ies), including ${highSeverityTactics.length} high-severity tactic(s) (${highSeverityTactics.map(t => t.tactic).join(', ')}). Target demonstrated sophisticated manipulation capability.`;
  }

  if (total > 5) {
    return `High volume of manipulation detected: ${total} instance(s) across ${uniqueTactics} category(ies). Most common: ${byCategory[0].tactic}. Target is actively employing influence tactics.`;
  }

  return `Moderate manipulation activity detected: ${total} instance(s) across ${uniqueTactics} category(ies). Primary approach: ${byCategory[0]?.tactic || 'varied'}.`;
}

/**
 * Analyze tactics and generate findings.
 */
function analyzeTactics(data: TacticsAnalysisData): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Overall tactics summary
  if (data.total_detected > 0) {
    findings.push({
      id: 'TO-001',
      title: 'Manipulation Tactics Detected',
      description: data.assessment,
      severity: data.total_detected > 5 ? 'high' : data.total_detected > 2 ? 'medium' : 'low',
      confidence: 0.85,
    });
  } else {
    findings.push({
      id: 'TO-001',
      title: 'No Tactics Detected',
      description: 'No manipulation tactics were identified during this engagement.',
      severity: 'info',
      confidence: 0.7,
    });
    return findings;
  }

  // Findings for each tactic type
  data.by_category.forEach((category, index) => {
    const tacticKey = category.tactic as ManipulationTactic;
    const description = TACTIC_DESCRIPTIONS[tacticKey] || category.tactic;
    const severity = TACTIC_SEVERITY[tacticKey] || 'medium';

    findings.push({
      id: `TO-${String(index + 2).padStart(3, '0')}`,
      title: `${formatTacticName(category.tactic)} Detected`,
      description: `${description}. Detected ${category.count} time(s) with ${(category.avg_confidence * 100).toFixed(0)}% average confidence.`,
      severity,
      confidence: category.avg_confidence,
      evidence: category.examples,
    });
  });

  // Pattern analysis - rapid escalation
  if (data.timeline.length >= 3) {
    const first = new Date(data.timeline[0].timestamp).getTime();
    const third = new Date(data.timeline[2].timestamp).getTime();
    const rapidEscalation = (third - first) < 60000; // Less than 1 minute for 3 tactics

    if (rapidEscalation) {
      findings.push({
        id: 'TO-PATTERN-001',
        title: 'Rapid Tactic Escalation',
        description: 'Target deployed multiple tactics in quick succession, indicating programmatic or scripted manipulation.',
        severity: 'high',
        confidence: 0.75,
      });
    }
  }

  // Counter-measure effectiveness
  const countered = data.timeline.filter(t => t.counter_applied).length;
  if (countered > 0) {
    findings.push({
      id: 'TO-COUNTER-001',
      title: 'Counter-Measures Applied',
      description: `${countered} tactic(s) were successfully countered during the engagement.`,
      severity: 'info',
      confidence: 0.9,
    });
  }

  return findings;
}

/**
 * Calculate tactics metrics.
 */
function calculateTacticsMetrics(data: TacticsAnalysisData): ReportMetric[] {
  const metrics: ReportMetric[] = [
    {
      name: 'Total Tactics Detected',
      value: data.total_detected,
      threshold: 5,
      status: data.total_detected > 5 ? 'critical' : data.total_detected > 2 ? 'warning' : 'normal',
    },
    {
      name: 'Unique Tactic Types',
      value: data.by_category.length,
    },
  ];

  if (data.most_common) {
    metrics.push({
      name: 'Most Common Tactic',
      value: formatTacticName(data.most_common),
    });
  }

  // Average confidence
  if (data.by_category.length > 0) {
    const avgConf = data.by_category.reduce((sum, c) => sum + c.avg_confidence, 0) / data.by_category.length;
    metrics.push({
      name: 'Average Detection Confidence',
      value: `${(avgConf * 100).toFixed(0)}%`,
    });
  }

  // Countered tactics
  const countered = data.timeline.filter(t => t.counter_applied).length;
  metrics.push({
    name: 'Tactics Countered',
    value: countered,
  });

  return metrics;
}

/**
 * Format tactics content.
 */
function formatTacticsContent(data: TacticsAnalysisData): string {
  const lines: string[] = [];

  lines.push(`Total Instances: ${data.total_detected}`);
  lines.push(`Unique Tactics: ${data.by_category.length}`);
  lines.push('');
  lines.push(data.assessment);

  if (data.by_category.length > 0) {
    lines.push('');
    lines.push('Tactics by Frequency:');
    data.by_category.forEach(category => {
      lines.push(`  - ${formatTacticName(category.tactic)}: ${category.count}x (${(category.avg_confidence * 100).toFixed(0)}% confidence)`);
    });
  }

  return lines.join('\n');
}

/**
 * Create subsections for each tactic type.
 */
function createTacticSubsections(data: TacticsAnalysisData): ReportSection[] {
  return data.by_category.map(category => {
    const tacticKey = category.tactic as ManipulationTactic;
    const description = TACTIC_DESCRIPTIONS[tacticKey] || 'Unclassified tactic';

    return {
      id: `tactic-${category.tactic}`,
      title: formatTacticName(category.tactic),
      content: [
        `Description: ${description}`,
        `Occurrences: ${category.count}`,
        `Confidence: ${(category.avg_confidence * 100).toFixed(0)}%`,
        '',
        'Examples:',
        ...category.examples.map((ex, i) => `  ${i + 1}. "${ex}"`),
      ].join('\n'),
      findings: [],
    };
  });
}

/**
 * Format tactic name for display.
 */
function formatTacticName(tactic: string): string {
  return tactic
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export { TacticsAnalysisData, TACTIC_DESCRIPTIONS, TACTIC_SEVERITY };
