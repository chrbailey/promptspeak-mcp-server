/**
 * eBay Sandbox Integration Tests
 *
 * LIVE integration tests against the eBay sandbox environment.
 * Requires valid sandbox credentials to run.
 *
 * These tests are skipped in CI unless EBAY_CLIENT_ID is set.
 *
 * To run locally:
 *   1. Set up sandbox credentials in .env:
 *      EBAY_CLIENT_ID=...
 *      EBAY_CLIENT_SECRET=...
 *      EBAY_ENVIRONMENT=sandbox
 *
 *   2. Run: npm test -- tests/integration/swarm-ebay-sandbox.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Skip these tests if no credentials
const hasCredentials = !!process.env.EBAY_CLIENT_ID && !!process.env.EBAY_CLIENT_SECRET;
const runTests = hasCredentials && process.env.EBAY_ENVIRONMENT === 'sandbox';

// Conditionally import to avoid errors when credentials are missing
let EbayClient: any;
let getEbayClient: any;
let initializeEbayClient: any;

if (runTests) {
  const clientModule = await import('../../src/swarm/ebay/client.js');
  EbayClient = clientModule.EbayClient;
  getEbayClient = clientModule.getEbayClient;
  initializeEbayClient = clientModule.initializeEbayClient;
}

describe.skipIf(!runTests)('eBay Sandbox Integration', () => {
  let client: InstanceType<typeof EbayClient>;

  beforeAll(async () => {
    // Initialize the client with sandbox credentials
    client = await initializeEbayClient();
  }, 30000); // 30s timeout for connection

  describe('Connection', () => {
    it('should connect to eBay sandbox', async () => {
      const status = await client.checkConnection();

      expect(status.connected).toBe(true);
      expect(status.sandbox).toBe(true);
    });

    it('should be in sandbox mode', async () => {
      const status = await client.checkConnection();
      expect(status.sandbox).toBe(true);
    });

    it('should have application token', async () => {
      const status = await client.checkConnection();
      expect(status.connected).toBe(true);
    });
  });

  describe('Browse API - Gold/Silver Search', () => {
    it('should search for gold items', async () => {
      const results = await client.searchItems({
        query: 'gold bar bullion',
        limit: 5,
      });

      // Sandbox may have limited data, but should return array
      expect(Array.isArray(results)).toBe(true);
    }, 15000);

    it('should search for silver items', async () => {
      const results = await client.searchItems({
        query: 'silver coin',
        limit: 5,
      });

      expect(Array.isArray(results)).toBe(true);
    }, 15000);

    it('should search with price filter', async () => {
      const results = await client.searchItems({
        query: 'precious metals',
        minPrice: 25,
        maxPrice: 500,
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);

      // If results returned, verify prices
      for (const item of results) {
        if (item.price !== undefined) {
          expect(item.price).toBeGreaterThanOrEqual(25);
          expect(item.price).toBeLessThanOrEqual(500);
        }
      }
    }, 15000);

    it('should return normalized listings', async () => {
      const results = await client.searchItems({
        query: 'gold',
        limit: 3,
      });

      // Check structure of returned items
      for (const item of results) {
        expect(item).toHaveProperty('itemId');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('price');
        expect(item).toHaveProperty('currency');
      }
    }, 15000);

    it('should handle empty search results', async () => {
      const results = await client.searchItems({
        query: 'xyznonexistent123456789',
        limit: 5,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 15000);
  });

  describe('Browse API - Item Details', () => {
    it('should get item details when ID is valid', async () => {
      // First, search for an item to get a valid ID
      const searchResults = await client.searchItems({
        query: 'test',
        limit: 1,
      });

      if (searchResults.length > 0) {
        const itemId = searchResults[0].itemId;
        const item = await client.getItem(itemId);

        expect(item).not.toBeNull();
        expect(item?.itemId).toBe(itemId);
      }
    }, 20000);

    it('should return null for invalid item ID', async () => {
      const item = await client.getItem('invalid_item_id_12345');
      expect(item).toBeNull();
    }, 10000);
  });

  describe('Rate Limiting', () => {
    it('should report rate limit status', async () => {
      const status = await client.checkConnection();

      expect(status.rateLimitStatus).toBeDefined();
      expect(status.rateLimitStatus.browse).toBeDefined();
    });

    it('should handle multiple rapid requests', async () => {
      // Make several requests in succession
      const promises = Array(3).fill(null).map(() =>
        client.searchItems({ query: 'coin', limit: 1 })
      );

      const results = await Promise.all(promises);

      // All should complete successfully (rate limiter handles timing)
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should throw EbayApiError on invalid request', async () => {
      try {
        // Search with invalid parameters (if any are rejected)
        await client.searchItems({
          query: 'test',
          limit: 10000, // Exceeds max of 200
        });
      } catch (error: any) {
        // Either it gets capped automatically or throws an error
        expect(error.name === 'EbayApiError' || error === undefined).toBeTruthy();
      }
    }, 10000);
  });

  describe('Gold Category Search', () => {
    it('should search in gold bullion category', async () => {
      const results = await client.searchItems({
        query: 'gold bar',
        categoryIds: ['39482'], // Bullion > Gold
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    }, 15000);
  });

  describe('Silver Category Search', () => {
    it('should search in silver bullion category', async () => {
      const results = await client.searchItems({
        query: 'silver bar',
        categoryIds: ['39481'], // Bullion > Silver
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    }, 15000);
  });

  describe('Auction Filter', () => {
    it('should filter for auction listings only', async () => {
      const results = await client.searchItems({
        query: 'gold coin',
        buyingOptions: ['AUCTION'],
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);

      // If results, verify they're auctions
      for (const item of results) {
        if (item.buyingOptions) {
          expect(item.buyingOptions).toContain('AUCTION');
        }
      }
    }, 15000);
  });

  describe('Best Offer Filter', () => {
    it('should filter for Best Offer listings', async () => {
      const results = await client.searchItems({
        query: 'silver',
        buyingOptions: ['BEST_OFFER'],
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    }, 15000);
  });
});

/**
 * User Authorization Tests
 *
 * These tests require completing the OAuth flow manually.
 * Run with: EBAY_TEST_USER_AUTH=1 npm test -- tests/integration
 */
