/**
 * Mock eBay Response Fixtures
 *
 * Factory functions for creating realistic gold/silver listing data
 * for use in unit and integration tests.
 */

import type { NormalizedListing } from '../../src/swarm/ebay/types.js';

// =============================================================================
// GOLD LISTINGS
// =============================================================================

/**
 * Create a mock 1oz gold bar listing.
 */
export function createMockGoldBarListing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  const itemId = `gold_bar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const price = 2150 + Math.random() * 200; // $2150-2350 range

  return {
    itemId,
    id: itemId,
    title: '1 oz Gold Bar - PAMP Suisse .9999 Fine Gold - In Assay',
    price,
    currentPrice: price,
    currency: 'USD',
    condition: 'New',
    buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
    isAuction: false,
    hasBestOffer: true,
    bestOfferEnabled: true,
    buyItNowPrice: price,
    sellerId: 'golddealer_premium',
    sellerUsername: 'golddealer_premium',
    sellerFeedbackScore: 99.8,
    sellerFeedbackPercent: 99.8,
    location: { city: 'New York', state: 'NY', country: 'US' },
    shippingCost: 0, // Free shipping for high-value
    imageUrl: 'https://example.com/gold-bar.jpg',
    itemUrl: `https://ebay.com/itm/${itemId}`,
    ...overrides,
  };
}

/**
 * Create a mock 1oz gold coin listing (auction).
 */
export function createMockGoldCoinAuction(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  const itemId = `gold_coin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const currentBid = 2050 + Math.random() * 100;

  return {
    itemId,
    id: itemId,
    title: '2024 American Gold Eagle 1 oz BU - US Mint',
    price: currentBid,
    currentPrice: currentBid,
    currentBid,
    currency: 'USD',
    bidCount: Math.floor(5 + Math.random() * 15),
    condition: 'New',
    buyingOptions: ['AUCTION'],
    isAuction: true,
    hasBestOffer: false,
    bestOfferEnabled: false,
    auctionEndTime: new Date(Date.now() + 3600000 + Math.random() * 86400000).toISOString(),
    endTime: new Date(Date.now() + 3600000 + Math.random() * 86400000).toISOString(),
    sellerId: 'coin_collector_99',
    sellerUsername: 'coin_collector_99',
    sellerFeedbackScore: 98.5,
    sellerFeedbackPercent: 98.5,
    location: { city: 'Dallas', state: 'TX', country: 'US' },
    shippingCost: 9.99,
    imageUrl: 'https://example.com/gold-eagle.jpg',
    itemUrl: `https://ebay.com/itm/${itemId}`,
    ...overrides,
  };
}

// =============================================================================
// SILVER LISTINGS
// =============================================================================

/**
 * Create a mock 1oz silver bar listing.
 */
export function createMockSilverBarListing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  const itemId = `silver_bar_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const price = 28 + Math.random() * 8; // $28-36 range

  return {
    itemId,
    id: itemId,
    title: '1 oz Silver Bar - Sunshine Mint .999 Fine Silver',
    price,
    currentPrice: price,
    currency: 'USD',
    condition: 'New',
    buyingOptions: ['FIXED_PRICE'],
    isAuction: false,
    hasBestOffer: false,
    bestOfferEnabled: false,
    buyItNowPrice: price,
    sellerId: 'silverstack_direct',
    sellerUsername: 'silverstack_direct',
    sellerFeedbackScore: 99.2,
    sellerFeedbackPercent: 99.2,
    location: { city: 'Phoenix', state: 'AZ', country: 'US' },
    shippingCost: 4.99,
    imageUrl: 'https://example.com/silver-bar.jpg',
    itemUrl: `https://ebay.com/itm/${itemId}`,
    ...overrides,
  };
}

/**
 * Create a mock American Silver Eagle listing (auction).
 */
export function createMockSilverEagleAuction(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  const itemId = `silver_eagle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const currentBid = 32 + Math.random() * 10;

  return {
    itemId,
    id: itemId,
    title: '2024 American Silver Eagle 1 oz BU - US Mint Fresh',
    price: currentBid,
    currentPrice: currentBid,
    currentBid,
    currency: 'USD',
    bidCount: Math.floor(3 + Math.random() * 12),
    condition: 'New',
    buyingOptions: ['AUCTION', 'BEST_OFFER'],
    isAuction: true,
    hasBestOffer: true,
    bestOfferEnabled: true,
    auctionEndTime: new Date(Date.now() + 7200000 + Math.random() * 172800000).toISOString(),
    endTime: new Date(Date.now() + 7200000 + Math.random() * 172800000).toISOString(),
    sellerId: 'numismatic_treasures',
    sellerUsername: 'numismatic_treasures',
    sellerFeedbackScore: 99.5,
    sellerFeedbackPercent: 99.5,
    location: { city: 'Denver', state: 'CO', country: 'US' },
    shippingCost: 5.99,
    imageUrl: 'https://example.com/silver-eagle.jpg',
    itemUrl: `https://ebay.com/itm/${itemId}`,
    ...overrides,
  };
}

