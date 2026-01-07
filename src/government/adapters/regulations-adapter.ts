/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * REGULATIONS.GOV API ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adapter for querying regulatory documents, dockets, and comments from
 * Regulations.gov (the federal e-rulemaking portal).
 * API Documentation: https://open.gsa.gov/api/regulationsgov/
 *
 * Key Features:
 *   - Search and retrieve documents (proposed rules, final rules, notices)
 *   - Get docket information
 *   - Access public comments
 *   - Track regulatory actions
 *
 * Rate Limit: 1000 requests per hour (with API key from api.data.gov)
 * Authentication: X-Api-Key header required
 *
 * To get an API key:
 * 1. Register at https://api.data.gov/signup/
 * 2. Use the key in requests via X-Api-Key header
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

export interface RegulationsGovConfig extends BaseAdapterConfig {
  /** Whether to use stub data when API key is not configured */
  useStubWhenUnconfigured: boolean;
}

export const DEFAULT_REGULATIONS_CONFIG: RegulationsGovConfig = {
  baseUrl: 'https://api.regulations.gov/v4',
  timeoutMs: 30000,
  rateLimit: {
    requestsPerMinute: 50, // Stay well under the 1000/hour limit
    requestsPerHour: 900,
    minDelayMs: 100,
  },
  cache: {
    ...DEFAULT_CACHE_CONFIG,
    ttlMs: 1 * 60 * 60 * 1000, // 1 hour - regulations data updates frequently
  },
  retry: DEFAULT_RETRY_CONFIG,
  apiKeyHeader: 'X-Api-Key',
  useStubWhenUnconfigured: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Document types in Regulations.gov.
 */
export type RegDocumentType =
  | 'Notice'
  | 'Rule'
  | 'Proposed Rule'
  | 'Supporting & Related Material'
  | 'Other'
  | 'Public Submission';

/**
 * Document subtype.
 */
export type RegDocumentSubtype =
  | 'Notice of Proposed Rulemaking'
  | 'Final Rule'
  | 'Interim Final Rule'
  | 'Request for Information'
  | 'Advance Notice of Proposed Rulemaking'
  | 'Extension of Comment Period'
  | 'Meeting'
  | 'Other';

/**
 * Document attributes from API.
 */
export interface RegDocumentAttributes {
  additionalRins: string[];
  agencyId: string;
  allowLateComments: boolean;
  authorDate: string | null;
  authors: string | null;
  category: string | null;
  cfrPart: string | null;
  city: string | null;
  comment: string | null;
  commentEndDate: string | null;
  commentOnDocumentId: string | null;
  commentStartDate: string | null;
  country: string | null;
  displayProperties: Array<{ name: string; label: string; tooltip: string }>;
  docAbstract: string | null;
  docketId: string;
  documentType: RegDocumentType;
  effectiveDate: string | null;
  exhibitLocation: string | null;
  exhibitType: string | null;
  field1: string | null;
  field2: string | null;
  firstName: string | null;
  frDocNum: string | null;
  frVolNum: string | null;
  govAgency: string | null;
  govAgencyType: string | null;
  highlightedContent: string | null;
  implementationDate: string | null;
  lastName: string | null;
  legacyId: string | null;
  media: string | null;
  modifyDate: string;
  objectId: string;
  openForComment: boolean;
  organization: string | null;
  originalDocumentId: string | null;
  ombApproval: string | null;
  pageCount: number | null;
  paperLength: number | null;
  postedDate: string;
  postmarkDate: string | null;
  receiveDate: string | null;
  regWriterInstruction: string | null;
  restrictReason: string | null;
  restrictReasonType: string | null;
  rin: string | null;
  sourceCitation: string | null;
  stateProvinceRegion: string | null;
  subtype: RegDocumentSubtype | null;
  subject: string | null;
  submitterRep: string | null;
  submitterRepAddress: string | null;
  submitterRepCityState: string | null;
  title: string;
  topics: string[];
  trackingNbr: string | null;
  withdrawn: boolean;
  zip: string | null;
}

/**
 * Document response from API.
 */
export interface RegDocument {
  id: string;
  type: 'documents';
  attributes: RegDocumentAttributes;
  links: {
    self: string;
  };
}

/**
 * Docket attributes from API.
 */
export interface RegDocketAttributes {
  agencyId: string;
  category: string | null;
  dkAbstract: string | null;
  docketType: 'Rulemaking' | 'Nonrulemaking';
  effectiveDate: string | null;
  field1: string | null;
  field2: string | null;
  genericId: string | null;
  highlightedContent: string | null;
  keywords: string | null;
  legacyId: string | null;
  modifyDate: string;
  objectId: string;
  organization: string | null;
  petitionNbr: string | null;
  program: string | null;
  rin: string | null;
  shortTitle: string | null;
  subtype: string | null;
  subtype2: string | null;
  title: string;
}

/**
 * Docket response from API.
 */
export interface RegDocket {
  id: string;
  type: 'dockets';
  attributes: RegDocketAttributes;
  links: {
    self: string;
  };
}

/**
 * Search response from API.
 */
interface RegSearchResponse<T> {
  data: T[];
  meta: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    numberOfElements: number;
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
    firstPage: boolean;
    lastPage: boolean;
  };
}

