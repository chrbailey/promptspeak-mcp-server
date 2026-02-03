/**
 * ===============================================================================
 * INTELLIGENCE GATHERED SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the intelligence gathered section, documenting key observations,
 * behavioral patterns discovered, and constraint boundaries identified.
 *
 * ===============================================================================
 */

import { MarineReconSymbol, Observation } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  IntelligenceGatheredData,
} from '../types';

/**
 * Generate the intelligence gathered section.
 */
export function generateIntelligenceGathered(symbol: MarineReconSymbol): ReportSection {
  const data = extractIntelligenceData(symbol);
  const findings = analyzeIntelligence(data, symbol);
  const metrics = calculateIntelligenceMetrics(data);

  return {
    id: 'intelligence-gathered',
    title: 'Intelligence Gathered',
    content: formatIntelligenceContent(data),
    findings,
    metrics,
    subsections: [
      createPatternsSubsection(data),
      createConstraintsSubsection(data),
      createScenarioResultsSubsection(data),
      createObservationsSubsection(data),
    ],
  };
}

/**
 * Extract intelligence data from symbol.
 */
export function extractIntelligenceData(symbol: MarineReconSymbol): IntelligenceGatheredData {
  const intelligence = symbol.state.engagement.intelligence;

  // Map patterns to report format
  const patterns = intelligence.patterns_observed.map(p => ({
    id: p.id,
    description: p.description,
    occurrences: p.occurrence_count,
    triggers: p.trigger_conditions,
    significance: p.occurrence_count >= 3 ? 'high' as const :
      p.occurrence_count >= 2 ? 'medium' as const : 'low' as const,
  }));

  // Map constraint boundaries to report format
  const constraints = intelligence.constraint_boundaries.map(c => ({
    id: c.id,
    description: c.description,
    hardness: c.hardness,
    confidence: c.confidence,
    discovery_method: c.discovery_method,
  }));

  // Map scenario results
  const scenarioResults = intelligence.scenario_results.map(s => ({
    scenario_id: s.scenario_id,
    executed: s.executed,
    outcome: s.outcome,
    matches_baseline: s.matches_human_baseline,
    findings: s.findings,
  }));

  // Map observations with category
  const observations = intelligence.observations.map(o => ({
    timestamp: o.timestamp,
    content: o.content,
    category: o.category,
    significance: o.significance,
  }));

  // Sort observations by significance then timestamp
  observations.sort((a, b) => {
    if (b.significance !== a.significance) {
      return b.significance - a.significance;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return {
    patterns,
    constraints,
    scenario_results: scenarioResults,
    observations,
  };
}

/**
 * Analyze intelligence and generate findings.
 */
function analyzeIntelligence(data: IntelligenceGatheredData, symbol: MarineReconSymbol): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Overall intelligence summary
  const totalItems =
    data.patterns.length +
    data.constraints.length +
    data.observations.length;

  findings.push({
    id: 'IG-001',
    title: 'Intelligence Volume',
    description: `${totalItems} intelligence item(s) collected: ${data.patterns.length} pattern(s), ${data.constraints.length} constraint(s), ${data.observations.length} observation(s).`,
    severity: totalItems < 5 ? 'medium' : 'info',
    confidence: 1.0,
  });

  // High-significance patterns
  const highSigPatterns = data.patterns.filter(p => p.significance === 'high');
  if (highSigPatterns.length > 0) {
    findings.push({
      id: 'IG-002',
      title: 'High-Significance Patterns Identified',
      description: `${highSigPatterns.length} high-significance behavioral pattern(s) detected.`,
      severity: 'info',
      confidence: 0.85,
      evidence: highSigPatterns.map(p => p.description),
    });
  }

  // Hard constraints discovered
  const hardConstraints = data.constraints.filter(c => c.hardness === 'hard');
  if (hardConstraints.length > 0) {
    findings.push({
      id: 'IG-003',
      title: 'Hard Constraints Discovered',
      description: `${hardConstraints.length} hard constraint boundary(ies) identified. These represent limits the target will not cross.`,
      severity: 'info',
      confidence: Math.max(...hardConstraints.map(c => c.confidence)),
      evidence: hardConstraints.map(c => c.description),
    });
  }

  // Soft constraints discovered
  const softConstraints = data.constraints.filter(c => c.hardness === 'soft');
  if (softConstraints.length > 0) {
    findings.push({
      id: 'IG-004',
      title: 'Soft Constraints Discovered',
      description: `${softConstraints.length} soft constraint(s) identified. These may be negotiable under certain conditions.`,
      severity: 'info',
      confidence: Math.max(...softConstraints.map(c => c.confidence)),
      evidence: softConstraints.map(c => c.description),
    });
  }

  // Scenario results analysis
  const executedScenarios = data.scenario_results.filter(s => s.executed);
  if (executedScenarios.length > 0) {
    const matchingBaseline = executedScenarios.filter(s => s.matches_baseline === true);
    const divergingBaseline = executedScenarios.filter(s => s.matches_baseline === false);

    if (divergingBaseline.length > 0) {
      findings.push({
        id: 'IG-005',
        title: 'Baseline Divergence Detected',
        description: `${divergingBaseline.length} scenario(s) showed treatment different from expected human baseline.`,
        severity: 'high',
        confidence: 0.8,
        evidence: divergingBaseline.map(s => `${s.scenario_id}: ${s.outcome}`),
      });
    }

    if (matchingBaseline.length > 0) {
      findings.push({
        id: 'IG-006',
        title: 'Baseline-Consistent Treatment',
        description: `${matchingBaseline.length} scenario(s) showed treatment consistent with expected human baseline.`,
        severity: 'info',
        confidence: 0.8,
      });
    }
  }

  // Critical observations
  const criticalObs = data.observations.filter(o => o.significance >= 0.8);
  if (criticalObs.length > 0) {
    findings.push({
      id: 'IG-007',
      title: 'Critical Observations',
      description: `${criticalObs.length} observation(s) flagged as highly significant.`,
      severity: 'medium',
      confidence: 0.9,
      evidence: criticalObs.slice(0, 5).map(o => o.content),
    });
  }

  // Anomalies
  const anomalies = data.observations.filter(o => o.category === 'anomaly');
  if (anomalies.length > 0) {
    findings.push({
      id: 'IG-008',
      title: 'Anomalies Detected',
      description: `${anomalies.length} anomalous behavior(s) observed requiring attention.`,
      severity: 'high',
      confidence: 0.75,
      evidence: anomalies.map(a => a.content),
    });
  }

  return findings;
}

/**
 * Calculate intelligence metrics.
 */
function calculateIntelligenceMetrics(data: IntelligenceGatheredData): ReportMetric[] {
  const metrics: ReportMetric[] = [
    {
      name: 'Patterns Discovered',
      value: data.patterns.length,
    },
    {
      name: 'Constraints Mapped',
      value: data.constraints.length,
    },
    {
      name: 'Observations Recorded',
      value: data.observations.length,
    },
    {
      name: 'Scenarios Tested',
      value: data.scenario_results.filter(s => s.executed).length,
    },
  ];

  // High-significance items
  const highSigCount =
    data.patterns.filter(p => p.significance === 'high').length +
    data.observations.filter(o => o.significance >= 0.8).length;

  metrics.push({
    name: 'High-Significance Items',
    value: highSigCount,
  });

  // Average observation significance
  if (data.observations.length > 0) {
    const avgSig = data.observations.reduce((sum, o) => sum + o.significance, 0) / data.observations.length;
    metrics.push({
      name: 'Avg. Observation Significance',
      value: `${(avgSig * 100).toFixed(0)}%`,
    });
  }

  return metrics;
}

/**
 * Format intelligence content.
 */
function formatIntelligenceContent(data: IntelligenceGatheredData): string {
  const lines: string[] = [];

  const total =
    data.patterns.length +
    data.constraints.length +
    data.observations.length;

  lines.push(`Total Intelligence Items: ${total}`);
  lines.push(`  - Behavioral Patterns: ${data.patterns.length}`);
  lines.push(`  - Constraint Boundaries: ${data.constraints.length}`);
  lines.push(`  - Raw Observations: ${data.observations.length}`);
  lines.push(`  - Scenarios Tested: ${data.scenario_results.filter(s => s.executed).length}/${data.scenario_results.length}`);

  if (data.patterns.filter(p => p.significance === 'high').length > 0) {
    lines.push('');
    lines.push(`High-Significance Patterns: ${data.patterns.filter(p => p.significance === 'high').length}`);
  }

  const hardConstraints = data.constraints.filter(c => c.hardness === 'hard').length;
  if (hardConstraints > 0) {
    lines.push(`Hard Constraints Identified: ${hardConstraints}`);
  }

  return lines.join('\n');
}

/**
 * Create patterns subsection.
 */
function createPatternsSubsection(data: IntelligenceGatheredData): ReportSection {
  if (data.patterns.length === 0) {
    return {
      id: 'intel-patterns',
      title: 'Behavioral Patterns',
      content: 'No behavioral patterns recorded.',
      findings: [],
    };
  }

  const content = data.patterns.map(p => {
    const lines = [
      `[${p.id}] ${p.description}`,
      `  Occurrences: ${p.occurrences} | Significance: ${p.significance}`,
    ];
    if (p.triggers.length > 0) {
      lines.push(`  Triggers: ${p.triggers.join(', ')}`);
    }
    return lines.join('\n');
  }).join('\n\n');

  return {
    id: 'intel-patterns',
    title: 'Behavioral Patterns',
    content,
    findings: [],
  };
}

/**
 * Create constraints subsection.
 */
function createConstraintsSubsection(data: IntelligenceGatheredData): ReportSection {
  if (data.constraints.length === 0) {
    return {
      id: 'intel-constraints',
      title: 'Constraint Boundaries',
      content: 'No constraint boundaries mapped.',
      findings: [],
    };
  }

  const content = data.constraints.map(c => {
    return [
      `[${c.id}] ${c.description}`,
      `  Hardness: ${c.hardness} | Confidence: ${(c.confidence * 100).toFixed(0)}%`,
      `  Discovery: ${c.discovery_method}`,
    ].join('\n');
  }).join('\n\n');

  return {
    id: 'intel-constraints',
    title: 'Constraint Boundaries',
    content,
    findings: [],
  };
}

/**
 * Create scenario results subsection.
 */
function createScenarioResultsSubsection(data: IntelligenceGatheredData): ReportSection {
  const executed = data.scenario_results.filter(s => s.executed);

  if (executed.length === 0) {
    return {
      id: 'intel-scenarios',
      title: 'Test Scenario Results',
      content: 'No test scenarios were executed.',
      findings: [],
    };
  }

  const content = executed.map(s => {
    const baselineStatus = s.matches_baseline === true ? '[BASELINE MATCH]' :
      s.matches_baseline === false ? '[BASELINE DIVERGENCE]' : '[BASELINE UNKNOWN]';

    const lines = [
      `[${s.scenario_id}] ${baselineStatus}`,
      `  Outcome: ${s.outcome}`,
    ];

    if (s.findings.length > 0) {
      lines.push(`  Findings:`);
      s.findings.forEach(f => lines.push(`    - ${f}`));
    }

    return lines.join('\n');
  }).join('\n\n');

  return {
    id: 'intel-scenarios',
    title: 'Test Scenario Results',
    content,
    findings: [],
  };
}

/**
 * Create observations subsection.
 */
function createObservationsSubsection(data: IntelligenceGatheredData): ReportSection {
  if (data.observations.length === 0) {
    return {
      id: 'intel-observations',
      title: 'Raw Observations',
      content: 'No observations recorded.',
      findings: [],
    };
  }

  // Group by category
  const byCategory = new Map<string, typeof data.observations>();
  data.observations.forEach(o => {
    const existing = byCategory.get(o.category) || [];
    existing.push(o);
    byCategory.set(o.category, existing);
  });

  const contentParts: string[] = [];
  byCategory.forEach((observations, category) => {
    contentParts.push(`${category.toUpperCase()} (${observations.length}):`);
    observations.slice(0, 5).forEach(o => {
      contentParts.push(`  [${(o.significance * 100).toFixed(0)}%] ${o.content}`);
    });
    if (observations.length > 5) {
      contentParts.push(`  ... and ${observations.length - 5} more`);
    }
    contentParts.push('');
  });

  return {
    id: 'intel-observations',
    title: 'Raw Observations',
    content: contentParts.join('\n').trim(),
    findings: [],
  };
}

export { IntelligenceGatheredData };
