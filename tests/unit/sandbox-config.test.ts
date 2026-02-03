/**
 * eBay Sandbox/Production Config Tests (P2)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSandboxMode,
  getApiBaseUrl,
  getAuthBaseUrl,
  getTokenUrl,
  EBAY_API_URLS,
  BROWSE_API,
  OFFER_API,
  BEST_OFFER_API,
  ORDER_API,
  OAUTH_ENDPOINTS,
  RATE_LIMITS,
} from '../../src/swarm/ebay/sandbox-config.js';

describe('eBay Sandbox Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear eBay-related env vars
    delete process.env.EBAY_SANDBOX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isSandboxMode', () => {
    it('should return true by default (sandbox is safe default)', () => {
      delete process.env.EBAY_SANDBOX;
      expect(isSandboxMode()).toBe(true);
    });

    it('should return false when EBAY_SANDBOX is false', () => {
      process.env.EBAY_SANDBOX = 'false';
      expect(isSandboxMode()).toBe(false);
    });

    it('should return true when EBAY_SANDBOX is true', () => {
      process.env.EBAY_SANDBOX = 'true';
      expect(isSandboxMode()).toBe(true);
    });

    it('should be case insensitive for false', () => {
      process.env.EBAY_SANDBOX = 'FALSE';
      expect(isSandboxMode()).toBe(false);
    });

    it('should return true for any non-false value', () => {
      process.env.EBAY_SANDBOX = 'yes';
      expect(isSandboxMode()).toBe(true);
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return sandbox URL in sandbox mode', () => {
      delete process.env.EBAY_SANDBOX;
      expect(getApiBaseUrl()).toBe(EBAY_API_URLS.sandbox.api);
    });

    it('should return production URL when not sandbox', () => {
      process.env.EBAY_SANDBOX = 'false';
      expect(getApiBaseUrl()).toBe(EBAY_API_URLS.production.api);
    });
  });

  describe('getAuthBaseUrl', () => {
    it('should return sandbox auth URL in sandbox mode', () => {
      delete process.env.EBAY_SANDBOX;
      expect(getAuthBaseUrl()).toBe(EBAY_API_URLS.sandbox.auth);
    });

    it('should return production auth URL when not sandbox', () => {
      process.env.EBAY_SANDBOX = 'false';
      expect(getAuthBaseUrl()).toBe(EBAY_API_URLS.production.auth);
    });
  });

  describe('getTokenUrl', () => {
    it('should return full token URL for sandbox', () => {
      delete process.env.EBAY_SANDBOX;
      expect(getTokenUrl()).toContain('sandbox');
      expect(getTokenUrl()).toContain(OAUTH_ENDPOINTS.token);
    });

    it('should return production token URL when not sandbox', () => {
      process.env.EBAY_SANDBOX = 'false';
      expect(getTokenUrl()).not.toContain('sandbox');
      expect(getTokenUrl()).toContain(OAUTH_ENDPOINTS.token);
    });
  });

  describe('URL Constants', () => {
    it('should have correct sandbox URLs', () => {
      expect(EBAY_API_URLS.sandbox.api).toContain('sandbox');
      expect(EBAY_API_URLS.sandbox.auth).toContain('sandbox');
      expect(EBAY_API_URLS.sandbox.signin).toContain('sandbox');
    });

    it('should have correct production URLs', () => {
      expect(EBAY_API_URLS.production.api).not.toContain('sandbox');
      expect(EBAY_API_URLS.production.auth).not.toContain('sandbox');
      expect(EBAY_API_URLS.production.signin).not.toContain('sandbox');
    });
  });

  describe('API Endpoints', () => {
    it('should have browse API endpoints', () => {
      expect(BROWSE_API.search).toBeDefined();
      expect(BROWSE_API.getItem).toBeDefined();
      expect(typeof BROWSE_API.getItem).toBe('function');
    });

    it('should construct item URL correctly', () => {
      const url = BROWSE_API.getItem('12345');
      expect(url).toContain('12345');
      expect(url).toContain('/item/');
    });

    it('should have offer API endpoints', () => {
      expect(OFFER_API.placeBid).toBeDefined();
      expect(OFFER_API.getBidding).toBeDefined();
    });

    it('should have best offer API endpoints', () => {
      expect(BEST_OFFER_API.createOffer).toBeDefined();
      expect(BEST_OFFER_API.getOffer).toBeDefined();
    });

    it('should have order API endpoints', () => {
      expect(ORDER_API.initiateCheckout).toBeDefined();
      expect(ORDER_API.placeOrder).toBeDefined();
    });
  });

  describe('Rate Limits', () => {
    it('should have sandbox rate limits', () => {
      expect(RATE_LIMITS.sandbox).toBeDefined();
      expect(RATE_LIMITS.sandbox.browse).toBeDefined();
      expect(RATE_LIMITS.sandbox.browse.perDay).toBeGreaterThan(0);
    });

    it('should have production rate limits', () => {
      expect(RATE_LIMITS.production).toBeDefined();
      expect(RATE_LIMITS.production.browse).toBeDefined();
    });

    it('should have lower sandbox limits than production', () => {
      expect(RATE_LIMITS.sandbox.browse.perDay).toBeLessThanOrEqual(
        RATE_LIMITS.production.browse.perDay
      );
    });
  });

  describe('OAuth Endpoints', () => {
    it('should have authorization endpoint', () => {
      expect(OAUTH_ENDPOINTS.authorize).toBeDefined();
      expect(OAUTH_ENDPOINTS.authorize).toContain('authorize');
    });

    it('should have token endpoint', () => {
      expect(OAUTH_ENDPOINTS.token).toBeDefined();
      expect(OAUTH_ENDPOINTS.token).toContain('token');
    });
  });
});
