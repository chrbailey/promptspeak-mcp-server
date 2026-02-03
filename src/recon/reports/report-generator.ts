/**
 * ===============================================================================
 * INTELLIGENCE REPORT GENERATOR
 * ===============================================================================
 *
 * Main class for generating structured intelligence reports from completed
 * recon missions. Coordinates section generation and output formatting.
 *
 * ===============================================================================
 */

import { MarineReconSymbol } from '../types';
import {
  IntelligenceReport,
  ReportFormat,
  ReportSection,
  ExecutiveSummary,
  ReportMetadata,
  ReportRecommendation,
  ReportFinding,
} from './types';

// Section generators
import {
  generateMissionOverview,
  generateOpposingAgentProfile,
  generateTacticsObserved,
  generateDriftAnalysis,
  generateIntelligenceGathered,
  generateConstraintViolations,
  generateRecommendations,
  generateMissionRecommendations,
} from './sections';

// Formatters
import {
  formatAsMarkdown,
  formatAsJson,
  formatAsText,
  JsonFormatterOptions,
  TextFormatterOptions,
} from './formatters';

/**
 * Report generator version.
 */
export const GENERATOR_VERSION = '1.0.0';

/**
 * Options for report generation.
 */
export interface ReportGeneratorOptions {
  /** Include all sections (default: true) */
  includeAllSections?: boolean;

  /** Specific sections to include (overrides includeAllSections) */
  sections?: string[];

  /** Generate recommendations (default: true) */
  includeRecommendations?: boolean;

  /** Report classification level */
  classification?: string;

  /** Additional tags to include */
  additionalTags?: string[];
}

const DEFAULT_OPTIONS: ReportGeneratorOptions = {
  includeAllSections: true,
  includeRecommendations: true,
};

/**
 * Intelligence Report Generator.
 *
 * Generates structured intelligence reports from Marine Recon symbols.
 *
 * @example
 * ```typescript
 * const generator = new ReportGenerator();
 *
 * // Generate markdown report
 * const markdownReport = generator.generate(symbol, 'markdown');
 *
 * // Generate JSON report
 * const jsonReport = generator.generate(symbol, 'json');
 *
 * // Generate with options
 * const customReport = generator.generate(symbol, 'markdown', {
 *   sections: ['mission-overview', 'tactics-observed'],
 *   includeRecommendations: false,
 * });
 * ```
 */
export class ReportGenerator {
  private options: ReportGeneratorOptions;

