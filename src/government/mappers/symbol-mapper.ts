/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GOVERNMENT DATA SYMBOL MAPPER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Maps government data records to PromptSpeak symbols.
 * Provides unified symbol generation across all government data adapters.
 *
 * Symbol Taxonomy:
 *   - Entities: Ξ.C.GOV.* (COMPANY category, government contractor subcategory)
 *   - Awards: Ξ.TX.GOV.* (TRANSACTION category, government award subcategory)
 *   - Regulations: Ξ.RG.* (REGULATORY category)
 *   - Documents: Ξ.D.GOV.* (DOCUMENT category)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  DirectiveSymbol,
  SymbolCategory,
  RegulatoryExtension,
  FinancialExtension,
  Provenance,
} from '../../symbols/types.js';
import type { USASpendingAwardRecord } from '../adapters/usaspending-adapter.js';
import type { FederalRegisterRecord } from '../adapters/federal-register-adapter.js';
import type { SAMEntityRecord } from '../adapters/sam-entity-adapter.js';
import type { RegulationsDocumentRecord, RegulationsDocketRecord } from '../adapters/regulations-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize an ID for use in a symbol ID.
 * Removes special characters and converts to uppercase.
 */
function sanitizeId(id: string): string {
  return id
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
}

/**
 * Generate a hash from content for symbol versioning.
 */
