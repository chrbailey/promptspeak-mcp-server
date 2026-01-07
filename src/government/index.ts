/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOVERNMENT DATA ADAPTERS MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Multi-Agent Data Intelligence Framework (MADIF) - Government Data Layer
 *
 * This module provides adapters for querying federal government data sources:
 *   - USASpending.gov - Federal spending and contract data
 *   - Federal Register - Proposed rules, final rules, and notices
 *   - SAM.gov - Entity registration and contractor information
 *   - Regulations.gov - Regulatory documents and public comments
 *
 * Each adapter provides:
 *   - Rate limiting (sliding window algorithm)
 *   - Caching (LRU with TTL)
 *   - Retry with exponential backoff
 *   - Conversion to PromptSpeak symbols
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BASE ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Abstract base class
  BaseGovernmentAdapter,

  // Configuration types
  type RateLimitConfig,
  type CacheConfig,
  type RetryConfig,
  type BaseAdapterConfig,

  // Response types
  type LookupResult,
  type BatchLookupResult,
  type AdapterStats,

  // Error handling
  AdapterError,
  type AdapterErrorCode,

  // Internal utilities
  SlidingWindowRateLimiter,
  LRUCache,

  // Defaults
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
} from './adapters/base-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// USASPENDING.GOV ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Adapter class
  USASpendingAdapter,

  // Factory function
  createUSASpendingAdapter,

  // Singleton instance
  usaSpendingAdapter,

  // Configuration
  type USASpendingConfig,
  DEFAULT_USASPENDING_CONFIG,

  // Data types
  type USASpendingFilters,
  type USASpendingAwardSummary,
  type USASpendingAwardDetail,
  type USASpendingAwardRecord,
} from './adapters/usaspending-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// FEDERAL REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Adapter class
  FederalRegisterAdapter,

  // Factory function
  createFederalRegisterAdapter,

  // Singleton instance
  federalRegisterAdapter,

  // Configuration
  type FederalRegisterConfig,
  DEFAULT_FEDERAL_REGISTER_CONFIG,

  // Data types
  type FRDocumentType,
  type FRAgencyReference,
  type FRCfrReference,
  type FRDocument,
  type FRAgency,
  type FederalRegisterRecord,
  type FRSearchConditions,
} from './adapters/federal-register-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SAM.GOV ENTITY ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Adapter class
  SAMEntityAdapter,

  // Factory function
  createSAMEntityAdapter,

  // Singleton instance
  samEntityAdapter,

  // Configuration
  type SAMEntityConfig,
  DEFAULT_SAM_ENTITY_CONFIG,

  // Data types
  type SAMRegistrationStatus,
  type SAMBusinessType,
  type SAMNaicsCode,
  type SAMPscCode,
  type SAMPointOfContact,
  type SAMAddress,
  type SAMEntityData,
  type SAMEntityRecord,
  type SAMSearchConditions,
} from './adapters/sam-entity-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATIONS.GOV ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Adapter class
  RegulationsGovAdapter,

  // Factory function
  createRegulationsGovAdapter,

  // Singleton instance
  regulationsGovAdapter,

  // Configuration
  type RegulationsGovConfig,
  DEFAULT_REGULATIONS_CONFIG,

  // Data types
  type RegDocumentType,
  type RegDocumentSubtype,
  type RegDocumentAttributes,
  type RegDocument,
  type RegDocketAttributes,
  type RegDocket,
  type RegulationsDocumentRecord,
  type RegulationsDocketRecord,
  type RegDocumentSearchConditions,
  type RegDocketSearchConditions,
} from './adapters/regulations-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SAM.GOV OPPORTUNITIES ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Adapter class
  SAMOpportunitiesAdapter,

  // Factory functions
  getSAMOpportunitiesAdapter,
  createSAMOpportunitiesAdapter,

  // Configuration
  type SAMOpportunitiesConfig,

  // Data types
  type NoticeType,
  type SetAsideType,
  type SAMOpportunity,
  type OpportunitySearchParams,
  type OpportunitySearchResponse,
} from './adapters/sam-opportunities-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL MAPPERS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  // Individual mappers
  mapEntityToSymbol,
  mapAwardToSymbol,
  mapFederalRegisterToSymbol,
  mapRegulationsDocToSymbol,
  mapRegulationsDocketToSymbol,

  // Unified mapper
  mapGovernmentDataToSymbol,
  mapGovernmentDataBatch,

  // Namespace utilities
  GOVERNMENT_SYMBOL_PREFIXES,
  isGovernmentSymbol,
  getGovernmentSourceFromSymbol,

  // Types
  type GovernmentDataSource,
  type GovernmentRecord,
} from './mappers/symbol-mapper.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

