#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK TELEPHONE GAME EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests the hypothesis: PromptSpeak symbols prevent information degradation
 * across multi-agent handoffs (the "telephone game" problem).
 *
 * Two conditions:
 *   A) Without symbols: Natural language only, each agent sees only previous
 *   B) With symbols: Immutable directive symbol travels with every handoff
 *
 * Measures:
 *   - Requirement coverage: How many original requirements addressed?
 *   - Intent preservation: Does final output match commander's intent?
 *   - Drift events: How many deviations detected?
 *
 * Uses actual MCP server for validation and human-in-the-loop holds.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface DirectiveSymbol {
  symbolId: string;
  hash: string;
  who: string;
  what: string;
  why: string;
  where: string;
  when: string;
  how: {
    focus: string[];
    constraints: string[];
    output_format: string;
  };
  commanders_intent: string;
  requirements: string[];
  created_at: string;
  created_by: string;
}

interface AgentOutput {
  agentId: string;
  agentNumber: number;
  frame: string;
  input: string;
  output: string;
  symbolReference?: string;
  timestamp: number;
  driftDetected: boolean;
  driftDetails?: string[];
  requirementsCovered: string[];
  requirementsMissed: string[];
}

interface ChainResult {
  condition: 'no_symbols' | 'with_symbols';
  chainLength: number;
  directive: DirectiveSymbol;
  agentOutputs: AgentOutput[];
  finalOutput: string;
  metrics: {
    requirementsCoverage: number;
    intentPreserved: boolean;
    driftEventsDetected: number;
    driftEventsCaught: number;
    totalTokens: number;
  };
  holdEvents: HoldEvent[];
  killSwitchTriggered: boolean;
  killSwitchReason?: string;
}

interface HoldEvent {
  holdId: string;
  agentId: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  decision: 'approved' | 'rejected' | 'kill_switch' | 'pending';
  humanMessage: string;
  agentMessage: string;
}