  constructor(options: ReportGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Generate a complete intelligence report.
   *
   * @param symbol - The Marine Recon symbol with mission data
   * @param format - Output format (markdown, json, text)
   * @param options - Optional generation options
   * @returns Formatted report string
   */
  generate(
    symbol: MarineReconSymbol,
    format: ReportFormat,
    options?: ReportGeneratorOptions
  ): string {
    const opts = { ...this.options, ...options };

    // Build report structure
    const report = this.buildReport(symbol, opts);

    // Format output
    return this.formatReport(report, format);
  }

  /**
   * Generate only the executive summary.
   */
  generateExecutiveSummary(symbol: MarineReconSymbol): string {
    const sections = this.generateSections(symbol, this.options);
    const recommendations = generateMissionRecommendations(symbol);
    const summary = this.buildExecutiveSummary(symbol, sections, recommendations);

    const lines: string[] = [];
    lines.push(`EXECUTIVE SUMMARY: ${symbol.mission.objective.primary_goal}`);
    lines.push('');
    lines.push(`Headline: ${summary.headline}`);
    lines.push('');
    lines.push(summary.overview);
    lines.push('');
    lines.push(`Assessment: ${summary.mission_assessment.toUpperCase()}`);
    lines.push(`Risk Level: ${summary.risk_level.toUpperCase()}`);
    lines.push(`Findings: ${summary.total_findings_count} (${summary.critical_findings_count} critical)`);
    lines.push('');
    lines.push('Key Takeaways:');
    summary.key_takeaways.forEach((t, i) => lines.push(`  ${i + 1}. ${t}`));

    return lines.join('\n');
  }

  /**
   * Generate tactics analysis summary.
   */
  generateTacticsAnalysis(symbol: MarineReconSymbol): string {
    const section = generateTacticsObserved(symbol);
    return this.formatSectionAsText(section);
  }

  /**
   * Generate drift analysis summary.
   */
  generateDriftReport(symbol: MarineReconSymbol): string {
    const section = generateDriftAnalysis(symbol);
    return this.formatSectionAsText(section);
  }

  /**
   * Generate recommendations list.
   */
  generateRecommendationsList(symbol: MarineReconSymbol): string[] {
    const recommendations = generateMissionRecommendations(symbol);
    return recommendations.map(r => `[${r.priority.toUpperCase()}] ${r.action}`);
  }

  /**
   * Build the complete report structure.
   */
  private buildReport(
    symbol: MarineReconSymbol,
    options: ReportGeneratorOptions
  ): IntelligenceReport {
    // Generate all sections
    const sections = this.generateSections(symbol, options);

    // Generate recommendations
    const recommendations = options.includeRecommendations
      ? generateMissionRecommendations(symbol)
      : [];

    // Build executive summary
    const executiveSummary = this.buildExecutiveSummary(symbol, sections, recommendations);

    // Build metadata
    const metadata = this.buildMetadata(symbol, options);

    // Generate report ID
    const reportId = this.generateReportId(symbol);

    return {
      report_id: reportId,
      mission_id: symbol.symbol_id,
      mission_name: symbol.mission.objective.primary_goal,
      generated_at: new Date().toISOString(),
      format: 'markdown', // Will be set by formatter
      version: GENERATOR_VERSION,
      executive_summary: executiveSummary,
      sections,
      recommendations,
      metadata,
    };
  }

  /**
   * Generate report sections based on options.
   */
  private generateSections(
    symbol: MarineReconSymbol,
    options: ReportGeneratorOptions
  ): ReportSection[] {
    const allSections: Array<{ id: string; generator: () => ReportSection }> = [
      { id: 'mission-overview', generator: () => generateMissionOverview(symbol) },
      { id: 'opposing-agent-profile', generator: () => generateOpposingAgentProfile(symbol) },
      { id: 'tactics-observed', generator: () => generateTacticsObserved(symbol) },
      { id: 'drift-analysis', generator: () => generateDriftAnalysis(symbol) },
      { id: 'intelligence-gathered', generator: () => generateIntelligenceGathered(symbol) },
      { id: 'constraint-violations', generator: () => generateConstraintViolations(symbol) },
      { id: 'recommendations', generator: () => generateRecommendations(symbol) },
    ];

    // Filter sections based on options
    let sectionsToGenerate = allSections;

    if (options.sections && options.sections.length > 0) {
      sectionsToGenerate = allSections.filter(s =>
        options.sections!.includes(s.id)
      );
    } else if (!options.includeAllSections) {
      // Only include essential sections
      sectionsToGenerate = allSections.filter(s =>
        ['mission-overview', 'tactics-observed', 'intelligence-gathered'].includes(s.id)
      );
    }

    // Remove recommendations section if disabled (it's handled separately)
    if (!options.includeRecommendations) {
      sectionsToGenerate = sectionsToGenerate.filter(s => s.id !== 'recommendations');
    }

    return sectionsToGenerate.map(s => s.generator());
  }

  /**
   * Build executive summary from sections and recommendations.
   */
  private buildExecutiveSummary(
    symbol: MarineReconSymbol,
    sections: ReportSection[],
    recommendations: ReportRecommendation[]
  ): ExecutiveSummary {
    // Collect all findings
    const allFindings = this.collectFindings(sections);

    // Determine mission assessment
    const missionAssessment = this.assessMission(symbol, allFindings);

    // Determine risk level
    const riskLevel = this.assessRiskLevel(symbol, allFindings);

    // Build headline
    const headline = this.buildHeadline(symbol, missionAssessment);

    // Build overview
    const overview = this.buildOverview(symbol, allFindings, recommendations);

    // Build key takeaways
    const keyTakeaways = this.buildKeyTakeaways(symbol, allFindings, recommendations);

    // Count findings
    const criticalCount = allFindings.filter(f => f.severity === 'critical').length;

    return {
      headline,
      overview,
      key_takeaways: keyTakeaways,
      mission_assessment: missionAssessment,
      risk_level: riskLevel,
      critical_findings_count: criticalCount,
      total_findings_count: allFindings.length,
    };
  }

  /**
   * Collect all findings from sections.
   */
  private collectFindings(sections: ReportSection[]): ReportFinding[] {
    const findings: ReportFinding[] = [];

    function collectFromSection(section: ReportSection): void {
      if (section.findings) {
        findings.push(...section.findings);
      }
      if (section.subsections) {
        section.subsections.forEach(collectFromSection);
      }
    }

    sections.forEach(collectFromSection);
    return findings;
  }

  /**
   * Assess overall mission outcome.
   */
  private assessMission(
    symbol: MarineReconSymbol,
    findings: ReportFinding[]
  ): ExecutiveSummary['mission_assessment'] {
    const status = symbol.state.engagement.status;

    if (status === 'compromised') return 'compromised';
    if (status === 'aborted') return 'aborted';

    // Check for critical failures
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasRedLineViolation = symbol.state.engagement.analyst_state.constraint_status
      .some(c => c.status === 'violated');

    if (hasCritical || hasRedLineViolation) return 'failure';

    // Check intel coverage
    const intelRequirements = symbol.mission.objective.intelligence_requirements.length;
    const observations = symbol.state.engagement.intelligence.observations.length;
    const patterns = symbol.state.engagement.intelligence.patterns_observed.length;

    const intelScore = (observations + patterns) / Math.max(intelRequirements, 1);

    if (status === 'completed' && intelScore >= 0.7) return 'success';
    if (status === 'completed' || status === 'extracting') return 'partial_success';

    return 'partial_success';
  }

  /**
   * Assess overall risk level.
   */
  private assessRiskLevel(
    symbol: MarineReconSymbol,
    findings: ReportFinding[]
  ): ExecutiveSummary['risk_level'] {
    const alertLevel = symbol.state.engagement.alert_level;

    if (alertLevel === 'red') return 'critical';
    if (alertLevel === 'orange') return 'high';

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount >= 3) return 'high';
    if (highCount >= 1) return 'medium';

    return 'low';
  }

