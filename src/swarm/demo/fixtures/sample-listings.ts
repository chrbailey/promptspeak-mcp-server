/**
 * Sample Listing Fixtures for Swarm Demo
 *
 * Realistic eBay listing data for demonstrating swarm intelligence capabilities.
 * These fixtures cover various scenarios: auctions, fixed price, best offer,
 * different conditions, and various seller profiles.
 */

import type { NormalizedListing } from '../../types.js';
import type { SellerProfile, Observation, MarketCondition, CompetitionLevel, RecommendedAction } from '../../types.js';

// =============================================================================
// SAMPLE LISTINGS
// =============================================================================

/**
 * A set of realistic precious metals listings for demo purposes.
 */
export const SAMPLE_LISTINGS: NormalizedListing[] = [
  // Auction ending soon - good snipe opportunity
  {
    itemId: 'ebay_12345678901',
    id: 'ebay_12345678901',
    title: '1 oz Gold American Eagle 2024 BU',
    description: 'Brand new 2024 American Gold Eagle, 1 troy oz .9167 fine gold. Ships in protective capsule.',
    price: 2150.00,
    currentPrice: 1980.00,
    currency: 'USD',
    currentBid: 1980.00,
    bidCount: 12,
    auctionEndTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins
    endTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    condition: 'NEW',
    buyingOptions: ['AUCTION'],
    isAuction: true,
    hasBestOffer: false,
    bestOfferEnabled: false,
    sellerId: 'gold_dealer_usa',
    sellerUsername: 'gold_dealer_usa',
    sellerFeedbackScore: 99.8,
    sellerFeedbackPercent: 99.8,
    location: { city: 'Phoenix', state: 'AZ', country: 'US' },
    shippingCost: 0,
    imageUrl: 'https://example.com/gold-eagle.jpg',
    itemUrl: 'https://www.ebay.com/itm/12345678901',
  },

  // Fixed price with Best Offer - negotiation opportunity
  {
    itemId: 'ebay_12345678902',
    id: 'ebay_12345678902',
    title: '10 oz Silver Bar - APMEX .999 Fine',
    description: 'APMEX branded 10 oz silver bar, .999 fine silver. Sealed in original packaging.',
    price: 295.00,
    currentPrice: 295.00,
    currency: 'USD',
    condition: 'NEW',
    buyingOptions: ['FIXED_PRICE', 'BEST_OFFER'],
    isAuction: false,
    hasBestOffer: true,
    bestOfferEnabled: true,
    bestOfferAutoAcceptPrice: 275.00,
    minimumBestOfferPrice: 250.00,
    sellerId: 'silver_bullion_direct',
    sellerUsername: 'silver_bullion_direct',
    sellerFeedbackScore: 99.5,
    sellerFeedbackPercent: 99.5,
    location: { city: 'Dallas', state: 'TX', country: 'US' },
    shippingCost: 8.95,
    imageUrl: 'https://example.com/silver-bar.jpg',
    itemUrl: 'https://www.ebay.com/itm/12345678902',
  },

  // Underpriced listing - passive strategy opportunity
  {
    itemId: 'ebay_12345678903',
    id: 'ebay_12345678903',
    title: '5 oz Silver Rounds - Walking Liberty Design (Lot of 5)',
    description: 'Five 1-oz silver rounds with classic Walking Liberty design. Private mint, .999 pure.',
    price: 125.00,
    currentPrice: 125.00,
    currency: 'USD',
    condition: 'NEW',
    buyingOptions: ['FIXED_PRICE'],
    isAuction: false,
    hasBestOffer: false,
    bestOfferEnabled: false,
    sellerId: 'estate_liquidator_99',
    sellerUsername: 'estate_liquidator_99',
    sellerFeedbackScore: 98.2,
    sellerFeedbackPercent: 98.2,
    location: { city: 'Denver', state: 'CO', country: 'US' },
    shippingCost: 5.00,
    imageUrl: 'https://example.com/walking-liberty.jpg',
    itemUrl: 'https://www.ebay.com/itm/12345678903',
  },

  // Auction with high competition - early aggressive opportunity
  {
    itemId: 'ebay_12345678904',
    id: 'ebay_12345678904',
    title: '1/10 oz Gold Canadian Maple Leaf 2024',
    description: 'Royal Canadian Mint 1/10 oz gold maple leaf coin. .9999 fine gold, BU condition.',
    price: 250.00,
    currentPrice: 215.00,
    currency: 'USD',
    currentBid: 215.00,
    bidCount: 8,
    auctionEndTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    condition: 'NEW',
    buyingOptions: ['AUCTION', 'FIXED_PRICE'],
    isAuction: true,
    hasBestOffer: false,
    bestOfferEnabled: false,
    buyItNowPrice: 250.00,
    sellerId: 'canadian_gold_co',
    sellerUsername: 'canadian_gold_co',
    sellerFeedbackScore: 99.9,
    sellerFeedbackPercent: 99.9,
    location: { city: 'Seattle', state: 'WA', country: 'US' },
    shippingCost: 0,
    imageUrl: 'https://example.com/maple-leaf.jpg',
    itemUrl: 'https://www.ebay.com/itm/12345678904',
  },

  // Pre-owned item - different condition
  {
    itemId: 'ebay_12345678905',
    id: 'ebay_12345678905',
    title: 'Vintage 1986 American Silver Eagle - First Year Issue',
    description: 'Original 1986 American Silver Eagle, first year of issue. Light toning, stored in capsule.',
    price: 65.00,
    currentPrice: 55.00,
    currency: 'USD',
    currentBid: 55.00,
    bidCount: 4,
    auctionEndTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(), // 45 mins
    endTime: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    condition: 'USED_VERY_GOOD',
    buyingOptions: ['AUCTION'],
    isAuction: true,
    hasBestOffer: false,
    bestOfferEnabled: false,
    sellerId: 'coin_collector_joe',
    sellerUsername: 'coin_collector_joe',
    sellerFeedbackScore: 97.5,
    sellerFeedbackPercent: 97.5,
    location: { city: 'Chicago', state: 'IL', country: 'US' },
    shippingCost: 4.50,
    imageUrl: 'https://example.com/vintage-eagle.jpg',
    itemUrl: 'https://www.ebay.com/itm/12345678905',
  },
];

