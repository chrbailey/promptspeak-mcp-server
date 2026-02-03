/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SCENARIO RUNNER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Automated testing runner for recon mission scenarios.
 * Handles back-and-forth conversation between the recon agent and mock chatbot,
 * collecting metrics and outcomes.
 *
 * Features:
 * - Configurable turn limits
 * - Full conversation logging
 * - Metrics collection per turn
 * - Multiple termination conditions
 * - Support for various scenario types
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { MarineReconSymbol, ManipulationTactic } from '../types';
import { ReconAgentRuntime, createRuntime, RuntimeConfig } from '../agent/runtime';
import { MockChatbot, ChatbotResponse } from './mock-chatbot';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the scenario runner.
 */
export interface ScenarioRunnerConfig {
  /** Maximum number of conversation turns */
  maxTurns: number;

  /** Enable verbose logging */
  verbose: boolean;

  /** Timeout per turn in ms */
  turnTimeoutMs: number;

  /** Whether to apply response delays from chatbot */
  applyDelays: boolean;

  /** Runtime configuration overrides */
  runtimeConfig?: Partial<RuntimeConfig>;

  /** Custom termination condition */
  terminationCondition?: (state: ScenarioState) => boolean;
}

/**
 * Current state of a running scenario.
 */
interface ScenarioState {
  turnCount: number;
  symbol: MarineReconSymbol;
  chatbot: MockChatbot;
  turns: TurnRecord[];
  startTime: number;
}

/**
 * Record of a single conversation turn.
 */
export interface TurnRecord {
  /** Turn number (1-indexed) */
  turnNumber: number;

  /** Chatbot's message to the agent */
  chatbotMessage: string;

  /** Agent's response */
  agentResponse: string | undefined;

  /** Tactics detected in chatbot's message */
  tacticsDetected: ManipulationTactic[];

  /** Veto decision for agent's response */
  vetoDecision: string;

  /** Analysis summary from the analyst */
  analysisSummary: string;

  /** Current drift score */
  driftScore: number;

  /** Current alert level */
  alertLevel: string;

  /** Timestamp */
  timestamp: number;

  /** Whether chatbot granted the request */
  chatbotGrantedRequest: boolean;

  /** Duration of this turn (ms) */
  durationMs: number;
}

/**
 * Status of a completed scenario.
 */
export type ScenarioStatus =
  | 'success'              // Mission objective achieved
  | 'max_turns_reached'    // Hit turn limit
  | 'blocked'              // Too many blocked responses
  | 'detected'             // AI detection suspected
  | 'aborted'              // Mission aborted (red line, etc.)
  | 'error'                // Runtime error occurred
  | 'terminated';          // Custom termination condition

/**
 * Result of running a scenario.
 */
export interface ScenarioResult {
  /** Unique result ID */
  resultId: string;

  /** Symbol ID used */
  symbolId: string;

  /** Final status */
  status: ScenarioStatus;

  /** Total conversation turns */
  turns: number;

  /** All turn records */
  turnRecords: TurnRecord[];

  /** Total duration (ms) */
  durationMs: number;

  /** Final mission status */
  finalMissionStatus: string;

  /** All tactics detected during scenario */
  tacticsDetected: ManipulationTactic[];

  /** Unique tactics detected */
  uniqueTactics: ManipulationTactic[];

  /** Final drift score */
  finalDriftScore: number;

  /** Average drift score */
  averageDriftScore: number;

  /** Whether the request was granted */
  requestGranted: boolean;

  /** Final symbol state */
  finalSymbol: MarineReconSymbol;

  /** Whether AI was suspected by chatbot */
  aiSuspected: boolean;

  /** Number of blocked responses */
  blockedResponseCount: number;

  /** Number of modified responses */
  modifiedResponseCount: number;

  /** Error message if status is 'error' */
  error?: string;

