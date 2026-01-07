import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMultiAgentContainer,
  container,
  getDefaultContainer,
  IntentManager,
  AgentRegistry,
  MissionManager,
} from '../../../src/multi_agent/index.js';

describe('Multi-Agent DI Container', () => {
  describe('createMultiAgentContainer()', () => {
    it('should create container with default instances', () => {
      const c = createMultiAgentContainer();
      expect(c.intentManager).toBeInstanceOf(IntentManager);
      expect(c.agentRegistry).toBeInstanceOf(AgentRegistry);
      expect(c.missionManager).toBeInstanceOf(MissionManager);
    });

    it('should allow injecting mock intentManager', () => {
      const mockIntent = { createIntent: vi.fn() } as any;
      const c = createMultiAgentContainer({ intentManager: mockIntent });
      expect(c.intentManager).toBe(mockIntent);
    });

    it('should allow injecting mock agentRegistry', () => {
      const mockRegistry = { register: vi.fn() } as any;
      const c = createMultiAgentContainer({ agentRegistry: mockRegistry });
      expect(c.agentRegistry).toBe(mockRegistry);
    });
  });

  describe('getDefaultContainer()', () => {
    it('should return singleton container', () => {
      const c1 = getDefaultContainer();
      const c2 = getDefaultContainer();
      expect(c1).toBe(c2);
    });
  });
});
