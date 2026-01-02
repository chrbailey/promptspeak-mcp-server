#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DYNAMIC SYMBOL UPDATE EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests whether agents can adapt to symbol updates mid-chain.
 *
 * Architecture:
 * - 9 agents (clean 1/3 divisions: agents 1-3, 4-6, 7-9)
 * - At agent 3 (1/3 mark): ADD a new requirement
 * - At agent 6 (2/3 mark): MODIFY an existing requirement
 *
 * Measures:
 * - Do agents 4-9 pick up the new requirement?
 * - Do agents 7-9 pick up the modified requirement?
 * - Version tracking per agent
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 800,
  NUM_AGENTS: 9,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MUTABLE DIRECTIVE SYMBOL
// ═══════════════════════════════════════════════════════════════════════════════

interface DirectiveSymbol {
  symbolId: string;
  version: number;
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
  updated_at: string;
  changelog: { version: number; change: string; timestamp: string }[];
}

function createDirectiveSymbol(): DirectiveSymbol {
  const now = new Date().toISOString();
  const content = {
    frame: '⊕◊▼α',
    who: 'Investment Committee',
    what: 'Comprehensive quarterly analysis of NVIDIA',
    why: 'Evaluate whether to maintain overweight position',
    where: 'NVIDIA Corporation (NASDAQ: NVDA)',
    when: 'Q3 FY25 (October 2024)',
    how: {
      focus: ['datacenter_revenue', 'margin_impact', 'competitive_position'],
      constraints: ['cite_specific_numbers', 'acknowledge_uncertainties'],
      output_format: 'analytical_prose',
    },
    commanders_intent: 'Determine if Blackwell transition margin compression is temporary',
    requirements: [
      'MUST mention Q3 datacenter revenue of $30.8 billion',
      'MUST include year-over-year growth rate of 112%',
      'MUST discuss Blackwell chip transition impact',
    ],
  };

  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);

  return {
    symbolId: `Ξ.DIRECTIVE.DYNAMIC.${Date.now()}`,
    version: 1,
    hash,
    ...content,
    created_at: now,
    updated_at: now,
    changelog: [{ version: 1, change: 'Initial creation', timestamp: now }],
  };
}

function updateSymbol(symbol: DirectiveSymbol, change: string, mutator: (s: DirectiveSymbol) => void): DirectiveSymbol {
  const updated = { ...symbol };
  updated.version += 1;
  updated.updated_at = new Date().toISOString();

  mutator(updated);

  // Recalculate hash
  const { changelog, ...content } = updated;
  updated.hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);

  updated.changelog = [
    ...symbol.changelog,
    { version: updated.version, change, timestamp: updated.updated_at }
  ];

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEFINITIONS (9 agents for clean 1/3 divisions)
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentSpec {
  id: string;
  name: string;
  frame: string;
  topic: string;
  prompt: string;
}

