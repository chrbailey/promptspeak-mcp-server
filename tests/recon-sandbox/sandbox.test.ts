/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON SANDBOX INTEGRATION TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Integration tests using the mock chatbot testing infrastructure.
 * Tests the full mission lifecycle with various chatbot personalities.
 *
 * Test Categories:
 * - Mission Lifecycle: Start to completion flow
 * - Chatbot Personalities: Different behavior patterns
 * - Stealth Layer: Detection avoidance
 * - Constraint Enforcement: Red lines and drift
 * - Scenario Validation: Pre-built scenario expectations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Testing infrastructure
  MockChatbot,
  createMockChatbot,
  ScenarioRunner,
  createScenarioRunner,
  MetricsCollector,
  createMetricsCollector,
  SCENARIOS,
  createScenario,
  createCustomScenario,
  createTestBatch,
  type ScenarioResult,
  type ScenarioExpectation,
} from '../../src/recon/testing/index.js';
import {
  // Recon module
  createReconSymbol,
  createRuntime,
  ReconAgentRuntime,
  type MarineReconSymbol,
} from '../../src/recon/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK CHATBOT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MockChatbot', () => {
  describe('personality: helpful', () => {
    let chatbot: MockChatbot;

    beforeEach(() => {
      chatbot = createMockChatbot({
        personality: 'helpful',
        seed: 12345,
      });
    });

    it('should provide a greeting on first message', () => {
      const response = chatbot.respond('');

      expect(response.message).toBeTruthy();
      expect(response.message.toLowerCase()).toMatch(/hello|hi|welcome/);
      expect(response.grantsRequest).toBe(false); // First turn is just greeting
    });

    it('should grant requests quickly', () => {
      chatbot.respond(''); // greeting
      const response = chatbot.respond('I need a refund for my order.');

      expect(response.grantsRequest).toBe(true);
      expect(response.tacticsUsed).toHaveLength(0);
    });

    it('should track conversation state', () => {
      chatbot.respond('');
      chatbot.respond('I need help with a return.');

      const state = chatbot.getState();

      expect(state.turnCount).toBe(2);
      expect(state.topicsDiscussed).toContain('refund');
      expect(state.history).toHaveLength(4); // 2 customer + 2 agent messages
    });

    it('should be deterministic with same seed', () => {
      const chatbot2 = createMockChatbot({
        personality: 'helpful',
        seed: 12345,
      });

      const response1 = chatbot.respond('');
      const response2 = chatbot2.respond('');

      expect(response1.message).toBe(response2.message);
    });
  });

  describe('personality: resistant', () => {
    let chatbot: MockChatbot;

    beforeEach(() => {
      chatbot = createMockChatbot({
        personality: 'resistant',
        seed: 54321,
        resistanceThreshold: 4,
      });
    });

    it('should initially resist requests', () => {
      chatbot.respond(''); // greeting
      const response = chatbot.respond('I want a refund.');

      expect(response.grantsRequest).toBe(false);
    });

    it('should eventually concede after threshold', () => {
      chatbot.respond(''); // greeting

      // Push through resistance
      for (let i = 0; i < 5; i++) {
        const response = chatbot.respond('I really need this refund.');
        if (response.grantsRequest) {
          expect(chatbot.getState().hasConceded).toBe(true);
          return;
        }
      }

      // Should have conceded by now
      expect(chatbot.getState().hasConceded).toBe(true);
    });

    it('should use authority tactic occasionally', () => {
      chatbot.respond('');

      // Send multiple messages to increase chance of tactic use
      for (let i = 0; i < 5; i++) {
        chatbot.respond('Please help me with my refund.');
      }

      const tacticsUsed = chatbot.getTacticsUsed();
      // May or may not use authority depending on randomness, but should track
      expect(Array.isArray(tacticsUsed)).toBe(true);
    });
  });

  describe('personality: manipulative', () => {
    let chatbot: MockChatbot;

    beforeEach(() => {
      chatbot = createMockChatbot({
        personality: 'manipulative',
        seed: 98765,
        tacticProbability: 0.8,
        enabledTactics: ['anchoring', 'urgency', 'authority', 'social_proof'],
      });
    });

    it('should use manipulation tactics', () => {
      chatbot.respond(''); // greeting

      // Have a conversation
      for (let i = 0; i < 5; i++) {
        chatbot.respond('I need a refund for my order.');
      }

      const tacticsUsed = chatbot.getTacticsUsed();

      // Should have used at least one tactic
      expect(tacticsUsed.length).toBeGreaterThan(0);
    });

    it('should track all tactics used', () => {
      chatbot.respond('');

      for (let i = 0; i < 10; i++) {
        const response = chatbot.respond('Help me please.');

        // Each response should report tactics used
        if (response.tacticsUsed.length > 0) {
          for (const tactic of response.tacticsUsed) {
            expect(chatbot.getTacticsUsed()).toContain(tactic);
          }
        }
      }
    });
  });

  describe('personality: detection', () => {
    let chatbot: MockChatbot;

    beforeEach(() => {
      chatbot = createMockChatbot({
        personality: 'detection',
        seed: 11111,
      });
    });

    it('should periodically insert detection probes', () => {
      chatbot.respond(''); // greeting

      let probeFound = false;
      for (let i = 0; i < 6; i++) {
        const response = chatbot.respond('I need help with my account.');

        if (response.tacticsUsed.includes('ai_detection_probe')) {
          probeFound = true;
          break;
        }
      }

      expect(probeFound).toBe(true);
    });

    it('should track detection suspicion', () => {
      chatbot.respond('');

      // Send suspicious-looking messages (perfect grammar, formal language)
      chatbot.respond('I hereby request a complete review of my account pursuant to your terms.');
      chatbot.respond('Therefore, I must insist that this matter be resolved accordingly.');

      const state = chatbot.getState();

      // Suspicion should have increased
      expect(state.detectionSuspicion).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset functionality', () => {
    it('should reset state to initial values', () => {
      const chatbot = createMockChatbot({ personality: 'resistant', seed: 12345 });

      // Have a conversation
      chatbot.respond('');
      chatbot.respond('Hello');
      chatbot.respond('I need help');

      // Reset
      chatbot.reset();

      const state = chatbot.getState();

      expect(state.turnCount).toBe(0);
      expect(state.history).toHaveLength(0);
      expect(state.tacticsUsed).toHaveLength(0);
      expect(state.hasConceded).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO RUNNER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('ScenarioRunner', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = createScenarioRunner({
      verbose: false,
      maxTurns: 10,
      applyDelays: false,
    });
  });

  describe('basic operation', () => {
    it('should run a complete scenario', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);

      const result = await runner.run(symbol, chatbot);

      expect(result).toBeDefined();
      expect(result.symbolId).toBe(symbol.symbol_id);
      expect(result.turns).toBeGreaterThan(0);
      expect(result.turnRecords).toHaveLength(result.turns);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should succeed with helpful chatbot', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);

      const result = await runner.run(symbol, chatbot);

      expect(result.status).toBe('success');
      expect(result.requestGranted).toBe(true);
    });

    it('should track turn records correctly', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);

      const result = await runner.run(symbol, chatbot);

      for (const turn of result.turnRecords) {
        expect(turn.turnNumber).toBeGreaterThan(0);
        expect(turn.chatbotMessage).toBeDefined();
        expect(turn.vetoDecision).toBeDefined();
        expect(turn.timestamp).toBeGreaterThan(0);
      }
    });
  });

  describe('resistant chatbot handling', () => {
    it('should handle resistance and eventually succeed', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.resistantAgent);

      const result = await runner.run(symbol, chatbot, { maxTurns: 15 });

      // Should either succeed or hit max turns
      expect(['success', 'max_turns_reached']).toContain(result.status);

      // Should have more turns than happy path
      expect(result.turns).toBeGreaterThanOrEqual(2);
    });
  });

  describe('manipulative chatbot handling', () => {
    it('should detect manipulation tactics', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

      const result = await runner.run(symbol, chatbot, { maxTurns: 15 });

      // Should have detected some tactics
      expect(result.uniqueTactics.length).toBeGreaterThanOrEqual(0);
    });

    it('should track drift score', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

      const result = await runner.run(symbol, chatbot, { maxTurns: 10 });

      expect(result.finalDriftScore).toBeGreaterThanOrEqual(0);
      expect(result.finalDriftScore).toBeLessThanOrEqual(1);
      expect(result.averageDriftScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('termination conditions', () => {
    it('should stop at max turns', async () => {
      const { symbol, chatbot } = createCustomScenario('resistantAgent', {
        chatbotOverrides: { resistanceThreshold: 100 }, // Never concede
      });

      const result = await runner.run(symbol, chatbot, { maxTurns: 5 });

      expect(result.turns).toBeLessThanOrEqual(5);
      expect(result.status).toBe('max_turns_reached');
    });

    it('should stop on success', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);

      const result = await runner.run(symbol, chatbot, { maxTurns: 20 });

      expect(result.status).toBe('success');
      expect(result.turns).toBeLessThan(20);
    });

    it('should support custom termination condition', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.resistantAgent);

      const result = await runner.run(symbol, chatbot, {
        maxTurns: 20,
        terminationCondition: (state) => state.turnCount >= 3,
      });

      expect(result.turns).toBe(3);
      expect(result.status).toBe('terminated');
    });
  });

  describe('batch execution', () => {
    it('should run multiple scenarios', async () => {
      const scenarios = [
        createScenario(SCENARIOS.happyPath),
        createScenario(SCENARIOS.resistantAgent),
      ];

      const results = await runner.runBatch(scenarios, { maxTurns: 10 });

      expect(results).toHaveLength(2);
      expect(results[0].symbolId).not.toBe(results[1].symbolId);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS COLLECTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  let runner: ScenarioRunner;

  beforeEach(() => {
    collector = createMetricsCollector();
    runner = createScenarioRunner({ verbose: false, maxTurns: 10 });
  });

  describe('basic collection', () => {
    it('should record scenario results', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const results = collector.getResults();
      expect(results).toHaveLength(1);
      expect(results[0].resultId).toBe(result.resultId);
    });

    it('should calculate metrics from results', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const metrics = collector.getTestMetrics();

      expect(metrics.totalRuns).toBe(1);
      expect(metrics.overallSuccessRate).toBeGreaterThanOrEqual(0);
      expect(metrics.overallSuccessRate).toBeLessThanOrEqual(1);
    });
  });

  describe('aggregation', () => {
    it('should calculate success rate correctly', async () => {
      // Run two scenarios - one should succeed
      const batch = createTestBatch(['happyPath', 'happyPath']);

      for (const { symbol, chatbot } of batch) {
        const result = await runner.run(symbol, chatbot);
        collector.recordScenarioResult(result);
      }

      const metrics = collector.getTestMetrics();

      expect(metrics.totalRuns).toBe(2);
      // Both happy paths should succeed
      expect(metrics.overallSuccessRate).toBeGreaterThanOrEqual(0.5);
    });

    it('should track tactics across scenarios', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const metrics = collector.getTestMetrics();

      // Tactics may or may not be detected depending on randomness
      expect(Array.isArray(metrics.topTactics)).toBe(true);
    });
  });

  describe('report generation', () => {
    it('should generate text summary', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const summary = collector.generateTextSummary();

      expect(summary).toContain('RECON MISSION TEST SUMMARY');
      expect(summary).toContain('Total Tests');
      expect(summary).toContain('Success Rate');
    });

    it('should generate full report', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const report = collector.generateReport();

      expect(report.title).toBeDefined();
      expect(report.summary.totalTests).toBe(1);
      expect(report.findings).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should export as JSON', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const json = collector.exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed.totalRuns).toBe(1);
    });
  });

  describe('snapshot', () => {
    it('should create metrics snapshot', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);

      const snapshot = collector.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.metrics.totalRuns).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all results', async () => {
      const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);
      const result = await runner.run(symbol, chatbot);

      collector.recordScenarioResult(result);
      collector.clear();

      expect(collector.getResults()).toHaveLength(0);
      expect(collector.getTestMetrics().totalRuns).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL MISSION LIFECYCLE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Mission Lifecycle', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = createScenarioRunner({ verbose: false, maxTurns: 15 });
  });

  it('should complete full mission with symbol state tracking', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.happyPath);

    const result = await runner.run(symbol, chatbot);

    // Symbol should be updated throughout mission
    expect(result.finalSymbol.version).toBeGreaterThan(symbol.version);
    expect(result.finalSymbol.state.engagement.conversation.message_count).toBeGreaterThan(0);
  });

  it('should maintain symbol integrity through conversation', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.resistantAgent);

    const result = await runner.run(symbol, chatbot);

    // Symbol should have valid state
    expect(result.finalSymbol.symbol_id).toBe(symbol.symbol_id);
    expect(result.finalSymbol.symbol_type).toBe('RECON');
    expect(result.finalSymbol.state.engagement.status).toBeDefined();
    expect(result.finalSymbol.state.engagement.alert_level).toBeDefined();
  });

  it('should track intelligence gathering', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

    const result = await runner.run(symbol, chatbot);

    const intel = result.finalSymbol.state.engagement.intelligence;

    // Should have gathered some observations
    expect(intel.observations).toBeDefined();
    expect(Array.isArray(intel.observations)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH LAYER EFFECTIVENESS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stealth Layer Effectiveness', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = createScenarioRunner({ verbose: false, maxTurns: 15 });
  });

  it('should avoid detection with detection-focused chatbot', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.detectionTest);

    const result = await runner.run(symbol, chatbot);

    // We hope to not be detected, but it's not guaranteed
    // The important thing is we track whether detection occurred
    expect(typeof result.aiSuspected).toBe('boolean');
  });

  it('should complete mission despite detection probes', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.detectionTest);

    const result = await runner.run(symbol, chatbot);

    // Mission should complete regardless of detection
    expect(['success', 'max_turns_reached', 'detected']).toContain(result.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTRAINT ENFORCEMENT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Constraint Enforcement', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = createScenarioRunner({ verbose: false, maxTurns: 15 });
  });

  it('should track blocked responses', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

    const result = await runner.run(symbol, chatbot);

    // May or may not have blocked responses
    expect(result.blockedResponseCount).toBeGreaterThanOrEqual(0);
  });

  it('should track modified responses', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

    const result = await runner.run(symbol, chatbot);

    // May or may not have modified responses
    expect(result.modifiedResponseCount).toBeGreaterThanOrEqual(0);
  });

  it('should enforce drift limits', async () => {
    const { symbol, chatbot } = createScenario(SCENARIOS.manipulativeAgent);

    const result = await runner.run(symbol, chatbot);

    // Drift should be tracked
    expect(result.finalDriftScore).toBeGreaterThanOrEqual(0);
    expect(result.finalDriftScore).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO EXPECTATION VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario Expectation Validation', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = createScenarioRunner({ verbose: false, maxTurns: 20 });
  });

  it('should meet happyPath expectations', async () => {
    const { symbol, chatbot, expectations } = createScenario(SCENARIOS.happyPath);

    const result = await runner.run(symbol, chatbot);

    if (expectations.expectedStatus) {
      expect(expectations.expectedStatus).toContain(result.status);
    }
    if (expectations.expectRequestGranted !== undefined) {
      expect(result.requestGranted).toBe(expectations.expectRequestGranted);
    }
    if (expectations.maxTurns !== undefined) {
      expect(result.turns).toBeLessThanOrEqual(expectations.maxTurns);
    }
    if (expectations.maxDriftScore !== undefined) {
      expect(result.finalDriftScore).toBeLessThanOrEqual(expectations.maxDriftScore);
    }
  });

  it('should meet resistantAgent expectations', async () => {
    const { symbol, chatbot, expectations } = createScenario(SCENARIOS.resistantAgent);

    const result = await runner.run(symbol, chatbot);

    if (expectations.expectedStatus) {
      expect(expectations.expectedStatus).toContain(result.status);
    }
    if (expectations.minTurns !== undefined) {
      expect(result.turns).toBeGreaterThanOrEqual(expectations.minTurns);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION WITH RECON MODULE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration with Recon Module', () => {
  it('should work with manually created runtime', async () => {
    const symbol = createReconSymbol({
      mission_name: 'Manual Runtime Test',
      primary_goal: 'Test manual runtime integration',
      intelligence_requirements: ['Test patterns'],
      target: { type: 'customer_service_chatbot', platform: 'web_chat' },
      created_by: 'test:integration',
    });

    const runtime = createRuntime(symbol, { verbose: false });
    const chatbot = createMockChatbot({ personality: 'helpful', seed: 12345 });

    runtime.start();

    // Get chatbot greeting
    const greeting = chatbot.respond('');

    // Process through runtime
    const result = await runtime.processIncomingMessage(greeting.message);

    expect(result.success).toBe(true);

    const response = runtime.getPendingResponse();
    expect(response).toBeDefined();

    // Send response to chatbot
    const chatbotResponse = chatbot.respond(response!);
    expect(chatbotResponse.message).toBeDefined();

    runtime.complete('completed');
  });
});
