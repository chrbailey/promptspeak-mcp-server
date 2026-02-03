/**
 * ===============================================================================
 * INTELLIGENCE REPORTS MODULE
 * ===============================================================================
 *
 * Complete module for generating structured intelligence reports from
 * completed Marine Recon missions.
 *
 * Usage:
 * ```typescript
 * import { ReportGenerator, generateReport } from './reports';
 *
 * // Using the class
 * const generator = new ReportGenerator();
 * const markdownReport = generator.generate(symbol, 'markdown');
 * const jsonReport = generator.generate(symbol, 'json');
 *
 * // Using the convenience function
 * const report = generateReport(symbol, 'text');
 *
 * // Generate quick summary
 * const summary = generateQuickSummary(symbol);
 * ```
 *
 * ===============================================================================
 */

// Main generator
export {
  ReportGenerator,
  generateReport,
  generateQuickSummary,
  GENERATOR_VERSION,
  type ReportGeneratorOptions,
} from './report-generator';

// Types
export type {
  ReportFormat,
  IntelligenceReport,
  ReportSection,
  ReportFinding,
  ReportMetric,
  ReportRecommendation,
  ExecutiveSummary,
  ReportMetadata,
  MissionOverviewData,
  OpposingAgentData,
  TacticsAnalysisData,
  DriftAnalysisData,
  IntelligenceGatheredData,
  ConstraintViolationsData,
} from './types';

// Section generators (for advanced use)
export {
  generateMissionOverview,
  extractMissionOverviewData,
  generateOpposingAgentProfile,
  extractOpposingAgentData,
  generateTacticsObserved,
  extractTacticsData,
  TACTIC_DESCRIPTIONS,
  TACTIC_SEVERITY,
  generateDriftAnalysis,
  extractDriftData,
  generateIntelligenceGathered,
  extractIntelligenceData,
  generateConstraintViolations,
  extractConstraintData,
  generateRecommendations,
  generateMissionRecommendations,
} from './sections';

// Formatters (for custom formatting)
export {
  formatAsMarkdown,
  formatAsJson,
  formatAsMinifiedJson,
  formatAsJsonLines,
  formatAsText,
  type JsonFormatterOptions,
  type TextFormatterOptions,
} from './formatters';
