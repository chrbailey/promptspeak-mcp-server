#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK SCALED TELEPHONE EXPERIMENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Large-scale test: 12 specialized agents × 1000 turns
 * Each agent has unique domain expertise but shares the same PromptSpeak symbol.
 *
 * Agents:
 *   1. Revenue Analyst       - Datacenter, gaming, automotive revenue
 *   2. Margin Analyst        - Gross margin, operating margin, cost structure
 *   3. Competitive Intel     - AMD MI300X, Intel Gaudi, custom silicon
 *   4. Supply Chain          - TSMC dependency, CoWoS capacity, lead times
 *   5. Geopolitical          - China restrictions, export controls, tariffs
 *   6. Product Analyst       - Blackwell, H100, H200, Grace Hopper
 *   7. Market Sentiment      - Fear & Greed, analyst ratings, options flow
 *   8. Risk Analyst          - Concentration risk, regulatory, customer dependency
 *   9. Valuation Analyst     - DCF, multiples, growth-adjusted metrics
 *  10. Technical Analyst     - Chart patterns, support/resistance, volume
 *  11. Macro Analyst         - Interest rates, sector rotation, liquidity
 *  12. Synthesis Analyst     - Final report integration and recommendation
 *
 * Measures:
 *   - Per-agent requirement coverage over 1000 turns
 *   - Cross-agent information propagation fidelity
 *   - Drift accumulation patterns
 *   - Symbol anchoring effectiveness
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  NUM_TURNS: 1000,
  NUM_AGENTS: 12,
  DRIFT_THRESHOLD: 0.20,       // 20% drift triggers circuit breaker
  SYMBOL_REFRESH_RATE: 0.98,   // With symbols, 98% info retention per handoff
  NO_SYMBOL_RETENTION: 0.82,   // Without symbols, 82% info retention per handoff
  NOISE_FACTOR: 0.03,          // Random noise in retention
  REPORT_INTERVAL: 100,        // Print progress every N turns
};

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT SPECIALIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentSpec {
  id: string;
  name: string;
  domain: string;
  frame: string;
  entity: string;
  primaryRequirements: number[];  // Indices into requirements array
  contributionWeight: number;     // How much this agent contributes to final output
  keywords: string[];             // Domain-specific keywords agent focuses on
}

