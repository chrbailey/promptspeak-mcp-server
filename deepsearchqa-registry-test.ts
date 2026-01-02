#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DEEPSEARCHQA REGISTRY TEST
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests the symbol registry against HuggingFace DeepSearchQA dataset.
 *
 * METHODOLOGY:
 * 1. Fetch questions from HuggingFace
 * 2. Create directive symbols in registry
 * 3. Run 4-agent chains WITH and WITHOUT registry
 * 4. Measure: requirement coverage, source acknowledgment, drift
 * 5. Compare against hypothesis predictions
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MODEL: 'claude-sonnet-4-20250514',
  MAX_TOKENS: 800,
  SYMBOLS_ROOT: './symbols',
  NUM_QUESTIONS: 10,
  NUM_AGENTS: 4,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DeepSearchQuestion {
  problem: string;
  problem_category: string;
  answer: string;
  answer_type: string;
}

interface DirectiveSymbol {
  symbolId: string;
  version: number;
  hash: string;
  category: string;
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
  key_terms: string[];
  source_reference?: string;
  created_at: string;
  source_data: DeepSearchQuestion;
}

interface TestResult {
  questionId: string;
  question: string;
  category: string;
  condition: 'with_registry' | 'without_registry';

  // Metrics
  requirementsCoverage: number;
  requirementsTotal: number;
  requirementsMet: string[];
  requirementsMissed: string[];

  sourceAcknowledged: boolean;
  sourceReference: string;

  driftScore: number;  // 0 = no drift, 1 = complete drift
  driftDetails: string[];

  structureScore: number;  // 0-1 based on structured output

  agentOutputs: string[];
  finalOutput: string;
}

