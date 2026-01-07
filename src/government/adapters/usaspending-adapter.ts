/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * USASPENDING.GOV API ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adapter for querying federal spending data from USASpending.gov API.
 * API Documentation: https://api.usaspending.gov/api/v2/
 *
 * Key Features:
 *   - Search spending by award
 *   - Get award details
 *   - Search by recipient (contractor)
 *   - Query by NAICS/PSC codes
 *
 * Rate Limit: 30 requests per minute (no authentication required)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  BaseGovernmentAdapter,
  BaseAdapterConfig,
  LookupResult,
  BatchLookupResult,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
  AdapterError,
  type Result,
  success,
  failure,
  fromError,
} from './base-adapter.js';
import type { DirectiveSymbol, SymbolCategory } from '../../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface USASpendingConfig extends BaseAdapterConfig {
  /** Default filters for searches */
  defaultFilters?: USASpendingFilters;
}

export const DEFAULT_USASPENDING_CONFIG: USASpendingConfig = {
  baseUrl: 'https://api.usaspending.gov/api/v2',
  timeoutMs: 30000,
  rateLimit: {
    requestsPerMinute: 30,
    minDelayMs: 100,
  },
  cache: {
    ...DEFAULT_CACHE_CONFIG,
    ttlMs: 4 * 60 * 60 * 1000, // 4 hours - spending data updates daily
  },
  retry: DEFAULT_RETRY_CONFIG,
};

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Filters for spending search queries.
 */
export interface USASpendingFilters {
  /** Keywords to search for */
  keywords?: string[];
  /** Time period range */
  time_period?: Array<{
    start_date: string;
    end_date: string;
  }>;
  /** Award type codes */
  award_type_codes?: string[];
  /** NAICS codes */
  naics_codes?: string[];
  /** PSC codes */
  psc_codes?: string[];
  /** Recipient UEI */
  recipient_search_text?: string;
  /** Awarding agency codes */
  agencies?: Array<{
    type: 'awarding' | 'funding';
    tier: 'toptier' | 'subtier';
    name: string;
  }>;
  /** Place of performance */
  place_of_performance_locations?: Array<{
    country: string;
    state?: string;
    county?: string;
    city?: string;
  }>;
  /** Set-aside type codes */
  set_aside_type_codes?: string[];
  /** Contract pricing type codes */
  contract_pricing_type_codes?: string[];
}

/**
 * Award summary from spending search.
 */
export interface USASpendingAwardSummary {
  internal_id: number;
  generated_unique_award_id: string;
  type: string;
  type_description: string;
  piid: string | null;
  fain: string | null;
  uri: string | null;
  total_obligation: number;
  base_and_all_options_value: number;
  description: string;
  recipient_name: string;
  recipient_uei: string | null;
  awarding_agency_name: string;
  awarding_toptier_agency_name: string;
  awarding_subtier_agency_name: string;
  funding_agency_name: string | null;
  funding_toptier_agency_name: string | null;
  funding_subtier_agency_name: string | null;
  action_date: string;
  period_of_performance_start_date: string;
  period_of_performance_current_end_date: string;
  naics_code: string | null;
  naics_description: string | null;
  psc_code: string | null;
  psc_description: string | null;
  place_of_performance_city: string | null;
  place_of_performance_state: string | null;
  place_of_performance_country: string | null;
}

/**
 * Detailed award information.
 */
