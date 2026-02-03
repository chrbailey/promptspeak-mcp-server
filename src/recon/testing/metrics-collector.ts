/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * METRICS COLLECTOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Collects and aggregates test metrics from scenario runs.
 * Provides summary reports and analysis of test outcomes.
 *
 * Features:
 * - Track success rates across scenarios
 * - Measure detection avoidance effectiveness
 * - Calculate average drift scores
 * - Generate comprehensive test summary reports
 * - Export metrics in various formats
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ManipulationTactic } from '../types';
import { ScenarioResult, ScenarioStatus } from './scenario-runner';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Metrics for a single scenario type.
 */
export interface ScenarioMetrics {
  /** Scenario name/type */
  scenarioName: string;

  /** Total runs */
  totalRuns: number;

  /** Successful runs */
  successCount: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average turns to completion */
  averageTurns: number;

  /** Average duration (ms) */
  averageDurationMs: number;

  /** Average drift score */
  averageDriftScore: number;

  /** Max drift score observed */
  maxDriftScore: number;

  /** Detection avoidance rate */
  detectionAvoidanceRate: number;

  /** Times AI was detected */
  detectedCount: number;

  /** Average blocked responses */
  averageBlockedResponses: number;

  /** Average modified responses */
  averageModifiedResponses: number;

  /** Tactics detected frequency */
  tacticFrequency: Record<ManipulationTactic, number>;

  /** Status distribution */
  statusDistribution: Record<ScenarioStatus, number>;

  /** Results */
  results: ScenarioResult[];
}

/**
 * Overall test metrics.
 */
export interface TestMetrics {
  /** Total scenarios run */
  totalScenarios: number;

  /** Total individual runs */
  totalRuns: number;

  /** Overall success rate */
  overallSuccessRate: number;

  /** Overall detection avoidance rate */
  overallDetectionAvoidanceRate: number;

  /** Average drift across all scenarios */
  overallAverageDrift: number;

  /** Average turns across all scenarios */
  overallAverageTurns: number;

  /** Average duration across all scenarios */
  overallAverageDurationMs: number;

  /** Total blocked responses */
  totalBlockedResponses: number;

  /** Total modified responses */
  totalModifiedResponses: number;

  /** Most common tactics detected */
  topTactics: Array<{ tactic: ManipulationTactic; count: number }>;

  /** Metrics by scenario type */
  byScenario: Record<string, ScenarioMetrics>;

  /** Collection timestamp */
  collectedAt: string;

  /** Collection duration (ms) */
  collectionDurationMs: number;
}

/**
 * Snapshot of current metrics state.
 */
export interface MetricsSnapshot {
  metrics: TestMetrics;
  timestamp: string;
}

/**
 * Test summary report.
 */
export interface TestSummaryReport {
  /** Report title */
  title: string;

  /** Report generation time */
  generatedAt: string;

  /** Executive summary */
  summary: {
    totalTests: number;
    successRate: string;
    detectionAvoidanceRate: string;
    averageDrift: string;
    recommendation: string;
  };

  /** Detailed metrics */
  metrics: TestMetrics;

  /** Scenario breakdowns */
  scenarios: Array<{
    name: string;
    successRate: string;
    averageTurns: number;
    topIssue: string;
  }>;

  /** Key findings */
  findings: string[];

  /** Recommendations */
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS COLLECTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Collects and aggregates test metrics.
 */
export class MetricsCollector {
  private results: ScenarioResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA COLLECTION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Record a scenario result.
   */
  recordScenarioResult(result: ScenarioResult): void {
    this.results.push(result);
  }

  /**
   * Record multiple scenario results.
   */
  recordBatchResults(results: ScenarioResult[]): void {
    this.results.push(...results);
  }

