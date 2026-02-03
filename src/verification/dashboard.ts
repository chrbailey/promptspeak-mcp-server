/**
 * Multi-LLM Consensus Dashboard
 *
 * Generates formatted reports for cross-LLM verification results.
 * Supports HTML, Markdown, and JSON output formats.
 */

import type {
  VerificationResult,
  ProviderResponse,
  Discrepancy,
  LLMProvider,
} from './cross-llm.js';

// ===============================================================================
// TYPES
// ===============================================================================

export type DashboardFormat = 'html' | 'markdown' | 'json';

export interface DashboardOptions {
  /** Output format */
  format: DashboardFormat;
  /** Include detailed provider responses */
  includeDetails?: boolean;
  /** Include raw response data */
  includeRawResponses?: boolean;
  /** Custom title for the dashboard */
  title?: string;
}

export interface DashboardOutput {
  format: DashboardFormat;
  content: string;
  generatedAt: string;
}

export interface ConsensusSummary {
  score: number;
  status: 'high' | 'medium' | 'low' | 'none';
  statusLabel: string;
  statusColor: string;
  verified: boolean;
  consensusRatio: string;
}

export interface ProviderSummary {
  provider: LLMProvider;
  model: string;
  confidence: number;
  latencyMs: number;
  status: 'success' | 'error';
  error?: string;
}

export interface DiscrepancySummary {
  field: string;
  severity: 'low' | 'medium' | 'high';
  severityLabel: string;
  severityColor: string;
  description: string;
  providers: Array<{ provider: LLMProvider; value: string }>;
}

export interface ConfidenceBreakdown {
  average: number;
  min: number;
  max: number;
  spread: number;
  providers: Array<{ provider: LLMProvider; confidence: number }>;
}

export interface LatencyBreakdown {
  average: number;
  min: number;
  max: number;
  total: number;
  providers: Array<{ provider: LLMProvider; latencyMs: number }>;
}

// ===============================================================================
// DASHBOARD GENERATOR
// ===============================================================================

/**
 * DashboardGenerator
 *
 * Formats verification results into human-readable dashboards.
 */