/**
 * Create a mock junk silver listing (90% silver coins).
 */
export function createMockJunkSilverListing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  const itemId = `junk_silver_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const price = 180 + Math.random() * 30; // $10 face value lot

  return {
    itemId,
    id: itemId,
    title: '$10 Face Value - 90% Silver Washington Quarters - Junk Silver Lot',
    price,
    currentPrice: price,
    currency: 'USD',
    condition: 'Used',
    buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
    isAuction: false,
    hasBestOffer: true,
    bestOfferEnabled: true,
    buyItNowPrice: price,
    minimumBestOfferPrice: price * 0.9,
    sellerId: 'constitutional_silver',
    sellerUsername: 'constitutional_silver',
    sellerFeedbackScore: 98.9,
    sellerFeedbackPercent: 98.9,
    location: { city: 'Seattle', state: 'WA', country: 'US' },
    shippingCost: 7.99,
    imageUrl: 'https://example.com/junk-silver.jpg',
    itemUrl: `https://ebay.com/itm/${itemId}`,
    ...overrides,
  };
}

// =============================================================================
// SEARCH RESULTS
// =============================================================================

/**
 * Create mock search results for gold/silver query.
 */
export function createMockSearchResults(options: {
  count?: number;
  includeGold?: boolean;
  includeSilver?: boolean;
} = {}): NormalizedListing[] {
  const { count = 10, includeGold = true, includeSilver = true } = options;
  const results: NormalizedListing[] = [];

  for (let i = 0; i < count; i++) {
    const isGold = includeGold && (!includeSilver || Math.random() > 0.6);
    const isAuction = Math.random() > 0.5;

    if (isGold) {
      results.push(isAuction ? createMockGoldCoinAuction() : createMockGoldBarListing());
    } else {
      results.push(isAuction ? createMockSilverEagleAuction() : createMockSilverBarListing());
    }
  }

  return results;
}

// =============================================================================
// API RESPONSE MOCKS
// =============================================================================

/**
 * Create mock bid placement response.
 */
export function createMockBidResponse(options: {
  success?: boolean;
  highBidder?: boolean;
  currentBid?: number;
} = {}): {
  success: boolean;
  bidId: string;
  message: string;
  currentBid: number;
  isHighBidder: boolean;
} {
  const { success = true, highBidder = true, currentBid = 100 } = options;

  return {
    success,
    bidId: success ? `bid_${Date.now()}` : '',
    message: success
      ? (highBidder ? 'You are currently the high bidder' : 'Your bid was placed but you were outbid')
      : 'Bid failed - minimum bid not met',
    currentBid,
    isHighBidder: success && highBidder,
  };
}

/**
 * Create mock offer submission response.
 */
export function createMockOfferResponse(options: {
  status?: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED';
  counterAmount?: number;
} = {}): {
  success: boolean;
  offerId: string;
  status: string;
  message: string;
  counterOffer?: number;
} {
  const { status = 'PENDING', counterAmount } = options;

  return {
    success: status !== 'DECLINED',
    offerId: `offer_${Date.now()}`,
    status,
    message: {
      PENDING: 'Your offer has been submitted to the seller',
      ACCEPTED: 'Congratulations! Your offer was accepted',
      COUNTERED: `The seller has countered with $${counterAmount?.toFixed(2)}`,
      DECLINED: 'Your offer was declined by the seller',
    }[status],
    counterOffer: status === 'COUNTERED' ? counterAmount : undefined,
  };
}

/**
 * Create mock rate limit status.
 */
export function createMockRateLimitStatus(): {
  minuteTokens: number;
  minuteLimit: number;
  dayTokens: number;
  dayLimit: number;
  inBackoff: boolean;
  backoffRemainingMs: number;
} {
  return {
    minuteTokens: 4500,
    minuteLimit: 5000,
    dayTokens: 95000,
    dayLimit: 100000,
    inBackoff: false,
    backoffRemainingMs: 0,
  };
}