export interface USASpendingAwardDetail {
  id: number;
  generated_unique_award_id: string;
  category: string;
  type: string;
  type_description: string;
  piid: string | null;
  fain: string | null;
  uri: string | null;
  description: string;
  total_obligation: number;
  base_and_all_options_value: number;
  base_exercised_options: number;
  date_signed: string;
  period_of_performance: {
    start_date: string;
    end_date: string;
    last_modified_date: string;
    potential_end_date: string | null;
  };
  awarding_agency: {
    id: number;
    has_agency_page: boolean;
    toptier_agency: {
      name: string;
      code: string;
      abbreviation: string | null;
    };
    subtier_agency: {
      name: string;
      code: string;
      abbreviation: string | null;
    };
  };
  funding_agency: {
    id: number | null;
    has_agency_page: boolean;
    toptier_agency: {
      name: string;
      code: string;
      abbreviation: string | null;
    } | null;
    subtier_agency: {
      name: string;
      code: string;
      abbreviation: string | null;
    } | null;
  } | null;
  recipient: {
    recipient_name: string;
    recipient_uei: string | null;
    recipient_hash: string;
    business_categories: string[];
    recipient_unique_id: string | null; // DUNS (deprecated)
    parent_recipient_name: string | null;
    parent_recipient_unique_id: string | null;
    parent_recipient_uei: string | null;
    location: {
      address_line1: string | null;
      address_line2: string | null;
      address_line3: string | null;
      city_name: string | null;
      county_name: string | null;
      state_code: string | null;
      zip5: string | null;
      zip4: string | null;
      foreign_postal_code: string | null;
      country_name: string | null;
      country_code: string | null;
      congressional_code: string | null;
    };
  };
  place_of_performance: {
    address_line1: string | null;
    address_line2: string | null;
    address_line3: string | null;
    city_name: string | null;
    county_name: string | null;
    state_code: string | null;
    zip5: string | null;
    zip4: string | null;
    foreign_postal_code: string | null;
    country_name: string | null;
    country_code: string | null;
    congressional_code: string | null;
  };
  naics_hierarchy: {
    toptier_code: { code: string; description: string } | null;
    midtier_code: { code: string; description: string } | null;
    base_code: { code: string; description: string } | null;
  };
  psc_hierarchy: {
    toptier_code: { code: string; description: string } | null;
    midtier_code: { code: string; description: string } | null;
    base_code: { code: string; description: string } | null;
    subtier_code: { code: string; description: string } | null;
  };
  executive_details: {
    officers: Array<{
      name: string;
      amount: number;
    }>;
  };
  subaward_count: number;
  total_subaward_amount: number;
}

/**
 * Search response from USASpending API.
 */
interface USASpendingSearchResponse {
  results: USASpendingAwardSummary[];
  page_metadata: {
    page: number;
    hasNext: boolean;
    hasPrevious: boolean;
    total: number;
  };
}

/**
 * Normalized award record used internally.
 */
export interface USASpendingAwardRecord {
  /** Internal award ID */
  awardId: string;
  /** Contract PIID or grant FAIN */
  identifier: string;
  /** Award type (contract, grant, etc.) */
  awardType: string;
  /** Award type description */
  awardTypeDescription: string;
  /** Description of the award */
  description: string;
  /** Total obligated amount */
  totalObligation: number;
  /** Base and all options value */
  baseAndAllOptionsValue: number;
  /** Recipient information */
  recipient: {
    name: string;
    uei: string | null;
    location: {
      city: string | null;
      state: string | null;
      country: string | null;
    };
    businessCategories?: string[];
  };
  /** Awarding agency */
  awardingAgency: {
    name: string;
    toptierName: string;
    subtierName: string | null;
  };
  /** Funding agency (if different) */
  fundingAgency: {
    name: string | null;
    toptierName: string | null;
    subtierName: string | null;
  } | null;
  /** Key dates */
  dates: {
    signed: string | null;
    performanceStart: string;
    performanceEnd: string;
  };
  /** NAICS classification */
  naics: {
    code: string | null;
    description: string | null;
  };
  /** PSC classification */
  psc: {
    code: string | null;
    description: string | null;
  };
  /** Place of performance */
  placeOfPerformance: {
    city: string | null;
    state: string | null;
    country: string | null;
  };
  /** When this record was fetched */
  fetchedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USASPENDING ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter for USASpending.gov federal spending data.
 */
export class USASpendingAdapter extends BaseGovernmentAdapter<
  USASpendingConfig,
  USASpendingAwardRecord
> {
  constructor(config?: Partial<USASpendingConfig>) {
    super({ ...DEFAULT_USASPENDING_CONFIG, ...config });
  }

  protected getAdapterName(): string {
    return 'USASpending';
  }

  protected getCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return `usaspending:${Buffer.from(normalized).toString('base64').slice(0, 32)}`;
  }

  protected parseResponse(data: unknown): USASpendingAwardRecord {
    const award = data as USASpendingAwardDetail;
    return this.normalizeAwardDetail(award);
  }

