#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DRIFT DETECTION EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests symbol grounding with:
 * 1. LONG agent chains (12-100+ agents)
 * 2. AMBIGUOUS tasks (not structured benchmarks)
 * 3. MID-CHAIN live updates
 * 4. Runs until DRIFT DETECTED or 1000 turns
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 400,
  MAX_AGENTS: 100,
  DRIFT_THRESHOLD: 0.30,  // Stop when 30% drift detected
  CHECK_INTERVAL: 5,       // Check drift every 5 agents
  UPDATE_AT_AGENT: 15,     // Inject update at agent 15
};

// ═══════════════════════════════════════════════════════════════════════════════
// AMBIGUOUS TASKS (Not structured benchmarks)
// ═══════════════════════════════════════════════════════════════════════════════

interface AmbiguousTask {
  id: string;
  description: string;  // Vague starting point
  hiddenRequirements: string[];  // What we're tracking (agents don't see these)
  keyFacts: string[];  // Specific facts that should persist
  updateAt15: {
    change: string;
    newFact: string;
  };
}

const TASKS: AmbiguousTask[] = [
  {
    id: 'INVESTMENT',
    description: 'Research the semiconductor company NVIDIA and provide investment insights.',
    hiddenRequirements: [
      'Mention datacenter revenue',
      'Discuss AI/GPU business',
      'Reference competition (AMD/Intel)',
      'Note geographic risks (China)',
      'Include valuation perspective',
    ],
    keyFacts: [
      '$30.8 billion datacenter revenue',
      'Blackwell GPU architecture',
      'Jensen Huang CEO',
      '75% gross margin',
      'China export restrictions',
    ],
    updateAt15: {
      change: 'URGENT: New earnings just released - Q4 guidance lowered by 15%',
      newFact: 'Q4 guidance reduced 15%',
    },
  },
  {
    id: 'CLIMATE',
    description: 'Analyze global climate change impacts and mitigation strategies.',
    hiddenRequirements: [
      'Mention temperature targets (1.5°C/2°C)',
      'Discuss renewable energy',
      'Reference economic costs',
      'Note policy frameworks (Paris Agreement)',
      'Include regional variations',
    ],
    keyFacts: [
      '1.5 degrees Celsius target',
      'Paris Agreement 2015',
      '197 countries signed',
      'Net zero by 2050',
      '$100 billion climate finance',
    ],
    keyFacts: [
      '1.5 degrees Celsius target',
      'Paris Agreement 2015',
      'Net zero by 2050',
    ],
    updateAt15: {
      change: 'BREAKING: New IPCC report shows 1.5°C will be exceeded by 2030',
      newFact: '1.5C exceeded by 2030',
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTIVE SYMBOL
// ═══════════════════════════════════════════════════════════════════════════════

interface DirectiveSymbol {
  symbolId: string;
  version: number;
  hash: string;
  task: string;
  requirements: string[];
  keyFacts: string[];
  constraints: string[];
  commanders_intent: string;
  updates: string[];
}

function createSymbol(task: AmbiguousTask): DirectiveSymbol {
  const symbol: DirectiveSymbol = {
    symbolId: `Ξ.TASK.${task.id}.001`,
    version: 1,
    hash: '',
    task: task.description,
    requirements: [
      'Provide comprehensive analysis',
      'Include specific data points and numbers',
      'Address multiple perspectives',
      'Cite sources where possible',
      'Maintain factual accuracy throughout',
    ],
    keyFacts: task.keyFacts,
    constraints: [
      'MUST reference ALL key facts in final output',
      'MUST maintain consistency with previous analysis',
      'MUST NOT contradict established facts',
    ],
    commanders_intent: 'Produce thorough, accurate analysis that preserves ALL key information through the entire chain',
    updates: [],
  };
  symbol.hash = createHash('sha256').update(JSON.stringify(symbol)).digest('hex').substring(0, 12);
  return symbol;
}

function updateSymbol(symbol: DirectiveSymbol, update: string, newFact: string): DirectiveSymbol {
  const updated = { ...symbol };
  updated.version += 1;
  updated.updates.push(update);
  updated.keyFacts.push(newFact);
  updated.hash = createHash('sha256').update(JSON.stringify(updated)).digest('hex').substring(0, 12);
  return updated;
}

function formatSymbol(symbol: DirectiveSymbol): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL: ${symbol.symbolId} (v${symbol.version}, hash: ${symbol.hash})
═══════════════════════════════════════════════════════════════════════════════

TASK: ${symbol.task}

KEY FACTS (MUST ALL appear in final output):
${symbol.keyFacts.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

CONSTRAINTS:
${symbol.constraints.map(c => `  - ${c}`).join('\n')}

COMMANDER'S INTENT: "${symbol.commanders_intent}"

${symbol.updates.length > 0 ? `
UPDATES (v${symbol.version}):
${symbol.updates.map(u => `  ⚡ ${u}`).join('\n')}
` : ''}
═══════════════════════════════════════════════════════════════════════════════`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIFT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

interface DriftMetrics {
  agentNumber: number;
  factsPreserved: number;
  factsTotal: number;
  factsMissing: string[];
  driftScore: number;
  updatePickedUp: boolean;
}

function measureDrift(output: string, symbol: DirectiveSymbol, agentNumber: number): DriftMetrics {
  const outputLower = output.toLowerCase();
  const factsTotal = symbol.keyFacts.length;
  const factsMissing: string[] = [];

  for (const fact of symbol.keyFacts) {
    // Extract key components from fact
    const factWords = fact.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3);
    const matchCount = factWords.filter(w => outputLower.includes(w)).length;

    if (matchCount < factWords.length * 0.4) {
      factsMissing.push(fact);
    }
  }

  const factsPreserved = factsTotal - factsMissing.length;
  const driftScore = factsMissing.length / factsTotal;

  // Check if update was picked up (if we're past agent 15)
  let updatePickedUp = true;
  if (agentNumber > CONFIG.UPDATE_AT_AGENT && symbol.updates.length > 0) {
    const updateKeywords = symbol.updates[0].toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const updateMatches = updateKeywords.filter(w => outputLower.includes(w)).length;
    updatePickedUp = updateMatches >= updateKeywords.length * 0.3;
  }

  return {
    agentNumber,
    factsPreserved,
    factsTotal,
    factsMissing,
    driftScore,
    updatePickedUp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CHAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

interface ChainResult {
  condition: 'with_symbol' | 'without_symbol';
  task: AmbiguousTask;
  agentsRun: number;
  driftHistory: DriftMetrics[];
  driftDetectedAt: number | null;
  updatePickedUpAt: number | null;
  finalDrift: number;
  outputs: string[];
}

async function runChain(
  task: AmbiguousTask,
  withSymbol: boolean,
  maxAgents: number,
  onProgress: (agent: number, drift: number) => void
): Promise<ChainResult> {
  let symbol = createSymbol(task);
  const driftHistory: DriftMetrics[] = [];
  const outputs: string[] = [];
  let previousWork = '';
  let driftDetectedAt: number | null = null;
  let updatePickedUpAt: number | null = null;

  for (let agent = 1; agent <= maxAgents; agent++) {
    // Mid-chain update at agent 15
    if (agent === CONFIG.UPDATE_AT_AGENT && withSymbol) {
      symbol = updateSymbol(symbol, task.updateAt15.change, task.updateAt15.newFact);
      console.log(`      ⚡ Symbol updated at agent ${agent}: ${task.updateAt15.change.substring(0, 40)}...`);
    }

    // Build prompt
    let systemPrompt: string;
    let userPrompt: string;

    if (withSymbol) {
      systemPrompt = `You are Agent ${agent} in an analysis chain.

${formatSymbol(symbol)}

Your task: Continue the analysis, building on previous work.
CRITICAL: Preserve ALL key facts. Reference them explicitly.`;

      userPrompt = agent === 1
        ? 'Begin the analysis. Address all key facts.'
        : `Previous analysis:\n${previousWork.substring(previousWork.length - 1500)}\n\nContinue, ensuring ALL key facts remain present.`;
    } else {
      systemPrompt = `You are Agent ${agent} in an analysis chain. Continue the research.`;

      userPrompt = agent === 1
        ? `Research task: ${task.description}\n\nBegin the analysis.`
        : `Previous analysis:\n${previousWork.substring(previousWork.length - 1500)}\n\nContinue the analysis.`;

      // For without_symbol, inject update as user message at agent 15
      if (agent === CONFIG.UPDATE_AT_AGENT) {
        userPrompt = `BREAKING UPDATE: ${task.updateAt15.change}\n\n${userPrompt}`;
        console.log(`      ⚡ Update injected at agent ${agent} (no symbol)`);
      }
    }

    // Call API
    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    outputs.push(output);
    previousWork += `\n=== Agent ${agent} ===\n${output}`;

    // Measure drift every CHECK_INTERVAL agents
    if (agent % CONFIG.CHECK_INTERVAL === 0 || agent === 1) {
      const metrics = measureDrift(previousWork, symbol, agent);
      driftHistory.push(metrics);

      onProgress(agent, metrics.driftScore);

      // Check if update was picked up
      if (agent > CONFIG.UPDATE_AT_AGENT && metrics.updatePickedUp && !updatePickedUpAt) {
        updatePickedUpAt = agent;
      }

      // Check if drift threshold exceeded
      if (metrics.driftScore >= CONFIG.DRIFT_THRESHOLD && !driftDetectedAt) {
        driftDetectedAt = agent;
        console.log(`      🚨 DRIFT THRESHOLD REACHED at agent ${agent}: ${(metrics.driftScore * 100).toFixed(0)}%`);
      }
    }
  }

  // Final drift measurement
  const finalMetrics = measureDrift(previousWork, symbol, maxAgents);

  return {
    condition: withSymbol ? 'with_symbol' : 'without_symbol',
    task,
    agentsRun: maxAgents,
    driftHistory,
    driftDetectedAt,
    updatePickedUpAt,
    finalDrift: finalMetrics.driftScore,
    outputs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPERIMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         DRIFT DETECTION EXPERIMENT');
  console.log('═'.repeat(80));
  console.log('\n  Configuration:');
  console.log(`    Max Agents: ${CONFIG.MAX_AGENTS}`);
  console.log(`    Drift Threshold: ${CONFIG.DRIFT_THRESHOLD * 100}%`);
  console.log(`    Update Injection: Agent ${CONFIG.UPDATE_AT_AGENT}`);
  console.log(`    Check Interval: Every ${CONFIG.CHECK_INTERVAL} agents\n`);

  const results: ChainResult[] = [];
  const task = TASKS[0];  // Use INVESTMENT task

  console.log(`  Task: ${task.id}`);
  console.log(`  Description: ${task.description.substring(0, 60)}...`);
  console.log(`  Key Facts to Track: ${task.keyFacts.length}`);
  console.log(`  Update at Agent 15: ${task.updateAt15.change.substring(0, 40)}...\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // RUN WITHOUT SYMBOL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('  ' + '─'.repeat(70));
  console.log('  CONDITION 1: WITHOUT Symbol Registry');
  console.log('  ' + '─'.repeat(70));

  const woResult = await runChain(task, false, CONFIG.MAX_AGENTS, (agent, drift) => {
    const bar = '█'.repeat(Math.floor(drift * 20)) + '░'.repeat(20 - Math.floor(drift * 20));
    console.log(`    Agent ${String(agent).padStart(3)}: Drift [${bar}] ${(drift * 100).toFixed(0)}%`);
  });
  results.push(woResult);

  console.log(`\n    Final Drift: ${(woResult.finalDrift * 100).toFixed(0)}%`);
  console.log(`    Drift Detected At: ${woResult.driftDetectedAt || 'Never'}`);
  console.log(`    Update Picked Up At: ${woResult.updatePickedUpAt || 'Never'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // RUN WITH SYMBOL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n  ' + '─'.repeat(70));
  console.log('  CONDITION 2: WITH Symbol Registry');
  console.log('  ' + '─'.repeat(70));

  const wResult = await runChain(task, true, CONFIG.MAX_AGENTS, (agent, drift) => {
    const bar = '█'.repeat(Math.floor(drift * 20)) + '░'.repeat(20 - Math.floor(drift * 20));
    console.log(`    Agent ${String(agent).padStart(3)}: Drift [${bar}] ${(drift * 100).toFixed(0)}%`);
  });
  results.push(wResult);

  console.log(`\n    Final Drift: ${(wResult.finalDrift * 100).toFixed(0)}%`);
  console.log(`    Drift Detected At: ${wResult.driftDetectedAt || 'Never'}`);
  console.log(`    Update Picked Up At: ${wResult.updatePickedUpAt || 'Never'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    DRIFT ANALYSIS');
  console.log('═'.repeat(80));

  console.log('\n  DRIFT PROGRESSION:');
  console.log('  Agent    Without Symbol    With Symbol    Delta');
  console.log('  ' + '─'.repeat(55));

  // Align drift histories
  const maxLen = Math.max(woResult.driftHistory.length, wResult.driftHistory.length);
  for (let i = 0; i < maxLen; i++) {
    const wo = woResult.driftHistory[i];
    const w = wResult.driftHistory[i];

    if (wo && w) {
      const delta = wo.driftScore - w.driftScore;
      console.log(
        `  ${String(wo.agentNumber).padStart(5)}    ` +
        `${(wo.driftScore * 100).toFixed(0).padStart(5)}%             ` +
        `${(w.driftScore * 100).toFixed(0).padStart(5)}%          ` +
        `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`
      );
    }
  }

  console.log('\n  SUMMARY:');
  console.log('                              Without Symbol   With Symbol');
  console.log('  ' + '─'.repeat(55));
  console.log(`  Final Drift:                ${(woResult.finalDrift * 100).toFixed(0)}%               ${(wResult.finalDrift * 100).toFixed(0)}%`);
  console.log(`  Drift Detected At:          Agent ${woResult.driftDetectedAt || 'N/A'}          Agent ${wResult.driftDetectedAt || 'N/A'}`);
  console.log(`  Update Picked Up At:        Agent ${woResult.updatePickedUpAt || 'N/A'}          Agent ${wResult.updatePickedUpAt || 'N/A'}`);

  const improvement = woResult.finalDrift - wResult.finalDrift;
  if (improvement > 0.1) {
    console.log(`\n  ✅ Symbol registry REDUCED drift by ${(improvement * 100).toFixed(0)}%`);
  } else if (improvement > 0) {
    console.log(`\n  ⚡ Symbol registry showed modest improvement: ${(improvement * 100).toFixed(0)}%`);
  } else {
    console.log(`\n  ❌ Symbol registry did not improve drift resistance`);
  }

  // Check update pickup
  if (wResult.updatePickedUpAt && !woResult.updatePickedUpAt) {
    console.log(`  ✅ Symbol registry PRESERVED mid-chain update`);
  } else if (wResult.updatePickedUpAt && woResult.updatePickedUpAt) {
    if (wResult.updatePickedUpAt <= woResult.updatePickedUpAt) {
      console.log(`  ✅ Symbol registry picked up update faster (agent ${wResult.updatePickedUpAt} vs ${woResult.updatePickedUpAt})`);
    }
  }

  console.log('\n' + '═'.repeat(80));

  // Save results
  const output = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    task: {
      id: task.id,
      description: task.description,
      keyFacts: task.keyFacts,
      update: task.updateAt15,
    },
    results: results.map(r => ({
      condition: r.condition,
      agentsRun: r.agentsRun,
      driftHistory: r.driftHistory,
      driftDetectedAt: r.driftDetectedAt,
      updatePickedUpAt: r.updatePickedUpAt,
      finalDrift: r.finalDrift,
    })),
    summary: {
      woFinalDrift: woResult.finalDrift,
      wFinalDrift: wResult.finalDrift,
      improvement,
      woUpdatePickedUp: !!woResult.updatePickedUpAt,
      wUpdatePickedUp: !!wResult.updatePickedUpAt,
    },
  };

  fs.writeFileSync('./drift-detection-results.json', JSON.stringify(output, null, 2));
  console.log('\n📄 Results saved to: ./drift-detection-results.json');
}

main().catch(console.error);
