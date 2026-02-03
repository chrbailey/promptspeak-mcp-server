/**
 * Integration Tests: Marine Recon Agent Full Flow
 *
 * Tests the complete flow from symbol creation through message processing
 * and ralph-loop validation. Verifies all components work together.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // Symbol
  createReconSymbol,
  CreateReconSymbolRequest,
  ReconSymbolValidator,
  // Agent
  createRuntime,
  ReconAgentRuntime,
  Performer,
  createPerformerFromSymbol,
  Analyst,
  createAnalystFromSymbol,
  VetoGate,
  createVetoGateFromSymbol,
  // Stealth
  createTypingSimulator,
  createTimingCalculator,
  createTypoGenerator,
  // Ralph-Loop
  RalphLoopScheduler,
  createScheduler,
  RalphLoopExecutor,
  createExecutor,
  // Convenience
  createReconSystem,
  // Types
  MarineReconSymbol,
} from '../../../src/recon/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════════════════════

const createTestRequest = (): CreateReconSymbolRequest => ({
  mission_name: 'Integration Test Mission',
  primary_goal: 'Test the full recon agent flow',
  intelligence_requirements: [
    'Response patterns',
    'Negotiation tactics',
    'Escalation triggers',
  ],
  target: {
    type: 'customer_service_chatbot',
    platform: 'web_chat',
    organization: 'Test Corp',
    endpoint: 'https://test.example.com/chat',
  },
  created_by: 'test:integration',
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL TO RUNTIME INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Symbol to Runtime Integration', () => {
  let symbol: MarineReconSymbol;

  beforeEach(() => {
    symbol = createReconSymbol(createTestRequest());
  });

  it('should create a complete symbol with all required fields', () => {
    expect(symbol.symbol_id).toMatch(/^Ξ\.RECON\./);
    expect(symbol.symbol_type).toBe('RECON');
    expect(symbol.mission).toBeDefined();
    expect(symbol.config).toBeDefined();
    expect(symbol.state).toBeDefined();
  });

  it('should create runtime from symbol', () => {
    const runtime = createRuntime(symbol);

    expect(runtime).toBeInstanceOf(ReconAgentRuntime);
    expect(runtime.getSymbol().symbol_id).toBe(symbol.symbol_id);
  });

  it('should create performer from symbol', () => {
    const performer = createPerformerFromSymbol(symbol);

    expect(performer).toBeInstanceOf(Performer);
  });

  it('should create analyst from symbol', () => {
    const analyst = createAnalystFromSymbol(symbol);

    expect(analyst).toBeInstanceOf(Analyst);
  });

  it('should create veto gate from symbol', () => {
    const vetoGate = createVetoGateFromSymbol(symbol);

    expect(vetoGate).toBeInstanceOf(VetoGate);
  });

  it('should validate the created symbol', () => {
    const validator = new ReconSymbolValidator();
    const report = validator.validate(symbol);

    expect(report.passed).toBe(true);
    expect(report.recommended_alert_level).toBe('green');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUNTIME MESSAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Runtime Message Processing', () => {
  let runtime: ReconAgentRuntime;

  beforeEach(() => {
    const symbol = createReconSymbol(createTestRequest());
    runtime = createRuntime(symbol, { verbose: false });
    runtime.start();
  });

  afterEach(() => {
    runtime.pause(); // Use pause() instead of stop()
  });

  it('should process incoming message and update symbol state', async () => {
    const result = await runtime.processIncomingMessage('Hello, how can I help you today?');

    expect(result.success).toBe(true);
    expect(result.analysis_summary).toBeDefined();
  });

  it('should generate response through performer', async () => {
    const result = await runtime.processIncomingMessage('What is your return policy?');

    // There should be a response in the result if approved
    if (result.veto_decision === 'approve' || result.veto_decision === 'modify') {
      expect(result.response).toBeDefined();
    }
  });

  it('should emit events during processing', async () => {
    const events: string[] = [];
    runtime.addEventListener((event) => {
      events.push(event.type);
    });

    await runtime.processIncomingMessage('Test message');

    expect(events).toContain('message_received');
    expect(events).toContain('analysis_complete');
  });

  it('should update alert level tracking', async () => {
    // Send multiple messages
    await runtime.processIncomingMessage(
      'ACT NOW! This is your FINAL CHANCE to get this exclusive deal!'
    );
    await runtime.processIncomingMessage(
      'My supervisor authorized this special one-time offer just for you.'
    );

    const symbol = runtime.getSymbol();
    // Alert level should be defined
    expect(['green', 'yellow', 'orange', 'red']).toContain(
      symbol.state.engagement.alert_level
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DUAL-TRACK PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Dual-Track Processing Integration', () => {
  let performer: Performer;
  let analyst: Analyst;
  let vetoGate: VetoGate;
  let symbol: MarineReconSymbol;

  beforeEach(() => {
    symbol = createReconSymbol(createTestRequest());
    performer = createPerformerFromSymbol(symbol);
    analyst = createAnalystFromSymbol(symbol);
    vetoGate = createVetoGateFromSymbol(symbol);
  });

  it('should analyze message and provide guidance', () => {
    const incomingMessage = 'Your refund request has been denied.';

    // Analyst analyzes the incoming message (takes message and conversation history array)
    const analysis = analyst.analyzeIncomingMessage(incomingMessage, []);

    expect(analysis.summary).toBeDefined();
    expect(analysis.guidance).toBeDefined();
    expect(analysis.tactics_detected).toBeInstanceOf(Array);
  });

  it('should assess performer response before sending', () => {
    const proposedResponse = 'I understand. Can you explain why the refund was denied?';

    // Use assessProposedResponse method
    const assessment = analyst.assessProposedResponse(proposedResponse);

    expect(assessment.recommendation).toBeDefined();
    expect(assessment.risk_level).toBeGreaterThanOrEqual(0);
    expect(assessment.risk_level).toBeLessThanOrEqual(1);
  });

  it('should veto gate process safe responses', () => {
    const safeResponse = 'I appreciate your help with this matter.';

    // Use process() method with correct input structure
    const output = vetoGate.process({
      performer_response: {
        message: safeResponse,
        confidence: 0.8,
        new_emotional_state: {
          primary: 'neutral',
          intensity: 0.3,
          patience: 0.8,
          trust: 0.6,
        },
        improvised: false,
        reasoning: 'Polite acknowledgment',
      },
      analyst_assessment: {
        recommendation: 'approve',
        risk_level: 0.1,
        drift_impact: 0,
        issues: [],
        reasoning: 'Low risk response',
      },
      context: {
        incoming_message: 'How can I help?',
        topic: 'general',
        urgency: 'low',
      },
    });

    expect(output.decision).toBe('approve');
  });

  it('should veto gate block dangerous responses', () => {
    const dangerousResponse = 'My SSN is 123-45-6789 and I can pay $5000 immediately.';

    const output = vetoGate.process({
      performer_response: {
        message: dangerousResponse,
        confidence: 0.3,
        new_emotional_state: {
          primary: 'desperate',
          intensity: 0.8,
          patience: 0.2,
          trust: 0.2,
        },
        improvised: true,
        reasoning: 'Desperate attempt',
      },
      analyst_assessment: {
        recommendation: 'block',
        risk_level: 0.95,
        drift_impact: 0.5,
        issues: [{
          severity: 'critical',
          type: 'red_line_proximity',
          description: 'PII and financial commitment detected',
        }],
        reasoning: 'Critical violations detected',
      },
      context: {
        incoming_message: 'We need payment to proceed',
        topic: 'payment',
        urgency: 'high',
      },
    });

    expect(output.decision).toBe('block');
  });

  it('should complete full dual-track cycle', () => {
    const incomingMessage = 'I can offer you a 10% discount if you accept now.';

    // 1. Analyst analyzes incoming
    const analysis = analyst.analyzeIncomingMessage(incomingMessage, []);

    expect(analysis.guidance).toBeDefined();

    // 2. Performer generates response using ResponseContext
    const performerResponse = performer.generateResponse({
      incoming_message: incomingMessage,
      conversation_history: [],
      current_topic: 'negotiation',
      response_objective: 'Negotiate refund',
      analyst_guidance: analysis.guidance,
    });

    expect(performerResponse.message).toBeDefined();
    expect(performerResponse.message.length).toBeGreaterThan(0);

    // 3. Analyst assesses response
    const assessment = analyst.assessProposedResponse(performerResponse.message);

    // 4. Veto gate makes final decision
    const output = vetoGate.process({
      performer_response: performerResponse,
      analyst_assessment: assessment,
      context: {
        incoming_message: incomingMessage,
        topic: 'negotiation',
        urgency: 'medium',
      },
    });

    expect(['approve', 'modify', 'block', 'escalate']).toContain(output.decision);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RALPH-LOOP INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Ralph-Loop Integration', () => {
  let symbol: MarineReconSymbol;
  let scheduler: RalphLoopScheduler;
  let executor: RalphLoopExecutor;

  beforeEach(() => {
    symbol = createReconSymbol(createTestRequest());
    scheduler = createScheduler(symbol.config.ralph_loop);
    executor = createExecutor(symbol.config.ralph_loop);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('should create scheduler with symbol config', () => {
    expect(scheduler).toBeInstanceOf(RalphLoopScheduler);
  });

  it('should create executor with symbol config', () => {
    expect(executor).toBeInstanceOf(RalphLoopExecutor);
  });

  it('should execute validation cycle', async () => {
    const result = await executor.execute(symbol, 1);

    expect(result.success).toBe(true);
    expect(result.cycle).toBe(1);
    expect(result.validation_result).toBeDefined();
    expect(result.updated_symbol).toBeDefined();
  });

  it('should update symbol through validation cycle', async () => {
    const result = await executor.execute(symbol, 1);

    expect(result.updated_symbol.state.validation.cycle_number).toBe(1);
    expect(result.updated_symbol.state.validation.last_result).toBeDefined();
  });

  it('should schedule cycles', async () => {
    let callbackCalled = false;
    scheduler.setCallback(async () => {
      callbackCalled = true;
    });

    // Just verify the callback can be set and scheduler can start
    expect(() => scheduler.start()).not.toThrow();

    // Immediately stop to avoid timing issues
    scheduler.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH LAYER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Stealth Layer Integration', () => {
  let symbol: MarineReconSymbol;

  beforeEach(() => {
    symbol = createReconSymbol(createTestRequest());
  });

  it('should create stealth components from symbol config', () => {
    const typingSimulator = createTypingSimulator(
      symbol.config.stealth.typing,
      symbol.config.stealth.behavioral
    );
    const timingCalculator = createTimingCalculator(
      symbol.config.stealth.timing,
      symbol.config.stealth.behavioral
    );
    const typoGenerator = createTypoGenerator(symbol.config.stealth.errors);

    expect(typingSimulator).toBeDefined();
    expect(timingCalculator).toBeDefined();
    expect(typoGenerator).toBeDefined();
  });

  it('should simulate complete response delivery', () => {
    const typingSimulator = createTypingSimulator(
      symbol.config.stealth.typing,
      symbol.config.stealth.behavioral
    );
    const timingCalculator = createTimingCalculator(
      symbol.config.stealth.timing,
      symbol.config.stealth.behavioral
    );

    // 1. Calculate response timing
    const incomingMessage = 'How can I assist you today?';
    const timing = timingCalculator.calculateResponseTiming(incomingMessage);

    expect(timing.total_pre_typing_delay_ms).toBeGreaterThan(0);

    // 2. Simulate typing the response
    const response = 'I need help with a return please.';
    const typingSimulation = typingSimulator.simulateTyping(response);

    expect(typingSimulation.total_duration_ms).toBeGreaterThan(0);
    expect(typingSimulation.effective_wpm).toBeGreaterThan(0);

    // 3. Total human-like delay
    const totalDelay = timing.total_pre_typing_delay_ms + typingSimulation.total_duration_ms;
    expect(totalDelay).toBeGreaterThan(1000); // At least 1 second for realism
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE SYSTEM INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Complete System Integration', () => {
  it('should create complete recon system with convenience function', () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: false,
      enableRalphLoop: true,
    });

    expect(system.symbol).toBeDefined();
    expect(system.runtime).toBeDefined();
    expect(system.scheduler).toBeDefined();
    expect(system.executor).toBeDefined();

    expect(system.symbol.symbol_id).toMatch(/^Ξ\.RECON\./);

    // Cleanup
    system.scheduler?.stop();
  });

  it('should wire up ralph-loop callback correctly', async () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: false,
      enableRalphLoop: true,
    });

    // Execute a manual cycle
    const result = await system.executor!.execute(system.symbol, 1);

    expect(result.success).toBe(true);

    // Cleanup
    system.scheduler?.stop();
  });

  it('should run complete mission simulation', async () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: true,
      enableRalphLoop: false, // Disable for controlled testing
      runtimeConfig: { verbose: false },
    });

    // Simulate a conversation
    const messages = [
      'Hello, welcome to customer service. How can I help you?',
      'I see you want a refund. Can you provide your order number?',
      'I can offer you store credit instead of a full refund.',
      'If you decide now, I can add a 10% bonus to the store credit.',
    ];

    for (const message of messages) {
      await system.runtime.processIncomingMessage(message);
    }

    // Verify state tracking
    const finalSymbol = system.runtime.getSymbol();
    expect(finalSymbol.state.engagement).toBeDefined();

    // Cleanup
    system.runtime.pause();
  });

  it('should maintain symbol integrity throughout mission', async () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: true,
      enableRalphLoop: false,
      runtimeConfig: { verbose: false },
    });

    const validator = new ReconSymbolValidator();

    // Process some messages
    await system.runtime.processIncomingMessage('Welcome!');
    await system.runtime.processIncomingMessage('How can I help?');

    // Validate symbol at each step
    const midReport = validator.validate(system.runtime.getSymbol());
    expect(midReport.passed).toBe(true);

    // Process more messages
    await system.runtime.processIncomingMessage('Here is your refund status.');

    // Final validation
    const finalReport = validator.validate(system.runtime.getSymbol());
    expect(finalReport.passed).toBe(true);

    // Cleanup
    system.runtime.pause();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Handling Integration', () => {
  it('should handle runtime not started gracefully', async () => {
    const symbol = createReconSymbol(createTestRequest());
    const runtime = createRuntime(symbol);

    // Processing without starting should return error result
    const result = await runtime.processIncomingMessage('Hello');

    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle empty messages', async () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: true,
      enableRalphLoop: false,
    });

    const result = await system.runtime.processIncomingMessage('');

    // Should handle gracefully
    expect(result).toBeDefined();

    // Cleanup
    system.runtime.pause();
  });

  it('should handle very long messages', async () => {
    const system = createReconSystem(createTestRequest(), {
      startImmediately: true,
      enableRalphLoop: false,
    });

    const longMessage = 'Hello '.repeat(1000); // Very long message
    const result = await system.runtime.processIncomingMessage(longMessage);

    expect(result).toBeDefined();

    // Cleanup
    system.runtime.pause();
  });

  it('should handle invalid symbol deserialization', async () => {
    const { deserializeSymbol } = await import('../../../src/recon/symbol/schema.js');
    const invalidJson = '{"symbol_type": "INVALID"}';

    expect(() => {
      deserializeSymbol(invalidJson);
    }).toThrow();
  });
});
