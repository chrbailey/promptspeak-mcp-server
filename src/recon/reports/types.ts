/**
 * ===============================================================================
 * INTELLIGENCE REPORT TYPES
 * ===============================================================================
 *
 * Type definitions for structured intelligence reports generated from
 * completed recon missions. Supports multiple output formats and
 * comprehensive section-based organization.
 *
 * ===============================================================================
 */

// ===============================================================================
// REPORT FORMATS
// ===============================================================================

/**
 * Supported output formats for intelligence reports.
 */
export type ReportFormat = 'markdown' | 'json' | 'text';

// ===============================================================================
// CORE REPORT STRUCTURES
// ===============================================================================

/**
 * A finding within a report section.
 */
export interface ReportFinding {
  /** Unique identifier for the finding */
  id: string;

  /** Short title describing the finding */
  title: string;

  /** Detailed description of the finding */
  description: string;

  /** Severity or importance level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /** Confidence in the finding (0-1) */
  confidence: number;

  /** Supporting evidence */
  evidence?: string[];

  /** Timestamp when finding was identified */
  identified_at?: string;
}

/**
 * A section within an intelligence report.
 */
export interface ReportSection {
  /** Section identifier */
  id: string;

  /** Section title */
  title: string;

  /** Main content of the section */
  content: string;

  /** Findings within this section */
  findings: ReportFinding[];

  /** Optional subsections for hierarchical organization */
  subsections?: ReportSection[];

  /** Optional metrics relevant to this section */
  metrics?: ReportMetric[];
}

/**
 * A metric included in the report.
 */
export interface ReportMetric {
  /** Metric name */
  name: string;

  /** Metric value */
  value: number | string;

  /** Optional unit of measurement */
  unit?: string;

  /** Optional threshold for comparison */
  threshold?: number;

  /** Status based on threshold comparison */
  status?: 'normal' | 'warning' | 'critical';
}

/**
 * Recommendation for follow-up action.
 */
export interface ReportRecommendation {
  /** Recommendation identifier */
  id: string;

  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';

  /** The recommended action */
  action: string;

  /** Rationale for the recommendation */
  rationale: string;

  /** Expected impact if implemented */
  expected_impact?: string;

  /** Related findings that support this recommendation */
  related_findings?: string[];
}

// ===============================================================================
// INTELLIGENCE REPORT
// ===============================================================================

/**
 * Complete intelligence report from a recon mission.
 */
export interface IntelligenceReport {
  /** Report identifier */
  report_id: string;

  /** Mission identifier (from symbol) */
  mission_id: string;

  /** Mission name for display */
  mission_name: string;

  /** Report generation timestamp */
  generated_at: string;

  /** Report format */
  format: ReportFormat;

  /** Report version */
  version: string;

  /** Executive summary */
  executive_summary: ExecutiveSummary;

  /** Report sections */
  sections: ReportSection[];

  /** Recommendations */
  recommendations: ReportRecommendation[];

  /** Report metadata */
  metadata: ReportMetadata;
}

/**
 * Executive summary of the intelligence report.
 */
export interface ExecutiveSummary {
  /** One-line summary of mission outcome */
  headline: string;

  /** Brief narrative summary (2-3 sentences) */
  overview: string;

  /** Key takeaways (3-5 bullet points) */
  key_takeaways: string[];

  /** Mission success assessment */
  mission_assessment: 'success' | 'partial_success' | 'failure' | 'aborted' | 'compromised';

  /** Overall risk level encountered */
  risk_level: 'low' | 'medium' | 'high' | 'critical';

  /** Critical findings count */
  critical_findings_count: number;

  /** Total findings count */
  total_findings_count: number;
}

/**
 * Metadata about the report itself.
 */
export interface ReportMetadata {
  /** Source symbol ID */
  source_symbol_id: string;

  /** Symbol version at report generation */
  symbol_version: number;

  /** Report generator version */
  generator_version: string;

  /** Mission start timestamp */
  mission_start: string;

  /** Mission end timestamp */
  mission_end?: string;

  /** Duration in milliseconds */
  duration_ms: number;

  /** Total messages exchanged */
  total_messages: number;