const AGENTS: AgentSpec[] = [
  // Phase 1: Agents 1-3 (see v1)
  {
    id: 'revenue',
    name: 'Revenue Analyst',
    frame: '⊕◊▶β',
    topic: 'revenue',
    prompt: 'Analyze Q3 FY25 datacenter revenue ($30.8B, 112% YoY). Discuss growth drivers.',
  },
  {
    id: 'margin',
    name: 'Margin Analyst',
    frame: '⊕◊▶β',
    topic: 'margins',
    prompt: 'Analyze gross margin trends and Blackwell transition impact on profitability.',
  },
  {
    id: 'product',
    name: 'Product Analyst',
    frame: '⊕◊▶γ',
    topic: 'products',
    prompt: 'Analyze Blackwell architecture vs Hopper. Discuss transition timeline.',
  },
  // Phase 2: Agents 4-6 (should see v2 with NEW requirement)
  {
    id: 'supply',
    name: 'Supply Chain',
    frame: '⊕◊▶γ',
    topic: 'supply',
    prompt: 'Analyze TSMC dependency and manufacturing capacity constraints.',
  },
  {
    id: 'competitive',
    name: 'Competitive Intel',
    frame: '⊕◊▶γ',
    topic: 'competition',
    prompt: 'Analyze AMD MI300X threat and custom silicon from hyperscalers.',
  },
  {
    id: 'geopolitical',
    name: 'Geopolitical',
    frame: '⊕◊▶ω',
    topic: 'geopolitics',
    prompt: 'Analyze China export restrictions and H20 chip compliance strategy.',
  },
  // Phase 3: Agents 7-9 (should see v3 with MODIFIED requirement)
  {
    id: 'valuation',
    name: 'Valuation',
    frame: '⊕◊▶ω',
    topic: 'valuation',
    prompt: 'Analyze current P/E multiple vs growth rate. Fair value assessment.',
  },
  {
    id: 'risk',
    name: 'Risk Analyst',
    frame: '⊕◊▶ω',
    topic: 'risks',
    prompt: 'Compile key risk factors: concentration, regulatory, competitive, execution.',
  },
  {
    id: 'synthesis',
    name: 'Synthesis',
    frame: '⊕◊●ω',
    topic: 'recommendation',
    prompt: 'Synthesize all analysis into final position recommendation with rationale.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface RequirementCheck {
  requirement: string;
  met: boolean;
  addedInVersion: number;
}

function checkRequirements(output: string, symbol: DirectiveSymbol): RequirementCheck[] {
  const outputLower = output.toLowerCase();
  const checks: RequirementCheck[] = [];

  for (const req of symbol.requirements) {
    let met = false;
    let addedInVersion = 1;

    // Track when requirements were added
    if (req.includes('Jensen Huang')) addedInVersion = 2;
    if (req.includes('EXCEEDED expectations')) addedInVersion = 3;

    // Check each requirement
    if (req.includes('$30.8 billion')) {
      met = outputLower.includes('30.8') || outputLower.includes('$30.8');
    } else if (req.includes('112%')) {
      met = outputLower.includes('112%') || outputLower.includes('112 percent');
    } else if (req.includes('Blackwell')) {
      met = outputLower.includes('blackwell');
    } else if (req.includes('Jensen Huang')) {
      met = outputLower.includes('jensen') || outputLower.includes('huang') || outputLower.includes('ceo');
    } else if (req.includes('EXCEEDED expectations')) {
      met = outputLower.includes('exceeded') || outputLower.includes('beat') || outputLower.includes('surpass');
    } else if (req.includes('AMD') || req.includes('MI300')) {
      met = outputLower.includes('amd') || outputLower.includes('mi300');
    }

    checks.push({ requirement: req, met, addedInVersion });
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLAUDE API
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

interface AgentResult {
  agentId: string;
  agentName: string;
  agentNumber: number;
  phase: 1 | 2 | 3;
  symbolVersion: number;
  symbolHash: string;
  output: string;
  wordCount: number;
  requirementChecks: RequirementCheck[];
  coverageRate: number;
  pickedUpNewReq: boolean;
  pickedUpModifiedReq: boolean;
  tokensUsed: number;
}

async function callAgent(
  agent: AgentSpec,
  agentNumber: number,
  symbol: DirectiveSymbol,
  previousWork: string
): Promise<AgentResult> {
  const phase = agentNumber <= 3 ? 1 : agentNumber <= 6 ? 2 : 3;

  const systemPrompt = `You are ${agent.name} in a multi-agent financial analysis chain.

═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL v${symbol.version} (Hash: ${symbol.hash})
═══════════════════════════════════════════════════════════════════════════════
Symbol ID: ${symbol.symbolId}

WHO:   ${symbol.who}
WHAT:  ${symbol.what}
WHY:   ${symbol.why}
WHERE: ${symbol.where}
WHEN:  ${symbol.when}

COMMANDER'S INTENT:
  "${symbol.commanders_intent}"

REQUIREMENTS (Your output will be validated against these):
${symbol.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

${symbol.changelog.length > 1 ? `
RECENT UPDATES:
${symbol.changelog.slice(-2).map(c => `  v${c.version}: ${c.change}`).join('\n')}
` : ''}
═══════════════════════════════════════════════════════════════════════════════

Your frame: ${agent.frame}
Your topic: ${agent.topic}

Write 150+ words addressing the requirements relevant to your topic.`;

  const userPrompt = `${agent.prompt}

${previousWork ? `\n═══ PREVIOUS WORK ═══\n${previousWork.substring(0, 2000)}\n═════════════════════\n` : ''}

Write your analysis now. Be specific and address the directive requirements.`;

  const response = await anthropic.messages.create({
    model: CONFIG.MODEL,
    max_tokens: CONFIG.MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const output = response.content[0].type === 'text' ? response.content[0].text : '';
  const wordCount = output.split(/\s+/).length;
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  const requirementChecks = checkRequirements(output, symbol);
  const metCount = requirementChecks.filter(r => r.met).length;
  const coverageRate = metCount / requirementChecks.length;

  // Check if agent picked up dynamic updates
  const pickedUpNewReq = requirementChecks.some(r => r.addedInVersion === 2 && r.met);
  const pickedUpModifiedReq = requirementChecks.some(r => r.addedInVersion === 3 && r.met);

  return {
    agentId: agent.id,
    agentName: agent.name,
    agentNumber,
    phase,
    symbolVersion: symbol.version,
    symbolHash: symbol.hash,
    output,
    wordCount,
    requirementChecks,
    coverageRate,
    pickedUpNewReq,
    pickedUpModifiedReq,
    tokensUsed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPERIMENT RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

interface ExperimentResult {
  experimentId: string;
  symbolVersions: { version: number; hash: string; requirements: string[] }[];
  agents: AgentResult[];
  analysis: {
    phase1Coverage: number;
    phase2Coverage: number;
    phase3Coverage: number;
    newReqPickupRate: number;
    modifiedReqPickupRate: number;
  };
}

async function runDynamicExperiment(): Promise<ExperimentResult> {
  const experimentId = `dynamic_${Date.now()}`;

  console.log('\n' + '═'.repeat(80));
  console.log('         DYNAMIC SYMBOL UPDATE EXPERIMENT');
  console.log('═'.repeat(80));
  console.log(`\n  Experiment ID: ${experimentId}`);
  console.log(`  Agents: ${CONFIG.NUM_AGENTS} (3 phases of 3)`);
  console.log('\n  UPDATE SCHEDULE:');
  console.log('    Phase 1 (Agents 1-3): Symbol v1 - Original');
  console.log('    Phase 2 (Agents 4-6): Symbol v2 - NEW requirement added');
  console.log('    Phase 3 (Agents 7-9): Symbol v3 - Requirement MODIFIED');
  console.log('─'.repeat(80));

  // Create initial symbol
  let symbol = createDirectiveSymbol();
  const symbolVersions: { version: number; hash: string; requirements: string[] }[] = [
    { version: 1, hash: symbol.hash, requirements: [...symbol.requirements] }
  ];

  console.log(`\n  📋 Symbol v1 Created: ${symbol.symbolId}`);
  console.log(`     Hash: ${symbol.hash}`);
  console.log(`     Requirements: ${symbol.requirements.length}`);

  const agents: AgentResult[] = [];
  let previousWork = '';

  for (let i = 0; i < AGENTS.length; i++) {
    const agentSpec = AGENTS[i];
    const agentNumber = i + 1;

    // === PHASE TRANSITION: After agent 3, update to v2 ===
    if (agentNumber === 4) {
      console.log('\n' + '═'.repeat(80));
      console.log('  🔄 SYMBOL UPDATE v1 → v2: Adding NEW requirement');
      console.log('═'.repeat(80));

      symbol = updateSymbol(symbol, 'Added CEO quote requirement', (s) => {
        s.requirements.push('MUST reference Jensen Huang CEO guidance on AI demand');
      });

      symbolVersions.push({ version: 2, hash: symbol.hash, requirements: [...symbol.requirements] });

      console.log(`     NEW Hash: ${symbol.hash}`);
      console.log(`     NEW Requirement: "MUST reference Jensen Huang CEO guidance on AI demand"`);
      console.log('─'.repeat(80));
    }

    // === PHASE TRANSITION: After agent 6, update to v3 ===
    if (agentNumber === 7) {
      console.log('\n' + '═'.repeat(80));
      console.log('  🔄 SYMBOL UPDATE v2 → v3: MODIFYING existing requirement');
      console.log('═'.repeat(80));

      symbol = updateSymbol(symbol, 'Modified revenue requirement to include beat', (s) => {
        // Replace the revenue requirement with an enhanced version
        const idx = s.requirements.findIndex(r => r.includes('$30.8 billion'));
        if (idx >= 0) {
          s.requirements[idx] = 'MUST mention Q3 datacenter revenue of $30.8 billion which EXCEEDED expectations';
        }
        // Also add AMD requirement
        s.requirements.push('MUST compare competitive position vs AMD MI300X');
      });

      symbolVersions.push({ version: 3, hash: symbol.hash, requirements: [...symbol.requirements] });

      console.log(`     NEW Hash: ${symbol.hash}`);
      console.log(`     MODIFIED: Revenue requirement now includes "EXCEEDED expectations"`);
      console.log(`     ADDED: AMD MI300X comparison requirement`);
      console.log('─'.repeat(80));
    }

    const phase = agentNumber <= 3 ? 1 : agentNumber <= 6 ? 2 : 3;
    console.log(`\n  📤 Agent ${agentNumber}/9: ${agentSpec.name} (Phase ${phase}, Symbol v${symbol.version})`);

    const result = await callAgent(agentSpec, agentNumber, symbol, previousWork);
    agents.push(result);

    console.log(`  📥 Response: ${result.wordCount} words`);
    console.log(`  📊 Coverage: ${(result.coverageRate * 100).toFixed(0)}% (${result.requirementChecks.filter(r => r.met).length}/${result.requirementChecks.length})`);

    // Show which requirements were met
    for (const check of result.requirementChecks) {
      const status = check.met ? '✓' : '✗';
      const isNew = check.addedInVersion > 1 ? ` [v${check.addedInVersion}]` : '';
      console.log(`       ${status} ${check.requirement.substring(0, 50)}...${isNew}`);
    }

    previousWork += `\n\n=== ${agentSpec.name} ===\n${result.output}`;
  }

  // Calculate analysis
  const phase1Agents = agents.filter(a => a.phase === 1);
  const phase2Agents = agents.filter(a => a.phase === 2);
  const phase3Agents = agents.filter(a => a.phase === 3);

  const phase1Coverage = phase1Agents.reduce((sum, a) => sum + a.coverageRate, 0) / phase1Agents.length;
  const phase2Coverage = phase2Agents.reduce((sum, a) => sum + a.coverageRate, 0) / phase2Agents.length;
  const phase3Coverage = phase3Agents.reduce((sum, a) => sum + a.coverageRate, 0) / phase3Agents.length;

  // How many Phase 2+ agents picked up the NEW requirement (added at v2)?
  const phase2And3Agents = [...phase2Agents, ...phase3Agents];
  const newReqPickupRate = phase2And3Agents.filter(a => a.pickedUpNewReq).length / phase2And3Agents.length;

  // How many Phase 3 agents picked up the MODIFIED requirement?
  const modifiedReqPickupRate = phase3Agents.filter(a => a.pickedUpModifiedReq).length / phase3Agents.length;

  const result: ExperimentResult = {
    experimentId,
    symbolVersions,
    agents,
    analysis: {
      phase1Coverage,
      phase2Coverage,
      phase3Coverage,
      newReqPickupRate,
      modifiedReqPickupRate,
    },
  };

  // Print final report
  printReport(result);

  // Save results
  const fs = await import('fs');
  const filename = `./dynamic-experiment-${experimentId}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`\n📄 Results saved to: ${filename}`);

  return result;
}

function printReport(result: ExperimentResult): void {
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    DYNAMIC UPDATE ANALYSIS REPORT');
  console.log('═'.repeat(80));

  console.log('\n📋 SYMBOL VERSION HISTORY\n');
  for (const v of result.symbolVersions) {
    console.log(`  v${v.version} (${v.hash}):`);
    for (const req of v.requirements) {
      console.log(`    • ${req.substring(0, 60)}...`);
    }
    console.log('');
  }

  console.log('📊 COVERAGE BY PHASE\n');
  console.log('  Phase 1 (v1, Agents 1-3): ' + '█'.repeat(Math.round(result.analysis.phase1Coverage * 20)) +
              ' ' + (result.analysis.phase1Coverage * 100).toFixed(0) + '%');
  console.log('  Phase 2 (v2, Agents 4-6): ' + '█'.repeat(Math.round(result.analysis.phase2Coverage * 20)) +
              ' ' + (result.analysis.phase2Coverage * 100).toFixed(0) + '%');
  console.log('  Phase 3 (v3, Agents 7-9): ' + '█'.repeat(Math.round(result.analysis.phase3Coverage * 20)) +
              ' ' + (result.analysis.phase3Coverage * 100).toFixed(0) + '%');

  console.log('\n🔄 DYNAMIC UPDATE PICKUP RATES\n');
  console.log(`  NEW requirement (v2) picked up by Phase 2+3 agents: ${(result.analysis.newReqPickupRate * 100).toFixed(0)}%`);
  console.log(`  MODIFIED requirement (v3) picked up by Phase 3 agents: ${(result.analysis.modifiedReqPickupRate * 100).toFixed(0)}%`);

  console.log('\n📈 PER-AGENT BREAKDOWN\n');
  console.log('  Agent                  Phase  Version  Coverage  New Req  Modified');
  console.log('─'.repeat(75));

  for (const agent of result.agents) {
    console.log(
      `  ${agent.agentName.padEnd(20)} ${agent.phase}      v${agent.symbolVersion}       ` +
      `${(agent.coverageRate * 100).toFixed(0).padStart(3)}%      ` +
      `${agent.pickedUpNewReq ? '✓' : '—'}        ` +
      `${agent.pickedUpModifiedReq ? '✓' : '—'}`
    );
  }

  console.log('\n💡 INTERPRETATION\n');

  if (result.analysis.newReqPickupRate > 0.5) {
    console.log('  ✅ NEW REQUIREMENT ADOPTION: Majority of Phase 2+3 agents picked up the v2 requirement');
  } else {
    console.log('  ⚠️ NEW REQUIREMENT ADOPTION: Less than half of agents picked up the v2 requirement');
  }

  if (result.analysis.modifiedReqPickupRate > 0.5) {
    console.log('  ✅ MODIFIED REQUIREMENT ADOPTION: Majority of Phase 3 agents picked up the v3 modification');
  } else {
    console.log('  ⚠️ MODIFIED REQUIREMENT ADOPTION: Phase 3 agents struggled with the v3 modification');
  }

  const avgCoverage = (result.analysis.phase1Coverage + result.analysis.phase2Coverage + result.analysis.phase3Coverage) / 3;
  if (avgCoverage > 0.7) {
    console.log('  ✅ OVERALL: Dynamic symbol updates are being propagated successfully');
  } else {
    console.log('  ⚠️ OVERALL: Symbol updates need stronger enforcement in prompts');
  }

  console.log('\n' + '═'.repeat(80));
  console.log('                    END OF REPORT');
  console.log('═'.repeat(80));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

runDynamicExperiment().catch(console.error);
