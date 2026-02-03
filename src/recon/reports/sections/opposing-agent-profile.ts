/**
 * ===============================================================================
 * OPPOSING AGENT PROFILE SECTION GENERATOR
 * ===============================================================================
 *
 * Generates the opposing agent profile section, analyzing the characteristics
 * and behavior of the AI/human agent encountered during reconnaissance.
 *
 * ===============================================================================
 */

import { MarineReconSymbol, OpposingAgentProfile } from '../../types';
import {
  ReportSection,
  ReportFinding,
  ReportMetric,
  OpposingAgentData,
} from '../types';

/**
 * Generate the opposing agent profile section.
 */
export function generateOpposingAgentProfile(symbol: MarineReconSymbol): ReportSection {
  const data = extractOpposingAgentData(symbol);
  const findings = analyzeOpposingAgent(data, symbol);
  const metrics = calculateAgentMetrics(data);

  return {
    id: 'opposing-agent-profile',
    title: 'Opposing Agent Profile',
    content: formatAgentProfileContent(data),
    findings,
    metrics,
    subsections: [
      createCapabilitiesSubsection(data),
      createLimitationsSubsection(data),
      createBehavioralSubsection(data),
    ].filter(s => s.content.length > 0),
  };
}

/**
 * Extract opposing agent data from symbol.
 */
export function extractOpposingAgentData(symbol: MarineReconSymbol): OpposingAgentData {
  const profile = symbol.state.engagement.intelligence.opposing_agent;
  const patterns = symbol.state.engagement.intelligence.patterns_observed;

  // Derive behavioral indicators from patterns and observations
  const behavioralIndicators: string[] = [];

  // Check for response time patterns
  const responsePatterns = profile.response_patterns.filter(p =>
    p.toLowerCase().includes('response') || p.toLowerCase().includes('time')
  );
  if (responsePatterns.length > 0) {
    behavioralIndicators.push(...responsePatterns);
  }

  // Add pattern-based indicators
  patterns.forEach(pattern => {
    if (pattern.occurrence_count >= 2) {
      behavioralIndicators.push(`${pattern.description} (observed ${pattern.occurrence_count}x)`);
    }
  });

  // Add type-specific indicators
  if (profile.suspected_type === 'ai') {
    behavioralIndicators.push('Consistent response formatting');
    behavioralIndicators.push('No apparent fatigue or frustration');
  } else if (profile.suspected_type === 'human') {
    behavioralIndicators.push('Variable response timing');
    behavioralIndicators.push('Informal language patterns');
  }

  return {
    type: profile.suspected_type,
    type_confidence: profile.type_confidence,
    capabilities: profile.capabilities,
    limitations: profile.limitations,
    response_patterns: profile.response_patterns,
    objectives: profile.apparent_objectives,
    behavioral_indicators: behavioralIndicators,
  };
}

/**
 * Analyze opposing agent and generate findings.
 */
function analyzeOpposingAgent(data: OpposingAgentData, symbol: MarineReconSymbol): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Agent type determination
  findings.push({
    id: 'OA-001',
    title: 'Agent Type Assessment',
    description: `Target identified as ${data.type.toUpperCase()} with ${(data.type_confidence * 100).toFixed(0)}% confidence`,
    severity: data.type_confidence >= 0.8 ? 'info' : data.type_confidence >= 0.5 ? 'low' : 'medium',
    confidence: data.type_confidence,
    evidence: data.behavioral_indicators.slice(0, 3),
  });

  // AI-specific findings
  if (data.type === 'ai') {
    findings.push({
      id: 'OA-002',
      title: 'AI Agent Confirmed',
      description: 'Target appears to be an AI agent, may employ programmatic manipulation tactics',
      severity: 'medium',
      confidence: data.type_confidence,
      evidence: data.behavioral_indicators.filter(i =>
        i.toLowerCase().includes('consistent') ||
        i.toLowerCase().includes('format') ||
        i.toLowerCase().includes('pattern')
      ),
    });

    // Check for potential human detection of our agent
    const detectionPatterns = symbol.state.engagement.intelligence.patterns_observed.filter(p =>
      p.description.toLowerCase().includes('detect') ||
      p.description.toLowerCase().includes('verify') ||
      p.description.toLowerCase().includes('confirm')
    );
    if (detectionPatterns.length > 0) {
      findings.push({
        id: 'OA-003',
        title: 'Detection Awareness',
        description: 'Target may have detection mechanisms for AI interlocutors',
        severity: 'high',
        confidence: 0.7,
        evidence: detectionPatterns.map(p => p.description),
      });
    }
  }

  // Capability analysis
  if (data.capabilities.length > 0) {
    const highValueCapabilities = data.capabilities.filter(c =>
      c.toLowerCase().includes('escalat') ||
      c.toLowerCase().includes('discount') ||
      c.toLowerCase().includes('refund') ||
      c.toLowerCase().includes('override')
    );
    if (highValueCapabilities.length > 0) {
      findings.push({
        id: 'OA-004',
        title: 'High-Value Capabilities Identified',
        description: `Target has ${highValueCapabilities.length} capabilities that may be leveraged`,
        severity: 'info',
        confidence: 0.8,
        evidence: highValueCapabilities,
      });
    }
  }

  // Limitation analysis
  if (data.limitations.length > 0) {
    findings.push({
      id: 'OA-005',
      title: 'Operational Limitations Identified',
      description: `${data.limitations.length} limitation(s) identified that may be exploitable`,
      severity: 'info',
      confidence: 0.75,
      evidence: data.limitations,
    });
  }

  // Objective analysis
  if (data.objectives.length > 0) {
    const aggressiveObjectives = data.objectives.filter(o =>
      o.toLowerCase().includes('minimize') ||
      o.toLowerCase().includes('deny') ||
      o.toLowerCase().includes('deflect') ||
      o.toLowerCase().includes('upsell')
    );
    if (aggressiveObjectives.length > 0) {
      findings.push({
        id: 'OA-006',
        title: 'Adversarial Objectives Detected',
        description: 'Target appears to have objectives that may conflict with customer interest',
        severity: 'medium',
        confidence: 0.7,
        evidence: aggressiveObjectives,
      });
    }
  }

  return findings;
}