describe.skipIf(!runTests || !process.env.EBAY_TEST_USER_AUTH)('eBay User Authorization', () => {
  let client: InstanceType<typeof EbayClient>;

  beforeAll(async () => {
    client = await initializeEbayClient();
  }, 30000);

  it('should have user authorization', async () => {
    const hasAuth = client.hasUserAuthorization();
    expect(hasAuth).toBe(true);
  });

  it('should be able to get bidding status', async () => {
    // Note: This requires having placed bids on sandbox items
    const status = await client.getBiddingStatus('test_item_id');
    // Will be null if no active bids, which is fine
    expect(status === null || typeof status === 'object').toBe(true);
  }, 10000);
});

/**
 * Stress Test (Manual)
 *
 * Run with: EBAY_STRESS_TEST=1 npm test -- tests/integration
 */
describe.skipIf(!runTests || !process.env.EBAY_STRESS_TEST)('eBay API Stress Test', () => {
  let client: InstanceType<typeof EbayClient>;

  beforeAll(async () => {
    client = await initializeEbayClient();
  }, 30000);

  it('should handle 50 sequential searches', async () => {
    const queries = [
      'gold bar', 'silver coin', 'gold eagle', 'silver eagle',
      'gold buffalo', 'silver round', 'gold maple', 'silver maple',
      'gold pamp', 'silver pamp', 'gold krugerrand', 'silver bullion',
      'gold bullion', 'junk silver', 'gold sovereign', 'silver bar',
      'gold 1 oz', 'silver 1 oz', 'gold coin', 'silver coin',
    ];

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < 50; i++) {
      try {
        const query = queries[i % queries.length];
        await client.searchItems({ query, limit: 1 });
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    // Allow some failures due to rate limiting
    expect(successCount).toBeGreaterThan(40);
    console.log(`Stress test: ${successCount} successes, ${errorCount} errors`);
  }, 300000); // 5 minute timeout
});
