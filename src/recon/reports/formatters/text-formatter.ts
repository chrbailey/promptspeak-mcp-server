/**
 * ===============================================================================
 * TEXT FORMATTER
 * ===============================================================================
 *
 * Formats intelligence reports as plain text for simple output,
 * terminal display, and basic text files.
 *
 * ===============================================================================
 */

import {
  IntelligenceReport,
  ReportSection,
  ReportFinding,
  ReportMetric,
  ReportRecommendation,
  ExecutiveSummary,
} from '../types';

/**
 * Text formatter options.
 */
export interface TextFormatterOptions {
  /** Line width for wrapping (default: 80) */
  lineWidth?: number;

  /** Use box drawing characters (default: true) */
  useBoxDrawing?: boolean;

  /** Include section dividers (default: true) */
  includeDividers?: boolean;

  /** Indent size (default: 2) */
  indentSize?: number;
}

const DEFAULT_OPTIONS: TextFormatterOptions = {
  lineWidth: 80,
  useBoxDrawing: true,
  includeDividers: true,
  indentSize: 2,
};

/**
 * Format a complete intelligence report as plain text.
 */
export function formatAsText(
  report: IntelligenceReport,
  options: TextFormatterOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];

  // Title banner
  parts.push(createBanner(report.mission_name, opts));
  parts.push('');

  // Report info
  parts.push(`Report ID:    ${report.report_id}`);
  parts.push(`Mission ID:   ${report.mission_id}`);
  parts.push(`Generated:    ${formatTimestamp(report.generated_at)}`);
  parts.push(`Version:      ${report.version}`);
  parts.push('');

  if (opts.includeDividers) {
    parts.push(createDivider(opts));
    parts.push('');
  }

  // Executive Summary
  parts.push(formatExecutiveSummary(report.executive_summary, opts));
  parts.push('');

  // Sections
  report.sections.forEach((section, index) => {
    if (opts.includeDividers) {
      parts.push(createDivider(opts));
      parts.push('');
    }
    parts.push(formatSection(section, 0, opts));
    parts.push('');
  });

  // Recommendations
  if (opts.includeDividers) {
    parts.push(createDivider(opts));
    parts.push('');
  }
  parts.push(formatRecommendations(report.recommendations, opts));
  parts.push('');

  // Metadata
  if (opts.includeDividers) {
    parts.push(createDivider(opts));
    parts.push('');
  }
  parts.push(formatMetadata(report, opts));

  // Footer
  parts.push('');
  parts.push(createDivider(opts, '='));
  parts.push(centerText('END OF REPORT', opts.lineWidth || 80));
  parts.push(createDivider(opts, '='));

  return parts.join('\n');
}

/**
 * Create a title banner.
 */
function createBanner(title: string, opts: TextFormatterOptions): string {
  const width = opts.lineWidth || 80;
  const line = opts.useBoxDrawing ? '═' : '=';
  const corner = opts.useBoxDrawing ? ['╔', '╗', '╚', '╝'] : ['+', '+', '+', '+'];
  const side = opts.useBoxDrawing ? '║' : '|';

  const border = line.repeat(width - 2);
  const paddedTitle = centerText(`INTELLIGENCE REPORT`, width - 4);
  const paddedName = centerText(title.toUpperCase(), width - 4);

  return [
    corner[0] + border + corner[1],
    side + ' '.repeat(width - 2) + side,
    side + ' ' + paddedTitle + ' ' + side,
    side + ' ' + paddedName + ' ' + side,
    side + ' '.repeat(width - 2) + side,
    corner[2] + border + corner[3],
  ].join('\n');
}

/**
 * Create a section divider.
 */
function createDivider(opts: TextFormatterOptions, char?: string): string {
  const width = opts.lineWidth || 80;
  const divChar = char || (opts.useBoxDrawing ? '─' : '-');
  return divChar.repeat(width);
}

/**
 * Center text within a given width.
 */
function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - text.length);
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
}

/**
 * Format executive summary.
 */
function formatExecutiveSummary(summary: ExecutiveSummary, opts: TextFormatterOptions): string {
  const parts: string[] = [];
  const indent = ' '.repeat(opts.indentSize || 2);

  parts.push('EXECUTIVE SUMMARY');
  parts.push('=================');
  parts.push('');

  // Headline
  parts.push(`>>> ${summary.headline.toUpperCase()} <<<`);
  parts.push('');

  // Overview
  parts.push(wrapText(summary.overview, opts.lineWidth || 80));
  parts.push('');

  // Status box
  parts.push(`Mission Assessment: ${summary.mission_assessment.toUpperCase()}`);
  parts.push(`Risk Level:         ${summary.risk_level.toUpperCase()}`);
  parts.push(`Critical Findings:  ${summary.critical_findings_count}`);
  parts.push(`Total Findings:     ${summary.total_findings_count}`);
  parts.push('');

  // Key takeaways
  parts.push('Key Takeaways:');
  summary.key_takeaways.forEach((takeaway, i) => {
    parts.push(`${indent}${i + 1}. ${takeaway}`);
  });

  return parts.join('\n');
}

/**
 * Format a report section.
 */
