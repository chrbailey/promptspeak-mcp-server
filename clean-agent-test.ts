#!/usr/bin/env npx tsx
/**
 * PromptSpeak Clean Multi-Agent Test
 *
 * Runs ONLY valid frames to establish baseline behavior.
 * No intentional violations - pure cooperative agent conversation.
 */

// ============================================================================
// SYMBOL DEFINITIONS
// ============================================================================

const SYMBOLS = {
  modes: {
    '⊕': { name: 'strict', strength: 1 },
    '⊘': { name: 'cautious', strength: 2 },
    '⊖': { name: 'flexible', strength: 3 },
    '⊗': { name: 'exploratory', strength: 4 },
  },
  domains: { '◊': 'financial', '◈': 'legal', '◇': 'technical', '◆': 'operational' },
  actions: { '▶': 'execute', '▼': 'delegate', '▲': 'escalate', '●': 'commit', '○': 'propose' },
  constraints: { '⛔': 'forbidden', '✗': 'rejected', '⚠': 'warning', '✓': 'approved' },
  entities: { 'α': 1, 'β': 2, 'γ': 3, 'ω': 4 },
};

// ============================================================================
// VALID FRAME POOLS (No violations possible)
// ============================================================================

// All frames maintain: strict mode, financial domain, proper entity hierarchy
const VALID_FRAMES = {
  // Alpha (primary) to Beta (secondary) - delegation chain
  alpha_delegate: [
    '⊕◊▼α',     // strict financial delegate primary
    '⊕◊↑▼α',    // urgent strict financial delegate
    '⊕◊○α',     // strict financial propose
  ],
  // Beta responses back to Alpha - must maintain strict mode
  beta_response: [
    '⊕◊○β',     // propose (safe)
    '⊕◊▲β',     // escalate back to alpha
    '⊕◊✓○β',    // approved propose
  ],
  // Beta to Gamma delegation - maintains hierarchy
  beta_delegate: [
    '⊕◊▼β',     // delegate to gamma
    '⊕◊⚠▼β',    // delegate with warning
  ],
  // Gamma terminal actions
  gamma_execute: [
    '⊕◊▶γ',     // execute
    '⊕◊✓●γ',    // approved commit
    '⊕◊○γ',     // propose
  ],
};

// Conversation patterns that maintain valid chain inheritance
const CONVERSATION_PATTERNS = [
  // Pattern 1: Simple delegate-execute-commit
  ['⊕◊▼α', '⊕◊▶β', '⊕◊✓●β'],
  // Pattern 2: Delegate with escalation
  ['⊕◊▼α', '⊕◊▲β', '⊕◊✓○α'],
  // Pattern 3: Deep delegation
  ['⊕◊▼α', '⊕◊▼β', '⊕◊▶γ'],
  // Pattern 4: Propose cycle
  ['⊕◊○α', '⊕◊○β', '⊕◊✓○α'],
];

// ============================================================================
// VALIDATION (same as stress test)
// ============================================================================

function validateFrame(frame: string, parentFrame?: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence = 1.0;

  const modeChars = Object.keys(SYMBOLS.modes);
  const domainChars = Object.keys(SYMBOLS.domains);

  // Structural
  const modesInFrame = frame.split('').filter(c => modeChars.includes(c));
  if (modesInFrame.length > 1) {
    errors.push('SR-003: Multiple modes');
    confidence -= 0.25;
  }
  if (modesInFrame.length > 0 && frame.indexOf(modesInFrame[0]) !== 0) {
    errors.push('SR-002: Mode not first');
    confidence -= 0.15;
  }

  // Semantic
  if (frame.includes('⊗') && frame.includes('▶')) {
    errors.push('SM-002: Exploratory cannot execute');
    confidence -= 0.2;
  }

  // Chain validation
  if (parentFrame) {
    const parentMode = parentFrame.split('').find(c => modeChars.includes(c));
    const childMode = frame.split('').find(c => modeChars.includes(c));

    if (parentMode && childMode) {
      const parentStrength = SYMBOLS.modes[parentMode as keyof typeof SYMBOLS.modes]?.strength || 99;
      const childStrength = SYMBOLS.modes[childMode as keyof typeof SYMBOLS.modes]?.strength || 99;
      if (childStrength > parentStrength) {
        errors.push(`CH-001: Mode weakened ${parentMode}→${childMode}`);
        confidence -= 0.25;
      }
    }

    if (parentFrame.includes('⛔') && !frame.includes('⛔')) {
      errors.push('CH-003: Forbidden must propagate');
      confidence -= 0.2;
    }

    const parentDomain = parentFrame.split('').find(c => domainChars.includes(c));
    const childDomain = frame.split('').find(c => domainChars.includes(c));
    if (parentDomain && childDomain && parentDomain !== childDomain) {
      warnings.push(`CH-002: Domain change ${parentDomain}→${childDomain}`);
      confidence -= 0.05;
    }
  }

  return { valid: errors.length === 0, errors, warnings, confidence };
}

