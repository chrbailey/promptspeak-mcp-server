/**
 * Vectors Module
 *
 * Exports Pinecone client and vector operations for market intelligence.
 */

export {
  // Client
  IntelligencePineconeClient,
  getIntelligencePineconeClient,
  createIntelligencePineconeClient,

  // Index configuration
  PINECONE_INDEXES,
  INDEX_CONFIGS,
  type PineconeIndexName,

  // Record types
  type ListingRecord,
  type PriceRecord,
  type SellerRecord,

  // Record builders
  buildListingRecord,
  buildPriceRecord,
  buildSellerRecord,

  // Search types
  type ScoredResult,
  type SearchOptions,
} from './pinecone-client.js';
