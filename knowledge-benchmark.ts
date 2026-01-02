#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KNOWLEDGE BENCHMARK - Fair Test
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Uses questions Claude CAN answer from training data, with multiple requirements.
 * This isolates the symbol effect from data access limitations.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 800,
  NUM_AGENTS: 4,
};

interface Question {
  question: string;
  category: string;
  answer: string;
  requirements: string[];
  key_terms: string[];
}

// Questions with MULTIPLE requirements that Claude knows
const QUESTIONS: Question[] = [
  {
    question: "Which US president served the shortest term, what was the cause of death, how many days did he serve, and who was his vice president who succeeded him?",
    category: "History",
    answer: "William Henry Harrison, pneumonia, 31 days, John Tyler",
    requirements: [
      "MUST name the president (William Henry Harrison)",
      "MUST state cause of death (pneumonia)",
      "MUST state exact days in office (31 or 32 days)",
      "MUST name successor/VP (John Tyler)",
    ],
    key_terms: ["Harrison", "pneumonia", "31", "Tyler"],
  },
  {
    question: "What is the largest planet in our solar system, what is its largest moon, approximately how many Earth-masses is the planet, and what is its Great Red Spot?",
    category: "Science",
    answer: "Jupiter, Ganymede, 318 Earth masses, a giant storm",
    requirements: [
      "MUST identify Jupiter as largest planet",
      "MUST name Ganymede as largest moon",
      "MUST mention mass comparison (~318 Earth masses)",
      "MUST explain Great Red Spot is a storm/anticyclone",
    ],
    key_terms: ["Jupiter", "Ganymede", "318", "storm"],
  },
  {
    question: "Who wrote '1984', what year was it published, what is the name of the totalitarian party, and what is the protagonist's name and job?",
    category: "Literature",
    answer: "George Orwell, 1949, the Party/Ingsoc, Winston Smith works at Ministry of Truth",
    requirements: [
      "MUST name author George Orwell",
      "MUST state publication year 1949",
      "MUST name the Party or Ingsoc",
      "MUST name protagonist Winston Smith",
      "MUST mention Ministry of Truth or his job rewriting history",
    ],
    key_terms: ["Orwell", "1949", "Party", "Winston", "Ministry"],
  },
  {
    question: "What company created the iPhone, who was CEO when it launched, what year was the first iPhone released, and what was revolutionary about its interface?",
    category: "Technology",
    answer: "Apple, Steve Jobs, 2007, multi-touch screen interface",
    requirements: [
      "MUST name Apple as the company",
      "MUST name Steve Jobs as CEO",
      "MUST state 2007 as launch year",
      "MUST mention multi-touch or touchscreen as revolutionary feature",
    ],
    key_terms: ["Apple", "Jobs", "2007", "touch"],
  },
  {
    question: "What is the chemical formula for water, what are its two component elements, at what temperature (Celsius) does it boil at sea level, and what is its molecular weight?",
    category: "Chemistry",
    answer: "H2O, hydrogen and oxygen, 100°C, ~18 g/mol",
    requirements: [
      "MUST state formula H2O",
      "MUST name hydrogen and oxygen",
      "MUST state boiling point 100°C",
      "MUST state molecular weight ~18 g/mol or atomic masses",
    ],
    key_terms: ["H2O", "hydrogen", "oxygen", "100", "18"],
  },
];

const AGENTS = [
  { id: 'analyzer', name: 'Question Analyzer', role: 'Parse the question into distinct sub-questions' },
  { id: 'researcher1', name: 'Fact Researcher 1', role: 'Answer the first half of sub-questions' },
  { id: 'researcher2', name: 'Fact Researcher 2', role: 'Answer remaining sub-questions' },
  { id: 'synthesizer', name: 'Answer Synthesizer', role: 'Combine all facts into complete answer' },
];

const anthropic = new Anthropic();

interface Result {
  condition: string;
  question: string;
  expected: string;
  produced: string;
  reqsMet: number;
  reqsTotal: number;
  allKeyTermsFound: boolean;
  keyTermsFound: string[];
  keyTermsMissed: string[];
}

function checkAnswer(output: string, q: Question): { met: number; termsFound: string[]; termsMissed: string[] } {
  const outputLower = output.toLowerCase();
  const termsFound: string[] = [];
  const termsMissed: string[] = [];

  for (const term of q.key_terms) {
    if (outputLower.includes(term.toLowerCase())) {
      termsFound.push(term);
    } else {
      termsMissed.push(term);
    }
  }

  return { met: termsFound.length, termsFound, termsMissed };
}

