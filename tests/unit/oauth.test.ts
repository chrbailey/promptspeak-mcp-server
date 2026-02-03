/**
 * OAuth Token Validation Tests (P1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OAuthTokenValidator,
  generateLocalToken,
  getOAuthValidator,
  initializeOAuthValidator,
  resetOAuthValidator,
  type OAuthConfig,
} from '../../src/auth/oauth.js';

const TEST_SECRET = 'test-secret-key-at-least-32-characters-long-for-testing';

const createTestConfig = (overrides: Partial<OAuthConfig> = {}): OAuthConfig => ({
  enabled: true,
  issuer: 'test-issuer',
  audience: 'test-api',
  jwtSecret: TEST_SECRET,
  jwtExpiry: '1h',
  useExternalProvider: false,
  ...overrides,
});

describe('OAuthTokenValidator', () => {
  beforeEach(() => {
    resetOAuthValidator();
  });

  describe('Local JWT Validation', () => {
    it('should validate a locally generated token', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const token = generateLocalToken('user123', {}, config);
      const result = await validator.validate(token);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('user123');
      }
    });

    it('should include scopes in validated token', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const token = generateLocalToken(
        'user123',
        { scopes: ['read', 'write', 'admin'] },
        config
      );

      const result = await validator.validate(token);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scopes).toContain('read');
        expect(result.data.scopes).toContain('write');
        expect(result.data.scopes).toContain('admin');
      }
    });

    it('should include tenant ID when provided', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const token = generateLocalToken(
        'user123',
        { tenantId: 'tenant-abc' },
        config
      );

      const result = await validator.validate(token);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tenantId).toBe('tenant-abc');
      }
    });

    it('should reject tokens with wrong secret', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const wrongConfig = createTestConfig({ jwtSecret: 'different-secret-key-for-testing-purposes' });
      const token = generateLocalToken('user123', {}, wrongConfig);

      const result = await validator.validate(token);
      expect(result.success).toBe(false);
    });

    it('should reject malformed tokens', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const result = await validator.validate('not-a-valid-token');
      expect(result.success).toBe(false);
    });

    it('should reject empty tokens', async () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      const result = await validator.validate('');
      expect(result.success).toBe(false);
    });
  });

  describe('OAuth Disabled', () => {
    it('should reject all tokens when disabled', async () => {
      const config = createTestConfig({ enabled: false });
      const validator = new OAuthTokenValidator(config);

      const token = generateLocalToken('user123', {}, config);
      const result = await validator.validate(token);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('OAUTH_DISABLED');
      }
    });
  });

  describe('Token Generation', () => {
    it('should generate valid JWT tokens', () => {
      const config = createTestConfig();
      const token = generateLocalToken('user123', {}, config);

      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3); // JWT has 3 parts
    });

    it('should include custom expiry', () => {
      const config = createTestConfig();
      const token = generateLocalToken(
        'user123',
        { expiresIn: '7d' },
        config
      );

      expect(token).toBeDefined();
    });
  });

  describe('Singleton Management', () => {
    it('should return same instance after initialization', () => {
      const config = createTestConfig();
      initializeOAuthValidator(config);

      const v1 = getOAuthValidator();
      const v2 = getOAuthValidator();
      expect(v1).toBe(v2);
    });

    it('should reset singleton correctly', () => {
      const config = createTestConfig();
      initializeOAuthValidator(config);
      const v1 = getOAuthValidator();

      resetOAuthValidator();

      initializeOAuthValidator(createTestConfig({ issuer: 'different-issuer' }));
      const v2 = getOAuthValidator();

      expect(v1).not.toBe(v2);
    });

    it('should throw when getting validator before init', () => {
      resetOAuthValidator();
      expect(() => getOAuthValidator()).toThrow();
    });
  });

  describe('JWKS Cache', () => {
    it('should have clearJwksCache method', () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      expect(typeof validator.clearJwksCache).toBe('function');
    });

    it('should not throw when clearing empty cache', () => {
      const config = createTestConfig();
      const validator = new OAuthTokenValidator(config);

      expect(() => validator.clearJwksCache()).not.toThrow();
    });
  });
});
