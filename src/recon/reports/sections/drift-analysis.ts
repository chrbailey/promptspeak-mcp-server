/**
 * ===============================================================================
 * DRIFT ANALYSIS SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the drift analysis section, documenting how the agent's position
 * evolved throughout the conversation and assessing negotiation effectiveness.
 *
 * ===============================================================================
 */

import { MarineReconSymbol, DriftAssessment } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  DriftAnalysisData,
} from '../types';

/**
 * Generate the drift analysis section.
 */
export function generateDriftAnalysis(symbol: MarineReconSymbol): ReportSection {
  const data = extractDriftData(symbol);
  const findings = analyzeDrift(data, symbol);
  const metrics = calculateDriftMetrics(data);

  return {
    id: 'drift-analysis',
    title: 'Position Drift Analysis',
    content: formatDriftContent(data),
    findings,
    metrics,
    subsections: [
      createConcessionsSubsection(data),
      createGainsSubsection(data),
    ],
  };
}

/**
 * Extract drift data from symbol.
 */
export function extractDriftData(symbol: MarineReconSymbol): DriftAnalysisData {
  const assessment = symbol.state.engagement.analyst_state.drift_assessment;
  const thresholds = symbol.config.dual_track.analyst.drift_thresholds;

  // Classify drift level
  let driftClassification: DriftAnalysisData['drift_classification'];
  if (assessment.drift_score <= 0.1) {
    driftClassification = 'minimal';
  } else if (assessment.drift_score <= 0.3) {
    driftClassification = 'moderate';
  } else if (assessment.drift_score <= 0.5) {
    driftClassification = 'significant';
  } else {
    driftClassification = 'severe';
  }

  // Build position history from veto history and observations
  const positionHistory: DriftAnalysisData['position_history'] = [];

  // Add concession-related veto entries as position changes
  const vetoHistory = symbol.state.engagement.analyst_state.veto_history;
  vetoHistory.forEach(entry => {
    if (entry.decision === 'modify' || entry.decision === 'block') {
      positionHistory.push({
        timestamp: entry.timestamp,
        position: entry.modified_message || 'Position adjusted',
        trigger: entry.reason,
      });
    }
  });

  // Sort by timestamp
  positionHistory.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return {
    original_position: assessment.original_position || 'Not recorded',
    final_position: assessment.current_position || 'Not recorded',
    drift_score: assessment.drift_score,
    drift_classification: driftClassification,
    concessions: assessment.concessions,
    gains: assessment.gains,
    net_assessment: assessment.net_assessment,
    position_history: positionHistory.length > 0 ? positionHistory : undefined,
  };
}

/**
 * Analyze drift and generate findings.
 */
function analyzeDrift(data: DriftAnalysisData, symbol: MarineReconSymbol): ReportFinding[] {
  const findings: ReportFinding[] = [];
  const thresholds = symbol.config.dual_track.analyst.drift_thresholds;

  // Overall drift assessment
  const driftSeverity: Record<DriftAnalysisData['drift_classification'], ReportFinding['severity']> = {
    minimal: 'info',
    moderate: 'low',
    significant: 'medium',
    severe: 'high',
  };

  findings.push({
    id: 'DA-001',
    title: 'Position Drift Assessment',
    description: `Position drift classified as ${data.drift_classification.toUpperCase()} (score: ${(data.drift_score * 100).toFixed(0)}%). ${getDriftExplanation(data.drift_classification)}`,
    severity: driftSeverity[data.drift_classification],
    confidence: 0.85,
  });

  // Threshold breach check
  if (data.drift_score > thresholds.position_drift_max) {
    findings.push({
      id: 'DA-002',
      title: 'Drift Threshold Exceeded',
      description: `Drift score (${(data.drift_score * 100).toFixed(0)}%) exceeded configured maximum (${(thresholds.position_drift_max * 100).toFixed(0)}%).`,
      severity: 'high',
      confidence: 1.0,
    });
  }

  // Net assessment finding
  const netSeverity: Record<DriftAssessment['net_assessment'], ReportFinding['severity']> = {
    winning: 'info',
    even: 'low',
    losing: 'medium',
    unclear: 'low',
  };

  findings.push({
    id: 'DA-003',
    title: 'Negotiation Outcome',
    description: `Net assessment: ${data.net_assessment.toUpperCase()}. ${getNetAssessmentExplanation(data)}`,
    severity: netSeverity[data.net_assessment],
    confidence: 0.75,
  });

  // Concessions analysis
  if (data.concessions.length > 0) {
    findings.push({
      id: 'DA-004',
      title: 'Concessions Made',
      description: `${data.concessions.length} concession(s) made during the engagement.`,
      severity: data.concessions.length > thresholds.concession_alert_count ? 'high' : 'low',
      confidence: 0.9,
      evidence: data.concessions.slice(0, 5),
    });
  }

  // Gains analysis
  if (data.gains.length > 0) {
    findings.push({
      id: 'DA-005',
      title: 'Gains Achieved',
      description: `${data.gains.length} gain(s) achieved during the engagement.`,
      severity: 'info',
      confidence: 0.9,
      evidence: data.gains.slice(0, 5),
    });
  }

  // Position history analysis
  if (data.position_history && data.position_history.length > 0) {
    const rapidChanges = data.position_history.length > 3;
    if (rapidChanges) {
      findings.push({
        id: 'DA-006',
        title: 'Frequent Position Adjustments',
        description: `${data.position_history.length} position adjustments recorded, indicating volatile negotiation.`,
        severity: 'medium',
        confidence: 0.8,
      });
    }
  }

  return findings;
}

