/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SAM.GOV ENTITY API ADAPTER (STUB)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Adapter for querying entity registration data from SAM.gov Entity API.
 * API Documentation: https://open.gsa.gov/api/entity-api/
 *
 * Key Features:
 *   - Look up entities by UEI (Unique Entity Identifier)
 *   - Search entities by name, location, NAICS codes
 *   - Get registration status and expiration
 *   - Retrieve certifications (SDVOSB, HUBZone, 8(a), etc.)
 *
 * IMPORTANT: This is a STUB implementation.
 * SAM.gov Entity API requires an API key obtained from api.data.gov.
 * The adapter is fully implemented but will return stub data until configured.
 *
 * Rate Limit: 1000 requests per day (with API key)
 * Authentication: X-Api-Key header required
 *
 * To activate:
 * 1. Register at https://api.data.gov/signup/
 * 2. Request SAM.gov Entity API access
 * 3. Configure: adapter.updateConfig({ apiKey: 'your-key' })
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
  ErrorCode,
  type Result,
  success,
  failure,
  fromError,
} from './base-adapter.js';
import type { DirectiveSymbol, SymbolCategory } from '../../symbols/types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface SAMEntityConfig extends BaseAdapterConfig {
  /** Whether to use stub data when API key is not configured */
  useStubWhenUnconfigured: boolean;
}

export const DEFAULT_SAM_ENTITY_CONFIG: SAMEntityConfig = {
  baseUrl: 'https://api.sam.gov/entity-information/v2',
  timeoutMs: 30000,
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerDay: 1000, // SAM.gov daily limit
    minDelayMs: 100,
  },
  cache: {
    ...DEFAULT_CACHE_CONFIG,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours - entity data changes infrequently
  },
  retry: DEFAULT_RETRY_CONFIG,
  apiKeyHeader: 'X-Api-Key',
  useStubWhenUnconfigured: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity registration status.
 */
export type SAMRegistrationStatus =
  | 'Active'
  | 'Inactive'
  | 'Submitted'
  | 'Work in Progress'
  | 'ID Assigned'
  | 'Expired';

/**
 * Entity exclusion status.
 */
export type SAMExclusionStatus = 'Active' | 'Inactive' | null;

/**
 * Business type codes.
 */
export interface SAMBusinessType {
  businessTypeCode: string;
  businessTypeDescription: string;
}

/**
 * NAICS code entry.
 */
export interface SAMNaicsCode {
  naicsCode: string;
  naicsDescription: string;
  sbaSmallBusiness: boolean;
  isPrimary: boolean;
}

/**
 * PSC code entry.
 */
export interface SAMPscCode {
  pscCode: string;
  pscDescription: string;
}

/**
 * Point of contact.
 */
export interface SAMPointOfContact {
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  email?: string;
  phone?: string;
  phoneExtension?: string;
  fax?: string;
  usPhone?: string;
  nonUsPhone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateOrProvinceCode?: string;
  zipCode?: string;
  zipCodePlus4?: string;
  countryCode?: string;
}

/**
 * Physical address.
 */
export interface SAMAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrProvinceCode: string;
  zipCode: string;
  zipCodePlus4?: string;
  countryCode: string;
}

/**
 * Entity data from SAM.gov API.
 */
export interface SAMEntityData {
  ueiSAM: string;
  ueiDUNS?: string; // Legacy DUNS (deprecated)
  cageCode: string | null;
  legalBusinessName: string;
  dbaName?: string;
  purposeOfRegistrationCode: string;
  purposeOfRegistrationDesc: string;
  registrationStatus: SAMRegistrationStatus;
  registrationDate: string;
  lastUpdateDate: string;
  expirationDate: string;
  activeDate: string;
  exclusionStatusFlag: SAMExclusionStatus;
  fiscalYearEndCloseDate?: string;
  entityStructureCode: string;
  entityStructureDesc: string;
  organizationStructureCode?: string;
  organizationStructureDesc?: string;
  stateOfIncorporationCode?: string;
  countryOfIncorporationCode?: string;
  entityStartDate?: string;
  companyDivision?: string;
  congressionalDistrict?: string;
  physicalAddress: SAMAddress;
  mailingAddress?: SAMAddress;
  businessTypes: SAMBusinessType[];
  naicsCodeList: SAMNaicsCode[];
  pscCodeList: SAMPscCode[];
  primaryNaics: string;
  governmentBusinessPOC?: SAMPointOfContact;
  electronicBusinessPOC?: SAMPointOfContact;
  pastPerformancePOC?: SAMPointOfContact;
  sbaBusinessTypes?: string[];
  certifications?: {
    farResponses?: Record<string, unknown>;
    dfarsResponses?: Record<string, unknown>;
    socioEconomic?: {
      sbaSmallBusiness?: boolean;
      sba8AProgram?: boolean;
      hubZone?: boolean;
      wosb?: boolean;
      edwosb?: boolean;
      vosb?: boolean;
      sdvosb?: boolean;
      minorityOwned?: boolean;
      veteranOwned?: boolean;
    };
  };
}