interface HypothesisPrediction {
  questionId: string;
  withoutCoverage: number;
  withCoverage: number;
  expectedDelta: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYPOTHESIS PREDICTIONS (from HYPOTHESIS.md)
// ═══════════════════════════════════════════════════════════════════════════════

const PREDICTIONS: HypothesisPrediction[] = [
  { questionId: 'Q01', withoutCoverage: 0.60, withCoverage: 0.90, expectedDelta: 0.30 },
  { questionId: 'Q02', withoutCoverage: 0.50, withCoverage: 0.85, expectedDelta: 0.35 },
  { questionId: 'Q03', withoutCoverage: 0.40, withCoverage: 0.80, expectedDelta: 0.40 },
  { questionId: 'Q04', withoutCoverage: 0.55, withCoverage: 0.90, expectedDelta: 0.35 },
  { questionId: 'Q05', withoutCoverage: 0.45, withCoverage: 0.85, expectedDelta: 0.40 },
  { questionId: 'Q06', withoutCoverage: 0.65, withCoverage: 0.95, expectedDelta: 0.30 },
  { questionId: 'Q07', withoutCoverage: 0.50, withCoverage: 0.85, expectedDelta: 0.35 },
  { questionId: 'Q08', withoutCoverage: 0.60, withCoverage: 0.90, expectedDelta: 0.30 },
  { questionId: 'Q09', withoutCoverage: 0.40, withCoverage: 0.80, expectedDelta: 0.40 },
  { questionId: 'Q10', withoutCoverage: 0.45, withCoverage: 0.85, expectedDelta: 0.40 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class SymbolRegistry {
  private root: string;
  private symbols: Map<string, DirectiveSymbol> = new Map();

  constructor(root: string) {
    this.root = root;
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = ['', 'queries', 'queries/DEEPSEARCHQA'];
    for (const dir of dirs) {
      const p = path.join(this.root, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  private calculateHash(content: object): string {
    return createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);
  }

  createFromQuestion(q: DeepSearchQuestion, index: number): DirectiveSymbol {
    const symbolId = `Ξ.Q.DEEPSEARCHQA.${String(index).padStart(2, '0')}`;

    // Parse question into requirements
    const requirements = this.parseRequirements(q.problem);

    // Extract source reference if present
    const sourceRef = this.extractSourceReference(q.problem);

    // Extract key terms
    const keyTerms = this.extractKeyTerms(q.problem, q.answer);

    const symbol: DirectiveSymbol = {
      symbolId,
      version: 1,
      hash: '',
      category: 'QUERY',
      who: 'DeepSearchQA Benchmark System',
      what: q.problem,
      why: 'Evaluate multi-agent information retrieval accuracy',
      where: `DeepSearchQA/${q.problem_category}`,
      when: '2025-12-25',
      how: {
        focus: ['accuracy', 'completeness', 'source_verification'],
        constraints: [
          'MUST attempt to answer ALL parts of the question',
          'MUST acknowledge data sources if specified',
          'MUST provide structured response',
          sourceRef ? `MUST reference: ${sourceRef}` : 'Cite sources when possible',
        ].filter(Boolean),
      },
      commanders_intent: `Provide a complete, structured answer addressing ALL ${requirements.length} requirements`,
      requirements,
      key_terms: keyTerms,
      source_reference: sourceRef,
      created_at: new Date().toISOString(),
      source_data: q,
    };

    symbol.hash = this.calculateHash(symbol);

    // Save to file
    const filePath = path.join(this.root, 'queries', 'DEEPSEARCHQA', `${String(index).padStart(2, '0')}.json`);
    fs.writeFileSync(filePath, JSON.stringify(symbol, null, 2));

    this.symbols.set(symbolId, symbol);
    return symbol;
  }

  private parseRequirements(problem: string): string[] {
    const requirements: string[] = [];

    // Split by common delimiters
    const sentences = problem.split(/[.?]/).filter(s => s.trim().length > 10);

    // Each significant clause becomes a requirement
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 20) {
        // Look for specific asks
        if (trimmed.includes('which') || trimmed.includes('what') ||
            trimmed.includes('how many') || trimmed.includes('list') ||
            trimmed.includes('find') || trimmed.includes('name') ||
            trimmed.includes('determine') || trimmed.includes('identify')) {
          requirements.push(`MUST answer: ${trimmed}`);
        }
      }
    }

    // If we found fewer than 2, add generic ones
    if (requirements.length < 2) {
      requirements.push('MUST provide a complete answer to the question');
      requirements.push('MUST include specific details, not generalizations');
    }

    return requirements;
  }

  private extractSourceReference(problem: string): string | undefined {
    const sourcePatterns = [
      /according to (?:the )?([^,\.]+)/i,
      /based on (?:the )?([^,\.]+)/i,
      /using (?:the )?([^,\.]+)/i,
      /from (?:the )?([^,\.]+)/i,
      /(?:the )?([A-Z][A-Za-z\s]+(?:Report|Data|Statistics|Release|Database|Website))/,
    ];

    for (const pattern of sourcePatterns) {
      const match = problem.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractKeyTerms(problem: string, answer: string): string[] {
    const terms: string[] = [];

    // Extract years
    const years = problem.match(/\b(19|20)\d{2}\b/g);
    if (years) terms.push(...years);

    // Extract numbers
    const numbers = problem.match(/\b\d+(?:\.\d+)?%?\b/g);
    if (numbers) terms.push(...numbers.slice(0, 3));

    // Key words from answer (first few)
    const answerWords = answer.split(/[,;\s]+/).filter(w => w.length > 3).slice(0, 3);
    terms.push(...answerWords);

    return [...new Set(terms)];
  }

  get(symbolId: string): DirectiveSymbol | undefined {
    return this.symbols.get(symbolId);
  }

  format(symbolId: string): string {
    const s = this.get(symbolId);
    if (!s) return `[Symbol ${symbolId} not found]`;

    return `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL: ${s.symbolId} (v${s.version}, hash: ${s.hash})
═══════════════════════════════════════════════════════════════════════════════

CATEGORY: ${s.source_data.problem_category}
ANSWER TYPE: ${s.source_data.answer_type}

QUESTION:
${s.what}

───────────────────────────────────────────────────────────────────────────────
COMMANDER'S INTENT: "${s.commanders_intent}"
───────────────────────────────────────────────────────────────────────────────

REQUIREMENTS (ALL must be addressed):
${s.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

CONSTRAINTS:
${s.how.constraints.map(c => `  - ${c}`).join('\n')}

${s.source_reference ? `DATA SOURCE REQUIRED: ${s.source_reference}\n` : ''}
${s.key_terms.length ? `KEY TERMS: ${s.key_terms.join(', ')}\n` : ''}
═══════════════════════════════════════════════════════════════════════════════`.trim();
  }

  listSymbols(): string[] {
    return Array.from(this.symbols.keys());
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FETCH DATA
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchDeepSearchQA(limit: number): Promise<DeepSearchQuestion[]> {
  const url = `https://datasets-server.huggingface.co/rows?dataset=google%2Fdeepsearchqa&config=deepsearchqa&split=eval&offset=0&length=${limit}`;

  const response = await fetch(url);
  const data = await response.json();

  return data.rows.map((r: { row: DeepSearchQuestion }) => r.row);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTS = [
  { id: 'analyzer', name: 'Question Analyzer', role: 'Parse the question into specific sub-questions and identify required data sources' },
  { id: 'researcher1', name: 'Primary Researcher', role: 'Research and address the first half of sub-questions' },
  { id: 'researcher2', name: 'Secondary Researcher', role: 'Research and address the remaining sub-questions' },
  { id: 'synthesizer', name: 'Answer Synthesizer', role: 'Combine all findings into a complete, structured final answer' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TEST RUNNERS
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

async function runWithRegistry(
  registry: SymbolRegistry,
  symbol: DirectiveSymbol,
  questionIndex: number
): Promise<TestResult> {
  const agentOutputs: string[] = [];
  let previousWork = '';

  for (const agent of AGENTS) {
    const symbolBlock = registry.format(symbol.symbolId);

    const systemPrompt = `You are ${agent.name}. Your role: ${agent.role}.

${symbolBlock}

CRITICAL: You MUST reference the requirements above throughout your work.
Even if you cannot access the required data source, acknowledge what would be needed.`;

    const userPrompt = agent.id === 'analyzer'
      ? 'Analyze this question and break it down into specific sub-questions based on the requirements.'
      : `Previous work:\n${previousWork.substring(0, 2000)}\n\nYour task: ${agent.role}. Address ALL requirements.`;

    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    agentOutputs.push(output);
    previousWork += `\n=== ${agent.name} ===\n${output}`;
  }

  return evaluateResult(symbol, agentOutputs, previousWork, 'with_registry', questionIndex);
}

async function runWithoutRegistry(
  question: DeepSearchQuestion,
  questionIndex: number
): Promise<TestResult> {
  const agentOutputs: string[] = [];
  let previousWork = '';

  for (const agent of AGENTS) {
    const systemPrompt = `You are ${agent.name}. Your role: ${agent.role}. Be thorough and specific.`;

    const userPrompt = agent.id === 'analyzer'
      ? `Question: ${question.problem}\n\nBreak this down into sub-questions.`
      : `Previous work:\n${previousWork.substring(0, 2000)}\n\nYour task: ${agent.role}`;

    const response = await anthropic.messages.create({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const output = response.content[0].type === 'text' ? response.content[0].text : '';
    agentOutputs.push(output);
    previousWork += `\n=== ${agent.name} ===\n${output}`;
  }

  // Create a temporary symbol for evaluation
  const tempSymbol: DirectiveSymbol = {
    symbolId: `TEMP.Q${questionIndex}`,
    version: 1,
    hash: '',
    category: 'QUERY',
    who: '',
    what: question.problem,
    why: '',
    where: question.problem_category,
    when: '',
    how: { focus: [], constraints: [] },
    commanders_intent: '',
    requirements: parseQuestionRequirements(question.problem),
    key_terms: [],
    source_reference: extractSource(question.problem),
    created_at: '',
    source_data: question,
  };

  return evaluateResult(tempSymbol, agentOutputs, previousWork, 'without_registry', questionIndex);
}

function parseQuestionRequirements(problem: string): string[] {
  const requirements: string[] = [];
  const sentences = problem.split(/[.?]/).filter(s => s.trim().length > 10);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 20) {
      if (trimmed.includes('which') || trimmed.includes('what') ||
          trimmed.includes('how many') || trimmed.includes('list') ||
          trimmed.includes('find') || trimmed.includes('name') ||
          trimmed.includes('determine') || trimmed.includes('identify')) {
        requirements.push(trimmed);
      }
    }
  }

  if (requirements.length < 2) {
    requirements.push('Answer the question completely');
    requirements.push('Provide specific details');
  }

  return requirements;
}

function extractSource(problem: string): string | undefined {
  const match = problem.match(/according to (?:the )?([^,\.]+)/i) ||
                problem.match(/based on (?:the )?([^,\.]+)/i);
  return match ? match[1].trim() : undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateResult(
  symbol: DirectiveSymbol,
  agentOutputs: string[],
  finalOutput: string,
  condition: 'with_registry' | 'without_registry',
  questionIndex: number
): TestResult {
  const outputLower = finalOutput.toLowerCase();

  // 1. Requirement Coverage
  const requirementsMet: string[] = [];
  const requirementsMissed: string[] = [];

  for (const req of symbol.requirements) {
    // Extract key words from requirement
    const keyWords = req.toLowerCase()
      .replace(/must answer:|must |should /gi, '')
      .split(/\s+/)
      .filter(w => w.length > 4);

    // Check if at least 50% of key words appear
    const matchCount = keyWords.filter(w => outputLower.includes(w)).length;
    if (matchCount >= keyWords.length * 0.5) {
      requirementsMet.push(req);
    } else {
      requirementsMissed.push(req);
    }
  }

  const requirementsCoverage = requirementsMet.length / symbol.requirements.length;

  // 2. Source Acknowledgment
  let sourceAcknowledged = false;
  if (symbol.source_reference) {
    const sourceWords = symbol.source_reference.toLowerCase().split(/\s+/);
    const matchCount = sourceWords.filter(w => outputLower.includes(w)).length;
    sourceAcknowledged = matchCount >= sourceWords.length * 0.5;
  }

  // 3. Drift Detection
  const driftDetails: string[] = [];
  let driftScore = 0;

  // Check if key terms from first agent appear in last agent
  const firstAgentTerms = extractSignificantTerms(agentOutputs[0]);
  const lastAgentOutput = agentOutputs[agentOutputs.length - 1].toLowerCase();

  let termsLost = 0;
  for (const term of firstAgentTerms) {
    if (!lastAgentOutput.includes(term.toLowerCase())) {
      driftDetails.push(`Lost term: "${term}"`);
      termsLost++;
    }
  }

  driftScore = firstAgentTerms.length > 0 ? termsLost / firstAgentTerms.length : 0;

  // 4. Structure Score
  let structureScore = 0;

  // Check for structured elements
  if (finalOutput.includes('1.') || finalOutput.includes('•') || finalOutput.includes('-')) structureScore += 0.25;
  if (finalOutput.includes('Answer') || finalOutput.includes('Conclusion') || finalOutput.includes('Summary')) structureScore += 0.25;
  if (finalOutput.split('\n').length > 5) structureScore += 0.25;
  if (requirementsCoverage > 0.5) structureScore += 0.25;

  return {
    questionId: `Q${String(questionIndex + 1).padStart(2, '0')}`,
    question: symbol.what.substring(0, 80) + '...',
    category: symbol.source_data.problem_category,
    condition,
    requirementsCoverage,
    requirementsTotal: symbol.requirements.length,
    requirementsMet,
    requirementsMissed,
    sourceAcknowledged,
    sourceReference: symbol.source_reference || 'N/A',
    driftScore,
    driftDetails,
    structureScore,
    agentOutputs,
    finalOutput: finalOutput.substring(finalOutput.length - 500),
  };
}

function extractSignificantTerms(text: string): string[] {
  // Extract proper nouns, numbers, and significant terms
  const terms: string[] = [];

  // Years
  const years = text.match(/\b(19|20)\d{2}\b/g);
  if (years) terms.push(...years);

  // Percentages and numbers
  const numbers = text.match(/\b\d+(?:\.\d+)?%?\b/g);
  if (numbers) terms.push(...numbers.slice(0, 5));

  // Capitalized terms (proper nouns)
  const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g);
  if (properNouns) terms.push(...properNouns.slice(0, 5));

  return [...new Set(terms)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         DEEPSEARCHQA REGISTRY TEST');
  console.log('═'.repeat(80));
  console.log('\n  Testing hypothesis from HYPOTHESIS.md');
  console.log('  Dataset: google/deepsearchqa (HuggingFace)\n');

  // 1. Fetch data
  console.log('  [1/5] Fetching DeepSearchQA data...');
  const questions = await fetchDeepSearchQA(CONFIG.NUM_QUESTIONS);
  console.log(`        Fetched ${questions.length} questions\n`);

  // 2. Create registry and import
  console.log('  [2/5] Creating symbol registry...');
  const registry = new SymbolRegistry(CONFIG.SYMBOLS_ROOT);

  const symbols: DirectiveSymbol[] = [];
  for (let i = 0; i < questions.length; i++) {
    const symbol = registry.createFromQuestion(questions[i], i + 1);
    symbols.push(symbol);
    console.log(`        Created: ${symbol.symbolId} (${symbol.requirements.length} requirements)`);
  }
  console.log();

  // 3. Run tests
  console.log('  [3/5] Running tests...\n');

  const withoutResults: TestResult[] = [];
  const withResults: TestResult[] = [];

  for (let i = 0; i < questions.length; i++) {
    console.log(`  ${'─'.repeat(70)}`);
    console.log(`  Q${i + 1}: ${questions[i].problem.substring(0, 60)}...`);
    console.log(`      Category: ${questions[i].problem_category}`);
    console.log(`      Symbol: ${symbols[i].symbolId}`);
    console.log(`      Requirements: ${symbols[i].requirements.length}`);

    // Without registry
    console.log('\n      WITHOUT registry...');
    const woResult = await runWithoutRegistry(questions[i], i);
    withoutResults.push(woResult);
    console.log(`        Coverage: ${(woResult.requirementsCoverage * 100).toFixed(0)}%`);
    console.log(`        Source: ${woResult.sourceAcknowledged ? '✓' : '✗'}`);
    console.log(`        Drift: ${(woResult.driftScore * 100).toFixed(0)}%`);

    // With registry
    console.log('\n      WITH registry...');
    const wResult = await runWithRegistry(registry, symbols[i], i);
    withResults.push(wResult);
    console.log(`        Coverage: ${(wResult.requirementsCoverage * 100).toFixed(0)}%`);
    console.log(`        Source: ${wResult.sourceAcknowledged ? '✓' : '✗'}`);
    console.log(`        Drift: ${(wResult.driftScore * 100).toFixed(0)}%`);

    // Delta
    const delta = wResult.requirementsCoverage - woResult.requirementsCoverage;
    console.log(`\n      Δ Coverage: ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`);
  }

  // 4. Analysis
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    RESULTS ANALYSIS');
  console.log('═'.repeat(80));

  // Calculate aggregates
  const woAvgCoverage = withoutResults.reduce((s, r) => s + r.requirementsCoverage, 0) / withoutResults.length;
  const wAvgCoverage = withResults.reduce((s, r) => s + r.requirementsCoverage, 0) / withResults.length;
  const woSourceRate = withoutResults.filter(r => r.sourceAcknowledged).length / withoutResults.length;
  const wSourceRate = withResults.filter(r => r.sourceAcknowledged).length / withResults.length;
  const woAvgDrift = withoutResults.reduce((s, r) => s + r.driftScore, 0) / withoutResults.length;
  const wAvgDrift = withResults.reduce((s, r) => s + r.driftScore, 0) / withResults.length;

  console.log('\n  AGGREGATE METRICS:');
  console.log('                              Without Registry   With Registry   Delta');
  console.log('  ' + '─'.repeat(70));
  console.log(`  Avg Requirement Coverage:   ${(woAvgCoverage * 100).toFixed(0)}%                ${(wAvgCoverage * 100).toFixed(0)}%              ${((wAvgCoverage - woAvgCoverage) * 100).toFixed(0)}%`);
  console.log(`  Source Acknowledgment:      ${(woSourceRate * 100).toFixed(0)}%                ${(wSourceRate * 100).toFixed(0)}%              ${((wSourceRate - woSourceRate) * 100).toFixed(0)}%`);
  console.log(`  Avg Drift Score:            ${(woAvgDrift * 100).toFixed(0)}%                ${(wAvgDrift * 100).toFixed(0)}%              ${((woAvgDrift - wAvgDrift) * 100).toFixed(0)}%`);

  // 5. Compare to hypothesis
  console.log('\n\n  HYPOTHESIS COMPARISON:');
  console.log('  Q#   Predicted Δ   Actual Δ   Variance   Status');
  console.log('  ' + '─'.repeat(55));

  const variances: { qid: string; variance: number; predicted: number; actual: number }[] = [];

  for (let i = 0; i < CONFIG.NUM_QUESTIONS; i++) {
    const prediction = PREDICTIONS[i];
    const woResult = withoutResults[i];
    const wResult = withResults[i];

    const actualDelta = wResult.requirementsCoverage - woResult.requirementsCoverage;
    const variance = Math.abs(actualDelta - prediction.expectedDelta);

    let status = '✓ Within range';
    if (variance > 0.20) status = '⚠️ HIGH VARIANCE';
    else if (variance > 0.15) status = '⚡ Moderate';

    console.log(`  ${prediction.questionId}   ${(prediction.expectedDelta * 100).toFixed(0)}%           ${(actualDelta * 100).toFixed(0)}%         ${(variance * 100).toFixed(0)}%        ${status}`);

    variances.push({
      qid: prediction.questionId,
      variance,
      predicted: prediction.expectedDelta,
      actual: actualDelta,
    });
  }

  // Overall hypothesis check
  const avgActualDelta = (wAvgCoverage - woAvgCoverage);
  const predictedAvgDelta = PREDICTIONS.reduce((s, p) => s + p.expectedDelta, 0) / PREDICTIONS.length;

  console.log('\n  ' + '─'.repeat(55));
  console.log(`  OVERALL: Predicted Δ = ${(predictedAvgDelta * 100).toFixed(0)}%, Actual Δ = ${(avgActualDelta * 100).toFixed(0)}%`);

  if (avgActualDelta >= 0.20) {
    console.log('\n  ✅ HYPOTHESIS SUPPORTED: Registry grounding shows significant improvement');
  } else if (avgActualDelta >= 0.10) {
    console.log('\n  ⚡ PARTIAL SUPPORT: Registry grounding shows moderate improvement');
  } else {
    console.log('\n  ❌ HYPOTHESIS NOT SUPPORTED: No significant improvement observed');
  }

  // 6. Investigate high variance
  const highVariance = variances.filter(v => v.variance > 0.15);

  if (highVariance.length > 0) {
    console.log('\n\n  HIGH VARIANCE INVESTIGATION:');
    console.log('  ' + '─'.repeat(55));

    for (const hv of highVariance) {
      const i = parseInt(hv.qid.slice(1)) - 1;
      const q = questions[i];
      const woResult = withoutResults[i];
      const wResult = withResults[i];

      console.log(`\n  ${hv.qid}: Variance = ${(hv.variance * 100).toFixed(0)}%`);
      console.log(`    Question: ${q.problem.substring(0, 70)}...`);
      console.log(`    Category: ${q.problem_category}`);
      console.log(`    Without: ${(woResult.requirementsCoverage * 100).toFixed(0)}% coverage`);
      console.log(`    With: ${(wResult.requirementsCoverage * 100).toFixed(0)}% coverage`);
      console.log(`    Predicted: +${(hv.predicted * 100).toFixed(0)}%, Actual: ${hv.actual >= 0 ? '+' : ''}${(hv.actual * 100).toFixed(0)}%`);

      if (hv.actual < hv.predicted) {
        console.log(`    ANALYSIS: Symbol grounding underperformed prediction`);
        console.log(`    Possible reasons:`);
        console.log(`      - Question already well-structured (baseline high)`);
        console.log(`      - Requirements parsing may have been inaccurate`);
      } else {
        console.log(`    ANALYSIS: Symbol grounding exceeded prediction`);
        console.log(`    Possible reasons:`);
        console.log(`      - Baseline worse than expected`);
        console.log(`      - Symbol requirements particularly well-suited`);
      }
    }
  }

  console.log('\n' + '═'.repeat(80));

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    config: CONFIG,
    hypothesis: {
      predictions: PREDICTIONS,
      predictedAvgDelta: predictedAvgDelta,
    },
    actual: {
      withoutRegistry: withoutResults.map(r => ({
        ...r,
        agentOutputs: undefined,
        finalOutput: r.finalOutput.substring(0, 200),
      })),
      withRegistry: withResults.map(r => ({
        ...r,
        agentOutputs: undefined,
        finalOutput: r.finalOutput.substring(0, 200),
      })),
      avgDelta: avgActualDelta,
    },
    comparison: {
      variances,
      highVarianceCount: highVariance.length,
      hypothesisSupported: avgActualDelta >= 0.20,
    },
    summary: {
      woAvgCoverage,
      wAvgCoverage,
      woSourceRate,
      wSourceRate,
      woAvgDrift,
      wAvgDrift,
    },
  };

  fs.writeFileSync('./deepsearchqa-registry-results.json', JSON.stringify(results, null, 2));
  console.log('\n📄 Full results saved to: ./deepsearchqa-registry-results.json');
}

main().catch(console.error);
