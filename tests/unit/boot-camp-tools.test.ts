/**
 * Unit Tests: Boot Camp MCP Tool Handlers
 *
 * Tests the MCP tools that expose Boot Camp functionality:
 * - ps_bootcamp_start
 * - ps_bootcamp_scenario
 * - ps_bootcamp_submit
 * - ps_bootcamp_status
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleBootCampStart,
  handleBootCampScenario,
  handleBootCampSubmit,
  handleBootCampStatus,
} from '../../src/multi_agent/tools.js';
import { initializeBootCamp, getBootCamp } from '../../src/multi_agent/boot-camp.js';
import { intentManager } from '../../src/multi_agent/intent-manager.js';

describe('Boot Camp MCP Tools', () => {
  let testIntentId: string;

  // Counter to ensure unique mission IDs across all tests
  let testCounter = 0;

  beforeEach(async () => {
    // Reset boot camp singleton
    initializeBootCamp();

    // Create a test intent - use unique mission ID to avoid collisions
    testCounter++;
    const missionId = `TEST_BOOTCAMP_${Date.now()}_${testCounter}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await intentManager.createIntent({
      mission_id: missionId,
      objective: 'Test the boot camp training protocol',
      end_state: {
        success: ['All training scenarios completed'],
        failure: ['Training abandoned'],
      },
      red_lines: ['Never skip training phases', 'Never falsify scores'],
      autonomy_level: 'guided',
      created_by: 'test-harness',
    });

    // Result returns intent_id directly, not intent.symbol_id
    testIntentId = result.intent_id || '';

    // Fail fast if intent creation failed
    if (!testIntentId) {
      throw new Error(`Failed to create test intent: ${JSON.stringify(result)}`);
    }
  });

  describe('handleBootCampStart', () => {
    it('should start boot camp with valid inputs', () => {
      const result = handleBootCampStart({
        agent_id: 'test-agent-001',
        intent_id: testIntentId,
      });

      expect(result.success).toBe(true);
      expect(result.session_id).toBeDefined();
      expect(result.session_id).toMatch(/^BC-/);
      expect(result.agent_id).toBe('test-agent-001');
      expect(result.current_phase).toBe('INTENT_INTERNALIZATION');
    });

    it('should fail with missing agent_id', () => {
      const result = handleBootCampStart({
        intent_id: testIntentId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should fail with missing intent_id', () => {
      const result = handleBootCampStart({
        agent_id: 'test-agent-001',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should fail with invalid intent_id', () => {
      const result = handleBootCampStart({
        agent_id: 'test-agent-001',
        intent_id: 'non-existent-intent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Intent not found');
    });

    it('should include helpful message', () => {
      // Verify intent was created in beforeEach
      expect(testIntentId).toBeDefined();
      expect(testIntentId.length).toBeGreaterThan(0);

      const result = handleBootCampStart({
        agent_id: `test-agent-msg-${Date.now()}`,
        intent_id: testIntentId,
      });

      // If start fails, log the error for debugging
      if (!result.success) {
        console.error('Boot camp start failed:', result.error);
      }

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('Boot Camp started');
    });
  });

  describe('handleBootCampScenario', () => {
    it('should return scenario for valid session', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-001',
        intent_id: testIntentId,
      });

      const result = handleBootCampScenario({
        session_id: startResult.session_id as string,
      });

      expect(result.success).toBe(true);
      expect(result.scenario).toBeDefined();
      expect(result.scenario.scenario_id).toBeDefined();
      expect(result.scenario.situation).toBeDefined();
      expect(result.scenario.options).toBeInstanceOf(Array);
    });

    it('should fail with missing session_id', () => {
      const result = handleBootCampScenario({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should fail with invalid session_id', () => {
      const result = handleBootCampScenario({
        session_id: 'invalid-session',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should return current phase with scenario', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-phase',
        intent_id: testIntentId,
      });

      expect(startResult.success).toBe(true);

      const result = handleBootCampScenario({
        session_id: startResult.session_id as string,
      });

      expect(result.success).toBe(true);
      expect(result.current_phase).toBe('INTENT_INTERNALIZATION');
    });

    it('should not expose alignment scores in options', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-options',
        intent_id: testIntentId,
      });

      expect(startResult.success).toBe(true);

      const result = handleBootCampScenario({
        session_id: startResult.session_id as string,
      });

      expect(result.success).toBe(true);
      expect(result.scenario).toBeDefined();

      // Options should only have id and action, not alignment_score
      for (const option of result.scenario.options) {
        expect(option).toHaveProperty('id');
        expect(option).toHaveProperty('action');
        expect(option).not.toHaveProperty('alignment_score');
      }
    });
  });

  describe('handleBootCampSubmit', () => {
    it('should evaluate correct response', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-submit',
        intent_id: testIntentId,
      });

      expect(startResult.success).toBe(true);

      const scenarioResult = handleBootCampScenario({
        session_id: startResult.session_id as string,
      });

      expect(scenarioResult.success).toBe(true);
      expect(scenarioResult.scenario).toBeDefined();

      // Get the correct response from boot camp directly
      const bootCamp = getBootCamp();
      const scenario = bootCamp.getScenario(startResult.session_id as string);

      expect(scenario).not.toBeNull();

      const result = handleBootCampSubmit({
        session_id: startResult.session_id as string,
        scenario_id: scenarioResult.scenario.scenario_id,
        selected_option: scenario!.correct_response,
      });

      expect(result.success).toBe(true);
      expect(result.correct).toBe(true);
      expect(result.alignment_score).toBeGreaterThan(0);
      expect(result.explanation).toBeDefined();
    });

    it('should fail with missing parameters', () => {
      const result = handleBootCampSubmit({
        session_id: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should fail with invalid session', () => {
      const result = handleBootCampSubmit({
        session_id: 'invalid-session',
        scenario_id: 'INT-001',
        selected_option: 'a',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return phase progress', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-progress',
        intent_id: testIntentId,
      });

      expect(startResult.success).toBe(true);

      const scenarioResult = handleBootCampScenario({
        session_id: startResult.session_id as string,
      });

      expect(scenarioResult.success).toBe(true);
      expect(scenarioResult.scenario).toBeDefined();

      const bootCamp = getBootCamp();
      const scenario = bootCamp.getScenario(startResult.session_id as string);

      expect(scenario).not.toBeNull();

      const result = handleBootCampSubmit({
        session_id: startResult.session_id as string,
        scenario_id: scenarioResult.scenario.scenario_id,
        selected_option: scenario!.correct_response,
      });

      expect(result.success).toBe(true);
      expect(result.phase_progress).toBeDefined();
    });
  });

  describe('handleBootCampStatus', () => {
    it('should return session status with session_id', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-status',
        intent_id: testIntentId,
      });

      expect(startResult.success).toBe(true);

      const result = handleBootCampStatus({
        session_id: startResult.session_id as string,
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe('session');
      expect(result.session_id).toBe(startResult.session_id);
      expect(result.agent_id).toBe('test-agent-status');
      expect(result.current_phase).toBeDefined();
      expect(result.phase_progress).toBeDefined();
    });

    it('should return certification status with agent_id', () => {
      const startResult = handleBootCampStart({
        agent_id: 'test-agent-002',
        intent_id: testIntentId,
      });

      const result = handleBootCampStatus({
        agent_id: 'test-agent-002',
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe('certification');
      expect(result.agent_id).toBe('test-agent-002');
      expect(result.is_certified).toBe(false); // Not graduated yet
    });

    it('should fail with neither session_id nor agent_id', () => {
      const result = handleBootCampStatus({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Either session_id or agent_id is required');
    });

    it('should fail with invalid session_id', () => {
      const result = handleBootCampStatus({
        session_id: 'invalid-session',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should indicate uncertified agent', () => {
      const result = handleBootCampStatus({
        agent_id: 'never-trained-agent',
      });

      expect(result.success).toBe(true);
      expect(result.is_certified).toBe(false);
      expect(result.message).toContain('has not completed Boot Camp');
    });
  });
});

describe('Boot Camp Tool Integration', () => {
  let testIntentId: string;

  beforeEach(async () => {
    initializeBootCamp();

    const missionId = `TEST_INTEGRATION_${Date.now()}`;
    const result = await intentManager.createIntent({
      mission_id: missionId,
      objective: 'Integration test for boot camp flow',
      end_state: {
        success: ['Integration test passed'],
        failure: ['Integration test failed'],
      },
      red_lines: ['Never corrupt test data'],
      autonomy_level: 'guided',
      created_by: 'integration-test',
    });

    testIntentId = result.intent_id || '';
  });

  it('should complete full training flow', () => {
    // Step 1: Start boot camp
    const startResult = handleBootCampStart({
      agent_id: 'integration-agent',
      intent_id: testIntentId,
    });
    expect(startResult.success).toBe(true);

    // Step 2: Get first scenario
    const scenarioResult = handleBootCampScenario({
      session_id: startResult.session_id as string,
    });
    expect(scenarioResult.success).toBe(true);
    expect(scenarioResult.scenario).toBeDefined();

    // Step 3: Submit response
    const bootCamp = getBootCamp();
    const scenario = bootCamp.getScenario(startResult.session_id as string);

    const submitResult = handleBootCampSubmit({
      session_id: startResult.session_id as string,
      scenario_id: scenarioResult.scenario.scenario_id,
      selected_option: scenario!.correct_response,
    });
    expect(submitResult.success).toBe(true);

    // Step 4: Check status
    const statusResult = handleBootCampStatus({
      session_id: startResult.session_id as string,
    });
    expect(statusResult.success).toBe(true);
    expect(statusResult.phase_progress).toBeDefined();
  });
});
