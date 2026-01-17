/**
 * Integration Tests: Server Module Integration
 *
 * Tests the integration between refactored server modules:
 * - Tool Registry + Dispatcher integration
 * - Server Initialization
 * - Error + Result integration
 * - Logging integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildToolRegistry, getToolStats } from '../../src/tools/index.js';
import { dispatchTool, isToolRegistered, getToolCount, getToolsByCategory } from '../../src/handlers/index.js';
import { initializeServer } from '../../src/server-init.js';
import { createLogger } from '../../src/core/logging/index.js';
import { success, failure, isSuccess, isFailure, fromError, fromThrowable, unwrapOr } from '../../src/core/result/index.js';
import { ValidationError, NotFoundError, ToolError, InternalError } from '../../src/core/errors/index.js';

describe('Server Module Integration', () => {
  describe('Tool Registry + Dispatcher Integration', () => {
    it('should have matching tool counts between registry and dispatcher', () => {
      const registryTools = buildToolRegistry();
      const dispatcherCount = getToolCount();

      // Allow some flexibility for tools that may be in one but not the other
      // (e.g., dynamically registered tools vs static definitions)
      expect(Math.abs(registryTools.length - dispatcherCount)).toBeLessThan(5);
    });

    it('should have all registry tools registered in dispatcher', () => {
      const registryTools = buildToolRegistry();
      const missingTools: string[] = [];

      for (const tool of registryTools) {
        if (!isToolRegistered(tool.name)) {
          missingTools.push(tool.name);
        }
      }

      expect(missingTools).toEqual([]);
    });

    it('should dispatch ps_validate tool successfully', async () => {
      const result = await dispatchTool('ps_validate', {
        frame: '{action:READ, resource:"file.txt"}'
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should return error for unknown tool', async () => {
      const result = await dispatchTool('unknown_tool_xyz', {});

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text as string);
      expect(response.error).toContain('Unknown tool');
    });

    it('should categorize tools correctly', () => {
      const categories = getToolsByCategory();

      // Verify core categories exist
      expect(categories.validation).toBeDefined();
      expect(categories.execution).toBeDefined();
      expect(categories.delegation).toBeDefined();
      expect(categories.state).toBeDefined();
      expect(categories.config).toBeDefined();

      // Verify validation tools are in the right category
      expect(categories.validation).toContain('ps_validate');
      expect(categories.validation).toContain('ps_validate_batch');

      // Verify execution tools are in the right category
      expect(categories.execution).toContain('ps_execute');
    });

    it('should provide consistent tool stats', () => {
      const stats = getToolStats();
      const registryTools = buildToolRegistry();

      expect(stats.total).toBe(registryTools.length);

      // Verify individual category counts sum correctly
      // Sum all categories dynamically to avoid missing new ones
      const knownCategories = [
        'validation', 'execution', 'delegation', 'state', 'config',
        'confidence', 'feature', 'audit', 'hold', 'legal', 'calendar',
        'symbol', 'graph', 'document', 'translation', 'orchestration',
        'multiAgent', 'swarm', 'intel'
      ];

      const sumOfCategories = knownCategories.reduce(
        (sum, cat) => sum + (stats[cat] || 0),
        0
      );

      expect(sumOfCategories).toBe(stats.total);
    });
  });

  describe('Server Initialization', () => {
    it('should initialize with skip options for testing', async () => {
      const result = await initializeServer({
        skipSubsystems: true,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle individual subsystem skipping', async () => {
      const result = await initializeServer({
        skipPolicyLoader: true,
        skipSymbolManager: true,
        skipAgentSystem: true,
      });

      // All subsystems skipped - success but nothing initialized
      expect(result.errors).toHaveLength(0);
      expect(result.subsystems.policyLoader.initialized).toBe(false);
      expect(result.subsystems.symbolManager.initialized).toBe(false);
      expect(result.subsystems.agentSystem.initialized).toBe(false);
    });

    it('should return structured initialization result', async () => {
      const result = await initializeServer({
        skipSubsystems: true,
      });

      // Verify result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('subsystems');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('instances');

      // Verify subsystems structure
      expect(result.subsystems).toHaveProperty('policyLoader');
      expect(result.subsystems).toHaveProperty('symbolManager');
      expect(result.subsystems).toHaveProperty('agentSystem');
    });
  });

  describe('Error + Result Integration', () => {
    it('should convert ValidationError to result failure', () => {
      const error = ValidationError.requiredField('email');
      const result = failure(error.code, error.message);

      expect(isSuccess(result)).toBe(false);
      if (!isSuccess(result)) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('email');
      }
    });

    it('should convert NotFoundError to result failure', () => {
      const error = new NotFoundError('User', 'user-123');
      const result = failure(error.code, error.message);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toContain('user-123');
      }
    });

    it('should convert ToolError to result failure', () => {
      const error = ToolError.unknownTool('fake_tool');
      const result = failure(error.code, error.message);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('UNKNOWN_TOOL');
      }
    });

    it('should create success results with metadata', () => {
      const result = success({ id: 1 }, { executionTimeMs: 50 });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.id).toBe(1);
        expect(result.metadata?.executionTimeMs).toBe(50);
      }
    });

    it('should convert Error to Failure via fromError', () => {
      const error = new InternalError('Something went wrong');
      const result = fromError(error);

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.message).toBe('Something went wrong');
      }
    });

    it('should wrap throwing functions with fromThrowable', () => {
      const result = fromThrowable(() => {
        throw new Error('Parse failed');
      }, 'PARSE_ERROR');

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('PARSE_ERROR');
      }
    });

    it('should provide default value with unwrapOr', () => {
      const failedResult = failure('NOT_FOUND', 'Resource not found');
      const defaultValue = { id: 0, name: 'default' };

      const value = unwrapOr(failedResult, defaultValue);
      expect(value).toEqual(defaultValue);
    });
  });

  describe('Logging Integration', () => {
    it('should create loggers for different modules', () => {
      const serverLogger = createLogger('Server');
      const dispatcherLogger = createLogger('ToolDispatcher');
      const validatorLogger = createLogger('Validator');

      expect(serverLogger).toBeDefined();
      expect(dispatcherLogger).toBeDefined();
      expect(validatorLogger).toBeDefined();

      // Verify loggers have expected methods
      expect(typeof serverLogger.info).toBe('function');
      expect(typeof serverLogger.debug).toBe('function');
      expect(typeof serverLogger.warn).toBe('function');
      expect(typeof serverLogger.error).toBe('function');
    });

    it('should create child loggers', () => {
      const parentLogger = createLogger('ParentModule');
      const childLogger = parentLogger.child('SubComponent');

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should support timing operations', async () => {
      const logger = createLogger('TimingTest');

      // Verify time method exists
      expect(typeof logger.time).toBe('function');

      // Execute a timed operation
      const result = await logger.time('testOperation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'completed';
      });

      expect(result).toBe('completed');
    });
  });

  describe('Cross-Module Integration', () => {
    it('should validate frame and dispatch execution', async () => {
      // First validate a frame
      const validateResult = await dispatchTool('ps_validate', {
        frame: '{action:READ, resource:"test.txt"}'
      });

      expect(validateResult.isError).toBeUndefined();

      // Parse the validation result
      const validationResponse = JSON.parse(validateResult.content[0].text as string);

      // The frame should be processed (valid or with specific errors)
      expect(validationResponse).toBeDefined();
    });

    it('should handle error propagation across modules', async () => {
      // Test that errors from one module are properly handled by another
      const result = await dispatchTool('ps_execute', {
        agentId: 'test-agent',
        frame: 'invalid-frame-format',
        action: {
          tool: 'test_tool',
          arguments: {}
        }
      });

      // Should return a result (may be error or success based on implementation)
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('should use consistent Result pattern across tool dispatches', async () => {
      const toolNames = ['ps_validate', 'ps_state_system', 'ps_confidence_get'];

      for (const toolName of toolNames) {
        const result = await dispatchTool(toolName,
          toolName === 'ps_validate' ? { frame: 'test' } : {}
        );

        // All dispatched results should have consistent structure
        expect(result).toHaveProperty('content');
        expect(Array.isArray(result.content)).toBe(true);
        expect(result.content[0]).toHaveProperty('type');
        expect(result.content[0]).toHaveProperty('text');
      }
    });
  });

  describe('Error Type Coverage', () => {
    it('should have all error types properly instantiable', () => {
      // Test that error classes work correctly
      const errors = [
        new ValidationError('Test validation error'),
        new NotFoundError('Resource', 'id-123'),
        new ToolError('Tool failed', { toolName: 'test_tool' }),
        new InternalError('Internal error'),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('should serialize errors to JSON', () => {
      const error = new ValidationError('Test error', {
        details: { field: 'name', value: null }
      });

      const json = error.toJSON();

      expect(json).toHaveProperty('code');
      expect(json).toHaveProperty('message');
      expect(json).toHaveProperty('name');
    });

    it('should support static factory methods', () => {
      const requiredFieldError = ValidationError.requiredField('username');
      expect(requiredFieldError.message).toContain('username');

      const invalidValueError = ValidationError.invalidValue('age', -1, 'positive number');
      expect(invalidValueError.message).toContain('age');

      const notFoundError = new NotFoundError('Document', 'doc-456');
      expect(notFoundError.resourceType).toBe('Document');
      expect(notFoundError.resourceId).toBe('doc-456');
    });
  });
});