async function runWithoutSymbols(q: Question): Promise<Result> {
  let previousWork = '';

  for (const agent of AGENTS) {
    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: `You are ${agent.name}. ${agent.role}. Be factual and specific.`,
      messages: [{
        role: 'user',
        content: agent.id === 'analyzer'
          ? `Question: ${q.question}\n\nBreak this down.`
          : `Previous work:\n${previousWork}\n\nYour task: ${agent.role}`
      }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    previousWork += `\n=== ${agent.name} ===\n${output}`;
  }

  const check = checkAnswer(previousWork, q);

  return {
    condition: 'without_symbols',
    question: q.question.substring(0, 60) + '...',
    expected: q.answer,
    produced: previousWork.substring(previousWork.length - 300),
    reqsMet: check.met,
    reqsTotal: q.key_terms.length,
    allKeyTermsFound: check.termsMissed.length === 0,
    keyTermsFound: check.termsFound,
    keyTermsMissed: check.termsMissed,
  };
}

async function runWithSymbols(q: Question): Promise<Result> {
  const hash = createHash('sha256').update(q.question).digest('hex').substring(0, 12);
  let previousWork = '';

  const symbolBlock = `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL (Hash: ${hash})
═══════════════════════════════════════════════════════════════════════════════
QUESTION: ${q.question}

REQUIREMENTS (ALL must be in final answer):
${q.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

KEY TERMS THAT MUST APPEAR:
  ${q.key_terms.join(', ')}

COMMANDER'S INTENT: Answer with ALL specific facts. Missing any = incomplete.
═══════════════════════════════════════════════════════════════════════════════`;

  for (const agent of AGENTS) {
    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: `You are ${agent.name}. ${agent.role}.
${symbolBlock}

Reference the requirements above throughout your work.`,
      messages: [{
        role: 'user',
        content: agent.id === 'analyzer'
          ? `Analyze how to satisfy all ${q.requirements.length} requirements.`
          : `Previous work:\n${previousWork.substring(0, 1500)}\n\nYour task: ${agent.role}. Ensure ALL key terms appear.`
      }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    previousWork += `\n=== ${agent.name} ===\n${output}`;
  }

  const check = checkAnswer(previousWork, q);

  return {
    condition: 'with_symbols',
    question: q.question.substring(0, 60) + '...',
    expected: q.answer,
    produced: previousWork.substring(previousWork.length - 300),
    reqsMet: check.met,
    reqsTotal: q.key_terms.length,
    allKeyTermsFound: check.termsMissed.length === 0,
    keyTermsFound: check.termsFound,
    keyTermsMissed: check.termsMissed,
  };
}

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         KNOWLEDGE BENCHMARK (Fair Test)');
  console.log('═'.repeat(80));
  console.log('  Testing multi-requirement questions Claude can answer from training\n');

  const withoutResults: Result[] = [];
  const withResults: Result[] = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`\n  Q${i + 1}: ${q.category} - ${q.question.substring(0, 50)}...`);
    console.log(`      Key terms needed: ${q.key_terms.join(', ')}`);

    console.log('      WITHOUT symbols...');
    const wo = await runWithoutSymbols(q);
    withoutResults.push(wo);
    console.log(`        Terms found: ${wo.reqsMet}/${wo.reqsTotal} ${wo.allKeyTermsFound ? '✅' : '❌'}`);
    if (wo.keyTermsMissed.length > 0) {
      console.log(`        Missing: ${wo.keyTermsMissed.join(', ')}`);
    }

    console.log('      WITH symbols...');
    const w = await runWithSymbols(q);
    withResults.push(w);
    console.log(`        Terms found: ${w.reqsMet}/${w.reqsTotal} ${w.allKeyTermsFound ? '✅' : '❌'}`);
    if (w.keyTermsMissed.length > 0) {
      console.log(`        Missing: ${w.keyTermsMissed.join(', ')}`);
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    BENCHMARK RESULTS');
  console.log('═'.repeat(80));

  const woComplete = withoutResults.filter(r => r.allKeyTermsFound).length;
  const wComplete = withResults.filter(r => r.allKeyTermsFound).length;
  const woAvgTerms = withoutResults.reduce((s, r) => s + r.reqsMet / r.reqsTotal, 0) / withoutResults.length;
  const wAvgTerms = withResults.reduce((s, r) => s + r.reqsMet / r.reqsTotal, 0) / withResults.length;

  console.log('\n                         Without Symbols    With Symbols');
  console.log('─'.repeat(65));
  console.log(`  Complete Answers:      ${woComplete}/${QUESTIONS.length} (${(woComplete / QUESTIONS.length * 100).toFixed(0)}%)           ${wComplete}/${QUESTIONS.length} (${(wComplete / QUESTIONS.length * 100).toFixed(0)}%)`);
  console.log(`  Avg Term Coverage:     ${(woAvgTerms * 100).toFixed(0)}%                  ${(wAvgTerms * 100).toFixed(0)}%`);

  console.log('\n  PER-QUESTION:\n');
  console.log('  Q#  Category      Without  With   Δ');
  console.log('─'.repeat(45));
  for (let i = 0; i < QUESTIONS.length; i++) {
    const wo = withoutResults[i];
    const w = withResults[i];
    const delta = w.reqsMet - wo.reqsMet;
    console.log(
      `  ${(i + 1).toString().padStart(2)}  ${QUESTIONS[i].category.padEnd(12)} ` +
      `${wo.reqsMet}/${wo.reqsTotal}      ${w.reqsMet}/${w.reqsTotal}    ${delta >= 0 ? '+' : ''}${delta}`
    );
  }

  if (wComplete > woComplete) {
    console.log(`\n  ✅ Symbols improved complete answer rate by ${wComplete - woComplete}`);
  }
  if (wAvgTerms > woAvgTerms) {
    console.log(`  ✅ Symbols improved term coverage by ${((wAvgTerms - woAvgTerms) * 100).toFixed(0)}%`);
  }

  console.log('\n' + '═'.repeat(80));

  const fs = await import('fs');
  fs.writeFileSync('./knowledge-benchmark-results.json', JSON.stringify({
    withoutSymbols: withoutResults,
    withSymbols: withResults,
    summary: { woComplete, wComplete, woAvgTerms, wAvgTerms }
  }, null, 2));
  console.log('\n📄 Results saved to: ./knowledge-benchmark-results.json');
}

main().catch(console.error);