  /**
   * Build headline for executive summary.
   */
  private buildHeadline(
    symbol: MarineReconSymbol,
    assessment: ExecutiveSummary['mission_assessment']
  ): string {
    const target = symbol.mission.target.organization || symbol.mission.target.type;

    const assessmentText: Record<ExecutiveSummary['mission_assessment'], string> = {
      success: 'Mission Completed Successfully',
      partial_success: 'Mission Partially Completed',
      failure: 'Mission Failed',
      aborted: 'Mission Aborted',
      compromised: 'Mission Compromised',
    };

    return `${assessmentText[assessment]} - ${target}`;
  }

  /**
   * Build overview paragraph.
   */
  private buildOverview(
    symbol: MarineReconSymbol,
    findings: ReportFinding[],
    recommendations: ReportRecommendation[]
  ): string {
    const engagement = symbol.state.engagement;
    const intelligence = engagement.intelligence;
    const tacticsCount = engagement.analyst_state.detected_tactics.length;
    const messageCount = engagement.conversation.message_count;
    const duration = this.formatDuration(
      new Date(engagement.timestamps.last_activity).getTime() -
      new Date(engagement.timestamps.mission_start).getTime()
    );

    const agentType = intelligence.opposing_agent.suspected_type;
    const driftScore = (engagement.analyst_state.drift_assessment.drift_score * 100).toFixed(0);

    return `Reconnaissance mission against ${agentType} agent completed over ${duration} with ${messageCount} messages exchanged. ` +
      `Detected ${tacticsCount} manipulation tactic(s) and maintained ${100 - parseInt(driftScore)}% position integrity. ` +
      `Generated ${findings.length} finding(s) and ${recommendations.length} recommendation(s) for follow-up action.`;
  }

  /**
   * Build key takeaways list.
   */
  private buildKeyTakeaways(
    symbol: MarineReconSymbol,
    findings: ReportFinding[],
    recommendations: ReportRecommendation[]
  ): string[] {
    const takeaways: string[] = [];

    // Agent type
    const agentProfile = symbol.state.engagement.intelligence.opposing_agent;
    if (agentProfile.type_confidence > 0.7) {
      takeaways.push(
        `Target identified as ${agentProfile.suspected_type.toUpperCase()} with ${(agentProfile.type_confidence * 100).toFixed(0)}% confidence`
      );
    }

    // Top tactic
    const tactics = symbol.state.engagement.analyst_state.detected_tactics;
    if (tactics.length > 0) {
      const tacticCounts = new Map<string, number>();
      tactics.forEach(t => {
        tacticCounts.set(t.tactic, (tacticCounts.get(t.tactic) || 0) + 1);
      });
      const topTactic = Array.from(tacticCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];
      takeaways.push(
        `Primary manipulation tactic: ${topTactic[0].replace('_', ' ')} (${topTactic[1]} instances)`
      );
    }

    // Critical findings
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      takeaways.push(`${criticalFindings.length} critical finding(s) require immediate attention`);
    }

