/**
 * ===============================================================================
 * MARKDOWN FORMATTER
 * ===============================================================================
 *
 * Formats intelligence reports as rich Markdown with headers, tables,
 * bullet lists, and styling for maximum readability.
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
 * Format a complete intelligence report as Markdown.
 */
export function formatAsMarkdown(report: IntelligenceReport): string {
  const parts: string[] = [];

  // Title
  parts.push(`# Intelligence Report: ${report.mission_name}`);
  parts.push('');
  parts.push(`**Report ID:** ${report.report_id}`);
  parts.push(`**Mission ID:** ${report.mission_id}`);
  parts.push(`**Generated:** ${formatTimestamp(report.generated_at)}`);
  parts.push(`**Version:** ${report.version}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // Executive Summary
  parts.push(formatExecutiveSummary(report.executive_summary));
  parts.push('');

  // Table of Contents
  parts.push('## Table of Contents');
  parts.push('');
  report.sections.forEach((section, index) => {
    parts.push(`${index + 1}. [${section.title}](#${slugify(section.title)})`);
  });
  parts.push(`${report.sections.length + 1}. [Recommendations](#recommendations-1)`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // Sections
  report.sections.forEach(section => {
    parts.push(formatSection(section, 2));
    parts.push('');
  });

  // Recommendations
  parts.push(formatRecommendations(report.recommendations));
  parts.push('');

  // Metadata footer
  parts.push('---');
  parts.push('');
  parts.push(formatMetadata(report));

  return parts.join('\n');
}

/**
 * Format executive summary.
 */
function formatExecutiveSummary(summary: ExecutiveSummary): string {
  const parts: string[] = [];

  parts.push('## Executive Summary');
  parts.push('');

  // Headline box
  parts.push(`> **${summary.headline}**`);
  parts.push('');

  // Overview
  parts.push(summary.overview);
  parts.push('');

  // Assessment badges
  const assessmentEmoji = {
    success: 'SUCCESS',
    partial_success: 'PARTIAL',
    failure: 'FAILURE',
    aborted: 'ABORTED',
    compromised: 'COMPROMISED',
  };

  const riskEmoji = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  };

  parts.push(`| Assessment | Risk Level | Critical Findings | Total Findings |`);
  parts.push(`|------------|------------|-------------------|----------------|`);
  parts.push(`| **${assessmentEmoji[summary.mission_assessment]}** | **${riskEmoji[summary.risk_level]}** | ${summary.critical_findings_count} | ${summary.total_findings_count} |`);
  parts.push('');

  // Key takeaways
  parts.push('### Key Takeaways');
  parts.push('');
  summary.key_takeaways.forEach(takeaway => {
    parts.push(`- ${takeaway}`);
  });

  return parts.join('\n');
}

/**
 * Format a report section.
 */
function formatSection(section: ReportSection, level: number): string {
  const parts: string[] = [];
  const headerPrefix = '#'.repeat(level);

  parts.push(`${headerPrefix} ${section.title}`);
  parts.push('');

  // Main content
  if (section.content) {
    parts.push(section.content);
    parts.push('');
  }

  // Metrics table
  if (section.metrics && section.metrics.length > 0) {
    parts.push(formatMetricsTable(section.metrics));
    parts.push('');
  }

  // Findings
  if (section.findings && section.findings.length > 0) {
    parts.push(`${headerPrefix}# Findings`);
    parts.push('');
    section.findings.forEach(finding => {
      parts.push(formatFinding(finding));
      parts.push('');
    });
  }

  // Subsections
  if (section.subsections && section.subsections.length > 0) {
    section.subsections.forEach(subsection => {
      parts.push(formatSection(subsection, level + 1));
    });
  }

  return parts.join('\n');
}

/**
 * Format a metrics table.
 */
function formatMetricsTable(metrics: ReportMetric[]): string {
  const parts: string[] = [];

  parts.push('| Metric | Value | Status |');
  parts.push('|--------|-------|--------|');

  metrics.forEach(metric => {
    const value = metric.unit ? `${metric.value} ${metric.unit}` : String(metric.value);
    const status = metric.status
      ? `**${metric.status.toUpperCase()}**`
      : '-';
    parts.push(`| ${metric.name} | ${value} | ${status} |`);
  });

  return parts.join('\n');
}

/**
 * Format a single finding.
 */
