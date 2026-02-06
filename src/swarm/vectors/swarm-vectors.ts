/**
 * Swarm Vector Integration
 *
 * Connects the swarm intelligence system with Pinecone vector storage
 * for semantic search over market data and intelligent bidding decisions.
 */

import {
  IntelligencePineconeClient,
  getIntelligencePineconeClient,
  createIntelligencePineconeClient,
  PINECONE_INDEXES,
  buildListingRecord,
  buildPriceRecord,
  buildSellerRecord,
  type ListingRecord,
  type PriceRecord,
  type SellerRecord,
  type SearchOptions,
} from './pinecone-client.js';
import type {
  Observation,
  NormalizedListing,
  SellerProfile,
} from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface SwarmVectorConfig {
  /** Whether vector integration is enabled */
  enabled: boolean;
  /** Pinecone API key (from environment) */
  apiKey?: string;
  /** Namespace for vector operations */
  namespace: string;
  /** Number of similar items to retrieve */
  defaultTopK: number;
  /** Minimum similarity score for results */
  minSimilarityScore: number;
}

const DEFAULT_CONFIG: SwarmVectorConfig = {
  enabled: !!process.env.PINECONE_API_KEY,
  apiKey: process.env.PINECONE_API_KEY,
  namespace: process.env.SWARM_VECTOR_NAMESPACE || 'swarm-intel',
  defaultTopK: 10,
  minSimilarityScore: 0.7,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SWARM VECTOR SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Service for managing swarm intelligence vectors.
 *
 * Provides:
 * - Semantic search for similar listings
 * - Price pattern analysis
 * - Seller behavior matching
 * - Bid strategy recommendations based on historical data
 */
export class SwarmVectorService {
  private config: SwarmVectorConfig;
  private client: IntelligencePineconeClient;

  constructor(config: Partial<SwarmVectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = createIntelligencePineconeClient(this.config.namespace);
  }

  /**
   * Check if vector integration is available.
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LISTING OPERATIONS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Store a listing for future similarity search.
   */
  prepareListingForStorage(
    listing: NormalizedListing,
    observation?: Observation
  ): { index: string; namespace: string; record: ListingRecord } | null {
    if (!this.isEnabled()) return null;
    return this.client.prepareListingUpsert(listing, observation);
  }

  /**
   * Find similar listings based on text description.
   */
  buildSimilarListingsQuery(
    searchText: string,
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildListingSearchQuery']> | null {
    if (!this.isEnabled()) return null;
    return this.client.buildListingSearchQuery(searchText, {
      topK: options.topK ?? this.config.defaultTopK,
      ...options,
    });
  }

  /**
   * Find similar listings to a given listing.
   */
  buildSimilarToListingQuery(
    listing: NormalizedListing,
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildListingSearchQuery']> | null {
    if (!this.isEnabled()) return null;

    // Build search text from listing attributes
    const searchText = [
      listing.title,
      listing.description || '',
      `Condition: ${listing.condition}`,
      `Price: $${listing.currentPrice.toFixed(2)}`,
    ].join('. ');

    return this.buildSimilarListingsQuery(searchText, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRICE INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Store a price observation for pattern analysis.
   */
  preparePriceObservationForStorage(
    observation: Observation
  ): { index: string; namespace: string; record: PriceRecord } | null {
    if (!this.isEnabled()) return null;
    return this.client.preparePriceUpsert(observation);
  }

  /**
   * Find similar price patterns.
   */
  buildPricePatternQuery(
    context: string,
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildPriceSearchQuery']> | null {
    if (!this.isEnabled()) return null;
    return this.client.buildPriceSearchQuery(context, {
      topK: options.topK ?? 20,
      ...options,
    });
  }

  /**
   * Build a query to find price patterns for a specific item type.
   */
  buildItemPriceHistoryQuery(
    itemTitle: string,
    priceRange: { min?: number; max?: number } = {},
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildPriceSearchQuery']> | null {
    if (!this.isEnabled()) return null;

    const context = [
      itemTitle,
      priceRange.min ? `Minimum price: $${priceRange.min}` : null,
      priceRange.max ? `Maximum price: $${priceRange.max}` : null,
    ].filter(Boolean).join('. ');

    const filter: Record<string, unknown> = {};
    if (priceRange.min !== undefined) {
      filter.price = { $gte: priceRange.min };
    }
    if (priceRange.max !== undefined) {
      filter.price = { ...filter.price as object, $lte: priceRange.max };
    }

    return this.client.buildPriceSearchQuery(context, {
      ...options,
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SELLER INTELLIGENCE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Store a seller profile for behavior analysis.
   */
  prepareSellerProfileForStorage(
    profile: SellerProfile
  ): { index: string; namespace: string; record: SellerRecord } | null {
    if (!this.isEnabled()) return null;
    return this.client.prepareSellerUpsert(profile);
  }

  /**
   * Find sellers with similar behavior patterns.
   */
  buildSimilarSellersQuery(
    behaviorDescription: string,
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildSellerSearchQuery']> | null {
    if (!this.isEnabled()) return null;
    return this.client.buildSellerSearchQuery(behaviorDescription, {
      topK: options.topK ?? this.config.defaultTopK,
      ...options,
    });
  }

  /**
   * Find sellers likely to accept best offers.
   */
  buildBestOfferSellersQuery(
    minAcceptanceRate: number = 0.5,
    options: SearchOptions = {}
  ): ReturnType<IntelligencePineconeClient['buildSellerSearchQuery']> | null {
    if (!this.isEnabled()) return null;

    const description = `Seller with high best offer acceptance rate, at least ${(minAcceptanceRate * 100).toFixed(0)}% acceptance, negotiation friendly`;

    return this.client.buildSellerSearchQuery(description, {
      ...options,
      filter: {
        best_offer_acceptance_rate: { $gte: minAcceptanceRate },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BID STRATEGY SUPPORT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get bid recommendation context based on historical data.
   *
   * This builds queries that can be executed via MCP tools to get:
   * - Similar items and their final prices
   * - Price patterns for this category
   * - Seller negotiation history
   */
  buildBidRecommendationQueries(
    listing: NormalizedListing,
    currentObservation: Observation
  ): Record<string, unknown> {
    return {
      similarListings: this.buildSimilarToListingQuery(listing, {
        topK: 5,
        rerank: { model: 'pinecone-rerank-v0', topN: 3 },
      }),
      pricePatterns: this.buildPricePatternQuery(
        `${listing.title} at $${listing.currentPrice.toFixed(2)}, ${currentObservation.marketCondition} market`,
        { topK: 10 }
      ),
      sellerBehavior: this.buildSimilarSellersQuery(
        `Seller ${listing.sellerUsername} with feedback ${listing.sellerFeedbackScore}`,
        { topK: 3 }
      ),
    };
  }

  /**
   * Get the namespace being used.
   */
  getNamespace(): string {
    return this.config.namespace;
  }

  /**
   * Get index names for reference.
   */
  getIndexNames(): typeof PINECONE_INDEXES {
    return PINECONE_INDEXES;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let serviceInstance: SwarmVectorService | null = null;

/**
 * Get the swarm vector service singleton.
 */
export function getSwarmVectorService(): SwarmVectorService {
  if (!serviceInstance) {
    serviceInstance = new SwarmVectorService();
  }
  return serviceInstance;
}

/**
 * Create a new swarm vector service (for testing).
 */
export function createSwarmVectorService(
  config?: Partial<SwarmVectorConfig>
): SwarmVectorService {
  return new SwarmVectorService(config);
}

/**
 * Reset the singleton (for testing).
 */
export function resetSwarmVectorService(): void {
  serviceInstance = null;
}
