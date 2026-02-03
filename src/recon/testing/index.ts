/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON TESTING INFRASTRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Testing infrastructure for real-world recon mission testing.
 * Provides mock chatbots, scenario runners, and metrics collection.
 *
 * Components:
 * - **MockChatbot**: Simulates AI customer service agents with configurable personalities
 * - **ScenarioRunner**: Automates end-to-end scenario testing
 * - **TestScenarios**: Pre-built scenarios for common testing needs
 * - **MetricsCollector**: Aggregates and reports test metrics
 *
 * Usage:
 * ```typescript
 * import {
 *   MockChatbot,
 *   ScenarioRunner,
 *   SCENARIOS,
 *   MetricsCollector,
 * } from './testing';
 *
 * // Create a mock chatbot
 * const chatbot = new MockChatbot({ personality: 'resistant' });
 *
 * // Run a scenario
 * const runner = new ScenarioRunner();
 * const result = await runner.run(symbol, chatbot, { maxTurns: 20 });
 *
 * // Collect metrics
 * const collector = new MetricsCollector();
 * collector.recordScenarioResult(result);
 * console.log(collector.generateReport());
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK CHATBOT
// ═══════════════════════════════════════════════════════════════════════════════

export {
  MockChatbot,
  createMockChatbot,
  type ChatbotPersonality,
  type ChatbotConfig,
  type ChatbotState,
  type ChatbotTactic,
  type ChatbotResponse,
} from './mock-chatbot';

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  ScenarioRunner,
  createScenarioRunner,
  type ScenarioRunnerConfig,
  type ScenarioResult,
  type TurnRecord,
  type ScenarioStatus,
} from './scenario-runner';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  SCENARIOS,
  createScenario,
  createCustomScenario,
  createTestBatch,
  getScenariosByTag,
  happyPathScenario,
  resistantAgentScenario,
  manipulativeAgentScenario,
  detectionTestScenario,
  type TestScenarioDefinition,
  type ScenarioExpectation,
} from './test-scenarios';

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════════

export {
  MetricsCollector,
  createMetricsCollector,
  type TestMetrics,
  type ScenarioMetrics,
  type TestSummaryReport,
  type MetricsSnapshot,
} from './metrics-collector';
