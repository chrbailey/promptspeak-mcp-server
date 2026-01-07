/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEDERAL REGISTER API ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adapter for querying Federal Register documents and agency information.
 * API Documentation: https://www.federalregister.gov/developers/documentation/api/v1
 *
 * Key Features:
 *   - Search and retrieve documents (proposed rules, final rules, notices)
 *   - Get agency information
 *   - Track regulatory actions
 *   - Monitor public inspection documents
 *
 * Rate Limit: Generous (no hard limit documented, but be respectful)
 * Authentication: None required
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

export interface FederalRegisterConfig extends BaseAdapterConfig {
  /** Default fields to include in responses */
  defaultFields?: string[];
}

export const DEFAULT_FEDERAL_REGISTER_CONFIG: FederalRegisterConfig = {
  baseUrl: 'https://www.federalregister.gov/api/v1',
  timeoutMs: 30000,
  rateLimit: {
    requestsPerMinute: 60, // Generous rate limit
    minDelayMs: 50,
  },
  cache: {
    ...DEFAULT_CACHE_CONFIG,
    ttlMs: 2 * 60 * 60 * 1000, // 2 hours - FR documents update throughout the day
  },
  retry: DEFAULT_RETRY_CONFIG,
  defaultFields: [
    'abstract',
    'action',
    'agencies',
    'agency_names',
    'body_html_url',
    'cfr_references',
    'citation',
    'comment_url',
    'comments_close_on',
    'correction_of',
    'corrections',
    'dates',
    'docket_id',
    'docket_ids',
    'document_number',
    'effective_on',
    'end_page',
    'excerpts',
    'executive_order_notes',
    'executive_order_number',
    'full_text_xml_url',
    'html_url',
    'json_url',
    'mods_url',
    'page_length',
    'pdf_url',
    'president',
    'presidential_document_number',
    'proclamation_number',
    'public_inspection_pdf_url',
    'publication_date',
    'raw_text_url',
    'regulation_id_number_info',
    'regulation_id_numbers',
    'regulations_dot_gov_info',
    'regulations_dot_gov_url',
    'significant',
    'signing_date',
    'start_page',
    'subtype',
    'title',
    'toc_doc',
    'toc_subject',
    'topics',
    'type',
    'volume',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Document types in the Federal Register.
 */
export type FRDocumentType =
  | 'RULE'           // Final rule
  | 'PRORULE'        // Proposed rule
  | 'NOTICE'         // Notice
  | 'PRESDOCU'       // Presidential document
  | 'CORRECT';       // Correction

/**
 * Agency reference in a document.
 */
export interface FRAgencyReference {
  raw_name: string;
  name: string;
  id: number;
  url: string;
  json_url: string;
  parent_id: number | null;
  slug: string;
}

/**
 * CFR reference in a document.
 */
export interface FRCfrReference {
  title: number;
  part: string;
  chapter?: string;
}

/**
 * Regulations.gov information.
 */
export interface FRRegulationsGovInfo {
  docket_id: string;
  document_id: string;
  comments_count: number;
  supporting_documents_count: number;
}

/**
 * Federal Register document from API.
 */
export interface FRDocument {
  abstract: string | null;
  action: string | null;
  agencies: FRAgencyReference[];
  agency_names: string[];
  body_html_url: string;
  cfr_references: FRCfrReference[];
  citation: string | null;
  comment_url: string | null;
  comments_close_on: string | null;
  correction_of: string | null;
  corrections: string[];
  dates: string | null;
  docket_id: string | null;
  docket_ids: string[];
  document_number: string;
  effective_on: string | null;
  end_page: number;
  excerpts: string | null;
  executive_order_notes: string | null;
  executive_order_number: string | null;
  full_text_xml_url: string;
  html_url: string;
  json_url: string;
  mods_url: string;
  page_length: number;
  pdf_url: string;
  president: { name: string; identifier: string } | null;
  presidential_document_number: string | null;
  proclamation_number: string | null;
  public_inspection_pdf_url: string | null;
  publication_date: string;
  raw_text_url: string;
  regulation_id_number_info: Record<string, { priority: string; title?: string }>;
  regulation_id_numbers: string[];
  regulations_dot_gov_info: FRRegulationsGovInfo | null;
  regulations_dot_gov_url: string | null;
  significant: boolean;
  signing_date: string | null;
  start_page: number;
  subtype: string | null;
  title: string;
  toc_doc: string | null;
  toc_subject: string | null;
  topics: string[];
  type: FRDocumentType;
  volume: number;
}

/**
 * Agency information from API.
 */
export interface FRAgency {
  id: number;
  name: string;
  short_name: string | null;
  slug: string;
  url: string;
  description: string | null;
  recent_articles_url: string;
  logo: {
    thumb_url: string;
    small_url: string;
    medium_url: string;
  } | null;
}

/**
 * Search response from Federal Register API.
 */
interface FRSearchResponse {
  count: number;
  description: string;
  total_pages: number;
  next_page_url: string | null;
  previous_page_url: string | null;
  results: FRDocument[];
}

/**
 * Normalized Federal Register document record.
 */
export interface FederalRegisterRecord {
  /** Document number */
  documentNumber: string;
  /** Document title */
  title: string;
  /** Document type */
  documentType: FRDocumentType;
  /** Document type description */
  documentTypeDescription: string;
  /** Abstract/summary */
  abstract: string | null;
  /** Action being taken */
  action: string | null;
  /** Agencies involved */
  agencies: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  /** Publication date */
  publicationDate: string;
  /** Effective date (for rules) */
  effectiveDate: string | null;
  /** Comments close date (for proposed rules) */
  commentsCloseDate: string | null;
  /** CFR citations affected */
  cfrReferences: FRCfrReference[];
  /** Federal Register citation */
  citation: string | null;
  /** Volume and page range */
  frLocation: {
    volume: number;
    startPage: number;
    endPage: number;
    pageLength: number;
  };
  /** Related docket IDs */
  docketIds: string[];
  /** RIN numbers */
  regulationIdNumbers: string[];
  /** Topics covered */
  topics: string[];
  /** Whether this is a significant regulatory action */
  significant: boolean;
  /** URLs */
  urls: {
    html: string;
    pdf: string;
    json: string;
    xml: string;
    comments: string | null;
    regulationsGov: string | null;
  };
  /** Regulations.gov info if available */
  regulationsGovInfo: FRRegulationsGovInfo | null;
  /** When this record was fetched */
  fetchedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search conditions for Federal Register documents.
 */
export interface FRSearchConditions {
  /** Full-text search term */
  term?: string;
  /** Document types to include */
  type?: FRDocumentType[];
  /** Agency IDs or slugs */
  agencies?: string[];
  /** Publication date range */
  publicationDate?: {
    gte?: string;
    lte?: string;
    year?: number;
  };
  /** Effective date range */
  effectiveDate?: {
    gte?: string;
    lte?: string;
  };
  /** Comments close date range */
  commentsCloseDate?: {
    gte?: string;
    lte?: string;
  };
  /** CFR title and part */
  cfr?: {
    title?: number;
    part?: string;
  };
  /** Docket ID */
  docketId?: string;
  /** Regulation ID number (RIN) */
  regulationIdNumber?: string;
  /** Topics */
  topics?: string[];
  /** Only significant regulatory actions */
  significant?: boolean;
  /** Only presidential documents */
  presidential?: boolean;
  /** Only with comment periods open */
  commentPeriodOpen?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEDERAL REGISTER ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter for Federal Register document data.
 */
export class FederalRegisterAdapter extends BaseGovernmentAdapter<
  FederalRegisterConfig,
  FederalRegisterRecord
> {
  constructor(config?: Partial<FederalRegisterConfig>) {
    super({ ...DEFAULT_FEDERAL_REGISTER_CONFIG, ...config });
  }

  protected getAdapterName(): string {
    return 'FederalRegister';
  }

  protected getCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return `fr:${Buffer.from(normalized).toString('base64').slice(0, 32)}`;
  }

  protected parseResponse(data: unknown): FederalRegisterRecord {
    const doc = data as FRDocument;
    return this.normalizeDocument(doc);
  }

  /**
   * Look up a specific document by document number.
   * Returns Result<LookupResult<FederalRegisterRecord>> for type-safe error handling.
   */
  public async lookup(params: { documentNumber: string }): Promise<Result<LookupResult<FederalRegisterRecord>>> {
    const startTime = Date.now();
    const { documentNumber } = params;

    if (!documentNumber) {
      return failure('VALIDATION_ERROR', 'Document number is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const cacheKey = this.getCacheKey({ documentNumber });

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
            source: 'federalregister',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: true }
        );
      }

      // Fetch from API
      const doc = await this.getDocumentByNumber(documentNumber);

      return success(
        {
          success: true,
          data: doc,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'federalregister',
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
    paramsList: Array<{ documentNumber: string }>
  ): Promise<BatchLookupResult<FederalRegisterRecord>> {
    const results = new Map<string, FederalRegisterRecord>();
    const errors = new Map<string, string>();
    let partialCache = false;

    // Federal Register supports batch lookup by document numbers
    const documentNumbers = paramsList.map((p) => p.documentNumber);
    const uncachedNumbers: string[] = [];

    // Check cache first
    for (const num of documentNumbers) {
      const cacheKey = this.getCacheKey({ documentNumber: num });
      const cached = this.cache.get(cacheKey);
      if (cached) {
        results.set(num, cached);
        partialCache = true;
      } else {
        uncachedNumbers.push(num);
      }
    }

    // Fetch uncached documents
    if (uncachedNumbers.length > 0) {
      try {
        const docs = await this.getDocumentsByNumbers(uncachedNumbers);
        for (const doc of docs) {
          results.set(doc.documentNumber, doc);
        }
      } catch (error) {
        // If batch fails, try individually
        for (const num of uncachedNumbers) {
          const result = await this.lookup({ documentNumber: num });
          if (result.success && result.data.data) {
            results.set(num, result.data.data);
          } else if (!result.success) {
            errors.set(num, result.error.message || 'Unknown error');
          }
        }
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
    conditions?: FRSearchConditions;
    page?: number;
    perPage?: number;
    order?: 'relevance' | 'newest' | 'oldest' | 'executive_order_number';
  }): Promise<{
    documents: FederalRegisterRecord[];
    total: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const { conditions = {}, page = 1, perPage = 20, order = 'newest' } = options;

    const params = this.buildSearchParams(conditions, page, perPage, order);
    const cacheKey = this.getCacheKey({ type: 'search', ...params });

    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.makeRequest<FRSearchResponse>(
        `/documents.json?${queryString}`,
        { method: 'GET', cacheKey }
      );

      const documents = response.results.map((doc) => this.normalizeDocument(doc));

      return {
        documents,
        total: response.count,
        totalPages: response.total_pages,
        hasMore: response.next_page_url !== null,
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
   * Get documents published on a specific date.
   */
  public async getDocumentsByDate(date: string): Promise<FederalRegisterRecord[]> {
    const cacheKey = this.getCacheKey({ type: 'date', date });

    try {
      const response = await this.makeRequest<FRSearchResponse>(
        `/documents.json?conditions[publication_date][is]=${date}&per_page=1000`,
        { method: 'GET', cacheKey }
      );

      return response.results.map((doc) => this.normalizeDocument(doc));
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to get documents for date: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Get documents currently open for comment.
   */
  public async getOpenCommentDocuments(options?: {
    agencies?: string[];
    page?: number;
    perPage?: number;
  }): Promise<{
    documents: FederalRegisterRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const today = new Date().toISOString().split('T')[0];

    return this.searchDocuments({
      conditions: {
        type: ['PRORULE', 'NOTICE'],
        agencies: options?.agencies,
        commentsCloseDate: { gte: today },
      },
      page: options?.page,
      perPage: options?.perPage,
      order: 'newest',
    });
  }

  /**
   * Get all agencies.
   */
  public async getAgencies(): Promise<FRAgency[]> {
    const cacheKey = this.getCacheKey({ type: 'agencies' });

    try {
      const response = await this.makeRequest<FRAgency[]>('/agencies.json', {
        method: 'GET',
        cacheKey,
      });

      return response;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to get agencies: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Get a specific agency by slug.
   */
  public async getAgency(slug: string): Promise<FRAgency> {
    const cacheKey = this.getCacheKey({ type: 'agency', slug });

    try {
      const response = await this.makeRequest<FRAgency>(`/agencies/${slug}.json`, {
        method: 'GET',
        cacheKey,
      });

      return response;
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to get agency: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Get a specific document by document number.
   */
  private async getDocumentByNumber(documentNumber: string): Promise<FederalRegisterRecord> {
    const cacheKey = this.getCacheKey({ type: 'document', documentNumber });

    try {
      const fields = (this.config.defaultFields || []).join(',');
      const response = await this.makeRequest<FRDocument>(
        `/documents/${documentNumber}.json?fields[]=${fields}`,
        { method: 'GET', cacheKey }
      );

      return this.normalizeDocument(response);
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'NOT_FOUND') {
        throw new AdapterError(`Document not found: ${documentNumber}`, 'NOT_FOUND', 404);
      }
      throw error;
    }
  }

  /**
   * Get multiple documents by document numbers.
   */
  private async getDocumentsByNumbers(documentNumbers: string[]): Promise<FederalRegisterRecord[]> {
    const cacheKey = this.getCacheKey({ type: 'documents', documentNumbers });

    try {
      const fields = (this.config.defaultFields || []).join(',');
      const numbers = documentNumbers.join(',');
      const response = await this.makeRequest<{ results: FRDocument[] }>(
        `/documents/${numbers}.json?fields[]=${fields}`,
        { method: 'GET', cacheKey }
      );

      return response.results.map((doc) => this.normalizeDocument(doc));
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to get documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UNKNOWN'
      );
    }
  }

  /**
   * Build search parameters from conditions.
   */
  private buildSearchParams(
    conditions: FRSearchConditions,
    page: number,
    perPage: number,
    order: string
  ): Record<string, string> {
    const params: Record<string, string> = {
      page: String(page),
      per_page: String(perPage),
      order,
    };

    if (conditions.term) {
      params['conditions[term]'] = conditions.term;
    }

    if (conditions.type?.length) {
      conditions.type.forEach((t, i) => {
        params[`conditions[type][]`] = t;
      });
    }

    if (conditions.agencies?.length) {
      conditions.agencies.forEach((a) => {
        params[`conditions[agencies][]`] = a;
      });
    }

    if (conditions.publicationDate) {
      if (conditions.publicationDate.gte) {
        params['conditions[publication_date][gte]'] = conditions.publicationDate.gte;
      }
      if (conditions.publicationDate.lte) {
        params['conditions[publication_date][lte]'] = conditions.publicationDate.lte;
      }
      if (conditions.publicationDate.year) {
        params['conditions[publication_date][year]'] = String(conditions.publicationDate.year);
      }
    }

    if (conditions.effectiveDate) {
      if (conditions.effectiveDate.gte) {
        params['conditions[effective_date][gte]'] = conditions.effectiveDate.gte;
      }
      if (conditions.effectiveDate.lte) {
        params['conditions[effective_date][lte]'] = conditions.effectiveDate.lte;
      }
    }

    if (conditions.commentsCloseDate) {
      if (conditions.commentsCloseDate.gte) {
        params['conditions[comment_date][gte]'] = conditions.commentsCloseDate.gte;
      }
      if (conditions.commentsCloseDate.lte) {
        params['conditions[comment_date][lte]'] = conditions.commentsCloseDate.lte;
      }
    }

    if (conditions.cfr) {
      if (conditions.cfr.title) {
        params['conditions[cfr][title]'] = String(conditions.cfr.title);
      }
      if (conditions.cfr.part) {
        params['conditions[cfr][part]'] = conditions.cfr.part;
      }
    }

    if (conditions.docketId) {
      params['conditions[docket_id]'] = conditions.docketId;
    }

    if (conditions.regulationIdNumber) {
      params['conditions[regulation_id_number]'] = conditions.regulationIdNumber;
    }

    if (conditions.topics?.length) {
      conditions.topics.forEach((t) => {
        params[`conditions[topics][]`] = t;
      });
    }

    if (conditions.significant !== undefined) {
      params['conditions[significant]'] = String(conditions.significant ? 1 : 0);
    }

    if (conditions.presidential) {
      params['conditions[presidential_document_type]'] = 'true';
    }

    return params;
  }

  /**
   * Normalize a Federal Register document.
   */
  private normalizeDocument(doc: FRDocument): FederalRegisterRecord {
    const typeDescriptions: Record<FRDocumentType, string> = {
      RULE: 'Final Rule',
      PRORULE: 'Proposed Rule',
      NOTICE: 'Notice',
      PRESDOCU: 'Presidential Document',
      CORRECT: 'Correction',
    };

    return {
      documentNumber: doc.document_number,
      title: doc.title,
      documentType: doc.type,
      documentTypeDescription: typeDescriptions[doc.type] || doc.type,
      abstract: doc.abstract,
      action: doc.action,
      agencies: doc.agencies.map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
      })),
      publicationDate: doc.publication_date,
      effectiveDate: doc.effective_on,
      commentsCloseDate: doc.comments_close_on,
      cfrReferences: doc.cfr_references,
      citation: doc.citation,
      frLocation: {
        volume: doc.volume,
        startPage: doc.start_page,
        endPage: doc.end_page,
        pageLength: doc.page_length,
      },
      docketIds: doc.docket_ids,
      regulationIdNumbers: doc.regulation_id_numbers,
      topics: doc.topics,
      significant: doc.significant,
      urls: {
        html: doc.html_url,
        pdf: doc.pdf_url,
        json: doc.json_url,
        xml: doc.full_text_xml_url,
        comments: doc.comment_url,
        regulationsGov: doc.regulations_dot_gov_url,
      },
      regulationsGovInfo: doc.regulations_dot_gov_info,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Convert a document record to a PromptSpeak symbol.
   */
  public toSymbol(record: FederalRegisterRecord): DirectiveSymbol {
    // Determine symbol ID based on document type
    let symbolPrefix: string;
    let category: SymbolCategory;

    switch (record.documentType) {
      case 'RULE':
        symbolPrefix = '\u039E.RG.FR.RULE';
        category = 'REGULATORY';
        break;
      case 'PRORULE':
        symbolPrefix = '\u039E.RG.FR.PROPOSED';
        category = 'REGULATORY';
        break;
      case 'PRESDOCU':
        symbolPrefix = '\u039E.D.FR.PRESIDENTIAL';
        category = 'DOCUMENT';
        break;
      default:
        symbolPrefix = '\u039E.D.FR.NOTICE';
        category = 'DOCUMENT';
    }

    const symbolId = `${symbolPrefix}.${record.documentNumber.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
    const now = new Date().toISOString();

    const agencyNames = record.agencies.map((a) => a.name).join(', ');
    const cfrRefs = record.cfrReferences
      .map((r) => `${r.title} CFR ${r.part}`)
      .join(', ');

    return {
      symbolId,
      version: 1,
      hash: Buffer.from(record.documentNumber).toString('base64').slice(0, 16),
      category,
      subcategory: record.documentType,
      tags: [
        'federal_register',
        record.documentType.toLowerCase(),
        ...record.agencies.map((a) => a.slug),
        ...(record.significant ? ['significant'] : []),
      ],

      who: `Federal agencies: ${agencyNames}`,
      what: record.title,
      why: record.abstract || `Federal ${record.documentTypeDescription} published in the Federal Register`,
      where: cfrRefs || 'Federal Register',
      when: `Published: ${record.publicationDate}${
        record.effectiveDate ? `, Effective: ${record.effectiveDate}` : ''
      }${record.commentsCloseDate ? `, Comments due: ${record.commentsCloseDate}` : ''}`,

      how: {
        focus: [
          'regulatory_action',
          'affected_cfr_sections',
          'comment_period',
          'effective_date',
        ],
        constraints: ['federal_regulation', 'administrative_procedure_act'],
        output_format: 'regulatory_analysis',
      },

      commanders_intent: `Track and analyze the ${record.documentTypeDescription} "${record.title}" from ${agencyNames}${
        record.commentsCloseDate
          ? `, with comments due ${record.commentsCloseDate}`
          : ''
      }`,

      requirements: [
        `Document Number: ${record.documentNumber}`,
        `Citation: ${record.citation || 'N/A'}`,
        `FR Location: ${record.frLocation.volume} FR ${record.frLocation.startPage}-${record.frLocation.endPage}`,
        ...(record.docketIds.length > 0 ? [`Docket IDs: ${record.docketIds.join(', ')}`] : []),
        ...(record.regulationIdNumbers.length > 0
          ? [`RINs: ${record.regulationIdNumbers.join(', ')}`]
          : []),
        ...(cfrRefs ? [`CFR References: ${cfrRefs}`] : []),
      ],

      created_at: now,
      updated_at: now,

      source_dataset: 'federalregister.gov',
      source_id: record.documentNumber,
      source_data: {
        document_type: record.documentType,
        agencies: record.agencies,
        publication_date: record.publicationDate,
        effective_date: record.effectiveDate,
        comments_close_date: record.commentsCloseDate,
        cfr_references: record.cfrReferences,
        docket_ids: record.docketIds,
        regulation_id_numbers: record.regulationIdNumbers,
        significant: record.significant,
        topics: record.topics,
      },

      regulatory: {
        filing_type: record.documentType,
        regulator: record.agencies[0]?.name || 'Federal Government',
        filing: {
          accession_number: record.documentNumber,
          filed_date: record.publicationDate,
        },
        compliance: record.commentsCloseDate
          ? {
              status: 'PENDING',
              deadline: record.commentsCloseDate,
              requirements: ['Submit comments through regulations.gov or mail'],
            }
          : undefined,
      },

      provenance: {
        source_type: 'PRIMARY',
        source_authority: 'HIGH',
        source_urls: [record.urls.html, record.urls.pdf],
        extraction_method: 'api',
        verification_date: now,
      },

      freshness: {
        last_validated: now,
        valid_for_days: 1, // Federal Register updates daily
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Federal Register adapter instance.
 */
export function createFederalRegisterAdapter(
  config?: Partial<FederalRegisterConfig>
): FederalRegisterAdapter {
  return new FederalRegisterAdapter(config);
}

/**
 * Default singleton instance.
 */
export const federalRegisterAdapter = createFederalRegisterAdapter();