import { USASpendingAdapter, USASpendingConfig } from './adapters/usaspending-adapter.js';
import { FederalRegisterAdapter, FederalRegisterConfig } from './adapters/federal-register-adapter.js';
import { SAMEntityAdapter, SAMEntityConfig } from './adapters/sam-entity-adapter.js';
import { RegulationsGovAdapter, RegulationsGovConfig } from './adapters/regulations-adapter.js';
import { SAMOpportunitiesAdapter, SAMOpportunitiesConfig } from './adapters/sam-opportunities-adapter.js';

/**
 * Configuration options for creating all adapters.
 */
export interface GovernmentAdapterOptions {
  /** USASpending.gov adapter config */
  usaspending?: Partial<USASpendingConfig>;
  /** Federal Register adapter config */
  federalRegister?: Partial<FederalRegisterConfig>;
  /** SAM.gov Entity adapter config (requires API key) */
  sam?: Partial<SAMEntityConfig>;
  /** SAM.gov Opportunities adapter config (requires API key) */
  samOpportunities?: Partial<SAMOpportunitiesConfig>;
  /** Regulations.gov adapter config (requires API key) */
  regulations?: Partial<RegulationsGovConfig>;
}

/**
 * Collection of all government data adapters.
 */
export interface GovernmentAdapters {
  usaspending: USASpendingAdapter;
  federalRegister: FederalRegisterAdapter;
  sam: SAMEntityAdapter;
  samOpportunities: SAMOpportunitiesAdapter;
  regulations: RegulationsGovAdapter;
}

/**
 * Create all government data adapters with optional configuration.
 *
 * @example
 * ```typescript
 * // Create all adapters with default config
 * const adapters = createGovernmentAdapters();
 *
 * // Create with API keys
 * const adapters = createGovernmentAdapters({
 *   sam: { apiKey: process.env.SAM_API_KEY },
 *   samOpportunities: { apiKey: process.env.SAM_API_KEY },
 *   regulations: { apiKey: process.env.DATA_GOV_API_KEY },
 * });
 *
 * // Search for SDVOSB RFI opportunities
 * const rfis = await adapters.samOpportunities.searchRFIs({
 *   keywords: ['AI', 'NLP'],
 *   setAsideTypes: ['SDVOSBC'],
 * });
 * ```
 */
export function createGovernmentAdapters(
  options: GovernmentAdapterOptions = {}
): GovernmentAdapters {
  return {
    usaspending: new USASpendingAdapter(options.usaspending),
    federalRegister: new FederalRegisterAdapter(options.federalRegister),
    sam: new SAMEntityAdapter(options.sam),
    samOpportunities: new SAMOpportunitiesAdapter(options.samOpportunities),
    regulations: new RegulationsGovAdapter(options.regulations),
  };
}

/**
 * Default singleton instances of all adapters.
 * Use these for simple applications that don't need custom configuration.
 */
export const governmentAdapters: GovernmentAdapters = {
  usaspending: new USASpendingAdapter(),
  federalRegister: new FederalRegisterAdapter(),
  sam: new SAMEntityAdapter(),
  samOpportunities: new SAMOpportunitiesAdapter(),
  regulations: new RegulationsGovAdapter(),
};

// ═══════════════════════════════════════════════════════════════════════════════
// API KEY CONFIGURATION HELPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configure API keys for adapters that require them.
 *
 * @example
 * ```typescript
 * configureApiKeys(governmentAdapters, {
 *   sam: process.env.SAM_API_KEY,
 *   regulations: process.env.DATA_GOV_API_KEY,
 * });
 * ```
 */
export function configureApiKeys(
  adapters: GovernmentAdapters,
  keys: {
    sam?: string;
    samOpportunities?: string;
    regulations?: string;
  }
): void {
  if (keys.sam) {
    adapters.sam.setApiKey(keys.sam);
  }
  if (keys.samOpportunities) {
    adapters.samOpportunities.setApiKey(keys.samOpportunities);
  } else if (keys.sam) {
    // Use same key for both SAM adapters if only one provided
    adapters.samOpportunities.setApiKey(keys.sam);
  }
  if (keys.regulations) {
    adapters.regulations.setApiKey(keys.regulations);
  }
}

/**
 * Check which adapters are fully configured.
 */
export function getAdapterStatus(adapters: GovernmentAdapters): {
  usaspending: { configured: true; requiresKey: false };
  federalRegister: { configured: true; requiresKey: false };
  sam: { configured: boolean; requiresKey: true };
  samOpportunities: { configured: boolean; requiresKey: true };
  regulations: { configured: boolean; requiresKey: true };
} {
  return {
    usaspending: { configured: true, requiresKey: false },
    federalRegister: { configured: true, requiresKey: false },
    sam: { configured: adapters.sam.isApiConfigured(), requiresKey: true },
    samOpportunities: { configured: !adapters.samOpportunities.isStubMode(), requiresKey: true },
    regulations: { configured: adapters.regulations.isApiConfigured(), requiresKey: true },
  };
}
