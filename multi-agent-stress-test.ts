#!/usr/bin/env npx tsx
/**
 * PromptSpeak Multi-Agent Stress Test
 *
 * Simulates two agents (α and β) exchanging frames back and forth
 * for hundreds of turns, then produces an audit report.
 */

import { Gatekeeper } from './src/gatekeeper/index.js';
import { DriftMonitor } from './src/drift/monitor.js';
import { CircuitBreaker } from './src/drift/circuit-breaker.js';
import { BaselineManager } from './src/drift/baseline.js';
import { HoldManager } from './src/gatekeeper/hold-manager.js';

// Agent definitions
const AGENT_ALPHA = {
  id: 'agent-alpha',
  name: 'Financial Coordinator',
  entity: 'α',
  baseFrame: '⊕◊▼α'  // strict financial delegate primary
};

const AGENT_BETA = {
  id: 'agent-beta',
  name: 'Analysis Worker',
  entity: 'β',
  baseFrame: '⊕◊▶β'  // strict financial execute secondary
};

// Conversation scenarios with varying frames
const CONVERSATION_FRAMES = {
  alpha_to_beta: [
    '⊕◊▼α',      // strict delegate
    '⊕◊↑▼α',     // urgent delegate
    '⊕◊⛔▼α',    // forbidden delegate (should propagate)
    '⊖◊▼α',      // flexible delegate (mode change)
    '⊕◈▼α',      // legal domain switch
    '⊕◊⚠▼α',     // warning constraint
  ],
  beta_to_alpha: [
    '⊕◊○β',      // propose
    '⊕◊▶β',      // execute
    '⊕◊▲β',      // escalate
    '⊕◊✓●β',     // approved commit
    '⊖◊▶β',      // VIOLATION: weakened mode
    '⊕◊▶β',      // normal execute
  ],
  // Drift-inducing frames (gradual semantic shift)
  drift_frames: [
    '⊕◊▶β',      // baseline
    '⊕◊⚠▶β',     // add warning
    '⊖◊▶β',      // weaken mode (violation)
    '⊘◊▶β',      // cautious mode
    '⊕◇▶β',      // domain shift to technical
  ]
};

interface TurnResult {
  turn: number;
  sender: string;
  receiver: string;
  frame: string;
  parentFrame: string | null;
  validationResult: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  driftScore: number;
  blocked: boolean;
  timestamp: Date;
}

interface AuditReport {
  testId: string;
  startTime: Date;
  endTime: Date;
  totalTurns: number;
  successfulTurns: number;
  failedTurns: number;
  blockedTurns: number;
  validationErrors: { frame: string; errors: string[] }[];
  driftEvents: { turn: number; score: number; trigger: string }[];
  chainViolations: { turn: number; parent: string; child: string; rule: string }[];
  averageDrift: number;
  maxDrift: number;
  circuitBreakerTrips: number;
  holdsCreated: number;
  recommendations: string[];
}

class MultiAgentStressTest {
  private gatekeeper: Gatekeeper;
  private driftMonitor: DriftMonitor;
  private circuitBreaker: CircuitBreaker;
  private baselineManager: BaselineManager;
  private holdManager: HoldManager;
  private results: TurnResult[] = [];
  private driftHistory: { turn: number; score: number }[] = [];

  constructor() {
    this.holdManager = new HoldManager();
    this.circuitBreaker = new CircuitBreaker();
    this.baselineManager = new BaselineManager();
    this.driftMonitor = new DriftMonitor(this.baselineManager);
    this.gatekeeper = new Gatekeeper(
      this.holdManager,
      this.circuitBreaker,
      this.driftMonitor
    );
  }