function generateHash(content: string): string {
  // Simple hash for demo - in production use crypto
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0').slice(0, 16);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY SYMBOL MAPPER (SAM.gov)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a SAM.gov entity to a COMPANY symbol.
 */
export function mapEntityToSymbol(record: SAMEntityRecord): DirectiveSymbol {
  const symbolId = `\u039E.C.GOV.${sanitizeId(record.uei)}`;
  const now = new Date().toISOString();

  // Build certification list
  const certs: string[] = [];
  if (record.certifications.sba8a) certs.push('8(a)');
  if (record.certifications.hubZone) certs.push('HUBZone');
  if (record.certifications.sdvosb) certs.push('SDVOSB');
  if (record.certifications.vosb) certs.push('VOSB');
  if (record.certifications.wosb) certs.push('WOSB');
  if (record.certifications.edwosb) certs.push('EDWOSB');
  if (record.certifications.minorityOwned) certs.push('Minority-Owned');
  if (record.certifications.veteranOwned) certs.push('Veteran-Owned');

  // Build business type list
  const businessTypes = record.businessTypes.map((bt) => bt.description).join(', ');

  // Primary NAICS description
  const primaryNaicsDesc = record.naicsCodes.find((n) => n.isPrimary)?.description || '';

  const symbol: DirectiveSymbol = {
    symbolId,
    version: 1,
    hash: generateHash(JSON.stringify(record)),
    category: 'COMPANY' as SymbolCategory,
    subcategory: 'GOVERNMENT_CONTRACTOR',
    tags: [
      'sam.gov',
      'federal_contractor',
      record.registrationStatus.toLowerCase().replace(/\s+/g, '_'),
      ...(record.certifications.sbaSmallBusiness ? ['small_business'] : []),
      ...certs.map((c) => c.toLowerCase().replace(/[()]/g, '')),
      record.isStub ? 'stub_data' : 'verified',
    ],

    who: record.legalBusinessName,
    what: `Federal contractor: ${primaryNaicsDesc || 'Government services'}${
      record.dbaName ? ` (DBA: ${record.dbaName})` : ''
    }`,
    why: 'Track federal contractor registration, certifications, and eligibility for government contracts',
    where: `${record.physicalAddress.city}, ${record.physicalAddress.state} ${record.physicalAddress.zip}, ${record.physicalAddress.country}`,
    when: `Registered: ${record.registrationDates.registered}, Expires: ${record.registrationDates.expiration}`,

    how: {
      focus: [
        'registration_status',
        'certifications',
        'naics_capabilities',
        'set_aside_eligibility',
      ],
      constraints: ['federal_acquisition_regulation', 'sam_registration_required'],
      output_format: 'contractor_profile',
    },

    commanders_intent: `Maintain visibility into ${record.legalBusinessName}'s federal contractor status (UEI: ${record.uei})${
      certs.length > 0 ? `, certified for: ${certs.join(', ')}` : ''
    }`,

    requirements: [
      `UEI: ${record.uei}`,
      `CAGE Code: ${record.cageCode || 'Not assigned'}`,
      `Registration Status: ${record.registrationStatus}`,
      `Entity Type: ${record.entityType.description}`,
      `Primary NAICS: ${record.primaryNaics}${primaryNaicsDesc ? ` - ${primaryNaicsDesc}` : ''}`,
      `Small Business: ${record.certifications.sbaSmallBusiness ? 'Yes' : 'No'}`,
      `Certifications: ${certs.length > 0 ? certs.join(', ') : 'None'}`,
      `Business Types: ${businessTypes || 'Not specified'}`,
    ],

    created_at: now,
    updated_at: now,

    source_dataset: 'sam.gov',
    source_id: record.uei,
    source_data: {
      uei: record.uei,
      cage_code: record.cageCode,
      legal_business_name: record.legalBusinessName,
      dba_name: record.dbaName,
      registration_status: record.registrationStatus,
      registration_dates: record.registrationDates,
      is_excluded: record.isExcluded,
      entity_type: record.entityType,
      physical_address: record.physicalAddress,
      naics_codes: record.naicsCodes,
      psc_codes: record.pscCodes,
      business_types: record.businessTypes,
      certifications: record.certifications,
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
      valid_for_days: record.isStub ? 1 : 30,
    },
  };

  return symbol;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AWARD SYMBOL MAPPER (USASpending.gov)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a monetary amount for display.
 */
function formatCurrency(amount: number): string {
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
  return `$${amount.toFixed(2)}`;
}

/**
 * Map a USASpending award to a TRANSACTION symbol.
 */
export function mapAwardToSymbol(record: USASpendingAwardRecord): DirectiveSymbol {
  const symbolId = `\u039E.TX.GOV.${sanitizeId(record.awardId)}`;
  const now = new Date().toISOString();

  const symbol: DirectiveSymbol = {
    symbolId,
    version: 1,
    hash: generateHash(JSON.stringify(record)),
    category: 'TRANSACTION' as SymbolCategory,
    subcategory: 'GOVERNMENT_AWARD',
    tags: [
      'usaspending',
      'federal_award',
      record.awardType.toLowerCase().replace(/\s+/g, '_'),
      record.naics.code || 'no_naics',
      record.awardingAgency.toptierName.toLowerCase().replace(/\s+/g, '_'),
    ].filter(Boolean),

    who: record.recipient.name,
    what: `${record.awardTypeDescription}: ${record.description.slice(0, 200)}${
      record.description.length > 200 ? '...' : ''
    }`,
    why: `Track federal spending by ${record.awardingAgency.toptierName} for contract/grant management and analysis`,
    where: record.placeOfPerformance.state
      ? `${record.placeOfPerformance.city || ''}, ${record.placeOfPerformance.state}, ${record.placeOfPerformance.country || 'USA'}`
      : 'United States',
    when: `Period: ${record.dates.performanceStart} to ${record.dates.performanceEnd}`,

    how: {
      focus: [
        'award_value',
        'performance_period',
        'recipient_analysis',
        'agency_spending_patterns',
      ],
      constraints: ['federal_acquisition_regulation', 'public_spending_data'],
      output_format: 'award_analysis',
    },

    commanders_intent: `Monitor the ${formatCurrency(record.totalObligation)} ${record.awardTypeDescription} to ${record.recipient.name} for ${record.awardingAgency.toptierName} spending analysis`,

    requirements: [
      `Award ID: ${record.awardId}`,
      `Identifier: ${record.identifier}`,
      `Total Obligation: ${formatCurrency(record.totalObligation)}`,
      `Base + All Options: ${formatCurrency(record.baseAndAllOptionsValue)}`,
      `Recipient: ${record.recipient.name}`,
      `Recipient UEI: ${record.recipient.uei || 'Not available'}`,
      `Awarding Agency: ${record.awardingAgency.toptierName}`,
      `NAICS: ${record.naics.code || 'N/A'} - ${record.naics.description || 'N/A'}`,
      `PSC: ${record.psc.code || 'N/A'} - ${record.psc.description || 'N/A'}`,
    ],

    created_at: now,
    updated_at: now,

    source_dataset: 'usaspending.gov',
    source_id: record.awardId,
    source_data: {
      award_id: record.awardId,
      identifier: record.identifier,
      award_type: record.awardType,
      award_type_description: record.awardTypeDescription,
      total_obligation: record.totalObligation,
      base_and_all_options_value: record.baseAndAllOptionsValue,
      recipient: record.recipient,
      awarding_agency: record.awardingAgency,
      funding_agency: record.fundingAgency,
      dates: record.dates,
      naics: record.naics,
      psc: record.psc,
      place_of_performance: record.placeOfPerformance,
    },

    financial: {
      metrics: {
        revenue: {
          amount: record.totalObligation,
          currency: 'USD',
          unit: 'ONES',
          as_of: record.dates.signed || record.dates.performanceStart,
        },
      },
    } as FinancialExtension,

    provenance: {
      source_type: 'PRIMARY',
      source_authority: 'HIGH',
      source_urls: [`https://www.usaspending.gov/award/${record.awardId}`],
      extraction_method: 'api',
      verification_date: now,
    },

    freshness: {
      last_validated: now,
      valid_for_days: 7,
    },
  };

  return symbol;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEDERAL REGISTER SYMBOL MAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a Federal Register document to a REGULATORY or DOCUMENT symbol.
 */
export function mapFederalRegisterToSymbol(record: FederalRegisterRecord): DirectiveSymbol {
  const now = new Date().toISOString();

  // Determine symbol ID and category based on document type
  let symbolId: string;
  let category: SymbolCategory;

  switch (record.documentType) {
    case 'RULE':
      symbolId = `\u039E.RG.FR.RULE.${sanitizeId(record.documentNumber)}`;
      category = 'REGULATORY';
      break;
    case 'PRORULE':
      symbolId = `\u039E.RG.FR.PROPOSED.${sanitizeId(record.documentNumber)}`;
      category = 'REGULATORY';
      break;
    case 'PRESDOCU':
      symbolId = `\u039E.D.GOV.PRESIDENTIAL.${sanitizeId(record.documentNumber)}`;
      category = 'DOCUMENT';
      break;
    default:
      symbolId = `\u039E.D.GOV.FR.${sanitizeId(record.documentNumber)}`;
      category = 'DOCUMENT';
  }

  const agencyNames = record.agencies.map((a) => a.name).join(', ');
  const cfrRefs = record.cfrReferences
    .map((r) => `${r.title} CFR ${r.part}`)
    .join(', ');

  // Build regulatory extension
  const regulatory: RegulatoryExtension = {
    filing_type: record.documentType,
    regulator: record.agencies[0]?.name || 'Federal Government',
    filing: {
      accession_number: record.documentNumber,
      filed_date: record.publicationDate,
    },
  };

  if (record.commentsCloseDate) {
    regulatory.compliance = {
      status: 'PENDING',
      deadline: record.commentsCloseDate,
      requirements: ['Submit public comments through regulations.gov or mail'],
    };
  }

  const symbol: DirectiveSymbol = {
    symbolId,
    version: 1,
    hash: generateHash(JSON.stringify(record)),
    category,
    subcategory: record.documentType,
    tags: [
      'federal_register',
      record.documentType.toLowerCase(),
      ...record.agencies.map((a) => a.slug),
      ...(record.significant ? ['significant_regulatory_action'] : []),
      ...(record.commentsCloseDate ? ['open_for_comment'] : []),
    ],

    who: `Federal agencies: ${agencyNames}`,
    what: record.title,
    why: record.abstract || `Federal ${record.documentTypeDescription} requiring tracking and analysis`,
    where: cfrRefs || `Federal Register Volume ${record.frLocation.volume}`,
    when: `Published: ${record.publicationDate}${
      record.effectiveDate ? `, Effective: ${record.effectiveDate}` : ''
    }${record.commentsCloseDate ? `, Comments due: ${record.commentsCloseDate}` : ''}`,

    how: {
      focus: [
        'regulatory_requirements',
        'affected_parties',
        'compliance_deadlines',
        'cfr_amendments',
      ],
      constraints: ['administrative_procedure_act', 'federal_rulemaking_process'],
      output_format: 'regulatory_impact_analysis',
    },

    commanders_intent: `Track the ${record.documentTypeDescription} "${record.title.slice(0, 100)}" from ${agencyNames}${
      record.commentsCloseDate ? ` - submit comments by ${record.commentsCloseDate}` : ''
    }`,

    requirements: [
      `Document Number: ${record.documentNumber}`,
      `Citation: ${record.citation || 'N/A'}`,
      `FR Location: ${record.frLocation.volume} FR ${record.frLocation.startPage}-${record.frLocation.endPage}`,
      `Agencies: ${agencyNames}`,
      ...(record.docketIds.length > 0 ? [`Docket IDs: ${record.docketIds.join(', ')}`] : []),
      ...(record.regulationIdNumbers.length > 0 ? [`RINs: ${record.regulationIdNumbers.join(', ')}`] : []),
      ...(cfrRefs ? [`CFR References: ${cfrRefs}`] : []),
      `Significant: ${record.significant ? 'Yes' : 'No'}`,
    ],

    created_at: now,
    updated_at: now,

    source_dataset: 'federalregister.gov',
    source_id: record.documentNumber,
    source_data: {
      document_number: record.documentNumber,
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
      fr_location: record.frLocation,
      urls: record.urls,
    },

    regulatory,

    provenance: {
      source_type: 'PRIMARY',
      source_authority: 'HIGH',
      source_urls: [record.urls.html, record.urls.pdf],
      extraction_method: 'api',
      verification_date: now,
    },

    freshness: {
      last_validated: now,
      valid_for_days: 1,
    },
  };

  return symbol;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATIONS.GOV SYMBOL MAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a Regulations.gov document to a REGULATORY symbol.
 */
export function mapRegulationsDocToSymbol(record: RegulationsDocumentRecord): DirectiveSymbol {
  const symbolId = `\u039E.RG.REGS.${sanitizeId(record.documentId)}`;
  const now = new Date().toISOString();

  // Use REGULATORY_EVENT for documents open for comment
  const category: SymbolCategory = record.commentPeriod.isOpen ? 'REGULATORY_EVENT' : 'REGULATORY';
  const subcategory = record.commentPeriod.isOpen ? 'COMMENT_PERIOD' : record.documentType;

  const regulatory: RegulatoryExtension = {
    filing_type: record.documentType,
    regulator: record.agencyId,
    filing: {
      accession_number: record.documentId,
      file_number: record.rin || undefined,
      filed_date: record.postedDate,
    },
  };

  if (record.commentPeriod.isOpen && record.commentPeriod.endDate) {
    regulatory.compliance = {
      status: 'PENDING',
      deadline: record.commentPeriod.endDate,
      requirements: ['Submit comments through regulations.gov'],
    };
  }

  const symbol: DirectiveSymbol = {
    symbolId,
    version: 1,
    hash: generateHash(JSON.stringify(record)),
    category,
    subcategory,
    tags: [
      'regulations.gov',
      record.documentType.toLowerCase().replace(/\s+/g, '_'),
      record.agencyId.toLowerCase(),
      ...(record.commentPeriod.isOpen ? ['open_for_comment'] : []),
      ...(record.isStub ? ['stub_data'] : []),
    ],

    who: `Federal agency: ${record.agencyId}`,
    what: record.title,
    why: record.abstract || `Track ${record.documentType} regulatory action`,
    where: `Regulations.gov - Docket ${record.docketId}`,
    when: `Posted: ${record.postedDate}${
      record.commentPeriod.endDate ? `, Comments due: ${record.commentPeriod.endDate}` : ''
    }${record.effectiveDate ? `, Effective: ${record.effectiveDate}` : ''}`,

    how: {
      focus: [
        'regulatory_content',
        'comment_submission',
        'affected_industries',
        'implementation_timeline',
      ],
      constraints: ['administrative_procedure_act', 'public_comment_requirements'],
      output_format: 'regulatory_summary',
    },

    commanders_intent: `Monitor ${record.agencyId}'s ${record.documentType} "${record.title.slice(0, 80)}"${
      record.commentPeriod.isOpen ? ` - comments due ${record.commentPeriod.endDate}` : ''
    }`,

    requirements: [
      `Document ID: ${record.documentId}`,
      `Docket ID: ${record.docketId}`,
      `Agency: ${record.agencyId}`,
      `Type: ${record.documentType}${record.subtype ? ` (${record.subtype})` : ''}`,
      ...(record.rin ? [`RIN: ${record.rin}`] : []),
      ...(record.frDocNum ? [`FR Doc: ${record.frDocNum}`] : []),
      ...(record.cfrPart ? [`CFR Part: ${record.cfrPart}`] : []),
      `Comment Period: ${record.commentPeriod.isOpen ? 'Open' : 'Closed'}`,
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
      fr_doc_num: record.frDocNum,
      cfr_part: record.cfrPart,
      posted_date: record.postedDate,
      comment_period: record.commentPeriod,
      effective_date: record.effectiveDate,
      topics: record.topics,
      withdrawn: record.withdrawn,
      is_stub: record.isStub,
    },

    regulatory,

    provenance: {
      source_type: record.isStub ? 'SYNTHETIC' : 'PRIMARY',
      source_authority: record.isStub ? 'LOW' : 'HIGH',
      source_urls: [
        `https://www.regulations.gov/document/${record.documentId}`,
        record.apiUrl,
      ],
      extraction_method: 'api',
      verification_date: now,
    },

    freshness: {
      last_validated: now,
      valid_for_days: record.isStub ? 1 : 1,
    },
  };

  return symbol;
}

/**
 * Map a Regulations.gov docket to a WORKFLOW symbol.
 */
export function mapRegulationsDocketToSymbol(record: RegulationsDocketRecord): DirectiveSymbol {
  const symbolId = `\u039E.WF.REGS.DOCKET.${sanitizeId(record.docketId)}`;
  const now = new Date().toISOString();

  const symbol: DirectiveSymbol = {
    symbolId,
    version: 1,
    hash: generateHash(JSON.stringify(record)),
    category: 'WORKFLOW' as SymbolCategory,
    subcategory: 'REGULATORY_DOCKET',
    tags: [
      'regulations.gov',
      'docket',
      record.docketType.toLowerCase(),
      record.agencyId.toLowerCase(),
      ...(record.isStub ? ['stub_data'] : []),
    ],

    who: `Federal agency: ${record.agencyId}`,
    what: record.title,
    why: record.abstract || `Track ${record.docketType} regulatory proceedings`,
    where: 'Regulations.gov',
    when: `Last modified: ${record.modifyDate}${
      record.effectiveDate ? `, Effective: ${record.effectiveDate}` : ''
    }`,

    how: {
      focus: [
        'docket_timeline',
        'related_documents',
        'public_comments',
        'regulatory_outcome',
      ],
      constraints: ['regulatory_process', 'administrative_record'],
      output_format: 'docket_summary',
    },

    commanders_intent: `Track the ${record.docketType} docket "${record.title.slice(0, 80)}" for ${record.agencyId}`,

    requirements: [
      `Docket ID: ${record.docketId}`,
      `Agency: ${record.agencyId}`,
      `Type: ${record.docketType}`,
      ...(record.rin ? [`RIN: ${record.rin}`] : []),
      ...(record.category ? [`Category: ${record.category}`] : []),
      ...(record.program ? [`Program: ${record.program}`] : []),
    ],

    created_at: now,
    updated_at: now,

    source_dataset: 'regulations.gov',
    source_id: record.docketId,
    source_data: {
      docket_id: record.docketId,
      title: record.title,
      short_title: record.shortTitle,
      agency_id: record.agencyId,
      docket_type: record.docketType,
      abstract: record.abstract,
      rin: record.rin,
      keywords: record.keywords,
      category: record.category,
      program: record.program,
      effective_date: record.effectiveDate,
      modify_date: record.modifyDate,
      is_stub: record.isStub,
    },

    regulatory: {
      filing_type: record.docketType,
      regulator: record.agencyId,
      filing: {
        accession_number: record.docketId,
        file_number: record.rin || undefined,
      },
    },

    provenance: {
      source_type: record.isStub ? 'SYNTHETIC' : 'PRIMARY',
      source_authority: record.isStub ? 'LOW' : 'HIGH',
      source_urls: [
        `https://www.regulations.gov/docket/${record.docketId}`,
        record.apiUrl,
      ],
      extraction_method: 'api',
      verification_date: now,
    },

    freshness: {
      last_validated: now,
      valid_for_days: record.isStub ? 1 : 1,
    },
  };

  return symbol;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED MAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Government data source types for the unified mapper.
 */
export type GovernmentDataSource =
  | 'sam'
  | 'usaspending'
  | 'federal_register'
  | 'regulations';

/**
 * Record types for the unified mapper.
 */
export type GovernmentRecord =
  | SAMEntityRecord
  | USASpendingAwardRecord
  | FederalRegisterRecord
  | RegulationsDocumentRecord
  | RegulationsDocketRecord;

/**
 * Unified mapper that routes to the appropriate specific mapper.
 */
export function mapGovernmentDataToSymbol(
  source: GovernmentDataSource,
  record: GovernmentRecord
): DirectiveSymbol {
  switch (source) {
    case 'sam':
      return mapEntityToSymbol(record as SAMEntityRecord);
    case 'usaspending':
      return mapAwardToSymbol(record as USASpendingAwardRecord);
    case 'federal_register':
      return mapFederalRegisterToSymbol(record as FederalRegisterRecord);
    case 'regulations':
      // Check if it's a docket or document
      if ('docketType' in record && !('documentType' in record)) {
        return mapRegulationsDocketToSymbol(record as RegulationsDocketRecord);
      }
      return mapRegulationsDocToSymbol(record as RegulationsDocumentRecord);
    default:
      throw new Error(`Unknown government data source: ${source}`);
  }
}

/**
 * Batch map multiple records to symbols.
 */
export function mapGovernmentDataBatch(
  source: GovernmentDataSource,
  records: GovernmentRecord[]
): DirectiveSymbol[] {
  return records.map((record) => mapGovernmentDataToSymbol(source, record));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL NAMESPACE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Government symbol namespace prefixes.
 */
export const GOVERNMENT_SYMBOL_PREFIXES = {
  /** SAM.gov entities (contractors) */
  ENTITY: '\u039E.C.GOV',
  /** USASpending awards */
  AWARD: '\u039E.TX.GOV',
  /** Federal Register rules */
  RULE: '\u039E.RG.FR.RULE',
  /** Federal Register proposed rules */
  PROPOSED_RULE: '\u039E.RG.FR.PROPOSED',
  /** Regulations.gov documents */
  REGULATION: '\u039E.RG.REGS',
  /** Regulatory dockets */
  DOCKET: '\u039E.WF.REGS.DOCKET',
  /** Presidential documents */
  PRESIDENTIAL: '\u039E.D.GOV.PRESIDENTIAL',
  /** General government documents */
  DOCUMENT: '\u039E.D.GOV',
} as const;

/**
 * Check if a symbol ID is a government symbol.
 */
export function isGovernmentSymbol(symbolId: string): boolean {
  return Object.values(GOVERNMENT_SYMBOL_PREFIXES).some((prefix) =>
    symbolId.startsWith(prefix)
  );
}

/**
 * Get the government data source from a symbol ID.
 */
export function getGovernmentSourceFromSymbol(symbolId: string): GovernmentDataSource | null {
  if (symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.ENTITY)) {
    return 'sam';
  }
  if (symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.AWARD)) {
    return 'usaspending';
  }
  if (
    symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.RULE) ||
    symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.PROPOSED_RULE) ||
    symbolId.startsWith('\u039E.D.GOV.FR') ||
    symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.PRESIDENTIAL)
  ) {
    return 'federal_register';
  }
  if (
    symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.REGULATION) ||
    symbolId.startsWith(GOVERNMENT_SYMBOL_PREFIXES.DOCKET)
  ) {
    return 'regulations';
  }
  return null;
}
