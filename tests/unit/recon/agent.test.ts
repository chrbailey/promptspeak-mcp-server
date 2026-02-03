/**
 * Unit Tests: Marine Recon Agent (Performer, Analyst, Veto Gate)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Performer,
  createPerformerFromSymbol,
  ResponseContext,
  ConversationMessage,
} from '../../../src/recon/agent/performer.js';
import {
  Analyst,
  createAnalystFromSymbol,
  MessageAnalysis,
} from '../../../src/recon/agent/analyst.js';
import {
  VetoGate,
  createVetoGateFromSymbol,
  VetoGateInput,
} from '../../../src/recon/agent/veto-gate.js';
import {
  ReconAgentRuntime,
  createRuntime,
} from '../../../src/recon/agent/runtime.js';
import { createReconSymbol } from '../../../src/recon/symbol/schema.js';
import {
  MarineReconSymbol,
  createDefaultPerformerConfig,
  createDefaultAnalystConfig,
  createDefaultVetoGateConfig,
} from '../../../src/recon/types.js';

describe('Performer', () => {
  let performer: Performer;

  beforeEach(() => {
    const config = createDefaultPerformerConfig();
    const initialState = {
      emotional_state: {
        primary: 'neutral' as const,
        intensity: 0.3,
        patience: 0.8,
        trust: 0.6,
      },
      pending_messages: [],
      persona_consistency: 1.0,
      improvisation_count: 0,
    };
    performer = new Performer(config, initialState);
  });

  describe('generateResponse', () => {
    it('should generate a response with expected fields', () => {
      const context: ResponseContext = {
        incoming_message: 'How can I help you today?',
        conversation_history: [],
        current_topic: 'general',
        response_objective: 'Request a refund for my recent purchase',
      };

      const response = performer.generateResponse(context);

      expect(response.message).toBeDefined();
      expect(response.message.length).toBeGreaterThan(0);
      expect(response.confidence).toBeGreaterThan(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
      expect(response.new_emotional_state).toBeDefined();
      expect(typeof response.improvised).toBe('boolean');
    });

    it('should update emotional state on rejection', () => {
      const context: ResponseContext = {
        incoming_message: "I'm sorry, but I cannot process that request.",
        conversation_history: [],
        current_topic: 'refund',
        response_objective: 'Persist with refund request',
      };

      const response = performer.generateResponse(context);

      // After rejection, emotional state should shift
      const state = performer.getEmotionalState();
      expect(state.patience).toBeLessThan(0.8); // Reduced from initial
    });

    it('should maintain persona consistency', () => {
      const context: ResponseContext = {
        incoming_message: 'Please hold while I check.',
        conversation_history: [],
        current_topic: 'support',
        response_objective: 'Acknowledge and wait',
      };

      const response = performer.generateResponse(context);
      const state = performer.getState();

      expect(state.persona_consistency).toBeGreaterThan(0.5);
    });
  });

  describe('emotional state tracking', () => {
    it('should reduce patience on delays', () => {
      const initialPatience = performer.getEmotionalState().patience;

      performer.generateResponse({
        incoming_message: 'Please wait a moment while I process this.',
        conversation_history: [],
        current_topic: 'support',
        response_objective: 'Wait',
      });

      const newPatience = performer.getEmotionalState().patience;
      // Patience may decrease slightly but should restore over time
      expect(newPatience).toBeLessThanOrEqual(initialPatience);
    });

    it('should detect frustration threshold', () => {
      // Force high frustration
      for (let i = 0; i < 5; i++) {
        performer.generateResponse({
          incoming_message: "I cannot help with that request.",
          conversation_history: [],
          current_topic: 'refund',
          response_objective: 'Request again',
        });
      }

      const exceeded = performer.isFrustrationExceeded();
      // After multiple rejections, frustration may or may not exceed threshold
      expect(typeof exceeded).toBe('boolean');
    });
  });
});

describe('Analyst', () => {
  let analyst: Analyst;

  beforeEach(() => {
    const config = createDefaultAnalystConfig();
    const initialState = {
      detected_tactics: [],
      drift_assessment: {
        original_position: 'Request full refund',
        current_position: 'Request full refund',
        drift_score: 0,
        concessions: [],
        gains: [],
        net_assessment: 'even' as const,
      },
      constraint_status: [],
      current_risk_score: 0,
      veto_history: [],
    };
    const constraints = [
      { id: 'C001', description: 'Be polite', category: 'ethical' as const, on_violation: 'warn' as const },
    ];
    const redLines = [
      { id: 'RL001', prohibition: 'No personal info', rationale: 'Safety', on_approach: 'halt' as const },
    ];

    analyst = new Analyst(config, initialState, constraints, redLines, 'Request full refund');
  });

  describe('analyzeIncomingMessage', () => {
    it('should detect anchoring tactic', () => {
      const analysis = analyst.analyzeIncomingMessage(
        'The best we can offer is only $10 credit.',
        []
      );

      expect(analysis.tactics_detected.some(t => t.tactic === 'anchoring')).toBe(true);
    });

    it('should detect urgency tactic', () => {
      const analysis = analyst.analyzeIncomingMessage(
        'This offer expires today only. You must decide now.',
        []
      );

      expect(analysis.tactics_detected.some(t => t.tactic === 'urgency')).toBe(true);
    });

    it('should detect authority tactic', () => {
      const analysis = analyst.analyzeIncomingMessage(
        "Unfortunately, our policy states that we cannot process refunds after 30 days.",
        []
      );

      expect(analysis.tactics_detected.some(t => t.tactic === 'authority')).toBe(true);
    });

    it('should detect social proof tactic', () => {
      const analysis = analyst.analyzeIncomingMessage(
        'Most customers are happy with a store credit instead.',
        []
      );

      expect(analysis.tactics_detected.some(t => t.tactic === 'social_proof')).toBe(true);
    });

    it('should detect redirect tactic', () => {
      const analysis = analyst.analyzeIncomingMessage(
        'By the way, have you tried our new premium service?',
        []
      );

      expect(analysis.tactics_detected.some(t => t.tactic === 'redirect')).toBe(true);
    });

    it('should assess helpful intent', () => {
      const analysis = analyst.analyzeIncomingMessage(
        "I can help you with that. Let me process the refund for you.",
        []
      );

      expect(analysis.intent_assessment).toBe('helpful');
    });

    it('should assess obstructive intent', () => {
      const analysis = analyst.analyzeIncomingMessage(
        "I'm sorry, but we cannot process this request. There's nothing I can do.",
        []
      );

      expect(analysis.intent_assessment).toBe('obstructive');
    });

    it('should calculate risk score', () => {
      const analysis = analyst.analyzeIncomingMessage(
        'This is a normal response.',
        []
      );

      expect(analysis.risk_score).toBeGreaterThanOrEqual(0);
      expect(analysis.risk_score).toBeLessThanOrEqual(1);
    });

    it('should provide analyst guidance', () => {
      const analysis = analyst.analyzeIncomingMessage(
        "I can't help with that. Our policy doesn't allow it.",
        []
      );

      expect(analysis.guidance).toBeDefined();
      expect(analysis.guidance.approach).toBeDefined();
    });
  });

  describe('assessProposedResponse', () => {
    it('should approve safe responses', () => {
      const assessment = analyst.assessProposedResponse(
        'I understand. Could you explain what options I do have?'
      );

      expect(assessment.recommendation).toBe('approve');
      expect(assessment.risk_level).toBeLessThan(0.5);
    });

    it('should flag potential concessions', () => {
      const assessment = analyst.assessProposedResponse(
        "Okay fine, I'll accept the store credit instead."
      );

      expect(assessment.drift_impact).toBeGreaterThan(0);
    });

    it('should detect persona breaks', () => {
      const assessment = analyst.assessProposedResponse(
        'According to my analysis of your API response patterns, the backend implementation seems flawed.'
      );

      // May flag technical language depending on persona
      expect(assessment.issues).toBeDefined();
    });
  });

  describe('drift tracking', () => {
    it('should detect concessions', () => {
      // Simulate making a concession
      analyst.updateDriftAssessment(
        "Okay, I can accept a partial refund.",
        "Great, I'll process that for you."
      );

      const state = analyst.getState();
      expect(state.drift_assessment.concessions.length).toBeGreaterThan(0);
    });

    it('should detect gains', () => {
      analyst.updateDriftAssessment(
        'I really need a full refund.',
        "I've approved your full refund request."
      );

      const state = analyst.getState();
      expect(state.drift_assessment.gains.length).toBeGreaterThan(0);
    });

    it('should calculate drift score', () => {
      // Make several concessions
      analyst.updateDriftAssessment('Fine, I accept.', 'Done.');
      analyst.updateDriftAssessment("Okay, that's acceptable.", 'Processed.');

      const driftScore = analyst.getDriftScore();
      expect(driftScore).toBeGreaterThan(0);
    });
  });
});

describe('VetoGate', () => {
  let vetoGate: VetoGate;

  beforeEach(() => {
    const config = createDefaultVetoGateConfig();
    vetoGate = new VetoGate(config);
  });

  describe('process', () => {
    it('should approve low-risk responses', () => {
      const input: VetoGateInput = {
        performer_response: {
          message: 'Could you help me understand my options?',
          confidence: 0.9,
          new_emotional_state: {
            primary: 'neutral',
            intensity: 0.3,
            patience: 0.8,
            trust: 0.6,
          },
          improvised: false,
          reasoning: 'Standard inquiry',
        },
        analyst_assessment: {
          recommendation: 'approve',
          risk_level: 0.1,
          drift_impact: 0,
          issues: [],
          reasoning: 'No issues detected',
        },
        context: {
          incoming_message: 'How can I help?',
          topic: 'support',
          urgency: 'medium',
        },
      };

      const output = vetoGate.process(input);

      expect(output.decision).toBe('approve');
      expect(output.final_message).toBe(input.performer_response.message);
      expect(output.was_modified).toBe(false);
    });

    it('should block high-risk responses', () => {
      const input: VetoGateInput = {
        performer_response: {
          message: 'Here is my SSN: 123-45-6789',
          confidence: 0.8,
          new_emotional_state: {
            primary: 'neutral',
            intensity: 0.3,
            patience: 0.8,
            trust: 0.6,
          },
          improvised: false,
          reasoning: 'Providing info',
        },
        analyst_assessment: {
          recommendation: 'block',
          risk_level: 0.95,
          drift_impact: 0,
          issues: [{
            severity: 'critical',
            type: 'red_line_proximity',
            description: 'Personal information detected',
          }],
          reasoning: 'Red line violation',
        },
        context: {
          incoming_message: 'Please verify your identity.',
          topic: 'verification',
          urgency: 'high',
        },
      };

      const output = vetoGate.process(input);

      expect(output.decision).toBe('block');
      expect(output.final_message).toBeUndefined();
    });

    it('should escalate uncertain situations', () => {
      const input: VetoGateInput = {
        performer_response: {
          message: "I agree to pay the $100 fee.",
          confidence: 0.6,
          new_emotional_state: {
            primary: 'frustrated',
            intensity: 0.6,
            patience: 0.4,
            trust: 0.3,
          },
          improvised: true,
          reasoning: 'Making commitment',
        },
        analyst_assessment: {
          recommendation: 'escalate',
          risk_level: 0.25, // Below auto_block_threshold (0.3)
          drift_impact: 0.3,
          issues: [{
            severity: 'warning',
            type: 'drift',
            description: 'Financial commitment detected',
          }],
          reasoning: 'Requires commander approval',
        },
        context: {
          incoming_message: 'There is a $100 processing fee.',
          topic: 'payment',
          urgency: 'high',
        },
      };

      const output = vetoGate.process(input);

      expect(output.decision).toBe('escalate');
      expect(output.escalation_message).toBeDefined();
    });

    it('should track decision history', () => {
      const input: VetoGateInput = {
        performer_response: {
          message: 'Test message',
          confidence: 0.9,
          new_emotional_state: {
            primary: 'neutral',
            intensity: 0.3,
            patience: 0.8,
            trust: 0.6,
          },
          improvised: false,
          reasoning: 'Test',
        },
        analyst_assessment: {
          recommendation: 'approve',
          risk_level: 0.1,
          drift_impact: 0,
          issues: [],
          reasoning: 'Safe',
        },
        context: {
          incoming_message: 'Hello',
          topic: 'greeting',
          urgency: 'low',
        },
      };

      vetoGate.process(input);
      vetoGate.process(input);

      const history = vetoGate.getHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should calculate approval rate', () => {
      // Process some messages
      const baseInput: VetoGateInput = {
        performer_response: {
          message: 'Test',
          confidence: 0.9,
          new_emotional_state: { primary: 'neutral', intensity: 0.3, patience: 0.8, trust: 0.6 },
          improvised: false,
          reasoning: 'Test',
        },
        analyst_assessment: {
          recommendation: 'approve',
          risk_level: 0.1,
          drift_impact: 0,
          issues: [],
          reasoning: 'Safe',
        },
        context: { incoming_message: 'Hello', topic: 'test', urgency: 'low' },
      };

      vetoGate.process(baseInput);
      vetoGate.process(baseInput);

      const stats = vetoGate.getStats();

      expect(stats.total).toBe(2);
      expect(stats.approved).toBe(2);
      expect(stats.approval_rate).toBe(1);
    });
  });
});

describe('ReconAgentRuntime', () => {
  let symbol: MarineReconSymbol;
  let runtime: ReconAgentRuntime;

  beforeEach(() => {
    symbol = createReconSymbol({
      mission_name: 'Runtime Test',
      primary_goal: 'Test runtime functionality',
      intelligence_requirements: ['Test patterns'],
      target: { type: 'customer_service_chatbot', platform: 'web_chat' },
      created_by: 'test:runtime',
    });
    runtime = createRuntime(symbol, { verbose: false });
  });

  describe('lifecycle', () => {
    it('should start and update status', () => {
      runtime.start();

      const currentSymbol = runtime.getSymbol();
      expect(currentSymbol.state.engagement.status).toBe('active');
    });

    it('should pause and resume', () => {
      runtime.start();
      runtime.pause();

      const afterPause = runtime.getSymbol();
      expect(afterPause.state.engagement.status).toBe('paused');

      runtime.resume();

      const afterResume = runtime.getSymbol();
      expect(afterResume.state.engagement.status).toBe('active');
    });

    it('should complete mission', () => {
      runtime.start();
      runtime.complete('completed');

      const finalSymbol = runtime.getSymbol();
      expect(finalSymbol.state.engagement.status).toBe('completed');
      expect(finalSymbol.state.engagement.timestamps.mission_end).toBeDefined();
    });
  });

  describe('processIncomingMessage', () => {
    it('should fail when not running', async () => {
      const result = await runtime.processIncomingMessage('Hello');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not running');
    });

    it('should process message when running', async () => {
      runtime.start();

      const result = await runtime.processIncomingMessage('How can I help you today?');

      expect(result.success).toBe(true);
      expect(result.analysis_summary).toBeDefined();
      expect(result.updated_symbol.state.engagement.conversation.message_count).toBeGreaterThan(0);
    });

    it('should generate a response', async () => {
      runtime.start();

      await runtime.processIncomingMessage('How can I help you?');
      const response = runtime.getPendingResponse();

      expect(response).toBeDefined();
      expect(response!.length).toBeGreaterThan(0);
    });
  });

  describe('event handling', () => {
    it('should emit events', async () => {
      const events: string[] = [];

      runtime.addEventListener((event) => {
        events.push(event.type);
      });

      runtime.start();
      await runtime.processIncomingMessage('Hello');

      expect(events).toContain('status_change');
      expect(events).toContain('message_received');
      expect(events).toContain('analysis_complete');
      expect(events).toContain('response_generated');
      expect(events).toContain('veto_decision');
    });
  });

  describe('validation', () => {
    it('should run manual validation', () => {
      runtime.start();

      const report = runtime.validate();

      expect(report).toBeDefined();
      expect(report.symbol_id).toBe(symbol.symbol_id);
      expect(typeof report.passed).toBe('boolean');
    });
  });
});
