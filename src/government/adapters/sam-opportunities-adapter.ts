/**
 * SAM.gov Opportunities API Adapter
 *
 * Searches for federal contract opportunities including RFIs, RFPs,
 * Sources Sought, and other notice types on SAM.gov.
 *
 * API Documentation: https://open.gsa.gov/api/get-opportunities-public-api/
 * Base URL: https://api.sam.gov/opportunities/v2/
 * Auth: API key required (X-Api-Key header) - get from sam.gov profile
 */

import {
  BaseGovernmentAdapter,
  type BaseAdapterConfig,
  type LookupResult,
  type BatchLookupResult,
  type AdapterStats,
  type RateLimitConfig,
  type CacheConfig,
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
  type Result,
  success,
  failure,
  fromError,
} from './base-adapter.js';
import type { DirectiveSymbol } from '../../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SAM.gov Opportunity Notice Types
 */
export type NoticeType =
  | 'p'   // Presolicitation
  | 'r'   // Sources Sought / RFI
  | 'o'   // Solicitation
  | 'k'   // Combined Synopsis/Solicitation
  | 'i'   // Intent to Bundle
  | 's'   // Special Notice
  | 'g'   // Sale of Surplus Property
  | 'a'   // Award Notice
  | 'u'   // Justification and Approval (J&A)
  | 'j';  // Fair Opportunity / Limited Sources Justification

/**
 * Set-aside types for small business programs
 */
export type SetAsideType =
  | 'SBA'      // Total Small Business Set-Aside
  | 'SBP'      // Partial Small Business Set-Aside
  | '8A'       // 8(a) Set-Aside
  | '8AN'      // 8(a) Sole Source
  | 'HZC'      // HUBZone Set-Aside
  | 'HZS'      // HUBZone Sole Source
  | 'SDVOSBC'  // Service-Disabled Veteran-Owned Small Business Set-Aside
  | 'SDVOSBS'  // Service-Disabled Veteran-Owned Small Business Sole Source
  | 'WOSB'     // Women-Owned Small Business
  | 'WOSBSS'   // Women-Owned Small Business Sole Source
  | 'EDWOSB'   // Economically Disadvantaged Women-Owned Small Business
  | 'EDWOSBSS' // EDWOSB Sole Source
  | 'LAS'      // Local Area Set-Aside
  | 'IEE'      // Indian Economic Enterprise
  | 'ISBEE'    // Indian Small Business Economic Enterprise
  | 'BICiv'    // Buy Indian Set-Aside (Civilian)
  | 'VSA'      // Veteran-Owned Small Business Set-Aside
  | 'VSS';     // Veteran-Owned Small Business Sole Source

/**
 * Opportunity record from SAM.gov
 */
export interface SAMOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  department?: string;
  subTier?: string;
  office?: string;
  postedDate: string;
  type: string;
  typeOfSetAsideDescription?: string;
  typeOfSetAside?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  active: string;
  description?: string;
  organizationType?: string;
  uiLink: string;

  // Additional fields from full record
  award?: {
    date?: string;
    number?: string;
    amount?: string;
    awardee?: {
      name?: string;
      location?: {
        city?: string;
        state?: string;
        country?: string;
      };
      ueiSAM?: string;
    };
  };

  pointOfContact?: Array<{
    type?: string;
    fullName?: string;
    title?: string;
    email?: string;
    phone?: string;
    fax?: string;
  }>;

  placeOfPerformance?: {
    streetAddress?: string;
    city?: {
      code?: string;
      name?: string;
    };
    state?: {
      code?: string;
      name?: string;
    };
    country?: {
      code?: string;
      name?: string;
    };
    zip?: string;
  };

  officeAddress?: {
    city?: string;
    state?: string;
    zipcode?: string;
  };

  archiveType?: string;
  archiveDate?: string;
  additionalInfoLink?: string;
  links?: Array<{
    rel?: string;
    href?: string;
  }>;
}

/**
 * Search parameters for opportunities
 */