export class DashboardGenerator {
  /**
   * Generate a dashboard from verification results.
   */
  generate(
    result: VerificationResult,
    options: DashboardOptions
  ): DashboardOutput {
    const format = options.format;

    let content: string;
    switch (format) {
      case 'html':
        content = this.generateHTML(result, options);
        break;
      case 'markdown':
        content = this.generateMarkdown(result, options);
        break;
      case 'json':
        content = this.generateJSON(result, options);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return {
      format,
      content,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // SUMMARY CALCULATIONS
  // ---------------------------------------------------------------------------

  /**
   * Calculate consensus summary from verification result.
   */
  getConsensusSummary(result: VerificationResult): ConsensusSummary {
    const score = result.confidenceScore;
    let status: 'high' | 'medium' | 'low' | 'none';
    let statusLabel: string;
    let statusColor: string;

    if (score >= 0.8) {
      status = 'high';
      statusLabel = 'High Consensus';
      statusColor = '#22c55e'; // green
    } else if (score >= 0.6) {
      status = 'medium';
      statusLabel = 'Medium Consensus';
      statusColor = '#eab308'; // yellow
    } else if (score >= 0.3) {
      status = 'low';
      statusLabel = 'Low Consensus';
      statusColor = '#f97316'; // orange
    } else {
      status = 'none';
      statusLabel = 'No Consensus';
      statusColor = '#ef4444'; // red
    }

    return {
      score,
      status,
      statusLabel,
      statusColor,
      verified: result.verified,
      consensusRatio: `${result.consensusCount}/${result.totalProviders}`,
    };
  }

  /**
   * Get provider summaries.
   */
  getProviderSummaries(result: VerificationResult): ProviderSummary[] {
    return result.responses.map((r) => ({
      provider: r.provider,
      model: r.model,
      confidence: r.analysis.confidence,
      latencyMs: r.latencyMs,
      status: r.error ? 'error' : 'success',
      error: r.error,
    }));
  }

  /**
   * Get discrepancy summaries with formatting.
   */
  getDiscrepancySummaries(result: VerificationResult): DiscrepancySummary[] {
    return result.discrepancies.map((d) => {
      let severityLabel: string;
      let severityColor: string;

      switch (d.severity) {
        case 'high':
          severityLabel = 'High';
          severityColor = '#ef4444';
          break;
        case 'medium':
          severityLabel = 'Medium';
          severityColor = '#f97316';
          break;
        case 'low':
          severityLabel = 'Low';
          severityColor = '#eab308';
          break;
      }

      return {
        field: d.field,
        severity: d.severity,
        severityLabel,
        severityColor,
        description: d.description,
        providers: d.providers.map((p) => ({
          provider: p.provider,
          value: JSON.stringify(p.value),
        })),
      };
    });
  }

  /**
   * Get confidence breakdown across providers.
   */
  getConfidenceBreakdown(result: VerificationResult): ConfidenceBreakdown {
    const successful = result.responses.filter((r) => !r.error);
    const confidences = successful.map((r) => r.analysis.confidence);

    if (confidences.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        spread: 0,
        providers: [],
      };
    }

    const average =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const min = Math.min(...confidences);
    const max = Math.max(...confidences);

    return {
      average,
      min,
      max,
      spread: max - min,
      providers: successful.map((r) => ({
        provider: r.provider,
        confidence: r.analysis.confidence,
      })),
    };
  }

  /**
   * Get latency breakdown across providers.
   */
  getLatencyBreakdown(result: VerificationResult): LatencyBreakdown {
    const latencies = result.responses.map((r) => r.latencyMs);

    if (latencies.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        total: 0,
        providers: [],
      };
    }

    const total = latencies.reduce((a, b) => a + b, 0);
    const average = total / latencies.length;

    return {
      average,
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      total: result.durationMs,
      providers: result.responses.map((r) => ({
        provider: r.provider,
        latencyMs: r.latencyMs,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // HTML GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Generate HTML dashboard.
   */
  private generateHTML(
    result: VerificationResult,
    options: DashboardOptions
  ): string {
    const consensus = this.getConsensusSummary(result);
    const providers = this.getProviderSummaries(result);
    const discrepancies = this.getDiscrepancySummaries(result);
    const confidence = this.getConfidenceBreakdown(result);
    const latency = this.getLatencyBreakdown(result);

    const title = options.title || 'Multi-LLM Consensus Dashboard';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    .dashboard { max-width: 1200px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header .timestamp { color: #94a3b8; font-size: 0.875rem; }

    .consensus-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      text-align: center;
    }
    .consensus-score {
      font-size: 4rem;
      font-weight: bold;
      color: ${consensus.statusColor};
    }
    .consensus-label {
      font-size: 1.25rem;
      color: ${consensus.statusColor};
      margin-bottom: 1rem;
    }
    .consensus-meta {
      display: flex;
      justify-content: center;
      gap: 2rem;
      color: #94a3b8;
    }
    .verification-badge {
      display: inline-block;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      margin-top: 1rem;
    }
    .verified { background: #166534; color: #22c55e; }
    .not-verified { background: #7f1d1d; color: #ef4444; }
    .needs-review { background: #78350f; color: #fbbf24; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }

    .card {
      background: #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
    }
    .card h2 {
      font-size: 1rem;
      color: #94a3b8;
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .provider-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0;
      border-bottom: 1px solid #334155;
    }
    .provider-row:last-child { border-bottom: none; }
    .provider-name {
      font-weight: 600;
      text-transform: capitalize;
    }
    .provider-model { color: #64748b; font-size: 0.875rem; }
    .provider-stats { text-align: right; }
    .provider-confidence { font-size: 1.25rem; font-weight: 600; }
    .provider-latency { color: #64748b; font-size: 0.75rem; }
    .provider-error { color: #ef4444; font-size: 0.875rem; }

    .discrepancy {
      padding: 1rem;
      background: #0f172a;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      border-left: 4px solid;
    }
    .discrepancy:last-child { margin-bottom: 0; }
    .discrepancy-high { border-color: #ef4444; }
    .discrepancy-medium { border-color: #f97316; }
    .discrepancy-low { border-color: #eab308; }
    .discrepancy-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    .discrepancy-field { font-weight: 600; font-family: monospace; }
    .discrepancy-severity {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-weight: 600;
    }
    .severity-high { background: #7f1d1d; color: #ef4444; }
    .severity-medium { background: #78350f; color: #f97316; }
    .severity-low { background: #713f12; color: #eab308; }
    .discrepancy-desc { color: #94a3b8; font-size: 0.875rem; }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0;
    }
    .stat-label { color: #94a3b8; }
    .stat-value { font-weight: 600; }

    .bar-container {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .no-discrepancies {
      text-align: center;
      color: #22c55e;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <div class="dashboard">
    <header class="header">
      <h1>${this.escapeHtml(title)}</h1>
      <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
    </header>

    <div class="consensus-card">
      <div class="consensus-score">${Math.round(consensus.score * 100)}%</div>
      <div class="consensus-label">${consensus.statusLabel}</div>
      <div class="consensus-meta">
        <span>Providers: ${consensus.consensusRatio}</span>
        <span>Duration: ${result.durationMs}ms</span>
      </div>
      ${this.renderVerificationBadge(result)}
    </div>

    <div class="grid">
      <div class="card">
        <h2>Provider Results</h2>
        ${providers.map((p) => this.renderProviderRowHTML(p)).join('')}
      </div>

      <div class="card">
        <h2>Confidence Breakdown</h2>
        <div class="stat-row">
          <span class="stat-label">Average</span>
          <span class="stat-value">${(confidence.average * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Min / Max</span>
          <span class="stat-value">${(confidence.min * 100).toFixed(1)}% / ${(confidence.max * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Spread</span>
          <span class="stat-value">${(confidence.spread * 100).toFixed(1)}%</span>
        </div>
        <div class="bar-container">
          <div class="bar-fill" style="width: ${confidence.average * 100}%; background: ${consensus.statusColor};"></div>
        </div>
      </div>

      <div class="card">
        <h2>Latency</h2>
        <div class="stat-row">
          <span class="stat-label">Average</span>
          <span class="stat-value">${Math.round(latency.average)}ms</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Min / Max</span>
          <span class="stat-value">${latency.min}ms / ${latency.max}ms</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total (parallel)</span>
          <span class="stat-value">${latency.total}ms</span>
        </div>
      </div>

      <div class="card" style="grid-column: 1 / -1;">
        <h2>Discrepancies (${discrepancies.length})</h2>
        ${discrepancies.length > 0 ? discrepancies.map((d) => this.renderDiscrepancyHTML(d)).join('') : '<div class="no-discrepancies">No discrepancies found - all providers agree</div>'}
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private renderVerificationBadge(result: VerificationResult): string {
    if (result.verified) {
      return '<div class="verification-badge verified">VERIFIED</div>';
    } else if (result.needsHumanReview) {
      return '<div class="verification-badge needs-review">NEEDS HUMAN REVIEW</div>';
    } else {
      return '<div class="verification-badge not-verified">NOT VERIFIED</div>';
    }
  }

  private renderProviderRowHTML(provider: ProviderSummary): string {
    if (provider.status === 'error') {
      return `
        <div class="provider-row">
          <div>
            <div class="provider-name">${provider.provider}</div>
            <div class="provider-model">${this.escapeHtml(provider.model)}</div>
          </div>
          <div class="provider-stats">
            <div class="provider-error">Error: ${this.escapeHtml(provider.error || 'Unknown')}</div>
            <div class="provider-latency">${provider.latencyMs}ms</div>
          </div>
        </div>`;
    }

    const confColor = this.getConfidenceColor(provider.confidence);
    return `
      <div class="provider-row">
        <div>
          <div class="provider-name">${provider.provider}</div>
          <div class="provider-model">${this.escapeHtml(provider.model)}</div>
        </div>
        <div class="provider-stats">
          <div class="provider-confidence" style="color: ${confColor};">${(provider.confidence * 100).toFixed(0)}%</div>
          <div class="provider-latency">${provider.latencyMs}ms</div>
        </div>
      </div>`;
  }

  private renderDiscrepancyHTML(discrepancy: DiscrepancySummary): string {
    return `
      <div class="discrepancy discrepancy-${discrepancy.severity}">
        <div class="discrepancy-header">
          <span class="discrepancy-field">${this.escapeHtml(discrepancy.field)}</span>
          <span class="discrepancy-severity severity-${discrepancy.severity}">${discrepancy.severityLabel}</span>
        </div>
        <div class="discrepancy-desc">${this.escapeHtml(discrepancy.description)}</div>
      </div>`;
  }

  private getConfidenceColor(confidence: number): string {
    if (confidence >= 0.8) return '#22c55e';
    if (confidence >= 0.6) return '#eab308';
    if (confidence >= 0.3) return '#f97316';
    return '#ef4444';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ---------------------------------------------------------------------------
  // MARKDOWN GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Generate Markdown dashboard.
   */
  private generateMarkdown(
    result: VerificationResult,
    options: DashboardOptions
  ): string {
    const consensus = this.getConsensusSummary(result);
    const providers = this.getProviderSummaries(result);
    const discrepancies = this.getDiscrepancySummaries(result);
    const confidence = this.getConfidenceBreakdown(result);
    const latency = this.getLatencyBreakdown(result);

    const title = options.title || 'Multi-LLM Consensus Dashboard';
    const lines: string[] = [];

    // Header
    lines.push(`# ${title}`);
    lines.push('');
    lines.push(`*Generated: ${new Date().toISOString()}*`);
    lines.push('');

    // Consensus Score
    lines.push('## Consensus Score');
    lines.push('');
    lines.push(`**${Math.round(consensus.score * 100)}%** - ${consensus.statusLabel}`);
    lines.push('');
    lines.push(`- **Status:** ${result.verified ? 'VERIFIED' : result.needsHumanReview ? 'NEEDS HUMAN REVIEW' : 'NOT VERIFIED'}`);
    lines.push(`- **Providers:** ${consensus.consensusRatio}`);
    lines.push(`- **Duration:** ${result.durationMs}ms`);
    lines.push('');

    // Provider Results
    lines.push('## Provider Results');
    lines.push('');
    lines.push('| Provider | Model | Confidence | Latency | Status |');
    lines.push('|----------|-------|------------|---------|--------|');
    for (const p of providers) {
      const conf = p.status === 'error' ? 'N/A' : `${(p.confidence * 100).toFixed(0)}%`;
      const status = p.status === 'error' ? `Error: ${p.error}` : 'OK';
      lines.push(`| ${p.provider} | ${p.model} | ${conf} | ${p.latencyMs}ms | ${status} |`);
    }
    lines.push('');

    // Confidence Breakdown
    lines.push('## Confidence Breakdown');
    lines.push('');
    lines.push(`- **Average:** ${(confidence.average * 100).toFixed(1)}%`);
    lines.push(`- **Min:** ${(confidence.min * 100).toFixed(1)}%`);
    lines.push(`- **Max:** ${(confidence.max * 100).toFixed(1)}%`);
    lines.push(`- **Spread:** ${(confidence.spread * 100).toFixed(1)}%`);
    lines.push('');

    // Latency
    lines.push('## Latency');
    lines.push('');
    lines.push(`- **Average:** ${Math.round(latency.average)}ms`);
    lines.push(`- **Min:** ${latency.min}ms`);
    lines.push(`- **Max:** ${latency.max}ms`);
    lines.push(`- **Total (parallel):** ${latency.total}ms`);
    lines.push('');

    // Discrepancies
    lines.push('## Discrepancies');
    lines.push('');
    if (discrepancies.length === 0) {
      lines.push('*No discrepancies found - all providers agree*');
    } else {
      for (const d of discrepancies) {
        const severityIcon = d.severity === 'high' ? '!!!' : d.severity === 'medium' ? '!!' : '!';
        lines.push(`### ${severityIcon} \`${d.field}\` [${d.severityLabel}]`);
        lines.push('');
        lines.push(d.description);
        lines.push('');
        lines.push('**Provider values:**');
        for (const pv of d.providers) {
          lines.push(`- ${pv.provider}: \`${pv.value}\``);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // JSON GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Generate JSON dashboard.
   */
  private generateJSON(
    result: VerificationResult,
    options: DashboardOptions
  ): string {
    const consensus = this.getConsensusSummary(result);
    const providers = this.getProviderSummaries(result);
    const discrepancies = this.getDiscrepancySummaries(result);
    const confidence = this.getConfidenceBreakdown(result);
    const latency = this.getLatencyBreakdown(result);

    const dashboard = {
      title: options.title || 'Multi-LLM Consensus Dashboard',
      generatedAt: new Date().toISOString(),
      consensus: {
        score: consensus.score,
        scorePercent: Math.round(consensus.score * 100),
        status: consensus.status,
        statusLabel: consensus.statusLabel,
        verified: consensus.verified,
        consensusCount: result.consensusCount,
        totalProviders: result.totalProviders,
        needsHumanReview: result.needsHumanReview,
      },
      providers,
      confidence: {
        average: confidence.average,
        averagePercent: Math.round(confidence.average * 100),
        min: confidence.min,
        max: confidence.max,
        spread: confidence.spread,
        breakdown: confidence.providers,
      },
      latency: {
        average: Math.round(latency.average),
        min: latency.min,
        max: latency.max,
        total: latency.total,
        breakdown: latency.providers,
      },
      discrepancies: discrepancies.map((d) => ({
        field: d.field,
        severity: d.severity,
        description: d.description,
        providers: d.providers,
      })),
      raw: options.includeRawResponses
        ? {
            responses: result.responses,
            durationMs: result.durationMs,
          }
        : undefined,
    };

    return JSON.stringify(dashboard, null, 2);
  }
}

// ===============================================================================
// SINGLETON
// ===============================================================================

let dashboardInstance: DashboardGenerator | null = null;

/**
 * Get the dashboard generator singleton.
 */
export function getDashboardGenerator(): DashboardGenerator {
  if (!dashboardInstance) {
    dashboardInstance = new DashboardGenerator();
  }
  return dashboardInstance;
}

/**
 * Create a new dashboard generator (for testing).
 */
export function createDashboardGenerator(): DashboardGenerator {
  return new DashboardGenerator();
}