// =============================================================================
// SAMPLE SELLER PROFILES
// =============================================================================

/**
 * Sample seller profiles for behavior analysis.
 */
export const SAMPLE_SELLER_PROFILES: SellerProfile[] = [
  {
    sellerId: 'gold_dealer_usa',
    feedbackScore: 99.8,
    feedbackPercent: 99.8,
    totalInteractions: 150,
    successfulAcquisitions: 12,
    avgDiscountAchieved: 5.2,
    negotiationStyle: 'FIRM',
    bestOfferAcceptanceRate: 0.35,
    avgOfferResponseTime: 4.5,
    riskLevel: 'LOW',
    firstSeenAt: '2024-01-15T00:00:00Z',
    lastUpdatedAt: new Date().toISOString(),
  },
  {
    sellerId: 'silver_bullion_direct',
    feedbackScore: 99.5,
    feedbackPercent: 99.5,
    totalInteractions: 85,
    successfulAcquisitions: 8,
    avgDiscountAchieved: 12.5,
    negotiationStyle: 'FLEXIBLE',
    bestOfferAcceptanceRate: 0.72,
    avgOfferResponseTime: 2.1,
    riskLevel: 'LOW',
    firstSeenAt: '2024-03-20T00:00:00Z',
    lastUpdatedAt: new Date().toISOString(),
  },
  {
    sellerId: 'estate_liquidator_99',
    feedbackScore: 98.2,
    feedbackPercent: 98.2,
    totalInteractions: 25,
    successfulAcquisitions: 3,
    avgDiscountAchieved: 8.0,
    negotiationStyle: 'UNKNOWN',
    riskLevel: 'MEDIUM',
    firstSeenAt: '2024-06-01T00:00:00Z',
    lastUpdatedAt: new Date().toISOString(),
  },
  {
    sellerId: 'canadian_gold_co',
    feedbackScore: 99.9,
    feedbackPercent: 99.9,
    totalInteractions: 200,
    successfulAcquisitions: 18,
    avgDiscountAchieved: 3.8,
    negotiationStyle: 'COUNTER_HAPPY',
    bestOfferAcceptanceRate: 0.45,
    avgOfferResponseTime: 1.5,
    riskLevel: 'LOW',
    firstSeenAt: '2023-08-10T00:00:00Z',
    lastUpdatedAt: new Date().toISOString(),
  },
  {
    sellerId: 'coin_collector_joe',
    feedbackScore: 97.5,
    feedbackPercent: 97.5,
    totalInteractions: 15,
    successfulAcquisitions: 2,
    avgDiscountAchieved: 15.0,
    negotiationStyle: 'FLEXIBLE',
    bestOfferAcceptanceRate: 0.80,
    riskLevel: 'MEDIUM',
    firstSeenAt: '2024-05-15T00:00:00Z',
    lastUpdatedAt: new Date().toISOString(),
  },
];

// =============================================================================
// MARKET CONTEXT DATA
// =============================================================================

/**
 * Simulated market averages for price comparison.
 */
export const MARKET_AVERAGES: Record<string, number> = {
  '1 oz Gold American Eagle': 2050.00,
  '10 oz Silver Bar': 280.00,
  '1 oz Silver Round': 28.50,
  '1/10 oz Gold Maple Leaf': 235.00,
  '1986 American Silver Eagle': 45.00,
};

/**
 * Get market context for a listing.
 */