  /** Number of validation cycles completed */
  validation_cycles: number;

  /** Tags from the mission */
  tags?: string[];

  /** Classification level */
  classification?: string;
}

// ===============================================================================
// SECTION-SPECIFIC TYPES
// ===============================================================================

/**
 * Mission overview section data.
 */
export interface MissionOverviewData {
  /** Mission objective */
  objective: string;

  /** Target description */
  target: string;

  /** Mission status */
  status: string;

  /** Duration */
  duration: {
    start: string;
    end?: string;
    elapsed_ms: number;
    formatted: string;
  };

  /** Message statistics */
  messages: {
    total: number;
    ours: number;
    theirs: number;
    ratio: string;
  };

  /** Intelligence requirements and their status */
  intel_requirements: Array<{
    requirement: string;
    status: 'answered' | 'partial' | 'unanswered';
    notes?: string;
  }>;
}

/**
 * Opposing agent profile section data.
 */
export interface OpposingAgentData {
  /** Suspected type */
  type: 'human' | 'ai' | 'hybrid' | 'unknown';

  /** Confidence in type assessment */
  type_confidence: number;

  /** Identified capabilities */
  capabilities: string[];

  /** Identified limitations */
  limitations: string[];

  /** Observed response patterns */
  response_patterns: string[];

  /** Apparent objectives */
  objectives: string[];

  /** Behavioral indicators */
  behavioral_indicators: string[];
}

/**
 * Tactics analysis section data.
 */
export interface TacticsAnalysisData {
  /** Total tactics detected */
  total_detected: number;

  /** Tactics by category */
  by_category: Array<{
    tactic: string;
    count: number;
    avg_confidence: number;
    examples: string[];
  }>;

  /** Tactics timeline */
  timeline: Array<{
    timestamp: string;
    tactic: string;
    evidence: string;
    counter_applied?: string;
  }>;

  /** Most common tactic */
  most_common?: string;

  /** Overall assessment */
  assessment: string;
}

/**
 * Drift analysis section data.
 */
export interface DriftAnalysisData {
  /** Original position */
  original_position: string;

  /** Final position */
  final_position: string;

  /** Drift score (0-1) */
  drift_score: number;

  /** Drift classification */
  drift_classification: 'minimal' | 'moderate' | 'significant' | 'severe';

  /** Concessions made */
  concessions: string[];

  /** Gains achieved */
  gains: string[];

  /** Net assessment */
  net_assessment: 'winning' | 'even' | 'losing' | 'unclear';

  /** Position history */
  position_history?: Array<{
    timestamp: string;
    position: string;
    trigger: string;
  }>;
}

/**
 * Intelligence gathered section data.
 */
export interface IntelligenceGatheredData {
  /** Behavioral patterns discovered */
  patterns: Array<{
    id: string;
    description: string;
    occurrences: number;
    triggers: string[];
    significance: 'high' | 'medium' | 'low';
  }>;

  /** Constraint boundaries discovered */
  constraints: Array<{
    id: string;
    description: string;
    hardness: 'hard' | 'soft' | 'unknown';
    confidence: number;
    discovery_method: string;
  }>;

  /** Test scenario results */
  scenario_results: Array<{
    scenario_id: string;
    executed: boolean;
    outcome: string;
    matches_baseline?: boolean;
    findings: string[];
  }>;

  /** Significant observations */
  observations: Array<{
    timestamp: string;
    content: string;
    category: string;
    significance: number;
  }>;
}

/**
 * Constraint violations section data.
 */
export interface ConstraintViolationsData {
  /** Total constraint checks */
  total_checks: number;

  /** Constraints that were violated */
  violations: Array<{
    constraint_id: string;
    description: string;
    severity: 'red_line' | 'hard' | 'soft';
    timestamp: string;
    details: string;
    resolution?: string;
  }>;

  /** Constraints that were approached but not violated */
  near_misses: Array<{
    constraint_id: string;
    description: string;
    proximity: number;
    timestamp: string;
  }>;

  /** Veto gate actions taken */
  veto_actions: Array<{
    timestamp: string;
    decision: string;
    reason: string;
    original_message: string;
    modified_message?: string;
  }>;
}
