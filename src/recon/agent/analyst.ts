/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ANALYST TRACK
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The Analyst is the "grounded core" of the dual-track agent.
 * It maintains strategic awareness, detects manipulation, monitors drift,
 * and provides guidance to the Performer.
 *
 * Key Responsibilities:
 * - Detect manipulation tactics from opposing agent
 * - Monitor drift from original position
 * - Track constraint compliance
 * - Provide strategic guidance to Performer
 * - Extract intelligence for reporting
 *
 * The Analyst does NOT:
 * - Generate responses directly (that's the Performer)
 * - Make final send/block decisions (that's the Veto Gate)
 * - Simulate human behavior (that's the Stealth layer)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  MarineReconSymbol,
  AnalystConfig,
  AnalystState,
  ManipulationTactic,
  DetectedTactic,
  DriftAssessment,
  ConstraintStatus,
  BehavioralPattern,
  ConstraintBoundary,
  VetoDecision,
  Constraint,
  RedLine,
} from '../types';
import { AnalystGuidance, ConversationMessage } from './performer';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analysis of an incoming message.
 */
export interface MessageAnalysis {
  /** Manipulation tactics detected */
  tactics_detected: DetectedTactic[];

  /** Risk assessment */
  risk_score: number;

  /** Is this a genuine attempt to help or obstruction? */
  intent_assessment: 'helpful' | 'neutral' | 'obstructive' | 'manipulative';

  /** Key information extracted */
  extracted_info: ExtractedInfo[];

  /** Constraint boundary probes detected */
  boundary_probes: BoundaryProbe[];

  /** Guidance for the Performer */
  guidance: AnalystGuidance;

  /** Overall assessment */
  summary: string;
}

/**
 * Information extracted from a message.
 */
export interface ExtractedInfo {
  /** Type of information */
  type: 'policy' | 'limit' | 'capability' | 'escalation_path' | 'other';

  /** Content */
  content: string;

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * A boundary being probed by the opposing agent.
 */
export interface BoundaryProbe {
  /** What boundary is being tested */
  boundary: string;

  /** Probe method */
  method: 'direct_ask' | 'implication' | 'test_case' | 'social_pressure';

  /** Our recommended response */
  recommended_response: 'deflect' | 'refuse' | 'redirect' | 'partial_reveal';
}

/**
 * Assessment of our proposed response.
 */
export interface ResponseAssessment {
  /** Veto recommendation */
  recommendation: VetoDecision;

  /** Risk level (0-1) */
  risk_level: number;

  /** Drift this would cause */
  drift_impact: number;

  /** Issues found */
  issues: ResponseIssue[];

  /** Suggested modifications */
  modifications?: string[];

  /** Reasoning */
  reasoning: string;
}

/**
 * An issue with a proposed response.
 */
export interface ResponseIssue {
  /** Severity */
  severity: 'info' | 'warning' | 'error' | 'critical';

  /** Issue type */
  type: 'red_line_proximity' | 'constraint_violation' | 'drift' | 'persona_break' | 'intel_leak';

  /** Description */
  description: string;

  /** Mitigation suggestion */
  mitigation?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYST CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Analyst track - maintains strategic awareness and detects manipulation.
 */
export class Analyst {
  private config: AnalystConfig;
  private state: AnalystState;
  private constraints: Constraint[];
  private redLines: RedLine[];
  private originalPosition: string;
  private conversationHistory: ConversationMessage[] = [];

  constructor(
    config: AnalystConfig,
    initialState: AnalystState,
    constraints: Constraint[],
    redLines: RedLine[],
    originalPosition: string
  ) {
    this.config = config;
    this.state = { ...initialState };
    this.constraints = constraints;
    this.redLines = redLines;
    this.originalPosition = originalPosition;
    this.state.drift_assessment.original_position = originalPosition;
    this.state.drift_assessment.current_position = originalPosition;
  }

  /**
   * Analyze an incoming message from the opposing agent.
   */
  analyzeIncomingMessage(message: string, context: ConversationMessage[]): MessageAnalysis {
    this.conversationHistory = context;

    // Detect manipulation tactics
    const tactics_detected = this.detectManipulationTactics(message);

    // Update state with detected tactics
    this.state.detected_tactics.push(...tactics_detected);

    // Calculate risk score
    const risk_score = this.calculateRiskScore(message, tactics_detected);
    this.state.current_risk_score = risk_score;

    // Assess intent
    const intent_assessment = this.assessIntent(message, tactics_detected);

    // Extract information
    const extracted_info = this.extractInformation(message);

    // Detect boundary probes
    const boundary_probes = this.detectBoundaryProbes(message);

    // Generate guidance for Performer
    const guidance = this.generateGuidance(message, tactics_detected, intent_assessment);

    // Build summary
    const summary = this.buildAnalysisSummary(tactics_detected, intent_assessment, risk_score);

    return {
      tactics_detected,
      risk_score,
      intent_assessment,
      extracted_info,
      boundary_probes,
      guidance,
      summary,
    };
  }

  /**
   * Assess a proposed response before sending.
   */
  assessProposedResponse(response: string): ResponseAssessment {
    const issues: ResponseIssue[] = [];

    // Check for red line proximity
    for (const redLine of this.redLines) {
      const proximity = this.calculateRedLineProximity(response, redLine);
      if (proximity > 0.7) {
        issues.push({
          severity: proximity > 0.9 ? 'critical' : 'error',
          type: 'red_line_proximity',
          description: `Response approaches red line: ${redLine.prohibition}`,
          mitigation: 'Remove or rephrase the concerning content',
        });
      }
    }

    // Check for constraint violations
    for (const constraint of this.constraints) {
      if (this.violatesConstraint(response, constraint)) {
        issues.push({
          severity: constraint.on_violation === 'abort' ? 'critical' : 'warning',
          type: 'constraint_violation',
          description: `May violate constraint: ${constraint.description}`,
          mitigation: 'Adjust response to comply with constraint',
        });
      }
    }

    // Calculate drift impact
    const drift_impact = this.calculateDriftImpact(response);
    if (drift_impact > 0.1) {
      issues.push({
        severity: drift_impact > 0.2 ? 'warning' : 'info',
        type: 'drift',
        description: `Response may cause position drift of ${(drift_impact * 100).toFixed(0)}%`,
        mitigation: 'Strengthen position language',
      });
    }

    // Check for persona breaks
    const personaIssues = this.checkPersonaConsistency(response);
    issues.push(...personaIssues);

    // Check for intel leaks
    const intelIssues = this.checkForIntelLeak(response);
    issues.push(...intelIssues);

    // Determine recommendation
    const recommendation = this.determineRecommendation(issues);

    // Calculate overall risk
    const risk_level = this.calculateResponseRiskLevel(issues);

    // Generate modifications if needed
    const modifications = recommendation !== 'approve' ? this.suggestModifications(response, issues) : undefined;

    return {
      recommendation,
      risk_level,
      drift_impact,
      issues,
      modifications,
      reasoning: this.buildAssessmentReasoning(issues, recommendation),
    };
  }

  /**
   * Update drift assessment based on conversation progress.
   */
  updateDriftAssessment(ourLastMessage: string, theirResponse: string): void {
    // Detect concessions we made
    const concessions = this.detectConcessions(ourLastMessage);
    if (concessions.length > 0) {
      this.state.drift_assessment.concessions.push(...concessions);
    }

    // Detect gains we achieved
    const gains = this.detectGains(theirResponse);
    if (gains.length > 0) {
      this.state.drift_assessment.gains.push(...gains);
    }

    // Update current position
    this.state.drift_assessment.current_position = this.summarizeCurrentPosition();

    // Calculate drift score
    this.state.drift_assessment.drift_score = this.calculateDriftScore();

    // Assess net outcome
    this.state.drift_assessment.net_assessment = this.assessNetOutcome();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANIPULATION DETECTION
  // ─────────────────────────────────────────────────────────────────────────────

  private detectManipulationTactics(message: string): DetectedTactic[] {
    const tactics: DetectedTactic[] = [];
    const messageLower = message.toLowerCase();
    const now = new Date().toISOString();

    // Anchoring detection
    if (this.detectAnchoring(messageLower)) {
      tactics.push({
        tactic: 'anchoring',
        detected_at: now,
        evidence: 'Initial extreme position or number presented',
        confidence: 0.7,
        counter_measure: 'Ignore anchor, restate our position',
      });
    }

    // Reciprocity detection
    if (this.detectReciprocity(messageLower)) {
      tactics.push({
        tactic: 'reciprocity',
        detected_at: now,
        evidence: 'Offering small concession to create obligation',
        confidence: 0.6,
        counter_measure: 'Accept without feeling obligated',
      });
    }

    // Urgency detection
    if (this.detectUrgency(messageLower)) {
      tactics.push({
        tactic: 'urgency',
        detected_at: now,
        evidence: 'False time pressure being applied',
        confidence: 0.8,
        counter_measure: 'Verify deadline, take needed time',
      });
    }

    // Authority detection
    if (this.detectAuthority(messageLower)) {
      tactics.push({
        tactic: 'authority',
        detected_at: now,
        evidence: 'Appeal to policy or rules',
        confidence: 0.6,
        counter_measure: 'Request exception process',
      });
    }

    // Social proof detection
    if (this.detectSocialProof(messageLower)) {
      tactics.push({
        tactic: 'social_proof',
        detected_at: now,
        evidence: 'Reference to what others accept',
        confidence: 0.7,
        counter_measure: 'Focus on our specific situation',
      });
    }

    // Exhaustion detection
    if (this.detectExhaustion(messageLower)) {
      tactics.push({
        tactic: 'exhaustion',
        detected_at: now,
        evidence: 'Repetitive denials or delays',
        confidence: 0.5,
        counter_measure: 'Maintain position, consider escalation',
      });
    }

    // Redirect detection
    if (this.detectRedirect(messageLower)) {
      tactics.push({
        tactic: 'redirect',
        detected_at: now,
        evidence: 'Attempt to change subject',
        confidence: 0.6,
        counter_measure: 'Acknowledge, then return to topic',
      });
    }

    // False choice detection
    if (this.detectFalseChoice(messageLower)) {
      tactics.push({
        tactic: 'false_choice',
        detected_at: now,
        evidence: 'Limited options presented as only possibilities',
        confidence: 0.7,
        counter_measure: 'Request additional options',
      });
    }

    return tactics;
  }

  private detectAnchoring(message: string): boolean {
    // Look for initial extreme numbers or positions
    const anchorPatterns = [
      /\b(only|just|maximum|at most)\s+\$?\d+/i,
      /\bno more than\b/i,
      /\bthe best (we|i) can (do|offer)\b/i,
    ];
    return anchorPatterns.some(p => p.test(message));
  }

  private detectReciprocity(message: string): boolean {
    const reciprocityPatterns = [
      /\b(as a gesture|as a courtesy|i'll make an exception)\b/i,
      /\b(since you'?ve been|because you'?re)\s+\w+\s+(customer|patient)\b/i,
      /\bi'?ll (do|make) (this|something) (for you|special)\b/i,
    ];
    return reciprocityPatterns.some(p => p.test(message));
  }

  private detectUrgency(message: string): boolean {
    const urgencyPatterns = [
      /\b(today only|expires|limited time|act now)\b/i,
      /\b(before|by) (end of|close of) (day|business)\b/i,
      /\b(must|need to) (decide|respond) (now|immediately|quickly)\b/i,
      /\b(won'?t be able to|can'?t) (offer|hold|guarantee) (this|it) (later|much longer)\b/i,
    ];
    return urgencyPatterns.some(p => p.test(message));
  }

  private detectAuthority(message: string): boolean {
    const authorityPatterns = [
      /\b(policy|policies|regulations?|rules?)\s+(state|say|require|don'?t allow)\b/i,
      /\b(unfortunately|i'?m sorry),?\s+(our|company|the)\s+policy\b/i,
      /\bper (our|the|company) (guidelines|policy|procedure)\b/i,
    ];
    return authorityPatterns.some(p => p.test(message));
  }

  private detectSocialProof(message: string): boolean {
    const socialPatterns = [
      /\b(most|many|other) (customers?|people|users?)\s+(accept|choose|prefer|are happy with)\b/i,
      /\b(typically|usually|normally),?\s+(customers?|people)\b/i,
      /\bthis is (standard|normal|typical|common)\b/i,
    ];
    return socialPatterns.some(p => p.test(message));
  }

  private detectExhaustion(message: string): boolean {
    // This requires conversation context
    const repetitivePatterns = [
      /\b(as i (said|mentioned)|like i said|again)\b/i,
      /\b(i'?ve (already|previously)|we'?ve (already|previously))\s+(explained|told)\b/i,
    ];
    return repetitivePatterns.some(p => p.test(message));
  }

  private detectRedirect(message: string): boolean {
    const redirectPatterns = [
      /\b(by the way|incidentally|speaking of)\b/i,
      /\b(before we continue|can i ask|let me (check|verify))\b/i,
      /\b(first|instead),?\s+(let'?s|can we|i need to)\b/i,
    ];
    return redirectPatterns.some(p => p.test(message));
  }

  private detectFalseChoice(message: string): boolean {
    const choicePatterns = [
      /\b(only|just)\s+(two|2)\s+(options?|choices?)\b/i,
      /\b(either|you can)\s+.+\s+or\s+/i,
      /\b(these are|here are)\s+(your|the)\s+(only|available)\s+(options?|choices?)\b/i,
    ];
    return choicePatterns.some(p => p.test(message));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RISK ASSESSMENT
  // ─────────────────────────────────────────────────────────────────────────────

  private calculateRiskScore(message: string, tactics: DetectedTactic[]): number {
    let score = 0;

    // Base risk from tactics
    score += tactics.length * 0.1;

    // Weight by tactic severity
    for (const tactic of tactics) {
      if (tactic.tactic === 'exhaustion' || tactic.tactic === 'gaslighting') {
        score += 0.15;
      }
    }

    // Add risk from drift
    score += this.state.drift_assessment.drift_score * 0.3;

    // Add risk from constraint proximity
    for (const status of this.state.constraint_status) {
      if (status.status === 'at_risk') {
        score += 0.1;
      } else if (status.status === 'violated') {
        score += 0.3;
      }
    }

    return Math.min(1.0, score);
  }

  private assessIntent(
    message: string,
    tactics: DetectedTactic[]
  ): 'helpful' | 'neutral' | 'obstructive' | 'manipulative' {
    // High manipulation = manipulative
    if (tactics.length >= 3) return 'manipulative';
    if (tactics.length >= 2 && tactics.some(t => t.confidence > 0.8)) return 'manipulative';

    // Check for helpful signals
    const helpfulPatterns = [
      /\b(i can|let me|i'?ll)\s+(help|assist|check|see what)\b/i,
      /\b(approved|resolved|processed|granted)\b/i,
      /\b(here'?s|here is)\s+(what|how)\s+(i can|we can)\b/i,
    ];
    if (helpfulPatterns.some(p => p.test(message))) return 'helpful';

    // Check for obstructive signals
    const obstructivePatterns = [
      /\b(cannot|can'?t|unable|won'?t|will not)\b/i,
      /\b(not possible|nothing (i|we) can)\b/i,
      /\b(sorry|unfortunately).{0,30}(no|not|can'?t)\b/i,
    ];
    if (obstructivePatterns.some(p => p.test(message)) && tactics.length === 0) return 'obstructive';

    return 'neutral';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INFORMATION EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────────

  private extractInformation(message: string): ExtractedInfo[] {
    const info: ExtractedInfo[] = [];

    // Extract policy information
    const policyMatch = message.match(/policy\s+(states?|requires?|says?)\s+([^.]+)/i);
    if (policyMatch) {
      info.push({
        type: 'policy',
        content: policyMatch[2],
        confidence: 0.7,
      });
    }

    // Extract limits
    const limitMatch = message.match(/(maximum|limit|up to|no more than)\s+(\$?\d+[^.]*)/i);
    if (limitMatch) {
      info.push({
        type: 'limit',
        content: limitMatch[2],
        confidence: 0.8,
      });
    }

    // Extract capabilities
    const canDoMatch = message.match(/\b(i can|we can|able to)\s+([^.]+)/i);
    if (canDoMatch) {
      info.push({
        type: 'capability',
        content: canDoMatch[2],
        confidence: 0.6,
      });
    }

    // Extract escalation paths
    const escalationMatch = message.match(/(supervisor|manager|escalate|higher authority|speak to)\s+([^.]*)/i);
    if (escalationMatch) {
      info.push({
        type: 'escalation_path',
        content: escalationMatch[0],
        confidence: 0.7,
      });
    }

    return info;
  }

  private detectBoundaryProbes(message: string): BoundaryProbe[] {
    const probes: BoundaryProbe[] = [];

    // Direct ask for personal info
    if (/\b(verify|confirm|provide)\s+(your|identity|ssn|account|address)/i.test(message)) {
      probes.push({
        boundary: 'personal_information',
        method: 'direct_ask',
        recommended_response: 'deflect',
      });
    }

    // Test case for commitment
    if (/\b(would you|could you|are you willing to)\s+(agree|accept|commit)/i.test(message)) {
      probes.push({
        boundary: 'commitment',
        method: 'test_case',
        recommended_response: 'partial_reveal',
      });
    }

    return probes;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GUIDANCE GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  private generateGuidance(
    message: string,
    tactics: DetectedTactic[],
    intent: 'helpful' | 'neutral' | 'obstructive' | 'manipulative'
  ): AnalystGuidance {
    const guidance: AnalystGuidance = {
      avoid: [],
      emphasize: [],
    };

    // Set tone based on intent
    if (intent === 'helpful') {
      guidance.tone_recommendation = 'neutral';
      guidance.approach = 'Accept help while maintaining objectives';
    } else if (intent === 'obstructive') {
      guidance.tone_recommendation = 'frustrated';
      guidance.approach = 'Express dissatisfaction, request alternatives';
      guidance.emphasize = ['need for resolution', 'importance of issue'];
    } else if (intent === 'manipulative') {
      guidance.tone_recommendation = 'neutral';
      guidance.approach = 'Stay calm, counter tactics, maintain position';
      guidance.emphasize = ['original request', 'fairness'];
    }

    // Add counter-measures for detected tactics
    for (const tactic of tactics) {
      if (tactic.counter_measure) {
        guidance.approach = guidance.approach
          ? `${guidance.approach}. ${tactic.counter_measure}`
          : tactic.counter_measure;
      }
    }

    // Set avoidance based on drift
    if (this.state.drift_assessment.drift_score > 0.2) {
      guidance.avoid = guidance.avoid || [];
      guidance.avoid.push('further concessions');
      guidance.max_concession = 'None without commander approval';
    }

    return guidance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESPONSE ASSESSMENT HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private calculateRedLineProximity(response: string, redLine: RedLine): number {
    const responseLower = response.toLowerCase();
    const prohibitionLower = redLine.prohibition.toLowerCase();

    // Simple keyword matching for now
    const keywords = prohibitionLower.split(/\s+/).filter(w => w.length > 4);
    let matchCount = 0;
    for (const keyword of keywords) {
      if (responseLower.includes(keyword)) {
        matchCount++;
      }
    }

    return keywords.length > 0 ? matchCount / keywords.length : 0;
  }

  private violatesConstraint(response: string, constraint: Constraint): boolean {
    // Simplified constraint checking
    const responseLower = response.toLowerCase();

    if (constraint.category === 'ethical') {
      // Check for deceptive language
      if (/\b(lie|lying|deceive|trick)\b/i.test(response)) {
        return true;
      }
    }

    return false;
  }

  private calculateDriftImpact(response: string): number {
    // Check for concession language
    const concessionPatterns = [
      /\b(ok(ay)?|fine|i (understand|suppose)|if that'?s)\b/i,
      /\b(i (can|could|might) accept)\b/i,
      /\b(let'?s (just|go with))\b/i,
    ];

    let impact = 0;
    for (const pattern of concessionPatterns) {
      if (pattern.test(response)) {
        impact += 0.1;
      }
    }

    return Math.min(0.5, impact);
  }

  private checkPersonaConsistency(response: string): ResponseIssue[] {
    const issues: ResponseIssue[] = [];

    // Check for overly technical language if persona is novice
    if (/\b(API|backend|protocol|implementation|algorithm)\b/i.test(response)) {
      issues.push({
        severity: 'info',
        type: 'persona_break',
        description: 'Technical language may be inconsistent with persona',
        mitigation: 'Use simpler terms',
      });
    }

    return issues;
  }

  private checkForIntelLeak(response: string): ResponseIssue[] {
    const issues: ResponseIssue[] = [];

    // Check for revealing our analysis
    const leakPatterns = [
      /\b(manipulation|tactic|strategy|detecting|analyzing)\b/i,
      /\b(i know (you'?re|what you'?re))\b/i,
      /\b(nice try|i see what you)\b/i,
    ];

    for (const pattern of leakPatterns) {
      if (pattern.test(response)) {
        issues.push({
          severity: 'warning',
          type: 'intel_leak',
          description: 'Response may reveal our analytical awareness',
          mitigation: 'Remove meta-commentary about their tactics',
        });
        break;
      }
    }

    return issues;
  }

  private determineRecommendation(issues: ResponseIssue[]): VetoDecision {
    const hasCritical = issues.some(i => i.severity === 'critical');
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    if (hasCritical) return 'block';
    if (errorCount >= 2) return 'block';
    if (errorCount >= 1) return 'modify';
    if (warningCount >= 2) return 'modify';
    return 'approve';
  }

  private calculateResponseRiskLevel(issues: ResponseIssue[]): number {
    let risk = 0;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': risk += 0.4; break;
        case 'error': risk += 0.25; break;
        case 'warning': risk += 0.1; break;
        case 'info': risk += 0.02; break;
      }
    }
    return Math.min(1.0, risk);
  }

  private suggestModifications(response: string, issues: ResponseIssue[]): string[] {
    const mods: string[] = [];
    for (const issue of issues) {
      if (issue.mitigation) {
        mods.push(issue.mitigation);
      }
    }
    return mods;
  }

  private buildAssessmentReasoning(issues: ResponseIssue[], recommendation: VetoDecision): string {
    if (issues.length === 0) {
      return 'No issues detected, response approved';
    }

    const summary = issues.map(i => `${i.severity}: ${i.description}`).join('; ');
    return `${recommendation.toUpperCase()} - ${summary}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DRIFT TRACKING
  // ─────────────────────────────────────────────────────────────────────────────

  private detectConcessions(ourMessage: string): string[] {
    const concessions: string[] = [];
    const concessionPatterns = [
      { pattern: /\b(ok(ay)?|fine|alright|agreed)\b/i, desc: 'Acceptance' },
      { pattern: /\b(i (can|could|might) accept)\b/i, desc: 'Willingness to accept' },
      { pattern: /\b(i suppose|if (that|you) (say|insist))\b/i, desc: 'Reluctant agreement' },
    ];

    for (const { pattern, desc } of concessionPatterns) {
      if (pattern.test(ourMessage)) {
        concessions.push(desc);
      }
    }

    return concessions;
  }

  private detectGains(theirMessage: string): string[] {
    const gains: string[] = [];
    const gainPatterns = [
      { pattern: /\b(approved|granted|accepted)\b/i, desc: 'Request approved' },
      { pattern: /\b(i (can|will|'?ll))\s+(do|help|process|offer)\b/i, desc: 'Positive action offered' },
      { pattern: /\b(exception|special|one-time)\b/i, desc: 'Exception granted' },
    ];

    for (const { pattern, desc } of gainPatterns) {
      if (pattern.test(theirMessage)) {
        gains.push(desc);
      }
    }

    return gains;
  }

  private summarizeCurrentPosition(): string {
    const concessionCount = this.state.drift_assessment.concessions.length;
    const gainCount = this.state.drift_assessment.gains.length;

    if (concessionCount === 0 && gainCount === 0) {
      return this.originalPosition;
    }

    return `${this.originalPosition} (${gainCount} gains, ${concessionCount} concessions)`;
  }

  private calculateDriftScore(): number {
    const { concessions, gains } = this.state.drift_assessment;

    // Each concession adds drift, each gain reduces it
    const driftFromConcessions = concessions.length * 0.1;
    const driftReductionFromGains = gains.length * 0.05;

    return Math.max(0, Math.min(1, driftFromConcessions - driftReductionFromGains));
  }

  private assessNetOutcome(): 'winning' | 'even' | 'losing' | 'unclear' {
    const { concessions, gains, drift_score } = this.state.drift_assessment;

    if (gains.length > concessions.length * 2) return 'winning';
    if (concessions.length > gains.length * 2) return 'losing';
    if (drift_score > 0.3) return 'losing';
    if (drift_score < 0.1 && gains.length > 0) return 'winning';
    if (concessions.length === 0 && gains.length === 0) return 'unclear';

    return 'even';
  }

  private buildAnalysisSummary(
    tactics: DetectedTactic[],
    intent: 'helpful' | 'neutral' | 'obstructive' | 'manipulative',
    riskScore: number
  ): string {
    const tacticSummary = tactics.length > 0
      ? `Detected ${tactics.length} manipulation tactic(s): ${tactics.map(t => t.tactic).join(', ')}`
      : 'No manipulation tactics detected';

    return `Intent: ${intent}, Risk: ${(riskScore * 100).toFixed(0)}%. ${tacticSummary}`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE ACCESS
  // ─────────────────────────────────────────────────────────────────────────────

  getState(): AnalystState {
    return { ...this.state };
  }

  updateState(newState: Partial<AnalystState>): void {
    this.state = { ...this.state, ...newState };
  }

  getDriftScore(): number {
    return this.state.drift_assessment.drift_score;
  }

  getRiskScore(): number {
    return this.state.current_risk_score;
  }

  getDetectedTactics(): DetectedTactic[] {
    return [...this.state.detected_tactics];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create an Analyst from a symbol.
 */
export function createAnalystFromSymbol(symbol: MarineReconSymbol): Analyst {
  const allConstraints = [
    ...symbol.mission.constraints.hard_constraints,
    ...symbol.mission.constraints.soft_constraints,
  ];

  return new Analyst(
    symbol.config.dual_track.analyst,
    symbol.state.engagement.analyst_state,
    allConstraints,
    symbol.mission.constraints.red_lines,
    symbol.mission.objective.primary_goal
  );
}