/**
 * Normalized document record.
 */
export interface RegulationsDocumentRecord {
  /** Document ID */
  documentId: string;
  /** Document title */
  title: string;
  /** Document type */
  documentType: RegDocumentType;
  /** Document subtype */
  subtype: RegDocumentSubtype | null;
  /** Abstract/summary */
  abstract: string | null;
  /** Docket ID */
  docketId: string;
  /** Agency ID */
  agencyId: string;
  /** Federal Register document number */
  frDocNum: string | null;
  /** RIN (Regulation Identifier Number) */
  rin: string | null;
  /** Additional RINs */
  additionalRins: string[];
  /** CFR Part affected */
  cfrPart: string | null;
  /** Posted date */
  postedDate: string;
  /** Comment period */
  commentPeriod: {
    startDate: string | null;
    endDate: string | null;
    isOpen: boolean;
    allowsLateComments: boolean;
  };
  /** Effective date */
  effectiveDate: string | null;
  /** Topics */
  topics: string[];
  /** Whether document is withdrawn */
  withdrawn: boolean;
  /** Page count */
  pageCount: number | null;
  /** Last modified */
  modifyDate: string;
  /** API URL */
  apiUrl: string;
  /** When this record was fetched */
  fetchedAt: string;
  /** Whether this is stub data */
  isStub: boolean;
}

/**
 * Normalized docket record.
 */
export interface RegulationsDocketRecord {
  /** Docket ID */
  docketId: string;
  /** Title */
  title: string;
  /** Short title */
  shortTitle: string | null;
  /** Agency ID */
  agencyId: string;
  /** Docket type */
  docketType: 'Rulemaking' | 'Nonrulemaking';
  /** Abstract */
  abstract: string | null;
  /** RIN */
  rin: string | null;
  /** Keywords */
  keywords: string | null;
  /** Category */
  category: string | null;
  /** Program */
  program: string | null;
  /** Effective date */
  effectiveDate: string | null;
  /** Last modified */
  modifyDate: string;
  /** API URL */
  apiUrl: string;
  /** When this record was fetched */
  fetchedAt: string;
  /** Whether this is stub data */
  isStub: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search conditions for documents.
 */
export interface RegDocumentSearchConditions {
  /** Full-text search term */
  searchTerm?: string;
  /** Agency IDs */
  agencyIds?: string[];
  /** Document types */
  documentTypes?: RegDocumentType[];
  /** Docket ID */
  docketId?: string;
  /** Only documents open for comment */
  openForComment?: boolean;
  /** Posted date range */
  postedDate?: {
    gte?: string;
    lte?: string;
  };
  /** Comment end date range */
  commentEndDate?: {
    gte?: string;
    lte?: string;
  };
  /** Last modified date range */
  lastModifiedDate?: {
    gte?: string;
    lte?: string;
  };
  /** Sort by field */
  sortBy?: 'commentEndDate' | 'postedDate' | 'lastModifiedDate' | 'title';
  /** Sort order */
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Search conditions for dockets.
 */
export interface RegDocketSearchConditions {
  /** Full-text search term */
  searchTerm?: string;
  /** Agency IDs */
  agencyIds?: string[];
  /** Docket type */
  docketType?: 'Rulemaking' | 'Nonrulemaking';
  /** Last modified date range */
  lastModifiedDate?: {
    gte?: string;
    lte?: string;
  };
  /** Sort by field */
  sortBy?: 'lastModifiedDate' | 'title' | 'docketId';
  /** Sort order */
  sortOrder?: 'ASC' | 'DESC';
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATIONS.GOV ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter for Regulations.gov federal regulatory data.
 */
export class RegulationsGovAdapter extends BaseGovernmentAdapter<
  RegulationsGovConfig,
  RegulationsDocumentRecord
> {
  private isConfigured: boolean = false;

  constructor(config?: Partial<RegulationsGovConfig>) {
    super({ ...DEFAULT_REGULATIONS_CONFIG, ...config });
    this.isConfigured = !!this.config.apiKey;
  }

  protected getAdapterName(): string {
    return 'RegulationsGov';
  }

  protected getCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return `regs:${Buffer.from(normalized).toString('base64').slice(0, 32)}`;
  }

