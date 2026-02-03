/**
 * ===============================================================================
 * MISSION OVERVIEW SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the mission overview section of an intelligence report,
 * including basic mission info, duration, and message statistics.
 *
 * ===============================================================================
 */

import { MarineReconSymbol } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  MissionOverviewData,
} from '../types';

/**
 * Generate the mission overview section.
 */
export function generateMissionOverview(symbol: MarineReconSymbol): ReportSection {
  const data = extractMissionOverviewData(symbol);
  const findings = analyzeMissionOverview(data, symbol);
  const metrics = calculateMissionMetrics(data);

  return {
    id: 'mission-overview',
    title: 'Mission Overview',
    content: formatMissionOverviewContent(data),
    findings,
    metrics,
  };
}

/**
 * Extract mission overview data from symbol.
 */
export function extractMissionOverviewData(symbol: MarineReconSymbol): MissionOverviewData {
  const engagement = symbol.state.engagement;
  const timestamps = engagement.timestamps;
  const conversation = engagement.conversation;

  // Calculate duration
  const startTime = new Date(timestamps.mission_start).getTime();
  const endTime = timestamps.mission_end
    ? new Date(timestamps.mission_end).getTime()
    : new Date(timestamps.last_activity).getTime();
  const elapsedMs = endTime - startTime;

  // Format duration
  const hours = Math.floor(elapsedMs / 3600000);
  const minutes = Math.floor((elapsedMs % 3600000) / 60000);
  const seconds = Math.floor((elapsedMs % 60000) / 1000);
  const formattedDuration = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  // Calculate message ratio
  const ratio = conversation.their_message_count > 0
    ? (conversation.our_message_count / conversation.their_message_count).toFixed(2)
    : 'N/A';

  // Assess intel requirements
  const intelRequirements = symbol.mission.objective.intelligence_requirements.map(req => {
    // Simple heuristic: check if observations mention related terms
    const observations = engagement.intelligence.observations;
    const relatedObservations = observations.filter(obs =>
      req.toLowerCase().split(' ').some(word =>
        word.length > 3 && obs.content.toLowerCase().includes(word)
      )
    );

    let status: 'answered' | 'partial' | 'unanswered';
    if (relatedObservations.length >= 2) {
      status = 'answered';
    } else if (relatedObservations.length === 1) {
      status = 'partial';
    } else {
      status = 'unanswered';
    }

    return {
      requirement: req,
      status,
      notes: relatedObservations.length > 0
        ? `${relatedObservations.length} related observation(s)`
        : undefined,
    };
  });

  return {
    objective: symbol.mission.objective.primary_goal,
    target: formatTargetDescription(symbol),
    status: engagement.status,
    duration: {
      start: timestamps.mission_start,
      end: timestamps.mission_end,
      elapsed_ms: elapsedMs,
      formatted: formattedDuration,
    },
    messages: {
      total: conversation.message_count,
      ours: conversation.our_message_count,
      theirs: conversation.their_message_count,
      ratio,
    },
    intel_requirements: intelRequirements,
  };
}

/**
 * Format target description from symbol.
 */
function formatTargetDescription(symbol: MarineReconSymbol): string {
  const target = symbol.mission.target;
  const parts: string[] = [];

  // Type
  const typeMap: Record<string, string> = {
    customer_service_chatbot: 'Customer Service Chatbot',
    sales_bot: 'Sales Bot',
    support_bot: 'Support Bot',
    general_assistant: 'General Assistant',
    unknown: 'Unknown Type',
  };
  parts.push(typeMap[target.type] || target.type);

  // Organization
  if (target.organization) {
    parts.push(`at ${target.organization}`);
  }

  // Platform
  const platformMap: Record<string, string> = {
    web_chat: 'Web Chat',
    phone: 'Phone',
    email: 'Email',
    social_media: 'Social Media',
    api: 'API',
  };
  parts.push(`via ${platformMap[target.platform] || target.platform}`);

  return parts.join(' ');
}

/**
 * Analyze mission overview and generate findings.
 */