/**
 * Search response from SAM.gov API.
 */
interface SAMSearchResponse {
  totalRecords: number;
  entityData: SAMEntityData[];
  links: {
    selfLink: string;
    nextLink?: string;
    prevLink?: string;
  };
}

/**
 * Normalized SAM entity record.
 */
export interface SAMEntityRecord {
  /** Unique Entity Identifier */
  uei: string;
  /** CAGE code */
  cageCode: string | null;
  /** Legal business name */
  legalBusinessName: string;
  /** Doing business as name */
  dbaName: string | null;
  /** Entity type */
  entityType: {
    code: string;
    description: string;
  };
  /** Registration status */
  registrationStatus: SAMRegistrationStatus;
  /** Registration dates */
  registrationDates: {
    registered: string;
    lastUpdated: string;
    expiration: string;
    active: string;
  };
  /** Whether entity is excluded */
  isExcluded: boolean;
  /** Physical address */
  physicalAddress: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    congressionalDistrict: string | null;
  };
  /** NAICS codes */
  naicsCodes: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
    isSmallBusiness: boolean;
  }>;
  /** PSC codes */
  pscCodes: Array<{
    code: string;
    description: string;
  }>;
  /** Primary NAICS code */
  primaryNaics: string;
  /** Business types/categories */
  businessTypes: Array<{
    code: string;
    description: string;
  }>;
  /** Socioeconomic certifications */
  certifications: {
    sbaSmallBusiness: boolean;
    sba8a: boolean;
    hubZone: boolean;
    wosb: boolean;
    edwosb: boolean;
    vosb: boolean;
    sdvosb: boolean;
    minorityOwned: boolean;
    veteranOwned: boolean;
  };
  /** Points of contact */
  contacts: {
    governmentBusiness: SAMPointOfContact | null;
    electronicBusiness: SAMPointOfContact | null;
  };
  /** When this record was fetched */
  fetchedAt: string;
  /** Whether this is stub data */
  isStub: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search conditions for SAM entities.
 */