function formatFinding(finding: ReportFinding): string {
  const parts: string[] = [];

  // Severity badge
  const severityBadge = {
    critical: '**[CRITICAL]**',
    high: '**[HIGH]**',
    medium: '[MEDIUM]',
    low: '[LOW]',
    info: '[INFO]',
  };

  parts.push(`#### ${severityBadge[finding.severity]} ${finding.title}`);
  parts.push('');
  parts.push(`*ID: ${finding.id} | Confidence: ${(finding.confidence * 100).toFixed(0)}%*`);
  parts.push('');
  parts.push(finding.description);

  if (finding.evidence && finding.evidence.length > 0) {
    parts.push('');
    parts.push('**Evidence:**');
    finding.evidence.forEach(e => {
      parts.push(`- ${e}`);
    });
  }

  return parts.join('\n');
}

/**
 * Format recommendations section.
 */
function formatRecommendations(recommendations: ReportRecommendation[]): string {
  const parts: string[] = [];

  parts.push('## Recommendations');
  parts.push('');

  if (recommendations.length === 0) {
    parts.push('No specific recommendations generated for this mission.');
    return parts.join('\n');
  }

  // Group by priority
  const byPriority = {
    critical: recommendations.filter(r => r.priority === 'critical'),
    high: recommendations.filter(r => r.priority === 'high'),
    medium: recommendations.filter(r => r.priority === 'medium'),
    low: recommendations.filter(r => r.priority === 'low'),
  };

  // Summary table
  parts.push('| Priority | Count |');
  parts.push('|----------|-------|');
  parts.push(`| Critical | ${byPriority.critical.length} |`);
  parts.push(`| High | ${byPriority.high.length} |`);
  parts.push(`| Medium | ${byPriority.medium.length} |`);
  parts.push(`| Low | ${byPriority.low.length} |`);
  parts.push('');

  // Critical recommendations
  if (byPriority.critical.length > 0) {
    parts.push('### Critical Priority');
    parts.push('');
    byPriority.critical.forEach(rec => {
      parts.push(formatRecommendation(rec));
      parts.push('');
    });
  }

  // High priority recommendations
  if (byPriority.high.length > 0) {
    parts.push('### High Priority');
    parts.push('');
    byPriority.high.forEach(rec => {
      parts.push(formatRecommendation(rec));
      parts.push('');
    });
  }

  // Medium priority recommendations
  if (byPriority.medium.length > 0) {
    parts.push('### Medium Priority');
    parts.push('');
    byPriority.medium.forEach(rec => {
      parts.push(formatRecommendation(rec));
      parts.push('');
    });
  }

  // Low priority recommendations
  if (byPriority.low.length > 0) {
    parts.push('### Low Priority');
    parts.push('');
    byPriority.low.forEach(rec => {
      parts.push(formatRecommendation(rec));
      parts.push('');
    });
  }

  return parts.join('\n');
}

/**
 * Format a single recommendation.
 */
function formatRecommendation(rec: ReportRecommendation): string {
  const parts: string[] = [];

  const priorityBadge = {
    critical: '**[CRITICAL]**',
    high: '**[HIGH]**',
    medium: '[MEDIUM]',
    low: '[LOW]',
  };

  parts.push(`#### ${priorityBadge[rec.priority]} ${rec.id}: ${rec.action}`);
  parts.push('');
  parts.push(`> ${rec.rationale}`);

  if (rec.expected_impact) {
    parts.push('');
    parts.push(`**Expected Impact:** ${rec.expected_impact}`);
  }

  if (rec.related_findings && rec.related_findings.length > 0) {
    parts.push('');
    parts.push(`**Related Findings:** ${rec.related_findings.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Format metadata section.
 */
function formatMetadata(report: IntelligenceReport): string {
  const parts: string[] = [];
  const meta = report.metadata;

  parts.push('## Report Metadata');
  parts.push('');
  parts.push('| Property | Value |');
  parts.push('|----------|-------|');
  parts.push(`| Source Symbol | \`${meta.source_symbol_id}\` |`);
  parts.push(`| Symbol Version | ${meta.symbol_version} |`);
  parts.push(`| Generator Version | ${meta.generator_version} |`);
  parts.push(`| Mission Start | ${formatTimestamp(meta.mission_start)} |`);
  if (meta.mission_end) {
    parts.push(`| Mission End | ${formatTimestamp(meta.mission_end)} |`);
  }
  parts.push(`| Duration | ${formatDuration(meta.duration_ms)} |`);
  parts.push(`| Total Messages | ${meta.total_messages} |`);
  parts.push(`| Validation Cycles | ${meta.validation_cycles} |`);

  if (meta.tags && meta.tags.length > 0) {
    parts.push(`| Tags | ${meta.tags.join(', ')} |`);
  }

  if (meta.classification) {
    parts.push(`| Classification | ${meta.classification} |`);
  }

  return parts.join('\n');
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
      timeZoneName: 'short',
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

/**
 * Convert a title to a URL slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