export interface OpportunitySearchParams {
  /** Free text keyword search */
  keywords?: string[];
  /** Notice types to include */
  noticeTypes?: NoticeType[];
  /** Set-aside types (SDVOSBC, 8A, etc.) */
  setAsideTypes?: SetAsideType[];
  /** NAICS codes */
  naicsCodes?: string[];
  /** PSC (Product Service Codes) */
  pscCodes?: string[];
  /** Awarding agency */
  agencies?: string[];
  /** Posted date range start (MM/DD/YYYY) */
  postedFrom?: string;
  /** Posted date range end (MM/DD/YYYY) */
  postedTo?: string;
  /** Response deadline range start (MM/DD/YYYY) */
  responseDeadlineFrom?: string;
  /** Response deadline range end (MM/DD/YYYY) */
  responseDeadlineTo?: string;
  /** Only active opportunities */
  activeOnly?: boolean;
  /** Pagination limit (max 1000) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Sort field */
  sortBy?: 'postedDate' | 'responseDeadLine' | 'relevance';
  /** Sort order */
  orderBy?: 'asc' | 'desc';
}

/**
 * Search response from SAM.gov
 */
export interface OpportunitySearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SAMOpportunity[];
}

/**
 * Adapter configuration
 */
export interface SAMOpportunitiesConfig extends BaseAdapterConfig {
  /** API key for SAM.gov */
  apiKey?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 10, // Conservative - SAM.gov can be slow
  requestsPerHour: 500,
  requestsPerDay: 5000,
  minDelayMs: 1000,
};

const OPPORTUNITIES_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlMs: 15 * 60 * 1000, // 15 minutes (opportunities change frequently)
  maxSize: 500,
};

export const DEFAULT_SAM_OPPORTUNITIES_CONFIG: SAMOpportunitiesConfig = {
  baseUrl: 'https://api.sam.gov/opportunities/v2',
  timeoutMs: 30000,
  rateLimit: DEFAULT_RATE_LIMIT,
  cache: OPPORTUNITIES_CACHE_CONFIG,
  retry: DEFAULT_RETRY_CONFIG,
  apiKeyHeader: 'X-Api-Key',
};

/**
 * Notice type human-readable names
 */
const NOTICE_TYPE_NAMES: Record<NoticeType, string> = {
  'p': 'Presolicitation',
  'r': 'Sources Sought / RFI',
  'o': 'Solicitation',
  'k': 'Combined Synopsis/Solicitation',
  'i': 'Intent to Bundle',
  's': 'Special Notice',
  'g': 'Sale of Surplus Property',
  'a': 'Award Notice',
  'u': 'Justification and Approval',
  'j': 'Fair Opportunity / Limited Sources',
};

/**
 * Set-aside type human-readable names
 */