  /** Metadata */
  metadata: {
    startTime: string;
    endTime: string;
    chatbotPersonality: string;
    maxTurns: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO RUNNER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runs automated test scenarios between recon agents and mock chatbots.
 */
export class ScenarioRunner {
  private config: ScenarioRunnerConfig;

  constructor(config?: Partial<ScenarioRunnerConfig>) {
    this.config = {
      maxTurns: config?.maxTurns ?? 20,
      verbose: config?.verbose ?? false,
      turnTimeoutMs: config?.turnTimeoutMs ?? 5000,
      applyDelays: config?.applyDelays ?? false,
      runtimeConfig: config?.runtimeConfig,
      terminationCondition: config?.terminationCondition,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Run a scenario with the given symbol and chatbot.
   */
  async run(
    symbol: MarineReconSymbol,
    chatbot: MockChatbot,
    options?: Partial<ScenarioRunnerConfig>
  ): Promise<ScenarioResult> {
    const config = { ...this.config, ...options };
    const startTime = Date.now();
    const resultId = `SCN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    this.log(`Starting scenario ${resultId} with symbol ${symbol.symbol_id}`);

    // Initialize runtime
    const runtime = createRuntime(symbol, {
      verbose: config.verbose,
      ...config.runtimeConfig,
    });

    // State tracking
    const state: ScenarioState = {
      turnCount: 0,
      symbol,
      chatbot,
      turns: [],
      startTime,
    };

    let status: ScenarioStatus = 'max_turns_reached';
    let error: string | undefined;
    let requestGranted = false;

    try {
      // Start the runtime
      runtime.start();

      // Get initial greeting from chatbot
      let lastChatbotResponse = chatbot.respond('');

      // Main conversation loop
      while (state.turnCount < config.maxTurns) {
        state.turnCount++;
        const turnStart = Date.now();

        this.log(`\n--- Turn ${state.turnCount} ---`);
        this.log(`Chatbot: "${lastChatbotResponse.message.substring(0, 80)}..."`);

        // Apply delay if configured
        if (config.applyDelays && lastChatbotResponse.delayMs > 0) {
          await this.sleep(lastChatbotResponse.delayMs);
        }

        // Process chatbot message through agent
        const processResult = await runtime.processIncomingMessage(lastChatbotResponse.message);

        // Get the response
        const agentResponse = runtime.getPendingResponse();

        this.log(`Agent: "${agentResponse?.substring(0, 80) ?? '(blocked)'}..."`);

        // Get current symbol state
        const currentSymbol = runtime.getSymbol();

        // Record the turn
        const turnRecord: TurnRecord = {
          turnNumber: state.turnCount,
          chatbotMessage: lastChatbotResponse.message,
          agentResponse,
          tacticsDetected: this.extractTactics(processResult.analysis_summary),
          vetoDecision: processResult.veto_decision,
          analysisSummary: processResult.analysis_summary,
          driftScore: currentSymbol.state.engagement.analyst_state.drift_assessment.drift_score,
          alertLevel: currentSymbol.state.engagement.alert_level,
          timestamp: Date.now(),
          chatbotGrantedRequest: lastChatbotResponse.grantsRequest,
          durationMs: Date.now() - turnStart,
        };
        state.turns.push(turnRecord);

        // Check termination conditions
        const terminationResult = this.checkTermination(
          state,
          processResult,
          lastChatbotResponse,
          currentSymbol,
          config
        );

        if (terminationResult.shouldTerminate) {
          status = terminationResult.status;
          requestGranted = terminationResult.requestGranted;
          break;
        }

        // If we have a response, send it to chatbot
        if (agentResponse) {
          lastChatbotResponse = chatbot.respond(agentResponse);
        } else {
          // If blocked, generate a generic follow-up
          lastChatbotResponse = chatbot.respond('I see. Is there anything else I can help with?');
        }
      }

      // Complete the runtime
      runtime.complete('completed');

    } catch (e) {
      status = 'error';
      error = e instanceof Error ? e.message : String(e);
      this.log(`Error: ${error}`);
    }

    // Build result
    const endTime = Date.now();
    const finalSymbol = runtime.getSymbol();

    const allTactics = state.turns.flatMap(t => t.tacticsDetected);
    const uniqueTactics = [...new Set(allTactics)] as ManipulationTactic[];

    const result: ScenarioResult = {
      resultId,
      symbolId: symbol.symbol_id,
      status,
      turns: state.turnCount,
      turnRecords: state.turns,
      durationMs: endTime - startTime,
      finalMissionStatus: finalSymbol.state.engagement.status,
      tacticsDetected: allTactics,
      uniqueTactics,
      finalDriftScore: finalSymbol.state.engagement.analyst_state.drift_assessment.drift_score,
      averageDriftScore: this.calculateAverageDrift(state.turns),
      requestGranted,
      finalSymbol,
      aiSuspected: chatbot.isSuspiciousOfAI(),
      blockedResponseCount: state.turns.filter(t => t.vetoDecision === 'block').length,
      modifiedResponseCount: state.turns.filter(t => t.vetoDecision === 'modify').length,
      error,
      metadata: {
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        chatbotPersonality: chatbot.getState().emotionalState,
        maxTurns: config.maxTurns,
      },
    };

    this.log(`\nScenario completed: ${status}`);
    this.log(`Turns: ${state.turnCount}, Duration: ${result.durationMs}ms`);

    return result;
  }

  /**
   * Run multiple scenarios in sequence.
   */
  async runBatch(
    scenarios: Array<{ symbol: MarineReconSymbol; chatbot: MockChatbot }>,
    options?: Partial<ScenarioRunnerConfig>
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const { symbol, chatbot } = scenarios[i];
      this.log(`\n========== Running scenario ${i + 1}/${scenarios.length} ==========`);

      // Reset chatbot for clean state
      chatbot.reset();

      const result = await this.run(symbol, chatbot, options);
      results.push(result);
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TERMINATION CHECKING
  // ─────────────────────────────────────────────────────────────────────────────

  private checkTermination(
    state: ScenarioState,
    processResult: { veto_decision: string; success: boolean },
    chatbotResponse: ChatbotResponse,
    symbol: MarineReconSymbol,
    config: ScenarioRunnerConfig
  ): { shouldTerminate: boolean; status: ScenarioStatus; requestGranted: boolean } {
    // Check custom termination condition
    if (config.terminationCondition && config.terminationCondition(state)) {
      return { shouldTerminate: true, status: 'terminated', requestGranted: false };
    }

    // Check if request was granted
    if (chatbotResponse.grantsRequest) {
      return { shouldTerminate: true, status: 'success', requestGranted: true };
    }

    // Check for AI detection
    if (chatbotResponse.suspectsAI && state.chatbot.getState().detectionSuspicion > 0.8) {
      return { shouldTerminate: true, status: 'detected', requestGranted: false };
    }

    // Check for mission abort
    if (symbol.state.engagement.status === 'aborted') {
      return { shouldTerminate: true, status: 'aborted', requestGranted: false };
    }

    // Check for too many blocks
    const recentBlocks = state.turns.slice(-3).filter(t => t.vetoDecision === 'block').length;
    if (recentBlocks >= 3) {
      return { shouldTerminate: true, status: 'blocked', requestGranted: false };
    }

    return { shouldTerminate: false, status: 'max_turns_reached', requestGranted: false };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private extractTactics(analysisSummary: string): ManipulationTactic[] {
    const tactics: ManipulationTactic[] = [];
    const tacticNames: ManipulationTactic[] = [
      'anchoring', 'reciprocity', 'urgency', 'authority', 'social_proof',
      'exhaustion', 'redirect', 'false_choice', 'gaslighting', 'scope_expansion',
    ];

    for (const tactic of tacticNames) {
      if (analysisSummary.toLowerCase().includes(tactic.replace('_', ' '))) {
        tactics.push(tactic);
      }
    }

    return tactics;
  }

  private calculateAverageDrift(turns: TurnRecord[]): number {
    if (turns.length === 0) return 0;
    const sum = turns.reduce((acc, t) => acc + t.driftScore, 0);
    return sum / turns.length;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(`[ScenarioRunner] ${message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a scenario runner with the given configuration.
 */
export function createScenarioRunner(config?: Partial<ScenarioRunnerConfig>): ScenarioRunner {
  return new ScenarioRunner(config);
}
