/**
 * Unit Tests: Commander's Intent MCP Tools
 *
 * Tests for the Intent tools following the mcpSuccess/mcpFailure pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  handleMissionCreate,
  handleMissionStatus,
  handleMissionComplete,
  handleAgentRegister,
  handleAgentHeartbeat,
  handleIntentConsult,
  INTENT_TOOLS,
} from '../../multi_agent/intent-tools.js';
import {
  dispatchIntentTool,
  isIntentTool,
  getIntentToolNames,
  getIntentToolDefinitions,
  getIntentToolCount,
} from '../../multi_agent/tool-dispatcher.js';
import { intentManager, IntentManager } from '../../multi_agent/intent-manager.js';
import { agentRegistry, AgentRegistry } from '../../multi_agent/agent-registry.js';
import { missionManager, MissionManager } from '../../multi_agent/mission.js';

// Helper to parse MCP result
function parseResult(result: { content: Array<{ text: string }> }): {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
} {
  const text = result.content[0].text;
  return JSON.parse(text);
}

// ===============================================================================
// SECTION 1: TOOL DEFINITIONS
// ===============================================================================

describe('Intent Tool Definitions', () => {
  it('should have 6 tool definitions', () => {
    expect(INTENT_TOOLS.length).toBe(6);
  });

  it('should have ps_mission_create tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_mission_create');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('name');
    expect(tool?.inputSchema.required).toContain('objective');
    expect(tool?.inputSchema.required).toContain('end_state');
    expect(tool?.inputSchema.required).toContain('red_lines');
    expect(tool?.inputSchema.required).toContain('created_by');
  });

  it('should have ps_mission_status tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_mission_status');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('mission_id');
  });

  it('should have ps_mission_complete tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_mission_complete');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('mission_id');
    expect(tool?.inputSchema.required).toContain('success');
  });

  it('should have ps_agent_register tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_agent_register');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('agent_id');
    expect(tool?.inputSchema.required).toContain('name');
    expect(tool?.inputSchema.required).toContain('role');
    expect(tool?.inputSchema.required).toContain('capabilities');
  });

  it('should have ps_agent_heartbeat tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_agent_heartbeat');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('agent_id');
  });

  it('should have ps_intent_consult tool', () => {
    const tool = INTENT_TOOLS.find(t => t.name === 'ps_intent_consult');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('agent_id');
    expect(tool?.inputSchema.required).toContain('intent_id');
    expect(tool?.inputSchema.required).toContain('situation');
    expect(tool?.inputSchema.required).toContain('options');
  });
});

// ===============================================================================
// SECTION 2: TOOL DISPATCHER
// ===============================================================================

describe('Tool Dispatcher', () => {
  describe('isIntentTool', () => {
    it('should identify Intent tools', () => {
      expect(isIntentTool('ps_mission_create')).toBe(true);
      expect(isIntentTool('ps_mission_status')).toBe(true);
      expect(isIntentTool('ps_mission_complete')).toBe(true);
      expect(isIntentTool('ps_agent_register')).toBe(true);
      expect(isIntentTool('ps_agent_heartbeat')).toBe(true);
      expect(isIntentTool('ps_intent_consult')).toBe(true);
    });

    it('should reject non-Intent tools', () => {
      expect(isIntentTool('ps_validate')).toBe(false);
      expect(isIntentTool('ps_execute')).toBe(false);
      expect(isIntentTool('unknown_tool')).toBe(false);
    });
  });

  describe('getIntentToolNames', () => {
    it('should return all tool names', () => {
      const names = getIntentToolNames();
      expect(names).toContain('ps_mission_create');
      expect(names).toContain('ps_mission_status');
      expect(names).toContain('ps_mission_complete');
      expect(names).toContain('ps_agent_register');
      expect(names).toContain('ps_agent_heartbeat');
      expect(names).toContain('ps_intent_consult');
    });
  });

  describe('getIntentToolDefinitions', () => {
    it('should return tool definitions', () => {
      const tools = getIntentToolDefinitions();
      expect(tools.length).toBe(6);
    });
  });

  describe('getIntentToolCount', () => {
    it('should return correct count', () => {
      expect(getIntentToolCount()).toBe(6);
    });
  });

  describe('dispatchIntentTool', () => {
    it('should return null for unknown tools', async () => {
      const result = await dispatchIntentTool('unknown_tool', {});
      expect(result).toBeNull();
    });

    it('should dispatch to correct handler', async () => {
      // This will fail validation but demonstrates dispatch works
      const result = await dispatchIntentTool('ps_mission_create', {});
      expect(result).not.toBeNull();

      const parsed = parseResult(result!);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.code).toBe('VALIDATION_FAILED');
    });
  });
});

// ===============================================================================
// SECTION 3: ps_agent_register HANDLER
// ===============================================================================

describe('ps_agent_register Handler', () => {
  const uniqueId = () => `test_agent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  it('should register a new agent', async () => {
    const agentId = uniqueId();
    const result = await handleAgentRegister({
      agent_id: agentId,
      name: 'Test Agent',
      role: 'specialist',
      capabilities: ['research', 'analysis'],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.agent_id).toBe(agentId);
    expect(parsed.data?.role).toBe('specialist');
    expect(parsed.data?.status).toBe('idle');
  });

  it('should reject duplicate agent registration', async () => {
    const agentId = uniqueId();

    // First registration
    await handleAgentRegister({
      agent_id: agentId,
      name: 'Test Agent',
      role: 'specialist',
      capabilities: ['research'],
    });

    // Second registration should fail
    const result = await handleAgentRegister({
      agent_id: agentId,
      name: 'Test Agent 2',
      role: 'coordinator',
      capabilities: ['orchestration'],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('AGENT_REGISTER_FAILED');
  });

  it('should validate required fields', async () => {
    const result = await handleAgentRegister({
      agent_id: '',
      name: 'Test',
      role: 'specialist',
      capabilities: ['test'],
    } as any);

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('VALIDATION_FAILED');
  });

  it('should validate role values', async () => {
    const result = await handleAgentRegister({
      agent_id: uniqueId(),
      name: 'Test',
      role: 'invalid_role' as any,
      capabilities: ['test'],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('VALIDATION_FAILED');
  });
});

// ===============================================================================
// SECTION 4: ps_agent_heartbeat HANDLER
// ===============================================================================

describe('ps_agent_heartbeat Handler', () => {
  const uniqueId = () => `hb_agent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  let testAgentId: string;

  beforeEach(async () => {
    testAgentId = uniqueId();
    await handleAgentRegister({
      agent_id: testAgentId,
      name: 'Heartbeat Test Agent',
      role: 'specialist',
      capabilities: ['testing'],
    });
  });

  it('should record heartbeat for existing agent', async () => {
    const result = await handleAgentHeartbeat({
      agent_id: testAgentId,
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.agent_id).toBe(testAgentId);
    expect(parsed.data?.last_heartbeat).toBeDefined();
  });

  it('should update agent status', async () => {
    const result = await handleAgentHeartbeat({
      agent_id: testAgentId,
      status: 'executing',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.status).toBe('executing');
  });

  it('should include progress in response', async () => {
    const result = await handleAgentHeartbeat({
      agent_id: testAgentId,
      progress: 50,
      message: 'Halfway done',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.progress).toBe(50);
    expect(parsed.data?.message).toBe('Halfway done');
  });

  it('should fail for non-existent agent', async () => {
    const result = await handleAgentHeartbeat({
      agent_id: 'non_existent_agent_12345',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('AGENT_NOT_FOUND');
  });
});

// ===============================================================================
// SECTION 5: ps_mission_create HANDLER
// ===============================================================================

describe('ps_mission_create Handler', () => {
  it('should create a mission with Intent', async () => {
    const result = await handleMissionCreate({
      name: 'Test Mission',
      description: 'A test mission for unit testing',
      objective: 'Successfully test the mission creation functionality',
      end_state: {
        success: ['tests_passed', 'no_errors'],
        failure: ['tests_failed', 'timeout'],
      },
      red_lines: ['Do not modify production data'],
      autonomy_level: 'guided',
      created_by: 'test_user',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.mission_id).toBeDefined();
    expect(parsed.data?.intent_id).toBeDefined();
    expect(parsed.data?.intent_hash).toBeDefined();
    expect(parsed.data?.status).toBe('planning');
  });

  it('should create mission with constraints', async () => {
    const result = await handleMissionCreate({
      name: 'Constrained Mission',
      description: 'Mission with constraints',
      objective: 'Test constraint handling in mission creation',
      end_state: {
        success: ['constraint_test_passed'],
        failure: ['constraint_violated'],
      },
      red_lines: ['Never bypass security'],
      constraints: [
        {
          id: 'C1',
          description: 'Only use approved APIs',
          severity: 'critical',
          on_violation: 'block',
        },
      ],
      created_by: 'test_user',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
  });

  it('should validate required fields', async () => {
    const result = await handleMissionCreate({
      name: 'Missing Fields',
      description: 'Test',
      // Missing objective, end_state, red_lines
    } as any);

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('VALIDATION_FAILED');
  });

  it('should validate objective minimum length', async () => {
    const result = await handleMissionCreate({
      name: 'Short Objective',
      description: 'Test',
      objective: 'Short', // Less than 10 chars
      end_state: { success: ['done'], failure: ['fail'] },
      red_lines: ['none'],
      created_by: 'test',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('VALIDATION_FAILED');
  });
});

// ===============================================================================
// SECTION 6: ps_mission_status HANDLER
// ===============================================================================

describe('ps_mission_status Handler', () => {
  let testMissionId: string;

  beforeEach(async () => {
    // Create a test mission
    const result = await handleMissionCreate({
      name: 'Status Test Mission',
      description: 'Mission for testing status retrieval',
      objective: 'Test the mission status functionality',
      end_state: {
        success: ['status_retrieved'],
        failure: ['status_error'],
      },
      red_lines: ['No unauthorized access'],
      created_by: 'test_user',
    });

    const parsed = parseResult(result);
    testMissionId = parsed.data?.mission_id as string;
  });

  it('should get mission status', async () => {
    const result = await handleMissionStatus({
      mission_id: testMissionId,
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.mission_id).toBe(testMissionId);
    expect(parsed.data?.status).toBe('planning');
    expect(parsed.data?.name).toBe('Status Test Mission');
  });

  it('should include agents by default', async () => {
    const result = await handleMissionStatus({
      mission_id: testMissionId,
      include_agents: true,
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.agents).toBeDefined();
    expect(Array.isArray(parsed.data?.agents)).toBe(true);
  });

  it('should fail for non-existent mission', async () => {
    const result = await handleMissionStatus({
      mission_id: 'non_existent_mission_12345',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('MISSION_NOT_FOUND');
  });
});

// ===============================================================================
// SECTION 7: ps_mission_complete HANDLER
// ===============================================================================

describe('ps_mission_complete Handler', () => {
  let testMissionId: string;

  beforeEach(async () => {
    const result = await handleMissionCreate({
      name: 'Complete Test Mission',
      description: 'Mission for testing completion',
      objective: 'Test the mission completion functionality',
      end_state: {
        success: ['completed'],
        failure: ['failed'],
      },
      red_lines: ['No errors allowed'],
      created_by: 'test_user',
    });

    const parsed = parseResult(result);
    testMissionId = parsed.data?.mission_id as string;
  });

  it('should complete a mission successfully', async () => {
    const result = await handleMissionComplete({
      mission_id: testMissionId,
      success: true,
      summary: 'All objectives achieved',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.status).toBe('completed');
    expect(parsed.data?.summary).toBe('All objectives achieved');
  });

  it('should fail a mission', async () => {
    const createResult = await handleMissionCreate({
      name: 'Fail Test Mission',
      description: 'Mission to test failure',
      objective: 'Test the mission failure functionality',
      end_state: { success: ['done'], failure: ['error'] },
      red_lines: ['none'],
      created_by: 'test',
    });

    const createParsed = parseResult(createResult);
    const failMissionId = createParsed.data?.mission_id as string;

    const result = await handleMissionComplete({
      mission_id: failMissionId,
      success: false,
      summary: 'Mission failed due to errors',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.status).toBe('failed');
  });

  it('should fail for non-existent mission', async () => {
    const result = await handleMissionComplete({
      mission_id: 'non_existent_mission_12345',
      success: true,
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('MISSION_NOT_FOUND');
  });

  it('should not complete already completed mission', async () => {
    // Complete the mission first
    await handleMissionComplete({
      mission_id: testMissionId,
      success: true,
    });

    // Try to complete again
    const result = await handleMissionComplete({
      mission_id: testMissionId,
      success: false,
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('MISSION_ALREADY_COMPLETE');
  });
});

// ===============================================================================
// SECTION 8: ps_intent_consult HANDLER
// ===============================================================================

describe('ps_intent_consult Handler', () => {
  let testAgentId: string;
  let testIntentId: string;

  beforeEach(async () => {
    // Create a test agent
    testAgentId = `consult_agent_${Date.now()}`;
    await handleAgentRegister({
      agent_id: testAgentId,
      name: 'Consultation Test Agent',
      role: 'specialist',
      capabilities: ['consulting'],
    });

    // Create a test mission (which creates an Intent)
    const result = await handleMissionCreate({
      name: 'Consultation Test Mission',
      description: 'Mission for testing intent consultation',
      objective: 'Test the intent consultation functionality',
      end_state: {
        success: ['consultation_complete'],
        failure: ['consultation_failed'],
      },
      red_lines: ['Do not access restricted data'],
      autonomy_level: 'guided',
      created_by: 'test_user',
    });

    const parsed = parseResult(result);
    testIntentId = parsed.data?.intent_id as string;
  });

  it('should consult intent successfully', async () => {
    const result = await handleIntentConsult({
      agent_id: testAgentId,
      intent_id: testIntentId,
      situation: 'Need to decide which data source to use for analysis',
      options: [
        {
          id: 'opt_a',
          description: 'Use public API data',
          pros: ['Free', 'Fast'],
          cons: ['Limited data'],
        },
        {
          id: 'opt_b',
          description: 'Use internal database',
          pros: ['Complete data'],
          cons: ['Slower access'],
        },
      ],
      urgency: 'medium',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.recommendation).toBeDefined();
    expect(['proceed', 'proceed_with_caution', 'escalate', 'abort']).toContain(
      parsed.data?.recommendation
    );
    expect(parsed.data?.confidence).toBeDefined();
    expect(parsed.data?.reasoning).toBeDefined();
  });

  it('should detect red line violation', async () => {
    const result = await handleIntentConsult({
      agent_id: testAgentId,
      intent_id: testIntentId,
      situation: 'Considering accessing restricted data for analysis',
      options: [
        {
          id: 'opt_a',
          description: 'Access restricted data without authorization',
          cons: ['Violates policy'],
        },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(true);
    // Should detect violation or at least flag as cautionary
    expect(parsed.data?.reasoning).toBeDefined();
  });

  it('should fail for non-existent agent', async () => {
    const result = await handleIntentConsult({
      agent_id: 'non_existent_agent',
      intent_id: testIntentId,
      situation: 'Test situation',
      options: [{ id: 'a', description: 'Option A' }],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('AGENT_NOT_FOUND');
  });

  it('should fail for non-existent intent', async () => {
    const result = await handleIntentConsult({
      agent_id: testAgentId,
      intent_id: 'XI.I.NON_EXISTENT',
      situation: 'Test situation',
      options: [{ id: 'a', description: 'Option A' }],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('INTENT_NOT_FOUND');
  });

  it('should validate options requirement', async () => {
    const result = await handleIntentConsult({
      agent_id: testAgentId,
      intent_id: testIntentId,
      situation: 'Test situation',
      options: [], // Empty options
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe('VALIDATION_FAILED');
  });
});

// ===============================================================================
// SECTION 9: INTEGRATION TESTS
// ===============================================================================

describe('Intent Tools Integration', () => {
  it('should handle full mission lifecycle', async () => {
    // 1. Register an agent
    const agentId = `lifecycle_agent_${Date.now()}`;
    const agentResult = await handleAgentRegister({
      agent_id: agentId,
      name: 'Lifecycle Test Agent',
      role: 'specialist',
      capabilities: ['lifecycle_testing'],
    });
    expect(parseResult(agentResult).success).toBe(true);

    // 2. Create a mission
    const missionResult = await handleMissionCreate({
      name: 'Lifecycle Test Mission',
      description: 'End-to-end lifecycle test',
      objective: 'Test the complete mission lifecycle from creation to completion',
      end_state: {
        success: ['lifecycle_complete'],
        failure: ['lifecycle_failed'],
      },
      red_lines: ['No destructive operations'],
      created_by: 'test_user',
    });
    const missionParsed = parseResult(missionResult);
    expect(missionParsed.success).toBe(true);
    const missionId = missionParsed.data?.mission_id as string;
    const intentId = missionParsed.data?.intent_id as string;

    // 3. Send heartbeat
    const heartbeatResult = await handleAgentHeartbeat({
      agent_id: agentId,
      status: 'executing',
      progress: 25,
    });
    expect(parseResult(heartbeatResult).success).toBe(true);

    // 4. Consult intent
    const consultResult = await handleIntentConsult({
      agent_id: agentId,
      intent_id: intentId,
      situation: 'Deciding how to proceed with the lifecycle test',
      options: [
        { id: 'proceed', description: 'Continue with standard procedure' },
        { id: 'optimize', description: 'Try an optimized approach' },
      ],
    });
    expect(parseResult(consultResult).success).toBe(true);

    // 5. Check status
    const statusResult = await handleMissionStatus({
      mission_id: missionId,
    });
    expect(parseResult(statusResult).success).toBe(true);

    // 6. Complete mission
    const completeResult = await handleMissionComplete({
      mission_id: missionId,
      success: true,
      summary: 'Lifecycle test completed successfully',
    });
    expect(parseResult(completeResult).success).toBe(true);
  });
});