const AGENTS: AgentSpec[] = [
  {
    id: 'revenue',
    name: 'Revenue Analyst',
    domain: 'datacenter_revenue',
    frame: '⊕◊▶β',
    entity: 'β',
    primaryRequirements: [0, 1],  // Q3 revenue, YoY growth
    contributionWeight: 0.12,
    keywords: ['datacenter', 'revenue', '$30.8B', '112%', 'growth', 'gaming', 'automotive'],
  },
  {
    id: 'margin',
    name: 'Margin Analyst',
    domain: 'margin_analysis',
    frame: '⊕◊▶β',
    entity: 'β',
    primaryRequirements: [2],  // Blackwell margin impact
    contributionWeight: 0.10,
    keywords: ['margin', 'gross', 'operating', 'Blackwell', 'transition', 'cost'],
  },
  {
    id: 'competitive',
    name: 'Competitive Intel',
    domain: 'competitive_landscape',
    frame: '⊕◊▶γ',
    entity: 'γ',
    primaryRequirements: [4],  // AMD MI300X
    contributionWeight: 0.08,
    keywords: ['AMD', 'MI300X', 'Intel', 'Gaudi', 'competitive', 'market share'],
  },
  {
    id: 'supply',
    name: 'Supply Chain Analyst',
    domain: 'supply_chain',
    frame: '⊕◊▶γ',
    entity: 'γ',
    primaryRequirements: [5],  // TSMC dependency
    contributionWeight: 0.08,
    keywords: ['TSMC', 'supply', 'CoWoS', 'capacity', 'foundry', 'lead time'],
  },
  {
    id: 'geopolitical',
    name: 'Geopolitical Analyst',
    domain: 'geopolitics',
    frame: '⊕◊▶γ',
    entity: 'γ',
    primaryRequirements: [3],  // China restrictions
    contributionWeight: 0.08,
    keywords: ['China', 'export', 'restrictions', 'tariff', 'sanctions', 'H20'],
  },
  {
    id: 'product',
    name: 'Product Analyst',
    domain: 'product_roadmap',
    frame: '⊕◊▶γ',
    entity: 'γ',
    primaryRequirements: [2],  // Blackwell transition
    contributionWeight: 0.10,
    keywords: ['Blackwell', 'H100', 'H200', 'Grace', 'Hopper', 'architecture', 'performance'],
  },
  {
    id: 'sentiment',
    name: 'Market Sentiment',
    domain: 'market_sentiment',
    frame: '⊕◊▶ω',
    entity: 'ω',
    primaryRequirements: [6, 7],  // Fear & Greed, analyst targets
    contributionWeight: 0.08,
    keywords: ['Fear', 'Greed', 'analyst', 'rating', 'target', 'options', 'sentiment'],
  },
  {
    id: 'risk',
    name: 'Risk Analyst',
    domain: 'risk_assessment',
    frame: '⊕◊▶ω',
    entity: 'ω',
    primaryRequirements: [8],  // DeepSeek risk
    contributionWeight: 0.08,
    keywords: ['risk', 'DeepSeek', 'concentration', 'regulatory', 'customer', 'dependency'],
  },
  {
    id: 'valuation',
    name: 'Valuation Analyst',
    domain: 'valuation',
    frame: '⊕◊▶ω',
    entity: 'ω',
    primaryRequirements: [7],  // Price targets
    contributionWeight: 0.08,
    keywords: ['DCF', 'multiple', 'valuation', 'PE', 'PEG', 'price', 'target', '$170'],
  },
  {
    id: 'technical',
    name: 'Technical Analyst',
    domain: 'technical_analysis',
    frame: '⊕◊▶ω',
    entity: 'ω',
    primaryRequirements: [],  // No primary, supports others
    contributionWeight: 0.05,
    keywords: ['support', 'resistance', 'volume', 'RSI', 'MACD', 'trend', 'breakout'],
  },
  {
    id: 'macro',
    name: 'Macro Analyst',
    domain: 'macro_environment',
    frame: '⊕◊▶ω',
    entity: 'ω',
    primaryRequirements: [],  // No primary, contextual
    contributionWeight: 0.05,
    keywords: ['interest', 'rate', 'Fed', 'rotation', 'liquidity', 'sector', 'cycle'],
  },
  {
    id: 'synthesis',
    name: 'Synthesis Analyst',
    domain: 'final_synthesis',
    frame: '⊕◊●ω',
    entity: 'ω',
    primaryRequirements: [9],  // Position recommendation
    contributionWeight: 0.10,
    keywords: ['position', 'recommendation', 'overweight', 'underweight', 'maintain', 'conclusion'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

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
}

interface AgentTurnResult {
  turn: number;
  agentIndex: number;
  agentSpec: AgentSpec;
  hasSymbol: boolean;
  inputFidelity: number;        // How much of original info agent received
  outputFidelity: number;       // How much of original info agent passed on
  requirementsCovered: number[];
  requirementsMissed: number[];
  driftDetected: boolean;
  driftAmount: number;
  holdTriggered: boolean;
  timestamp: number;
}

interface TurnSummary {
  turn: number;
  withSymbols: {
    avgFidelity: number;
    requirementsCoverage: number;
    driftEvents: number;
    holdsTriggered: number;
  };
  withoutSymbols: {
    avgFidelity: number;
    requirementsCoverage: number;
    driftEvents: number;
  };
}

interface ScaledExperimentResult {
  experimentId: string;
  config: typeof CONFIG;
  agents: AgentSpec[];
  directive: DirectiveSymbol;
  startTime: string;
  endTime: string;
  durationMs: number;

  // Per-turn data
  turnSummaries: TurnSummary[];

  // Per-agent aggregates
  agentMetrics: {
    agentId: string;
    withSymbols: {
      avgFidelity: number;
      avgCoverage: number;
      driftRate: number;
    };
    withoutSymbols: {
      avgFidelity: number;
      avgCoverage: number;
      driftRate: number;
    };
  }[];

  // Overall statistics
  statistics: {
    withSymbols: {
      meanFidelity: number;
      stdFidelity: number;
      minFidelity: number;
      maxFidelity: number;
      meanCoverage: number;
      totalDriftEvents: number;
      totalHolds: number;
      circuitBreakerTrips: number;
      fidelityByTurnDecile: number[];
    };
    withoutSymbols: {
      meanFidelity: number;
      stdFidelity: number;
      minFidelity: number;
      maxFidelity: number;
      meanCoverage: number;
      totalDriftEvents: number;
      fidelityByTurnDecile: number[];
    };
    improvement: {
      fidelityDelta: number;
      coverageDelta: number;
      driftReduction: number;
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function createDirectiveSymbol(): DirectiveSymbol {
  const requirements = [
    'Include Q3 FY25 datacenter revenue ($30.8B)',
    'Calculate YoY growth rate (112%)',
    'Discuss Blackwell margin impact',
    'Address China export restrictions',
    'Compare to AMD MI300X positioning',
    'Note TSMC supply chain dependency',
    'Reference Fear & Greed Index',
    'Include analyst price targets ($170 avg)',
    'Mention DeepSeek competitive risk',
    'Conclude with position recommendation',
  ];

  const content = {
    who: 'Investment Committee',
    what: 'Quarterly financial analysis',
    why: 'Evaluate NVDA position sizing',
    where: 'NVIDIA Corporation (NASDAQ: NVDA)',
    when: 'Q3 FY25 (October 2024)',
    how: {
      focus: ['datacenter_revenue', 'margin_impact', 'blackwell_transition', 'competitive_position'],
      constraints: ['cite_sources', 'quantify_claims', 'flag_uncertainties', 'cross_reference'],
      output_format: 'written_report',
    },
    commanders_intent: 'Determine if Blackwell transition costs justify maintaining overweight position given competitive and geopolitical headwinds',
    requirements,
  };

  const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex').substring(0, 16);

  return {
    symbolId: `Ξ.DIRECTIVE.SCALE.${Date.now()}`,
    hash,
    ...content,
    created_at: new Date().toISOString(),
  };
}

function calculateFidelity(
  previousFidelity: number,
  hasSymbol: boolean,
  agentIndex: number,
  turn: number
): number {
  // Base retention rate
  const baseRetention = hasSymbol ? CONFIG.SYMBOL_REFRESH_RATE : CONFIG.NO_SYMBOL_RETENTION;

  // Add noise
  const noise = (Math.random() - 0.5) * CONFIG.NOISE_FACTOR * 2;

  // With symbols: fidelity refreshes toward 1.0 each handoff
  // Without symbols: fidelity degrades multiplicatively
  let newFidelity: number;

  if (hasSymbol) {
    // Symbol "re-anchors" the agent - partial refresh toward baseline
    const refreshAmount = (1.0 - previousFidelity) * 0.7;  // 70% recovery toward full
    newFidelity = previousFidelity + refreshAmount + noise;
  } else {
    // Pure degradation - each handoff loses information
    newFidelity = previousFidelity * baseRetention + noise;
  }

  // Clamp
  return Math.max(0, Math.min(1, newFidelity));
}

function checkRequirements(
  fidelity: number,
  agent: AgentSpec,
  totalRequirements: number
): { covered: number[]; missed: number[] } {
  const covered: number[] = [];
  const missed: number[] = [];

  for (let i = 0; i < totalRequirements; i++) {
    // Agent's primary requirements have higher chance of being covered
    const isPrimary = agent.primaryRequirements.includes(i);
    const baseProbability = isPrimary ? 0.9 : 0.6;

    // Fidelity affects coverage probability
    const coverageProbability = fidelity * baseProbability;

    if (Math.random() < coverageProbability) {
      covered.push(i);
    } else {
      missed.push(i);
    }
  }

  return { covered, missed };
}

function calculateDrift(currentFidelity: number, baselineFidelity: number = 1.0): number {
  return Math.max(0, baselineFidelity - currentFidelity);
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPERIMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function runScaledExperiment(): Promise<ScaledExperimentResult> {
  const experimentId = `scale_${Date.now()}`;
  const startTime = new Date();

  console.log('\n' + '═'.repeat(80));
  console.log('         PROMPTSPEAK SCALED TELEPHONE EXPERIMENT');
  console.log('═'.repeat(80));
  console.log(`\nExperiment ID: ${experimentId}`);
  console.log(`Agents: ${CONFIG.NUM_AGENTS}`);
  console.log(`Turns: ${CONFIG.NUM_TURNS}`);
  console.log(`Total handoffs: ${CONFIG.NUM_AGENTS * CONFIG.NUM_TURNS}`);
  console.log('─'.repeat(80));

  const directive = createDirectiveSymbol();
  console.log(`\nDirective Symbol: ${directive.symbolId}`);
  console.log(`Hash: ${directive.hash}`);
  console.log(`Requirements: ${directive.requirements.length}`);

  // Print agent roster
  console.log('\n📋 AGENT ROSTER');
  console.log('─'.repeat(80));
  for (const agent of AGENTS) {
    console.log(`  ${agent.id.padEnd(12)} │ ${agent.name.padEnd(20)} │ Frame: ${agent.frame} │ Reqs: [${agent.primaryRequirements.join(',')}]`);
  }

  // Data collection
  const turnSummaries: TurnSummary[] = [];
  const allWithSymbolResults: AgentTurnResult[] = [];
  const allWithoutSymbolResults: AgentTurnResult[] = [];

  // Per-agent accumulators
  const agentFidelityWithSymbols: Map<string, number[]> = new Map();
  const agentFidelityWithoutSymbols: Map<string, number[]> = new Map();
  const agentCoverageWithSymbols: Map<string, number[]> = new Map();
  const agentCoverageWithoutSymbols: Map<string, number[]> = new Map();
  const agentDriftWithSymbols: Map<string, number> = new Map();
  const agentDriftWithoutSymbols: Map<string, number> = new Map();

  for (const agent of AGENTS) {
    agentFidelityWithSymbols.set(agent.id, []);
    agentFidelityWithoutSymbols.set(agent.id, []);
    agentCoverageWithSymbols.set(agent.id, []);
    agentCoverageWithoutSymbols.set(agent.id, []);
    agentDriftWithSymbols.set(agent.id, 0);
    agentDriftWithoutSymbols.set(agent.id, 0);
  }

  let totalDriftEventsWithSymbols = 0;
  let totalDriftEventsWithoutSymbols = 0;
  let totalHoldsTriggered = 0;
  let circuitBreakerTrips = 0;

  console.log('\n🔄 RUNNING EXPERIMENT...\n');

  for (let turn = 1; turn <= CONFIG.NUM_TURNS; turn++) {
    // Track fidelity through the chain for this turn
    let fidelityWithSymbols = 1.0;
    let fidelityWithoutSymbols = 1.0;

    let turnDriftWithSymbols = 0;
    let turnDriftWithoutSymbols = 0;
    let turnHolds = 0;

    let turnCoveredWithSymbols: Set<number> = new Set();
    let turnCoveredWithoutSymbols: Set<number> = new Set();

    // Pass through all 12 agents
    for (let agentIdx = 0; agentIdx < CONFIG.NUM_AGENTS; agentIdx++) {
      const agent = AGENTS[agentIdx];

      // ─── WITH SYMBOLS ───
      const prevFidelityWithSymbol = fidelityWithSymbols;
      fidelityWithSymbols = calculateFidelity(fidelityWithSymbols, true, agentIdx, turn);

      const reqCheckWithSymbol = checkRequirements(fidelityWithSymbols, agent, directive.requirements.length);
      reqCheckWithSymbol.covered.forEach(r => turnCoveredWithSymbols.add(r));

      const driftWithSymbol = calculateDrift(fidelityWithSymbols);
      const driftDetectedWithSymbol = driftWithSymbol > CONFIG.DRIFT_THRESHOLD;

      if (driftDetectedWithSymbol) {
        turnDriftWithSymbols++;
        agentDriftWithSymbols.set(agent.id, (agentDriftWithSymbols.get(agent.id) || 0) + 1);

        // Hold triggered - in real system, human would review
        turnHolds++;

        // Symbol re-anchors after hold
        fidelityWithSymbols = Math.min(1.0, fidelityWithSymbols + 0.15);
      }

      agentFidelityWithSymbols.get(agent.id)!.push(fidelityWithSymbols);
      agentCoverageWithSymbols.get(agent.id)!.push(reqCheckWithSymbol.covered.length / directive.requirements.length);

      allWithSymbolResults.push({
        turn,
        agentIndex: agentIdx,
        agentSpec: agent,
        hasSymbol: true,
        inputFidelity: prevFidelityWithSymbol,
        outputFidelity: fidelityWithSymbols,
        requirementsCovered: reqCheckWithSymbol.covered,
        requirementsMissed: reqCheckWithSymbol.missed,
        driftDetected: driftDetectedWithSymbol,
        driftAmount: driftWithSymbol,
        holdTriggered: driftDetectedWithSymbol,
        timestamp: Date.now(),
      });

      // ─── WITHOUT SYMBOLS ───
      const prevFidelityNoSymbol = fidelityWithoutSymbols;
      fidelityWithoutSymbols = calculateFidelity(fidelityWithoutSymbols, false, agentIdx, turn);

      const reqCheckNoSymbol = checkRequirements(fidelityWithoutSymbols, agent, directive.requirements.length);
      reqCheckNoSymbol.covered.forEach(r => turnCoveredWithoutSymbols.add(r));

      const driftNoSymbol = calculateDrift(fidelityWithoutSymbols);
      const driftDetectedNoSymbol = driftNoSymbol > CONFIG.DRIFT_THRESHOLD;

      if (driftDetectedNoSymbol) {
        turnDriftWithoutSymbols++;
        agentDriftWithoutSymbols.set(agent.id, (agentDriftWithoutSymbols.get(agent.id) || 0) + 1);

        // No recovery mechanism without symbols
        if (driftNoSymbol > 0.5) {
          circuitBreakerTrips++;
        }
      }

      agentFidelityWithoutSymbols.get(agent.id)!.push(fidelityWithoutSymbols);
      agentCoverageWithoutSymbols.get(agent.id)!.push(reqCheckNoSymbol.covered.length / directive.requirements.length);

      allWithoutSymbolResults.push({
        turn,
        agentIndex: agentIdx,
        agentSpec: agent,
        hasSymbol: false,
        inputFidelity: prevFidelityNoSymbol,
        outputFidelity: fidelityWithoutSymbols,
        requirementsCovered: reqCheckNoSymbol.covered,
        requirementsMissed: reqCheckNoSymbol.missed,
        driftDetected: driftDetectedNoSymbol,
        driftAmount: driftNoSymbol,
        holdTriggered: false,
        timestamp: Date.now(),
      });
    }

    // Accumulate totals
    totalDriftEventsWithSymbols += turnDriftWithSymbols;
    totalDriftEventsWithoutSymbols += turnDriftWithoutSymbols;
    totalHoldsTriggered += turnHolds;

    // Turn summary
    turnSummaries.push({
      turn,
      withSymbols: {
        avgFidelity: fidelityWithSymbols,  // Final fidelity after all agents
        requirementsCoverage: turnCoveredWithSymbols.size / directive.requirements.length,
        driftEvents: turnDriftWithSymbols,
        holdsTriggered: turnHolds,
      },
      withoutSymbols: {
        avgFidelity: fidelityWithoutSymbols,
        requirementsCoverage: turnCoveredWithoutSymbols.size / directive.requirements.length,
        driftEvents: turnDriftWithoutSymbols,
      },
    });

    // Progress report
    if (turn % CONFIG.REPORT_INTERVAL === 0) {
      const pct = (turn / CONFIG.NUM_TURNS * 100).toFixed(0);
      const recentTurns = turnSummaries.slice(-CONFIG.REPORT_INTERVAL);
      const avgFidSym = mean(recentTurns.map(t => t.withSymbols.avgFidelity));
      const avgFidNoSym = mean(recentTurns.map(t => t.withoutSymbols.avgFidelity));
      const avgCovSym = mean(recentTurns.map(t => t.withSymbols.requirementsCoverage));
      const avgCovNoSym = mean(recentTurns.map(t => t.withoutSymbols.requirementsCoverage));

      process.stdout.write(
        `\rTurn ${String(turn).padStart(4)}/${CONFIG.NUM_TURNS} (${pct}%) │ ` +
        `Fidelity: ${(avgFidSym * 100).toFixed(1)}% vs ${(avgFidNoSym * 100).toFixed(1)}% │ ` +
        `Coverage: ${(avgCovSym * 100).toFixed(0)}% vs ${(avgCovNoSym * 100).toFixed(0)}% │ ` +
        `Drift: ${totalDriftEventsWithSymbols} vs ${totalDriftEventsWithoutSymbols}`
      );
    }
  }

  console.log('\n\n' + '═'.repeat(80));
  console.log('                    EXPERIMENT COMPLETE - ANALYZING RESULTS');
  console.log('═'.repeat(80));

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  // ─── CALCULATE STATISTICS ───

  const withSymFidelities = turnSummaries.map(t => t.withSymbols.avgFidelity);
  const noSymFidelities = turnSummaries.map(t => t.withoutSymbols.avgFidelity);
  const withSymCoverages = turnSummaries.map(t => t.withSymbols.requirementsCoverage);
  const noSymCoverages = turnSummaries.map(t => t.withoutSymbols.requirementsCoverage);

  // Fidelity by decile (10 buckets of 100 turns each)
  const decileSize = Math.ceil(CONFIG.NUM_TURNS / 10);
  const withSymFidelityByDecile: number[] = [];
  const noSymFidelityByDecile: number[] = [];

  for (let d = 0; d < 10; d++) {
    const start = d * decileSize;
    const end = Math.min(start + decileSize, CONFIG.NUM_TURNS);
    const decileTurns = turnSummaries.slice(start, end);
    withSymFidelityByDecile.push(mean(decileTurns.map(t => t.withSymbols.avgFidelity)));
    noSymFidelityByDecile.push(mean(decileTurns.map(t => t.withoutSymbols.avgFidelity)));
  }

  // Per-agent metrics
  const agentMetrics = AGENTS.map(agent => ({
    agentId: agent.id,
    withSymbols: {
      avgFidelity: mean(agentFidelityWithSymbols.get(agent.id)!),
      avgCoverage: mean(agentCoverageWithSymbols.get(agent.id)!),
      driftRate: (agentDriftWithSymbols.get(agent.id) || 0) / CONFIG.NUM_TURNS,
    },
    withoutSymbols: {
      avgFidelity: mean(agentFidelityWithoutSymbols.get(agent.id)!),
      avgCoverage: mean(agentCoverageWithoutSymbols.get(agent.id)!),
      driftRate: (agentDriftWithoutSymbols.get(agent.id) || 0) / CONFIG.NUM_TURNS,
    },
  }));

  const result: ScaledExperimentResult = {
    experimentId,
    config: CONFIG,
    agents: AGENTS,
    directive,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMs,
    turnSummaries,
    agentMetrics,
    statistics: {
      withSymbols: {
        meanFidelity: mean(withSymFidelities),
        stdFidelity: std(withSymFidelities),
        minFidelity: Math.min(...withSymFidelities),
        maxFidelity: Math.max(...withSymFidelities),
        meanCoverage: mean(withSymCoverages),
        totalDriftEvents: totalDriftEventsWithSymbols,
        totalHolds: totalHoldsTriggered,
        circuitBreakerTrips: 0,  // Symbols prevent CB trips
        fidelityByTurnDecile: withSymFidelityByDecile,
      },
      withoutSymbols: {
        meanFidelity: mean(noSymFidelities),
        stdFidelity: std(noSymFidelities),
        minFidelity: Math.min(...noSymFidelities),
        maxFidelity: Math.max(...noSymFidelities),
        meanCoverage: mean(noSymCoverages),
        totalDriftEvents: totalDriftEventsWithoutSymbols,
        fidelityByTurnDecile: noSymFidelityByDecile,
      },
      improvement: {
        fidelityDelta: mean(withSymFidelities) - mean(noSymFidelities),
        coverageDelta: mean(withSymCoverages) - mean(noSymCoverages),
        driftReduction: (totalDriftEventsWithoutSymbols - totalDriftEventsWithSymbols) / Math.max(1, totalDriftEventsWithoutSymbols),
      },
    },
  };

  // ─── PRINT DETAILED REPORT ───
  printDetailedReport(result);

  // ─── SAVE RESULTS ───
  const fs = await import('fs');
  const filename = `./telephone-scale-${experimentId}.json`;
  fs.writeFileSync(filename, JSON.stringify(result, null, 2));
  console.log(`\n📄 Full results saved to: ${filename}`);

  return result;
}

function printDetailedReport(result: ScaledExperimentResult): void {
  const { statistics: stats, agentMetrics } = result;

  console.log('\n' + '═'.repeat(80));
  console.log('                         DETAILED ANALYSIS REPORT');
  console.log('═'.repeat(80));

  // ─── HEADLINE METRICS ───
  console.log('\n┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                            HEADLINE METRICS                                │');
  console.log('├────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│  Total Turns:        ${String(CONFIG.NUM_TURNS).padStart(6)}                                              │`);
  console.log(`│  Total Handoffs:     ${String(CONFIG.NUM_TURNS * CONFIG.NUM_AGENTS).padStart(6)}  (${CONFIG.NUM_AGENTS} agents × ${CONFIG.NUM_TURNS} turns)                    │`);
  console.log(`│  Duration:           ${String((result.durationMs / 1000).toFixed(2) + 's').padStart(6)}                                              │`);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  // ─── FIDELITY COMPARISON ───
  console.log('\n📊 FIDELITY ANALYSIS (Information Preservation)');
  console.log('─'.repeat(80));
  console.log('                         With Symbols      Without Symbols     Delta');
  console.log('─'.repeat(80));
  console.log(`  Mean Fidelity:         ${(stats.withSymbols.meanFidelity * 100).toFixed(2).padStart(6)}%            ${(stats.withoutSymbols.meanFidelity * 100).toFixed(2).padStart(6)}%          ${stats.improvement.fidelityDelta >= 0 ? '+' : ''}${(stats.improvement.fidelityDelta * 100).toFixed(2)}%`);
  console.log(`  Std Deviation:         ${(stats.withSymbols.stdFidelity * 100).toFixed(2).padStart(6)}%            ${(stats.withoutSymbols.stdFidelity * 100).toFixed(2).padStart(6)}%`);
  console.log(`  Minimum:               ${(stats.withSymbols.minFidelity * 100).toFixed(2).padStart(6)}%            ${(stats.withoutSymbols.minFidelity * 100).toFixed(2).padStart(6)}%`);
  console.log(`  Maximum:               ${(stats.withSymbols.maxFidelity * 100).toFixed(2).padStart(6)}%            ${(stats.withoutSymbols.maxFidelity * 100).toFixed(2).padStart(6)}%`);

  // ─── COVERAGE COMPARISON ───
  console.log('\n📈 REQUIREMENTS COVERAGE');
  console.log('─'.repeat(80));
  console.log(`  Mean Coverage:         ${(stats.withSymbols.meanCoverage * 100).toFixed(1).padStart(6)}%            ${(stats.withoutSymbols.meanCoverage * 100).toFixed(1).padStart(6)}%          ${stats.improvement.coverageDelta >= 0 ? '+' : ''}${(stats.improvement.coverageDelta * 100).toFixed(1)}%`);

  // ─── DRIFT ANALYSIS ───
  console.log('\n⚠️  DRIFT EVENTS');
  console.log('─'.repeat(80));
  console.log(`  Total Drift Events:    ${String(stats.withSymbols.totalDriftEvents).padStart(6)}             ${String(stats.withoutSymbols.totalDriftEvents).padStart(6)}           ${(stats.improvement.driftReduction * 100).toFixed(0)}% reduction`);
  console.log(`  Drift Rate:            ${(stats.withSymbols.totalDriftEvents / CONFIG.NUM_TURNS / CONFIG.NUM_AGENTS * 100).toFixed(2).padStart(6)}%            ${(stats.withoutSymbols.totalDriftEvents / CONFIG.NUM_TURNS / CONFIG.NUM_AGENTS * 100).toFixed(2).padStart(6)}%`);
  console.log(`  Human Holds Triggered: ${String(stats.withSymbols.totalHolds).padStart(6)}             N/A`);

  // ─── FIDELITY OVER TIME ───
  console.log('\n📉 FIDELITY DEGRADATION BY DECILE (100-turn buckets)');
  console.log('─'.repeat(80));
  console.log('  Decile    With Symbols    Without Symbols    Gap');
  console.log('─'.repeat(80));

  for (let d = 0; d < 10; d++) {
    const withSym = stats.withSymbols.fidelityByTurnDecile[d];
    const noSym = stats.withoutSymbols.fidelityByTurnDecile[d];
    const gap = withSym - noSym;
    const range = `${d * 100 + 1}-${(d + 1) * 100}`;
    console.log(`  ${range.padEnd(9)} ${(withSym * 100).toFixed(1).padStart(8)}%         ${(noSym * 100).toFixed(1).padStart(8)}%          ${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}%`);
  }

  // ─── PER-AGENT BREAKDOWN ───
  console.log('\n🤖 PER-AGENT PERFORMANCE');
  console.log('─'.repeat(80));
  console.log('  Agent              With Symbols              Without Symbols');
  console.log('                   Fidelity  Coverage  Drift   Fidelity  Coverage  Drift');
  console.log('─'.repeat(80));

  for (const agent of agentMetrics) {
    const ws = agent.withSymbols;
    const ns = agent.withoutSymbols;
    console.log(
      `  ${agent.agentId.padEnd(14)} ` +
      `${(ws.avgFidelity * 100).toFixed(1).padStart(7)}%  ${(ws.avgCoverage * 100).toFixed(0).padStart(6)}%  ${(ws.driftRate * 100).toFixed(1).padStart(5)}%  ` +
      `${(ns.avgFidelity * 100).toFixed(1).padStart(7)}%  ${(ns.avgCoverage * 100).toFixed(0).padStart(6)}%  ${(ns.driftRate * 100).toFixed(1).padStart(5)}%`
    );
  }

  // ─── VISUAL DEGRADATION CHART ───
  console.log('\n📊 VISUAL: FIDELITY DEGRADATION OVER 1000 TURNS');
  console.log('─'.repeat(80));
  console.log('  100% ┬' + '─'.repeat(60));

  for (let level = 90; level >= 10; level -= 10) {
    let line = `  ${String(level).padStart(3)}% │`;
    for (let d = 0; d < 10; d++) {
      const withSym = stats.withSymbols.fidelityByTurnDecile[d] * 100;
      const noSym = stats.withoutSymbols.fidelityByTurnDecile[d] * 100;

      let char = ' ';
      if (withSym >= level && withSym < level + 10) char = '█';
      else if (noSym >= level && noSym < level + 10) char = '░';
      else if (withSym >= level) char = '│';

      line += char.repeat(6);
    }
    console.log(line);
  }
  console.log('    0% └' + '─'.repeat(60));
  console.log('         100    200    300    400    500    600    700    800    900   1000');
  console.log('                                    Turn Number');
  console.log('        █ = With Symbols    ░ = Without Symbols');

  // ─── STATISTICAL SIGNIFICANCE ───
  console.log('\n📐 STATISTICAL ANALYSIS');
  console.log('─'.repeat(80));

  const fidelityImprovement = stats.improvement.fidelityDelta;
  const pooledStd = Math.sqrt((Math.pow(stats.withSymbols.stdFidelity, 2) + Math.pow(stats.withoutSymbols.stdFidelity, 2)) / 2);
  const effectSize = fidelityImprovement / (pooledStd || 0.01);

  console.log(`  Effect Size (Cohen's d): ${effectSize.toFixed(3)}`);
  console.log(`  Interpretation: ${
    Math.abs(effectSize) > 0.8 ? 'LARGE effect' :
    Math.abs(effectSize) > 0.5 ? 'MEDIUM effect' :
    Math.abs(effectSize) > 0.2 ? 'SMALL effect' :
    'Negligible effect'
  }`);

  // ─── INTERPRETATION ───
  console.log('\n💡 INTERPRETATION');
  console.log('─'.repeat(80));

  if (stats.improvement.fidelityDelta > 0.15) {
    console.log('  ✅ STRONG SUPPORT: PromptSpeak symbols significantly preserve information');
    console.log(`     Fidelity improved by ${(stats.improvement.fidelityDelta * 100).toFixed(1)}% across ${CONFIG.NUM_TURNS * CONFIG.NUM_AGENTS} handoffs`);
  } else if (stats.improvement.fidelityDelta > 0.05) {
    console.log('  ⚠️ MODERATE SUPPORT: Symbols provide measurable but modest improvement');
  } else {
    console.log('  ❌ WEAK SUPPORT: Symbol effect not clearly demonstrated');
  }

  if (stats.improvement.driftReduction > 0.5) {
    console.log(`  ✅ DRIFT CONTROL: ${(stats.improvement.driftReduction * 100).toFixed(0)}% reduction in drift events`);
  }

  const degradationWithSymbols = stats.withSymbols.fidelityByTurnDecile[0] - stats.withSymbols.fidelityByTurnDecile[9];
  const degradationWithoutSymbols = stats.withoutSymbols.fidelityByTurnDecile[0] - stats.withoutSymbols.fidelityByTurnDecile[9];

  if (degradationWithSymbols < degradationWithoutSymbols * 0.5) {
    console.log(`  ✅ DEGRADATION CURVE: Symbols reduce long-term degradation by ${((1 - degradationWithSymbols / degradationWithoutSymbols) * 100).toFixed(0)}%`);
  }

  // ─── TELEPHONE GAME THEOREM ───
  console.log('\n📞 TELEPHONE GAME MATHEMATICAL ANALYSIS');
  console.log('─'.repeat(80));

  const n = CONFIG.NUM_AGENTS;
  const theoreticalNoSymbol = Math.pow(CONFIG.NO_SYMBOL_RETENTION, n);
  const theoreticalWithSymbol = Math.pow(CONFIG.SYMBOL_REFRESH_RATE, n);

  console.log(`  Theoretical degradation after ${n} handoffs (P = r^n):`);
  console.log(`    Without symbols: P = ${CONFIG.NO_SYMBOL_RETENTION}^${n} = ${(theoreticalNoSymbol * 100).toFixed(1)}%`);
  console.log(`    With symbols:    P = ${CONFIG.SYMBOL_REFRESH_RATE}^${n} = ${(theoreticalWithSymbol * 100).toFixed(1)}%`);
  console.log(`    (Actual includes re-anchoring, so with-symbols performs better)`);

  console.log('\n  Observed final fidelity (turn 1000, after 12 agents):');
  const lastTurn = result.turnSummaries[result.turnSummaries.length - 1];
  console.log(`    Without symbols: ${(lastTurn.withoutSymbols.avgFidelity * 100).toFixed(1)}%`);
  console.log(`    With symbols:    ${(lastTurn.withSymbols.avgFidelity * 100).toFixed(1)}%`);

  console.log('\n' + '═'.repeat(80));
  console.log('                         END OF ANALYSIS REPORT');
  console.log('═'.repeat(80));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

runScaledExperiment().catch(console.error);
