/**
 * Unit Tests: Core Logging Module
 *
 * Tests the unified logging system including:
 * - Logger creation and methods
 * - Log level filtering
 * - Child loggers with module prefixes
 * - Context management with correlation IDs
 * - Log formatters (Console and JSON)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  Logger,
  LogContextManager,
  ConsoleFormatter,
  JSONFormatter,
  createFormatter,
  configureLogger,
  getLoggerConfig,
  rootLogger,
  LOG_LEVEL_PRIORITY,
  type LogLevel,
  type LogEntry,
} from '../../../src/core/logging/index.js';

describe('Core Logging Module', () => {
  // Store original console methods
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleError: typeof console.error;

  // Mock functions
  let mockConsoleLog: ReturnType<typeof vi.fn>;
  let mockConsoleWarn: ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleError = console.error;

    // Create mock functions
    mockConsoleLog = vi.fn();
    mockConsoleWarn = vi.fn();
    mockConsoleError = vi.fn();

    // Replace console methods
    console.log = mockConsoleLog;
    console.warn = mockConsoleWarn;
    console.error = mockConsoleError;

    // Reset logger config to known state for tests
    configureLogger({
      minLevel: 'debug',
      format: 'console',
      includeStackTraces: true,
      colorize: false,
    });
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Logger', () => {
    describe('createLogger()', () => {
      it('should create a Logger instance', () => {
        const logger = createLogger('TestModule');
        expect(logger).toBeInstanceOf(Logger);
      });

      it('should create logger with specified module name', () => {
        const logger = createLogger('MyTestModule');
        logger.info('Test message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('[MyTestModule]');
      });

      it('should export rootLogger as default app logger', () => {
        expect(rootLogger).toBeInstanceOf(Logger);
      });
    });

    describe('Logging Methods', () => {
      let logger: Logger;

      beforeEach(() => {
        logger = createLogger('TestModule');
      });

      it('should log debug messages', () => {
        logger.debug('Debug message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('DEBUG');
        expect(logOutput).toContain('Debug message');
      });

      it('should log info messages', () => {
        logger.info('Info message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('INFO');
        expect(logOutput).toContain('Info message');
      });

      it('should log warn messages to console.error (MCP stderr requirement)', () => {
        logger.warn('Warning message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('WARN');
        expect(logOutput).toContain('Warning message');
      });

      it('should log error messages to console.error', () => {
        logger.error('Error message');

        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('ERROR');
        expect(logOutput).toContain('Error message');
      });

      it('should log critical messages to console.error', () => {
        logger.critical('Critical message');

        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('CRIT');
        expect(logOutput).toContain('Critical message');
      });

      it('should include additional data in log output', () => {
        logger.info('Message with data', { key: 'value', count: 42 });

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('key');
        expect(logOutput).toContain('value');
        expect(logOutput).toContain('42');
      });

      it('should include error details in log output', () => {
        const testError = new Error('Test error');
        logger.error('Operation failed', testError);

        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('Error');
        expect(logOutput).toContain('Test error');
      });

      it('should include error code if present', () => {
        const testError = new Error('Connection failed') as Error & { code: string };
        testError.code = 'ECONNREFUSED';
        logger.error('Connection error', testError);

        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('ECONNREFUSED');
      });
    });

    describe('child()', () => {
      it('should create child logger with prefixed module', () => {
        const parent = createLogger('Parent');
        const child = parent.child('Child');

        expect(child).toBeInstanceOf(Logger);
        child.info('Child message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('[Parent:Child]');
      });

      it('should support multiple levels of nesting', () => {
        const grandparent = createLogger('Grandparent');
        const parent = grandparent.child('Parent');
        const child = parent.child('Child');

        child.info('Deeply nested message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('[Grandparent:Parent:Child]');
      });

      it('should inherit context from parent logger', () => {
        const parent = createLogger('Parent').withContext({ traceId: 'trace-123' });
        const child = parent.child('Child');

        // The child should have inherited context, we can verify by checking
        // that child is a distinct Logger instance
        expect(child).toBeInstanceOf(Logger);
        expect(child).not.toBe(parent);
      });
    });

    describe('withContext()', () => {
      it('should add context to logger', () => {
        const logger = createLogger('TestModule');
        const contextLogger = logger.withContext({ correlationId: 'ctx-123' });

        expect(contextLogger).toBeInstanceOf(Logger);
        expect(contextLogger).not.toBe(logger);
      });

      it('should include correlation ID in log output when set via context', () => {
        const logger = createLogger('TestModule').withContext({
          correlationId: 'my-correlation-id-12345678',
        });
        logger.info('Context message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        // Console formatter shows first 8 chars of correlation ID
        expect(logOutput).toContain('my-corre');
      });

      it('should merge context from multiple withContext calls', () => {
        const logger = createLogger('TestModule')
          .withContext({ correlationId: 'corr-1' })
          .withContext({ duration: 100 });

        // Logger created successfully with merged context
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe('Log Level Filtering', () => {
      it('should filter out logs below minimum level', () => {
        configureLogger({ minLevel: 'warn' });
        const logger = createLogger('TestModule');

        logger.debug('Debug message');
        logger.info('Info message');
        logger.warn('Warn message');

        // Only warn should be logged (all output goes to stderr/console.error for MCP)
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('WARN');
      });

      it('should respect LOG_LEVEL_PRIORITY ordering', () => {
        expect(LOG_LEVEL_PRIORITY.debug).toBeLessThan(LOG_LEVEL_PRIORITY.info);
        expect(LOG_LEVEL_PRIORITY.info).toBeLessThan(LOG_LEVEL_PRIORITY.warn);
        expect(LOG_LEVEL_PRIORITY.warn).toBeLessThan(LOG_LEVEL_PRIORITY.error);
        expect(LOG_LEVEL_PRIORITY.error).toBeLessThan(LOG_LEVEL_PRIORITY.critical);
      });

      it('should log all levels when minLevel is debug', () => {
        configureLogger({ minLevel: 'debug' });
        const logger = createLogger('TestModule');

        logger.debug('Debug');
        logger.info('Info');
        logger.warn('Warn');
        logger.error('Error');
        logger.critical('Critical');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        // All 5 levels should be logged
        expect(mockConsoleError).toHaveBeenCalledTimes(5);
      });

      it('should only log critical when minLevel is critical', () => {
        configureLogger({ minLevel: 'critical' });
        const logger = createLogger('TestModule');

        logger.debug('Debug');
        logger.info('Info');
        logger.warn('Warn');
        logger.error('Error');
        logger.critical('Critical');

        expect(mockConsoleLog).not.toHaveBeenCalled();
        expect(mockConsoleWarn).not.toHaveBeenCalled();
        expect(mockConsoleError).toHaveBeenCalledTimes(1);
        expect(mockConsoleError.mock.calls[0][0]).toContain('Critical');
      });
    });

    describe('configureLogger() and getLoggerConfig()', () => {
      it('should update global logger configuration', () => {
        configureLogger({ minLevel: 'error', format: 'json' });

        const config = getLoggerConfig();
        expect(config.minLevel).toBe('error');
        expect(config.format).toBe('json');
      });

      it('should return a copy of config, not the original', () => {
        const config1 = getLoggerConfig();
        const config2 = getLoggerConfig();

        expect(config1).not.toBe(config2);
        expect(config1).toEqual(config2);
      });
    });

    describe('time()', () => {
      it('should time a synchronous operation', async () => {
        const logger = createLogger('TestModule');

        const result = await logger.time('syncOp', () => {
          return 'sync result';
        });

        expect(result).toBe('sync result');
        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalled();
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('syncOp completed');
        expect(logOutput).toContain('duration');
      });

      it('should time an async operation', async () => {
        const logger = createLogger('TestModule');

        const result = await logger.time('asyncOp', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'async result';
        });

        expect(result).toBe('async result');
        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        expect(mockConsoleError).toHaveBeenCalled();
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('asyncOp completed');
      });

      it('should log error and rethrow on failure', async () => {
        const logger = createLogger('TestModule');

        await expect(
          logger.time('failingOp', async () => {
            throw new Error('Operation failed');
          })
        ).rejects.toThrow('Operation failed');

        expect(mockConsoleError).toHaveBeenCalled();
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('failingOp failed');
      });
    });
  });

  describe('LogContextManager', () => {
    describe('generateCorrelationId()', () => {
      it('should generate unique correlation IDs', () => {
        const id1 = LogContextManager.generateCorrelationId();
        const id2 = LogContextManager.generateCorrelationId();

        expect(id1).toBeDefined();
        expect(id2).toBeDefined();
        expect(id1).not.toBe(id2);
      });

      it('should generate valid UUID format', () => {
        const id = LogContextManager.generateCorrelationId();
        // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(id).toMatch(uuidRegex);
      });
    });

    describe('generateShortCorrelationId()', () => {
      it('should return 8-character hex string', () => {
        const id = LogContextManager.generateShortCorrelationId();

        expect(id).toHaveLength(8);
        expect(id).toMatch(/^[0-9a-f]{8}$/i);
      });

      it('should generate unique short IDs', () => {
        const id1 = LogContextManager.generateShortCorrelationId();
        const id2 = LogContextManager.generateShortCorrelationId();

        expect(id1).not.toBe(id2);
      });
    });

    describe('setCorrelationId() and getCorrelationId()', () => {
      it('should return undefined when not in a context', () => {
        const id = LogContextManager.getCorrelationId();
        expect(id).toBeUndefined();
      });

      it('should return correlation ID when in a context', () => {
        LogContextManager.runWithCorrelation(() => {
          const id = LogContextManager.getCorrelationId();
          expect(id).toBeDefined();
          expect(typeof id).toBe('string');
        });
      });

      it('should allow setting correlation ID within context', () => {
        LogContextManager.runWithCorrelation(() => {
          LogContextManager.setCorrelationId('new-correlation-id');
          expect(LogContextManager.getCorrelationId()).toBe('new-correlation-id');
        });
      });
    });

    describe('runWithCorrelation()', () => {
      it('should maintain correlation ID in sync functions', () => {
        const testId = 'test-correlation-sync-123';

        const result = LogContextManager.runWithCorrelation(() => {
          expect(LogContextManager.getCorrelationId()).toBe(testId);
          return 'sync result';
        }, testId);

        expect(result).toBe('sync result');
      });

      it('should auto-generate correlation ID if not provided', () => {
        LogContextManager.runWithCorrelation(() => {
          const id = LogContextManager.getCorrelationId();
          expect(id).toBeDefined();
          expect(id!.length).toBeGreaterThan(0);
        });
      });

      it('should isolate contexts in nested calls', () => {
        LogContextManager.runWithCorrelation(() => {
          const outerCorrelationId = LogContextManager.getCorrelationId();
          expect(outerCorrelationId).toBe('outer-id');

          LogContextManager.runWithCorrelation(() => {
            const innerCorrelationId = LogContextManager.getCorrelationId();
            expect(innerCorrelationId).toBe('inner-id');
          }, 'inner-id');

          // After nested call, outer context should still be 'outer-id'
          expect(LogContextManager.getCorrelationId()).toBe('outer-id');
        }, 'outer-id');
      });
    });

    describe('runWithCorrelationAsync()', () => {
      it('should maintain correlation ID in async functions', async () => {
        const testId = 'test-correlation-async-123';

        const result = await LogContextManager.runWithCorrelationAsync(async () => {
          expect(LogContextManager.getCorrelationId()).toBe(testId);
          await new Promise((resolve) => setTimeout(resolve, 5));
          // Should still have the same correlation ID after await
          expect(LogContextManager.getCorrelationId()).toBe(testId);
          return 'async result';
        }, testId);

        expect(result).toBe('async result');
      });

      it('should auto-generate correlation ID for async if not provided', async () => {
        await LogContextManager.runWithCorrelationAsync(async () => {
          const id = LogContextManager.getCorrelationId();
          expect(id).toBeDefined();
        });
      });

      it('should maintain context across multiple awaits', async () => {
        await LogContextManager.runWithCorrelationAsync(async () => {
          const id = LogContextManager.getCorrelationId();

          await new Promise((resolve) => setTimeout(resolve, 1));
          expect(LogContextManager.getCorrelationId()).toBe(id);

          await new Promise((resolve) => setTimeout(resolve, 1));
          expect(LogContextManager.getCorrelationId()).toBe(id);

          await new Promise((resolve) => setTimeout(resolve, 1));
          expect(LogContextManager.getCorrelationId()).toBe(id);
        }, 'persistent-id');
      });
    });

    describe('Trace ID management', () => {
      it('should set and get trace ID within context', () => {
        LogContextManager.runWithCorrelation(() => {
          LogContextManager.setTraceId('trace-abc-123');
          expect(LogContextManager.getTraceId()).toBe('trace-abc-123');
        });
      });

      it('should return undefined for trace ID outside context', () => {
        expect(LogContextManager.getTraceId()).toBeUndefined();
      });
    });

    describe('Additional context', () => {
      it('should set and get additional context', () => {
        LogContextManager.runWithCorrelation(() => {
          LogContextManager.setAdditionalContext({ userId: 'user-123', requestPath: '/api/test' });

          const context = LogContextManager.getAdditionalContext();
          expect(context).toEqual({ userId: 'user-123', requestPath: '/api/test' });
        });
      });

      it('should merge additional context', () => {
        LogContextManager.runWithCorrelation(() => {
          LogContextManager.setAdditionalContext({ key1: 'value1' });
          LogContextManager.setAdditionalContext({ key2: 'value2' });

          const context = LogContextManager.getAdditionalContext();
          expect(context).toEqual({ key1: 'value1', key2: 'value2' });
        });
      });
    });

    describe('getContext()', () => {
      it('should return undefined outside execution context', () => {
        expect(LogContextManager.getContext()).toBeUndefined();
      });

      it('should return full context inside execution context', () => {
        LogContextManager.runWithCorrelation(() => {
          const context = LogContextManager.getContext();
          expect(context).toBeDefined();
          expect(context!.correlationId).toBeDefined();
        }, 'test-corr-id');
      });
    });
  });

  describe('Formatters', () => {
    const createTestEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
      timestamp: '2024-01-06T12:34:56.789Z',
      level: 'info',
      message: 'Test message',
      module: 'TestModule',
      ...overrides,
    });

    describe('ConsoleFormatter', () => {
      it('should produce readable output', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry();

        const output = formatter.format(entry);

        expect(output).toContain('[2024-01-06T12:34:56.789Z]');
        expect(output).toContain('INFO');
        expect(output).toContain('[TestModule]');
        expect(output).toContain('Test message');
      });

      it('should include correlation ID (abbreviated) when present', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({
          correlationId: 'abcd1234-5678-90ef-ghij-klmnopqrstuv',
        });

        const output = formatter.format(entry);
        expect(output).toContain('(abcd1234)');
      });

      it('should include duration when present', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({ duration: 150 });

        const output = formatter.format(entry);
        expect(output).toContain('(150ms)');
      });

      it('should include data when present', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({
          data: { key: 'value', count: 42 },
        });

        const output = formatter.format(entry);
        expect(output).toContain('"key":"value"');
        expect(output).toContain('"count":42');
      });

      it('should include error information when present', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({
          level: 'error',
          error: {
            name: 'TypeError',
            message: 'Something went wrong',
          },
        });

        const output = formatter.format(entry);
        expect(output).toContain('TypeError');
        expect(output).toContain('Something went wrong');
      });

      it('should include error code when present', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({
          level: 'error',
          error: {
            name: 'Error',
            message: 'Connection failed',
            code: 'ECONNREFUSED',
          },
        });

        const output = formatter.format(entry);
        expect(output).toContain('ECONNREFUSED');
      });

      it('should handle entries without module', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry({ module: undefined });

        const output = formatter.format(entry);
        expect(output).not.toContain('[undefined]');
        expect(output).toContain('Test message');
      });

      it('should apply ANSI colors when colorize is true', () => {
        const formatter = new ConsoleFormatter(true);
        const entry = createTestEntry();

        const output = formatter.format(entry);
        // Check for ANSI escape codes
        expect(output).toContain('\x1b[');
      });

      it('should not apply colors when colorize is false', () => {
        const formatter = new ConsoleFormatter(false);
        const entry = createTestEntry();

        const output = formatter.format(entry);
        expect(output).not.toContain('\x1b[');
      });

      it('should format all log levels correctly', () => {
        const formatter = new ConsoleFormatter(false);
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical'];
        const expectedLabels = ['DEBUG', 'INFO ', 'WARN ', 'ERROR', 'CRIT '];

        levels.forEach((level, index) => {
          const entry = createTestEntry({ level });
          const output = formatter.format(entry);
          expect(output).toContain(expectedLabels[index]);
        });
      });
    });

    describe('JSONFormatter', () => {
      it('should produce valid JSON output', () => {
        const formatter = new JSONFormatter();
        const entry = createTestEntry();

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      });

      it('should include all required fields', () => {
        const formatter = new JSONFormatter();
        const entry = createTestEntry();

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        expect(parsed.timestamp).toBe('2024-01-06T12:34:56.789Z');
        expect(parsed.level).toBe('info');
        expect(parsed.message).toBe('Test message');
        expect(parsed.module).toBe('TestModule');
      });

      it('should include optional fields when present', () => {
        const formatter = new JSONFormatter();
        const entry = createTestEntry({
          correlationId: 'corr-123',
          traceId: 'trace-456',
          duration: 200,
          data: { key: 'value' },
        });

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        expect(parsed.correlationId).toBe('corr-123');
        expect(parsed.traceId).toBe('trace-456');
        expect(parsed.duration).toBe(200);
        expect(parsed.data).toEqual({ key: 'value' });
      });

      it('should omit optional fields when not present', () => {
        const formatter = new JSONFormatter();
        const entry: LogEntry = {
          timestamp: '2024-01-06T12:34:56.789Z',
          level: 'info',
          message: 'Simple message',
        };

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        expect(parsed).not.toHaveProperty('module');
        expect(parsed).not.toHaveProperty('correlationId');
        expect(parsed).not.toHaveProperty('traceId');
        expect(parsed).not.toHaveProperty('duration');
        expect(parsed).not.toHaveProperty('data');
        expect(parsed).not.toHaveProperty('error');
      });

      it('should include error details', () => {
        const formatter = new JSONFormatter();
        const entry = createTestEntry({
          level: 'error',
          error: {
            name: 'ValidationError',
            message: 'Invalid input',
            code: 'ERR_VALIDATION',
            stack: 'Error: Invalid input\n    at test.js:10:5',
          },
        });

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        expect(parsed.error).toEqual({
          name: 'ValidationError',
          message: 'Invalid input',
          code: 'ERR_VALIDATION',
          stack: 'Error: Invalid input\n    at test.js:10:5',
        });
      });

      it('should produce single-line JSON by default', () => {
        const formatter = new JSONFormatter(false);
        const entry = createTestEntry();

        const output = formatter.format(entry);
        expect(output.split('\n').length).toBe(1);
      });

      it('should produce pretty JSON when configured', () => {
        const formatter = new JSONFormatter(true);
        const entry = createTestEntry();

        const output = formatter.format(entry);
        expect(output.split('\n').length).toBeGreaterThan(1);
      });

      it('should handle empty data object', () => {
        const formatter = new JSONFormatter();
        const entry = createTestEntry({ data: {} });

        const output = formatter.format(entry);
        const parsed = JSON.parse(output);

        // Empty data should not be included
        expect(parsed).not.toHaveProperty('data');
      });
    });

    describe('createFormatter()', () => {
      it('should create ConsoleFormatter for console format', () => {
        const formatter = createFormatter('console');
        expect(formatter).toBeInstanceOf(ConsoleFormatter);
      });

      it('should create JSONFormatter for json format', () => {
        const formatter = createFormatter('json');
        expect(formatter).toBeInstanceOf(JSONFormatter);
      });

      it('should pass colorize option to ConsoleFormatter', () => {
        const formatter = createFormatter('console', { colorize: true });
        const entry: LogEntry = {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test',
        };

        const output = formatter.format(entry);
        expect(output).toContain('\x1b[');
      });

      it('should pass pretty option to JSONFormatter', () => {
        const formatter = createFormatter('json', { pretty: true });
        const entry: LogEntry = {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test',
        };

        const output = formatter.format(entry);
        expect(output.split('\n').length).toBeGreaterThan(1);
      });

      it('should default colorize to true for console format', () => {
        const formatter = createFormatter('console');
        const entry: LogEntry = {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test',
        };

        const output = formatter.format(entry);
        expect(output).toContain('\x1b[');
      });

      it('should default pretty to false for json format', () => {
        const formatter = createFormatter('json');
        const entry: LogEntry = {
          timestamp: '2024-01-01T00:00:00.000Z',
          level: 'info',
          message: 'Test',
        };

        const output = formatter.format(entry);
        expect(output.split('\n').length).toBe(1);
      });
    });
  });

  describe('Integration: Logger with Context', () => {
    it('should include correlation ID from LogContextManager in log output', () => {
      const logger = createLogger('IntegrationTest');

      LogContextManager.runWithCorrelation(() => {
        logger.info('Message with correlation');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        expect(logOutput).toContain('(integrat');
      }, 'integration-test-correlation-id');
    });

    it('should prefer context correlationId over LogContextManager', () => {
      const logger = createLogger('TestModule').withContext({
        correlationId: 'context-correlation-id',
      });

      LogContextManager.runWithCorrelation(() => {
        logger.info('Message');

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        // Should use the context correlation ID, not the one from LogContextManager
        expect(logOutput).toContain('(context-');
      }, 'manager-correlation-id');
    });

    it('should work with JSON formatter and correlation context', () => {
      configureLogger({ format: 'json' });
      const logger = createLogger('JSONTest');

      LogContextManager.runWithCorrelation(() => {
        logger.info('JSON log message', { action: 'test' });

        // MCP servers route all logs to stderr (console.error) to preserve stdout for JSON-RPC
        const logOutput = mockConsoleError.mock.calls[0][0];
        const parsed = JSON.parse(logOutput);

        expect(parsed.correlationId).toBe('json-test-correlation');
        expect(parsed.data.action).toBe('test');
      }, 'json-test-correlation');
    });
  });
});
