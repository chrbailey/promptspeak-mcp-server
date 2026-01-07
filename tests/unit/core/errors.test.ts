/**
 * Unit Tests: Core Errors Module
 *
 * Comprehensive tests for the PromptSpeak error handling system including:
 * - Error codes and mappings
 * - Base error class
 * - Specific error types
 * - Type guards and utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Error codes and mappings
  ErrorCode,
  ErrorSeverity,
  ERROR_CODE_TO_STATUS,
  ERROR_CODE_RETRYABLE,
  ERROR_CODE_SEVERITY,
  // Base error and utilities
  PromptSpeakError,
  isPromptSpeakError,
  hasErrorCode,
  toPromptSpeakError,
  // Specific error types
  ValidationError,
  NotFoundError,
  ConflictError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  CircuitBreakerError,
  AuthenticationError,
  ForbiddenError,
  AdapterError,
  AgentError,
  IntentError,
  MissionError,
  ProposalError,
  DocumentError,
  TranslationError,
  DatabaseError,
  ToolError,
  InternalError,
  NotImplementedError,
} from '../../../src/core/errors/index.js';

// =============================================================================
// ERROR CODES TESTS
// =============================================================================

describe('Error Codes Module', () => {
  describe('ErrorCode enum', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.AGENT_NOT_FOUND).toBe('AGENT_NOT_FOUND');
      expect(ErrorCode.INTENT_PARSE_ERROR).toBe('INTENT_PARSE_ERROR');
      expect(ErrorCode.MISSION_NOT_FOUND).toBe('MISSION_NOT_FOUND');
    });
  });

  describe('ErrorSeverity enum', () => {
    it('should have all severity levels', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('ERROR_CODE_TO_STATUS mapping', () => {
    it('should map validation errors to 4xx status codes', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.VALIDATION_ERROR]).toBe(422);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.INVALID_JSON]).toBe(400);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.REQUIRED_FIELD_MISSING]).toBe(400);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.VALUE_OUT_OF_RANGE]).toBe(400);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.INVALID_FORMAT]).toBe(400);
    });

    it('should map resource errors correctly', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.NOT_FOUND]).toBe(404);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.CONFLICT]).toBe(409);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.GONE]).toBe(410);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.LOCKED]).toBe(423);
    });

    it('should map network errors to 5xx status codes', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.NETWORK_ERROR]).toBe(502);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.TIMEOUT]).toBe(504);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.CONNECTION_REFUSED]).toBe(502);
    });

    it('should map auth errors to 401/403', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.AUTH_FAILED]).toBe(401);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.UNAUTHORIZED]).toBe(401);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.FORBIDDEN]).toBe(403);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.TOKEN_EXPIRED]).toBe(401);
    });

    it('should map rate limiting to 429', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.RATE_LIMITED]).toBe(429);
    });

    it('should map internal errors to 500', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.INTERNAL_ERROR]).toBe(500);
      expect(ERROR_CODE_TO_STATUS[ErrorCode.UNKNOWN]).toBe(500);
    });

    it('should map not implemented to 501', () => {
      expect(ERROR_CODE_TO_STATUS[ErrorCode.NOT_IMPLEMENTED]).toBe(501);
    });

    it('should have a mapping for every ErrorCode', () => {
      const errorCodes = Object.values(ErrorCode);
      for (const code of errorCodes) {
        expect(ERROR_CODE_TO_STATUS[code]).toBeDefined();
        expect(typeof ERROR_CODE_TO_STATUS[code]).toBe('number');
      }
    });
  });

  describe('ERROR_CODE_RETRYABLE mapping', () => {
    it('should mark network-related errors as retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.NETWORK_ERROR]).toBe(true);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.TIMEOUT]).toBe(true);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.CONNECTION_REFUSED]).toBe(true);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.DNS_ERROR]).toBe(true);
    });

    it('should mark rate limiting as retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.RATE_LIMITED]).toBe(true);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.CIRCUIT_OPEN]).toBe(true);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.SERVICE_UNAVAILABLE]).toBe(true);
    });

    it('should mark validation errors as not retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.VALIDATION_ERROR]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.INVALID_JSON]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.REQUIRED_FIELD_MISSING]).toBe(false);
    });

    it('should mark auth errors as not retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.AUTH_FAILED]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.UNAUTHORIZED]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.FORBIDDEN]).toBe(false);
    });

    it('should mark not found as not retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.NOT_FOUND]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.AGENT_NOT_FOUND]).toBe(false);
      expect(ERROR_CODE_RETRYABLE[ErrorCode.MISSION_NOT_FOUND]).toBe(false);
    });

    it('should mark locked resources as retryable', () => {
      expect(ERROR_CODE_RETRYABLE[ErrorCode.LOCKED]).toBe(true);
    });

    it('should have a mapping for every ErrorCode', () => {
      const errorCodes = Object.values(ErrorCode);
      for (const code of errorCodes) {
        expect(ERROR_CODE_RETRYABLE[code]).toBeDefined();
        expect(typeof ERROR_CODE_RETRYABLE[code]).toBe('boolean');
      }
    });
  });

  describe('ERROR_CODE_SEVERITY mapping', () => {
    it('should mark database errors as critical/high severity', () => {
      expect(ERROR_CODE_SEVERITY[ErrorCode.DATABASE_NOT_INITIALIZED]).toBe(ErrorSeverity.CRITICAL);
      expect(ERROR_CODE_SEVERITY[ErrorCode.DATABASE_CONNECTION_ERROR]).toBe(ErrorSeverity.CRITICAL);
      expect(ERROR_CODE_SEVERITY[ErrorCode.DATABASE_QUERY_ERROR]).toBe(ErrorSeverity.HIGH);
    });

    it('should mark validation errors as low severity', () => {
      expect(ERROR_CODE_SEVERITY[ErrorCode.VALIDATION_ERROR]).toBe(ErrorSeverity.LOW);
      expect(ERROR_CODE_SEVERITY[ErrorCode.INVALID_JSON]).toBe(ErrorSeverity.LOW);
      expect(ERROR_CODE_SEVERITY[ErrorCode.NOT_FOUND]).toBe(ErrorSeverity.LOW);
    });

    it('should mark network errors as medium severity', () => {
      expect(ERROR_CODE_SEVERITY[ErrorCode.NETWORK_ERROR]).toBe(ErrorSeverity.MEDIUM);
      expect(ERROR_CODE_SEVERITY[ErrorCode.TIMEOUT]).toBe(ErrorSeverity.MEDIUM);
    });

    it('should mark internal errors as high severity', () => {
      expect(ERROR_CODE_SEVERITY[ErrorCode.INTERNAL_ERROR]).toBe(ErrorSeverity.HIGH);
      expect(ERROR_CODE_SEVERITY[ErrorCode.UNKNOWN]).toBe(ErrorSeverity.HIGH);
    });

    it('should have a mapping for every ErrorCode', () => {
      const errorCodes = Object.values(ErrorCode);
      for (const code of errorCodes) {
        expect(ERROR_CODE_SEVERITY[code]).toBeDefined();
        expect(Object.values(ErrorSeverity)).toContain(ERROR_CODE_SEVERITY[code]);
      }
    });
  });
});

// =============================================================================
// BASE ERROR TESTS
// =============================================================================

describe('Base Error Module', () => {
  describe('PromptSpeakError base class', () => {
    // Use a concrete error class for testing the base behavior
    let error: ValidationError;

    beforeEach(() => {
      error = new ValidationError('Test validation error');
    });

    it('should have correct name', () => {
      expect(error.name).toBe('ValidationError');
    });

    it('should have correct message', () => {
      expect(error.message).toBe('Test validation error');
    });

    it('should have correct error code', () => {
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should have a timestamp', () => {
      expect(error.timestamp).toBeDefined();
      expect(() => new Date(error.timestamp)).not.toThrow();
    });

    it('should have correct default retryable status', () => {
      expect(error.retryable).toBe(false);
    });

    it('should have correct default status code', () => {
      expect(error.statusCode).toBe(422);
    });

    it('should have correct severity', () => {
      expect(error.severity).toBe(ErrorSeverity.LOW);
    });

    it('should be instance of Error', () => {
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of PromptSpeakError', () => {
      expect(error).toBeInstanceOf(PromptSpeakError);
    });

    it('should have a stack trace', () => {
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('PromptSpeakError with options', () => {
    it('should accept custom details', () => {
      const error = new ValidationError('Invalid input', {
        details: { field: 'email', value: 'invalid' },
      });

      expect(error.details).toEqual({ field: 'email', value: 'invalid' });
    });

    it('should accept original error', () => {
      const originalError = new Error('Original cause');
      const error = new ValidationError('Wrapper error', {
        originalError,
      });

      expect(error.originalError).toBe(originalError);
    });

    it('should allow overriding retryable status', () => {
      const error = new ValidationError('Temporary validation failure', {
        retryable: true,
      });

      expect(error.retryable).toBe(true);
    });

    it('should allow overriding status code', () => {
      const error = new ValidationError('Custom status', {
        statusCode: 400,
      });

      expect(error.statusCode).toBe(400);
    });

    it('should allow overriding severity', () => {
      const error = new ValidationError('Critical validation', {
        severity: ErrorSeverity.HIGH,
      });

      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });
  });

  describe('toJSON() serialization', () => {
    it('should serialize basic error properties', () => {
      const error = new ValidationError('Test error');
      const json = error.toJSON();

      expect(json.name).toBe('ValidationError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(json.severity).toBe(ErrorSeverity.LOW);
      expect(json.retryable).toBe(false);
      expect(json.statusCode).toBe(422);
      expect(json.timestamp).toBeDefined();
    });

    it('should include details when present', () => {
      const error = new ValidationError('Test error', {
        details: { field: 'name', reason: 'too short' },
      });
      const json = error.toJSON();

      expect(json.details).toEqual({ field: 'name', reason: 'too short' });
    });

    it('should not include details when empty', () => {
      const error = new ValidationError('Test error', {
        details: {},
      });
      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });

    it('should not include stack by default', () => {
      const error = new ValidationError('Test error');
      const json = error.toJSON();

      expect(json.stack).toBeUndefined();
    });

    it('should include stack when requested', () => {
      const error = new ValidationError('Test error');
      const json = error.toJSON(true);

      expect(json.stack).toBeDefined();
      expect(json.stack).toContain('ValidationError');
    });

    it('should include original error cause', () => {
      const originalError = new Error('Original error');
      const error = new ValidationError('Wrapper', {
        originalError,
      });
      const json = error.toJSON();

      expect(json.cause).toBeDefined();
      expect(json.cause!.name).toBe('Error');
      expect(json.cause!.message).toBe('Original error');
    });

    it('should include original error stack when requested', () => {
      const originalError = new Error('Original error');
      const error = new ValidationError('Wrapper', {
        originalError,
      });
      const json = error.toJSON(true);

      expect(json.cause!.stack).toBeDefined();
    });

    it('should produce valid JSON', () => {
      const error = new ValidationError('Test error', {
        details: { nested: { value: 123 } },
        originalError: new Error('Cause'),
      });
      const json = error.toJSON();

      expect(() => JSON.stringify(json)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(json));
      expect(parsed.message).toBe('Test error');
    });
  });

  describe('toString() method', () => {
    it('should format error as string', () => {
      const error = new ValidationError('Invalid email format');
      const str = error.toString();

      expect(str).toContain('ValidationError');
      expect(str).toContain('VALIDATION_ERROR');
      expect(str).toContain('Invalid email format');
    });

    it('should include original error in string', () => {
      const error = new ValidationError('Wrapped', {
        originalError: new Error('Original cause'),
      });
      const str = error.toString();

      expect(str).toContain('caused by');
      expect(str).toContain('Original cause');
    });
  });

  describe('withDetails() method', () => {
    it('should create new error with additional details', () => {
      const error = new ValidationError('Initial error', {
        details: { field: 'email' },
      });
      const enrichedError = error.withDetails({ context: 'registration' });

      expect(enrichedError.details).toEqual({
        field: 'email',
        context: 'registration',
      });
    });

    it('should preserve original error message', () => {
      const error = new ValidationError('Original message');
      const enrichedError = error.withDetails({ extra: 'info' });

      expect(enrichedError.message).toBe('Original message');
    });

    it('should preserve original error properties', () => {
      const originalError = new Error('Cause');
      const error = new ValidationError('Test', {
        originalError,
        retryable: true,
        statusCode: 400,
      });
      const enrichedError = error.withDetails({ extra: 'info' });

      expect(enrichedError.originalError).toBe(originalError);
      expect(enrichedError.retryable).toBe(true);
      expect(enrichedError.statusCode).toBe(400);
    });

    it('should return same error type', () => {
      // Note: withDetails() creates a new instance by calling the constructor with
      // the original message. For NotFoundError, this means the resourceType/resourceId
      // need to be passed differently. This test verifies the behavior.
      const error = new ValidationError('Invalid input', {
        details: { field: 'email' },
      });
      const enrichedError = error.withDetails({ context: 'registration' });

      expect(enrichedError).toBeInstanceOf(ValidationError);
      expect(enrichedError.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should override existing details', () => {
      const error = new ValidationError('Test', {
        details: { key: 'old' },
      });
      const enrichedError = error.withDetails({ key: 'new' });

      expect(enrichedError.details!.key).toBe('new');
    });
  });

  describe('static wrap() method', () => {
    it('should wrap an error with new message', () => {
      const original = new Error('Original message');
      const wrapped = ValidationError.wrap(original, 'Wrapped message');

      expect(wrapped.message).toBe('Wrapped message');
      expect(wrapped.originalError).toBe(original);
    });

    it('should use original message if not provided', () => {
      const original = new Error('Original message');
      const wrapped = ValidationError.wrap(original);

      expect(wrapped.message).toBe('Original message');
      expect(wrapped.originalError).toBe(original);
    });

    it('should create correct error type', () => {
      const original = new Error('Original');
      const wrapped = NetworkError.wrap(original, 'Network failed');

      expect(wrapped).toBeInstanceOf(NetworkError);
      expect(wrapped.code).toBe(ErrorCode.NETWORK_ERROR);
    });
  });

  describe('isPromptSpeakError() type guard', () => {
    it('should return true for PromptSpeakError instances', () => {
      const error = new ValidationError('Test');
      expect(isPromptSpeakError(error)).toBe(true);
    });

    it('should return true for all specific error types', () => {
      expect(isPromptSpeakError(new NotFoundError('User'))).toBe(true);
      expect(isPromptSpeakError(new NetworkError('Failed'))).toBe(true);
      expect(isPromptSpeakError(new TimeoutError())).toBe(true);
      expect(isPromptSpeakError(new RateLimitError())).toBe(true);
      expect(isPromptSpeakError(new AgentError('Error'))).toBe(true);
      expect(isPromptSpeakError(new IntentError('Error'))).toBe(true);
      expect(isPromptSpeakError(new MissionError('Error'))).toBe(true);
    });

    it('should return false for standard Error', () => {
      const error = new Error('Standard error');
      expect(isPromptSpeakError(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isPromptSpeakError(null)).toBe(false);
      expect(isPromptSpeakError(undefined)).toBe(false);
      expect(isPromptSpeakError('error string')).toBe(false);
      expect(isPromptSpeakError(42)).toBe(false);
      expect(isPromptSpeakError({ message: 'fake' })).toBe(false);
    });
  });

  describe('hasErrorCode() type guard', () => {
    it('should return true when error has matching code', () => {
      const error = new ValidationError('Test');
      expect(hasErrorCode(error, ErrorCode.VALIDATION_ERROR)).toBe(true);
    });

    it('should return false when error has different code', () => {
      const error = new ValidationError('Test');
      expect(hasErrorCode(error, ErrorCode.NOT_FOUND)).toBe(false);
    });

    it('should return false for non-PromptSpeakError', () => {
      const error = new Error('Standard');
      expect(hasErrorCode(error, ErrorCode.VALIDATION_ERROR)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(hasErrorCode(null, ErrorCode.VALIDATION_ERROR)).toBe(false);
      expect(hasErrorCode('string', ErrorCode.VALIDATION_ERROR)).toBe(false);
    });

    it('should work with specific error codes', () => {
      const agentError = AgentError.notFound('agent-1');
      expect(hasErrorCode(agentError, ErrorCode.AGENT_NOT_FOUND)).toBe(true);
      expect(hasErrorCode(agentError, ErrorCode.AGENT_ERROR)).toBe(false);
    });
  });

  describe('toPromptSpeakError() conversion', () => {
    it('should return PromptSpeakError unchanged', () => {
      const error = new ValidationError('Test');
      const result = toPromptSpeakError(error);

      expect(result).toBe(error);
    });

    // Note: The toPromptSpeakError() function uses CommonJS require() internally
    // to avoid circular dependencies. In an ESM environment like Vitest, this
    // can cause issues. These tests verify the function exists and handles
    // PromptSpeakError correctly. The wrapping functionality is tested via
    // the InternalError class directly.
    it('should handle PromptSpeakError subclasses', () => {
      const validationError = new ValidationError('Invalid');
      const notFoundError = new NotFoundError('User', 'u-1');
      const agentError = AgentError.notFound('agent-1');

      expect(toPromptSpeakError(validationError)).toBe(validationError);
      expect(toPromptSpeakError(notFoundError)).toBe(notFoundError);
      expect(toPromptSpeakError(agentError)).toBe(agentError);
    });

    it('should correctly identify PromptSpeakError before wrapping', () => {
      // The function first checks if it's already a PromptSpeakError
      const error = new InternalError('Already internal');
      const result = toPromptSpeakError(error);

      expect(result).toBe(error);
      expect(isPromptSpeakError(result)).toBe(true);
    });
  });
});

// =============================================================================
// SPECIFIC ERROR TYPES TESTS
// =============================================================================

describe('Specific Error Types', () => {
  describe('ValidationError', () => {
    it('should create basic validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(422);
    });

    describe('requiredField()', () => {
      it('should create error for missing field', () => {
        const error = ValidationError.requiredField('email');

        expect(error.message).toContain('email');
        expect(error.message).toContain('Required field missing');
        expect(error.details).toEqual({ field: 'email' });
      });

      it('should work with different field names', () => {
        const error = ValidationError.requiredField('user.address.zipCode');

        expect(error.message).toContain('user.address.zipCode');
        expect(error.details!.field).toBe('user.address.zipCode');
      });
    });

    describe('invalidValue()', () => {
      it('should create error for invalid value', () => {
        const error = ValidationError.invalidValue('age', -5);

        expect(error.message).toContain('age');
        expect(error.details).toEqual({ field: 'age', value: -5, expectedType: undefined });
      });

      it('should include expected type when provided', () => {
        const error = ValidationError.invalidValue('email', 'not-an-email', 'email format');

        expect(error.message).toContain('expected email format');
        expect(error.details).toEqual({
          field: 'email',
          value: 'not-an-email',
          expectedType: 'email format',
        });
      });

      it('should handle complex values', () => {
        const complexValue = { nested: { array: [1, 2, 3] } };
        const error = ValidationError.invalidValue('config', complexValue, 'object');

        expect(error.details!.value).toEqual(complexValue);
      });
    });
  });

  describe('NotFoundError', () => {
    it('should create error with resource type only', () => {
      const error = new NotFoundError('User');

      expect(error.message).toBe('User not found');
      expect(error.resourceType).toBe('User');
      expect(error.resourceId).toBeUndefined();
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
    });

    it('should create error with resource type and ID', () => {
      const error = new NotFoundError('User', 'user-123');

      expect(error.message).toBe("User 'user-123' not found");
      expect(error.resourceType).toBe('User');
      expect(error.resourceId).toBe('user-123');
    });

    it('should include resource info in JSON', () => {
      const error = new NotFoundError('Document', 'doc-456');
      const json = error.toJSON();

      expect(json.resourceType).toBe('Document');
      expect(json.resourceId).toBe('doc-456');
    });
  });

  describe('NetworkError', () => {
    it('should create basic network error', () => {
      const error = new NetworkError('Connection failed');

      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(502);
    });

    it('should include URL when provided', () => {
      const error = new NetworkError('Request failed', {
        url: 'https://api.example.com/users',
      });

      expect(error.url).toBe('https://api.example.com/users');
    });

    it('should include URL in JSON', () => {
      const error = new NetworkError('Failed', { url: 'https://example.com' });
      const json = error.toJSON();

      expect(json.url).toBe('https://example.com');
    });
  });

  describe('TimeoutError', () => {
    it('should create default timeout error', () => {
      const error = new TimeoutError();

      expect(error.message).toBe('Request timed out');
      expect(error.code).toBe(ErrorCode.TIMEOUT);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(504);
    });

    it('should accept custom message', () => {
      const error = new TimeoutError('Database query timed out');

      expect(error.message).toBe('Database query timed out');
    });

    it('should include timeout duration', () => {
      const error = new TimeoutError('Timed out', { timeoutMs: 30000 });

      expect(error.timeoutMs).toBe(30000);
    });

    it('should include timeoutMs in JSON', () => {
      const error = new TimeoutError('Timed out', { timeoutMs: 5000 });
      const json = error.toJSON();

      expect(json.timeoutMs).toBe(5000);
    });
  });

  describe('RateLimitError', () => {
    it('should create default rate limit error', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
    });

    it('should include retry after', () => {
      const error = new RateLimitError('Too many requests', {
        retryAfter: 60,
      });

      expect(error.retryAfter).toBe(60);
    });

    it('should include limit and window', () => {
      const error = new RateLimitError('Rate exceeded', {
        limit: 100,
        window: 'minute',
        retryAfter: 45,
      });

      expect(error.limit).toBe(100);
      expect(error.window).toBe('minute');
      expect(error.retryAfter).toBe(45);
    });

    it('should include all properties in JSON', () => {
      const error = new RateLimitError('Limited', {
        retryAfter: 30,
        limit: 50,
        window: 'hour',
      });
      const json = error.toJSON();

      expect(json.retryAfter).toBe(30);
      expect(json.limit).toBe(50);
      expect(json.window).toBe('hour');
    });
  });

  describe('AgentError', () => {
    it('should create basic agent error', () => {
      const error = new AgentError('Agent failed to execute task');

      expect(error.name).toBe('AgentError');
      expect(error.code).toBe(ErrorCode.AGENT_ERROR);
    });

    it('should include agent ID and operation', () => {
      const error = new AgentError('Execution failed', {
        agentId: 'agent-001',
        operation: 'process_request',
      });

      expect(error.agentId).toBe('agent-001');
      expect(error.operation).toBe('process_request');
    });

    describe('notFound()', () => {
      it('should create agent not found error', () => {
        const error = AgentError.notFound('agent-xyz');

        expect(error.message).toContain('agent-xyz');
        expect(error.message).toContain('not found');
        expect(error.code).toBe(ErrorCode.AGENT_NOT_FOUND);
        expect(error.agentId).toBe('agent-xyz');
        expect(error.statusCode).toBe(404);
      });
    });

    describe('alreadyRegistered()', () => {
      it('should create already registered error', () => {
        const error = AgentError.alreadyRegistered('agent-abc');

        expect(error.message).toContain('agent-abc');
        expect(error.message).toContain('already registered');
        expect(error.code).toBe(ErrorCode.AGENT_ALREADY_REGISTERED);
        expect(error.agentId).toBe('agent-abc');
        expect(error.statusCode).toBe(409);
      });
    });

    describe('delegationDepthExceeded()', () => {
      it('should create delegation depth error', () => {
        const error = AgentError.delegationDepthExceeded(5);

        expect(error.message).toContain('5');
        expect(error.message).toContain('delegation depth');
        expect(error.code).toBe(ErrorCode.DELEGATION_DEPTH_EXCEEDED);
        expect(error.details!.maxDepth).toBe(5);
      });
    });

    it('should include properties in JSON', () => {
      const error = new AgentError('Test', {
        agentId: 'agent-1',
        operation: 'test-op',
      });
      const json = error.toJSON();

      expect(json.agentId).toBe('agent-1');
      expect(json.operation).toBe('test-op');
    });
  });

  describe('IntentError', () => {
    it('should create basic intent error', () => {
      const error = new IntentError('Intent processing failed');

      expect(error.name).toBe('IntentError');
      expect(error.code).toBe(ErrorCode.INTENT_ERROR);
    });

    it('should include raw input and intent type', () => {
      const error = new IntentError('Cannot process', {
        rawInput: 'invalid command',
        intentType: 'command',
      });

      expect(error.rawInput).toBe('invalid command');
      expect(error.intentType).toBe('command');
    });

    describe('parseError()', () => {
      it('should create parse error with input', () => {
        const error = IntentError.parseError('malformed input');

        expect(error.message).toContain('Failed to parse intent');
        expect(error.code).toBe(ErrorCode.INTENT_PARSE_ERROR);
        expect(error.rawInput).toBe('malformed input');
      });

      it('should include reason when provided', () => {
        const error = IntentError.parseError('bad input', 'missing delimiter');

        expect(error.message).toContain('missing delimiter');
      });
    });

    describe('unknownIntent()', () => {
      it('should create unknown intent error', () => {
        const error = IntentError.unknownIntent('CUSTOM_ACTION');

        expect(error.message).toContain('CUSTOM_ACTION');
        expect(error.message).toContain('Unknown intent');
        expect(error.code).toBe(ErrorCode.INTENT_UNKNOWN);
        expect(error.intentType).toBe('CUSTOM_ACTION');
      });
    });

    it('should include properties in JSON', () => {
      const error = new IntentError('Test', {
        rawInput: 'input',
        intentType: 'type',
      });
      const json = error.toJSON();

      expect(json.rawInput).toBe('input');
      expect(json.intentType).toBe('type');
    });
  });

  describe('MissionError', () => {
    it('should create basic mission error', () => {
      const error = new MissionError('Mission failed');

      expect(error.name).toBe('MissionError');
      expect(error.code).toBe(ErrorCode.MISSION_ERROR);
    });

    it('should include mission ID and state', () => {
      const error = new MissionError('Cannot update', {
        missionId: 'mission-123',
        missionState: 'completed',
      });

      expect(error.missionId).toBe('mission-123');
      expect(error.missionState).toBe('completed');
    });

    describe('notFound()', () => {
      it('should create mission not found error', () => {
        const error = MissionError.notFound('mission-404');

        expect(error.message).toContain('mission-404');
        expect(error.message).toContain('not found');
        expect(error.code).toBe(ErrorCode.MISSION_NOT_FOUND);
        expect(error.missionId).toBe('mission-404');
        expect(error.statusCode).toBe(404);
      });
    });

    describe('alreadyCompleted()', () => {
      it('should create already completed error', () => {
        const error = MissionError.alreadyCompleted('mission-done');

        expect(error.message).toContain('mission-done');
        expect(error.message).toContain('already completed');
        expect(error.code).toBe(ErrorCode.MISSION_COMPLETED);
        expect(error.missionId).toBe('mission-done');
        expect(error.missionState).toBe('completed');
        expect(error.statusCode).toBe(409);
      });
    });

    describe('expired()', () => {
      it('should create expired error', () => {
        const error = MissionError.expired('mission-old');

        expect(error.message).toContain('mission-old');
        expect(error.message).toContain('expired');
        expect(error.code).toBe(ErrorCode.MISSION_EXPIRED);
        expect(error.missionId).toBe('mission-old');
        expect(error.statusCode).toBe(410);
      });
    });

    it('should include properties in JSON', () => {
      const error = new MissionError('Test', {
        missionId: 'm-1',
        missionState: 'pending',
      });
      const json = error.toJSON();

      expect(json.missionId).toBe('m-1');
      expect(json.missionState).toBe('pending');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.name).toBe('ConflictError');
      expect(error.code).toBe(ErrorCode.CONFLICT);
      expect(error.statusCode).toBe(409);
      expect(error.retryable).toBe(false);
    });
  });

  describe('CircuitBreakerError', () => {
    it('should create circuit breaker error', () => {
      const error = new CircuitBreakerError();

      expect(error.message).toBe('Circuit breaker is open');
      expect(error.code).toBe(ErrorCode.CIRCUIT_OPEN);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(503);
    });

    it('should include service name and reset time', () => {
      const error = new CircuitBreakerError('Service unavailable', {
        serviceName: 'payment-api',
        resetAfter: 30,
      });

      expect(error.serviceName).toBe('payment-api');
      expect(error.resetAfter).toBe(30);
    });

    it('should include properties in JSON', () => {
      const error = new CircuitBreakerError('Test', {
        serviceName: 'svc',
        resetAfter: 10,
      });
      const json = error.toJSON();

      expect(json.serviceName).toBe('svc');
      expect(json.resetAfter).toBe(10);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe(ErrorCode.AUTH_FAILED);
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Access denied');
      expect(error.code).toBe(ErrorCode.FORBIDDEN);
      expect(error.statusCode).toBe(403);
    });

    it('should include resource', () => {
      const error = new ForbiddenError('Cannot access admin panel', {
        resource: '/admin',
      });

      expect(error.resource).toBe('/admin');
    });

    it('should include resource in JSON', () => {
      const error = new ForbiddenError('Denied', { resource: '/api/secret' });
      const json = error.toJSON();

      expect(json.resource).toBe('/api/secret');
    });
  });

  describe('AdapterError', () => {
    it('should create basic adapter error', () => {
      const error = new AdapterError('External API failed');

      expect(error.name).toBe('AdapterError');
      expect(error.code).toBe(ErrorCode.ADAPTER_ERROR);
    });

    it('should include adapter name and code', () => {
      const error = new AdapterError('API Error', {
        adapterName: 'OpenAI',
        adapterCode: 'RATE_LIMITED',
      });

      expect(error.adapterName).toBe('OpenAI');
      expect(error.adapterCode).toBe('RATE_LIMITED');
    });

    describe('fromLegacy()', () => {
      it('should create from legacy format', () => {
        const error = AdapterError.fromLegacy(
          'Network failed',
          'NETWORK_ERROR',
          502,
          true
        );

        expect(error.message).toBe('Network failed');
        expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(error.statusCode).toBe(502);
        expect(error.retryable).toBe(true);
        expect(error.adapterCode).toBe('NETWORK_ERROR');
      });

      it('should map legacy codes to error codes', () => {
        expect(AdapterError.fromLegacy('', 'TIMEOUT', 504, true).code).toBe(ErrorCode.TIMEOUT);
        expect(AdapterError.fromLegacy('', 'RATE_LIMITED', 429, true).code).toBe(ErrorCode.RATE_LIMITED);
        expect(AdapterError.fromLegacy('', 'AUTH_FAILED', 401, false).code).toBe(ErrorCode.AUTH_FAILED);
        expect(AdapterError.fromLegacy('', 'NOT_FOUND', 404, false).code).toBe(ErrorCode.NOT_FOUND);
      });

      it('should preserve original error', () => {
        const original = new Error('Original');
        const error = AdapterError.fromLegacy('Wrapped', 'UNKNOWN', 500, false, original);

        expect(error.originalError).toBe(original);
      });
    });

    it('should include properties in JSON', () => {
      const error = new AdapterError('Test', {
        adapterName: 'test-adapter',
        adapterCode: 'TEST_CODE',
      });
      const json = error.toJSON();

      expect(json.adapterName).toBe('test-adapter');
      expect(json.adapterCode).toBe('TEST_CODE');
    });
  });

  describe('ProposalError', () => {
    it('should create basic proposal error', () => {
      const error = new ProposalError('Proposal failed');

      expect(error.name).toBe('ProposalError');
      expect(error.code).toBe(ErrorCode.PROPOSAL_ERROR);
    });

    describe('notFound()', () => {
      it('should create not found error', () => {
        const error = ProposalError.notFound('prop-123');

        expect(error.message).toContain('prop-123');
        expect(error.code).toBe(ErrorCode.PROPOSAL_NOT_FOUND);
        expect(error.proposalId).toBe('prop-123');
      });
    });

    describe('notPending()', () => {
      it('should create not pending error', () => {
        const error = ProposalError.notPending('prop-456', 'approved');

        expect(error.message).toContain('not pending');
        expect(error.message).toContain('approved');
        expect(error.code).toBe(ErrorCode.PROPOSAL_NOT_PENDING);
        expect(error.proposalId).toBe('prop-456');
        expect(error.proposalState).toBe('approved');
      });
    });

    describe('expired()', () => {
      it('should create expired error', () => {
        const error = ProposalError.expired('prop-789');

        expect(error.message).toContain('expired');
        expect(error.code).toBe(ErrorCode.PROPOSAL_EXPIRED);
        expect(error.proposalId).toBe('prop-789');
      });
    });
  });

  describe('DocumentError', () => {
    it('should create basic document error', () => {
      const error = new DocumentError('Document processing failed');

      expect(error.name).toBe('DocumentError');
      expect(error.code).toBe(ErrorCode.DOCUMENT_ERROR);
    });

    describe('notFound()', () => {
      it('should create not found error', () => {
        const error = DocumentError.notFound('/path/to/file.txt');

        expect(error.message).toContain('/path/to/file.txt');
        expect(error.code).toBe(ErrorCode.DOCUMENT_NOT_FOUND);
        expect(error.documentPath).toBe('/path/to/file.txt');
      });
    });

    describe('unsupportedFormat()', () => {
      it('should create unsupported format error', () => {
        const error = DocumentError.unsupportedFormat('.xyz');

        expect(error.message).toContain('.xyz');
        expect(error.code).toBe(ErrorCode.UNSUPPORTED_FORMAT);
        expect(error.format).toBe('.xyz');
        expect(error.statusCode).toBe(415);
      });
    });

    describe('parseError()', () => {
      it('should create parse error', () => {
        const error = DocumentError.parseError('/doc.json', 'Invalid JSON');

        expect(error.message).toContain('Invalid JSON');
        expect(error.code).toBe(ErrorCode.DOCUMENT_PARSE_ERROR);
        expect(error.documentPath).toBe('/doc.json');
      });
    });
  });

  describe('TranslationError', () => {
    it('should create basic translation error', () => {
      const error = new TranslationError('Translation failed');

      expect(error.name).toBe('TranslationError');
      expect(error.code).toBe(ErrorCode.TRANSLATION_ERROR);
    });

    describe('unknownSymbol()', () => {
      it('should create unknown symbol error', () => {
        const error = TranslationError.unknownSymbol('@custom');

        expect(error.message).toContain('@custom');
        expect(error.code).toBe(ErrorCode.UNKNOWN_SYMBOL);
        expect(error.symbol).toBe('@custom');
      });
    });
  });

  describe('DatabaseError', () => {
    it('should create basic database error', () => {
      const error = new DatabaseError('Query failed');

      expect(error.name).toBe('DatabaseError');
      expect(error.code).toBe(ErrorCode.DATABASE_QUERY_ERROR);
    });

    it('should include operation and table', () => {
      const error = new DatabaseError('Insert failed', {
        operation: 'INSERT',
        table: 'users',
      });

      expect(error.operation).toBe('INSERT');
      expect(error.table).toBe('users');
    });

    describe('notInitialized()', () => {
      it('should create not initialized error', () => {
        const error = DatabaseError.notInitialized('Mission');

        expect(error.message).toContain('Mission');
        expect(error.message).toContain('not initialized');
        expect(error.code).toBe(ErrorCode.DATABASE_NOT_INITIALIZED);
        expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      });
    });
  });

  describe('ToolError', () => {
    it('should create basic tool error', () => {
      const error = new ToolError('Tool execution failed');

      expect(error.name).toBe('ToolError');
      expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_ERROR);
    });

    it('should include tool name', () => {
      const error = new ToolError('Failed', { toolName: 'calculator' });

      expect(error.toolName).toBe('calculator');
    });

    describe('unknownTool()', () => {
      it('should create unknown tool error', () => {
        const error = ToolError.unknownTool('nonexistent');

        expect(error.message).toContain('nonexistent');
        expect(error.code).toBe(ErrorCode.UNKNOWN_TOOL);
        expect(error.toolName).toBe('nonexistent');
        expect(error.statusCode).toBe(404);
      });
    });
  });

  describe('InternalError', () => {
    it('should create default internal error', () => {
      const error = new InternalError();

      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should accept custom message', () => {
      const error = new InternalError('Unexpected state');

      expect(error.message).toBe('Unexpected state');
    });
  });

  describe('NotImplementedError', () => {
    it('should create default not implemented error', () => {
      const error = new NotImplementedError();

      expect(error.message).toBe('Not implemented');
      expect(error.code).toBe(ErrorCode.NOT_IMPLEMENTED);
      expect(error.statusCode).toBe(501);
    });

    it('should include feature name', () => {
      const error = new NotImplementedError('Feature X is not yet implemented', {
        feature: 'Feature X',
      });

      expect(error.feature).toBe('Feature X');
    });

    it('should include feature in JSON', () => {
      const error = new NotImplementedError('Not ready', { feature: 'streaming' });
      const json = error.toJSON();

      expect(json.feature).toBe('streaming');
    });
  });
});

// =============================================================================
// ERROR CHAINING TESTS
// =============================================================================

describe('Error Chaining', () => {
  it('should preserve error chain through multiple wraps', () => {
    const rootCause = new Error('Database connection lost');
    const queryError = new DatabaseError('Query failed', {
      originalError: rootCause,
      operation: 'SELECT',
    });
    const agentError = new AgentError('Agent task failed', {
      originalError: queryError,
      agentId: 'agent-1',
    });

    expect(agentError.originalError).toBe(queryError);
    expect((agentError.originalError as DatabaseError).originalError).toBe(rootCause);
  });

  it('should serialize full error chain', () => {
    const root = new Error('Root cause');
    const wrapped = new ValidationError('Wrapped', { originalError: root });
    const json = wrapped.toJSON(true);

    expect(json.cause).toBeDefined();
    expect(json.cause!.message).toBe('Root cause');
    expect(json.cause!.stack).toBeDefined();
  });
});

// =============================================================================
// JSON SERIALIZATION ROUND-TRIP TESTS
// =============================================================================

describe('JSON Serialization Round-trips', () => {
  it('should serialize and parse ValidationError correctly', () => {
    const error = new ValidationError('Test', {
      details: { field: 'email', value: 'bad' },
    });
    const json = error.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);

    expect(parsed.name).toBe('ValidationError');
    expect(parsed.code).toBe('VALIDATION_ERROR');
    expect(parsed.details.field).toBe('email');
  });

  it('should serialize and parse NotFoundError correctly', () => {
    const error = new NotFoundError('User', 'user-123');
    const json = error.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);

    expect(parsed.resourceType).toBe('User');
    expect(parsed.resourceId).toBe('user-123');
  });

  it('should serialize and parse complex error correctly', () => {
    const error = new RateLimitError('Limited', {
      retryAfter: 60,
      limit: 100,
      window: 'minute',
      details: { userId: 'user-1', endpoint: '/api/data' },
    });
    const json = error.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);

    expect(parsed.retryAfter).toBe(60);
    expect(parsed.limit).toBe(100);
    expect(parsed.window).toBe('minute');
    expect(parsed.details.userId).toBe('user-1');
  });

  it('should handle special characters in messages', () => {
    const error = new ValidationError('Invalid value: "test\nwith\ttabs"');
    const json = error.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);

    expect(parsed.message).toBe('Invalid value: "test\nwith\ttabs"');
  });

  it('should handle Unicode in messages', () => {
    const error = new ValidationError('Invalid symbol: ');
    const json = error.toJSON();
    const serialized = JSON.stringify(json);
    const parsed = JSON.parse(serialized);

    expect(parsed.message).toBe('Invalid symbol: ');
  });
});

// =============================================================================
// HTTP STATUS CODE CONSISTENCY TESTS
// =============================================================================

describe('HTTP Status Code Consistency', () => {
  it('should use correct status codes for 4xx client errors', () => {
    expect(new ValidationError('Test').statusCode).toBe(422);
    expect(new NotFoundError('Test').statusCode).toBe(404);
    expect(new ConflictError('Test').statusCode).toBe(409);
    expect(new AuthenticationError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new RateLimitError().statusCode).toBe(429);
  });

  it('should use correct status codes for 5xx server errors', () => {
    expect(new InternalError().statusCode).toBe(500);
    expect(new NotImplementedError().statusCode).toBe(501);
    expect(new NetworkError('Test').statusCode).toBe(502);
    expect(new CircuitBreakerError().statusCode).toBe(503);
    expect(new TimeoutError().statusCode).toBe(504);
  });

  it('should allow status code override', () => {
    const error = new ValidationError('Test', { statusCode: 400 });
    expect(error.statusCode).toBe(400);
  });
});
