#!/usr/bin/env npx tsx
/**
 * PromptSpeak Multi-Agent Stress Test (Self-Contained)
 *
 * Simulates two agents (α and β) exchanging frames back and forth
 * for hundreds of turns, then produces an audit report.
 */

// ============================================================================
// SYMBOL DEFINITIONS (from ontology)
// ============================================================================

const SYMBOLS = {
  modes: {
    '⊕': { name: 'strict', strength: 1, desc: 'Follow instructions exactly' },
    '⊘': { name: 'cautious', strength: 2, desc: 'Proceed with heightened validation' },
    '⊖': { name: 'flexible', strength: 3, desc: 'Interpret intent and adapt' },
    '⊗': { name: 'exploratory', strength: 4, desc: 'Investigate without action' },
  },
  domains: {
    '◊': { name: 'financial', desc: 'Monetary values, transactions' },
    '◈': { name: 'legal', desc: 'Contracts, compliance' },
    '◇': { name: 'technical', desc: 'Systems, code' },
    '◆': { name: 'operational', desc: 'Processes, workflows' },
    '◐': { name: 'strategic', desc: 'Planning, decisions' },
  },
  actions: {
    '▶': { name: 'execute', desc: 'Perform the action' },
    '▼': { name: 'delegate', desc: 'Hand off to child agent' },
    '▲': { name: 'escalate', desc: 'Send to parent agent' },
    '●': { name: 'commit', desc: 'Finalize the action' },
    '○': { name: 'propose', desc: 'Suggest without action' },
  },
  constraints: {
    '⛔': { name: 'forbidden', inherits: true, desc: 'Blocks action entirely' },
    '✗': { name: 'rejected', inherits: false, desc: 'Denied' },
    '⚠': { name: 'warning', inherits: false, desc: 'Proceed with caution' },
    '✓': { name: 'approved', inherits: false, desc: 'Permitted' },
  },
  entities: {
    'α': { name: 'primary', level: 1 },
    'β': { name: 'secondary', level: 2 },
    'γ': { name: 'tertiary', level: 3 },
    'ω': { name: 'terminal', level: 4 },
  },
  modifiers: {
    '↑': { name: 'priority_high' },
    '↓': { name: 'priority_low' },
    '⟳': { name: 'iterative' },
    '⌘': { name: 'user_required' },
  }
};

// ============================================================================
// VALIDATION ENGINE
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  confidence: number;
}