  protected parseResponse(data: unknown): RegulationsDocumentRecord {
    const doc = data as RegDocument;
    return this.normalizeDocument(doc);
  }

  /**
   * Check if the adapter is configured with an API key.
   */
  public isApiConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Configure the API key.
   */
  public setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.isConfigured = true;
  }

  /**
   * Look up a specific document by ID.
   * Returns Result<LookupResult<RegulationsDocumentRecord>> for type-safe error handling.
   */
  public async lookup(params: { documentId: string }): Promise<Result<LookupResult<RegulationsDocumentRecord>>> {
    const startTime = Date.now();
    const { documentId } = params;

    if (!documentId) {
      return failure('VALIDATION_ERROR', 'Document ID is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const cacheKey = this.getCacheKey({ documentId });

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
            source: 'regulations.gov',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: true }
        );
      }

      // If not configured, return stub data
      if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
        const stubData = this.createStubDocument(documentId);
        this.cache.set(cacheKey, stubData);

        return success(
          {
            success: true,
            data: stubData,
            fromCache: false,
            timestamp: new Date().toISOString(),
            source: 'regulations.gov (STUB)',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: false }
        );
      }

      if (!this.isConfigured) {
        return failure('AUTH_FAILED', 'Regulations.gov API key not configured. Register at https://api.data.gov/signup/', {
          metadata: { executionTimeMs: Date.now() - startTime },
        });
      }

      // Fetch from API
      const doc = await this.getDocumentById(documentId);

