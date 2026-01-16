/**
 * eBay API Client
 *
 * Unified client for interacting with eBay Browse, Buy, and Offer APIs.
 * Handles authentication, rate limiting, and error handling.
 */

import { getEbayAuth, EbayAuthError } from './auth.js';
import { getEbayRateLimiter, EbayRateLimitError, type RateLimitAllStatus } from './rate-limiter.js';
import {
  getApiBaseUrl,
  getStandardHeaders,
  isSandboxMode,
  warnIfProduction,
  BROWSE_API,
  OFFER_API,
  BEST_OFFER_API,
  ORDER_API,
} from './sandbox-config.js';
import {
  normalizeEbayItem,
  type EbaySearchResponse,
  type EbayItemDetail,
  type EbayItemSummary,
  type EbayPlaceBidRequest,
  type EbayPlaceBidResponse,
  type EbayCreateOfferRequest,
  type EbayOfferResponse,
  type EbayInitiateCheckoutRequest,
  type EbayCheckoutSessionResponse,
  type EbayPlaceOrderResponse,
  type EbayErrorResponse,
  type EbayError,
  type SearchQuery,
  type NormalizedListing,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay API error.
 */
export class EbayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors: EbayError[],
    public readonly warnings?: EbayError[]
  ) {
    super(message);
    this.name = 'EbayApiError';
  }

  /**
   * Check if error is retryable.
   */
  isRetryable(): boolean {
    return this.statusCode === 429 || this.statusCode >= 500;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EBAY CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay API client for market agent operations.
 */
export class EbayClient {
  private baseUrl: string;
  private auth = getEbayAuth();
  private rateLimiter = getEbayRateLimiter();

  constructor() {
    this.baseUrl = getApiBaseUrl();
    warnIfProduction();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BROWSE API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Search for items using the Browse API.
   */
  async searchItems(query: SearchQuery): Promise<NormalizedListing[]> {
    await this.rateLimiter.acquireWithWait('browse');

    try {
      const params = this.buildSearchParams(query);
      const url = `${this.baseUrl}${BROWSE_API.search}?${params.toString()}`;

      const response = await this.makeRequest<EbaySearchResponse>('GET', url);

      this.rateLimiter.recordSuccess('browse');

      if (!response.itemSummaries) {
        return [];
      }

      return response.itemSummaries.map(item => normalizeEbayItem(item));
    } catch (error) {
      this.rateLimiter.recordFailure('browse', (error as any)?.statusCode);
      throw error;
    }
  }

  /**
   * Get detailed item information.
   */
  async getItem(itemId: string): Promise<NormalizedListing | null> {
    await this.rateLimiter.acquireWithWait('browse');

    try {
      const url = `${this.baseUrl}${BROWSE_API.getItem(itemId)}`;
      const response = await this.makeRequest<EbayItemDetail>('GET', url);

      this.rateLimiter.recordSuccess('browse');

      return normalizeEbayItem(response);
    } catch (error: any) {
      this.rateLimiter.recordFailure('browse', error?.statusCode);

      // Return null for not found
      if (error?.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Search with raw eBay response (for debugging).
   */
  async searchItemsRaw(query: SearchQuery): Promise<EbaySearchResponse> {
    await this.rateLimiter.acquireWithWait('browse');

    const params = this.buildSearchParams(query);
    const url = `${this.baseUrl}${BROWSE_API.search}?${params.toString()}`;

    const response = await this.makeRequest<EbaySearchResponse>('GET', url);
    this.rateLimiter.recordSuccess('browse');

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUY OFFER API (Auctions)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Place a bid on an auction item.
   * Requires user authorization.
   */
  async placeBid(
    itemId: string,
    maxAmount: number,
    currency: string = 'USD'
  ): Promise<EbayPlaceBidResponse> {
    if (!this.auth.hasUserToken()) {
      throw new EbayAuthError('User authorization required for placing bids');
    }

    await this.rateLimiter.acquireWithWait('offer');

    try {
      const url = `${this.baseUrl}${OFFER_API.placeBid(itemId)}`;

      const request: EbayPlaceBidRequest = {
        maxAmount: {
          value: maxAmount.toFixed(2),
          currency,
        },
        userConsent: {
          adultOnlyItem: false,
        },
      };

      const response = await this.makeRequest<EbayPlaceBidResponse>('POST', url, request);

      this.rateLimiter.recordSuccess('offer');

      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('offer', error?.statusCode);
      throw error;
    }
  }

  /**
   * Get current bidding status for an item.
   */
  async getBiddingStatus(itemId: string): Promise<EbayPlaceBidResponse | null> {
    if (!this.auth.hasUserToken()) {
      return null;
    }

    await this.rateLimiter.acquireWithWait('offer');

    try {
      const url = `${this.baseUrl}${OFFER_API.getBidding(itemId)}`;
      const response = await this.makeRequest<EbayPlaceBidResponse>('GET', url);

      this.rateLimiter.recordSuccess('offer');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('offer', error?.statusCode);

      if (error?.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BEST OFFER API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Submit a best offer on an item.
   * Requires user authorization.
   */
  async submitOffer(
    itemId: string,
    offerAmount: number,
    quantity: number = 1,
    message?: string,
    currency: string = 'USD'
  ): Promise<EbayOfferResponse> {
    if (!this.auth.hasUserToken()) {
      throw new EbayAuthError('User authorization required for making offers');
    }

    await this.rateLimiter.acquireWithWait('offer');

    try {
      const url = `${this.baseUrl}${BEST_OFFER_API.createOffer}`;

      const request: EbayCreateOfferRequest & { itemId: string } = {
        itemId,
        offeredPrice: {
          value: offerAmount.toFixed(2),
          currency,
        },
        quantity,
        message,
      };

      const response = await this.makeRequest<EbayOfferResponse>('POST', url, request);

      this.rateLimiter.recordSuccess('offer');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('offer', error?.statusCode);
      throw error;
    }
  }

  /**
   * Get offer status.
   */
  async getOffer(offerId: string): Promise<EbayOfferResponse | null> {
    await this.rateLimiter.acquireWithWait('offer');

    try {
      const url = `${this.baseUrl}${BEST_OFFER_API.getOffer(offerId)}`;
      const response = await this.makeRequest<EbayOfferResponse>('GET', url);

      this.rateLimiter.recordSuccess('offer');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('offer', error?.statusCode);

      if (error?.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Accept or decline a counter offer.
   */
  async respondToCounterOffer(
    offerId: string,
    accept: boolean,
    counterAmount?: number,
    message?: string,
    currency: string = 'USD'
  ): Promise<EbayOfferResponse> {
    if (!this.auth.hasUserToken()) {
      throw new EbayAuthError('User authorization required');
    }

    await this.rateLimiter.acquireWithWait('offer');

    try {
      const url = `${this.baseUrl}${BEST_OFFER_API.respondToOffer(offerId)}`;

      const request: any = {
        acceptCounterOffer: accept,
      };

      if (!accept && counterAmount) {
        request.counterOfferAmount = {
          value: counterAmount.toFixed(2),
          currency,
        };
      }

      if (message) {
        request.message = message;
      }

      const response = await this.makeRequest<EbayOfferResponse>('POST', url, request);

      this.rateLimiter.recordSuccess('offer');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('offer', error?.statusCode);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BUY ORDER API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initiate checkout for an item.
   * This is typically used after winning an auction or accepting an offer.
   */
  async initiateCheckout(
    request: EbayInitiateCheckoutRequest
  ): Promise<EbayCheckoutSessionResponse> {
    if (!this.auth.hasUserToken()) {
      throw new EbayAuthError('User authorization required for checkout');
    }

    await this.rateLimiter.acquireWithWait('order');

    try {
      const url = `${this.baseUrl}${ORDER_API.initiateCheckout}`;
      const response = await this.makeRequest<EbayCheckoutSessionResponse>('POST', url, request);

      this.rateLimiter.recordSuccess('order');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('order', error?.statusCode);
      throw error;
    }
  }

  /**
   * Place an order from a checkout session.
   */
  async placeOrder(checkoutSessionId: string): Promise<EbayPlaceOrderResponse> {
    if (!this.auth.hasUserToken()) {
      throw new EbayAuthError('User authorization required for placing orders');
    }

    await this.rateLimiter.acquireWithWait('order');

    try {
      const url = `${this.baseUrl}${ORDER_API.placeOrder(checkoutSessionId)}`;
      const response = await this.makeRequest<EbayPlaceOrderResponse>('POST', url, {});

      this.rateLimiter.recordSuccess('order');
      return response;
    } catch (error: any) {
      this.rateLimiter.recordFailure('order', error?.statusCode);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build search query parameters.
   */
  private buildSearchParams(query: SearchQuery): URLSearchParams {
    const params = new URLSearchParams();

    // Required: search query
    params.set('q', query.query);

    // Categories
    if (query.categoryIds?.length) {
      params.set('category_ids', query.categoryIds.join(','));
    }

    // Build filter string
    const filters: string[] = [];

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice ?? 0;
      const max = query.maxPrice ?? 999999;
      filters.push(`price:[${min}..${max}]`);
    }

    if (query.conditions?.length) {
      filters.push(`conditionIds:{${query.conditions.join('|')}}`);
    }

    if (query.buyingOptions?.length) {
      filters.push(`buyingOptions:{${query.buyingOptions.join('|')}}`);
    }

    if (query.sellersExcluded?.length) {
      // Note: eBay API might not support seller exclusion directly
      // This would need to be filtered post-query
    }

    if (filters.length > 0) {
      params.set('filter', filters.join(','));
    }

    // Location
    if (query.itemLocation) {
      params.set('filter', params.get('filter') + `,itemLocationCountry:${query.itemLocation}`);
    }

    // Pagination
    if (query.limit) {
      params.set('limit', String(Math.min(query.limit, 200)));
    }

    if (query.offset) {
      params.set('offset', String(query.offset));
    }

    // Sort
    if (query.sort) {
      params.set('sort', query.sort);
    }

    return params;
  }

  /**
   * Make an authenticated API request.
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown
  ): Promise<T> {
    const accessToken = await this.auth.getAccessToken();
    const headers = getStandardHeaders(accessToken);

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Handle errors
    if (!response.ok) {
      let errorData: EbayErrorResponse | undefined;

      try {
        errorData = await response.json() as EbayErrorResponse;
      } catch {
        // Response might not be JSON
      }

      throw new EbayApiError(
        `eBay API error: ${response.status} ${response.statusText}`,
        response.status,
        errorData?.errors || [],
        errorData?.warnings
      );
    }

    // Handle empty responses
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if client is properly configured.
   */
  async checkConnection(): Promise<{
    connected: boolean;
    sandbox: boolean;
    hasUserAuth: boolean;
    rateLimitStatus: RateLimitAllStatus;
  }> {
    try {
      // Try to get an application token
      await this.auth.getAccessToken();

      return {
        connected: true,
        sandbox: isSandboxMode(),
        hasUserAuth: this.auth.hasUserToken(),
        rateLimitStatus: this.rateLimiter.getAllStatus(),
      };
    } catch {
      return {
        connected: false,
        sandbox: isSandboxMode(),
        hasUserAuth: false,
        rateLimitStatus: this.rateLimiter.getAllStatus(),
      };
    }
  }

  /**
   * Get the authorization URL for user consent.
   */
  getAuthorizationUrl(state?: string): string {
    return this.auth.getAuthorizationUrl(undefined, state);
  }

  /**
   * Handle OAuth callback.
   */
  async handleAuthCallback(code: string): Promise<void> {
    await this.auth.exchangeAuthorizationCode(code);
  }

  /**
   * Check if we have user authorization.
   */
  hasUserAuthorization(): boolean {
    return this.auth.hasUserToken();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let clientInstance: EbayClient | null = null;

/**
 * Get the eBay client singleton.
 */
export function getEbayClient(): EbayClient {
  if (!clientInstance) {
    clientInstance = new EbayClient();
  }
  return clientInstance;
}

/**
 * Initialize and validate the eBay client.
 */
export async function initializeEbayClient(): Promise<EbayClient> {
  const client = getEbayClient();
  const status = await client.checkConnection();

  if (!status.connected) {
    throw new Error('Failed to connect to eBay API. Check credentials.');
  }

  console.log(`eBay client initialized (sandbox: ${status.sandbox})`);

  return client;
}
