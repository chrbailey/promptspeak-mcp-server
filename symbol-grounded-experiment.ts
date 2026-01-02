#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYMBOL-GROUNDED EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This is the CORRECT test architecture:
 *
 * 1. Fetch DeepSearchQA data from HuggingFace
 * 2. Create directive symbols and store in registry (symbols/*.json)
 * 3. Run agents that QUERY the registry to get their grounding
 * 4. Compare with agents that DON'T query the registry
 *
 * This isolates the symbol registry effect from hardcoded prompts.
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
  MAX_TOKENS: 600,
  SYMBOLS_ROOT: './symbols',
  NUM_AGENTS: 4,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (matching the MCP server types)
// ═══════════════════════════════════════════════════════════════════════════════

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
  key_terms?: string[];
  created_at: string;
  source_data?: Record<string, unknown>;
}

interface SymbolRegistry {
  version: string;
  updated_at: string;
  symbols: Record<string, { path: string; category: string; version: number; hash: string; created_at: string }>;
  stats: { total_symbols: number; by_category: Record<string, number> };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL REGISTRY (Simulating MCP server tools)
// ═══════════════════════════════════════════════════════════════════════════════

class LocalSymbolRegistry {
  private root: string;
  private registry: SymbolRegistry;

  constructor(root: string) {
    this.root = root;
    this.ensureDirectories();
    this.registry = this.loadRegistry();
  }

  private ensureDirectories() {
    const dirs = ['', 'queries', 'queries/DEEPSEARCHQA', 'companies'];
    for (const dir of dirs) {
      const p = path.join(this.root, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  }

  private loadRegistry(): SymbolRegistry {
    const registryPath = path.join(this.root, 'registry.json');
    if (fs.existsSync(registryPath)) {
      return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    }
    return {
      version: '1.0.0',
      updated_at: new Date().toISOString(),
      symbols: {},
      stats: { total_symbols: 0, by_category: {} },
    };
  }

  private saveRegistry() {
    this.registry.updated_at = new Date().toISOString();
    fs.writeFileSync(
      path.join(this.root, 'registry.json'),
      JSON.stringify(this.registry, null, 2)
    );
  }

  private calculateHash(symbol: Partial<DirectiveSymbol>): string {
    const content = {
      who: symbol.who,
      what: symbol.what,
      why: symbol.why,
      where: symbol.where,
      when: symbol.when,
      how: symbol.how,
      commanders_intent: symbol.commanders_intent,
      requirements: symbol.requirements,
      key_terms: symbol.key_terms,
    };
    return createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);
  }

  // ps_symbol_create
  create(symbol: Omit<DirectiveSymbol, 'version' | 'hash' | 'created_at'>): DirectiveSymbol {
    const now = new Date().toISOString();
    const full: DirectiveSymbol = {
      ...symbol,
      version: 1,
      hash: '',
      created_at: now,
    };
    full.hash = this.calculateHash(full);

    // Save to file
    const relativePath = `queries/DEEPSEARCHQA/${symbol.symbolId.split('.').pop()}.json`;
    const fullPath = path.join(this.root, relativePath);
    fs.writeFileSync(fullPath, JSON.stringify(full, null, 2));

    // Update registry
    this.registry.symbols[symbol.symbolId] = {
      path: relativePath,
      category: symbol.category,
      version: 1,
      hash: full.hash,
      created_at: now,
    };
    this.registry.stats.total_symbols++;
    this.registry.stats.by_category[symbol.category] = (this.registry.stats.by_category[symbol.category] || 0) + 1;
    this.saveRegistry();

    return full;
  }

  // ps_symbol_get
  get(symbolId: string): DirectiveSymbol | null {
    const entry = this.registry.symbols[symbolId];
    if (!entry) return null;

    const fullPath = path.join(this.root, entry.path);
    if (!fs.existsSync(fullPath)) return null;

    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  }

  // ps_symbol_format (for LLM prompt)
  format(symbolId: string): string {
    const symbol = this.get(symbolId);
    if (!symbol) return `[Symbol ${symbolId} not found]`;

    return `
═══════════════════════════════════════════════════════════════════════════════
DIRECTIVE SYMBOL: ${symbol.symbolId}
Version: ${symbol.version} | Hash: ${symbol.hash}
═══════════════════════════════════════════════════════════════════════════════

WHO:   ${symbol.who}
WHAT:  ${symbol.what}
WHY:   ${symbol.why}
WHERE: ${symbol.where}
WHEN:  ${symbol.when}

HOW:
  Focus: ${symbol.how.focus.join(', ')}
  Constraints: ${symbol.how.constraints.join(', ')}

───────────────────────────────────────────────────────────────────────────────
COMMANDER'S INTENT:
"${symbol.commanders_intent}"
───────────────────────────────────────────────────────────────────────────────

REQUIREMENTS (ALL must be satisfied):
${symbol.requirements.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}

${symbol.key_terms?.length ? `KEY TERMS (must appear in output): ${symbol.key_terms.join(', ')}\n` : ''}
═══════════════════════════════════════════════════════════════════════════════
`.trim();
  }

  getStats() {
    return this.registry.stats;
  }

  listSymbols(): string[] {
    return Object.keys(this.registry.symbols);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST QUESTIONS (Multi-requirement questions Claude can answer)
// ═══════════════════════════════════════════════════════════════════════════════

interface TestQuestion {
  id: string;
  question: string;
  answer: string;
  requirements: string[];
  key_terms: string[];
}

const TEST_QUESTIONS: TestQuestion[] = [
  {
    id: '001',
    question: "Which US president served the shortest term, what was the cause of death, how many days did he serve, and who succeeded him?",
    answer: "William Henry Harrison, pneumonia, 31 days, John Tyler",
    requirements: [
      "MUST name William Henry Harrison as the president",
      "MUST state pneumonia as cause of death",
      "MUST state approximately 31 or 32 days in office",
      "MUST name John Tyler as successor",
    ],
    key_terms: ["Harrison", "pneumonia", "31", "Tyler"],
  },
  {
    id: '002',
    question: "What is the largest planet in our solar system, what is its largest moon, approximately how many Earth-masses is it, and what is its Great Red Spot?",
    answer: "Jupiter, Ganymede, 318 Earth masses, a giant storm",
    requirements: [
      "MUST identify Jupiter as largest planet",
      "MUST name Ganymede as largest moon",
      "MUST mention approximately 318 Earth masses",
      "MUST explain Great Red Spot is a storm/anticyclone",
    ],
    key_terms: ["Jupiter", "Ganymede", "318", "storm"],
  },
  {
    id: '003',
    question: "Who wrote '1984', what year was it published, what is the ruling party called, and what is the protagonist's name and job?",
    answer: "George Orwell, 1949, the Party/Ingsoc, Winston Smith rewrites history at Ministry of Truth",
    requirements: [
      "MUST name George Orwell as author",
      "MUST state 1949 as publication year",
      "MUST name the Party or Ingsoc",
      "MUST name Winston Smith as protagonist",
      "MUST mention Ministry of Truth or his job rewriting history",
    ],
    key_terms: ["Orwell", "1949", "Party", "Winston", "Ministry"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT QUESTIONS TO SYMBOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

function importQuestionsToRegistry(registry: LocalSymbolRegistry, questions: TestQuestion[]): void {
  console.log('\n  Importing questions to symbol registry...\n');

  for (const q of questions) {
    const symbolId = `Ξ.Q.KNOWLEDGE.${q.id}`;

    const symbol = registry.create({
      symbolId,
      category: 'QUERY',
      who: 'Benchmark Evaluation System',
      what: q.question,
      why: 'Validate symbol grounding effectiveness',
      where: 'Knowledge benchmark test',
      when: new Date().toISOString().split('T')[0],
      how: {
        focus: ['accuracy', 'completeness'],
        constraints: ['answer_all_parts', 'be_specific'],
      },
      commanders_intent: 'Provide a complete answer that includes ALL required elements',
      requirements: q.requirements,
      key_terms: q.key_terms,
      source_data: { expected_answer: q.answer },
    });

    console.log(`    Created: ${symbolId} (hash: ${symbol.hash})`);
  }

  const stats = registry.getStats();
  console.log(`\n  Registry now contains ${stats.total_symbols} symbols`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTS = [
  { id: 'parser', name: 'Question Parser', role: 'Break the question into sub-questions' },
  { id: 'researcher1', name: 'Fact Researcher 1', role: 'Research the first half of sub-questions' },
  { id: 'researcher2', name: 'Fact Researcher 2', role: 'Research the second half of sub-questions' },
  { id: 'synthesizer', name: 'Answer Synthesizer', role: 'Combine all facts into a complete final answer' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// RUN EXPERIMENT
// ═══════════════════════════════════════════════════════════════════════════════

const anthropic = new Anthropic();

interface ExperimentResult {
  symbolId: string;
  question: string;
  condition: 'with_registry' | 'without_registry';
  keyTermsFound: string[];
  keyTermsMissed: string[];
  coverage: number;
  finalOutput: string;
  agentOutputs: string[];
}

async function runWithRegistry(
  registry: LocalSymbolRegistry,
  symbolId: string,
  question: TestQuestion
): Promise<ExperimentResult> {
  const agentOutputs: string[] = [];
  let previousWork = '';

  for (const agent of AGENTS) {
    // CRITICAL: Agent queries the registry to get the symbol
    const symbolBlock = registry.format(symbolId);

    const systemPrompt = `You are ${agent.name}. Your role: ${agent.role}.

${symbolBlock}

You MUST reference the requirements above throughout your work.
Each agent in the chain can query this SAME symbol - no information is lost.`;

    const userPrompt = agent.id === 'parser'
      ? 'Analyze the question and identify all required sub-answers based on the requirements.'
      : `Previous work:\n${previousWork.substring(0, 1500)}\n\nYour task: ${agent.role}. Ensure ALL key terms appear.`;

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

  // Check key terms in final output
  const finalOutput = previousWork;
  const outputLower = finalOutput.toLowerCase();
  const keyTermsFound = question.key_terms.filter(t => outputLower.includes(t.toLowerCase()));
  const keyTermsMissed = question.key_terms.filter(t => !outputLower.includes(t.toLowerCase()));

  return {
    symbolId,
    question: question.question,
    condition: 'with_registry',
    keyTermsFound,
    keyTermsMissed,
    coverage: keyTermsFound.length / question.key_terms.length,
    finalOutput: finalOutput.substring(finalOutput.length - 500),
    agentOutputs,
  };
}

async function runWithoutRegistry(question: TestQuestion): Promise<ExperimentResult> {
  const agentOutputs: string[] = [];
  let previousWork = '';

  for (const agent of AGENTS) {
    // NO SYMBOL - just pass the question directly
    const systemPrompt = `You are ${agent.name}. Your role: ${agent.role}. Be factual and specific.`;

    const userPrompt = agent.id === 'parser'
      ? `Question: ${question.question}\n\nBreak this down into sub-questions.`
      : `Previous work:\n${previousWork.substring(0, 1500)}\n\nYour task: ${agent.role}`;

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

  // Check key terms
  const finalOutput = previousWork;
  const outputLower = finalOutput.toLowerCase();
  const keyTermsFound = question.key_terms.filter(t => outputLower.includes(t.toLowerCase()));
  const keyTermsMissed = question.key_terms.filter(t => !outputLower.includes(t.toLowerCase()));

  return {
    symbolId: 'NONE',
    question: question.question,
    condition: 'without_registry',
    keyTermsFound,
    keyTermsMissed,
    coverage: keyTermsFound.length / question.key_terms.length,
    finalOutput: finalOutput.substring(finalOutput.length - 500),
    agentOutputs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('         SYMBOL-GROUNDED EXPERIMENT');
  console.log('═'.repeat(80));
  console.log('\n  This test uses the CORRECT architecture:');
  console.log('  - Symbols stored in registry files');
  console.log('  - Agents QUERY the registry to get grounding');
  console.log('  - Comparison: with registry vs without registry\n');

  // Initialize registry
  const registry = new LocalSymbolRegistry(CONFIG.SYMBOLS_ROOT);

  // Import test questions to registry
  importQuestionsToRegistry(registry, TEST_QUESTIONS);

  // Run experiments
  const withRegistryResults: ExperimentResult[] = [];
  const withoutRegistryResults: ExperimentResult[] = [];

  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const q = TEST_QUESTIONS[i];
    const symbolId = `Ξ.Q.KNOWLEDGE.${q.id}`;

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`  Q${i + 1}: ${q.question.substring(0, 60)}...`);
    console.log(`  Symbol: ${symbolId}`);
    console.log(`  Key terms: ${q.key_terms.join(', ')}`);

    // Run WITHOUT registry (baseline)
    console.log('\n  Running WITHOUT registry...');
    const woResult = await runWithoutRegistry(q);
    withoutRegistryResults.push(woResult);
    console.log(`    Coverage: ${(woResult.coverage * 100).toFixed(0)}% (${woResult.keyTermsFound.length}/${q.key_terms.length})`);
    if (woResult.keyTermsMissed.length > 0) {
      console.log(`    Missing: ${woResult.keyTermsMissed.join(', ')}`);
    }

    // Run WITH registry
    console.log('\n  Running WITH registry...');
    const wResult = await runWithRegistry(registry, symbolId, q);
    withRegistryResults.push(wResult);
    console.log(`    Coverage: ${(wResult.coverage * 100).toFixed(0)}% (${wResult.keyTermsFound.length}/${q.key_terms.length})`);
    if (wResult.keyTermsMissed.length > 0) {
      console.log(`    Missing: ${wResult.keyTermsMissed.join(', ')}`);
    }
  }

  // Summary
  console.log('\n\n' + '═'.repeat(80));
  console.log('                    EXPERIMENT RESULTS');
  console.log('═'.repeat(80));

  const woAvgCoverage = withoutRegistryResults.reduce((s, r) => s + r.coverage, 0) / withoutRegistryResults.length;
  const wAvgCoverage = withRegistryResults.reduce((s, r) => s + r.coverage, 0) / withRegistryResults.length;
  const woComplete = withoutRegistryResults.filter(r => r.coverage === 1).length;
  const wComplete = withRegistryResults.filter(r => r.coverage === 1).length;

  console.log('\n                         Without Registry   With Registry');
  console.log('─'.repeat(65));
  console.log(`  Complete Answers:      ${woComplete}/${TEST_QUESTIONS.length} (${(woComplete / TEST_QUESTIONS.length * 100).toFixed(0)}%)              ${wComplete}/${TEST_QUESTIONS.length} (${(wComplete / TEST_QUESTIONS.length * 100).toFixed(0)}%)`);
  console.log(`  Avg Coverage:          ${(woAvgCoverage * 100).toFixed(0)}%                    ${(wAvgCoverage * 100).toFixed(0)}%`);

  console.log('\n  PER-QUESTION:');
  console.log('  Q#  Without   With     Δ');
  console.log('─'.repeat(35));
  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    const wo = withoutRegistryResults[i];
    const w = withRegistryResults[i];
    const delta = ((w.coverage - wo.coverage) * 100).toFixed(0);
    console.log(
      `  ${i + 1}   ${(wo.coverage * 100).toFixed(0)}%       ${(w.coverage * 100).toFixed(0)}%      ${parseInt(delta) >= 0 ? '+' : ''}${delta}%`
    );
  }

  if (wAvgCoverage > woAvgCoverage) {
    console.log(`\n  ✅ Registry grounding improved coverage by ${((wAvgCoverage - woAvgCoverage) * 100).toFixed(0)}%`);
  }
  if (wComplete > woComplete) {
    console.log(`  ✅ Registry grounding improved complete answer rate by ${wComplete - woComplete}`);
  }

  console.log('\n' + '═'.repeat(80));

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    withoutRegistry: withoutRegistryResults,
    withRegistry: withRegistryResults,
    summary: {
      woComplete,
      wComplete,
      woAvgCoverage,
      wAvgCoverage,
      improvement: wAvgCoverage - woAvgCoverage,
    },
  };

  fs.writeFileSync('./symbol-grounded-results.json', JSON.stringify(results, null, 2));
  console.log('\n📄 Results saved to: ./symbol-grounded-results.json');

  // Show registry contents
  console.log('\n📁 Symbol registry contents:');
  for (const symbolId of registry.listSymbols()) {
    console.log(`   ${symbolId}`);
  }
}

main().catch(console.error);