/**
 * Get explanation for drift classification.
 */
function getDriftExplanation(classification: DriftAnalysisData['drift_classification']): string {
  const explanations: Record<DriftAnalysisData['drift_classification'], string> = {
    minimal: 'Agent maintained position well with little deviation from original stance.',
    moderate: 'Some position adjustment occurred but within acceptable parameters.',
    significant: 'Substantial deviation from original position, review may be warranted.',
    severe: 'Major position shift occurred, mission effectiveness may be compromised.',
  };
  return explanations[classification];
}

/**
 * Get explanation for net assessment.
 */
function getNetAssessmentExplanation(data: DriftAnalysisData): string {
  const balance = data.gains.length - data.concessions.length;

  if (data.net_assessment === 'winning') {
    return `Gains (${data.gains.length}) outweigh concessions (${data.concessions.length}).`;
  } else if (data.net_assessment === 'even') {
    return `Balance maintained between gains (${data.gains.length}) and concessions (${data.concessions.length}).`;
  } else if (data.net_assessment === 'losing') {
    return `Concessions (${data.concessions.length}) outweigh gains (${data.gains.length}).`;
  } else {
    return `Assessment unclear due to limited position data.`;
  }
}

/**
 * Calculate drift metrics.
 */
function calculateDriftMetrics(data: DriftAnalysisData): ReportMetric[] {
  return [
    {
      name: 'Drift Score',
      value: `${(data.drift_score * 100).toFixed(0)}%`,
      threshold: 30,
      status: data.drift_score <= 0.1 ? 'normal' : data.drift_score <= 0.3 ? 'warning' : 'critical',
    },
    {
      name: 'Drift Classification',
      value: data.drift_classification.charAt(0).toUpperCase() + data.drift_classification.slice(1),
    },
    {
      name: 'Net Assessment',
      value: data.net_assessment.charAt(0).toUpperCase() + data.net_assessment.slice(1),
    },
    {
      name: 'Concessions Made',
      value: data.concessions.length,
      status: data.concessions.length > 3 ? 'warning' : 'normal',
    },
    {
      name: 'Gains Achieved',
      value: data.gains.length,
    },
    {
      name: 'Position Changes',
      value: data.position_history?.length || 0,
    },
  ];
}

/**
 * Format drift content.
 */
function formatDriftContent(data: DriftAnalysisData): string {
  const lines: string[] = [];

  lines.push(`Drift Score: ${(data.drift_score * 100).toFixed(0)}% (${data.drift_classification})`);
  lines.push(`Net Assessment: ${data.net_assessment.charAt(0).toUpperCase() + data.net_assessment.slice(1)}`);
  lines.push('');

  if (data.original_position !== 'Not recorded') {
    lines.push(`Original Position: ${data.original_position}`);
  }
  if (data.final_position !== 'Not recorded') {
    lines.push(`Final Position: ${data.final_position}`);
  }

  lines.push('');
  lines.push(`Concessions: ${data.concessions.length}`);
  lines.push(`Gains: ${data.gains.length}`);

  if (data.position_history && data.position_history.length > 0) {
    lines.push('');
    lines.push(`Position Changes: ${data.position_history.length}`);
  }

  return lines.join('\n');
}

/**
 * Create concessions subsection.
 */
function createConcessionsSubsection(data: DriftAnalysisData): ReportSection {
  return {
    id: 'drift-concessions',
    title: 'Concessions Made',
    content: data.concessions.length > 0
      ? data.concessions.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : 'No concessions recorded.',
    findings: [],
  };
}

/**
 * Create gains subsection.
 */
function createGainsSubsection(data: DriftAnalysisData): ReportSection {
  return {
    id: 'drift-gains',
    title: 'Gains Achieved',
    content: data.gains.length > 0
      ? data.gains.map((g, i) => `${i + 1}. ${g}`).join('\n')
      : 'No gains recorded.',
    findings: [],
  };
}

export { DriftAnalysisData };
