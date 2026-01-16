/**
 * eBay API Type Definitions
 *
 * Types for interacting with eBay Browse, Buy, and Offer APIs.
 * Based on eBay API documentation for Buy APIs.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay money amount with currency.
 */
export interface EbayMoney {
  value: string;
  currency: string;
}

/**
 * eBay image representation.
 */
export interface EbayImage {
  imageUrl: string;
  height?: number;
  width?: number;
}

/**
 * eBay seller information.
 */
export interface EbaySeller {
  username: string;
  feedbackPercentage: string;
  feedbackScore: number;
  sellerAccountType?: string;
}

/**
 * Item location.
 */
export interface EbayItemLocation {
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  country: string;
}

/**
 * Shipping cost information.
 */
export interface EbayShippingCost {
  shippingCost?: EbayMoney;
  shippingCostType: 'FIXED' | 'CALCULATED' | 'NOT_SPECIFIED';
  shipToLocationUsedForEstimate?: EbayItemLocation;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSE API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Item condition enum from eBay.
 */
export type EbayCondition =
  | 'NEW'
  | 'LIKE_NEW'
  | 'NEW_OTHER'
  | 'NEW_WITH_DEFECTS'
  | 'MANUFACTURER_REFURBISHED'
  | 'CERTIFIED_REFURBISHED'
  | 'EXCELLENT_REFURBISHED'
  | 'VERY_GOOD_REFURBISHED'
  | 'GOOD_REFURBISHED'
  | 'SELLER_REFURBISHED'
  | 'USED_EXCELLENT'
  | 'USED_VERY_GOOD'
  | 'USED_GOOD'
  | 'USED_ACCEPTABLE'
  | 'FOR_PARTS_OR_NOT_WORKING';

/**
 * Buying options available for an item.
 */
export type EbayBuyingOption =
  | 'FIXED_PRICE'
  | 'AUCTION'
  | 'BEST_OFFER'
  | 'CLASSIFIED_AD';

/**
 * Item summary from search results.
 */
export interface EbayItemSummary {
  itemId: string;
  title: string;
  leafCategoryIds?: string[];
  categories?: Array<{
    categoryId: string;
    categoryName: string;
  }>;
  image?: EbayImage;
  price: EbayMoney;
  itemHref: string;
  seller: EbaySeller;
  condition: EbayCondition;
  conditionId: string;
  thumbnailImages?: EbayImage[];
  shippingOptions?: Array<{
    shippingCost?: EbayMoney;
    shippingCostType: string;
  }>;
  buyingOptions: EbayBuyingOption[];
  itemAffiliateWebUrl?: string;
  itemWebUrl: string;
  itemLocation: EbayItemLocation;
  adultOnly?: boolean;
  legacyItemId?: string;
  availableCoupons?: boolean;
  itemCreationDate?: string;
  topRatedBuyingExperience?: boolean;
  priorityListing?: boolean;
  listingMarketplaceId?: string;
  // Auction-specific
  currentBidPrice?: EbayMoney;
  bidCount?: number;
  itemEndDate?: string;
}

/**
 * Search response from Browse API.
 */
export interface EbaySearchResponse {
  href: string;
  total: number;
  next?: string;
  prev?: string;
  limit: number;
  offset: number;
  itemSummaries?: EbayItemSummary[];
  refinement?: {
    aspectDistributions?: Array<{
      localizedAspectName: string;
      aspectValueDistributions: Array<{
        localizedAspectValue: string;
        matchCount: number;
        refinementHref: string;
      }>;
    }>;
    buyingOptionDistributions?: Array<{
      buyingOption: string;
      matchCount: number;
      refinementHref: string;
    }>;
    categoryDistributions?: Array<{
      categoryId: string;
      categoryName: string;
      matchCount: number;
      refinementHref: string;
    }>;
    conditionDistributions?: Array<{
      condition: string;
      conditionId: string;
      matchCount: number;
      refinementHref: string;
    }>;
  };
  warnings?: EbayError[];
}

/**
 * Full item details from getItem endpoint.
 */
export interface EbayItemDetail {
  itemId: string;
  sellerItemRevision: string;
  title: string;
  subtitle?: string;
  shortDescription?: string;
  description: string;
  price: EbayMoney;
  categoryPath: string;
  categoryIdPath: string;
  condition: EbayCondition;
  conditionId: string;
  conditionDescription?: string;
  itemLocation: EbayItemLocation;
  image: EbayImage;
  additionalImages?: EbayImage[];
  color?: string;
  brand?: string;
  mpn?: string;
  gtin?: string;
  itemCreationDate: string;
  itemEndDate?: string;
  seller: EbaySeller;
  bidCount?: number;
  currentBidPrice?: EbayMoney;
  minimumPriceToBid?: EbayMoney;
  uniqueBidderCount?: number;
  reservePrice?: EbayMoney;
  reservePriceMet?: boolean;
  buyingOptions: EbayBuyingOption[];
  itemAffiliateWebUrl?: string;
  itemWebUrl: string;
  estimatedAvailabilities?: Array<{
    deliveryOptions: string[];
    estimatedAvailabilityStatus: string;
    estimatedAvailableQuantity?: number;
    estimatedSoldQuantity?: number;
  }>;
  shippingOptions?: Array<{
    shippingServiceCode: string;
    shippingCarrierCode?: string;
    type: string;
    shippingCost?: EbayMoney;
    quantityUsedForEstimate?: number;
    minEstimatedDeliveryDate?: string;
    maxEstimatedDeliveryDate?: string;
    additionalShippingCostPerUnit?: EbayMoney;
    shipToLocationUsedForEstimate?: EbayItemLocation;
    trademarkSymbol?: string;
  }>;
  shipToLocations?: {
    regionIncluded?: Array<{
      regionName: string;
      regionType: string;
    }>;
    regionExcluded?: Array<{
      regionName: string;
      regionType: string;
    }>;
  };
  returnTerms?: {
    returnsAccepted: boolean;
    refundMethod?: string;
    returnMethod?: string;
    returnPeriod?: {
      value: number;
      unit: string;
    };
    returnShippingCostPayer?: string;
    restockingFeePercentage?: string;
  };
  taxes?: Array<{
    taxJurisdiction: {
      region: {
        regionName: string;
        regionType: string;
      };
      taxJurisdictionId: string;
    };
    taxType: string;
    shippingAndHandlingTaxed: boolean;
    includedInPrice: boolean;
    ebayCollectAndRemitTax: boolean;
  }>;
  localizedAspects?: Array<{
    type: string;
    name: string;
    value: string;
  }>;
  primaryProductReviewRating?: {
    reviewCount: number;
    averageRating: string;
    ratingHistograms?: Array<{
      rating: string;
      count: number;
    }>;
  };
  quantityLimitPerBuyer?: number;
  eligibleForInlineCheckout?: boolean;
  // Best Offer info
  bestOfferEnabled?: boolean;
  autoBestOfferEnabled?: boolean;
  autoBestOfferPrice?: EbayMoney;
  minimumBestOfferPrice?: EbayMoney;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUY OFFER API TYPES (for auctions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Place bid request.
 */
export interface EbayPlaceBidRequest {
  maxAmount: EbayMoney;
  userConsent: {
    adultOnlyItem?: boolean;
  };
}

/**
 * Place bid response.
 */
export interface EbayPlaceBidResponse {
  bidAmount: EbayMoney;
  currentPrice: EbayMoney;
  highBidder: boolean;
  bidId?: string;
  bidPlacedDate?: string;
  warnings?: EbayError[];
  errors?: EbayError[];
}

/**
 * Proxy bid status.
 */
export interface EbayProxyBidStatus {
  itemId: string;
  bidAmount: EbayMoney;
  currentPrice: EbayMoney;
  highBidder: boolean;
  bidPlacedDate: string;
  bidCount: number;
  itemEndDate: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEST OFFER API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create offer request.
 */
export interface EbayCreateOfferRequest {
  offeredPrice: EbayMoney;
  quantity: number;
  message?: string;
}

/**
 * Offer status enum.
 */
export type EbayOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'COUNTERED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'RETRACTED';

/**
 * Offer response.
 */
export interface EbayOfferResponse {
  offerId: string;
  offerStatus: EbayOfferStatus;
  offeredPrice: EbayMoney;
  quantity: number;
  message?: string;
  expirationDate: string;
  // Counter offer details
  counterOffer?: {
    price: EbayMoney;
    quantity: number;
    message?: string;
    expirationDate: string;
  };
  item: {
    itemId: string;
    title: string;
    price: EbayMoney;
    image?: EbayImage;
  };
  seller: {
    username: string;
  };
  warnings?: EbayError[];
  errors?: EbayError[];
}

/**
 * Accept/decline counter offer request.
 */
export interface EbayRespondToCounterRequest {
  acceptCounterOffer: boolean;
  counterOfferAmount?: EbayMoney;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUY ORDER API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Checkout session initiation request.
 */
export interface EbayInitiateCheckoutRequest {
  contactEmail: string;
  contactFirstName: string;
  contactLastName: string;
  lineItemInputs: Array<{
    itemId: string;
    quantity: number;
    offerId?: string;
  }>;
  shippingAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    country: string;
    contactEmail?: string;
    contactPhone?: string;
  };
}

/**
 * Checkout session response.
 */
export interface EbayCheckoutSessionResponse {
  checkoutSessionId: string;
  expirationDate: string;
  lineItems: Array<{
    itemId: string;
    title: string;
    quantity: number;
    netPrice: EbayMoney;
    image?: EbayImage;
    seller: EbaySeller;
  }>;
  pricingSummary: {
    lineItemSubtotal: EbayMoney;
    shippingTotal?: EbayMoney;
    taxTotal?: EbayMoney;
    total: EbayMoney;
  };
  paymentInstructions?: {
    paymentMethodTypes: string[];
  };
  warnings?: EbayError[];
}

/**
 * Place order response.
 */
export interface EbayPlaceOrderResponse {
  orderId: string;
  purchaseOrderCreationDate: string;
  lineItems: Array<{
    itemId: string;
    title: string;
    quantity: number;
    netPrice: EbayMoney;
    lineItemId: string;
    legacyItemId?: string;
  }>;
  pricingSummary: {
    lineItemSubtotal: EbayMoney;
    shippingTotal?: EbayMoney;
    taxTotal?: EbayMoney;
    total: EbayMoney;
  };
  purchaseOrderPaymentStatus: string;
  purchaseOrderStatus: string;
  warnings?: EbayError[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay API error structure.
 */
export interface EbayError {
  errorId: number;
  domain: string;
  category: 'APPLICATION' | 'BUSINESS' | 'REQUEST';
  message: string;
  longMessage?: string;
  inputRefIds?: string[];
  outputRefIds?: string[];
  parameters?: Array<{
    name: string;
    value: string;
  }>;
}

/**
 * eBay API error response.
 */
export interface EbayErrorResponse {
  errors: EbayError[];
  warnings?: EbayError[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH REQUEST TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sort options for search.
 */
export type EbaySortOrder =
  | 'price'
  | '-price'
  | 'distance'
  | 'newlyListed'
  | '-newlyListed'
  | 'endingSoonest';

/**
 * Filter types for search refinement.
 */
export interface EbaySearchFilters {
  /** Text query */
  q: string;
  /** Category IDs to search within */
  category_ids?: string[];
  /** Filter by buying options */
  filter?: string[];
  /** Item location country */
  itemLocationCountry?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort order */
  sort?: EbaySortOrder;
  /** Aspect filter (e.g., Brand, Color) */
  aspect_filter?: string;
  /** Compatibility filter */
  compatibility_filter?: string;
  /** Fieldgroups to include */
  fieldgroups?: ('MATCHING_ITEMS' | 'FULL' | 'COMPACT' | 'EXTENDED')[];
}

/**
 * Convenience type for common search filters.
 */
export interface SearchQuery {
  query: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  conditions?: EbayCondition[];
  buyingOptions?: EbayBuyingOption[];
  sellersExcluded?: string[];
  itemLocation?: string;
  limit?: number;
  offset?: number;
  sort?: EbaySortOrder;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OAuth token response from eBay.
 */
export interface EbayOAuthToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

/**
 * OAuth scopes for eBay APIs.
 */
export type EbayOAuthScope =
  | 'https://api.ebay.com/oauth/api_scope'
  | 'https://api.ebay.com/oauth/api_scope/buy.browse'
  | 'https://api.ebay.com/oauth/api_scope/buy.offer.auction'
  | 'https://api.ebay.com/oauth/api_scope/buy.order'
  | 'https://api.ebay.com/oauth/api_scope/buy.guest.order';

/**
 * Required scopes for the swarm to operate.
 */
export const REQUIRED_EBAY_SCOPES: EbayOAuthScope[] = [
  'https://api.ebay.com/oauth/api_scope/buy.browse',
  'https://api.ebay.com/oauth/api_scope/buy.offer.auction',
  'https://api.ebay.com/oauth/api_scope/buy.order',
];

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES (mapped from eBay to our domain)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalized listing representation used internally.
 */
export interface NormalizedListing {
  /** Unique item identifier - aliased as 'id' for convenience */
  itemId: string;
  /** Alias for itemId for convenience in strategies */
  id: string;
  title: string;
  description?: string;
  /** List/asking price */
  price: number;
  /** Current price (alias for price or currentBid for auctions) */
  currentPrice: number;
  currency: string;
  /** Current highest bid for auctions */
  currentBid?: number;
  bidCount?: number;
  /** Auction end time (alias for endTime) */
  auctionEndTime?: string;
  /** End time of listing */
  endTime?: string;
  condition: string;
  buyingOptions: string[];
  /** Whether this is an auction listing */
  isAuction: boolean;
  /** Whether Best Offer is enabled */
  hasBestOffer: boolean;
  /** Alias for hasBestOffer */
  bestOfferEnabled: boolean;
  /** Buy It Now price for auctions with BIN option */
  buyItNowPrice?: number;
  bestOfferAutoAcceptPrice?: number;
  minimumBestOfferPrice?: number;
  sellerId: string;
  sellerUsername: string;
  sellerFeedbackScore: number;
  sellerFeedbackPercent: number;
  location: {
    city?: string;
    state?: string;
    country: string;
  };
  shippingCost?: number;
  imageUrl?: string;
  itemUrl: string;
  // Computed fields
  estimatedValue?: number;
  valueScore?: number;
}

/**
 * Map eBay item to normalized listing.
 */
export function normalizeEbayItem(item: EbayItemSummary | EbayItemDetail): NormalizedListing {
  const isDetail = 'description' in item;
  const isAuction = item.buyingOptions.includes('AUCTION');
  const hasBestOffer = item.buyingOptions.includes('BEST_OFFER');
  const price = parseFloat(item.price.value);
  const currentBid = item.currentBidPrice ? parseFloat(item.currentBidPrice.value) : undefined;

  return {
    itemId: item.itemId,
    id: item.itemId, // Alias
    title: item.title,
    description: isDetail ? (item as EbayItemDetail).description : undefined,
    price,
    currentPrice: isAuction && currentBid !== undefined ? currentBid : price,
    currency: item.price.currency,
    currentBid,
    bidCount: item.bidCount,
    endTime: item.itemEndDate,
    auctionEndTime: isAuction ? item.itemEndDate : undefined,
    condition: item.condition,
    buyingOptions: item.buyingOptions,
    isAuction,
    hasBestOffer,
    bestOfferEnabled: hasBestOffer,
    buyItNowPrice: isAuction && item.buyingOptions.includes('FIXED_PRICE') ? price : undefined,
    bestOfferAutoAcceptPrice: isDetail && (item as EbayItemDetail).autoBestOfferPrice
      ? parseFloat((item as EbayItemDetail).autoBestOfferPrice!.value)
      : undefined,
    minimumBestOfferPrice: isDetail && (item as EbayItemDetail).minimumBestOfferPrice
      ? parseFloat((item as EbayItemDetail).minimumBestOfferPrice!.value)
      : undefined,
    sellerId: item.seller.username, // Using username as ID
    sellerUsername: item.seller.username,
    sellerFeedbackScore: item.seller.feedbackScore,
    sellerFeedbackPercent: parseFloat(item.seller.feedbackPercentage),
    location: {
      city: item.itemLocation.city,
      state: item.itemLocation.stateOrProvince,
      country: item.itemLocation.country,
    },
    shippingCost: item.shippingOptions?.[0]?.shippingCost
      ? parseFloat(item.shippingOptions[0].shippingCost.value)
      : undefined,
    imageUrl: item.image?.imageUrl,
    itemUrl: item.itemWebUrl,
  };
}