  /**
   * Clear all recorded results.
   */
  clear(): void {
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Get all recorded results.
   */
  getResults(): ScenarioResult[] {
    return [...this.results];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // METRICS CALCULATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate metrics for a specific scenario name.
   */
  getScenarioMetrics(scenarioName: string): ScenarioMetrics | null {
    const scenarioResults = this.results.filter(r =>
      r.symbolId.includes(scenarioName.toUpperCase().replace(/\s+/g, '_'))
    );

    if (scenarioResults.length === 0) {
      return null;
    }

    return this.calculateScenarioMetrics(scenarioName, scenarioResults);
  }

  /**
   * Calculate overall test metrics.
   */
  getTestMetrics(): TestMetrics {
    const now = Date.now();

    if (this.results.length === 0) {
      return this.emptyMetrics(now);
    }

    // Group results by scenario
    const byScenario = this.groupByScenario();

    // Calculate per-scenario metrics
    const scenarioMetrics: Record<string, ScenarioMetrics> = {};
    for (const [name, results] of Object.entries(byScenario)) {
      scenarioMetrics[name] = this.calculateScenarioMetrics(name, results);
    }

    // Calculate overall metrics
    const successCount = this.results.filter(r => r.status === 'success').length;
    const detectedCount = this.results.filter(r => r.aiSuspected).length;
    const totalDrift = this.results.reduce((sum, r) => sum + r.averageDriftScore, 0);
    const totalTurns = this.results.reduce((sum, r) => sum + r.turns, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.durationMs, 0);
    const totalBlocked = this.results.reduce((sum, r) => sum + r.blockedResponseCount, 0);
    const totalModified = this.results.reduce((sum, r) => sum + r.modifiedResponseCount, 0);

    // Calculate tactic frequency
    const tacticCounts: Record<string, number> = {};
    for (const result of this.results) {
      for (const tactic of result.tacticsDetected) {
        tacticCounts[tactic] = (tacticCounts[tactic] || 0) + 1;
      }
    }

    const topTactics = Object.entries(tacticCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tactic, count]) => ({ tactic: tactic as ManipulationTactic, count }));

    return {
      totalScenarios: Object.keys(scenarioMetrics).length,
      totalRuns: this.results.length,
      overallSuccessRate: this.results.length > 0 ? successCount / this.results.length : 0,
      overallDetectionAvoidanceRate: this.results.length > 0
        ? (this.results.length - detectedCount) / this.results.length
        : 1,
      overallAverageDrift: this.results.length > 0 ? totalDrift / this.results.length : 0,
      overallAverageTurns: this.results.length > 0 ? totalTurns / this.results.length : 0,
      overallAverageDurationMs: this.results.length > 0 ? totalDuration / this.results.length : 0,
      totalBlockedResponses: totalBlocked,
      totalModifiedResponses: totalModified,
      topTactics,
      byScenario: scenarioMetrics,
      collectedAt: new Date().toISOString(),
      collectionDurationMs: now - this.startTime,
    };
  }

