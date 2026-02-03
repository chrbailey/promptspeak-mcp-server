/**
 * ===============================================================================
 * JSON FORMATTER
 * ===============================================================================
 *
 * Formats intelligence reports as structured JSON for programmatic use,
 * API responses, and machine-readable output.
 *
 * ===============================================================================
 */

import {
  IntelligenceReport,
  ReportSection,
  ReportFinding,
  ReportRecommendation,
} from '../types';

/**
 * JSON output options.
 */
export interface JsonFormatterOptions {
  /** Pretty print with indentation (default: true) */
  pretty?: boolean;

  /** Indentation spaces (default: 2) */
  indent?: number;

  /** Include null/undefined values (default: false) */
  includeNulls?: boolean;

  /** Flatten nested structures (default: false) */
  flatten?: boolean;

  /** Include computed fields (default: true) */
  includeComputed?: boolean;
}

const DEFAULT_OPTIONS: JsonFormatterOptions = {
  pretty: true,
  indent: 2,
  includeNulls: false,
  flatten: false,
  includeComputed: true,
};

/**
 * Format a complete intelligence report as JSON.
 */
export function formatAsJson(
  report: IntelligenceReport,
  options: JsonFormatterOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let output: object;

  if (opts.flatten) {
    output = flattenReport(report, opts);
  } else {
    output = opts.includeComputed
      ? enrichReport(report)
      : cleanReport(report, opts);
  }

  if (opts.pretty) {
    return JSON.stringify(output, null, opts.indent);
  }

  return JSON.stringify(output);
}

/**
 * Enrich report with computed fields for convenience.
 */
function enrichReport(report: IntelligenceReport): object {
  const allFindings = extractAllFindings(report);
  const allRecommendations = report.recommendations;

  return {
    ...report,
    _computed: {
      total_sections: report.sections.length,
      total_findings: allFindings.length,
      total_recommendations: allRecommendations.length,
      findings_by_severity: countBySeverity(allFindings),
      recommendations_by_priority: countByPriority(allRecommendations),
      section_ids: report.sections.map(s => s.id),
      has_critical_findings: allFindings.some(f => f.severity === 'critical'),
      has_critical_recommendations: allRecommendations.some(r => r.priority === 'critical'),
      average_confidence: calculateAverageConfidence(allFindings),
    },
  };
}

/**
 * Clean report by removing null/undefined values.
 */
function cleanReport(report: IntelligenceReport, opts: JsonFormatterOptions): object {
  return JSON.parse(JSON.stringify(report, (key, value) => {
    if (!opts.includeNulls && (value === null || value === undefined)) {
      return undefined;
    }
    return value;
  }));
}

/**
 * Flatten report into a simpler structure.
 */
function flattenReport(report: IntelligenceReport, opts: JsonFormatterOptions): object {
  const allFindings = extractAllFindings(report);

  return {
    // Core identification
    report_id: report.report_id,
    mission_id: report.mission_id,
    mission_name: report.mission_name,
    generated_at: report.generated_at,
    version: report.version,
    format: report.format,

    // Executive summary (flattened)
    summary_headline: report.executive_summary.headline,
    summary_overview: report.executive_summary.overview,
    summary_key_takeaways: report.executive_summary.key_takeaways,
    mission_assessment: report.executive_summary.mission_assessment,
    risk_level: report.executive_summary.risk_level,
    critical_findings_count: report.executive_summary.critical_findings_count,
    total_findings_count: report.executive_summary.total_findings_count,

    // All findings (flattened array)
    findings: allFindings.map(f => ({
      id: f.id,
      section: findSectionForFinding(report, f.id),
      title: f.title,
      description: f.description,
      severity: f.severity,
      confidence: f.confidence,
      evidence: f.evidence || [],
    })),

    // All recommendations (flattened array)
    recommendations: report.recommendations.map(r => ({
      id: r.id,
      priority: r.priority,
      action: r.action,
      rationale: r.rationale,
      expected_impact: r.expected_impact || null,
      related_findings: r.related_findings || [],
    })),

    // Metadata (flattened)
    source_symbol_id: report.metadata.source_symbol_id,
    symbol_version: report.metadata.symbol_version,
    mission_start: report.metadata.mission_start,
    mission_end: report.metadata.mission_end || null,
    duration_ms: report.metadata.duration_ms,
    total_messages: report.metadata.total_messages,
    validation_cycles: report.metadata.validation_cycles,
    tags: report.metadata.tags || [],
  };
}

/**
 * Extract all findings from all sections.
 */
function extractAllFindings(report: IntelligenceReport): ReportFinding[] {
  const findings: ReportFinding[] = [];

  function extractFromSection(section: ReportSection): void {
    if (section.findings) {
      findings.push(...section.findings);
    }
    if (section.subsections) {
      section.subsections.forEach(extractFromSection);
    }
  }

  report.sections.forEach(extractFromSection);

  return findings;
}

/**
 * Find which section a finding belongs to.
 */
function findSectionForFinding(report: IntelligenceReport, findingId: string): string | null {
  function searchSection(section: ReportSection): string | null {
    if (section.findings?.some(f => f.id === findingId)) {
      return section.id;
    }
    if (section.subsections) {
      for (const subsection of section.subsections) {
        const found = searchSection(subsection);
        if (found) return found;
      }
    }
    return null;
  }

  for (const section of report.sections) {
    const found = searchSection(section);
    if (found) return found;
  }

  return null;
}

/**
 * Count findings by severity.
 */
function countBySeverity(findings: ReportFinding[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  findings.forEach(f => {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  });

  return counts;
}

/**
 * Count recommendations by priority.
 */
function countByPriority(recommendations: ReportRecommendation[]): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  recommendations.forEach(r => {
    counts[r.priority] = (counts[r.priority] || 0) + 1;
  });

  return counts;
}

/**
 * Calculate average confidence across all findings.
 */
function calculateAverageConfidence(findings: ReportFinding[]): number {
  if (findings.length === 0) return 0;

  const sum = findings.reduce((acc, f) => acc + f.confidence, 0);
  return Math.round((sum / findings.length) * 100) / 100;
}

/**
 * Format report as minified JSON (no whitespace).
 */
export function formatAsMinifiedJson(report: IntelligenceReport): string {
  return formatAsJson(report, { pretty: false });
}

/**
 * Format report as JSONL (JSON Lines) - one line per finding/recommendation.
 */
export function formatAsJsonLines(report: IntelligenceReport): string {
  const lines: string[] = [];

  // Report header line
  lines.push(JSON.stringify({
    type: 'report_header',
    report_id: report.report_id,
    mission_id: report.mission_id,
    mission_name: report.mission_name,
    generated_at: report.generated_at,
  }));

  // Executive summary line
  lines.push(JSON.stringify({
    type: 'executive_summary',
    report_id: report.report_id,
    ...report.executive_summary,
  }));

  // Section lines
  report.sections.forEach(section => {
    lines.push(JSON.stringify({
      type: 'section',
      report_id: report.report_id,
      section_id: section.id,
      title: section.title,
      content: section.content,
    }));

    // Findings within section
    section.findings?.forEach(finding => {
      lines.push(JSON.stringify({
        type: 'finding',
        report_id: report.report_id,
        section_id: section.id,
        ...finding,
      }));
    });
  });

  // Recommendation lines
  report.recommendations.forEach(rec => {
    lines.push(JSON.stringify({
      type: 'recommendation',
      report_id: report.report_id,
      ...rec,
    }));
  });

  // Metadata line
  lines.push(JSON.stringify({
    type: 'metadata',
    report_id: report.report_id,
    ...report.metadata,
  }));

  return lines.join('\n');
}
