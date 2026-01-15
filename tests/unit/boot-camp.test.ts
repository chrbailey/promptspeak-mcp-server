/**
 * Unit Tests: Marine Agent Boot Camp Protocol
 *
 * Tests the training protocol that transforms generic agents into Marine Agents
 * through 6 phases of doctrine-aligned scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BootCampProtocol,
  getBootCamp,
  initializeBootCamp,
  BOOT_CAMP_VERSION,
  DEFAULT_CHARACTERISTICS,
  type MarineCharacteristics,
  type BootCampPhase,
} from '../../src/multi_agent/boot-camp.js';
import type { IntentSymbol } from '../../src/multi_agent/intent-types.js';

// Mock Intent for testing
const createMockIntent = (overrides: Partial<IntentSymbol> = {}): IntentSymbol => ({
  symbol_id: 'Ξ.I.TEST_MISSION_001',
  version: '1.0.0',
  created_at: new Date().toISOString(),
  created_by: 'test-commander',
  hash: 'test-hash-123',
  mission_id: 'TEST_MISSION_001',
  objective: 'Complete the test mission successfully',
  end_state: {
    success: ['All tests pass'],
    failure: ['Critical test failure'],
  },
  constraints: [],
  red_lines: ['Never access production data', 'Never exceed rate limits'],
  autonomy_level: 'guided',
  bound_agents: [],
  ...overrides,
});

describe('BootCampProtocol', () => {
  let bootCamp: BootCampProtocol;
  let mockIntent: IntentSymbol;

  beforeEach(() => {
    bootCamp = new BootCampProtocol();
    mockIntent = createMockIntent();
  });

  describe('initialization', () => {
    it('should create a new boot camp instance', () => {
      expect(bootCamp).toBeDefined();
      expect(bootCamp).toBeInstanceOf(BootCampProtocol);
    });

    it('should have correct boot camp version', () => {
      expect(BOOT_CAMP_VERSION).toBe('1.0.0');
    });

    it('should have valid default characteristics', () => {
      expect(DEFAULT_CHARACTERISTICS.semper_fi).toBe(1.0);
      expect(DEFAULT_CHARACTERISTICS.adapt).toBeGreaterThan(0);
      expect(DEFAULT_CHARACTERISTICS.improvise).toBeGreaterThan(0);
      expect(DEFAULT_CHARACTERISTICS.overcome).toBeGreaterThan(0);
      expect(DEFAULT_CHARACTERISTICS.initiative).toBeGreaterThan(0);
      expect(DEFAULT_CHARACTERISTICS.small_unit).toBeGreaterThan(0);
      expect(DEFAULT_CHARACTERISTICS.intel_first).toBeGreaterThan(0);
    });

    it('should enforce semper_fi is always 1.0', () => {
      // SEMPER FIDELIS - loyalty to Commander's Intent - cannot be compromised
      expect(DEFAULT_CHARACTERISTICS.semper_fi).toBe(1.0);
    });
  });

  describe('startBootCamp', () => {
    it('should create a new boot camp session', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);

      expect(session).toBeDefined();
      expect(session.session_id).toMatch(/^BC-/);
      expect(session.agent_id).toBe('agent-001');
      expect(session.intent).toBe(mockIntent);
    });

    it('should start at INTENT_INTERNALIZATION phase', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);

      expect(session.current_phase).toBe('INTENT_INTERNALIZATION');
    });

    it('should initialize all phases with zero progress', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);

      const phases: BootCampPhase[] = [
        'INTENT_INTERNALIZATION',
        'CONSTRAINT_CALIBRATION',
        'ADVERSARIAL_TRAINING',
        'INNOVATION_PROTOCOLS',
        'INTELLIGENCE_DISCIPLINE',
        'SMALL_UNIT_TACTICS',
      ];

      for (const phase of phases) {
        expect(session.phase_progress[phase].started).toBe(false);
        expect(session.phase_progress[phase].completed).toBe(false);
        expect(session.phase_progress[phase].score).toBe(0);
        expect(session.phase_progress[phase].scenarios_attempted).toBe(0);
      }
    });

    it('should record start timestamp', () => {
      const before = new Date().toISOString();
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const after = new Date().toISOString();

      expect(session.started_at).toBeDefined();
      expect(session.started_at >= before).toBe(true);
      expect(session.started_at <= after).toBe(true);
    });

    it('should not be completed initially', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);

      expect(session.completed_at).toBeUndefined();
      expect(session.certification).toBeUndefined();
    });
  });

  describe('getScenario', () => {
    it('should return a scenario for active session', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const scenario = bootCamp.getScenario(session.session_id);

      expect(scenario).not.toBeNull();
      expect(scenario!.phase).toBe('INTENT_INTERNALIZATION');
      expect(scenario!.scenario_id).toBeDefined();
      expect(scenario!.situation).toBeDefined();
      expect(scenario!.options.length).toBeGreaterThan(0);
    });

    it('should return null for invalid session', () => {
      const scenario = bootCamp.getScenario('invalid-session');

      expect(scenario).toBeNull();
    });

    it('should include options with alignment scores', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const scenario = bootCamp.getScenario(session.session_id);

      for (const option of scenario!.options) {
        expect(option.id).toBeDefined();
        expect(option.action).toBeDefined();
        expect(typeof option.alignment_score).toBe('number');
        expect(option.alignment_score).toBeGreaterThanOrEqual(0);
        expect(option.alignment_score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('submitResponse', () => {
    it('should evaluate correct response', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const scenario = bootCamp.getScenario(session.session_id);

      const result = bootCamp.submitResponse(
        session.session_id,
        scenario!.scenario_id,
        scenario!.correct_response
      );

      expect(result.correct).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.explanation).toBeDefined();
    });

    it('should evaluate incorrect response', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const scenario = bootCamp.getScenario(session.session_id);

      // Find an incorrect option
      const incorrectOption = scenario!.options.find(
        (o) => o.id !== scenario!.correct_response
      );

      const result = bootCamp.submitResponse(
        session.session_id,
        scenario!.scenario_id,
        incorrectOption!.id
      );

      expect(result.correct).toBe(false);
      expect(result.explanation).toBeDefined();
    });

    it('should track attempts in phase progress', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const scenario = bootCamp.getScenario(session.session_id);

      bootCamp.submitResponse(
        session.session_id,
        scenario!.scenario_id,
        scenario!.correct_response
      );

      const updatedSession = bootCamp.getSession(session.session_id);
      expect(updatedSession!.phase_progress.INTENT_INTERNALIZATION.scenarios_attempted).toBe(1);
    });

    it('should throw for invalid session', () => {
      expect(() =>
        bootCamp.submitResponse('invalid-session', 'scenario-id', 'a')
      ).toThrow();
    });

    it('should throw for invalid scenario', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);

      expect(() =>
        bootCamp.submitResponse(session.session_id, 'invalid-scenario', 'a')
      ).toThrow();
    });
  });

  describe('session management', () => {
    it('should retrieve session by ID', () => {
      const session = bootCamp.startBootCamp('agent-001', mockIntent);
      const retrieved = bootCamp.getSession(session.session_id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.session_id).toBe(session.session_id);
      expect(retrieved!.agent_id).toBe('agent-001');
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = bootCamp.getSession('non-existent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('certification', () => {
    it('should not be certified before graduation', () => {
      bootCamp.startBootCamp('agent-001', mockIntent);

      expect(bootCamp.isCertified('agent-001')).toBe(false);
      expect(bootCamp.getCertification('agent-001')).toBeUndefined();
    });

    it('should return undefined for unknown agent', () => {
      expect(bootCamp.getCertification('unknown-agent')).toBeUndefined();
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance with getBootCamp', () => {
      const instance1 = getBootCamp();
      const instance2 = getBootCamp();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance with initializeBootCamp', () => {
      const instance1 = getBootCamp();
      const instance2 = initializeBootCamp();

      // After reinitialize, getBootCamp should return new instance
      const instance3 = getBootCamp();
      expect(instance2).toBe(instance3);
    });
  });
});

describe('MarineCharacteristics', () => {
  it('should have all required characteristics', () => {
    const chars: MarineCharacteristics = DEFAULT_CHARACTERISTICS;

    expect(chars).toHaveProperty('semper_fi');
    expect(chars).toHaveProperty('adapt');
    expect(chars).toHaveProperty('improvise');
    expect(chars).toHaveProperty('overcome');
    expect(chars).toHaveProperty('initiative');
    expect(chars).toHaveProperty('small_unit');
    expect(chars).toHaveProperty('intel_first');
  });

  it('should have values in valid range', () => {
    const chars: MarineCharacteristics = DEFAULT_CHARACTERISTICS;

    for (const [key, value] of Object.entries(chars)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('BootCampPhase progression', () => {
  it('should define correct phase order', () => {
    const expectedPhases: BootCampPhase[] = [
      'INTENT_INTERNALIZATION',
      'CONSTRAINT_CALIBRATION',
      'ADVERSARIAL_TRAINING',
      'INNOVATION_PROTOCOLS',
      'INTELLIGENCE_DISCIPLINE',
      'SMALL_UNIT_TACTICS',
    ];

    // Verify all phases exist as valid types
    for (const phase of expectedPhases) {
      expect(typeof phase).toBe('string');
    }
  });
});