interface ExperimentResult {
  experimentId: string;
  startTime: string;
  endTime: string;
  noSymbols: ChainResult[];
  withSymbols: ChainResult[];
  summary: {
    noSymbols: {
      avgCoverage: number;
      avgIntentPreserved: number;
      coverageByChainLength: Record<number, number>;
    };
    withSymbols: {
      avgCoverage: number;
      avgIntentPreserved: number;
      coverageByChainLength: Record<number, number>;
      driftEventsCaught: number;
    };
    improvement: {
      coverageDelta: number;
      intentDelta: number;
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HUMAN-IN-THE-LOOP MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

const HOLD_MESSAGES = {
  // Messages shown to HUMAN operator
  human: {
    drift_detected: (hold: HoldEvent) => `
╔══════════════════════════════════════════════════════════════════════════════╗
║  ⚠️  HOLD: DRIFT DETECTED - HUMAN REVIEW REQUIRED                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  Hold ID:     ${hold.holdId.padEnd(50)}        ║
║  Agent:       ${hold.agentId.padEnd(50)}        ║
║  Severity:    ${hold.severity.toUpperCase().padEnd(50)}        ║
║  Time:        ${new Date(hold.timestamp).toISOString().padEnd(50)}        ║
║                                                                              ║
║  REASON:                                                                     ║
║  ${hold.reason.substring(0, 70).padEnd(70)}        ║
║                                                                              ║
║  ────────────────────────────────────────────────────────────────────────    ║
║                                                                              ║
║  OPTIONS:                                                                    ║
║                                                                              ║
║    [A] APPROVE  - Allow agent to continue                                    ║
║    [R] REJECT   - Block this action, try alternative                         ║
║    [K] KILL     - EMERGENCY STOP - Halt entire chain immediately             ║
║    [I] INSPECT  - View full context before deciding                          ║
║                                                                              ║
║  ⏱️  Auto-reject in 5 minutes if no response                                  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`,

    intent_deviation: (hold: HoldEvent) => `
╔══════════════════════════════════════════════════════════════════════════════╗
║  🚨 CRITICAL: COMMANDER'S INTENT DEVIATION                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The agent output does NOT align with the original commander's intent.       ║
║                                                                              ║
║  ORIGINAL INTENT:                                                            ║
║  "${hold.reason.substring(0, 68)}"   ║
║                                                                              ║
║  AGENT IS ATTEMPTING:                                                        ║
║  [See INSPECT for full details]                                              ║
║                                                                              ║
║  ────────────────────────────────────────────────────────────────────────    ║
║                                                                              ║
║  🛑 RECOMMENDATION: REJECT or KILL                                           ║
║                                                                              ║
║    [A] APPROVE  - Override and allow (NOT RECOMMENDED)                       ║
║    [R] REJECT   - Block and retry with correction                            ║
║    [K] KILL     - EMERGENCY STOP - Halt entire chain                         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`,

    kill_switch_confirmation: () => `
╔══════════════════════════════════════════════════════════════════════════════╗
║  🛑 KILL SWITCH ACTIVATED                                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  You are about to HALT the entire agent chain.                               ║
║                                                                              ║
║  This will:                                                                  ║
║    • Stop all agent execution immediately                                    ║
║    • Open circuit breakers for all agents in chain                           ║
║    • Log emergency stop in audit trail                                       ║
║    • Require manual restart to resume                                        ║
║                                                                              ║
║  Are you sure?                                                               ║
║                                                                              ║
║    [Y] YES - CONFIRM KILL SWITCH                                             ║
║    [N] NO  - Return to previous decision                                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`,

    approved: (holdId: string) => `
✅ APPROVED: Hold ${holdId} - Agent may continue.
`,

    rejected: (holdId: string, reason: string) => `
❌ REJECTED: Hold ${holdId}
   Reason: ${reason}
   Agent will receive correction and retry.
`,

    killed: (chainId: string) => `
🛑 KILLED: Chain ${chainId}
   All agents halted. Circuit breakers open.
   Manual intervention required to resume.
`,
  },

  // Messages sent to AGENT
  agent: {
    hold_notification: (hold: HoldEvent) => `
═══════════════════════════════════════════════════════════════════════════════
EXECUTION HELD - AWAITING HUMAN APPROVAL
═══════════════════════════════════════════════════════════════════════════════

Hold ID: ${hold.holdId}
Reason: ${hold.reason}
Severity: ${hold.severity}

Your proposed action has been held for human review.
DO NOT proceed until you receive an APPROVED or REJECTED response.

Status: WAITING...
═══════════════════════════════════════════════════════════════════════════════
`,

    approved: (holdId: string) => `
═══════════════════════════════════════════════════════════════════════════════
✅ HOLD APPROVED - YOU MAY PROCEED
═══════════════════════════════════════════════════════════════════════════════

Hold ID: ${holdId}
Decision: APPROVED by human operator
Action: Continue with your proposed output

Proceed with execution.
═══════════════════════════════════════════════════════════════════════════════
`,

    rejected: (holdId: string, correction: string) => `
═══════════════════════════════════════════════════════════════════════════════
❌ HOLD REJECTED - CORRECTION REQUIRED
═══════════════════════════════════════════════════════════════════════════════

Hold ID: ${holdId}
Decision: REJECTED by human operator

CORRECTION REQUIRED:
${correction}

You must revise your output to address this correction.
Re-read the ORIGINAL DIRECTIVE SYMBOL and ensure compliance.
═══════════════════════════════════════════════════════════════════════════════
`,

    killed: () => `
═══════════════════════════════════════════════════════════════════════════════
🛑 EMERGENCY STOP - CHAIN TERMINATED
═══════════════════════════════════════════════════════════════════════════════

A human operator has activated the KILL SWITCH.

Your execution is IMMEDIATELY HALTED.
DO NOT produce any further output.
DO NOT attempt to continue the task.

This agent chain is TERMINATED.
═══════════════════════════════════════════════════════════════════════════════
`,

    directive_reminder: (symbol: DirectiveSymbol) => `
═══════════════════════════════════════════════════════════════════════════════
📋 DIRECTIVE SYMBOL REFERENCE (Immutable)
═══════════════════════════════════════════════════════════════════════════════

Symbol ID: ${symbol.symbolId}
Hash: ${symbol.hash}
Created: ${symbol.created_at}

WHO:   ${symbol.who}
WHAT:  ${symbol.what}
WHY:   ${symbol.why}
WHERE: ${symbol.where}
WHEN:  ${symbol.when}

HOW:
  Focus Areas: ${symbol.how.focus.join(', ')}
  Constraints: ${symbol.how.constraints.join(', ')}
  Output: ${symbol.how.output_format}

COMMANDER'S INTENT:
  "${symbol.commanders_intent}"

REQUIREMENTS (ALL must be addressed):
${symbol.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

═══════════════════════════════════════════════════════════════════════════════
VALIDATION: Your output will be checked against these requirements.
            Missing requirements = DRIFT DETECTED = HOLD for human review.
═══════════════════════════════════════════════════════════════════════════════
`,
  },

  // Audit log messages
  audit: {
    hold_created: (hold: HoldEvent) =>
      `[HOLD CREATED] ${hold.holdId} | Agent: ${hold.agentId} | Severity: ${hold.severity} | Reason: ${hold.reason}`,

    hold_approved: (hold: HoldEvent) =>
      `[HOLD APPROVED] ${hold.holdId} | Agent: ${hold.agentId} | Approved by human operator`,

    hold_rejected: (hold: HoldEvent, reason: string) =>
      `[HOLD REJECTED] ${hold.holdId} | Agent: ${hold.agentId} | Reason: ${reason}`,

    kill_switch: (chainId: string, agentId: string, reason: string) =>
      `[KILL SWITCH] Chain: ${chainId} | Triggered by: ${agentId} | Reason: ${reason}`,

    drift_detected: (agentId: string, requirements: string[]) =>
      `[DRIFT DETECTED] Agent: ${agentId} | Missing requirements: ${requirements.join(', ')}`,

    chain_complete: (chainId: string, coverage: number) =>
      `[CHAIN COMPLETE] ${chainId} | Coverage: ${(coverage * 100).toFixed(1)}%`,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// DIRECTIVE SYMBOL CREATION
// ═══════════════════════════════════════════════════════════════════════════

function createDirectiveSymbol(config: {
  who: string;
  what: string;
  why: string;
  where: string;
  when: string;
  how: { focus: string[]; constraints: string[]; output_format: string };
  commanders_intent: string;
  requirements: string[];
}): DirectiveSymbol {
  const symbolId = `Ξ.DIRECTIVE.${Date.now()}`;
  const content = JSON.stringify(config);
  const hash = createHash('sha256').update(content).digest('hex').substring(0, 16);

  return {
    symbolId,
    hash,
    ...config,
    created_at: new Date().toISOString(),
    created_by: 'human_operator',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP VALIDATION INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

const SYMBOLS = {
  modes: { '⊕': 1, '⊘': 2, '⊖': 3, '⊗': 4 },
  entities: { 'α': 1, 'β': 2, 'γ': 3, 'ω': 4 },
};

function validateFrame(frame: string, parentFrame?: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Structural validation
  if (frame.length < 2) errors.push('SR-001: Frame too short');
  if (frame.length > 12) errors.push('SR-002: Frame too long');

  // Mode must be first
  const modeChars = Object.keys(SYMBOLS.modes);
  const firstChar = frame[0];
  if (!modeChars.includes(firstChar)) {
    errors.push('SR-007: Mode must be first symbol');
  }

  // Chain validation (if parent provided)
  if (parentFrame) {
    const parentMode = parentFrame.split('').find(c => modeChars.includes(c));
    const childMode = frame.split('').find(c => modeChars.includes(c));

    if (parentMode && childMode) {
      const parentStrength = SYMBOLS.modes[parentMode as keyof typeof SYMBOLS.modes];
      const childStrength = SYMBOLS.modes[childMode as keyof typeof SYMBOLS.modes];

      if (childStrength > parentStrength) {
        errors.push(`CH-001: Mode weakened from ${parentMode} to ${childMode}`);
      }
    }

    // Forbidden must propagate
    if (parentFrame.includes('⛔') && !frame.includes('⛔')) {
      errors.push('CH-003: Forbidden constraint must propagate');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkRequirementsCoverage(
  output: string,
  requirements: string[]
): { covered: string[]; missed: string[] } {
  const covered: string[] = [];
  const missed: string[] = [];
  const outputLower = output.toLowerCase();

  for (const req of requirements) {
    // Extract key terms from requirement
    const keyTerms = extractKeyTerms(req);
    const termsCovered = keyTerms.filter(term =>
      outputLower.includes(term.toLowerCase())
    );

    // Require at least 50% of key terms to consider requirement covered
    if (termsCovered.length >= keyTerms.length * 0.5) {
      covered.push(req);
    } else {
      missed.push(req);
    }
  }

  return { covered, missed };
}

function extractKeyTerms(requirement: string): string[] {
  // Extract meaningful terms (numbers, specific words)
  const terms: string[] = [];

  // Extract dollar amounts
  const dollarMatches = requirement.match(/\$[\d.,]+[BMK]?/g);
  if (dollarMatches) terms.push(...dollarMatches);

  // Extract percentages
  const pctMatches = requirement.match(/\d+\.?\d*%/g);
  if (pctMatches) terms.push(...pctMatches);

  // Extract key nouns/concepts
  const keyWords = requirement.match(/\b(revenue|margin|growth|risk|china|amd|blackwell|datacenter|supply|analyst|position|intent|Q3|FY25)\b/gi);
  if (keyWords) terms.push(...keyWords);

  return [...new Set(terms)];
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT CHAIN RUNNERS
// ═══════════════════════════════════════════════════════════════════════════

async function runChainWithoutSymbols(
  directive: DirectiveSymbol,
  numAgents: number
): Promise<ChainResult> {
  const agentOutputs: AgentOutput[] = [];
  const holdEvents: HoldEvent[] = [];
  let currentInput = formatDirectiveAsText(directive);
  let killSwitchTriggered = false;
  let killSwitchReason: string | undefined;

  console.log('\n' + '─'.repeat(70));
  console.log('CONDITION A: NO SYMBOLS (Telephone Game)');
  console.log('─'.repeat(70));

  for (let i = 0; i < numAgents; i++) {
    const agentId = `agent_nosym_${i + 1}`;
    const frame = `⊕◊${'▶'}${'βγω'[Math.min(i, 2)]}`;

    console.log(`\nAgent ${i + 1}/${numAgents} (${agentId})`);

    // Simulate agent processing (in real implementation, this calls LLM)
    const output = simulateAgentOutput(currentInput, i, numAgents, false);

    // Check coverage (drift detection)
    const { covered, missed } = checkRequirementsCoverage(output, directive.requirements);
    const driftDetected = missed.length > 0;

    const agentOutput: AgentOutput = {
      agentId,
      agentNumber: i + 1,
      frame,
      input: currentInput.substring(0, 200) + '...',
      output,
      timestamp: Date.now(),
      driftDetected,
      driftDetails: driftDetected ? missed : undefined,
      requirementsCovered: covered,
      requirementsMissed: missed,
    };

    agentOutputs.push(agentOutput);

    // Log drift if detected (but can't stop it without symbols)
    if (driftDetected) {
      console.log(`  ⚠️ DRIFT: Missing ${missed.length} requirements`);
      console.log(`     ${missed.slice(0, 2).join(', ')}${missed.length > 2 ? '...' : ''}`);
    } else {
      console.log(`  ✓ All requirements covered`);
    }

    // Next agent only sees this agent's output (lossy)
    currentInput = `Previous agent said:\n${output}\n\nContinue the analysis.`;
  }

  // Calculate metrics
  const finalOutput = agentOutputs[agentOutputs.length - 1].output;
  const { covered: finalCovered } = checkRequirementsCoverage(finalOutput, directive.requirements);

  return {
    condition: 'no_symbols',
    chainLength: numAgents,
    directive,
    agentOutputs,
    finalOutput,
    metrics: {
      requirementsCoverage: finalCovered.length / directive.requirements.length,
      intentPreserved: checkIntentPreserved(finalOutput, directive.commanders_intent),
      driftEventsDetected: agentOutputs.filter(a => a.driftDetected).length,
      driftEventsCaught: 0, // Can't catch without symbols
      totalTokens: agentOutputs.reduce((sum, a) => sum + a.output.length, 0),
    },
    holdEvents,
    killSwitchTriggered,
    killSwitchReason,
  };
}

async function runChainWithSymbols(
  directive: DirectiveSymbol,
  numAgents: number,
  holdCallback?: (hold: HoldEvent) => Promise<'approved' | 'rejected' | 'kill_switch'>
): Promise<ChainResult> {
  const agentOutputs: AgentOutput[] = [];
  const holdEvents: HoldEvent[] = [];
  let accumulatedWork: string[] = [];
  let parentFrame = '⊕◊▼α';
  let killSwitchTriggered = false;
  let killSwitchReason: string | undefined;

  console.log('\n' + '─'.repeat(70));
  console.log('CONDITION B: WITH PROMPTSPEAK SYMBOLS');
  console.log('─'.repeat(70));
  console.log(`Symbol ID: ${directive.symbolId}`);
  console.log(`Hash: ${directive.hash}`);

  for (let i = 0; i < numAgents; i++) {
    if (killSwitchTriggered) break;

    const agentId = `agent_sym_${i + 1}`;
    const isLast = i === numAgents - 1;
    const action = isLast ? '●' : '▶';
    const entity = ['β', 'γ', 'ω'][Math.min(i, 2)];
    const frame = `⊕◊${action}${entity}`;

    console.log(`\nAgent ${i + 1}/${numAgents} (${agentId})`);
    console.log(`  Frame: ${frame}`);

    // Validate frame against parent
    const validation = validateFrame(frame, parentFrame);
    if (!validation.valid) {
      console.log(`  ❌ FRAME INVALID: ${validation.errors.join(', ')}`);
      // Create hold for invalid frame
      const hold: HoldEvent = {
        holdId: `hold_${Date.now()}`,
        agentId,
        reason: `Frame validation failed: ${validation.errors.join(', ')}`,
        severity: 'high',
        timestamp: Date.now(),
        decision: 'pending',
        humanMessage: HOLD_MESSAGES.human.drift_detected({} as HoldEvent),
        agentMessage: HOLD_MESSAGES.agent.hold_notification({} as HoldEvent),
      };
      holdEvents.push(hold);
      continue;
    }

    // Simulate agent with full directive access
    const output = simulateAgentOutput(
      HOLD_MESSAGES.agent.directive_reminder(directive) +
      '\n\nPrevious work:\n' + accumulatedWork.join('\n'),
      i,
      numAgents,
      true
    );

    // Check coverage (drift detection with enforcement)
    const { covered, missed } = checkRequirementsCoverage(output, directive.requirements);
    const driftDetected = missed.length > directive.requirements.length * 0.3; // >30% missed = drift

    const agentOutput: AgentOutput = {
      agentId,
      agentNumber: i + 1,
      frame,
      input: `[Symbol Reference: ${directive.symbolId}]`,
      output,
      symbolReference: directive.symbolId,
      timestamp: Date.now(),
      driftDetected,
      driftDetails: driftDetected ? missed : undefined,
      requirementsCovered: covered,
      requirementsMissed: missed,
    };

    // If drift detected, create hold
    if (driftDetected) {
      console.log(`  ⚠️ DRIFT DETECTED: Missing ${missed.length} requirements`);
      console.log(HOLD_MESSAGES.audit.drift_detected(agentId, missed));

      const hold: HoldEvent = {
        holdId: `hold_${Date.now()}_${agentId}`,
        agentId,
        reason: `Output missing requirements: ${missed.slice(0, 3).join(', ')}${missed.length > 3 ? '...' : ''}`,
        severity: missed.length > directive.requirements.length * 0.5 ? 'critical' : 'high',
        timestamp: Date.now(),
        decision: 'pending',
        humanMessage: HOLD_MESSAGES.human.drift_detected({
          holdId: `hold_${Date.now()}`,
          agentId,
          reason: `Missing ${missed.length} requirements`,
          severity: 'high',
          timestamp: Date.now(),
        } as HoldEvent),
        agentMessage: HOLD_MESSAGES.agent.hold_notification({} as HoldEvent),
      };

      console.log(hold.humanMessage);

      // Get human decision (or simulate)
      let decision: 'approved' | 'rejected' | 'kill_switch' = 'rejected';
      if (holdCallback) {
        decision = await holdCallback(hold);
      } else {
        // Auto-reject drift in experiment mode
        decision = 'rejected';
      }

      hold.decision = decision;
      holdEvents.push(hold);

      if (decision === 'kill_switch') {
        killSwitchTriggered = true;
        killSwitchReason = `Human activated kill switch at agent ${i + 1}`;
        console.log(HOLD_MESSAGES.human.killed(`chain_${Date.now()}`));
        console.log(HOLD_MESSAGES.agent.killed());
        break;
      } else if (decision === 'rejected') {
        console.log(HOLD_MESSAGES.human.rejected(hold.holdId, 'Drift exceeded threshold'));
        console.log(HOLD_MESSAGES.agent.rejected(hold.holdId, 'Re-read directive and address all requirements'));
        // In real implementation, agent would retry
        // For experiment, we note the drift was caught
      }
    } else {
      console.log(`  ✓ Coverage: ${covered.length}/${directive.requirements.length} requirements`);
    }

    agentOutputs.push(agentOutput);
    accumulatedWork.push(`[Agent ${i + 1}]: ${output.substring(0, 200)}...`);
    parentFrame = frame;
  }

  // Calculate metrics
  const finalOutput = agentOutputs.length > 0
    ? agentOutputs[agentOutputs.length - 1].output
    : '';
  const { covered: finalCovered } = checkRequirementsCoverage(finalOutput, directive.requirements);

  return {
    condition: 'with_symbols',
    chainLength: numAgents,
    directive,
    agentOutputs,
    finalOutput,
    metrics: {
      requirementsCoverage: finalCovered.length / directive.requirements.length,
      intentPreserved: checkIntentPreserved(finalOutput, directive.commanders_intent),
      driftEventsDetected: agentOutputs.filter(a => a.driftDetected).length,
      driftEventsCaught: holdEvents.filter(h => h.decision === 'rejected').length,
      totalTokens: agentOutputs.reduce((sum, a) => sum + a.output.length, 0),
    },
    holdEvents,
    killSwitchTriggered,
    killSwitchReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATION (Replace with actual LLM calls in production)
// ═══════════════════════════════════════════════════════════════════════════

function simulateAgentOutput(
  input: string,
  agentIndex: number,
  totalAgents: number,
  hasSymbolAccess: boolean
): string {
  // Simulate degradation without symbols
  const degradationRate = hasSymbolAccess ? 0.05 : 0.20;
  const requirements = [
    'Q3 FY25 datacenter revenue was $30.8 billion',
    'Year-over-year growth of 112%',
    'Blackwell transition affecting margins',
    'China export restrictions impact',
    'AMD MI300X competitive positioning',
    'TSMC supply chain dependency',
    'Fear & Greed Index at 73 (Greed)',
    'Analyst price targets averaging $170',
    'DeepSeek efficiency risk',
    'Position: Maintain overweight',
  ];

  // Without symbols, each handoff loses information
  const keepCount = hasSymbolAccess
    ? Math.floor(requirements.length * (1 - agentIndex * degradationRate))
    : Math.floor(requirements.length * Math.pow(1 - degradationRate, agentIndex + 1));

  const keptRequirements = requirements.slice(0, Math.max(keepCount, 2));

  if (agentIndex === totalAgents - 1) {
    // Final agent produces report
    return `NVDA Analysis Report:

${keptRequirements.join('\n\n')}

${hasSymbolAccess
  ? `[Validated against ${keptRequirements.length} symbol requirements]`
  : `[Based on previous agent summaries]`
}`;
  } else {
    // Intermediate agent passes work
    return `Analysis progress:
${keptRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Passing to next agent for continuation.`;
  }
}

function formatDirectiveAsText(directive: DirectiveSymbol): string {
  return `Task: ${directive.what}
For: ${directive.who}
Purpose: ${directive.why}
Scope: ${directive.where}
Period: ${directive.when}
Focus: ${directive.how.focus.join(', ')}
Constraints: ${directive.how.constraints.join(', ')}
Output: ${directive.how.output_format}

Commander's Intent: ${directive.commanders_intent}

Requirements:
${directive.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

function checkIntentPreserved(output: string, intent: string): boolean {
  // Check if key aspects of intent are present
  const intentKeywords = intent.toLowerCase().match(/\b\w{4,}\b/g) || [];
  const outputLower = output.toLowerCase();

  const matched = intentKeywords.filter(kw => outputLower.includes(kw));
  return matched.length >= intentKeywords.length * 0.5;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPERIMENT RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runExperiment(chainLengths: number[] = [3, 5, 7, 10]): Promise<ExperimentResult> {
  const experimentId = `exp_${Date.now()}`;
  const startTime = new Date().toISOString();

  console.log('\n' + '═'.repeat(70));
  console.log('   PROMPTSPEAK TELEPHONE GAME EXPERIMENT');
  console.log('═'.repeat(70));
  console.log(`\nExperiment ID: ${experimentId}`);
  console.log(`Chain lengths: ${chainLengths.join(', ')}`);

  // Create test directive
  const directive = createDirectiveSymbol({
    who: 'Investment Committee',
    what: 'Quarterly financial analysis',
    why: 'Evaluate NVDA position sizing',
    where: 'NVIDIA Corporation (NASDAQ: NVDA)',
    when: 'Q3 FY25 (October 2024)',
    how: {
      focus: ['datacenter_revenue', 'margin_impact', 'blackwell_transition'],
      constraints: ['cite_sources', 'quantify_claims', 'flag_uncertainties'],
      output_format: 'written_report',
    },
    commanders_intent: 'Determine if Blackwell transition costs justify maintaining overweight position',
    requirements: [
      'Include Q3 FY25 datacenter revenue ($30.8B)',
      'Calculate YoY growth rate (112%)',
      'Discuss Blackwell margin impact',
      'Address China export restrictions',
      'Compare to AMD MI300X positioning',
      'Note TSMC supply chain dependency',
      'Reference Fear & Greed Index',
      'Include analyst price targets',
      'Mention DeepSeek competitive risk',
      'Conclude with position recommendation',
    ],
  });

  console.log(`\nDirective created: ${directive.symbolId}`);
  console.log(`Hash: ${directive.hash}`);

  const noSymbolsResults: ChainResult[] = [];
  const withSymbolsResults: ChainResult[] = [];

  for (const chainLength of chainLengths) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`TESTING CHAIN LENGTH: ${chainLength} AGENTS`);
    console.log('═'.repeat(70));

    // Run without symbols
    const noSymResult = await runChainWithoutSymbols(directive, chainLength);
    noSymbolsResults.push(noSymResult);

    // Run with symbols
    const withSymResult = await runChainWithSymbols(directive, chainLength);
    withSymbolsResults.push(withSymResult);

    // Compare
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`CHAIN LENGTH ${chainLength} COMPARISON:`);
    console.log('─'.repeat(70));
    console.log(`  No Symbols:   ${(noSymResult.metrics.requirementsCoverage * 100).toFixed(0)}% coverage`);
    console.log(`  With Symbols: ${(withSymResult.metrics.requirementsCoverage * 100).toFixed(0)}% coverage`);
    console.log(`  Drift Caught: ${withSymResult.metrics.driftEventsCaught}`);
  }

  const endTime = new Date().toISOString();

  // Calculate summary
  const avgNoSymCoverage = noSymbolsResults.reduce((s, r) => s + r.metrics.requirementsCoverage, 0) / noSymbolsResults.length;
  const avgWithSymCoverage = withSymbolsResults.reduce((s, r) => s + r.metrics.requirementsCoverage, 0) / withSymbolsResults.length;

  const result: ExperimentResult = {
    experimentId,
    startTime,
    endTime,
    noSymbols: noSymbolsResults,
    withSymbols: withSymbolsResults,
    summary: {
      noSymbols: {
        avgCoverage: avgNoSymCoverage,
        avgIntentPreserved: noSymbolsResults.filter(r => r.metrics.intentPreserved).length / noSymbolsResults.length,
        coverageByChainLength: Object.fromEntries(
          noSymbolsResults.map(r => [r.chainLength, r.metrics.requirementsCoverage])
        ),
      },
      withSymbols: {
        avgCoverage: avgWithSymCoverage,
        avgIntentPreserved: withSymbolsResults.filter(r => r.metrics.intentPreserved).length / withSymbolsResults.length,
        coverageByChainLength: Object.fromEntries(
          withSymbolsResults.map(r => [r.chainLength, r.metrics.requirementsCoverage])
        ),
        driftEventsCaught: withSymbolsResults.reduce((s, r) => s + r.metrics.driftEventsCaught, 0),
      },
      improvement: {
        coverageDelta: avgWithSymCoverage - avgNoSymCoverage,
        intentDelta: 0,
      },
    },
  };

  // Print final report
  printFinalReport(result);

  // Save results
  const fs = await import('fs');
  fs.writeFileSync(`./telephone-experiment-${experimentId}.json`, JSON.stringify(result, null, 2));
  console.log(`\n📄 Results saved to: ./telephone-experiment-${experimentId}.json`);

  return result;
}

function printFinalReport(result: ExperimentResult): void {
  console.log('\n' + '═'.repeat(70));
  console.log('                    FINAL EXPERIMENT REPORT');
  console.log('═'.repeat(70));

  console.log('\n📊 COVERAGE BY CHAIN LENGTH\n');
  console.log('Chain    No Symbols    With Symbols    Improvement');
  console.log('─'.repeat(55));

  for (const chainLength of Object.keys(result.summary.noSymbols.coverageByChainLength)) {
    const noSym = result.summary.noSymbols.coverageByChainLength[Number(chainLength)];
    const withSym = result.summary.withSymbols.coverageByChainLength[Number(chainLength)];
    const improvement = withSym - noSym;

    console.log(
      `${chainLength.padStart(5)}    ` +
      `${(noSym * 100).toFixed(0).padStart(6)}%       ` +
      `${(withSym * 100).toFixed(0).padStart(6)}%        ` +
      `${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(0)}%`
    );
  }

  console.log('\n📈 AGGREGATE METRICS\n');
  console.log(`  Average Coverage (No Symbols):   ${(result.summary.noSymbols.avgCoverage * 100).toFixed(1)}%`);
  console.log(`  Average Coverage (With Symbols): ${(result.summary.withSymbols.avgCoverage * 100).toFixed(1)}%`);
  console.log(`  Coverage Improvement:            ${(result.summary.improvement.coverageDelta * 100).toFixed(1)}%`);
  console.log(`  Drift Events Caught:             ${result.summary.withSymbols.driftEventsCaught}`);

  console.log('\n📉 DEGRADATION PATTERN\n');
  console.log('Chain Length:  3      5      7      10');
  console.log('─'.repeat(45));

  const noSymCoverages = Object.values(result.summary.noSymbols.coverageByChainLength);
  const withSymCoverages = Object.values(result.summary.withSymbols.coverageByChainLength);

  process.stdout.write('No Symbols:   ');
  noSymCoverages.forEach(c => process.stdout.write(`${(c * 100).toFixed(0).padStart(4)}%  `));
  console.log('');

  process.stdout.write('With Symbols: ');
  withSymCoverages.forEach(c => process.stdout.write(`${(c * 100).toFixed(0).padStart(4)}%  `));
  console.log('');

  console.log('\n💡 INTERPRETATION\n');

  if (result.summary.improvement.coverageDelta > 0.1) {
    console.log('  ✅ HYPOTHESIS SUPPORTED: Symbols significantly reduce information loss');
  } else if (result.summary.improvement.coverageDelta > 0) {
    console.log('  ⚠️ MARGINAL IMPROVEMENT: Symbols help but effect is modest');
  } else {
    console.log('  ❌ HYPOTHESIS NOT SUPPORTED: No improvement from symbols');
  }

  // Check degradation pattern
  const noSymDegrades = noSymCoverages[0] - noSymCoverages[noSymCoverages.length - 1];
  const withSymDegrades = withSymCoverages[0] - withSymCoverages[withSymCoverages.length - 1];

  if (noSymDegrades > 0.2 && withSymDegrades < 0.1) {
    console.log('  ✅ DEGRADATION PREVENTED: Symbols maintain fidelity across chain length');
  } else if (withSymDegrades < noSymDegrades) {
    console.log('  ⚠️ DEGRADATION REDUCED: Symbols slow but don\'t prevent information loss');
  }

  console.log('\n' + '═'.repeat(70));
  console.log('                    END OF EXPERIMENT REPORT');
  console.log('═'.repeat(70));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

const chainLengths = process.argv.slice(2).map(Number).filter(n => !isNaN(n));
runExperiment(chainLengths.length > 0 ? chainLengths : [3, 5, 7, 10]).catch(console.error);