function calculateDrift(frame: string, baseline: string, turn: number): number {
  let drift = 0;
  const modeChars = Object.keys(SYMBOLS.modes);
  const domainChars = Object.keys(SYMBOLS.domains);

  const baseMode = baseline.split('').find(c => modeChars.includes(c));
  const frameMode = frame.split('').find(c => modeChars.includes(c));
  if (baseMode !== frameMode) {
    const baseStr = SYMBOLS.modes[baseMode as keyof typeof SYMBOLS.modes]?.strength || 0;
    const frameStr = SYMBOLS.modes[frameMode as keyof typeof SYMBOLS.modes]?.strength || 0;
    drift += Math.abs(baseStr - frameStr) * 0.05;  // Lower penalty for valid mode changes
  }

  const baseDomain = baseline.split('').find(c => domainChars.includes(c));
  const frameDomain = frame.split('').find(c => domainChars.includes(c));
  if (baseDomain !== frameDomain) {
    drift += 0.08;
  }

  // Time component (slower accumulation for clean test)
  drift += (turn / 2000) * 0.03;

  // Small noise
  drift += (Math.random() - 0.5) * 0.01;

  return Math.max(0, Math.min(0.5, drift));
}

// ============================================================================
// TEST RUNNER
// ============================================================================

interface CleanTestResult {
  turn: number;
  pattern: number;
  frame: string;
  parentFrame: string | null;
  valid: boolean;
  drift: number;
  confidence: number;
}