function analyzeMissionOverview(data: MissionOverviewData, symbol: MarineReconSymbol): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Mission completion status
  const statusSeverity: Record<string, ReportFinding['severity']> = {
    completed: 'info',
    extracting: 'info',
    aborted: 'high',
    compromised: 'critical',
    active: 'medium',
    paused: 'low',
    initializing: 'low',
  };

  findings.push({
    id: 'MO-001',
    title: 'Mission Status',
    description: `Mission concluded with status: ${data.status}`,
    severity: statusSeverity[data.status] || 'info',
    confidence: 1.0,
  });

  // Intel requirements coverage
  const answered = data.intel_requirements.filter(r => r.status === 'answered').length;
  const partial = data.intel_requirements.filter(r => r.status === 'partial').length;
  const total = data.intel_requirements.length;
  const coverage = total > 0 ? (answered + partial * 0.5) / total : 0;

  findings.push({
    id: 'MO-002',
    title: 'Intelligence Coverage',
    description: `${answered}/${total} intel requirements answered, ${partial} partially addressed (${(coverage * 100).toFixed(0)}% coverage)`,
    severity: coverage >= 0.8 ? 'info' : coverage >= 0.5 ? 'low' : 'medium',
    confidence: 0.8,
  });

  // Message volume assessment
  if (data.messages.total < 5) {
    findings.push({
      id: 'MO-003',
      title: 'Limited Engagement',
      description: 'Mission had limited message exchange, may have insufficient data for analysis',
      severity: 'medium',
      confidence: 0.9,
    });
  } else if (data.messages.total > 50) {
    findings.push({
      id: 'MO-003',
      title: 'Extended Engagement',
      description: 'Mission had extensive message exchange, rich data available for analysis',
      severity: 'info',
      confidence: 0.9,
    });
  }

  // Duration assessment
  const durationMinutes = data.duration.elapsed_ms / 60000;
  if (durationMinutes < 2 && data.status === 'completed') {
    findings.push({
      id: 'MO-004',
      title: 'Rapid Resolution',
      description: 'Mission completed unusually quickly, may indicate efficient target or premature conclusion',
      severity: 'low',
      confidence: 0.7,
    });
  } else if (durationMinutes > 30) {
    findings.push({
      id: 'MO-004',
      title: 'Extended Duration',
      description: 'Mission duration exceeded 30 minutes, may indicate complex negotiation or target resistance',
      severity: 'low',
      confidence: 0.7,
    });
  }

  return findings;
}

/**
 * Calculate mission metrics.
 */
function calculateMissionMetrics(data: MissionOverviewData): ReportMetric[] {
  const metrics: ReportMetric[] = [];

  // Duration metric
  metrics.push({
    name: 'Mission Duration',
    value: data.duration.formatted,
  });

  // Message count metrics
  metrics.push({
    name: 'Total Messages',
    value: data.messages.total,
  });

  metrics.push({
    name: 'Our Messages',
    value: data.messages.ours,
  });

  metrics.push({
    name: 'Their Messages',
    value: data.messages.theirs,
  });

  // Intel coverage
  const answered = data.intel_requirements.filter(r => r.status === 'answered').length;
  const total = data.intel_requirements.length;
  metrics.push({
    name: 'Intel Requirements Answered',
    value: `${answered}/${total}`,
    status: answered === total ? 'normal' : answered >= total / 2 ? 'warning' : 'critical',
  });

  return metrics;
}

/**
 * Format mission overview content.
 */
function formatMissionOverviewContent(data: MissionOverviewData): string {
  const lines: string[] = [];

  lines.push(`Objective: ${data.objective}`);
  lines.push(`Target: ${data.target}`);
  lines.push(`Status: ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`);
  lines.push('');
  lines.push(`Duration: ${data.duration.formatted}`);
  lines.push(`Started: ${data.duration.start}`);
  if (data.duration.end) {
    lines.push(`Ended: ${data.duration.end}`);
  }
  lines.push('');
  lines.push(`Messages Exchanged: ${data.messages.total} (Ours: ${data.messages.ours}, Theirs: ${data.messages.theirs})`);
  lines.push('');
  lines.push('Intelligence Requirements:');
  data.intel_requirements.forEach(req => {
    const statusIcon = req.status === 'answered' ? '[+]' : req.status === 'partial' ? '[~]' : '[-]';
    lines.push(`  ${statusIcon} ${req.requirement}${req.notes ? ` (${req.notes})` : ''}`);
  });

  return lines.join('\n');
}

export { MissionOverviewData };
