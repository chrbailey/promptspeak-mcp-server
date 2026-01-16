/**
 * Pinecone Client for Market Intelligence
 *
 * Provides typed interface for storing and retrieving market intelligence vectors.
 * Uses Pinecone's integrated inference for automatic embedding generation.
 *
 * Index Structure:
 * - listings-intel: Listing discovery and similarity search
 * - price-intel: Price observation patterns
 * - seller-intel: Seller behavior profiles
 */

import type {
  Observation,
  NormalizedListing,
  SellerProfile,
  MarketCondition,
} from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const PINECONE_INDEXES = {
  LISTINGS: 'listings-intel',
  PRICES: 'price-intel',
  SELLERS: 'seller-intel',
} as const;

export type PineconeIndexName = (typeof PINECONE_INDEXES)[keyof typeof PINECONE_INDEXES];

/**
 * Configuration for creating intelligence indexes.
 * Uses llama-text-embed-v2 for high-quality dense embeddings.
 */
export const INDEX_CONFIGS = {
  [PINECONE_INDEXES.LISTINGS]: {
    name: PINECONE_INDEXES.LISTINGS,
    embed: {
      model: 'llama-text-embed-v2' as const,
      fieldMap: { text: 'content' },
    },
  },
  [PINECONE_INDEXES.PRICES]: {
    name: PINECONE_INDEXES.PRICES,
    embed: {
      model: 'llama-text-embed-v2' as const,
      fieldMap: { text: 'content' },
    },
  },
  [PINECONE_INDEXES.SELLERS]: {
    name: PINECONE_INDEXES.SELLERS,
    embed: {
      model: 'llama-text-embed-v2' as const,
      fieldMap: { text: 'content' },
    },
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Listing record for vector storage.
 * Content field is used for embedding generation.
 */
export interface ListingRecord {
  id: string;
  content: string;  // Text content for embedding (title + description + category)
  item_id: string;
  title: string;
  price: number;
  condition: string;
  seller_id: string;
  category: string;
  listing_type: string;  // AUCTION | FIXED_PRICE | BEST_OFFER
  market_condition?: MarketCondition;
  discount_percent?: number;
  observed_at: string;
}

/**
 * Price observation record for vector storage.
 * Captures price intelligence patterns.
 */
export interface PriceRecord {
  id: string;
  content: string;  // Text content for embedding (item + price context)
  observation_id: string;
  item_id: string;
  item_title: string;
  price: number;
  market_average?: number;
  discount_percent?: number;
  market_condition: MarketCondition;
  confidence: number;
  agent_strategy: string;
  recommended_action: string;
  observed_at: string;
}

/**
 * Seller profile record for vector storage.
 * Captures seller behavior patterns.
 */
export interface SellerRecord {
  id: string;
  content: string;  // Text content for embedding (seller behavior summary)
  seller_id: string;
  feedback_score: number;
  feedback_percent: number;
  total_interactions: number;
  successful_acquisitions: number;
  avg_discount_achieved: number;
  negotiation_style: string;
  best_offer_acceptance_rate: number;
  risk_level: string;
  last_updated: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a listing record from normalized listing data.
 */
export function buildListingRecord(
  listing: NormalizedListing,
  observation?: Observation
): ListingRecord {
  // Determine listing type from buying options
  const listingType = listing.isAuction
    ? 'AUCTION'
    : listing.hasBestOffer
      ? 'BEST_OFFER'
      : 'FIXED_PRICE';

  // Build rich content for embedding
  const contentParts = [
    listing.title,
    listing.description || '',
    `Type: ${listingType}`,
    `Condition: ${listing.condition}`,
    `Price: $${listing.currentPrice.toFixed(2)}`,
    `Seller: ${listing.sellerUsername}`,
  ];

  if (observation?.marketCondition) {
    contentParts.push(`Market: ${observation.marketCondition}`);
  }
  if (observation?.discountPercent) {
    contentParts.push(`Discount: ${observation.discountPercent.toFixed(0)}% below market`);
  }

  return {
    id: `listing_${listing.itemId}`,
    content: contentParts.join('. '),
    item_id: listing.itemId,
    title: listing.title,
    price: listing.currentPrice,
    condition: listing.condition,
    seller_id: listing.sellerId,
    category: listing.buyingOptions.join(', ') || 'Unknown',
    listing_type: listingType,
    market_condition: observation?.marketCondition,
    discount_percent: observation?.discountPercent,
    observed_at: new Date().toISOString(),
  };
}

/**
 * Build a price record from an observation.
 */
export function buildPriceRecord(observation: Observation): PriceRecord {
  // Build rich content describing the price intelligence
  const contentParts = [
    observation.itemTitle || 'Unknown item',
    `Current price: $${observation.currentPrice.toFixed(2)}`,
    observation.marketAverage
      ? `Market average: $${observation.marketAverage.toFixed(2)}`
      : null,
    observation.discountPercent
      ? `${observation.discountPercent.toFixed(0)}% below market`
      : null,
    `Market condition: ${observation.marketCondition}`,
    `Competition: ${observation.competitionLevel}`,
    `Recommended: ${observation.recommendedAction}`,
    observation.reasoning,
  ].filter(Boolean);

  return {
    id: `price_${observation.observationId}`,
    content: contentParts.join('. '),
    observation_id: observation.observationId,
    item_id: observation.listingId || '',
    item_title: observation.itemTitle || '',
    price: observation.currentPrice,
    market_average: observation.marketAverage,
    discount_percent: observation.discountPercent,
    market_condition: observation.marketCondition,
    confidence: observation.confidenceScore,
    agent_strategy: observation.agentId.split('-')[0] || 'unknown',  // Extract strategy from agentId
    recommended_action: observation.recommendedAction,
    observed_at: observation.timestamp,
  };
}

/**
 * Build a seller record from a seller profile.
 */
export function buildSellerRecord(profile: SellerProfile): SellerRecord {
  const feedbackScore = profile.feedbackScore ?? 0;
  const feedbackPercent = profile.feedbackPercent ?? 0;
  const avgDiscount = profile.avgDiscountAchieved ?? 0;

  // Build rich content describing seller behavior
  const contentParts = [
    `Seller ${profile.sellerId}`,
    `Feedback: ${feedbackScore} (${feedbackPercent.toFixed(1)}% positive)`,
    `Interactions: ${profile.totalInteractions} total, ${profile.successfulAcquisitions} successful`,
    avgDiscount > 0
      ? `Average discount achieved: ${avgDiscount.toFixed(1)}%`
      : null,
    `Negotiation style: ${profile.negotiationStyle}`,
    profile.bestOfferAcceptanceRate !== undefined
      ? `Best Offer acceptance: ${(profile.bestOfferAcceptanceRate * 100).toFixed(0)}%`
      : null,
    `Risk level: ${profile.riskLevel}`,
  ].filter(Boolean);

  return {
    id: `seller_${profile.sellerId}`,
    content: contentParts.join('. '),
    seller_id: profile.sellerId,
    feedback_score: feedbackScore,
    feedback_percent: feedbackPercent,
    total_interactions: profile.totalInteractions,
    successful_acquisitions: profile.successfulAcquisitions,
    avg_discount_achieved: avgDiscount,
    negotiation_style: profile.negotiationStyle,
    best_offer_acceptance_rate: profile.bestOfferAcceptanceRate ?? 0,
    risk_level: profile.riskLevel,
    last_updated: profile.lastUpdatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search result with score.
 */
export interface ScoredResult<T> {
  record: T;
  score: number;
}

/**
 * Search options for vector queries.
 */
export interface SearchOptions {
  topK?: number;
  filter?: Record<string, unknown>;
  rerank?: {
    model: 'cohere-rerank-3.5' | 'bge-reranker-v2-m3' | 'pinecone-rerank-v0';
    topN?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Intelligence Pinecone Client
 *
 * Provides high-level operations for market intelligence vector storage.
 * Wraps Pinecone MCP tools with typed interfaces.
 *
 * Note: Actual Pinecone operations are performed via MCP tools.
 * This class provides the interface and record transformation logic.
 */
export class IntelligencePineconeClient {
  private namespace: string;

  constructor(namespace: string = 'default') {
    this.namespace = namespace;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPSERT OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Prepare a listing for upsert.
   * Returns the record and index info for use with Pinecone MCP tools.
   */
  prepareListingUpsert(
    listing: NormalizedListing,
    observation?: Observation
  ): { index: string; namespace: string; record: ListingRecord } {
    return {
      index: PINECONE_INDEXES.LISTINGS,
      namespace: this.namespace,
      record: buildListingRecord(listing, observation),
    };
  }

  /**
   * Prepare a price observation for upsert.
   */
  preparePriceUpsert(
    observation: Observation
  ): { index: string; namespace: string; record: PriceRecord } {
    return {
      index: PINECONE_INDEXES.PRICES,
      namespace: this.namespace,
      record: buildPriceRecord(observation),
    };
  }

  /**
   * Prepare a seller profile for upsert.
   */
  prepareSellerUpsert(
    profile: SellerProfile
  ): { index: string; namespace: string; record: SellerRecord } {
    return {
      index: PINECONE_INDEXES.SELLERS,
      namespace: this.namespace,
      record: buildSellerRecord(profile),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SEARCH QUERY BUILDERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build a listing search query.
   */
  buildListingSearchQuery(
    searchText: string,
    options: SearchOptions = {}
  ): {
    index: string;
    namespace: string;
    query: {
      inputs: { text: string };
      topK: number;
      filter?: Record<string, unknown>;
    };
    rerank?: {
      model: string;
      rankFields: string[];
      topN?: number;
    };
  } {
    return {
      index: PINECONE_INDEXES.LISTINGS,
      namespace: this.namespace,
      query: {
        inputs: { text: searchText },
        topK: options.topK ?? 10,
        filter: options.filter,
      },
      ...(options.rerank && {
        rerank: {
          model: options.rerank.model,
          rankFields: ['content'],
          topN: options.rerank.topN,
        },
      }),
    };
  }

  /**
   * Build a price pattern search query.
   */
  buildPriceSearchQuery(
    context: string,
    options: SearchOptions = {}
  ): {
    index: string;
    namespace: string;
    query: {
      inputs: { text: string };
      topK: number;
      filter?: Record<string, unknown>;
    };
  } {
    return {
      index: PINECONE_INDEXES.PRICES,
      namespace: this.namespace,
      query: {
        inputs: { text: context },
        topK: options.topK ?? 20,
        filter: options.filter,
      },
    };
  }

  /**
   * Build a seller search query.
   */
  buildSellerSearchQuery(
    behaviorDescription: string,
    options: SearchOptions = {}
  ): {
    index: string;
    namespace: string;
    query: {
      inputs: { text: string };
      topK: number;
      filter?: Record<string, unknown>;
    };
  } {
    return {
      index: PINECONE_INDEXES.SELLERS,
      namespace: this.namespace,
      query: {
        inputs: { text: behaviorDescription },
        topK: options.topK ?? 10,
        filter: options.filter,
      },
    };
  }

  /**
   * Get the namespace.
   */
  getNamespace(): string {
    return this.namespace;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let clientInstance: IntelligencePineconeClient | null = null;

/**
 * Get the intelligence Pinecone client singleton.
 */
export function getIntelligencePineconeClient(namespace?: string): IntelligencePineconeClient {
  if (!clientInstance) {
    clientInstance = new IntelligencePineconeClient(namespace);
  }
  return clientInstance;
}

/**
 * Create a fresh Pinecone client (for testing).
 */
export function createIntelligencePineconeClient(namespace?: string): IntelligencePineconeClient {
  return new IntelligencePineconeClient(namespace);
}