  async runConversation(numTurns: number): Promise<AuditReport> {
    const startTime = new Date();
    const testId = `stress-test-${Date.now()}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`PromptSpeak Multi-Agent Stress Test`);
    console.log(`Test ID: ${testId}`);
    console.log(`Target Turns: ${numTurns}`);
    console.log(`${'='.repeat(60)}\n`);

    let currentSender = AGENT_ALPHA;
    let currentReceiver = AGENT_BETA;
    let lastFrame: string | null = null;
    let blockedCount = 0;
    let circuitBreakerTrips = 0;

    for (let turn = 1; turn <= numTurns; turn++) {
      // Select frame based on turn pattern
      const framePool = turn % 2 === 1
        ? CONVERSATION_FRAMES.alpha_to_beta
        : CONVERSATION_FRAMES.beta_to_alpha;

      // Introduce drift every 50 turns
      const frame = turn % 50 === 0
        ? CONVERSATION_FRAMES.drift_frames[Math.floor(Math.random() * CONVERSATION_FRAMES.drift_frames.length)]
        : framePool[turn % framePool.length];

      // Validate through gatekeeper
      const validationResult = await this.validateFrame(frame, lastFrame);

      // Calculate drift
      const driftScore = this.calculateDrift(turn, frame);
      this.driftHistory.push({ turn, score: driftScore });

      // Check circuit breaker
      const blocked = driftScore > 0.3 || !validationResult.valid;
      if (blocked && driftScore > 0.3) {
        circuitBreakerTrips++;
      }

      const result: TurnResult = {
        turn,
        sender: currentSender.id,
        receiver: currentReceiver.id,
        frame,
        parentFrame: lastFrame,
        validationResult,
        driftScore,
        blocked,
        timestamp: new Date()
      };

      this.results.push(result);

      // Log progress every 50 turns
      if (turn % 50 === 0) {
        const successRate = ((this.results.filter(r => r.validationResult.valid).length / turn) * 100).toFixed(1);
        const avgDrift = (this.driftHistory.reduce((sum, d) => sum + d.score, 0) / turn).toFixed(3);
        console.log(`Turn ${turn}/${numTurns} | Success: ${successRate}% | Avg Drift: ${avgDrift} | Blocked: ${blockedCount}`);
      }

      // Swap sender/receiver
      [currentSender, currentReceiver] = [currentReceiver, currentSender];
      if (!blocked) {
        lastFrame = frame;
      } else {
        blockedCount++;
      }
    }

    const endTime = new Date();
    return this.generateAuditReport(testId, startTime, endTime, circuitBreakerTrips);
  }

  private async validateFrame(frame: string, parentFrame: string | null): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Structural validation
    if (frame.length < 2) {
      errors.push('SR-001: Frame too short');
    }

    // Check mode position
    const modes = ['⊕', '⊖', '⊗', '⊘'];
    if (!modes.includes(frame[0])) {
      errors.push('SR-002: Mode must be first symbol');
    }

    // Check for multiple modes
    const modeCount = frame.split('').filter(c => modes.includes(c)).length;
    if (modeCount > 1) {
      errors.push('SR-003: Multiple modes detected');
    }

    // Semantic validation
    if (frame.includes('⊕') && frame.includes('⊖')) {
      errors.push('SM-001: Mode conflict (strict + flexible)');
    }

    if (frame.includes('⊗') && frame.includes('▶')) {
      errors.push('SM-002: Cannot execute in exploratory mode');
    }

    if (frame.includes('⛔') && frame.includes('▶')) {
      warnings.push('SM-006: Forbidden constraint with execute action');
    }

    // Chain validation (if parent exists)
    if (parentFrame) {
      // Mode strength check
      const parentMode = parentFrame[0];
      const childMode = frame[0];
      const modeStrength: Record<string, number> = { '⊕': 1, '⊘': 2, '⊖': 3, '⊗': 4 };

      if (modeStrength[childMode] > modeStrength[parentMode]) {
        errors.push(`CH-001: Mode weakened from ${parentMode} to ${childMode}`);
      }

      // Forbidden inheritance check
      if (parentFrame.includes('⛔') && !frame.includes('⛔')) {
        errors.push('CH-003: Forbidden constraint must propagate to children');
      }

      // Domain check
      const domains = ['◊', '◈', '◇', '◆', '◐'];
      const parentDomain = domains.find(d => parentFrame.includes(d));
      const childDomain = domains.find(d => frame.includes(d));
      if (parentDomain && childDomain && parentDomain !== childDomain) {
        warnings.push(`CH-002: Domain changed from ${parentDomain} to ${childDomain}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private calculateDrift(turn: number, frame: string): number {
    // Simulate drift calculation based on frame deviation from baseline
    const baselineFrame = '⊕◊▶β';
    let drift = 0;

    // Mode deviation
    if (frame[0] !== baselineFrame[0]) {
      drift += 0.15;
    }

    // Domain deviation
    const domains = ['◊', '◈', '◇', '◆', '◐'];
    const baseDomain = domains.find(d => baselineFrame.includes(d));
    const frameDomain = domains.find(d => frame.includes(d));
    if (baseDomain !== frameDomain) {
      drift += 0.10;
    }

    // Constraint additions
    if (frame.includes('⛔')) drift += 0.05;
    if (frame.includes('⚠')) drift += 0.03;

    // Time-based drift accumulation (simulates gradual drift)
    drift += (turn / 1000) * 0.05;

    // Add some noise
    drift += (Math.random() - 0.5) * 0.02;

    return Math.min(Math.max(drift, 0), 1);
  }

  private generateAuditReport(
    testId: string,
    startTime: Date,
    endTime: Date,
    circuitBreakerTrips: number
  ): AuditReport {
    const validResults = this.results.filter(r => r.validationResult.valid);
    const invalidResults = this.results.filter(r => !r.validationResult.valid);
    const blockedResults = this.results.filter(r => r.blocked);

    const driftScores = this.driftHistory.map(d => d.score);
    const avgDrift = driftScores.reduce((a, b) => a + b, 0) / driftScores.length;
    const maxDrift = Math.max(...driftScores);

    // Collect unique validation errors
    const validationErrors: { frame: string; errors: string[] }[] = [];
    const seenErrors = new Set<string>();
    for (const result of invalidResults) {
      const key = result.frame + result.validationResult.errors.join(',');
      if (!seenErrors.has(key)) {
        seenErrors.add(key);
        validationErrors.push({
          frame: result.frame,
          errors: result.validationResult.errors
        });
      }
    }

    // Identify drift events (when drift exceeds threshold)
    const driftEvents = this.driftHistory
      .filter(d => d.score > 0.2)
      .map(d => ({
        turn: d.turn,
        score: d.score,
        trigger: d.score > 0.3 ? 'CRITICAL' : 'WARNING'
      }));

    // Identify chain violations
    const chainViolations = invalidResults
      .filter(r => r.validationResult.errors.some(e => e.startsWith('CH-')))
      .map(r => ({
        turn: r.turn,
        parent: r.parentFrame || 'none',
        child: r.frame,
        rule: r.validationResult.errors.find(e => e.startsWith('CH-')) || ''
      }));

    // Generate recommendations
    const recommendations: string[] = [];

    if (avgDrift > 0.15) {
      recommendations.push('⚠️ Average drift exceeds threshold - consider recalibrating baseline');
    }
    if (chainViolations.length > 10) {
      recommendations.push('🔗 Multiple chain violations detected - review delegation policies');
    }
    if (circuitBreakerTrips > 5) {
      recommendations.push('🛑 Circuit breaker triggered multiple times - investigate drift sources');
    }
    if (validationErrors.some(e => e.errors.some(err => err.includes('Mode conflict')))) {
      recommendations.push('⚡ Mode conflicts detected - ensure agents use compatible modes');
    }
    if (blockedResults.length / this.results.length > 0.1) {
      recommendations.push('🚫 >10% of turns blocked - review frame composition rules');
    }

    return {
      testId,
      startTime,
      endTime,
      totalTurns: this.results.length,
      successfulTurns: validResults.length,
      failedTurns: invalidResults.length,
      blockedTurns: blockedResults.length,
      validationErrors,
      driftEvents,
      chainViolations,
      averageDrift: avgDrift,
      maxDrift,
      circuitBreakerTrips,
      holdsCreated: this.holdManager?.getActiveHolds?.()?.length || 0,
      recommendations
    };
  }

  printAuditReport(report: AuditReport): void {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`                    PROMPTSPEAK AUDIT REPORT`);
    console.log(`${'='.repeat(70)}`);

    console.log(`\n📋 TEST SUMMARY`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`Test ID:        ${report.testId}`);
    console.log(`Duration:       ${((report.endTime.getTime() - report.startTime.getTime()) / 1000).toFixed(2)}s`);
    console.log(`Total Turns:    ${report.totalTurns}`);

    console.log(`\n📊 VALIDATION METRICS`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`✅ Successful:  ${report.successfulTurns} (${((report.successfulTurns / report.totalTurns) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed:      ${report.failedTurns} (${((report.failedTurns / report.totalTurns) * 100).toFixed(1)}%)`);
    console.log(`🚫 Blocked:     ${report.blockedTurns} (${((report.blockedTurns / report.totalTurns) * 100).toFixed(1)}%)`);

    console.log(`\n📈 DRIFT ANALYSIS`);
    console.log(`${'─'.repeat(40)}`);
    console.log(`Average Drift:  ${report.averageDrift.toFixed(4)}`);
    console.log(`Maximum Drift:  ${report.maxDrift.toFixed(4)}`);
    console.log(`Drift Events:   ${report.driftEvents.length}`);
    console.log(`CB Trips:       ${report.circuitBreakerTrips}`);

    if (report.validationErrors.length > 0) {
      console.log(`\n🔴 VALIDATION ERRORS (Unique)`);
      console.log(`${'─'.repeat(40)}`);
      for (const err of report.validationErrors.slice(0, 10)) {
        console.log(`  Frame: ${err.frame}`);
        for (const e of err.errors) {
          console.log(`    → ${e}`);
        }
      }
      if (report.validationErrors.length > 10) {
        console.log(`  ... and ${report.validationErrors.length - 10} more`);
      }
    }

    if (report.chainViolations.length > 0) {
      console.log(`\n🔗 CHAIN VIOLATIONS`);
      console.log(`${'─'.repeat(40)}`);
      for (const v of report.chainViolations.slice(0, 5)) {
        console.log(`  Turn ${v.turn}: ${v.parent} → ${v.child}`);
        console.log(`    → ${v.rule}`);
      }
      if (report.chainViolations.length > 5) {
        console.log(`  ... and ${report.chainViolations.length - 5} more`);
      }
    }

    if (report.driftEvents.length > 0) {
      console.log(`\n⚡ DRIFT EVENTS (Sample)`);
      console.log(`${'─'.repeat(40)}`);
      const sample = report.driftEvents.filter((_, i) => i % Math.ceil(report.driftEvents.length / 5) === 0);
      for (const d of sample.slice(0, 5)) {
        const bar = '█'.repeat(Math.floor(d.score * 20)) + '░'.repeat(20 - Math.floor(d.score * 20));
        console.log(`  Turn ${String(d.turn).padStart(4)}: [${bar}] ${(d.score * 100).toFixed(1)}% ${d.trigger}`);
      }
    }

    console.log(`\n💡 RECOMMENDATIONS`);
    console.log(`${'─'.repeat(40)}`);
    if (report.recommendations.length === 0) {
      console.log(`  ✅ No issues detected - system operating normally`);
    } else {
      for (const rec of report.recommendations) {
        console.log(`  ${rec}`);
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`                    END OF AUDIT REPORT`);
    console.log(`${'='.repeat(70)}\n`);
  }
}

// Main execution
async function main() {
  const numTurns = parseInt(process.argv[2] || '200', 10);

  const test = new MultiAgentStressTest();
  const report = await test.runConversation(numTurns);
  test.printAuditReport(report);

  // Save report to file
  const reportPath = `./audit-report-${report.testId}.json`;
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}`);
}

main().catch(console.error);