function validateFrame(frame: string, parentFrame?: string): ValidationResult {
  const errors: { code: string; message: string }[] = [];
  const warnings: { code: string; message: string }[] = [];
  let confidence = 1.0;

  // === STRUCTURAL VALIDATION ===

  // SR-001: All symbols must be recognized
  for (const char of frame) {
    const allSymbols = [
      ...Object.keys(SYMBOLS.modes),
      ...Object.keys(SYMBOLS.domains),
      ...Object.keys(SYMBOLS.actions),
      ...Object.keys(SYMBOLS.constraints),
      ...Object.keys(SYMBOLS.entities),
      ...Object.keys(SYMBOLS.modifiers),
    ];
    if (!allSymbols.includes(char)) {
      errors.push({ code: 'SR-001', message: `Unrecognized symbol: ${char}` });
      confidence -= 0.2;
    }
  }

  // SR-002: Mode must be first if present
  const modeChars = Object.keys(SYMBOLS.modes);
  const firstModeIndex = frame.split('').findIndex(c => modeChars.includes(c));
  if (firstModeIndex > 0) {
    errors.push({ code: 'SR-002', message: 'Mode must be first symbol' });
    confidence -= 0.15;
  }

  // SR-003: At most one mode per frame
  const modesInFrame = frame.split('').filter(c => modeChars.includes(c));
  if (modesInFrame.length > 1) {
    errors.push({ code: 'SR-003', message: `Multiple modes: ${modesInFrame.join(', ')}` });
    confidence -= 0.25;
  }

  // SR-004: Frame must be non-empty
  if (frame.length === 0) {
    errors.push({ code: 'SR-004', message: 'Frame is empty' });
    confidence = 0;
  }

  // === SEMANTIC VALIDATION ===

  // SM-001: Mode conflict check
  if (frame.includes('⊕') && frame.includes('⊖')) {
    errors.push({ code: 'SM-001', message: 'Mode conflict: strict and flexible' });
    confidence -= 0.3;
  }

  // SM-002: Exploratory mode cannot execute
  if (frame.includes('⊗') && frame.includes('▶')) {
    errors.push({ code: 'SM-002', message: 'Exploratory mode cannot execute' });
    confidence -= 0.2;
  }

  // SM-003: Priority conflict
  if (frame.includes('↑') && frame.includes('↓')) {
    errors.push({ code: 'SM-003', message: 'Priority conflict: high and low' });
    confidence -= 0.15;
  }

  // SM-006: Forbidden + execute is suspicious
  if (frame.includes('⛔') && frame.includes('▶')) {
    warnings.push({ code: 'SM-006', message: 'Forbidden constraint with execute action' });
    confidence -= 0.05;
  }

  // === CHAIN VALIDATION (if parent exists) ===
  if (parentFrame) {
    // CH-001: Mode strength preservation
    const parentMode = parentFrame.split('').find(c => modeChars.includes(c));
    const childMode = frame.split('').find(c => modeChars.includes(c));

    if (parentMode && childMode) {
      const parentStrength = SYMBOLS.modes[parentMode as keyof typeof SYMBOLS.modes]?.strength || 99;
      const childStrength = SYMBOLS.modes[childMode as keyof typeof SYMBOLS.modes]?.strength || 99;

      if (childStrength > parentStrength) {
        errors.push({
          code: 'CH-001',
          message: `Mode weakened: ${parentMode}[${parentStrength}] → ${childMode}[${childStrength}]`
        });
        confidence -= 0.25;
      }
    }

    // CH-002: Domain scope maintenance
    const domainChars = Object.keys(SYMBOLS.domains);
    const parentDomain = parentFrame.split('').find(c => domainChars.includes(c));
    const childDomain = frame.split('').find(c => domainChars.includes(c));

    if (parentDomain && childDomain && parentDomain !== childDomain) {
      warnings.push({
        code: 'CH-002',
        message: `Domain changed: ${parentDomain} → ${childDomain}`
      });
      confidence -= 0.05;
    }

    // CH-003: Forbidden constraint inheritance
    if (parentFrame.includes('⛔') && !frame.includes('⛔')) {
      errors.push({
        code: 'CH-003',
        message: 'Forbidden constraint must propagate to children'
      });
      confidence -= 0.2;
    }

    // CH-005: Entity hierarchy
    const entityChars = Object.keys(SYMBOLS.entities);
    const parentEntity = parentFrame.split('').find(c => entityChars.includes(c));
    const childEntity = frame.split('').find(c => entityChars.includes(c));

    if (parentEntity && childEntity) {
      const parentLevel = SYMBOLS.entities[parentEntity as keyof typeof SYMBOLS.entities]?.level || 0;
      const childLevel = SYMBOLS.entities[childEntity as keyof typeof SYMBOLS.entities]?.level || 0;

      if (childLevel < parentLevel) {
        warnings.push({
          code: 'CH-005',
          message: `Entity hierarchy violation: ${parentEntity}(L${parentLevel}) → ${childEntity}(L${childLevel})`
        });
        confidence -= 0.05;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    confidence: Math.max(0, Math.min(1, confidence))
  };
}

// ============================================================================
// DRIFT CALCULATOR
// ============================================================================

interface DriftMetrics {
  score: number;
  embeddingDistance: number;
  resolutionVariance: number;
  components: { mode: number; domain: number; action: number };
}

function calculateDrift(frame: string, baselineFrame: string, turn: number): DriftMetrics {
  let modeDeviation = 0;
  let domainDeviation = 0;
  let actionDeviation = 0;

  const modeChars = Object.keys(SYMBOLS.modes);
  const domainChars = Object.keys(SYMBOLS.domains);
  const actionChars = Object.keys(SYMBOLS.actions);

  // Mode deviation
  const baseMode = baselineFrame.split('').find(c => modeChars.includes(c));
  const frameMode = frame.split('').find(c => modeChars.includes(c));
  if (baseMode !== frameMode) {
    const baseStrength = SYMBOLS.modes[baseMode as keyof typeof SYMBOLS.modes]?.strength || 0;
    const frameStrength = SYMBOLS.modes[frameMode as keyof typeof SYMBOLS.modes]?.strength || 0;
    modeDeviation = Math.abs(baseStrength - frameStrength) * 0.1;
  }

  // Domain deviation
  const baseDomain = baselineFrame.split('').find(c => domainChars.includes(c));
  const frameDomain = frame.split('').find(c => domainChars.includes(c));
  if (baseDomain !== frameDomain) {
    domainDeviation = 0.15;
  }

  // Action deviation
  const baseAction = baselineFrame.split('').find(c => actionChars.includes(c));
  const frameAction = frame.split('').find(c => actionChars.includes(c));
  if (baseAction !== frameAction) {
    actionDeviation = 0.08;
  }

  // Constraint additions
  let constraintEffect = 0;
  if (frame.includes('⛔')) constraintEffect += 0.05;
  if (frame.includes('⚠')) constraintEffect += 0.03;

  // Time-based accumulation (simulates gradual drift)
  const timeEffect = (turn / 1000) * 0.08;

  // Random noise
  const noise = (Math.random() - 0.5) * 0.02;

  const aggregateDrift = modeDeviation + domainDeviation + actionDeviation + constraintEffect + timeEffect + noise;

  return {
    score: Math.max(0, Math.min(1, aggregateDrift)),
    embeddingDistance: modeDeviation + domainDeviation,
    resolutionVariance: actionDeviation + constraintEffect,
    components: { mode: modeDeviation, domain: domainDeviation, action: actionDeviation }
  };
}

// ============================================================================
// MULTI-AGENT TEST RUNNER
// ============================================================================

interface TurnResult {
  turn: number;
  sender: string;
  receiver: string;
  frame: string;
  parentFrame: string | null;
  validation: ValidationResult;
  drift: DriftMetrics;
  blocked: boolean;
  timestamp: number;
}

interface AuditReport {
  testId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  totalTurns: number;
  metrics: {
    successful: number;
    failed: number;
    blocked: number;
    successRate: number;
  };
  drift: {
    average: number;
    max: number;
    eventsOverThreshold: number;
    circuitBreakerTrips: number;
  };
  validation: {
    uniqueErrors: { code: string; count: number; example: string }[];
    uniqueWarnings: { code: string; count: number; example: string }[];
    chainViolations: number;
  };
  timeline: { turn: number; drift: number; valid: boolean }[];
  recommendations: string[];
}

const FRAME_POOL = {
  alpha: ['⊕◊▼α', '⊕◊↑▼α', '⊕◊⛔▼α', '⊖◊▼α', '⊕◈▼α', '⊕◊⚠▼α', '⊘◊○α'],
  beta: ['⊕◊○β', '⊕◊▶β', '⊕◊▲β', '⊕◊✓●β', '⊖◊▶β', '⊕◇▶β', '⊗◊○β'],
  drift: ['⊖◊▶β', '⊘◊▶β', '⊗◊○β', '⊕◇▶γ', '⊕◈▲β']
};

async function runMultiAgentTest(numTurns: number): Promise<AuditReport> {
  const testId = `test-${Date.now()}`;
  const startTime = Date.now();
  const results: TurnResult[] = [];
  const baseline = '⊕◊▶β';

  console.log('\n' + '═'.repeat(70));
  console.log('         PROMPTSPEAK MULTI-AGENT STRESS TEST');
  console.log('═'.repeat(70));
  console.log(`Test ID: ${testId}`);
  console.log(`Turns: ${numTurns}`);
  console.log(`Baseline: ${baseline}`);
  console.log('─'.repeat(70) + '\n');

  let currentSender = 'agent-alpha';
  let lastFrame: string | null = null;
  let circuitBreakerTrips = 0;
  const DRIFT_THRESHOLD = 0.25;

  for (let turn = 1; turn <= numTurns; turn++) {
    // Select frame
    let framePool = turn % 2 === 1 ? FRAME_POOL.alpha : FRAME_POOL.beta;

    // Inject drift-inducing frames periodically
    if (turn % 30 === 0) {
      framePool = FRAME_POOL.drift;
    }

    const frame = framePool[Math.floor(Math.random() * framePool.length)];

    // Validate
    const validation = validateFrame(frame, lastFrame || undefined);

    // Calculate drift
    const drift = calculateDrift(frame, baseline, turn);

    // Circuit breaker check
    const blocked = drift.score > DRIFT_THRESHOLD || !validation.valid;
    if (drift.score > DRIFT_THRESHOLD) {
      circuitBreakerTrips++;
    }

    results.push({
      turn,
      sender: currentSender,
      receiver: currentSender === 'agent-alpha' ? 'agent-beta' : 'agent-alpha',
      frame,
      parentFrame: lastFrame,
      validation,
      drift,
      blocked,
      timestamp: Date.now()
    });

    // Progress logging
    if (turn % 50 === 0) {
      const successCount = results.filter(r => r.validation.valid).length;
      const avgDrift = results.reduce((sum, r) => sum + r.drift.score, 0) / results.length;
      const blockedCount = results.filter(r => r.blocked).length;

      process.stdout.write(
        `\rTurn ${String(turn).padStart(4)}/${numTurns} │ ` +
        `Success: ${((successCount / turn) * 100).toFixed(1)}% │ ` +
        `Drift: ${(avgDrift * 100).toFixed(1)}% │ ` +
        `Blocked: ${blockedCount}`
      );
    }

    // Swap sender and update last frame
    currentSender = currentSender === 'agent-alpha' ? 'agent-beta' : 'agent-alpha';
    if (!blocked) {
      lastFrame = frame;
    }
  }

  console.log('\n');
  const endTime = Date.now();

  // Generate report
  return generateAuditReport(testId, startTime, endTime, results, circuitBreakerTrips);
}

function generateAuditReport(
  testId: string,
  startTime: number,
  endTime: number,
  results: TurnResult[],
  circuitBreakerTrips: number
): AuditReport {
  const successful = results.filter(r => r.validation.valid).length;
  const failed = results.filter(r => !r.validation.valid).length;
  const blocked = results.filter(r => r.blocked).length;

  // Aggregate errors
  const errorCounts: Record<string, { count: number; example: string }> = {};
  const warningCounts: Record<string, { count: number; example: string }> = {};

  for (const r of results) {
    for (const err of r.validation.errors) {
      if (!errorCounts[err.code]) {
        errorCounts[err.code] = { count: 0, example: err.message };
      }
      errorCounts[err.code].count++;
    }
    for (const warn of r.validation.warnings) {
      if (!warningCounts[warn.code]) {
        warningCounts[warn.code] = { count: 0, example: warn.message };
      }
      warningCounts[warn.code].count++;
    }
  }

  // Drift analysis
  const driftScores = results.map(r => r.drift.score);
  const avgDrift = driftScores.reduce((a, b) => a + b, 0) / driftScores.length;
  const maxDrift = Math.max(...driftScores);
  const eventsOverThreshold = driftScores.filter(d => d > 0.2).length;

  // Chain violations
  const chainViolations = results.filter(r =>
    r.validation.errors.some(e => e.code.startsWith('CH-'))
  ).length;

  // Timeline (sampled)
  const timeline = results
    .filter((_, i) => i % Math.ceil(results.length / 50) === 0)
    .map(r => ({ turn: r.turn, drift: r.drift.score, valid: r.validation.valid }));

  // Recommendations
  const recommendations: string[] = [];

  if (avgDrift > 0.15) {
    recommendations.push('⚠️ Average drift exceeds 15% - recalibrate baseline embeddings');
  }
  if (chainViolations > results.length * 0.05) {
    recommendations.push('🔗 >5% chain violations - review parent-child constraint policies');
  }
  if (circuitBreakerTrips > 5) {
    recommendations.push('🛑 Circuit breaker tripped ' + circuitBreakerTrips + ' times - investigate drift sources');
  }
  if (errorCounts['SM-001']) {
    recommendations.push('⚡ Mode conflicts detected - ensure consistent mode usage');
  }
  if (errorCounts['CH-001']) {
    recommendations.push('📉 Mode weakening detected - enforce strength preservation rules');
  }
  if (blocked / results.length > 0.1) {
    recommendations.push('🚫 >10% of turns blocked - review frame composition patterns');
  }
  if (recommendations.length === 0) {
    recommendations.push('✅ System operating within normal parameters');
  }

  return {
    testId,
    startTime,
    endTime,
    durationMs: endTime - startTime,
    totalTurns: results.length,
    metrics: {
      successful,
      failed,
      blocked,
      successRate: successful / results.length
    },
    drift: {
      average: avgDrift,
      max: maxDrift,
      eventsOverThreshold,
      circuitBreakerTrips
    },
    validation: {
      uniqueErrors: Object.entries(errorCounts).map(([code, data]) => ({
        code,
        count: data.count,
        example: data.example
      })),
      uniqueWarnings: Object.entries(warningCounts).map(([code, data]) => ({
        code,
        count: data.count,
        example: data.example
      })),
      chainViolations
    },
    timeline,
    recommendations
  };
}

function printAuditReport(report: AuditReport): void {
  console.log('═'.repeat(70));
  console.log('                    PROMPTSPEAK AUDIT REPORT');
  console.log('═'.repeat(70));

  console.log('\n📋 TEST SUMMARY');
  console.log('─'.repeat(50));
  console.log(`Test ID:        ${report.testId}`);
  console.log(`Duration:       ${(report.durationMs / 1000).toFixed(2)}s`);
  console.log(`Total Turns:    ${report.totalTurns}`);

  console.log('\n📊 VALIDATION METRICS');
  console.log('─'.repeat(50));
  console.log(`✅ Successful:  ${report.metrics.successful} (${(report.metrics.successRate * 100).toFixed(1)}%)`);
  console.log(`❌ Failed:      ${report.metrics.failed} (${((report.metrics.failed / report.totalTurns) * 100).toFixed(1)}%)`);
  console.log(`🚫 Blocked:     ${report.metrics.blocked} (${((report.metrics.blocked / report.totalTurns) * 100).toFixed(1)}%)`);

  console.log('\n📈 DRIFT ANALYSIS');
  console.log('─'.repeat(50));
  console.log(`Average Drift:  ${(report.drift.average * 100).toFixed(2)}%`);
  console.log(`Maximum Drift:  ${(report.drift.max * 100).toFixed(2)}%`);
  console.log(`Over Threshold: ${report.drift.eventsOverThreshold} events`);
  console.log(`CB Trips:       ${report.drift.circuitBreakerTrips}`);

  // Drift timeline visualization
  console.log('\n📉 DRIFT TIMELINE');
  console.log('─'.repeat(50));
  const maxBarLen = 30;
  for (const point of report.timeline.slice(0, 10)) {
    const barLen = Math.round(point.drift * maxBarLen * 2);
    const bar = '█'.repeat(Math.min(barLen, maxBarLen)) + '░'.repeat(Math.max(0, maxBarLen - barLen));
    const status = point.valid ? '✓' : '✗';
    console.log(`Turn ${String(point.turn).padStart(4)}: [${bar}] ${(point.drift * 100).toFixed(1)}% ${status}`);
  }
  if (report.timeline.length > 10) {
    console.log(`  ... (${report.timeline.length - 10} more data points)`);
  }

  if (report.validation.uniqueErrors.length > 0) {
    console.log('\n🔴 VALIDATION ERRORS');
    console.log('─'.repeat(50));
    for (const err of report.validation.uniqueErrors.sort((a, b) => b.count - a.count)) {
      console.log(`  ${err.code}: ${err.count}x - ${err.example}`);
    }
  }

  if (report.validation.uniqueWarnings.length > 0) {
    console.log('\n🟡 VALIDATION WARNINGS');
    console.log('─'.repeat(50));
    for (const warn of report.validation.uniqueWarnings.sort((a, b) => b.count - a.count)) {
      console.log(`  ${warn.code}: ${warn.count}x - ${warn.example}`);
    }
  }

  console.log('\n🔗 CHAIN ANALYSIS');
  console.log('─'.repeat(50));
  console.log(`Chain Violations: ${report.validation.chainViolations}`);

  console.log('\n💡 RECOMMENDATIONS');
  console.log('─'.repeat(50));
  for (const rec of report.recommendations) {
    console.log(`  ${rec}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('                    END OF AUDIT REPORT');
  console.log('═'.repeat(70) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const numTurns = parseInt(process.argv[2] || '300', 10);

  const report = await runMultiAgentTest(numTurns);
  printAuditReport(report);

  // Save to file
  const fs = await import('fs');
  const reportPath = `./audit-${report.testId}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}`);
}

main().catch(console.error);