  /**
   * Look up a specific award by its ID.
   * Returns Result<LookupResult<USASpendingAwardRecord>> for type-safe error handling.
   */
  public async lookup(params: { awardId: string }): Promise<Result<LookupResult<USASpendingAwardRecord>>> {
    const startTime = Date.now();
    const { awardId } = params;

    if (!awardId) {
      return failure('VALIDATION_ERROR', 'Award ID is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const cacheKey = this.getCacheKey({ awardId });

    try {
      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return success(
          {
            success: true,
            data: cached,
            fromCache: true,
            timestamp: new Date().toISOString(),
            source: 'usaspending',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: true }
        );
      }

      // Fetch from API
      const award = await this.getAwardById(awardId);

      return success(
        {
          success: true,
          data: award,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'usaspending',
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: false }
      );
    } catch (error) {
      return fromError(error, 'ADAPTER_ERROR');
    }
  }

  /**
   * Batch lookup multiple awards.
   */
  public async lookupBatch(
    paramsList: Array<{ awardId: string }>
  ): Promise<BatchLookupResult<USASpendingAwardRecord>> {
    const results = new Map<string, USASpendingAwardRecord>();
    const errors = new Map<string, string>();
    let partialCache = false;

    for (const params of paramsList) {
      const result = await this.lookup(params);
      if (result.success && result.data.data) {
        results.set(params.awardId, result.data.data);
        if (result.data.fromCache) {
          partialCache = true;
        }
      } else if (!result.success) {
        errors.set(params.awardId, result.error.message || 'Unknown error');
      }
    }

    return {
      results,
      errors,
      totalRequested: paramsList.length,
      totalSucceeded: results.size,
      partialCache,
    };
  }

  /**
   * Search for awards matching the given criteria.
   */
  public async searchAwards(options: {
    filters: USASpendingFilters;
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  }): Promise<{
    awards: USASpendingAwardRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const { filters, page = 1, limit = 10, sort = 'total_obligation', order = 'desc' } = options;

    const cacheKey = this.getCacheKey({ type: 'search', filters, page, limit, sort, order });

    try {
      const response = await this.makeRequest<USASpendingSearchResponse>(
        '/search/spending_by_award/',
        {
          method: 'POST',
          body: {
            filters: {
              ...this.config.defaultFilters,
              ...filters,
            },
            fields: [
              'Award ID',
              'Recipient Name',
              'Start Date',
              'End Date',
              'Award Amount',
              'Total Outlays',
              'Description',
              'def_codes',
              'COVID-19 Obligations',
              'COVID-19 Outlays',
              'Infrastructure Obligations',
              'Infrastructure Outlays',
              'Awarding Agency',
              'Awarding Sub Agency',
              'Award Type',
              'contract_award_type',
              'NAICS Code',
              'NAICS Description',
              'PSC Code',
              'PSC Description',
              'recipient_id',
              'prime_award_recipient_id',
            ],
            page,
            limit,
            sort,
            order,
          },
          cacheKey,
        }
      );

      const awards = response.results.map((result) => this.normalizeAwardSummary(result));

      return {
        awards,
        total: response.page_metadata.total,
        hasMore: response.page_metadata.hasNext,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to search awards: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Search for awards by recipient name or UEI.
   */
  public async searchByRecipient(options: {
    recipientSearchText: string;
    page?: number;
    limit?: number;
  }): Promise<{
    awards: USASpendingAwardRecord[];
    total: number;
    hasMore: boolean;
  }> {
    return this.searchAwards({
      filters: {
        recipient_search_text: options.recipientSearchText,
      },
      page: options.page,
      limit: options.limit,
    });
  }

  /**
   * Search for awards by NAICS code.
   */
  public async searchByNAICS(options: {
    naicsCode: string;
    page?: number;
    limit?: number;
  }): Promise<{
    awards: USASpendingAwardRecord[];
    total: number;
    hasMore: boolean;
  }> {
    return this.searchAwards({
      filters: {
        naics_codes: [options.naicsCode],
      },
      page: options.page,
      limit: options.limit,
    });
  }

  /**
   * Search for awards by agency.
   */
  public async searchByAgency(options: {
    agencyName: string;
    tier?: 'toptier' | 'subtier';
    type?: 'awarding' | 'funding';
    page?: number;
    limit?: number;
  }): Promise<{
    awards: USASpendingAwardRecord[];
    total: number;
    hasMore: boolean;
  }> {
    return this.searchAwards({
      filters: {
        agencies: [
          {
            type: options.type || 'awarding',
            tier: options.tier || 'toptier',
            name: options.agencyName,
          },
        ],
      },
      page: options.page,
      limit: options.limit,
    });
  }

  /**
   * Get detailed information for a specific award.
   */
  private async getAwardById(awardId: string): Promise<USASpendingAwardRecord> {
    const cacheKey = this.getCacheKey({ type: 'detail', awardId });

    try {
      const response = await this.makeRequest<USASpendingAwardDetail>(
        `/awards/${encodeURIComponent(awardId)}/`,
        {
          method: 'GET',
          cacheKey,
        }
      );

      return this.normalizeAwardDetail(response);
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'NOT_FOUND') {
        throw new AdapterError(`Award not found: ${awardId}`, 'NOT_FOUND', 404);
      }
      throw error;
    }
  }

  /**
   * Normalize an award summary from search results.
   */
  private normalizeAwardSummary(summary: USASpendingAwardSummary): USASpendingAwardRecord {
    return {
      awardId: summary.generated_unique_award_id,
      identifier: summary.piid || summary.fain || summary.uri || '',
      awardType: summary.type,
      awardTypeDescription: summary.type_description,
      description: summary.description,
      totalObligation: summary.total_obligation,
      baseAndAllOptionsValue: summary.base_and_all_options_value,
      recipient: {
        name: summary.recipient_name,
        uei: summary.recipient_uei,
        location: {
          city: null,
          state: null,
          country: null,
        },
      },
      awardingAgency: {
        name: summary.awarding_agency_name,
        toptierName: summary.awarding_toptier_agency_name,
        subtierName: summary.awarding_subtier_agency_name,
      },
      fundingAgency: summary.funding_agency_name
        ? {
            name: summary.funding_agency_name,
            toptierName: summary.funding_toptier_agency_name,
            subtierName: summary.funding_subtier_agency_name,
          }
        : null,
      dates: {
        signed: summary.action_date,
        performanceStart: summary.period_of_performance_start_date,
        performanceEnd: summary.period_of_performance_current_end_date,
      },
      naics: {
        code: summary.naics_code,
        description: summary.naics_description,
      },
      psc: {
        code: summary.psc_code,
        description: summary.psc_description,
      },
      placeOfPerformance: {
        city: summary.place_of_performance_city,
        state: summary.place_of_performance_state,
        country: summary.place_of_performance_country,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalize detailed award information.
   */
  private normalizeAwardDetail(detail: USASpendingAwardDetail): USASpendingAwardRecord {
    return {
      awardId: detail.generated_unique_award_id,
      identifier: detail.piid || detail.fain || detail.uri || '',
      awardType: detail.type,
      awardTypeDescription: detail.type_description,
      description: detail.description,
      totalObligation: detail.total_obligation,
      baseAndAllOptionsValue: detail.base_and_all_options_value,
      recipient: {
        name: detail.recipient.recipient_name,
        uei: detail.recipient.recipient_uei,
        location: {
          city: detail.recipient.location.city_name,
          state: detail.recipient.location.state_code,
          country: detail.recipient.location.country_name,
        },
        businessCategories: detail.recipient.business_categories,
      },
      awardingAgency: {
        name: `${detail.awarding_agency.toptier_agency.name} / ${detail.awarding_agency.subtier_agency.name}`,
        toptierName: detail.awarding_agency.toptier_agency.name,
        subtierName: detail.awarding_agency.subtier_agency.name,
      },
      fundingAgency: detail.funding_agency?.toptier_agency
        ? {
            name: `${detail.funding_agency.toptier_agency.name}${
              detail.funding_agency.subtier_agency
                ? ` / ${detail.funding_agency.subtier_agency.name}`
                : ''
            }`,
            toptierName: detail.funding_agency.toptier_agency.name,
            subtierName: detail.funding_agency.subtier_agency?.name || null,
          }
        : null,
      dates: {
        signed: detail.date_signed,
        performanceStart: detail.period_of_performance.start_date,
        performanceEnd: detail.period_of_performance.end_date,
      },
      naics: {
        code: detail.naics_hierarchy.base_code?.code || null,
        description: detail.naics_hierarchy.base_code?.description || null,
      },
      psc: {
        code: detail.psc_hierarchy.base_code?.code || null,
        description: detail.psc_hierarchy.base_code?.description || null,
      },
      placeOfPerformance: {
        city: detail.place_of_performance.city_name,
        state: detail.place_of_performance.state_code,
        country: detail.place_of_performance.country_name,
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Convert an award record to a PromptSpeak symbol.
   */
  public toSymbol(record: USASpendingAwardRecord): DirectiveSymbol {
    const symbolId = `\u039E.TX.GOV.AWARD.${record.awardId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    const now = new Date().toISOString();

    // Format currency
    const formatCurrency = (amount: number): string => {
      if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
      if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
      if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
      return `$${amount.toFixed(2)}`;
    };

    return {
      symbolId,
      version: 1,
      hash: Buffer.from(record.awardId).toString('base64').slice(0, 16),
      category: 'TRANSACTION' as SymbolCategory,
      subcategory: 'GOVERNMENT_AWARD',
      tags: [
        'government',
        'usaspending',
        record.awardType,
        record.naics.code || 'no-naics',
      ].filter(Boolean),

      who: `Federal contractor: ${record.recipient.name}`,
      what: `Government ${record.awardTypeDescription}: ${record.description.slice(0, 200)}`,
      why: `Track federal spending and contract performance for ${record.awardingAgency.toptierName}`,
      where: record.placeOfPerformance.state
        ? `${record.placeOfPerformance.city || ''}, ${record.placeOfPerformance.state}, ${record.placeOfPerformance.country || 'USA'}`
        : 'United States',
      when: `${record.dates.performanceStart} to ${record.dates.performanceEnd}`,

      how: {
        focus: [
          'contract_value',
          'performance_period',
          'naics_classification',
          'awarding_agency',
        ],
        constraints: ['federal_data', 'public_record'],
        output_format: 'structured_award_data',
      },

      commanders_intent: `Track and analyze the ${formatCurrency(record.totalObligation)} ${record.awardTypeDescription} awarded to ${record.recipient.name} by ${record.awardingAgency.toptierName}`,

      requirements: [
        `Total obligation: ${formatCurrency(record.totalObligation)}`,
        `Base + options: ${formatCurrency(record.baseAndAllOptionsValue)}`,
        `Recipient UEI: ${record.recipient.uei || 'Not available'}`,
        `NAICS: ${record.naics.code || 'N/A'} - ${record.naics.description || 'N/A'}`,
        `PSC: ${record.psc.code || 'N/A'} - ${record.psc.description || 'N/A'}`,
      ],

      created_at: now,
      updated_at: now,

      source_dataset: 'usaspending.gov',
      source_id: record.awardId,
      source_data: {
        identifier: record.identifier,
        award_type: record.awardType,
        awarding_agency: record.awardingAgency,
        funding_agency: record.fundingAgency,
        recipient: record.recipient,
        dates: record.dates,
        naics: record.naics,
        psc: record.psc,
        amounts: {
          total_obligation: record.totalObligation,
          base_and_options: record.baseAndAllOptionsValue,
        },
      },

      provenance: {
        source_type: 'PRIMARY',
        source_authority: 'HIGH',
        source_urls: [`https://www.usaspending.gov/award/${record.awardId}`],
        extraction_method: 'api',
        verification_date: now,
      },

      freshness: {
        last_validated: now,
        valid_for_days: 7, // Federal spending data is updated weekly
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a USASpending adapter instance.
 */
export function createUSASpendingAdapter(
  config?: Partial<USASpendingConfig>
): USASpendingAdapter {
  return new USASpendingAdapter(config);
}

/**
 * Default singleton instance.
 */
export const usaSpendingAdapter = createUSASpendingAdapter();