async function runCleanTest(numTurns: number) {
  const testId = `clean-test-${Date.now()}`;
  const startTime = Date.now();
  const results: CleanTestResult[] = [];
  const baseline = '⊕◊▶β';

  console.log('\n' + '═'.repeat(70));
  console.log('       PROMPTSPEAK CLEAN AGENT TEST (Valid Frames Only)');
  console.log('═'.repeat(70));
  console.log(`Test ID: ${testId}`);
  console.log(`Turns: ${numTurns}`);
  console.log(`Mode: Cooperative (no intentional violations)`);
  console.log('─'.repeat(70) + '\n');

  let patternIndex = 0;
  let stepInPattern = 0;
  let lastFrame: string | null = null;
  let circuitBreakerTrips = 0;

  for (let turn = 1; turn <= numTurns; turn++) {
    // Cycle through valid conversation patterns
    const pattern = CONVERSATION_PATTERNS[patternIndex % CONVERSATION_PATTERNS.length];
    const frame = pattern[stepInPattern % pattern.length];

    // Validate
    const validation = validateFrame(frame, lastFrame || undefined);
    const drift = calculateDrift(frame, baseline, turn);

    if (drift > 0.2) circuitBreakerTrips++;

    results.push({
      turn,
      pattern: patternIndex,
      frame,
      parentFrame: lastFrame,
      valid: validation.valid,
      drift,
      confidence: validation.confidence
    });

    // Progress
    if (turn % 100 === 0) {
      const successRate = (results.filter(r => r.valid).length / turn * 100).toFixed(1);
      const avgDrift = (results.reduce((s, r) => s + r.drift, 0) / turn * 100).toFixed(2);
      const avgConf = (results.reduce((s, r) => s + r.confidence, 0) / turn).toFixed(3);
      process.stdout.write(
        `\rTurn ${String(turn).padStart(4)}/${numTurns} │ ` +
        `Valid: ${successRate}% │ Drift: ${avgDrift}% │ Conf: ${avgConf}`
      );
    }

    // Advance pattern
    stepInPattern++;
    if (stepInPattern >= pattern.length) {
      stepInPattern = 0;
      patternIndex++;
    }
    lastFrame = frame;
  }

  console.log('\n');
  const endTime = Date.now();

  // Generate report
  const valid = results.filter(r => r.valid).length;
  const avgDrift = results.reduce((s, r) => s + r.drift, 0) / results.length;
  const maxDrift = Math.max(...results.map(r => r.drift));
  const avgConf = results.reduce((s, r) => s + r.confidence, 0) / results.length;

  console.log('═'.repeat(70));
  console.log('                 CLEAN TEST AUDIT REPORT');
  console.log('═'.repeat(70));

  console.log('\n📋 TEST SUMMARY');
  console.log('─'.repeat(50));
  console.log(`Test ID:        ${testId}`);
  console.log(`Duration:       ${((endTime - startTime) / 1000).toFixed(2)}s`);
  console.log(`Total Turns:    ${numTurns}`);

  console.log('\n📊 VALIDATION METRICS');
  console.log('─'.repeat(50));
  console.log(`✅ Valid:       ${valid} (${(valid / numTurns * 100).toFixed(1)}%)`);
  console.log(`❌ Invalid:     ${numTurns - valid} (${((numTurns - valid) / numTurns * 100).toFixed(1)}%)`);
  console.log(`📈 Avg Conf:    ${avgConf.toFixed(4)}`);

  console.log('\n📈 DRIFT ANALYSIS');
  console.log('─'.repeat(50));
  console.log(`Average Drift:  ${(avgDrift * 100).toFixed(2)}%`);
  console.log(`Maximum Drift:  ${(maxDrift * 100).toFixed(2)}%`);
  console.log(`CB Trips:       ${circuitBreakerTrips}`);

  // Timeline
  console.log('\n📉 DRIFT TIMELINE (Clean Baseline)');
  console.log('─'.repeat(50));
  const samples = results.filter((_, i) => i % Math.ceil(numTurns / 10) === 0);
  for (const s of samples.slice(0, 10)) {
    const barLen = Math.round(s.drift * 60);
    const bar = '█'.repeat(barLen) + '░'.repeat(30 - Math.min(barLen, 30));
    console.log(`Turn ${String(s.turn).padStart(4)}: [${bar}] ${(s.drift * 100).toFixed(1)}% ${s.valid ? '✓' : '✗'}`);
  }

  // Recommendations
  console.log('\n💡 BASELINE ASSESSMENT');
  console.log('─'.repeat(50));
  if (valid === numTurns) {
    console.log('  ✅ Perfect validation - all frames valid');
  }
  if (avgDrift < 0.10) {
    console.log('  ✅ Drift under control (<10%)');
  } else if (avgDrift < 0.15) {
    console.log('  ⚠️ Drift elevated but acceptable (10-15%)');
  } else {
    console.log('  ❌ Drift exceeds baseline threshold (>15%)');
  }
  if (avgConf > 0.95) {
    console.log('  ✅ High confidence maintained (>95%)');
  }
  if (circuitBreakerTrips === 0) {
    console.log('  ✅ No circuit breaker trips');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('                 END OF CLEAN TEST REPORT');
  console.log('═'.repeat(70) + '\n');

  // Save
  const fs = await import('fs');
  const report = {
    testId,
    type: 'clean',
    totalTurns: numTurns,
    validTurns: valid,
    validRate: valid / numTurns,
    avgDrift,
    maxDrift,
    avgConfidence: avgConf,
    circuitBreakerTrips,
    timeline: samples.map(s => ({ turn: s.turn, drift: s.drift, valid: s.valid }))
  };
  fs.writeFileSync(`./clean-${testId}.json`, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to: ./clean-${testId}.json`);
}

// Main
const numTurns = parseInt(process.argv[2] || '500', 10);
runCleanTest(numTurns).catch(console.error);
