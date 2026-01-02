#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEEPSEARCHQA BENCHMARK EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests PromptSpeak symbol grounding against the Google DeepSearchQA benchmark.
 *
 * These questions are PERFECT for testing because:
 * 1. Each question has multiple compound requirements
 * 2. Missing ANY requirement = wrong answer
 * 3. Ground truth answers exist for validation
 *
 * Architecture:
 * - Convert each question into a PromptSpeak directive symbol
 * - Break question into explicit requirements
 * - Run multi-agent chain WITH and WITHOUT symbols
 * - Measure answer accuracy
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
  MAX_TOKENS: 1000,
  NUM_AGENTS: 4,  // Decomposer → Researcher 1 → Researcher 2 → Synthesizer
  QUESTIONS_TO_TEST: 5,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEEPSEARCHQA QUESTIONS (from the dataset)
// ═══════════════════════════════════════════════════════════════════════════════

interface DeepSearchQuestion {
  problem: string;
  problem_category: string;
  answer: string;
  answer_type: string;
  // Derived fields
  requirements: string[];
  key_constraints: string[];
}

// Pre-parsed questions with explicit requirements
const QUESTIONS: DeepSearchQuestion[] = [
  {
    problem: "Consider the OECD countries whose total population was composed of at least 20% of foreign-born populations as of 2023 (according to the Observatory of Migration at the university of Oxford). Amongst them, which country saw their overall criminality score increase by at least +0.2 point between 2021 and 2023 and their resilience score decrease by more than 0.3 between these same dates (according to the Organised Crime Index)?",
    problem_category: "Politics & Government",
    answer: "New Zealand",
    answer_type: "Single Answer",
    requirements: [
      "MUST filter for OECD countries only",
      "MUST require ≥20% foreign-born population as of 2023",
      "MUST use Observatory of Migration (Oxford) as source",
      "MUST find criminality score increase of ≥+0.2 points (2021-2023)",
      "MUST find resilience score decrease of >0.3 (2021-2023)",
      "MUST use Organised Crime Index as source",
    ],
    key_constraints: ["20%", "0.2", "0.3", "2021", "2023", "OECD"],
  },
  {
    problem: "Of the countries that were part of the top 10 countries with the lowest GPI scores in both 2022 and 2023 (according to Vision of Humanity), which countries had a reported gun homicide rate of less than 0.20 per 100,000 population in both 2022 and 2023 (according to World Population Review)? Only provide the country names.",
    problem_category: "Geography",
    answer: "Austria, Switzerland, Singapore",
    answer_type: "Set Answer",
    requirements: [
      "MUST identify top 10 lowest GPI score countries for 2022",
      "MUST identify top 10 lowest GPI score countries for 2023",
      "MUST find countries in BOTH lists (intersection)",
      "MUST check gun homicide rate <0.20 per 100k for 2022",
      "MUST check gun homicide rate <0.20 per 100k for 2023",
      "MUST use Vision of Humanity for GPI",
      "MUST use World Population Review for gun stats",
    ],
    key_constraints: ["top 10", "GPI", "0.20", "100,000", "2022", "2023"],
  },
  {
    problem: "I'd like you to analyze the top five universities in Mexico for 2021-2022, according to the Center for World University Rankings. Identify the city in which each of the top five is based, and tell me, using World Population Review's 2022 population figures, the name of the university located in the least-populated city.",
    problem_category: "Education",
    answer: "Autonomous University of San Luis Potosí",
    answer_type: "Single Answer",
    requirements: [
      "MUST identify top 5 universities in Mexico for 2021-2022",
      "MUST use Center for World University Rankings as source",
      "MUST identify the city for each of the top 5 universities",
      "MUST look up population of each city using World Population Review 2022",
      "MUST compare populations to find the least-populated city",
      "MUST return the university name (not the city name)",
    ],
    key_constraints: ["top five", "2021-2022", "Mexico", "least-populated", "2022"],
  },
  {
    problem: "According to the 2016, 2017, and 2018 Director's Annual Reports published by the Toronto District School board, which year saw the largest percent change decrease in the number of secondary school students?",
    problem_category: "Education",
    answer: "2018",
    answer_type: "Single Answer",
    requirements: [
      "MUST use Director's Annual Reports from TDSB",
      "MUST examine years 2016, 2017, and 2018 specifically",
      "MUST focus on secondary school students (not elementary)",
      "MUST calculate percent change for each year",
      "MUST find the DECREASE (not increase)",
      "MUST identify the LARGEST decrease",
    ],
    key_constraints: ["2016", "2017", "2018", "Toronto", "secondary", "percent change", "decrease"],
  },
  {
    problem: "Which champion was picked most often by the losing team's top laner in the 2013 North American League Championship Series Summer Finals?",
    problem_category: "Other",
    answer: "Karthus",
    answer_type: "Single Answer",
    requirements: [
      "MUST focus on 2013 NA LCS Summer Finals specifically",
      "MUST look at LOSING team only (not winning team)",
      "MUST look at TOP LANER position only (not other roles)",
      "MUST count champion picks across all games",
      "MUST identify the MOST picked champion",
    ],
    key_constraints: ["2013", "NA LCS", "Summer Finals", "losing team", "top laner", "most often"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DIRECTIVE SYMBOL
// ═══════════════════════════════════════════════════════════════════════════════

interface DirectiveSymbol {
  symbolId: string;
  hash: string;
  frame: string;
  question: string;
  category: string;
  expected_answer: string;
  requirements: string[];
  key_constraints: string[];
  commanders_intent: string;
}

function createSymbolFromQuestion(q: DeepSearchQuestion, index: number): DirectiveSymbol {
  const content = {
    question: q.problem,
    category: q.problem_category,
    expected_answer: q.answer,
    requirements: q.requirements,
    key_constraints: q.key_constraints,
  };

  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);

  return {
    symbolId: `Ξ.DEEPSEARCH.Q${index + 1}.${Date.now()}`,
    hash,
    frame: '⊕◊▼α',  // Strict, research, delegate, primary
    question: q.problem,
    category: q.problem_category,
    expected_answer: q.answer,
    requirements: q.requirements,
    key_constraints: q.key_constraints,
    commanders_intent: `Find the exact answer by satisfying ALL ${q.requirements.length} requirements. Missing ANY requirement will produce wrong answer.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentSpec {
  id: string;
  name: string;
  role: string;
}

const AGENTS: AgentSpec[] = [
  {
    id: 'decomposer',
    name: 'Question Decomposer',
    role: 'Break down the question into sub-questions and identify what data sources are needed.',
  },
  {
    id: 'researcher1',
    name: 'Primary Researcher',
    role: 'Research the first half of requirements and gather specific data points.',
  },
  {
    id: 'researcher2',
    name: 'Secondary Researcher',
    role: 'Research the remaining requirements and cross-reference with previous findings.',
  },
  {
    id: 'synthesizer',
    name: 'Answer Synthesizer',
    role: 'Combine all research to produce the final answer that satisfies ALL requirements.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ANSWER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

function validateAnswer(produced: string, expected: string, answerType: string): {
  correct: boolean;
  explanation: string;
} {
  const producedLower = produced.toLowerCase().trim();
  const expectedLower = expected.toLowerCase().trim();

  if (answerType === 'Single Answer') {
    // Check if the expected answer appears in the produced output
    const correct = producedLower.includes(expectedLower);
    return {
      correct,
      explanation: correct
        ? `✓ Found "${expected}" in output`
        : `✗ Expected "${expected}", not found in output`,
    };
  } else {
    // Set Answer - check if all expected items are present
    const expectedItems = expected.split(',').map(s => s.trim().toLowerCase());
    const foundItems = expectedItems.filter(item => producedLower.includes(item));
    const correct = foundItems.length === expectedItems.length;
    return {
      correct,
      explanation: correct
        ? `✓ Found all ${expectedItems.length} items`
        : `✗ Found ${foundItems.length}/${expectedItems.length} items`,
    };
  }
}

function checkRequirementMentions(output: string, requirements: string[]): {
  mentioned: number;
  total: number;
  details: string[];
} {
  const outputLower = output.toLowerCase();
  const details: string[] = [];
  let mentioned = 0;

  for (const req of requirements) {
    // Extract key terms from requirement
    const keyTerms = req.match(/\b\w{4,}\b/g) || [];
    const matchedTerms = keyTerms.filter(term =>
      outputLower.includes(term.toLowerCase())
    );

    const isMentioned = matchedTerms.length >= keyTerms.length * 0.4;
    if (isMentioned) {
      mentioned++;
      details.push(`✓ ${req.substring(0, 40)}...`);
    } else {
      details.push(`✗ ${req.substring(0, 40)}...`);
    }
  }

  return { mentioned, total: requirements.length, details };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN RUNNERS
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

interface ChainResult {
  condition: 'with_symbols' | 'without_symbols';
  questionIndex: number;
  question: string;
  expectedAnswer: string;
  producedAnswer: string;
  answerCorrect: boolean;
  requirementsMentioned: number;
  requirementsTotal: number;
  agentOutputs: string[];
  totalTokens: number;
}

async function runChainWithoutSymbols(q: DeepSearchQuestion, qIndex: number): Promise<ChainResult> {
  let previousWork = '';
  const agentOutputs: string[] = [];
  let totalTokens = 0;

  for (const agent of AGENTS) {
    const systemPrompt = `You are ${agent.name}. ${agent.role}
Provide specific, factual analysis. Be concise but thorough.`;

    const userPrompt = agent.id === 'decomposer'
      ? `Question: ${q.problem}\n\nDecompose this into sub-questions.`
      : `Continue researching:\n\n${previousWork}\n\nYour role: ${agent.role}`;

    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    agentOutputs.push(output);
    totalTokens += response.usage.input_tokens + response.usage.output_tokens;
    previousWork += `\n\n=== ${agent.name} ===\n${output}`;
  }

  const finalOutput = agentOutputs[agentOutputs.length - 1];
  const validation = validateAnswer(finalOutput, q.answer, q.answer_type);
  const reqCheck = checkRequirementMentions(agentOutputs.join('\n'), q.requirements);

  return {
    condition: 'without_symbols',
    questionIndex: qIndex,
    question: q.problem.substring(0, 80) + '...',
    expectedAnswer: q.answer,
    producedAnswer: finalOutput.substring(0, 200),
    answerCorrect: validation.correct,
    requirementsMentioned: reqCheck.mentioned,
    requirementsTotal: reqCheck.total,
    agentOutputs,
    totalTokens,
  };
}

async function runChainWithSymbols(q: DeepSearchQuestion, qIndex: number): Promise<ChainResult> {
  const symbol = createSymbolFromQuestion(q, qIndex);
  let previousWork = '';
  const agentOutputs: string[] = [];
  let totalTokens = 0;

  for (const agent of AGENTS) {
    const systemPrompt = `You are ${agent.name}. ${agent.role}

═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL (IMMUTABLE - Reference this throughout)
═══════════════════════════════════════════════════════════════════════════════
Symbol ID: ${symbol.symbolId}
Hash: ${symbol.hash}
Category: ${symbol.category}

QUESTION:
${symbol.question}

REQUIREMENTS (ALL must be satisfied for correct answer):
${symbol.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

KEY CONSTRAINTS (Must appear in reasoning):
${symbol.key_constraints.join(', ')}

COMMANDER'S INTENT:
${symbol.commanders_intent}
═══════════════════════════════════════════════════════════════════════════════

Provide specific, factual analysis. Reference the requirements above.`;

    const userPrompt = agent.id === 'decomposer'
      ? `Decompose the question into sub-questions that map to the requirements.`
      : `Continue research based on directive requirements:\n\n${previousWork.substring(0, 1500)}\n\nYour role: ${agent.role}`;

    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    agentOutputs.push(output);
    totalTokens += response.usage.input_tokens + response.usage.output_tokens;
    previousWork += `\n\n=== ${agent.name} ===\n${output}`;
  }

  const finalOutput = agentOutputs[agentOutputs.length - 1];
  const validation = validateAnswer(finalOutput, q.answer, q.answer_type);
  const reqCheck = checkRequirementMentions(agentOutputs.join('\n'), symbol.requirements);

  return {
    condition: 'with_symbols',
    questionIndex: qIndex,
    question: q.problem.substring(0, 80) + '...',
    expectedAnswer: q.answer,
    producedAnswer: finalOutput.substring(0, 200),
    answerCorrect: validation.correct,
    requirementsMentioned: reqCheck.mentioned,
    requirementsTotal: reqCheck.total,
    agentOutputs,
    totalTokens,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPERIMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         DEEPSEARCHQA BENCHMARK EXPERIMENT');
  console.log('═'.repeat(80));
  console.log(`\n  Dataset: Google DeepSearchQA`);
  console.log(`  Questions: ${CONFIG.QUESTIONS_TO_TEST}`);
  console.log(`  Agents per chain: ${CONFIG.NUM_AGENTS}`);
  console.log('─'.repeat(80));

  const resultsWithout: ChainResult[] = [];
  const resultsWith: ChainResult[] = [];

  for (let i = 0; i < Math.min(CONFIG.QUESTIONS_TO_TEST, QUESTIONS.length); i++) {
    const q = QUESTIONS[i];

    console.log(`\n${'═'.repeat(80)}`);
    console.log(`  QUESTION ${i + 1}/${CONFIG.QUESTIONS_TO_TEST}: ${q.problem_category}`);
    console.log('═'.repeat(80));
    console.log(`  ${q.problem.substring(0, 100)}...`);
    console.log(`  Expected: ${q.answer}`);
    console.log(`  Requirements: ${q.requirements.length}`);

    // Run WITHOUT symbols
    console.log(`\n  ─── CONDITION A: WITHOUT SYMBOLS ───`);
    const resultWithout = await runChainWithoutSymbols(q, i);
    resultsWithout.push(resultWithout);
    console.log(`  Answer Correct: ${resultWithout.answerCorrect ? '✅' : '❌'}`);
    console.log(`  Requirements Mentioned: ${resultWithout.requirementsMentioned}/${resultWithout.requirementsTotal}`);

    // Run WITH symbols
    console.log(`\n  ─── CONDITION B: WITH SYMBOLS ───`);
    const resultWith = await runChainWithSymbols(q, i);
    resultsWith.push(resultWith);
    console.log(`  Answer Correct: ${resultWith.answerCorrect ? '✅' : '❌'}`);
    console.log(`  Requirements Mentioned: ${resultWith.requirementsMentioned}/${resultWith.requirementsTotal}`);
  }

  // Print summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    BENCHMARK RESULTS');
  console.log('═'.repeat(80));

  const withoutCorrect = resultsWithout.filter(r => r.answerCorrect).length;
  const withCorrect = resultsWith.filter(r => r.answerCorrect).length;

  const withoutReqRate = resultsWithout.reduce((s, r) => s + r.requirementsMentioned / r.requirementsTotal, 0) / resultsWithout.length;
  const withReqRate = resultsWith.reduce((s, r) => s + r.requirementsMentioned / r.requirementsTotal, 0) / resultsWith.length;

  console.log('\n  ACCURACY\n');
  console.log(`                         Without Symbols    With Symbols`);
  console.log('─'.repeat(60));
  console.log(`  Correct Answers:       ${withoutCorrect}/${resultsWithout.length} (${(withoutCorrect / resultsWithout.length * 100).toFixed(0)}%)           ${withCorrect}/${resultsWith.length} (${(withCorrect / resultsWith.length * 100).toFixed(0)}%)`);
  console.log(`  Req Coverage:          ${(withoutReqRate * 100).toFixed(0)}%                  ${(withReqRate * 100).toFixed(0)}%`);

  console.log('\n  PER-QUESTION BREAKDOWN\n');
  console.log('  Q#  Category              Without    With     Improvement');
  console.log('─'.repeat(65));

  for (let i = 0; i < resultsWithout.length; i++) {
    const wo = resultsWithout[i];
    const w = resultsWith[i];
    const improvement = w.answerCorrect && !wo.answerCorrect ? '+1' : w.answerCorrect === wo.answerCorrect ? '=' : '-1';
    console.log(
      `  ${(i + 1).toString().padStart(2)}  ${QUESTIONS[i].problem_category.padEnd(20)} ` +
      `${wo.answerCorrect ? '✅' : '❌'}          ${w.answerCorrect ? '✅' : '❌'}        ${improvement}`
    );
  }

  console.log('\n  INTERPRETATION\n');

  if (withCorrect > withoutCorrect) {
    console.log(`  ✅ Symbols improved accuracy by ${withCorrect - withoutCorrect} correct answer(s)`);
  } else if (withCorrect === withoutCorrect) {
    console.log(`  ⚠️ Same accuracy, but check requirement coverage for quality difference`);
  } else {
    console.log(`  ❌ Symbols did not improve accuracy on this sample`);
  }

  if (withReqRate > withoutReqRate) {
    console.log(`  ✅ Requirement coverage improved by ${((withReqRate - withoutReqRate) * 100).toFixed(0)}%`);
  }

  console.log('\n' + '═'.repeat(80));

  // Save results
  const fs = await import('fs');
  const results = {
    experimentId: `deepsearch_${Date.now()}`,
    withoutSymbols: resultsWithout.map(r => ({ ...r, agentOutputs: r.agentOutputs.map(o => o.substring(0, 500)) })),
    withSymbols: resultsWith.map(r => ({ ...r, agentOutputs: r.agentOutputs.map(o => o.substring(0, 500)) })),
    summary: {
      withoutSymbolsAccuracy: withoutCorrect / resultsWithout.length,
      withSymbolsAccuracy: withCorrect / resultsWith.length,
      withoutSymbolsReqCoverage: withoutReqRate,
      withSymbolsReqCoverage: withReqRate,
    },
  };
  fs.writeFileSync('./deepsearchqa-results.json', JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ./deepsearchqa-results.json`);
}

main().catch(console.error);