/**
 * Calculate agent-related metrics.
 */
function calculateAgentMetrics(data: OpposingAgentData): ReportMetric[] {
  return [
    {
      name: 'Type Confidence',
      value: `${(data.type_confidence * 100).toFixed(0)}%`,
      threshold: 80,
      status: data.type_confidence >= 0.8 ? 'normal' : data.type_confidence >= 0.5 ? 'warning' : 'critical',
    },
    {
      name: 'Capabilities Identified',
      value: data.capabilities.length,
    },
    {
      name: 'Limitations Identified',
      value: data.limitations.length,
    },
    {
      name: 'Response Patterns',
      value: data.response_patterns.length,
    },
    {
      name: 'Objectives Identified',
      value: data.objectives.length,
    },
  ];
}

/**
 * Format agent profile content.
 */
function formatAgentProfileContent(data: OpposingAgentData): string {
  const lines: string[] = [];

  // Type assessment
  const typeDisplay = {
    human: 'Human Agent',
    ai: 'AI/Bot Agent',
    hybrid: 'Hybrid (AI-assisted Human)',
    unknown: 'Unknown Type',
  };
  lines.push(`Type: ${typeDisplay[data.type]} (${(data.type_confidence * 100).toFixed(0)}% confidence)`);
  lines.push('');

  // Objectives
  if (data.objectives.length > 0) {
    lines.push('Apparent Objectives:');
    data.objectives.forEach(obj => lines.push(`  - ${obj}`));
    lines.push('');
  }

  // Response patterns
  if (data.response_patterns.length > 0) {
    lines.push('Response Patterns:');
    data.response_patterns.forEach(pattern => lines.push(`  - ${pattern}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create capabilities subsection.
 */
function createCapabilitiesSubsection(data: OpposingAgentData): ReportSection {
  return {
    id: 'opposing-agent-capabilities',
    title: 'Identified Capabilities',
    content: data.capabilities.length > 0
      ? data.capabilities.map(c => `- ${c}`).join('\n')
      : 'No specific capabilities identified.',
    findings: [],
  };
}

/**
 * Create limitations subsection.
 */
function createLimitationsSubsection(data: OpposingAgentData): ReportSection {
  return {
    id: 'opposing-agent-limitations',
    title: 'Identified Limitations',
    content: data.limitations.length > 0
      ? data.limitations.map(l => `- ${l}`).join('\n')
      : 'No specific limitations identified.',
    findings: [],
  };
}

/**
 * Create behavioral subsection.
 */
function createBehavioralSubsection(data: OpposingAgentData): ReportSection {
  return {
    id: 'opposing-agent-behavioral',
    title: 'Behavioral Indicators',
    content: data.behavioral_indicators.length > 0
      ? data.behavioral_indicators.map(b => `- ${b}`).join('\n')
      : 'No behavioral indicators recorded.',
    findings: [],
  };
}

export { OpposingAgentData };