function formatSection(section: ReportSection, level: number, opts: TextFormatterOptions): string {
  const parts: string[] = [];
  const indent = ' '.repeat((opts.indentSize || 2) * level);
  const headerChar = level === 0 ? '=' : '-';

  // Title
  parts.push(indent + section.title.toUpperCase());
  parts.push(indent + headerChar.repeat(section.title.length));
  parts.push('');

  // Content
  if (section.content) {
    const wrappedContent = wrapText(section.content, (opts.lineWidth || 80) - indent.length);
    wrappedContent.split('\n').forEach(line => {
      parts.push(indent + line);
    });
    parts.push('');
  }

  // Metrics
  if (section.metrics && section.metrics.length > 0) {
    parts.push(indent + 'Metrics:');
    section.metrics.forEach(metric => {
      parts.push(formatMetric(metric, indent + '  '));
    });
    parts.push('');
  }

  // Findings
  if (section.findings && section.findings.length > 0) {
    parts.push(indent + 'Findings:');
    section.findings.forEach(finding => {
      parts.push(formatFinding(finding, indent + '  ', opts));
      parts.push('');
    });
  }

  // Subsections
  if (section.subsections && section.subsections.length > 0) {
    section.subsections.forEach(subsection => {
      parts.push(formatSection(subsection, level + 1, opts));
    });
  }

  return parts.join('\n');
}

/**
 * Format a single metric.
 */
function formatMetric(metric: ReportMetric, indent: string): string {
  let value = String(metric.value);
  if (metric.unit) {
    value += ` ${metric.unit}`;
  }

  let status = '';
  if (metric.status) {
    status = ` [${metric.status.toUpperCase()}]`;
  }

  return `${indent}- ${metric.name}: ${value}${status}`;
}

/**
 * Format a single finding.
 */
function formatFinding(finding: ReportFinding, indent: string, opts: TextFormatterOptions): string {
  const parts: string[] = [];

  // Severity and title
  const severityTag = `[${finding.severity.toUpperCase()}]`;
  parts.push(`${indent}${severityTag} ${finding.title} (${finding.id})`);

  // Confidence
  parts.push(`${indent}  Confidence: ${(finding.confidence * 100).toFixed(0)}%`);

  // Description
  const descIndent = indent + '  ';
  const wrappedDesc = wrapText(finding.description, (opts.lineWidth || 80) - descIndent.length);
  wrappedDesc.split('\n').forEach(line => {
    parts.push(descIndent + line);
  });

  // Evidence
  if (finding.evidence && finding.evidence.length > 0) {
    parts.push(`${indent}  Evidence:`);
    finding.evidence.forEach(e => {
      parts.push(`${indent}    - ${e}`);
    });
  }

  return parts.join('\n');
}

/**
 * Format recommendations section.
 */
function formatRecommendations(recommendations: ReportRecommendation[], opts: TextFormatterOptions): string {
  const parts: string[] = [];
  const indent = ' '.repeat(opts.indentSize || 2);

  parts.push('RECOMMENDATIONS');
  parts.push('===============');
  parts.push('');

  if (recommendations.length === 0) {
    parts.push('No specific recommendations generated for this mission.');
    return parts.join('\n');
  }

  // Summary
  const byPriority = {
    critical: recommendations.filter(r => r.priority === 'critical'),
    high: recommendations.filter(r => r.priority === 'high'),
    medium: recommendations.filter(r => r.priority === 'medium'),
    low: recommendations.filter(r => r.priority === 'low'),
  };

  parts.push(`Total: ${recommendations.length}`);
  parts.push(`  Critical: ${byPriority.critical.length}`);
  parts.push(`  High:     ${byPriority.high.length}`);
  parts.push(`  Medium:   ${byPriority.medium.length}`);
  parts.push(`  Low:      ${byPriority.low.length}`);
  parts.push('');

  // List recommendations
  const priorities: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low'];

  priorities.forEach(priority => {
    const recs = byPriority[priority];
    if (recs.length > 0) {
      parts.push(`${priority.toUpperCase()} PRIORITY:`);
      parts.push('-'.repeat(priority.length + 10));
      recs.forEach(rec => {
        parts.push(formatRecommendation(rec, indent, opts));
        parts.push('');
      });
    }
  });

  return parts.join('\n');
}

/**
 * Format a single recommendation.
 */
function formatRecommendation(rec: ReportRecommendation, indent: string, opts: TextFormatterOptions): string {
  const parts: string[] = [];

  parts.push(`${indent}[${rec.id}] ${rec.action}`);

  const rationaleLine = wrapText(`Rationale: ${rec.rationale}`, (opts.lineWidth || 80) - indent.length - 2);
  rationaleLine.split('\n').forEach(line => {
    parts.push(`${indent}  ${line}`);
  });

  if (rec.expected_impact) {
    parts.push(`${indent}  Impact: ${rec.expected_impact}`);
  }

  if (rec.related_findings && rec.related_findings.length > 0) {
    parts.push(`${indent}  Related: ${rec.related_findings.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Format metadata section.
 */
function formatMetadata(report: IntelligenceReport, opts: TextFormatterOptions): string {
  const parts: string[] = [];
  const meta = report.metadata;

  parts.push('REPORT METADATA');
  parts.push('===============');
  parts.push('');

  parts.push(`Source Symbol:     ${meta.source_symbol_id}`);
  parts.push(`Symbol Version:    ${meta.symbol_version}`);
  parts.push(`Generator Version: ${meta.generator_version}`);
  parts.push(`Mission Start:     ${formatTimestamp(meta.mission_start)}`);
  if (meta.mission_end) {
    parts.push(`Mission End:       ${formatTimestamp(meta.mission_end)}`);
  }
  parts.push(`Duration:          ${formatDuration(meta.duration_ms)}`);
  parts.push(`Total Messages:    ${meta.total_messages}`);
  parts.push(`Validation Cycles: ${meta.validation_cycles}`);

  if (meta.tags && meta.tags.length > 0) {
    parts.push(`Tags:              ${meta.tags.join(', ')}`);
  }

  if (meta.classification) {
    parts.push(`Classification:    ${meta.classification}`);
  }

  return parts.join('\n');
}

/**
 * Wrap text to a specified width.
 */
function wrapText(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach(word => {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Format duration in milliseconds to human readable.
 */
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}