export function getMarketContextForListing(listing: NormalizedListing): {
  averagePrice: number;
  priceRange: { min: number; max: number };
  supplyCount: number;
} | undefined {
  // Match based on title keywords
  const title = listing.title.toLowerCase();

  if (title.includes('1 oz gold') && title.includes('eagle')) {
    return {
      averagePrice: MARKET_AVERAGES['1 oz Gold American Eagle'],
      priceRange: { min: 1950, max: 2150 },
      supplyCount: 45,
    };
  }

  if (title.includes('10 oz silver bar')) {
    return {
      averagePrice: MARKET_AVERAGES['10 oz Silver Bar'],
      priceRange: { min: 265, max: 310 },
      supplyCount: 120,
    };
  }

  if (title.includes('silver round') || title.includes('walking liberty')) {
    return {
      averagePrice: MARKET_AVERAGES['1 oz Silver Round'] * 5, // Lot of 5
      priceRange: { min: 135, max: 155 },
      supplyCount: 80,
    };
  }

  if (title.includes('1/10 oz gold') && title.includes('maple')) {
    return {
      averagePrice: MARKET_AVERAGES['1/10 oz Gold Maple Leaf'],
      priceRange: { min: 225, max: 255 },
      supplyCount: 35,
    };
  }

  if (title.includes('1986') && title.includes('silver eagle')) {
    return {
      averagePrice: MARKET_AVERAGES['1986 American Silver Eagle'],
      priceRange: { min: 40, max: 75 },
      supplyCount: 25,
    };
  }

  return undefined;
}

// =============================================================================
// SAMPLE OBSERVATIONS
// =============================================================================

/**
 * Generate sample observations for demo purposes.
 */
export function generateSampleObservation(
  listing: NormalizedListing,
  agentId: string,
  swarmId: string
): Observation {
  const marketContext = getMarketContextForListing(listing);
  const currentPrice = listing.currentPrice;
  const marketAverage = marketContext?.averagePrice;

  // Calculate market condition
  let marketCondition: MarketCondition = 'UNKNOWN';
  let discountPercent: number | undefined;

  if (marketAverage) {
    const priceDiff = ((marketAverage - currentPrice) / marketAverage) * 100;
    discountPercent = priceDiff;

    if (priceDiff > 10) {
      marketCondition = 'UNDERPRICED';
    } else if (priceDiff > -5) {
      marketCondition = 'FAIR';
    } else {
      marketCondition = 'OVERPRICED';
    }
  }

  // Determine recommended action
  let recommendedAction: RecommendedAction = 'WATCH';
  let recommendedAmount: number | undefined;

  if (marketCondition === 'UNDERPRICED') {
    if (listing.isAuction) {
      recommendedAction = 'BID';
      recommendedAmount = currentPrice * 1.05;
    } else if (listing.hasBestOffer) {
      recommendedAction = 'OFFER';
      recommendedAmount = currentPrice * 0.9;
    } else {
      recommendedAction = 'BID';
      recommendedAmount = currentPrice;
    }
  } else if (marketCondition === 'FAIR') {
    recommendedAction = 'WATCH';
  } else {
    recommendedAction = 'SKIP';
  }

  // Calculate competition level
  let competitionLevel: CompetitionLevel = 'LOW';
  if (listing.bidCount) {
    if (listing.bidCount > 10) {
      competitionLevel = 'HIGH';
    } else if (listing.bidCount > 5) {
      competitionLevel = 'MEDIUM';
    }
  }

  // Calculate confidence
  const confidence = marketAverage ? 0.75 : 0.5;

  return {
    observationId: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    observationType: 'LISTING_DISCOVERED',
    agentId,
    swarmId,
    listingId: listing.itemId,
    recommendedAction,
    recommendedAmount,
    marketCondition,
    confidenceScore: confidence,
    reasoning: generateReasoning(listing, marketCondition, discountPercent, competitionLevel),
    currentPrice,
    marketAverage,
    discountPercent,
    competitionLevel,
    itemTitle: listing.title,
    sellerId: listing.sellerId,
    timeRemaining: listing.auctionEndTime
      ? Math.floor((new Date(listing.auctionEndTime).getTime() - Date.now()) / 1000)
      : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate reasoning text for an observation.
 */
function generateReasoning(
  listing: NormalizedListing,
  condition: MarketCondition,
  discount?: number,
  competition?: CompetitionLevel
): string {
  const parts: string[] = [];

  if (condition === 'UNDERPRICED' && discount) {
    parts.push(`Listing is ${discount.toFixed(1)}% below market average.`);
  } else if (condition === 'FAIR') {
    parts.push('Listing is priced near market average.');
  } else if (condition === 'OVERPRICED' && discount) {
    parts.push(`Listing is ${Math.abs(discount).toFixed(1)}% above market average.`);
  }

  if (listing.isAuction && listing.auctionEndTime) {
    const mins = Math.floor(
      (new Date(listing.auctionEndTime).getTime() - Date.now()) / (60 * 1000)
    );
    parts.push(`Auction ends in ${mins} minutes.`);
  }

  if (competition === 'HIGH') {
    parts.push('High competition observed.');
  } else if (competition === 'LOW') {
    parts.push('Low competition - good opportunity.');
  }

  if (listing.sellerFeedbackScore >= 99) {
    parts.push('Trusted seller with excellent feedback.');
  }

  return parts.join(' ');
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  type NormalizedListing,
  type SellerProfile,
  type Observation,
};