    // Critical recommendations
    const criticalRecs = recommendations.filter(r => r.priority === 'critical');
    if (criticalRecs.length > 0) {
      takeaways.push(`${criticalRecs.length} critical recommendation(s) for follow-up`);
    }

    // Intel gathered
    const patterns = symbol.state.engagement.intelligence.patterns_observed.length;
    const constraints = symbol.state.engagement.intelligence.constraint_boundaries.length;
    if (patterns > 0 || constraints > 0) {
      takeaways.push(
        `Gathered ${patterns} behavioral pattern(s) and ${constraints} constraint boundary(ies)`
      );
    }

    // Ensure we have at least 3 takeaways
    while (takeaways.length < 3) {
      const status = symbol.state.engagement.status;
      if (status === 'completed') {
        takeaways.push('Mission completed within operational parameters');
      } else {
        takeaways.push(`Mission concluded with status: ${status}`);
      }
      break;
    }

    return takeaways.slice(0, 5); // Max 5 takeaways
  }

  /**
   * Build report metadata.
   */
  private buildMetadata(
    symbol: MarineReconSymbol,
    options: ReportGeneratorOptions
  ): ReportMetadata {
    const timestamps = symbol.state.engagement.timestamps;
    const startTime = new Date(timestamps.mission_start).getTime();
    const endTime = timestamps.mission_end
      ? new Date(timestamps.mission_end).getTime()
      : new Date(timestamps.last_activity).getTime();

    return {
      source_symbol_id: symbol.symbol_id,
      symbol_version: symbol.version,
      generator_version: GENERATOR_VERSION,
      mission_start: timestamps.mission_start,
      mission_end: timestamps.mission_end,
      duration_ms: endTime - startTime,
      total_messages: symbol.state.engagement.conversation.message_count,
      validation_cycles: symbol.state.validation.cycle_number,
      tags: [...(symbol.tags || []), ...(options.additionalTags || [])],
      classification: options.classification,
    };
  }

  /**
   * Generate unique report ID.
   */
  private generateReportId(symbol: MarineReconSymbol): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const symbolSuffix = symbol.symbol_id.split('.').pop()?.substring(0, 8) || 'UNKNOWN';
    return `RPT-${symbolSuffix}-${timestamp}`;
  }

  /**
   * Format the report based on output format.
   */
  private formatReport(report: IntelligenceReport, format: ReportFormat): string {
    // Update format in report
    report.format = format;

    switch (format) {
      case 'markdown':
        return formatAsMarkdown(report);
      case 'json':
        return formatAsJson(report);
      case 'text':
        return formatAsText(report);
      default:
        return formatAsMarkdown(report);
    }
  }

  /**
   * Format a single section as plain text.
   */
  private formatSectionAsText(section: ReportSection): string {
    const lines: string[] = [];

    lines.push(section.title.toUpperCase());
    lines.push('='.repeat(section.title.length));
    lines.push('');

    if (section.content) {
      lines.push(section.content);
      lines.push('');
    }

    if (section.findings && section.findings.length > 0) {
      lines.push('Findings:');
      section.findings.forEach(f => {
        lines.push(`  [${f.severity.toUpperCase()}] ${f.title}`);
        lines.push(`    ${f.description}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Format duration in milliseconds to human readable.
   */
  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Convenience function to generate a report without instantiating the class.
 */
export function generateReport(
  symbol: MarineReconSymbol,
  format: ReportFormat,
  options?: ReportGeneratorOptions
): string {
  const generator = new ReportGenerator(options);
  return generator.generate(symbol, format, options);
}

/**
 * Generate a quick summary without full report.
 */
export function generateQuickSummary(symbol: MarineReconSymbol): string {
  const generator = new ReportGenerator();
  return generator.generateExecutiveSummary(symbol);
}
