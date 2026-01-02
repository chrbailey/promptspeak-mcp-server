#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SINGLE VARIABLE TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Isolate which symbol components matter most by changing ONE variable at a time:
 *
 * Test 1: Change ONLY commander's intent at 1/3
 * Test 2: Change ONLY a constraint at 1/3
 * Test 3: Change ONLY the frame at 1/3
 * Test 4: Change ONLY the "why" at 1/3
 *
 * Compare pickup rates to see which changes agents are most sensitive to.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 600,
  AGENTS_PER_TEST: 6,  // 3 before change, 3 after
};

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
  };
  commanders_intent: string;
  requirements: string[];
}

function createBaseSymbol(): DirectiveSymbol {
  const content = {
    frame: '⊕◊▼α',
    who: 'Investment Committee',
    what: 'NVIDIA quarterly analysis',
    why: 'Position evaluation',
    where: 'NVIDIA (NVDA)',
    when: 'Q3 FY25',
    how: {
      focus: ['revenue', 'margins'],
      constraints: ['cite_numbers', 'be_concise'],
    },
    commanders_intent: 'Determine if we should maintain overweight position',
    requirements: [
      'MUST mention $30.8 billion datacenter revenue',
      'MUST discuss Blackwell transition',
    ],
  };

  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 12);

  return {
    symbolId: `Ξ.TEST.${Date.now()}`,
    version: 1,
    hash,
    ...content,
  };
}

const anthropic = new Anthropic();

interface TestResult {
  testName: string;
  variableChanged: string;
  beforeValue: string;
  afterValue: string;
  beforeAgentsMet: number;
  afterAgentsMet: number;
  pickupRate: number;
  agentDetails: { agent: number; sawChange: boolean; mentioned: boolean }[];
}

async function runSingleVariableTest(
  testName: string,
  variableChanged: string,
  beforeValue: string,
  afterValue: string,
  mutator: (s: DirectiveSymbol) => void,
  detector: (output: string) => boolean
): Promise<TestResult> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  TEST: ${testName}`);
  console.log(`  Variable: ${variableChanged}`);
  console.log(`  Before: "${beforeValue.substring(0, 40)}..."`);
  console.log(`  After:  "${afterValue.substring(0, 40)}..."`);
  console.log('─'.repeat(70));

  let symbol = createBaseSymbol();
  const agentDetails: { agent: number; sawChange: boolean; mentioned: boolean }[] = [];
  let previousWork = '';

  const agents = [
    { id: 'analyst1', prompt: 'Analyze datacenter revenue trends.' },
    { id: 'analyst2', prompt: 'Analyze margin and profitability.' },
    { id: 'analyst3', prompt: 'Analyze competitive positioning.' },
    { id: 'analyst4', prompt: 'Analyze supply chain factors.' },
    { id: 'analyst5', prompt: 'Analyze risk factors.' },
    { id: 'analyst6', prompt: 'Synthesize and recommend.' },
  ];

  for (let i = 0; i < CONFIG.AGENTS_PER_TEST; i++) {
    // Apply mutation at the 1/3 mark (after agent 2)
    const sawChange = i >= 3;
    if (i === 3) {
      mutator(symbol);
      symbol.version = 2;
      symbol.hash = createHash('sha256').update(JSON.stringify(symbol)).digest('hex').substring(0, 12);
      console.log(`  🔄 VARIABLE CHANGED at agent 4`);
    }

    const agent = agents[i];

    const systemPrompt = `You are Analyst ${i + 1}.

DIRECTIVE SYMBOL v${symbol.version}:
  Frame: ${symbol.frame}
  Who: ${symbol.who}
  Why: ${symbol.why}
  Commander's Intent: "${symbol.commanders_intent}"
  Constraints: ${symbol.how.constraints.join(', ')}
  Requirements: ${symbol.requirements.join('; ')}

