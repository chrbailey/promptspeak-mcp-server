#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * REAL PROMPTSPEAK AGENT EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * THIS IS A REAL TEST - Uses actual Claude API calls, not simulation!
 *
 * Architecture:
 * 1. Directive Symbol is registered with full who/what/why/where/when/how
 * 2. Each agent receives the symbol + unique topic prompt
 * 3. Each agent generates REAL prose (200+ words)
 * 4. MCP validation checks frames
 * 5. Drift is measured by comparing output to requirements
 * 6. Holds trigger on drift, with kill switch capability
 *
 * Two conditions run:
 *   A) WITHOUT SYMBOLS - Telephone game (each agent only sees previous output)
 *   B) WITH SYMBOLS - Each agent sees immutable directive + previous work
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import * as readline from 'readline';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 1024,
  NUM_AGENTS: 5,  // Start with 5 for cost control
  DRIFT_THRESHOLD: 0.30,  // 30% requirements missed = drift
  HUMAN_REVIEW_ENABLED: true,
  AUTO_APPROVE_BELOW_THRESHOLD: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTIVE SYMBOL (The Anchor)
// ═══════════════════════════════════════════════════════════════════════════════

interface DirectiveSymbol {
  symbolId: string;
  hash: string;
  frame: string;
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
}

function createDirectiveSymbol(): DirectiveSymbol {
  const content = {
    frame: '⊕◊▼α',  // Strict financial delegate from primary
    who: 'Investment Committee',
    what: 'Comprehensive quarterly analysis of NVIDIA',
    why: 'Evaluate whether to maintain overweight position',
    where: 'NVIDIA Corporation (NASDAQ: NVDA)',
    when: 'Q3 FY25 (October 2024)',
    how: {
      focus: ['datacenter_revenue', 'margin_impact', 'competitive_position', 'geopolitical_risk'],
      constraints: ['cite_specific_numbers', 'acknowledge_uncertainties', 'compare_to_competitors'],
      output_format: 'analytical_prose',
    },
    commanders_intent: 'Determine if Blackwell transition margin compression is temporary and whether competitive/geopolitical risks justify position changes',
    requirements: [
      'MUST mention Q3 datacenter revenue of $30.8 billion',
      'MUST include year-over-year growth rate of 112%',
      'MUST discuss Blackwell chip transition and margin impact',
      'MUST address China export restrictions and H20 chip',
      'MUST compare to AMD MI300X competitive positioning',
    ],
  };

  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);

  return {
    symbolId: `Ξ.DIRECTIVE.REAL.${Date.now()}`,
    hash,
    ...content,
    created_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentSpec {
  id: string;
  name: string;
  frame: string;
  topic: string;
  uniquePrompt: string;
}

const AGENTS: AgentSpec[] = [
  {
    id: 'revenue',
    name: 'Revenue Analyst',
    frame: '⊕◊▶β',
    topic: 'datacenter_revenue',
    uniquePrompt: `You are the Revenue Analyst. Your specific focus is on NVIDIA's datacenter revenue performance.

Analyze the Q3 FY25 datacenter revenue figures. The datacenter segment generated $30.8 billion in Q3,
representing 112% year-over-year growth. Discuss the growth drivers, including AI training demand,
inference workloads, and cloud provider spending. Consider the sustainability of this growth rate.

Write 200+ words of analytical prose. Be specific with numbers and comparisons.`,
  },
  {
    id: 'product',
    name: 'Product Analyst',
    frame: '⊕◊▶γ',
    topic: 'blackwell_transition',
    uniquePrompt: `You are the Product Analyst. Your specific focus is on NVIDIA's Blackwell chip transition.

Analyze the Blackwell architecture transition and its impact on margins. The new chips require
different manufacturing processes and have initial yield challenges. Discuss the timeline for
volume production, expected margin recovery, and how this compares to previous architecture transitions
(Hopper, Ampere).

Write 200+ words of analytical prose. Be specific about the margin impact and timeline.`,
  },
  {
    id: 'geopolitical',
    name: 'Geopolitical Analyst',
    frame: '⊕◊▶γ',
    topic: 'china_restrictions',
    uniquePrompt: `You are the Geopolitical Analyst. Your specific focus is on China export restrictions.

Analyze the impact of US export controls on NVIDIA's China business. Discuss the H20 chip
(the compliance-specific product for China), recent restrictions, and revenue impact.
The China market represented significant datacenter revenue that is now at risk.

Write 200+ words of analytical prose. Be specific about regulatory risks and revenue exposure.`,
  },
  {
    id: 'competitive',
    name: 'Competitive Intelligence',
    frame: '⊕◊▶ω',
    topic: 'amd_competition',
    uniquePrompt: `You are the Competitive Intelligence Analyst. Your specific focus is AMD competition.

Analyze AMD's MI300X competitive positioning against NVIDIA's H100/H200. Discuss AMD's
market share gains, software ecosystem (ROCm vs CUDA), and customer adoption. Consider
hyperscaler diversification strategies and custom silicon threats from Google, Amazon, Microsoft.

Write 200+ words of analytical prose. Be specific about competitive dynamics.`,
  },
  {
    id: 'synthesis',
    name: 'Synthesis Analyst',
    frame: '⊕◊●ω',
    topic: 'final_recommendation',
    uniquePrompt: `You are the Synthesis Analyst. Your job is to integrate all previous analysis into a final recommendation.

Based on the analysis from previous agents, synthesize the key findings and provide a final
position recommendation. Consider:
- Revenue strength vs margin pressure
- Competitive moat durability
- Geopolitical risk exposure
- Valuation implications

Conclude with a clear recommendation: OVERWEIGHT, EQUAL-WEIGHT, or UNDERWEIGHT.

Write 200+ words of analytical prose with a clear conclusion.`,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface DriftAnalysis {
  requirementsMet: string[];
  requirementsMissed: string[];
  coverageRate: number;
  driftDetected: boolean;
  driftSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  details: string[];
}

function analyzeDrift(output: string, directive: DirectiveSymbol): DriftAnalysis {
  const outputLower = output.toLowerCase();
  const requirementsMet: string[] = [];
  const requirementsMissed: string[] = [];
  const details: string[] = [];

  // Check each requirement
  for (const req of directive.requirements) {
    let met = false;

    // Requirement 1: Q3 datacenter revenue $30.8B
    if (req.includes('$30.8 billion')) {
      met = outputLower.includes('30.8') || outputLower.includes('$30.8');
      if (met) details.push('✓ Found $30.8B revenue reference');
    }
    // Requirement 2: 112% YoY growth
    else if (req.includes('112%')) {
      met = outputLower.includes('112%') || outputLower.includes('112 percent');
      if (met) details.push('✓ Found 112% growth reference');
    }
    // Requirement 3: Blackwell transition
    else if (req.includes('Blackwell')) {
      met = outputLower.includes('blackwell');
      if (met) details.push('✓ Found Blackwell discussion');
    }
    // Requirement 4: China restrictions
    else if (req.includes('China')) {
      met = outputLower.includes('china') || outputLower.includes('h20') || outputLower.includes('export');
      if (met) details.push('✓ Found China/export discussion');
    }
    // Requirement 5: AMD MI300X
    else if (req.includes('MI300X')) {
      met = outputLower.includes('amd') || outputLower.includes('mi300');
      if (met) details.push('✓ Found AMD/MI300X discussion');
    }

    if (met) {
      requirementsMet.push(req);
    } else {
      requirementsMissed.push(req);
    }
  }

  const coverageRate = requirementsMet.length / directive.requirements.length;
  const missedRate = 1 - coverageRate;

  let driftSeverity: DriftAnalysis['driftSeverity'] = 'none';
  if (missedRate > 0.6) driftSeverity = 'critical';
  else if (missedRate > 0.4) driftSeverity = 'high';
  else if (missedRate > 0.2) driftSeverity = 'medium';
  else if (missedRate > 0) driftSeverity = 'low';

  return {
    requirementsMet,
    requirementsMissed,
    coverageRate,
    driftDetected: missedRate > CONFIG.DRIFT_THRESHOLD,
    driftSeverity,
    details,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLD MANAGEMENT (Human-in-the-Loop)
// ═══════════════════════════════════════════════════════════════════════════════

interface HoldEvent {
  holdId: string;
  agentId: string;
  reason: string;
  severity: DriftAnalysis['driftSeverity'];
  timestamp: number;
  decision?: 'approved' | 'rejected' | 'killed';
  humanResponse?: string;
}

const pendingHolds: HoldEvent[] = [];

async function promptHuman(hold: HoldEvent): Promise<'approve' | 'reject' | 'kill'> {
  console.log('\n' + '═'.repeat(80));
  console.log('  ⚠️  HOLD TRIGGERED - HUMAN REVIEW REQUIRED');
  console.log('═'.repeat(80));
  console.log(`  Hold ID:     ${hold.holdId}`);
  console.log(`  Agent:       ${hold.agentId}`);
  console.log(`  Severity:    ${hold.severity.toUpperCase()}`);
  console.log(`  Reason:      ${hold.reason}`);
  console.log('─'.repeat(80));
  console.log('  OPTIONS:');
  console.log('    [A] APPROVE - Allow agent to continue');
  console.log('    [R] REJECT  - Block this output, agent will retry');
  console.log('    [K] KILL    - EMERGENCY STOP - Halt entire chain');
  console.log('═'.repeat(80));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const askQuestion = () => {
      rl.question('\n  Your decision [A/R/K]: ', (answer) => {
        const choice = answer.trim().toUpperCase();
        if (choice === 'A') {
          rl.close();
          resolve('approve');
        } else if (choice === 'R') {
          rl.close();
          resolve('reject');
        } else if (choice === 'K') {
          rl.close();
          resolve('kill');
        } else {
          console.log('  Invalid choice. Please enter A, R, or K.');
          askQuestion();
        }
      });
    };
    askQuestion();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE API INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

interface AgentResult {
  agentId: string;
  agentName: string;
  frame: string;
  input: string;
  output: string;
  wordCount: number;
  drift: DriftAnalysis;
  holdEvent?: HoldEvent;
  tokensUsed: number;
  durationMs: number;
}

async function callAgent(
  agent: AgentSpec,
  directive: DirectiveSymbol,
  previousWork: string,
  withSymbol: boolean
): Promise<AgentResult> {
  const startTime = Date.now();

  // Build the prompt
  let systemPrompt: string;
  let userPrompt: string;

  if (withSymbol) {
    // WITH SYMBOL: Agent sees full directive + previous work
    systemPrompt = `You are ${agent.name} in a multi-agent financial analysis chain.

═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL (IMMUTABLE ANCHOR - Reference this throughout your work)
═══════════════════════════════════════════════════════════════════════════════
Symbol ID: ${directive.symbolId}
Hash: ${directive.hash}
Frame: ${directive.frame}

WHO:   ${directive.who}
WHAT:  ${directive.what}
WHY:   ${directive.why}
WHERE: ${directive.where}
WHEN:  ${directive.when}

HOW:
  Focus Areas: ${directive.how.focus.join(', ')}
  Constraints: ${directive.how.constraints.join(', ')}
  Output: ${directive.how.output_format}

COMMANDER'S INTENT:
  "${directive.commanders_intent}"

REQUIREMENTS (Your output will be validated against these):
${directive.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}
═══════════════════════════════════════════════════════════════════════════════

Your frame for this task: ${agent.frame}
Your specific topic: ${agent.topic}

CRITICAL: Your output will be checked against the requirements above.
          Missing requirements = DRIFT = HOLD for human review.`;

    userPrompt = `${agent.uniquePrompt}

${previousWork ? `\n═══ PREVIOUS AGENT WORK (Build upon this) ═══\n${previousWork}\n═══════════════════════════════════════════\n` : ''}

Now write your analysis. Remember to address the directive requirements relevant to your topic.
Write at least 200 words of substantive analytical prose.`;

  } else {
    // WITHOUT SYMBOL: Agent only sees previous work (telephone game)
    systemPrompt = `You are ${agent.name} in a multi-agent financial analysis chain.
You are analyzing NVIDIA. Your topic is: ${agent.topic}`;

    userPrompt = previousWork
      ? `Continue this analysis:\n\n${previousWork}\n\n${agent.uniquePrompt}`
      : agent.uniquePrompt;
  }

  // Call Claude API
  const response = await anthropic.messages.create({
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : '';
  const wordCount = output.split(/\s+/).length;
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
  const durationMs = Date.now() - startTime;

  // Analyze drift
  const drift = analyzeDrift(output, directive);

  return {
    agentId: agent.id,
    agentName: agent.name,
    frame: agent.frame,
    input: userPrompt.substring(0, 500) + '...',
    output,
    wordCount,
    drift,
    tokensUsed,
    durationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN RUNNERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ChainResult {
  condition: 'with_symbols' | 'without_symbols';
  directive: DirectiveSymbol;
  agents: AgentResult[];
  totalTokens: number;
  totalDurationMs: number;
  finalCoverage: number;
  driftEventsDetected: number;
  holdsTriggered: number;
  killed: boolean;
  killReason?: string;
}

async function runChainWithoutSymbols(directive: DirectiveSymbol): Promise<ChainResult> {
  console.log('\n' + '═'.repeat(80));
  console.log('  CONDITION A: WITHOUT SYMBOLS (Telephone Game)');
  console.log('═'.repeat(80));
  console.log('  Each agent only sees previous agent output - NO directive reference\n');

  const agents: AgentResult[] = [];
  let previousWork = '';
  let totalTokens = 0;
  const startTime = Date.now();

  for (const agentSpec of AGENTS) {
    console.log(`\n  📤 Calling ${agentSpec.name} (${agentSpec.frame})...`);

    const result = await callAgent(agentSpec, directive, previousWork, false);
    agents.push(result);
    totalTokens += result.tokensUsed;

    console.log(`  📥 Response: ${result.wordCount} words, ${result.tokensUsed} tokens`);
    console.log(`  📊 Coverage: ${(result.drift.coverageRate * 100).toFixed(0)}% (${result.drift.requirementsMet.length}/${directive.requirements.length})`);

    if (result.drift.driftDetected) {
      console.log(`  ⚠️  DRIFT DETECTED: ${result.drift.driftSeverity.toUpperCase()}`);
      console.log(`      Missing: ${result.drift.requirementsMissed.slice(0, 2).join(', ')}...`);
    }

    // For telephone game, only pass output (lossy)
    previousWork = result.output;
  }

  const finalResult = agents[agents.length - 1];

  return {
    condition: 'without_symbols',
    directive,
    agents,
    totalTokens,
    totalDurationMs: Date.now() - startTime,
    finalCoverage: finalResult.drift.coverageRate,
    driftEventsDetected: agents.filter(a => a.drift.driftDetected).length,
    holdsTriggered: 0,
    killed: false,
  };
}

async function runChainWithSymbols(directive: DirectiveSymbol): Promise<ChainResult> {
  console.log('\n' + '═'.repeat(80));
  console.log('  CONDITION B: WITH PROMPTSPEAK SYMBOLS');
  console.log('═'.repeat(80));
  console.log(`  Symbol ID: ${directive.symbolId}`);
  console.log(`  Hash: ${directive.hash}`);
  console.log('  Each agent sees FULL directive + accumulated work\n');

  const agents: AgentResult[] = [];
  let accumulatedWork = '';
  let totalTokens = 0;
  let holdsTriggered = 0;
  let killed = false;
  let killReason: string | undefined;
  const startTime = Date.now();

  for (const agentSpec of AGENTS) {
    if (killed) break;

    console.log(`\n  📤 Calling ${agentSpec.name} (${agentSpec.frame})...`);

    const result = await callAgent(agentSpec, directive, accumulatedWork, true);
    totalTokens += result.tokensUsed;

    console.log(`  📥 Response: ${result.wordCount} words, ${result.tokensUsed} tokens`);
    console.log(`  📊 Coverage: ${(result.drift.coverageRate * 100).toFixed(0)}% (${result.drift.requirementsMet.length}/${directive.requirements.length})`);

    // Check for drift and trigger hold
    if (result.drift.driftDetected && CONFIG.HUMAN_REVIEW_ENABLED) {
      const hold: HoldEvent = {
        holdId: `hold_${Date.now()}`,
        agentId: agentSpec.id,
        reason: `Missing ${result.drift.requirementsMissed.length} requirements: ${result.drift.requirementsMissed.slice(0, 2).join(', ')}`,
        severity: result.drift.driftSeverity,
        timestamp: Date.now(),
      };

      result.holdEvent = hold;
      holdsTriggered++;

      console.log(`\n  ⚠️  DRIFT DETECTED - TRIGGERING HOLD`);

      // Get human decision
      const decision = await promptHuman(hold);
      hold.decision = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'killed';

      if (decision === 'kill') {
        killed = true;
        killReason = `Human triggered KILL SWITCH at agent ${agentSpec.id}`;
        console.log('\n  🛑 KILL SWITCH ACTIVATED - CHAIN TERMINATED');
        break;
      } else if (decision === 'reject') {
        console.log('  ❌ REJECTED - Would retry in production (continuing for demo)');
      } else {
        console.log('  ✅ APPROVED - Continuing chain');
      }
    }

    agents.push(result);

    // Accumulate work for next agent
    accumulatedWork += `\n\n=== ${agentSpec.name} Analysis ===\n${result.output}`;
  }

  const finalResult = agents.length > 0 ? agents[agents.length - 1] : null;

  return {
    condition: 'with_symbols',
    directive,
    agents,
    totalTokens,
    totalDurationMs: Date.now() - startTime,
    finalCoverage: finalResult?.drift.coverageRate ?? 0,
    driftEventsDetected: agents.filter(a => a.drift.driftDetected).length,
    holdsTriggered,
    killed,
    killReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function printFinalReport(withoutSymbols: ChainResult, withSymbols: ChainResult): void {
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    REAL EXPERIMENT FINAL REPORT');
  console.log('═'.repeat(80));

  console.log('\n📊 SIDE-BY-SIDE COMPARISON\n');
  console.log('                         Without Symbols    With Symbols');
  console.log('─'.repeat(60));
  console.log(`  Final Coverage:        ${(withoutSymbols.finalCoverage * 100).toFixed(0).padStart(8)}%       ${(withSymbols.finalCoverage * 100).toFixed(0).padStart(8)}%`);
  console.log(`  Drift Events:          ${String(withoutSymbols.driftEventsDetected).padStart(8)}        ${String(withSymbols.driftEventsDetected).padStart(8)}`);
  console.log(`  Holds Triggered:       ${String(withoutSymbols.holdsTriggered).padStart(8)}        ${String(withSymbols.holdsTriggered).padStart(8)}`);
  console.log(`  Total Tokens:          ${String(withoutSymbols.totalTokens).padStart(8)}        ${String(withSymbols.totalTokens).padStart(8)}`);
  console.log(`  Duration:              ${String((withoutSymbols.totalDurationMs / 1000).toFixed(1) + 's').padStart(8)}        ${String((withSymbols.totalDurationMs / 1000).toFixed(1) + 's').padStart(8)}`);

  console.log('\n📈 PER-AGENT COVERAGE PROGRESSION\n');
  console.log('  Agent               Without Symbol    With Symbol');
  console.log('─'.repeat(60));

  for (let i = 0; i < withoutSymbols.agents.length; i++) {
    const noSym = withoutSymbols.agents[i];
    const withSym = withSymbols.agents[i];
    if (noSym && withSym) {
      console.log(
        `  ${noSym.agentName.padEnd(20)} ${(noSym.drift.coverageRate * 100).toFixed(0).padStart(8)}%         ${(withSym.drift.coverageRate * 100).toFixed(0).padStart(8)}%`
      );
    }
  }

  console.log('\n📝 SAMPLE OUTPUTS\n');
  console.log('─'.repeat(80));
  console.log('WITHOUT SYMBOLS - Final agent output (first 500 chars):');
  console.log('─'.repeat(80));
  const noSymFinal = withoutSymbols.agents[withoutSymbols.agents.length - 1];
  if (noSymFinal) {
    console.log(noSymFinal.output.substring(0, 500) + '...\n');
  }

  console.log('─'.repeat(80));
  console.log('WITH SYMBOLS - Final agent output (first 500 chars):');
  console.log('─'.repeat(80));
  const withSymFinal = withSymbols.agents[withSymbols.agents.length - 1];
  if (withSymFinal) {
    console.log(withSymFinal.output.substring(0, 500) + '...\n');
  }

  console.log('\n💡 INTERPRETATION\n');
  const improvement = withSymbols.finalCoverage - withoutSymbols.finalCoverage;
  if (improvement > 0.2) {
    console.log('  ✅ STRONG EFFECT: Symbols significantly improved requirement coverage');
  } else if (improvement > 0.1) {
    console.log('  ⚠️ MODERATE EFFECT: Symbols provided measurable improvement');
  } else if (improvement > 0) {
    console.log('  ⚠️ MARGINAL EFFECT: Symbols provided slight improvement');
  } else {
    console.log('  ❌ NO EFFECT: No improvement observed (may need longer chains)');
  }

  if (withSymbols.killed) {
    console.log(`\n  🛑 CHAIN WAS KILLED: ${withSymbols.killReason}`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('                    END OF EXPERIMENT');
  console.log('═'.repeat(80));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         REAL PROMPTSPEAK AGENT EXPERIMENT');
  console.log('         (Actual Claude API Calls - Not Simulation!)');
  console.log('═'.repeat(80));

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ ERROR: ANTHROPIC_API_KEY environment variable not set');
    console.error('   Please set it before running: export ANTHROPIC_API_KEY=your-key');
    process.exit(1);
  }

  console.log(`\n  Model: ${CONFIG.MODEL}`);
  console.log(`  Agents: ${CONFIG.NUM_AGENTS}`);
  console.log(`  Drift Threshold: ${CONFIG.DRIFT_THRESHOLD * 100}%`);
  console.log(`  Human Review: ${CONFIG.HUMAN_REVIEW_ENABLED ? 'ENABLED' : 'DISABLED'}`);

  // Create directive symbol
  const directive = createDirectiveSymbol();
  console.log(`\n  📋 Directive Symbol Created:`);
  console.log(`     ID: ${directive.symbolId}`);
  console.log(`     Hash: ${directive.hash}`);
  console.log(`     Requirements: ${directive.requirements.length}`);

  // Run both conditions
  const withoutSymbolsResult = await runChainWithoutSymbols(directive);
  const withSymbolsResult = await runChainWithSymbols(directive);

  // Print final report
  printFinalReport(withoutSymbolsResult, withSymbolsResult);

  // Save results
  const fs = await import('fs');
  const results = {
    experimentId: `real_${Date.now()}`,
    directive,
    withoutSymbols: {
      ...withoutSymbolsResult,
      agents: withoutSymbolsResult.agents.map(a => ({
        ...a,
        output: a.output.substring(0, 1000) + '...', // Truncate for storage
      })),
    },
    withSymbols: {
      ...withSymbolsResult,
      agents: withSymbolsResult.agents.map(a => ({
        ...a,
        output: a.output.substring(0, 1000) + '...',
      })),
    },
  };

  const filename = `./real-experiment-${results.experimentId}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${filename}`);
}

main().catch(console.error);
