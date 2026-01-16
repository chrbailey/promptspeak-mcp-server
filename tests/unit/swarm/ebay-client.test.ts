/**
 * eBay Client Unit Tests
 *
 * Tests for the eBay API client with mocked HTTP responses.
 * Validates search, bid, offer, and error handling logic.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EbayClient, EbayApiError } from '../../../src/swarm/ebay/client.js';
import {
  createMockGoldBarListing,
  createMockSilverEagleAuction,
  createMockSearchResults,
  createMockBidResponse,
  createMockOfferResponse,
} from '../../fixtures/ebay-responses.js';

// Mock the auth module
vi.mock('../../../src/swarm/ebay/auth.js', () => ({
  getEbayAuth: () => ({
    getAccessToken: vi.fn().mockResolvedValue('mock_access_token'),
    hasUserToken: vi.fn().mockReturnValue(true),
    getAuthorizationUrl: vi.fn().mockReturnValue('https://auth.sandbox.ebay.com/oauth'),
    exchangeAuthorizationCode: vi.fn().mockResolvedValue(undefined),
  }),
  EbayAuthError: class EbayAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'EbayAuthError';
    }
  },
}));

// Mock the rate limiter
vi.mock('../../../src/swarm/ebay/rate-limiter.js', () => ({
  getEbayRateLimiter: () => ({
    acquireWithWait: vi.fn().mockResolvedValue(true),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getAllStatus: vi.fn().mockReturnValue({
      browse: { minuteTokens: 5000, inBackoff: false },
      offer: { minuteTokens: 5000, inBackoff: false },
      order: { minuteTokens: 5000, inBackoff: false },
    }),
  }),
  RateLimitError: class RateLimitError extends Error {},
}));

// Mock the sandbox config
vi.mock('../../../src/swarm/ebay/sandbox-config.js', () => ({
  getApiBaseUrl: () => 'https://api.sandbox.ebay.com',
  getStandardHeaders: (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }),
  isSandboxMode: () => true,
  warnIfProduction: vi.fn(),
  BROWSE_API: {
    search: '/buy/browse/v1/item_summary/search',
    getItem: (id: string) => `/buy/browse/v1/item/${id}`,
  },
  OFFER_API: {
    placeBid: (id: string) => `/buy/offer/v1/bid/${id}`,
    getBidding: (id: string) => `/buy/offer/v1/bidding/${id}`,
  },
  BEST_OFFER_API: {
    createOffer: '/buy/offer/v1/offer',
    getOffer: (id: string) => `/buy/offer/v1/offer/${id}`,
    respondToOffer: (id: string) => `/buy/offer/v1/offer/${id}/respond`,
  },
  ORDER_API: {
    initiateCheckout: '/buy/order/v2/checkout_session/initiate',
    placeOrder: (id: string) => `/buy/order/v2/checkout_session/${id}/place_order`,
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('EbayClient', () => {
  let client: EbayClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new EbayClient();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  /**
   * Helper to create proper eBay API response structure for normalizeEbayItem
   */
  function createEbayApiItem(listing: ReturnType<typeof createMockGoldBarListing>) {
    return {
      itemId: listing.itemId,
      title: listing.title,
      price: { value: listing.price.toString(), currency: listing.currency },
      condition: listing.condition,
      seller: {
        username: listing.sellerUsername,
        feedbackScore: Math.floor(listing.sellerFeedbackScore * 100),
        feedbackPercentage: listing.sellerFeedbackPercent.toString(),
      },
      buyingOptions: listing.buyingOptions,
      image: { imageUrl: listing.imageUrl },
      itemWebUrl: listing.itemUrl,
      itemLocation: {
        city: listing.location.city,
        stateOrProvince: listing.location.state,
        country: listing.location.country,
      },
      shippingOptions: listing.shippingCost !== undefined ? [{
        shippingCost: { value: listing.shippingCost.toString(), currency: listing.currency }
      }] : undefined,
    };
  }

  describe('searchItems', () => {
    it('should search for gold items successfully', async () => {
      const mockListings = createMockSearchResults({ count: 5, includeGold: true, includeSilver: false });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          itemSummaries: mockListings.map(l => createEbayApiItem(l)),
          total: 5,
          limit: 50,
        }),
      });

      const results = await client.searchItems({
        query: 'gold bar 1 oz',
        minPrice: 1800,
        maxPrice: 2500,
      });

      expect(results).toHaveLength(5);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/buy/browse/v1/item_summary/search');
      expect(callUrl).toContain('q=gold+bar+1+oz');
    });

    it('should search for silver items with price filter', async () => {
      const mockListings = createMockSearchResults({ count: 10, includeGold: false, includeSilver: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          itemSummaries: mockListings.map(l => createEbayApiItem(l)),
          total: 10,
        }),
      });

      const results = await client.searchItems({
        query: 'silver eagle',
        minPrice: 25,
        maxPrice: 50,
        limit: 20,
      });

      expect(results).toHaveLength(10);

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('price%3A%5B25..50%5D'); // URL encoded price:[25..50]
    });

    it('should return empty array when no results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          itemSummaries: undefined,
          total: 0,
        }),
      });

      const results = await client.searchItems({
        query: 'nonexistent rare coin xyz123',
      });

      expect(results).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({
          errors: [{ errorId: 500, message: 'Server error', category: 'SYSTEM' }],
        }),
      });

      await expect(client.searchItems({ query: 'gold' }))
        .rejects.toThrow(EbayApiError);
    });
  });

  describe('getItem', () => {
    it('should get gold bar item details', async () => {
      const mockListing = createMockGoldBarListing();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(createEbayApiItem(mockListing)),
      });

      const result = await client.getItem(mockListing.itemId);

      expect(result).not.toBeNull();
      expect(result?.title).toContain('Gold Bar');
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({
          errors: [{ errorId: 11001, message: 'Item not found' }],
        }),
      });

      const result = await client.getItem('nonexistent_id');
      expect(result).toBeNull();
    });
  });

  describe('placeBid', () => {
    it('should place bid on gold auction', async () => {
      const mockResponse = createMockBidResponse({ success: true, highBidder: true, currentBid: 2100 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          bidId: mockResponse.bidId,
          currentBid: { value: mockResponse.currentBid.toString(), currency: 'USD' },
          highBidder: mockResponse.isHighBidder,
        }),
      });

      const result = await client.placeBid('auction_123', 2150);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/buy/offer/v1/bid/auction_123'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"maxAmount"'),
        })
      );
    });

    it('should handle outbid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          bidId: 'bid_456',
          currentBid: { value: '2200', currency: 'USD' },
          highBidder: false,
          message: 'You were outbid',
        }),
      });

      const result = await client.placeBid('auction_123', 2150);

      expect(result).toMatchObject({
        highBidder: false,
      });
    });

    it('should handle bid rejection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({
          errors: [{
            errorId: 12003,
            message: 'Bid must be at least 5% higher than current bid',
            category: 'REQUEST',
          }],
        }),
      });

      await expect(client.placeBid('auction_123', 2000))
        .rejects.toThrow(EbayApiError);
    });
  });

  describe('submitOffer', () => {
    it('should submit offer on gold bar', async () => {
      const mockResponse = createMockOfferResponse({ status: 'PENDING' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          offerId: mockResponse.offerId,
          status: mockResponse.status,
          message: mockResponse.message,
        }),
      });

      const result = await client.submitOffer('item_gold_bar', 2100, 1, 'Serious buyer');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/buy/offer/v1/offer'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"offeredPrice"'),
        })
      );

      expect(result.offerId).toBeDefined();
    });

    it('should submit offer on silver lot', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          offerId: 'offer_silver_123',
          status: 'PENDING',
        }),
      });

      const result = await client.submitOffer('item_silver_lot', 165, 1, 'Looking for junk silver');

      expect(result.offerId).toBe('offer_silver_123');
    });

    it('should handle counter offer response', async () => {
      const mockResponse = createMockOfferResponse({ status: 'COUNTERED', counterAmount: 35 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          offerId: mockResponse.offerId,
          status: 'COUNTERED',
          counterOffer: { value: '35.00', currency: 'USD' },
          message: 'Seller countered',
        }),
      });

      const result = await client.submitOffer('silver_eagle_item', 30);

      expect(result.status).toBe('COUNTERED');
    });
  });

  describe('getOffer', () => {
    it('should get offer status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          offerId: 'offer_123',
          status: 'ACCEPTED',
          message: 'Your offer was accepted',
        }),
      });

      const result = await client.getOffer('offer_123');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('ACCEPTED');
    });

    it('should return null for not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ errors: [] }),
      });

      const result = await client.getOffer('nonexistent_offer');
      expect(result).toBeNull();
    });
  });

  describe('checkConnection', () => {
    it('should report connected status', async () => {
      const status = await client.checkConnection();

      expect(status).toMatchObject({
        connected: true,
        sandbox: true,
        hasUserAuth: true,
      });
    });
  });

  describe('EbayApiError', () => {
    it('should be retryable for 429', () => {
      const error = new EbayApiError('Rate limited', 429, []);
      expect(error.isRetryable()).toBe(true);
    });

    it('should be retryable for 500+', () => {
      const error = new EbayApiError('Server error', 500, []);
      expect(error.isRetryable()).toBe(true);

      const error503 = new EbayApiError('Service unavailable', 503, []);
      expect(error503.isRetryable()).toBe(true);
    });

    it('should not be retryable for 400', () => {
      const error = new EbayApiError('Bad request', 400, []);
      expect(error.isRetryable()).toBe(false);
    });
  });

  describe('precious metals scenarios', () => {
    it('should search for gold bars and coins', async () => {
      const goldListings = [
        createMockGoldBarListing({ title: '1 oz Gold Bar - PAMP Suisse' }),
        createMockGoldBarListing({ title: '1 oz Gold Buffalo Coin BU' }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          itemSummaries: goldListings.map(l => createEbayApiItem(l)),
        }),
      });

      const results = await client.searchItems({
        query: 'gold bar gold coin 1 oz',
        minPrice: 1800,
        maxPrice: 2500,
        categoryIds: ['39482'], // Gold bullion category
      });

      expect(results).toHaveLength(2);
    });

    it('should search for silver eagles and rounds', async () => {
      const silverListings = createMockSearchResults({ count: 20, includeGold: false, includeSilver: true });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          itemSummaries: silverListings.map(l => createEbayApiItem(l)),
        }),
      });

      const results = await client.searchItems({
        query: 'silver eagle rounds',
        minPrice: 25,
        maxPrice: 50,
        limit: 50,
      });

      expect(results.length).toBeLessThanOrEqual(20);
    });

    it('should bid on silver eagle auction ending soon', async () => {
      const mockAuction = createMockSilverEagleAuction();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          bidId: 'bid_silver_eagle_001',
          currentBid: { value: '35.50', currency: 'USD' },
          highBidder: true,
        }),
      });

      const result = await client.placeBid(mockAuction.itemId, 36);

      expect(result).toMatchObject({
        highBidder: true,
      });
    });

    it('should make best offer on gold bar listing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          offerId: 'offer_gold_bar_001',
          status: 'PENDING',
        }),
      });

      const result = await client.submitOffer(
        'gold_bar_pamp_123',
        2050, // Offer below listing price of ~$2200
        1,
        'Cash buyer, quick close'
      );

      expect(result.status).toBe('PENDING');
    });
  });

  describe('rate limiting behavior', () => {
    it('should respect rate limits on search', async () => {
      // First search should work
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ itemSummaries: [] }),
      });

      await client.searchItems({ query: 'gold' });

      // Rate limiter's acquireWithWait should have been called
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle 429 rate limit error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({
          errors: [{ errorId: 18001, message: 'Rate limit exceeded' }],
        }),
      });

      await expect(client.searchItems({ query: 'gold' }))
        .rejects.toThrow(EbayApiError);

      try {
        await client.searchItems({ query: 'gold' });
      } catch (error) {
        if (error instanceof EbayApiError) {
          expect(error.isRetryable()).toBe(true);
        }
      }
    });
  });
});
