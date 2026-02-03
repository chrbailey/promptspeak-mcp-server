/**
 * ===============================================================================
 * REPORT SECTIONS INDEX
 * ===============================================================================
 *
 * Central export point for all report section generators.
 *
 * ===============================================================================
 */

// Section generators
export { generateMissionOverview, extractMissionOverviewData } from './mission-overview';
export { generateOpposingAgentProfile, extractOpposingAgentData } from './opposing-agent-profile';
export { generateTacticsObserved, extractTacticsData, TACTIC_DESCRIPTIONS, TACTIC_SEVERITY } from './tactics-observed';
export { generateDriftAnalysis, extractDriftData } from './drift-analysis';
export { generateIntelligenceGathered, extractIntelligenceData } from './intelligence-gathered';
export { generateConstraintViolations, extractConstraintData } from './constraint-violations';
export { generateRecommendations, generateMissionRecommendations } from './recommendations';

// Re-export data types
export type { MissionOverviewData } from './mission-overview';
export type { OpposingAgentData } from './opposing-agent-profile';
export type { TacticsAnalysisData } from './tactics-observed';
export type { DriftAnalysisData } from './drift-analysis';
export type { IntelligenceGatheredData } from './intelligence-gathered';
export type { ConstraintViolationsData } from './constraint-violations';
