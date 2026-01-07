/**
 * Multi-Agent Data Intelligence Framework (MADIF) - Agent Templates
 *
 * Pre-built templates for common agent patterns. Templates define base
 * configurations that are customized when a specific data source is targeted.
 */

import type {
  AgentDefinition,
  AgentCapability,
  DataSourceSpec,
  DataSourceType,
  AgentResourceLimits,
  ExpectedOutputSymbol,
  RiskLevel,
  AgentCategory,
} from '../types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent template definition.
 */
export interface AgentTemplate {
  /** Unique template identifier */
  templateId: string;
  /** Human-readable name */
  name: string;
  /** Template description */
  description: string;
  /** Data source types this template handles */
  applicableSourceTypes: DataSourceType[];
  /** Base configuration shared by all agents using this template */
  baseDefinition: Partial<AgentDefinition>;
  /** Function to customize configuration for a specific source */
  configureForSource: (source: DataSourceSpec) => Partial<AgentDefinition>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REST API CONSUMER TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const RestApiConsumerTemplate: AgentTemplate = {
  templateId: 'template.rest-api-consumer',
  name: 'REST API Consumer Agent',
  description: 'Fetches data from REST APIs with authentication and rate limiting',
  applicableSourceTypes: ['rest_api'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['api_rest'],
    resourceLimits: {
      rateLimitPerMinute: 60,
      tokenBudget: 10000,
      timeoutMs: 60000, // 1 minute
      maxMemoryMb: 256,
      maxConcurrency: 5,
      maxRetries: 3,
      retryBackoffMs: 1000,
    },
    riskLevel: 'medium',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => {
    const capabilities: AgentCapability[] = ['api_rest'];

    // Add auth capability if needed
    if (source.auth?.type === 'api_key') {
      capabilities.push('auth_api_key');
    } else if (source.auth?.type === 'oauth2') {
      capabilities.push('auth_oauth2');
    } else if (source.auth?.type === 'bearer') {
      capabilities.push('auth_bearer');
    }

    return {
      dataSources: [source],
      requiredCapabilities: capabilities,
      governingFrame: '⊕◊▶β', // Strict mode, structured data, execute, verified
      expectedOutputSymbols: [
        {
          pattern: `Ξ.K.API.${sanitizeId(source.id)}.*`,
          category: 'KNOWLEDGE',
          required: true,
          description: `Data from ${source.name} API`,
        },
      ],
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// WEB SCRAPER TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const WebScraperTemplate: AgentTemplate = {
  templateId: 'template.web-scraper',
  name: 'Web Scraper Agent',
  description: 'Extracts data from web pages with robots.txt compliance',
  applicableSourceTypes: ['web_page'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['web_scraping'],
    resourceLimits: {
      rateLimitPerMinute: 10, // Respectful scraping
      tokenBudget: 50000,
      timeoutMs: 120000, // 2 minutes
      maxMemoryMb: 512,
      maxConcurrency: 2,
      maxRetries: 2,
      retryBackoffMs: 5000,
    },
    riskLevel: 'medium',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [{
      ...source,
      respectRobotsTxt: true, // Always respect robots.txt
    }],
    governingFrame: '⊕△▶β⟨⌛⟩', // Strict, discovery, execute, verified, rate-limited
    expectedOutputSymbols: [
      {
        pattern: `Ξ.D.WEB.${sanitizeId(source.id)}.*`,
        category: 'DOCUMENT',
        required: true,
        description: `Content extracted from ${source.name}`,
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB REPOSITORY SCANNER TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const GitHubScannerTemplate: AgentTemplate = {
  templateId: 'template.github-scanner',
  name: 'GitHub Repository Scanner Agent',
  description: 'Scans GitHub repositories for code patterns, documentation, and metadata',
  applicableSourceTypes: ['github'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['api_rest', 'auth_bearer'],
    resourceLimits: {
      rateLimitPerMinute: 30, // GitHub rate limits
      tokenBudget: 100000,
      timeoutMs: 180000, // 3 minutes
      maxMemoryMb: 1024,
      maxConcurrency: 3,
      maxRetries: 3,
      retryBackoffMs: 2000,
    },
    riskLevel: 'low',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β',
    expectedOutputSymbols: [
      {
        pattern: `Ξ.AS.REPO.${sanitizeId(source.id)}`,
        category: 'ASSET',
        required: true,
        description: 'Repository metadata and structure',
      },
      {
        pattern: `Ξ.K.CODE.${sanitizeId(source.id)}.*`,
        category: 'KNOWLEDGE',
        required: false,
        description: 'Code patterns and conventions',
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// HUGGINGFACE DATASET LOADER TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const HuggingFaceLoaderTemplate: AgentTemplate = {
  templateId: 'template.huggingface-loader',
  name: 'HuggingFace Dataset Loader Agent',
  description: 'Loads and processes datasets from HuggingFace Hub',
  applicableSourceTypes: ['huggingface'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['api_rest', 'file_read'],
    resourceLimits: {
      rateLimitPerMinute: 20,
      tokenBudget: 200000,
      timeoutMs: 300000, // 5 minutes (datasets can be large)
      maxMemoryMb: 2048,
      maxConcurrency: 1,
      maxRetries: 2,
      retryBackoffMs: 10000,
    },
    riskLevel: 'low',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β',
    expectedOutputSymbols: [
      {
        pattern: `Ξ.K.DATASET.${sanitizeId(source.id)}`,
        category: 'KNOWLEDGE',
        required: true,
        description: 'Dataset metadata',
      },
      {
        pattern: `Ξ.Q.${sanitizeId(source.id)}.*`,
        category: 'QUERY',
        required: false,
        description: 'Benchmark queries from dataset',
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PROCESSOR TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const DocumentProcessorTemplate: AgentTemplate = {
  templateId: 'template.document-processor',
  name: 'Document Processor Agent',
  description: 'Processes documents (PDF, DOCX, HTML) and extracts structured data',
  applicableSourceTypes: ['file'],

  baseDefinition: {
    category: 'data_processing',
    requiredCapabilities: ['file_read', 'llm_inference', 'symbol_create'],
    resourceLimits: {
      rateLimitPerMinute: 100,
      tokenBudget: 500000,
      timeoutMs: 300000, // 5 minutes
      maxMemoryMb: 1024,
      maxConcurrency: 3,
      maxRetries: 2,
      retryBackoffMs: 2000,
    },
    riskLevel: 'medium',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β',
    expectedOutputSymbols: [
      {
        pattern: `Ξ.D.DOC.${sanitizeId(source.id)}`,
        category: 'DOCUMENT',
        required: true,
        description: 'Document metadata and content',
      },
      {
        pattern: `Ξ.*.${sanitizeId(source.id)}.*`,
        category: 'KNOWLEDGE',
        required: false,
        description: 'Entities extracted from document',
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// RSS/ATOM FEED MONITOR TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const FeedMonitorTemplate: AgentTemplate = {
  templateId: 'template.feed-monitor',
  name: 'RSS/Atom Feed Monitor Agent',
  description: 'Monitors RSS/Atom feeds for new content and extracts data',
  applicableSourceTypes: ['rss_feed'],

  baseDefinition: {
    category: 'monitoring',
    requiredCapabilities: ['api_rest'],
    resourceLimits: {
      rateLimitPerMinute: 30,
      tokenBudget: 20000,
      timeoutMs: 60000, // 1 minute
      maxMemoryMb: 256,
      maxConcurrency: 10,
      maxRetries: 3,
      retryBackoffMs: 5000,
    },
    riskLevel: 'low',
    requiresApproval: false, // Low risk, can auto-approve
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊘△▶α', // Neutral mode, discovery, execute, unverified
    expectedOutputSymbols: [
      {
        pattern: `Ξ.E.FEED.${sanitizeId(source.id)}.*`,
        category: 'EVENT',
        required: true,
        description: 'Feed items as events',
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPHQL API TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const GraphQLApiTemplate: AgentTemplate = {
  templateId: 'template.graphql-api',
  name: 'GraphQL API Consumer Agent',
  description: 'Fetches data from GraphQL APIs with precise queries',
  applicableSourceTypes: ['graphql'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['api_graphql'],
    resourceLimits: {
      rateLimitPerMinute: 60,
      tokenBudget: 15000,
      timeoutMs: 60000,
      maxMemoryMb: 256,
      maxConcurrency: 5,
      maxRetries: 3,
      retryBackoffMs: 1000,
    },
    riskLevel: 'medium',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β',
    expectedOutputSymbols: [
      {
        pattern: `Ξ.K.GQL.${sanitizeId(source.id)}.*`,
        category: 'KNOWLEDGE',
        required: true,
        description: `Data from ${source.name} GraphQL API`,
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// SOAP WEB SERVICE TEMPLATE (for government legacy APIs)
// ═══════════════════════════════════════════════════════════════════════════════

export const SoapServiceTemplate: AgentTemplate = {
  templateId: 'template.soap-service',
  name: 'SOAP Web Service Agent',
  description: 'Interacts with SOAP/XML web services (common in government systems)',
  applicableSourceTypes: ['soap'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['api_soap'],
    resourceLimits: {
      rateLimitPerMinute: 20,
      tokenBudget: 30000,
      timeoutMs: 120000, // 2 minutes (SOAP can be slow)
      maxMemoryMb: 512,
      maxConcurrency: 2,
      maxRetries: 3,
      retryBackoffMs: 5000,
    },
    riskLevel: 'medium',
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β',
    expectedOutputSymbols: [
      {
        pattern: `Ξ.K.SOAP.${sanitizeId(source.id)}.*`,
        category: 'KNOWLEDGE',
        required: true,
        description: `Data from ${source.name} SOAP service`,
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE QUERY TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

export const DatabaseQueryTemplate: AgentTemplate = {
  templateId: 'template.database-query',
  name: 'Database Query Agent',
  description: 'Executes read-only queries against databases',
  applicableSourceTypes: ['database'],

  baseDefinition: {
    category: 'data_acquisition',
    requiredCapabilities: ['database_read'],
    resourceLimits: {
      rateLimitPerMinute: 30,
      tokenBudget: 50000,
      timeoutMs: 180000, // 3 minutes
      maxMemoryMb: 1024,
      maxConcurrency: 3,
      maxRetries: 2,
      retryBackoffMs: 2000,
    },
    riskLevel: 'high', // Database access is sensitive
    requiresApproval: true,
  },

  configureForSource: (source: DataSourceSpec) => ({
    dataSources: [source],
    governingFrame: '⊕◊▶β⟨🔒⟩', // Strict, verified, with security constraint
    expectedOutputSymbols: [
      {
        pattern: `Ξ.K.DB.${sanitizeId(source.id)}.*`,
        category: 'KNOWLEDGE',
        required: true,
        description: `Data from ${source.name} database`,
      },
    ],
  }),
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All available templates indexed by source type.
 */
export const TemplateRegistry: Record<DataSourceType, AgentTemplate> = {
  'rest_api': RestApiConsumerTemplate,
  'graphql': GraphQLApiTemplate,
  'soap': SoapServiceTemplate,
  'web_page': WebScraperTemplate,
  'rss_feed': FeedMonitorTemplate,
  'file': DocumentProcessorTemplate,
  'database': DatabaseQueryTemplate,
  'github': GitHubScannerTemplate,
  'huggingface': HuggingFaceLoaderTemplate,
};

/**
 * Get template for a source type.
 */
export function getTemplateForSourceType(type: DataSourceType): AgentTemplate | undefined {
  return TemplateRegistry[type];
}

/**
 * Get all available templates.
 */
export function getAllTemplates(): AgentTemplate[] {
  return Object.values(TemplateRegistry);
}

/**
 * Get template by ID.
 */
export function getTemplateById(templateId: string): AgentTemplate | undefined {
  return getAllTemplates().find(t => t.templateId === templateId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sanitize a string for use in symbol IDs.
 */
function sanitizeId(id: string): string {
  return id
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30);
}