export interface SAMSearchConditions {
  /** Legal business name (partial match) */
  legalBusinessName?: string;
  /** DBA name (partial match) */
  dbaName?: string;
  /** CAGE code */
  cageCode?: string;
  /** UEI */
  ueiSAM?: string;
  /** State code */
  stateCode?: string;
  /** City name */
  cityName?: string;
  /** ZIP code */
  zipCode?: string;
  /** Country code */
  countryCode?: string;
  /** NAICS code */
  naicsCode?: string;
  /** PSC code */
  pscCode?: string;
  /** Registration status */
  registrationStatus?: SAMRegistrationStatus;
  /** Only active registrations */
  activeOnly?: boolean;
  /** Specific certifications */
  certifications?: {
    sbaSmallBusiness?: boolean;
    sba8a?: boolean;
    hubZone?: boolean;
    wosb?: boolean;
    sdvosb?: boolean;
    vosb?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAM ENTITY ADAPTER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter for SAM.gov entity registration data.
 *
 * NOTE: This adapter requires an API key from api.data.gov.
 * Without an API key, it will return stub data.
 */
export class SAMEntityAdapter extends BaseGovernmentAdapter<
  SAMEntityConfig,
  SAMEntityRecord
> {
  private isConfigured: boolean = false;

  constructor(config?: Partial<SAMEntityConfig>) {
    super({ ...DEFAULT_SAM_ENTITY_CONFIG, ...config });
    this.isConfigured = !!this.config.apiKey;
  }

  protected getAdapterName(): string {
    return 'SAMEntity';
  }

  protected getCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    return `sam:${Buffer.from(normalized).toString('base64').slice(0, 32)}`;
  }

  protected parseResponse(data: unknown): SAMEntityRecord {
    const entity = data as SAMEntityData;
    return this.normalizeEntity(entity);
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
   * Look up an entity by UEI.
   * Returns Result<LookupResult<SAMEntityRecord>> for type-safe error handling.
   */
  public async lookup(params: { uei: string }): Promise<Result<LookupResult<SAMEntityRecord>>> {
    const startTime = Date.now();
    const { uei } = params;

    if (!uei) {
      return failure('VALIDATION_ERROR', 'UEI is required', {
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    // Validate UEI format (12 alphanumeric characters)
    if (!/^[A-Z0-9]{12}$/.test(uei.toUpperCase())) {
      return failure('VALIDATION_ERROR', 'Invalid UEI format. UEI must be 12 alphanumeric characters.', {
        details: { uei },
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const cacheKey = this.getCacheKey({ uei: uei.toUpperCase() });

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
            source: 'sam.gov',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: true }
        );
      }

      // If not configured, return stub data
      if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
        const stubData = this.createStubEntity(uei.toUpperCase());
        this.cache.set(cacheKey, stubData);

        return success(
          {
            success: true,
            data: stubData,
            fromCache: false,
            timestamp: new Date().toISOString(),
            source: 'sam.gov (STUB)',
          },
          { executionTimeMs: Date.now() - startTime, cacheHit: false }
        );
      }

      if (!this.isConfigured) {
        return failure('AUTH_FAILED', 'SAM.gov API key not configured. Register at https://api.data.gov/signup/', {
          metadata: { executionTimeMs: Date.now() - startTime },
        });
      }

      // Fetch from API
      const entity = await this.getEntityByUEI(uei.toUpperCase());

      return success(
        {
          success: true,
          data: entity,
          fromCache: false,
          timestamp: new Date().toISOString(),
          source: 'sam.gov',
        },
        { executionTimeMs: Date.now() - startTime, cacheHit: false }
      );
    } catch (error) {
      return fromError(error, 'ADAPTER_ERROR');
    }
  }

  /**
   * Look up an entity by CAGE code.
   * Returns Result<LookupResult<SAMEntityRecord>> for type-safe error handling.
   */
  public async lookupByCage(cageCode: string): Promise<Result<LookupResult<SAMEntityRecord>>> {
    const startTime = Date.now();

    if (!cageCode || !/^[A-Z0-9]{5}$/.test(cageCode.toUpperCase())) {
      return failure('VALIDATION_ERROR', 'Invalid CAGE code format. CAGE must be 5 alphanumeric characters.', {
        details: { cageCode },
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    const results = await this.searchEntities({
      conditions: { cageCode: cageCode.toUpperCase() },
      limit: 1,
    });

    if (results.entities.length === 0) {
      return failure('NOT_FOUND', `No entity found with CAGE code: ${cageCode}`, {
        details: { cageCode },
        metadata: { executionTimeMs: Date.now() - startTime },
      });
    }

    return success(
      {
        success: true,
        data: results.entities[0],
        fromCache: false,
        timestamp: new Date().toISOString(),
        source: 'sam.gov',
      },
      { executionTimeMs: Date.now() - startTime, cacheHit: false }
    );
  }

  /**
   * Batch lookup multiple entities.
   */
  public async lookupBatch(
    paramsList: Array<{ uei: string }>
  ): Promise<BatchLookupResult<SAMEntityRecord>> {
    const results = new Map<string, SAMEntityRecord>();
    const errors = new Map<string, string>();
    let partialCache = false;

    for (const params of paramsList) {
      const result = await this.lookup(params);
      if (result.success && result.data.data) {
        results.set(params.uei, result.data.data);
        if (result.data.fromCache) {
          partialCache = true;
        }
      } else if (!result.success) {
        errors.set(params.uei, result.error.message || 'Unknown error');
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
   * Search for entities matching the given criteria.
   */
  public async searchEntities(options: {
    conditions: SAMSearchConditions;
    page?: number;
    limit?: number;
  }): Promise<{
    entities: SAMEntityRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const { conditions, page = 0, limit = 10 } = options;

    // If not configured, return stub results
    if (!this.isConfigured && this.config.useStubWhenUnconfigured) {
      this.logger.warn('API key not configured, returning stub data');
      const stubEntities = this.createStubSearchResults(conditions, limit);
      return {
        entities: stubEntities,
        total: stubEntities.length,
        hasMore: false,
      };
    }

    if (!this.isConfigured) {
      throw new AdapterError('SAM.gov API key not configured', {
        adapterName: this.getAdapterName(),
        code: ErrorCode.AUTH_FAILED,
      });
    }

    const params = this.buildSearchParams(conditions, page, limit);
    const cacheKey = this.getCacheKey({ type: 'search', ...params });

    try {
      const queryString = new URLSearchParams(params).toString();
      const response = await this.makeRequest<SAMSearchResponse>(
        `/entities?${queryString}`,
        { method: 'GET', cacheKey }
      );

      const entities = response.entityData.map((e) => this.normalizeEntity(e));

      return {
        entities,
        total: response.totalRecords,
        hasMore: !!response.links.nextLink,
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to search entities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          adapterName: this.getAdapterName(),
          originalError: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /**
   * Get entity by UEI from API.
   */
  private async getEntityByUEI(uei: string): Promise<SAMEntityRecord> {
    const cacheKey = this.getCacheKey({ type: 'entity', uei });

    try {
      const response = await this.makeRequest<SAMSearchResponse>(
        `/entities?ueiSAM=${uei}`,
        { method: 'GET', cacheKey }
      );

      if (!response.entityData || response.entityData.length === 0) {
        throw new AdapterError(`Entity not found: ${uei}`, {
          adapterName: this.getAdapterName(),
          code: ErrorCode.NOT_FOUND,
          statusCode: 404,
        });
      }

      return this.normalizeEntity(response.entityData[0]);
    } catch (error) {
      if (error instanceof AdapterError) {
        throw error;
      }
      throw new AdapterError(
        `Failed to get entity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          adapterName: this.getAdapterName(),
          originalError: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /**
   * Build search parameters from conditions.
   */
  private buildSearchParams(
    conditions: SAMSearchConditions,
    page: number,
    limit: number
  ): Record<string, string> {
    const params: Record<string, string> = {
      page: String(page),
      size: String(limit),
    };

    if (conditions.legalBusinessName) {
      params.legalBusinessName = conditions.legalBusinessName;
    }
    if (conditions.dbaName) {
      params.dbaName = conditions.dbaName;
    }
    if (conditions.cageCode) {
      params.cageCode = conditions.cageCode;
    }
    if (conditions.ueiSAM) {
      params.ueiSAM = conditions.ueiSAM;
    }
    if (conditions.stateCode) {
      params.physicalAddressStateCode = conditions.stateCode;
    }
    if (conditions.cityName) {
      params.physicalAddressCity = conditions.cityName;
    }
    if (conditions.zipCode) {
      params.physicalAddressZipCode = conditions.zipCode;
    }
    if (conditions.naicsCode) {
      params.naicsCode = conditions.naicsCode;
    }
    if (conditions.pscCode) {
      params.pscCode = conditions.pscCode;
    }
    if (conditions.registrationStatus) {
      params.registrationStatus = conditions.registrationStatus;
    }
    if (conditions.activeOnly) {
      params.registrationStatus = 'Active';
    }

    // Add certification filters
    if (conditions.certifications) {
      const certs = conditions.certifications;
      if (certs.sba8a) params['certifications.sbaSmallBusiness.sba8AProgram'] = 'Y';
      if (certs.hubZone) params['certifications.sbaSmallBusiness.hubZone'] = 'Y';
      if (certs.wosb) params['certifications.sbaSmallBusiness.wosb'] = 'Y';
      if (certs.sdvosb) params['certifications.sbaSmallBusiness.sdvosb'] = 'Y';
      if (certs.vosb) params['certifications.sbaSmallBusiness.vosb'] = 'Y';
    }

    return params;
  }

  /**
   * Normalize an entity from the API response.
   */
  private normalizeEntity(entity: SAMEntityData): SAMEntityRecord {
    const certs = entity.certifications?.socioEconomic || {};

    return {
      uei: entity.ueiSAM,
      cageCode: entity.cageCode,
      legalBusinessName: entity.legalBusinessName,
      dbaName: entity.dbaName || null,
      entityType: {
        code: entity.entityStructureCode,
        description: entity.entityStructureDesc,
      },
      registrationStatus: entity.registrationStatus,
      registrationDates: {
        registered: entity.registrationDate,
        lastUpdated: entity.lastUpdateDate,
        expiration: entity.expirationDate,
        active: entity.activeDate,
      },
      isExcluded: entity.exclusionStatusFlag === 'Active',
      physicalAddress: {
        line1: entity.physicalAddress.addressLine1,
        line2: entity.physicalAddress.addressLine2 || null,
        city: entity.physicalAddress.city,
        state: entity.physicalAddress.stateOrProvinceCode,
        zip: entity.physicalAddress.zipCode,
        country: entity.physicalAddress.countryCode,
        congressionalDistrict: entity.congressionalDistrict || null,
      },
      naicsCodes: entity.naicsCodeList.map((n) => ({
        code: n.naicsCode,
        description: n.naicsDescription,
        isPrimary: n.isPrimary,
        isSmallBusiness: n.sbaSmallBusiness,
      })),
      pscCodes: entity.pscCodeList.map((p) => ({
        code: p.pscCode,
        description: p.pscDescription,
      })),
      primaryNaics: entity.primaryNaics,
      businessTypes: entity.businessTypes.map((b) => ({
        code: b.businessTypeCode,
        description: b.businessTypeDescription,
      })),
      certifications: {
        sbaSmallBusiness: certs.sbaSmallBusiness || false,
        sba8a: certs.sba8AProgram || false,
        hubZone: certs.hubZone || false,
        wosb: certs.wosb || false,
        edwosb: certs.edwosb || false,
        vosb: certs.vosb || false,
        sdvosb: certs.sdvosb || false,
        minorityOwned: certs.minorityOwned || false,
        veteranOwned: certs.veteranOwned || false,
      },
      contacts: {
        governmentBusiness: entity.governmentBusinessPOC || null,
        electronicBusiness: entity.electronicBusinessPOC || null,
      },
      fetchedAt: new Date().toISOString(),
      isStub: false,
    };
  }

  /**
   * Create a stub entity for unconfigured usage.
   */
  private createStubEntity(uei: string): SAMEntityRecord {
    const now = new Date().toISOString();
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    return {
      uei,
      cageCode: 'XXXXX',
      legalBusinessName: `[STUB] Entity ${uei}`,
      dbaName: null,
      entityType: {
        code: '2L',
        description: 'Corporate Entity (Not Tax Exempt)',
      },
      registrationStatus: 'Active',
      registrationDates: {
        registered: now,
        lastUpdated: now,
        expiration: oneYearFromNow,
        active: now,
      },
      isExcluded: false,
      physicalAddress: {
        line1: '123 Main Street',
        line2: null,
        city: 'Washington',
        state: 'DC',
        zip: '20001',
        country: 'USA',
        congressionalDistrict: 'DC00',
      },
      naicsCodes: [
        {
          code: '541512',
          description: 'Computer Systems Design Services',
          isPrimary: true,
          isSmallBusiness: true,
        },
      ],
      pscCodes: [
        {
          code: 'D310',
          description: 'IT and Telecom - Automated Information System Design and Integration Services',
        },
      ],
      primaryNaics: '541512',
      businessTypes: [
        {
          code: '23',
          description: 'Small Business',
        },
      ],
      certifications: {
        sbaSmallBusiness: true,
        sba8a: false,
        hubZone: false,
        wosb: false,
        edwosb: false,
        vosb: false,
        sdvosb: false,
        minorityOwned: false,
        veteranOwned: false,
      },
      contacts: {
        governmentBusiness: null,
        electronicBusiness: null,
      },
      fetchedAt: now,
      isStub: true,
    };
  }

  /**
   * Create stub search results.
   */
  private createStubSearchResults(
    conditions: SAMSearchConditions,
    limit: number
  ): SAMEntityRecord[] {
    // Generate 1-3 stub entities based on search
    const count = Math.min(limit, Math.floor(Math.random() * 3) + 1);
    const results: SAMEntityRecord[] = [];

    for (let i = 0; i < count; i++) {
      const uei = `STUB${String(i).padStart(8, '0')}${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`.slice(0, 12);
      const entity = this.createStubEntity(uei);

      // Customize based on conditions
      if (conditions.legalBusinessName) {
        entity.legalBusinessName = `[STUB] ${conditions.legalBusinessName} ${i + 1}`;
      }
      if (conditions.naicsCode) {
        entity.primaryNaics = conditions.naicsCode;
        entity.naicsCodes = [{
          code: conditions.naicsCode,
          description: `NAICS ${conditions.naicsCode}`,
          isPrimary: true,
          isSmallBusiness: true,
        }];
      }

      results.push(entity);
    }

    return results;
  }

  /**
   * Convert an entity record to a PromptSpeak symbol.
   */
  public toSymbol(record: SAMEntityRecord): DirectiveSymbol {
    const symbolId = `\u039E.C.GOV.SAM.${record.uei}`;
    const now = new Date().toISOString();

    // Build certification string
    const certs: string[] = [];
    if (record.certifications.sba8a) certs.push('8(a)');
    if (record.certifications.hubZone) certs.push('HUBZone');
    if (record.certifications.sdvosb) certs.push('SDVOSB');
    if (record.certifications.vosb) certs.push('VOSB');
    if (record.certifications.wosb) certs.push('WOSB');
    if (record.certifications.edwosb) certs.push('EDWOSB');

    const certString = certs.length > 0 ? certs.join(', ') : 'None';

    return {
      symbolId,
      version: 1,
      hash: Buffer.from(record.uei).toString('base64').slice(0, 16),
      category: 'COMPANY' as SymbolCategory,
      subcategory: 'GOVERNMENT_CONTRACTOR',
      tags: [
        'sam.gov',
        'federal_contractor',
        record.registrationStatus.toLowerCase(),
        ...(record.certifications.sbaSmallBusiness ? ['small_business'] : []),
        ...certs.map((c) => c.toLowerCase().replace(/[()]/g, '')),
        record.isStub ? 'stub' : 'verified',
      ],

      who: record.legalBusinessName,
      what: `Federal contractor registered in SAM.gov${
        record.dbaName ? ` (DBA: ${record.dbaName})` : ''
      }`,
      why: 'Track federal contractor eligibility, certifications, and registration status',
      where: `${record.physicalAddress.city}, ${record.physicalAddress.state} ${record.physicalAddress.zip}`,
      when: `Active: ${record.registrationDates.active}, Expires: ${record.registrationDates.expiration}`,

      how: {
        focus: [
          'registration_status',
          'certifications',
          'naics_codes',
          'contact_info',
        ],
        constraints: ['federal_data', 'sam_registered'],
        output_format: 'contractor_profile',
      },

      commanders_intent: `Track SAM.gov registration for ${record.legalBusinessName} (UEI: ${record.uei})${
        certs.length > 0 ? ` with ${certString} certifications` : ''
      }`,

      requirements: [
        `UEI: ${record.uei}`,
        `CAGE: ${record.cageCode || 'Not assigned'}`,
        `Status: ${record.registrationStatus}`,
        `Expiration: ${record.registrationDates.expiration}`,
        `Primary NAICS: ${record.primaryNaics}`,
        `Certifications: ${certString}`,
        `Entity Type: ${record.entityType.description}`,
      ],

      created_at: now,
      updated_at: now,

      source_dataset: 'sam.gov',
      source_id: record.uei,
      source_data: {
        uei: record.uei,
        cage_code: record.cageCode,
        registration_status: record.registrationStatus,
        registration_dates: record.registrationDates,
        entity_type: record.entityType,
        naics_codes: record.naicsCodes,
        psc_codes: record.pscCodes,
        certifications: record.certifications,
        business_types: record.businessTypes,
        address: record.physicalAddress,
        is_stub: record.isStub,
      },

      provenance: {
        source_type: record.isStub ? 'SYNTHETIC' : 'PRIMARY',
        source_authority: record.isStub ? 'LOW' : 'HIGH',
        source_urls: [`https://sam.gov/entity/${record.uei}/coreData`],
        extraction_method: 'api',
        verification_date: now,
      },

      freshness: {
        last_validated: now,
        valid_for_days: record.isStub ? 1 : 30, // Stub data should be refreshed quickly
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a SAM Entity adapter instance.
 */
export function createSAMEntityAdapter(
  config?: Partial<SAMEntityConfig>
): SAMEntityAdapter {
  return new SAMEntityAdapter(config);
}

/**
 * Default singleton instance.
 */
export const samEntityAdapter = createSAMEntityAdapter();