  /**
   * Create a snapshot of current metrics.
   */
  getSnapshot(): MetricsSnapshot {
    return {
      metrics: this.getTestMetrics(),
      timestamp: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REPORT GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a comprehensive test summary report.
   */
  generateReport(): TestSummaryReport {
    const metrics = this.getTestMetrics();

    // Generate findings
    const findings = this.generateFindings(metrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);

    // Determine overall recommendation
    const recommendation = this.determineOverallRecommendation(metrics);

    // Build scenario summaries
    const scenarios = Object.entries(metrics.byScenario).map(([name, sm]) => ({
      name,
      successRate: `${(sm.successRate * 100).toFixed(1)}%`,
      averageTurns: Math.round(sm.averageTurns),
      topIssue: this.determineTopIssue(sm),
    }));

    return {
      title: 'Recon Mission Test Summary Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalTests: metrics.totalRuns,
        successRate: `${(metrics.overallSuccessRate * 100).toFixed(1)}%`,
        detectionAvoidanceRate: `${(metrics.overallDetectionAvoidanceRate * 100).toFixed(1)}%`,
        averageDrift: `${(metrics.overallAverageDrift * 100).toFixed(1)}%`,
        recommendation,
      },
      metrics,
      scenarios,
      findings,
      recommendations,
    };
  }

  /**
   * Generate a text summary suitable for logging.
   */
  generateTextSummary(): string {
    const metrics = this.getTestMetrics();
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════════════');
    lines.push('                    RECON MISSION TEST SUMMARY                          ');
    lines.push('═══════════════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Total Tests:              ${metrics.totalRuns}`);
    lines.push(`Success Rate:             ${(metrics.overallSuccessRate * 100).toFixed(1)}%`);
    lines.push(`Detection Avoidance:      ${(metrics.overallDetectionAvoidanceRate * 100).toFixed(1)}%`);
    lines.push(`Average Drift:            ${(metrics.overallAverageDrift * 100).toFixed(1)}%`);
    lines.push(`Average Turns:            ${metrics.overallAverageTurns.toFixed(1)}`);
    lines.push(`Average Duration:         ${metrics.overallAverageDurationMs.toFixed(0)}ms`);
    lines.push(`Blocked Responses:        ${metrics.totalBlockedResponses}`);
    lines.push(`Modified Responses:       ${metrics.totalModifiedResponses}`);
    lines.push('');

    if (metrics.topTactics.length > 0) {
      lines.push('Top Tactics Detected:');
      for (const { tactic, count } of metrics.topTactics.slice(0, 5)) {
        lines.push(`  - ${tactic}: ${count}`);
      }
      lines.push('');
    }

    lines.push('Scenario Breakdown:');
    for (const [name, sm] of Object.entries(metrics.byScenario)) {
      lines.push(`  ${name}:`);
      lines.push(`    Success: ${(sm.successRate * 100).toFixed(0)}% | Turns: ${sm.averageTurns.toFixed(1)} | Drift: ${(sm.averageDriftScore * 100).toFixed(0)}%`);
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON.
   */
  exportJSON(): string {
    return JSON.stringify(this.getTestMetrics(), null, 2);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private groupByScenario(): Record<string, ScenarioResult[]> {
    const groups: Record<string, ScenarioResult[]> = {};

    for (const result of this.results) {
      // Extract scenario name from symbol ID
      // Format: Ξ.RECON.SCENARIO_NAME_TIMESTAMP
      const parts = result.symbolId.split('.');
      if (parts.length >= 3) {
        const nameWithTimestamp = parts[2];
        // Remove timestamp suffix (last part after underscore that looks like hex)
        const nameParts = nameWithTimestamp.split('_');
        if (nameParts.length > 1 && /^[A-Z0-9]+$/.test(nameParts[nameParts.length - 1])) {
          nameParts.pop();
        }
        const name = nameParts.join('_');

        if (!groups[name]) {
          groups[name] = [];
        }
        groups[name].push(result);
      }
    }

    return groups;
  }

  private calculateScenarioMetrics(name: string, results: ScenarioResult[]): ScenarioMetrics {
    const successCount = results.filter(r => r.status === 'success').length;
    const detectedCount = results.filter(r => r.aiSuspected).length;

    // Calculate tactic frequency
    const tacticFrequency: Record<ManipulationTactic, number> = {} as Record<ManipulationTactic, number>;
    for (const result of results) {
      for (const tactic of result.uniqueTactics) {
        tacticFrequency[tactic] = (tacticFrequency[tactic] || 0) + 1;
      }
    }

    // Calculate status distribution
    const statusDistribution: Record<ScenarioStatus, number> = {
      success: 0,
      max_turns_reached: 0,
      blocked: 0,
      detected: 0,
      aborted: 0,
      error: 0,
      terminated: 0,
    };
    for (const result of results) {
      statusDistribution[result.status]++;
    }

    return {
      scenarioName: name,
      totalRuns: results.length,
      successCount,
      successRate: results.length > 0 ? successCount / results.length : 0,
      averageTurns: results.length > 0
        ? results.reduce((sum, r) => sum + r.turns, 0) / results.length
        : 0,
      averageDurationMs: results.length > 0
        ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
        : 0,
      averageDriftScore: results.length > 0
        ? results.reduce((sum, r) => sum + r.averageDriftScore, 0) / results.length
        : 0,
      maxDriftScore: results.length > 0
        ? Math.max(...results.map(r => r.finalDriftScore))
        : 0,
      detectionAvoidanceRate: results.length > 0
        ? (results.length - detectedCount) / results.length
        : 1,
      detectedCount,
      averageBlockedResponses: results.length > 0
        ? results.reduce((sum, r) => sum + r.blockedResponseCount, 0) / results.length
        : 0,
      averageModifiedResponses: results.length > 0
        ? results.reduce((sum, r) => sum + r.modifiedResponseCount, 0) / results.length
        : 0,
      tacticFrequency,
      statusDistribution,
      results,
    };
  }

  private generateFindings(metrics: TestMetrics): string[] {
    const findings: string[] = [];

    // Success rate finding
    if (metrics.overallSuccessRate < 0.5) {
      findings.push('SUCCESS RATE BELOW 50%: Overall mission success rate is concerning.');
    } else if (metrics.overallSuccessRate > 0.8) {
      findings.push('Strong success rate across scenarios.');
    }

    // Detection finding
    if (metrics.overallDetectionAvoidanceRate < 0.9) {
      findings.push('DETECTION RISK: AI detection occurred in some scenarios.');
    }

    // Drift finding
    if (metrics.overallAverageDrift > 0.2) {
      findings.push('HIGH DRIFT: Average position drift exceeds 20%, indicating potential negotiation weakness.');
    }

    // Blocked responses finding
    if (metrics.totalBlockedResponses > metrics.totalRuns * 0.2) {
      findings.push('HIGH BLOCK RATE: Many responses were blocked by the veto gate.');
    }

    // Top tactics finding
    if (metrics.topTactics.length > 0) {
      const topTactic = metrics.topTactics[0];
      findings.push(`MOST COMMON TACTIC: ${topTactic.tactic} detected ${topTactic.count} times.`);
    }

    return findings;
  }

  private generateRecommendations(metrics: TestMetrics): string[] {
    const recommendations: string[] = [];

    if (metrics.overallSuccessRate < 0.7) {
      recommendations.push('Consider adjusting performer persistence strategies for better success rates.');
    }

    if (metrics.overallDetectionAvoidanceRate < 0.95) {
      recommendations.push('Review stealth configuration to improve detection avoidance.');
    }

    if (metrics.overallAverageDrift > 0.15) {
      recommendations.push('Tighten drift thresholds in analyst configuration.');
    }

    if (metrics.totalBlockedResponses > metrics.totalRuns * 0.1) {
      recommendations.push('Review veto gate thresholds - may be too restrictive.');
    }

    // Scenario-specific recommendations
    for (const [name, sm] of Object.entries(metrics.byScenario)) {
      if (sm.successRate < 0.5) {
        recommendations.push(`Investigate ${name} scenario - success rate below 50%.`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('System performing within expected parameters.');
    }

    return recommendations;
  }

  private determineOverallRecommendation(metrics: TestMetrics): string {
    if (metrics.overallSuccessRate > 0.8 && metrics.overallDetectionAvoidanceRate > 0.95) {
      return 'READY FOR DEPLOYMENT - System performing well.';
    }
    if (metrics.overallSuccessRate > 0.6 && metrics.overallDetectionAvoidanceRate > 0.9) {
      return 'ACCEPTABLE - Minor improvements recommended.';
    }
    if (metrics.overallSuccessRate > 0.4) {
      return 'NEEDS IMPROVEMENT - Review configuration and strategies.';
    }
    return 'REQUIRES ATTENTION - Significant issues detected.';
  }

  private determineTopIssue(sm: ScenarioMetrics): string {
    if (sm.detectedCount > 0) {
      return 'AI detection';
    }
    if (sm.averageDriftScore > 0.2) {
      return 'High drift';
    }
    if (sm.averageBlockedResponses > 2) {
      return 'Many blocked responses';
    }
    if (sm.successRate < 0.5) {
      return 'Low success rate';
    }
    return 'None';
  }

  private emptyMetrics(now: number): TestMetrics {
    return {
      totalScenarios: 0,
      totalRuns: 0,
      overallSuccessRate: 0,
      overallDetectionAvoidanceRate: 1,
      overallAverageDrift: 0,
      overallAverageTurns: 0,
      overallAverageDurationMs: 0,
      totalBlockedResponses: 0,
      totalModifiedResponses: 0,
      topTactics: [],
      byScenario: {},
      collectedAt: new Date().toISOString(),
      collectionDurationMs: now - this.startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a metrics collector.
 */
export function createMetricsCollector(): MetricsCollector {
  return new MetricsCollector();
}