const SET_ASIDE_NAMES: Record<SetAsideType, string> = {
  'SBA': 'Total Small Business',
  'SBP': 'Partial Small Business',
  '8A': '8(a)',
  '8AN': '8(a) Sole Source',
  'HZC': 'HUBZone',
  'HZS': 'HUBZone Sole Source',
  'SDVOSBC': 'Service-Disabled Veteran-Owned Small Business',
  'SDVOSBS': 'SDVOSB Sole Source',
  'WOSB': 'Women-Owned Small Business',
  'WOSBSS': 'WOSB Sole Source',
  'EDWOSB': 'Economically Disadvantaged WOSB',
  'EDWOSBSS': 'EDWOSB Sole Source',
  'LAS': 'Local Area Set-Aside',
  'IEE': 'Indian Economic Enterprise',
  'ISBEE': 'Indian Small Business Economic Enterprise',
  'BICiv': 'Buy Indian (Civilian)',
  'VSA': 'Veteran-Owned Small Business',
  'VSS': 'VOSB Sole Source',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export class SAMOpportunitiesAdapter extends BaseGovernmentAdapter<
  SAMOpportunitiesConfig,
  SAMOpportunity
> {
  private stubMode: boolean = true;

  constructor(config: Partial<SAMOpportunitiesConfig> = {}) {
    const fullConfig: SAMOpportunitiesConfig = {
      ...DEFAULT_SAM_OPPORTUNITIES_CONFIG,
      ...config,
      rateLimit: { ...DEFAULT_RATE_LIMIT, ...config.rateLimit },
      cache: { ...OPPORTUNITIES_CACHE_CONFIG, ...config.cache },
      retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
    };
    super(fullConfig);

    if (fullConfig.apiKey) {
      this.setApiKey(fullConfig.apiKey);
    } else if (process.env.SAM_API_KEY) {
      this.setApiKey(process.env.SAM_API_KEY);
    }
  }

  protected getAdapterName(): string {
    return 'SAM.gov Opportunities';
  }

  protected getCacheKey(params: Record<string, unknown>): string {
    if (params.noticeId) {
      return `opp:${params.noticeId}`;
    }
    // Sort keys for deterministic cache keys (prevents cache misses from key ordering)
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return `opp:${Buffer.from(normalized).toString('base64').slice(0, 32)}`;
  }

  protected parseResponse(data: unknown): SAMOpportunity {
    return data as SAMOpportunity;
  }

  /**
   * Set the API key (enables live mode)
   */
  setApiKey(key: string): void {
    this.config.apiKey = key;
    this.stubMode = false;
    this.logger.info('API key configured - live mode enabled');
  }

  /**
   * Check if adapter is in stub mode
   */
  isStubMode(): boolean {
    return this.stubMode;
  }

  /**
   * Check if API is configured
   */
  isApiConfigured(): boolean {
    return !this.stubMode;
  }

  /**
   * Lookup a single opportunity by notice ID
   * Returns Result<LookupResult<SAMOpportunity>> for type-safe error handling.
   */
  async lookup(params: Record<string, unknown>): Promise<Result<LookupResult<SAMOpportunity>>> {
    const startTime = Date.now();
    const noticeId = params.noticeId as string;

    if (!noticeId) {
      return failure('VALIDATION_ERROR', 'noticeId is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    // Check cache
    const cacheKey = this.getCacheKey({ noticeId });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return success(
        {
          success: true,
          data: cached,
          fromCache: true,
          timestamp: new Date().toISOString(),
          source: this.config.baseUrl,
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: true }
      );
    }
    this.stats.cacheMisses++;

    if (this.stubMode) {
      const stubData = this.getStubOpportunity(noticeId);
      return success(
        {
          success: true,
          data: stubData,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'STUB',
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: false }
      );
    }

    try {
      const data = await this.makeRequest<OpportunitySearchResponse>(
        `${this.config.baseUrl}/search?noticeid=${encodeURIComponent(noticeId)}&limit=1`,
        {
          headers: {
            [this.config.apiKeyHeader || 'X-Api-Key']: this.config.apiKey!,
          },
          cacheKey,
        }
      );

      if (data.opportunitiesData && data.opportunitiesData.length > 0) {
        const opp = data.opportunitiesData[0];
        return success(
          {
            success: true,
            data: opp,
            fromCache: false,
            timestamp: new Date().toISOString(),
            source: this.config.baseUrl,
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: false }
        );
      }

      return failure('NOT_FOUND', 'Opportunity not found', {
        details: { noticeId },
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    } catch (error) {
      return fromError(error, 'ADAPTER_ERROR');
    }
  }

  /**
   * Batch lookup opportunities by notice IDs
   */
  async lookupBatch(
    paramsList: Record<string, unknown>[]
  ): Promise<BatchLookupResult<SAMOpportunity>> {
    const results = new Map<string, SAMOpportunity>();
    const errors = new Map<string, string>();
    let partialCache = false;

    for (const params of paramsList) {
      const noticeId = params.noticeId as string;
      const result = await this.lookup(params);

      if (result.success && result.data.data) {
        results.set(noticeId, result.data.data);
        if (result.data.fromCache) partialCache = true;
      } else if (!result.success) {
        errors.set(noticeId, result.error.message || 'Unknown error');
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
   * Convert opportunity to PromptSpeak symbol
   */
  toSymbol(opp: SAMOpportunity): DirectiveSymbol {
    const sanitizedId = opp.noticeId
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .substring(0, 30);

    const now = new Date().toISOString();

    return {
      // Identity
      symbolId: `Ξ.E.OPP.${sanitizedId}`,
      version: 1,
      hash: Buffer.from(opp.noticeId).toString('base64').slice(0, 16),

      // Classification
      category: 'EVENT',
      subcategory: 'OPPORTUNITY',
      tags: [
        'opportunity',
        'sam_gov',
        opp.type,
        opp.typeOfSetAside,
        opp.active === 'Yes' ? 'active' : 'inactive',
      ].filter(Boolean) as string[],

      // 5W+H Framework
      who: [opp.department, opp.subTier, opp.office].filter(Boolean).join(' > ') || 'Federal Agency',
      what: opp.title,
      why: `Federal opportunity: ${NOTICE_TYPE_NAMES[opp.type as NoticeType] || opp.type}${opp.typeOfSetAsideDescription ? ` (${opp.typeOfSetAsideDescription})` : ''}`,
      where: opp.placeOfPerformance
        ? [
            opp.placeOfPerformance.city?.name,
            opp.placeOfPerformance.state?.name,
            opp.placeOfPerformance.country?.name,
          ].filter(Boolean).join(', ') || 'See solicitation'
        : 'See solicitation',
      when: `Posted: ${opp.postedDate}${opp.responseDeadLine ? `, Response due: ${opp.responseDeadLine}` : ''}`,

      how: {
        focus: ['review_requirements', 'prepare_response', 'submit_by_deadline'],
        constraints: [
          opp.typeOfSetAside ? SET_ASIDE_NAMES[opp.typeOfSetAside as SetAsideType] || opp.typeOfSetAside : 'open_competition',
          opp.naicsCode ? `NAICS: ${opp.naicsCode}` : 'no_naics_specified',
        ].filter(Boolean) as string[],
        output_format: 'response_package',
      },

      // Commander's Intent
      commanders_intent: `Evaluate opportunity "${opp.title}" for response feasibility and prepare submission if aligned with capabilities`,

      // Requirements
      requirements: [
        opp.responseDeadLine ? `Submit response by ${opp.responseDeadLine}` : 'Check deadline in solicitation',
        'Review full solicitation documents on SAM.gov',
        opp.typeOfSetAside ? `Verify ${opp.typeOfSetAsideDescription} eligibility` : 'Review eligibility requirements',
        'Contact contracting officer with any questions',
      ],
      key_terms: [
        opp.noticeId,
        opp.solicitationNumber,
        opp.naicsCode,
        opp.classificationCode,
        opp.department,
      ].filter(Boolean) as string[],

      // Metadata
      created_at: now,
    };
  }

  /**
   * Search for opportunities
   */
  async searchOpportunities(params: OpportunitySearchParams): Promise<OpportunitySearchResponse> {
    const cacheKey = `search:${JSON.stringify(params)}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      // For search results, we stored the full response
      return (cached as unknown) as OpportunitySearchResponse;
    }
    this.stats.cacheMisses++;

    if (this.stubMode) {
      return this.getStubSearchResults(params);
    }

    try {
      // Build query string
      const queryParams = new URLSearchParams();

      if (params.keywords?.length) {
        queryParams.set('keyword', params.keywords.join(' '));
      }
      if (params.noticeTypes?.length) {
        queryParams.set('ptype', params.noticeTypes.join(','));
      }
      if (params.setAsideTypes?.length) {
        queryParams.set('typeOfSetAside', params.setAsideTypes.join(','));
      }
      if (params.naicsCodes?.length) {
        // SAM.gov uses 'ncode' not 'naics' for NAICS filtering
        queryParams.set('ncode', params.naicsCodes.join(','));
      }
      if (params.pscCodes?.length) {
        queryParams.set('psc', params.pscCodes.join(','));
      }
      if (params.postedFrom) {
        queryParams.set('postedFrom', params.postedFrom);
      }
      if (params.postedTo) {
        queryParams.set('postedTo', params.postedTo);
      }
      if (params.responseDeadlineFrom) {
        queryParams.set('rdlfrom', params.responseDeadlineFrom);
      }
      if (params.responseDeadlineTo) {
        queryParams.set('rdlto', params.responseDeadlineTo);
      }
      if (params.activeOnly !== false) {
        queryParams.set('status', 'active');
      }

      queryParams.set('limit', String(params.limit || 100));
      queryParams.set('offset', String(params.offset || 0));

      if (params.sortBy) {
        queryParams.set('sortBy', params.sortBy);
      }
      if (params.orderBy) {
        queryParams.set('orderBy', params.orderBy);
      }

      const url = `${this.config.baseUrl}/search?${queryParams.toString()}`;

      const data = await this.makeRequest<OpportunitySearchResponse>(url, {
        headers: {
          [this.config.apiKeyHeader || 'X-Api-Key']: this.config.apiKey!,
        },
      });

      // Cache the full response (use a dummy record for the cache type)
      this.cache.set(cacheKey, data as unknown as SAMOpportunity);

      return data;
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  /**
   * Search specifically for RFIs (Sources Sought)
   */
  async searchRFIs(params: Omit<OpportunitySearchParams, 'noticeTypes'>): Promise<OpportunitySearchResponse> {
    return this.searchOpportunities({
      ...params,
      noticeTypes: ['r'], // 'r' = Sources Sought / RFI
    });
  }

  /**
   * Search for SDVOSB set-aside opportunities
   */
  async searchSDVOSBOpportunities(params: Omit<OpportunitySearchParams, 'setAsideTypes'>): Promise<OpportunitySearchResponse> {
    return this.searchOpportunities({
      ...params,
      setAsideTypes: ['SDVOSBC', 'SDVOSBS'],
    });
  }

  /**
   * Search for opportunities by agency keywords
   */
  async searchByAgency(
    agencyKeywords: string[],
    additionalParams?: Partial<OpportunitySearchParams>
  ): Promise<OpportunitySearchResponse> {
    const existingKeywords = additionalParams?.keywords || [];
    return this.searchOpportunities({
      ...additionalParams,
      keywords: [...existingKeywords, ...agencyKeywords],
    });
  }

  /**
   * Find opportunities closing soon
   */
  async findClosingSoon(daysAhead: number = 7): Promise<OpportunitySearchResponse> {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.searchOpportunities({
      responseDeadlineFrom: this.formatDate(today),
      responseDeadlineTo: this.formatDate(futureDate),
      activeOnly: true,
      sortBy: 'responseDeadLine',
      orderBy: 'asc',
    });
  }

  /**
   * Get notice type human-readable name
   */
  getNoticeTypeName(type: NoticeType): string {
    return NOTICE_TYPE_NAMES[type] || type;
  }

  /**
   * Get set-aside type human-readable name
   */
  getSetAsideName(type: SetAsideType): string {
    return SET_ASIDE_NAMES[type] || type;
  }

  /**
   * Get adapter statistics
   */
  getStats(): AdapterStats {
    return { ...this.stats };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STUB DATA (when API key not configured)
  // ═══════════════════════════════════════════════════════════════════════════

  private getStubOpportunity(noticeId: string): SAMOpportunity {
    this.logger.warn(`STUB MODE: Returning mock data for ${noticeId}. Configure SAM_API_KEY for live data.`);

    return {
      noticeId,
      title: `[STUB] Sample Opportunity ${noticeId}`,
      solicitationNumber: `SOL-${noticeId}`,
      department: 'Department of Defense',
      subTier: 'Defense Advanced Research Projects Agency',
      office: 'Contracts Management Office',
      postedDate: '01/01/2026',
      type: 'r',
      typeOfSetAsideDescription: 'Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside',
      typeOfSetAside: 'SDVOSBC',
      responseDeadLine: '02/01/2026',
      naicsCode: '541512',
      active: 'Yes',
      description: '[STUB DATA] This is mock data. Configure SAM_API_KEY environment variable to get real opportunities.',
      uiLink: `https://sam.gov/opp/${noticeId}/view`,
    };
  }

  private getStubSearchResults(params: OpportunitySearchParams): OpportunitySearchResponse {
    this.logger.warn('STUB MODE: Returning mock search results. Configure SAM_API_KEY for live data.');

    const mockOpportunities: SAMOpportunity[] = [
      {
        noticeId: 'STUB-RFI-2026-001',
        title: '[STUB] AI/ML Platform Integration for Defense Applications',
        solicitationNumber: 'DARPA-RFI-AI-2026',
        department: 'Department of Defense',
        subTier: 'Defense Advanced Research Projects Agency',
        office: 'DARPA CMO',
        postedDate: '01/02/2026',
        type: 'r',
        typeOfSetAsideDescription: 'Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside',
        typeOfSetAside: 'SDVOSBC',
        responseDeadLine: '02/15/2026',
        naicsCode: '541512',
        active: 'Yes',
        description: '[STUB] RFI for AI/ML platform capabilities. This is mock data - configure SAM_API_KEY for real results.',
        uiLink: 'https://sam.gov/opp/STUB-RFI-2026-001/view',
      },
      {
        noticeId: 'STUB-RFI-2026-002',
        title: '[STUB] Natural Language Processing Solutions for Army Intelligence',
        solicitationNumber: 'W911-RFI-NLP-2026',
        department: 'Department of the Army',
        subTier: 'Army Contracting Command',
        office: 'ACC-APG',
        postedDate: '01/03/2026',
        type: 'r',
        typeOfSetAsideDescription: 'Small Business Set-Aside',
        typeOfSetAside: 'SBA',
        responseDeadLine: '02/28/2026',
        naicsCode: '541512',
        active: 'Yes',
        description: '[STUB] RFI for NLP solutions. This is mock data - configure SAM_API_KEY for real results.',
        uiLink: 'https://sam.gov/opp/STUB-RFI-2026-002/view',
      },
      {
        noticeId: 'STUB-RFI-2026-003',
        title: '[STUB] LLM-Based Decision Support Systems for USMC',
        solicitationNumber: 'M67854-RFI-LLM-2026',
        department: 'Department of the Navy',
        subTier: 'United States Marine Corps',
        office: 'MARCORSYSCOM',
        postedDate: '01/05/2026',
        type: 'r',
        typeOfSetAsideDescription: 'Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside',
        typeOfSetAside: 'SDVOSBC',
        responseDeadLine: '03/01/2026',
        naicsCode: '541512',
        active: 'Yes',
        description: '[STUB] RFI for LLM decision support. This is mock data - configure SAM_API_KEY for real results.',
        uiLink: 'https://sam.gov/opp/STUB-RFI-2026-003/view',
      },
    ];

    // Filter based on params
    let filtered = mockOpportunities;

    if (params.noticeTypes?.length) {
      filtered = filtered.filter(o => params.noticeTypes!.includes(o.type as NoticeType));
    }
    if (params.setAsideTypes?.length) {
      filtered = filtered.filter(o =>
        o.typeOfSetAside && params.setAsideTypes!.includes(o.typeOfSetAside as SetAsideType)
      );
    }
    if (params.keywords?.length) {
      const keywordLower = params.keywords.map(k => k.toLowerCase());
      filtered = filtered.filter(o =>
        keywordLower.some(kw =>
          o.title.toLowerCase().includes(kw) ||
          o.description?.toLowerCase().includes(kw)
        )
      );
    }

    return {
      totalRecords: filtered.length,
      limit: params.limit || 100,
      offset: params.offset || 0,
      opportunitiesData: filtered,
    };
  }

  private formatDate(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY AND SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let instance: SAMOpportunitiesAdapter | null = null;

/**
 * Get or create the SAM Opportunities adapter singleton
 */
export function getSAMOpportunitiesAdapter(config?: Partial<SAMOpportunitiesConfig>): SAMOpportunitiesAdapter {
  if (!instance) {
    instance = new SAMOpportunitiesAdapter(config);
  }
  return instance;
}

/**
 * Create a new SAM Opportunities adapter instance
 */
export function createSAMOpportunitiesAdapter(config?: Partial<SAMOpportunitiesConfig>): SAMOpportunitiesAdapter {
  return new SAMOpportunitiesAdapter(config);
}