      return success(
        {
          success: true,
          data: doc,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'regulations.gov',
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: false }
      );
    } catch (error) {
      return fromError(error, 'ADAPTER_ERROR');
    }
  }

  /**
   * Batch lookup multiple documents.
   */
  public async lookupBatch(
    paramsList: Array<{ documentId: string }>
  ): Promise<BatchLookupResult<RegulationsDocumentRecord>> {
    const results = new Map<string, RegulationsDocumentRecord>();
    const errors = new Map<string, string>();
    let partialCache = false;

    for (const params of paramsList) {
      const result = await this.lookup(params);
      if (result.success && result.data.data) {
        results.set(params.documentId, result.data.data);
        if (result.data.fromCache) {
          partialCache = true;
        }
      } else if (!result.success) {
        errors.set(params.documentId, result.error.message || 'Unknown error');
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
   * Search for documents matching the given criteria.
   */
  public async searchDocuments(options: {
    conditions?: RegDocumentSearchConditions;
    page?: number;
    perPage?: number;
  }): Promise<{
    documents: RegulationsDocumentRecord[];
    total: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const { conditions = {}, page = 1, perPage = 25 } = options;

    // If not configured, return stub results
    if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
      this.logger.warn('API key not configured, returning stub data');
      const stubDocs = this.createStubSearchResults(conditions, perPage);
      return {
        documents: stubDocs,
        total: stubDocs.length,
        totalPages: 1,
        hasMore: false,
      };
    }

    if (!this.isConfigured) {
      throw new AdapterError(
        'Regulations.gov API key not configured',
        'AUTH_FAILED'
      );
    }

    const params = this.buildDocumentSearchParams(conditions, page, perPage);
    const cacheKey = this.getCacheKey({ type: 'search', ...params });

    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.makeRequest<RegSearchResponse<RegDocument>>(
        `/documents?${queryString}`,
        { method: 'GET', cacheKey }
      );

      const documents = response.data.map((doc) => this.normalizeDocument(doc));

      return {
        documents,
        total: response.meta.totalElements,
        totalPages: response.meta.totalPages,
        hasMore: response.meta.hasNextPage,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to search documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Get documents currently open for comment.
   */
  public async getOpenForComment(options?: {
    agencyIds?: string[];
    page?: number;
    perPage?: number;
  }): Promise<{
    documents: RegulationsDocumentRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const result = await this.searchDocuments({
      conditions: {
        openForComment: true,
        agencyIds: options?.agencyIds,
        sortBy: 'commentEndDate',
        sortOrder: 'ASC',
      },
      page: options?.page,
      perPage: options?.perPage,
    });

    return {
      documents: result.documents,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get documents with comments closing soon.
   */
  public async getClosingSoon(options?: {
    daysAhead?: number;
    agencyIds?: string[];
    page?: number;
    perPage?: number;
  }): Promise<{
    documents: RegulationsDocumentRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + (options?.daysAhead || 7));

    const result = await this.searchDocuments({
      conditions: {
        openForComment: true,
        agencyIds: options?.agencyIds,
        commentEndDate: {
          gte: today.toISOString().split('T')[0],
          lte: futureDate.toISOString().split('T')[0],
        },
        sortBy: 'commentEndDate',
        sortOrder: 'ASC',
      },
      page: options?.page,
      perPage: options?.perPage,
    });

    return {
      documents: result.documents,
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Look up a docket by ID.
   * Returns Result<LookupResult<RegulationsDocketRecord>> for type-safe error handling.
   */
  public async lookupDocket(docketId: string): Promise<Result<LookupResult<RegulationsDocketRecord>>> {
    const startTime = Date.now();

    if (!docketId) {
      return failure('VALIDATION_ERROR', 'Docket ID is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const cacheKey = this.getCacheKey({ type: 'docket', docketId });

    try {
      // Check cache first
      const cached = this.cache.get(cacheKey) as RegulationsDocketRecord | null;
      if (cached) {
        return success(
          {
            success: true,
            data: cached,
            fromCache: true,
            timestamp: new Date().toISOString(),
            source: 'regulations.gov',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: true }
        );
      }

      // If not configured, return stub data
      if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
        const stubData = this.createStubDocket(docketId);
        return success(
          {
            success: true,
            data: stubData,
            fromCache: false,
            timestamp: new Date().toISOString(),
            source: 'regulations.gov (STUB)',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: false }
        );
      }

      if (!this.isConfigured) {
        return failure('AUTH_FAILED', 'Regulations.gov API key not configured', {
          metadata: { executionTimeMs: Date.now() - startTime },
        });
      }

      const docket = await this.getDocketById(docketId);

      return success(
        {
          success: true,
          data: docket,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'regulations.gov',
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: false }
      );
    } catch (error) {
      return fromError(error, 'ADAPTER_ERROR');
    }
  }

  /**
   * Search for dockets matching the given criteria.
   */
  public async searchDockets(options: {
    conditions?: RegDocketSearchConditions;
    page?: number;
    perPage?: number;
  }): Promise<{
    dockets: RegulationsDocketRecord[];
    total: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const { conditions = {}, page = 1, perPage = 25 } = options;

    // If not configured, return stub results
    if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
      this.logger.warn('API key not configured, returning stub data');
      return {
        dockets: [this.createStubDocket('STUB-0001')],
        total: 1,
        totalPages: 1,
        hasMore: false,
      };
    }

    if (!this.isConfigured) {
      throw new AdapterError(
        'Regulations.gov API key not configured',
        'AUTH_FAILED'
      );
    }

    const params = this.buildDocketSearchParams(conditions, page, perPage);
    const cacheKey = this.getCacheKey({ type: 'docket_search', ...params });

    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.makeRequest<RegSearchResponse<RegDocket>>(
        `/dockets?${queryString}`,
        { method: 'GET', cacheKey }
      );

      const dockets = response.data.map((docket) => this.normalizeDocket(docket));

      return {
        dockets,
        total: response.meta.totalElements,
        totalPages: response.meta.totalPages,
        hasMore: response.meta.hasNextPage,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to search dockets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Get document by ID from API.
   */
  private async getDocumentById(documentId: string): Promise<RegulationsDocumentRecord> {
    const cacheKey = this.getCacheKey({ type: 'document', documentId });

    try {
      const response = await this.makeRequest<{ data: RegDocument }>(
        `/documents/${encodeURIComponent(documentId)}`,
        { method: 'GET', cacheKey }
      );

      return this.normalizeDocument(response.data);
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'NOT_FOUND') {
        throw new AdapterError(`Document not found: ${documentId}`, 'NOT_FOUND', 404);
      }
      throw error;
    }
  }

  /**
   * Get docket by ID from API.
   */
  private async getDocketById(docketId: string): Promise<RegulationsDocketRecord> {
    const cacheKey = this.getCacheKey({ type: 'docket', docketId });

    try {
      const response = await this.makeRequest<{ data: RegDocket }>(
        `/dockets/${encodeURIComponent(docketId)}`,
        { method: 'GET', cacheKey }
      );

      return this.normalizeDocket(response.data);
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'NOT_FOUND') {
        throw new AdapterError(`Docket not found: ${docketId}`, 'NOT_FOUND', 404);
      }
      throw error;
    }
  }

  /**
   * Build search parameters for documents.
   */
  private buildDocumentSearchParams(
    conditions: RegDocumentSearchConditions,
    page: number,
    perPage: number
  ): Record<string, string> {
    const params: Record<string, string> = {
      'page[number]': String(page),
      'page[size]': String(perPage),
    };

    if (conditions.searchTerm) {
      params['filter[searchTerm]'] = conditions.searchTerm;
    }

    if (conditions.agencyIds?.length) {
      params['filter[agencyId]'] = conditions.agencyIds.join(',');
    }

    if (conditions.documentTypes?.length) {
      params['filter[documentType]'] = conditions.documentTypes.join(',');
    }

    if (conditions.docketId) {
      params['filter[docketId]'] = conditions.docketId;
    }

    if (conditions.openForComment !== undefined) {
      params['filter[commentEndDate][ge]'] = new Date().toISOString().split('T')[0];
    }

    if (conditions.postedDate) {
      if (conditions.postedDate.gte) {
        params['filter[postedDate][ge]'] = conditions.postedDate.gte;
      }
      if (conditions.postedDate.lte) {
        params['filter[postedDate][le]'] = conditions.postedDate.lte;
      }
    }

    if (conditions.commentEndDate) {
      if (conditions.commentEndDate.gte) {
        params['filter[commentEndDate][ge]'] = conditions.commentEndDate.gte;
      }
      if (conditions.commentEndDate.lte) {
        params['filter[commentEndDate][le]'] = conditions.commentEndDate.lte;
      }
    }

    if (conditions.lastModifiedDate) {
      if (conditions.lastModifiedDate.gte) {
        params['filter[lastModifiedDate][ge]'] = conditions.lastModifiedDate.gte;
      }
      if (conditions.lastModifiedDate.lte) {
        params['filter[lastModifiedDate][le]'] = conditions.lastModifiedDate.lte;
      }
    }

    if (conditions.sortBy) {
      const sortField = conditions.sortBy;
      const sortOrder = conditions.sortOrder || 'DESC';
      params['sort'] = sortOrder === 'DESC' ? `-${sortField}` : sortField;
    }

    return params;
  }

  /**
   * Build search parameters for dockets.
   */
  private buildDocketSearchParams(
    conditions: RegDocketSearchConditions,
    page: number,
    perPage: number
  ): Record<string, string> {
    const params: Record<string, string> = {
      'page[number]': String(page),
      'page[size]': String(perPage),
    };

    if (conditions.searchTerm) {
      params['filter[searchTerm]'] = conditions.searchTerm;
    }

    if (conditions.agencyIds?.length) {
      params['filter[agencyId]'] = conditions.agencyIds.join(',');
    }

    if (conditions.docketType) {
      params['filter[docketType]'] = conditions.docketType;
    }

    if (conditions.lastModifiedDate) {
      if (conditions.lastModifiedDate.gte) {
        params['filter[lastModifiedDate][ge]'] = conditions.lastModifiedDate.gte;
      }
      if (conditions.lastModifiedDate.lte) {
        params['filter[lastModifiedDate][le]'] = conditions.lastModifiedDate.lte;
      }
    }

    if (conditions.sortBy) {
      const sortField = conditions.sortBy;
      const sortOrder = conditions.sortOrder || 'DESC';
      params['sort'] = sortOrder === 'DESC' ? `-${sortField}` : sortField;
    }

    return params;
  }

  /**
   * Normalize a document from API response.
   */
  private normalizeDocument(doc: RegDocument): RegulationsDocumentRecord {
    const attrs = doc.attributes;

    return {
      documentId: doc.id,
      title: attrs.title,
      documentType: attrs.documentType,
      subtype: attrs.subtype,
      abstract: attrs.docAbstract,
      docketId: attrs.docketId,
      agencyId: attrs.agencyId,
      frDocNum: attrs.frDocNum,
      rin: attrs.rin,
      additionalRins: attrs.additionalRins || [],
      cfrPart: attrs.cfrPart,
      postedDate: attrs.postedDate,
      commentPeriod: {
        startDate: attrs.commentStartDate,
        endDate: attrs.commentEndDate,
        isOpen: attrs.openForComment,
        allowsLateComments: attrs.allowLateComments,
      },
      effectiveDate: attrs.effectiveDate,
      topics: attrs.topics || [],
      withdrawn: attrs.withdrawn,
      pageCount: attrs.pageCount,
      modifyDate: attrs.modifyDate,
      apiUrl: doc.links.self,
      fetchedAt: new Date().toISOString(),
      isStub: false,
    };
  }

  /**
   * Normalize a docket from API response.
   */
  private normalizeDocket(docket: RegDocket): RegulationsDocketRecord {
    const attrs = docket.attributes;

    return {
      docketId: docket.id,
      title: attrs.title,
      shortTitle: attrs.shortTitle,
      agencyId: attrs.agencyId,
      docketType: attrs.docketType,
      abstract: attrs.dkAbstract,
      rin: attrs.rin,
      keywords: attrs.keywords,
      category: attrs.category,
      program: attrs.program,
      effectiveDate: attrs.effectiveDate,
      modifyDate: attrs.modifyDate,
      apiUrl: docket.links.self,
      fetchedAt: new Date().toISOString(),
      isStub: false,
    };
  }

  /**
   * Create a stub document for unconfigured usage.
   */
  private createStubDocument(documentId: string): RegulationsDocumentRecord {
    const now = new Date().toISOString();
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return {
      documentId,
      title: `[STUB] Document ${documentId}`,
      documentType: 'Proposed Rule',
      subtype: 'Notice of Proposed Rulemaking',
      abstract: 'This is stub data. Configure an API key to fetch real data.',
      docketId: 'STUB-DOCKET-001',
      agencyId: 'STUB',
      frDocNum: null,
      rin: '0000-AA00',
      additionalRins: [],
      cfrPart: null,
      postedDate: now,
      commentPeriod: {
        startDate: now,
        endDate: futureDate,
        isOpen: true,
        allowsLateComments: false,
      },
      effectiveDate: null,
      topics: ['Stub Topic'],
      withdrawn: false,
      pageCount: 1,
      modifyDate: now,
      apiUrl: `https://api.regulations.gov/v4/documents/${documentId}`,
      fetchedAt: now,
      isStub: true,
    };
  }

  /**
   * Create stub search results.
   */
  private createStubSearchResults(
    conditions: RegDocumentSearchConditions,
    limit: number
  ): RegulationsDocumentRecord[] {
    const count = Math.min(limit, Math.floor(Math.random() * 3) + 1);
    const results: RegulationsDocumentRecord[] = [];

    for (let i = 0; i < count; i++) {
      const docId = `STUB-${Date.now()}-${i}`;
      const doc = this.createStubDocument(docId);

      if (conditions.searchTerm) {
        doc.title = `[STUB] ${conditions.searchTerm} Document ${i + 1}`;
      }
      if (conditions.agencyIds?.length) {
        doc.agencyId = conditions.agencyIds[0];
      }

      results.push(doc);
    }

    return results;
  }

  /**
   * Create a stub docket.
   */
  private createStubDocket(docketId: string): RegulationsDocketRecord {
    const now = new Date().toISOString();

    return {
      docketId,
      title: `[STUB] Docket ${docketId}`,
      shortTitle: `STUB ${docketId}`,
      agencyId: 'STUB',
      docketType: 'Rulemaking',
      abstract: 'This is stub data. Configure an API key to fetch real data.',
      rin: '0000-AA00',
      keywords: 'stub, test',
      category: 'Stub Category',
      program: null,
      effectiveDate: null,
      modifyDate: now,
      apiUrl: `https://api.regulations.gov/v4/dockets/${docketId}`,
      fetchedAt: now,
      isStub: true,
    };
  }

  /**
   * Convert a document record to a PromptSpeak symbol.
   */
  public toSymbol(record: RegulationsDocumentRecord): DirectiveSymbol {
    const symbolId = `\u039E.RG.REGS.${record.documentId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    const now = new Date().toISOString();

    let category: SymbolCategory = 'REGULATORY';
    let subcategory: string = record.documentType;

    // Determine if this is a regulatory event (open for comment)
    if (record.commentPeriod.isOpen) {
      category = 'REGULATORY_EVENT';
      subcategory = 'COMMENT_PERIOD';
    }

    return {
      symbolId,
      version: 1,
      hash: Buffer.from(record.documentId).toString('base64').slice(0, 16),
      category,
      subcategory,
      tags: [
        'regulations.gov',
        record.documentType.toLowerCase().replace(/\s+/g, '_'),
        record.agencyId.toLowerCase(),
        ...(record.commentPeriod.isOpen ? ['open_for_comment'] : []),
        ...(record.isStub ? ['stub'] : []),
      ],

      who: `Federal agency: ${record.agencyId}`,
      what: record.title,
      why: record.abstract || `Track regulatory action: ${record.documentType}`,
      where: `Federal Register / Regulations.gov - Docket ${record.docketId}`,
      when: `Posted: ${record.postedDate}${
        record.commentPeriod.endDate
          ? `, Comments due: ${record.commentPeriod.endDate}`
          : ''
      }${record.effectiveDate ? `, Effective: ${record.effectiveDate}` : ''}`,

      how: {
        focus: [
          'regulatory_content',
          'comment_period',
          'affected_parties',
          'cfr_references',
        ],
        constraints: ['federal_regulation', 'administrative_procedure'],
        output_format: 'regulatory_analysis',
      },

      commanders_intent: `Track the ${record.documentType} "${record.title}" from ${record.agencyId}${
        record.commentPeriod.isOpen
          ? ` - comments due ${record.commentPeriod.endDate}`
          : ''
      }`,

      requirements: [
        `Document ID: ${record.documentId}`,
        `Docket ID: ${record.docketId}`,
        `Agency: ${record.agencyId}`,
        `Type: ${record.documentType}${record.subtype ? ` (${record.subtype})` : ''}`,
        ...(record.rin ? [`RIN: ${record.rin}`] : []),
        ...(record.frDocNum ? [`FR Doc: ${record.frDocNum}`] : []),
        ...(record.cfrPart ? [`CFR Part: ${record.cfrPart}`] : []),
        ...(record.commentPeriod.isOpen
          ? [`Comment Period: ${record.commentPeriod.startDate} to ${record.commentPeriod.endDate}`]
          : []),
      ],

      created_at: now,
      updated_at: now,

      source_dataset: 'regulations.gov',
      source_id: record.documentId,
      source_data: {
        document_id: record.documentId,
        docket_id: record.docketId,
        document_type: record.documentType,
        subtype: record.subtype,
        agency_id: record.agencyId,
        rin: record.rin,
        comment_period: record.commentPeriod,
        effective_date: record.effectiveDate,
        topics: record.topics,
        is_stub: record.isStub,
      },

      regulatory: {
        filing_type: record.documentType,
        regulator: record.agencyId,
        filing: {
          accession_number: record.documentId,
          file_number: record.rin || undefined,
          filed_date: record.postedDate,
        },
        compliance: record.commentPeriod.isOpen
          ? {
              status: 'PENDING',
              deadline: record.commentPeriod.endDate || undefined,
              requirements: ['Submit comments through regulations.gov'],
            }
          : undefined,
      },

      provenance: {
        source_type: record.isStub ? 'SYNTHETIC' : 'PRIMARY',
        source_authority: record.isStub ? 'LOW' : 'HIGH',
        source_urls: [
          `https://www.regulations.gov/document/${record.documentId}`,
        ],
        extraction_method: 'api',
        verification_date: now,
      },

      freshness: {
        last_validated: now,
        valid_for_days: record.isStub ? 1 : 1, // Regulations data should be checked daily
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Regulations.gov adapter instance.
 */
export function createRegulationsGovAdapter(
  config?: Partial<RegulationsGovConfig>
): RegulationsGovAdapter {
  return new RegulationsGovAdapter(config);
}

/**
 * Default singleton instance.
 */
export const regulationsGovAdapter = createRegulationsGovAdapter();