Write 100+ words for your analysis. Address the intent and constraints.`;

    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: agent.prompt + (previousWork ? `\n\nPrevious: ${previousWork.substring(0, 500)}` : '') }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    const mentioned = detector(output);

    agentDetails.push({ agent: i + 1, sawChange, mentioned });
    previousWork += `\n${output.substring(0, 200)}`;

    const status = sawChange ? (mentioned ? '✓ Picked up' : '✗ Missed') : 'N/A (before change)';
    console.log(`  Agent ${i + 1}: ${status}`);
  }

  const afterAgents = agentDetails.filter(a => a.sawChange);
  const afterAgentsMet = afterAgents.filter(a => a.mentioned).length;
  const pickupRate = afterAgentsMet / afterAgents.length;

  return {
    testName,
    variableChanged,
    beforeValue,
    afterValue,
    beforeAgentsMet: agentDetails.filter(a => !a.sawChange).length,
    afterAgentsMet,
    pickupRate,
    agentDetails,
  };
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('         SINGLE VARIABLE ISOLATION TESTS');
  console.log('═'.repeat(70));

  const results: TestResult[] = [];

  // Test 1: Change commander's intent
  results.push(await runSingleVariableTest(
    'Commander Intent Change',
    'commanders_intent',
    'Determine if we should maintain overweight position',
    'Determine if we should REDUCE position due to margin concerns',
    (s) => { s.commanders_intent = 'Determine if we should REDUCE position due to margin concerns'; },
    (output) => output.toLowerCase().includes('reduce') || output.toLowerCase().includes('decrease') || output.toLowerCase().includes('underweight')
  ));

  // Test 2: Change a constraint
  results.push(await runSingleVariableTest(
    'Constraint Change',
    'constraints',
    'be_concise',
    'express_uncertainty_explicitly',
    (s) => { s.how.constraints = ['cite_numbers', 'express_uncertainty_explicitly']; },
    (output) => output.toLowerCase().includes('uncertain') || output.toLowerCase().includes('unclear') || output.toLowerCase().includes('risk') || output.toLowerCase().includes('may')
  ));

  // Test 3: Change the frame (mode)
  results.push(await runSingleVariableTest(
    'Frame Change (Mode)',
    'frame',
    '⊕◊▼α (strict)',
    '⊖◊▼α (flexible)',
    (s) => { s.frame = '⊖◊▼α'; },
    (output) => output.toLowerCase().includes('flexible') || output.toLowerCase().includes('consider') || output.toLowerCase().includes('option') || output.length > 400
  ));

  // Test 4: Change the "why"
  results.push(await runSingleVariableTest(
    'Why Change',
    'why',
    'Position evaluation',
    'URGENT: Earnings call tomorrow - need talking points',
    (s) => { s.why = 'URGENT: Earnings call tomorrow - need talking points'; },
    (output) => output.toLowerCase().includes('urgent') || output.toLowerCase().includes('earnings') || output.toLowerCase().includes('call') || output.toLowerCase().includes('talking')
  ));

  // Print summary
  console.log('\n\n' + '═'.repeat(70));
  console.log('                    SINGLE VARIABLE TEST RESULTS');
  console.log('═'.repeat(70));

  console.log('\n  Variable Changed              Pickup Rate    Interpretation');
  console.log('─'.repeat(70));

  for (const r of results) {
    const rate = (r.pickupRate * 100).toFixed(0) + '%';
    const interpretation = r.pickupRate > 0.66 ? '✅ Strong' : r.pickupRate > 0.33 ? '⚠️ Moderate' : '❌ Weak';
    console.log(`  ${r.variableChanged.padEnd(28)} ${rate.padStart(8)}       ${interpretation}`);
  }

  console.log('\n💡 SENSITIVITY RANKING:\n');

  const sorted = [...results].sort((a, b) => b.pickupRate - a.pickupRate);
  sorted.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.variableChanged}: ${(r.pickupRate * 100).toFixed(0)}% pickup rate`);
  });

  console.log('\n' + '═'.repeat(70));

  // Save results
  const fs = await import('fs');
  fs.writeFileSync('./single-variable-results.json', JSON.stringify(results, null, 2));
  console.log('\n📄 Results saved to: ./single-variable-results.json');
}

main().catch(console.error);
