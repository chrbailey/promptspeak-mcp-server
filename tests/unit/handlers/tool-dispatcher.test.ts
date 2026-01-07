import { describe, it, expect, vi } from 'vitest';
import {
  dispatchTool,
  isToolRegistered,
  getRegisteredTools,
  getToolCount,
} from '../../../src/handlers/tool-dispatcher.js';

describe('Tool Dispatcher', () => {
  describe('isToolRegistered()', () => {
    it('should return true for registered tools', () => {
      expect(isToolRegistered('ps_validate')).toBe(true);
      expect(isToolRegistered('ps_execute')).toBe(true);
    });

    it('should return false for unknown tools', () => {
      expect(isToolRegistered('nonexistent_tool')).toBe(false);
    });
  });

  describe('getRegisteredTools()', () => {
    it('should return array of tool names', () => {
      const tools = getRegisteredTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toContain('ps_validate');
      expect(tools).toContain('ps_execute');
    });
  });

  describe('getToolCount()', () => {
    it('should return number of registered tools', () => {
      const count = getToolCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(50); // We know there are 87 tools
    });
  });

  describe('dispatchTool()', () => {
    it('should return error for unknown tool', async () => {
      const result = await dispatchTool('unknown_tool', {});
      expect(result.content[0].text).toContain('Unknown tool');
    });

    // Note: Testing actual tool dispatch would require more setup
    // as tools have side effects. Consider mocking handlers.
  });
});
