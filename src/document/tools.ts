/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENT PROCESSING MCP TOOLS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * MCP tool definitions for document processing operations.
 * These tools integrate with the existing PromptSpeak MCP server.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDocumentAgent } from './agent.js';
import type {
  ProcessDocumentRequest,
  ProcessDocumentResponse,
  ListCompanySymbolsRequest,
  ListCompanySymbolsResponse,
  MergeStrategy,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const documentToolDefinitions: Tool[] = [
  {
    name: 'ps_document_process',
    description: `Process a document to extract and update PromptSpeak symbols for a company.

Supports:
- PDF files (10-K, 10-Q, earnings transcripts)
- Text and Markdown files
- Direct text content

Extracts:
- Company profile symbols (business model, products, leadership)
- Event symbols (earnings, launches, acquisitions)
- Financial symbols (metrics, guidance, performance)
- Risk symbols (risk factors, challenges)
- Competitive symbols (market position, competitors)

Uses smart merge to update existing symbols while preserving valid data.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'File path, URL, or direct text content to process',
        },
        sourceType: {
          type: 'string',
          enum: ['path', 'content', 'url'],
          description: 'Type of source: "path" for file, "content" for direct text, "url" for web',
        },
        companyTicker: {
          type: 'string',
          description: 'Company stock ticker (e.g., "NVDA", "AAPL")',
        },
        companyName: {
          type: 'string',
          description: 'Full company name for context',
        },
        documentContext: {
          type: 'string',
          description: 'Document type: "10-K", "10-Q", "earnings_call", "press_release", etc.',
        },
        fiscalPeriod: {
          type: 'string',
          description: 'Fiscal period (e.g., "Q3FY25", "FY2024")',
        },
        symbolTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['profile', 'event', 'financial', 'risk', 'competitive'],
          },
          description: 'Types of symbols to extract',
        },
        mergeStrategy: {
          type: 'string',
          enum: ['smart', 'replace', 'append'],
          description: 'How to merge with existing symbols: "smart" (default), "replace", or "append"',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, shows what would be created/updated without persisting',
        },
      },
      required: ['source', 'sourceType', 'companyTicker'],
    },
  },
  {
    name: 'ps_document_batch',
    description: 'Process multiple documents for a company in a single operation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object' as const,
            properties: {
              source: { type: 'string' },
              sourceType: { type: 'string', enum: ['path', 'content', 'url'] },
              documentContext: { type: 'string' },
              fiscalPeriod: { type: 'string' },
            },
            required: ['source', 'sourceType'],
          },
          description: 'Array of documents to process',
        },
        companyTicker: {
          type: 'string',
          description: 'Company stock ticker',
        },
        companyName: {
          type: 'string',
          description: 'Full company name',
        },
        symbolTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['profile', 'event', 'financial', 'risk', 'competitive'],
          },
        },
        mergeStrategy: {
          type: 'string',
          enum: ['smart', 'replace', 'append'],
        },
        dryRun: {
          type: 'boolean',
        },
      },
      required: ['documents', 'companyTicker'],
    },
  },
  {
    name: 'ps_document_company_symbols',
    description: 'List all symbols for a specific company.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        companyTicker: {
          type: 'string',
          description: 'Company stock ticker',
        },
        category: {
          type: 'string',
          enum: ['COMPANY', 'PERSON', 'EVENT', 'SECTOR', 'TASK', 'KNOWLEDGE', 'QUERY'],
          description: 'Filter by symbol category',
        },
        includeDetails: {
          type: 'boolean',
          description: 'Include full symbol details',
        },
      },
      required: ['companyTicker'],
    },
  },
  {
    name: 'ps_document_stats',
    description: 'Get document processing statistics and registry overview.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function handleDocumentTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const agent = getDocumentAgent();

  switch (name) {
    case 'ps_document_process': {
      const request = args as unknown as ProcessDocumentRequest;

      const result = await agent.processDocument(
        request.source,
        request.sourceType,
        request.companyTicker,
        {
          companyName: request.companyName,
          documentContext: request.documentContext,
          fiscalPeriod: request.fiscalPeriod,
          symbolTypes: request.symbolTypes,
          mergeStrategy: request.mergeStrategy as MergeStrategy,
          dryRun: request.dryRun,
        }
      );

      // Build response
      const response: ProcessDocumentResponse = {
        success: result.success,
        symbolsCreated: [],
        symbolsUpdated: [],
        symbolsUnchanged: [],
        processingTimeMs: result.metadata.processingTimeMs,
      };

      if (result.merge) {
        for (const r of result.merge.results) {
          switch (r.action) {
            case 'created':
              response.symbolsCreated.push(r.symbolId);
              break;
            case 'updated':
              response.symbolsUpdated.push(r.symbolId);
              break;
            case 'unchanged':
              response.symbolsUnchanged.push(r.symbolId);
              break;
          }
        }
      }

      if (result.proposedChanges) {
        // Dry run - return proposed symbols
        return {
          ...response,
          dryRun: true,
          proposedSymbols: result.proposedChanges.map((s) => ({
            symbolId: s.suggestedSymbolId,
            category: s.category,
            commanders_intent: s.commanders_intent,
            confidence: s.confidence,
          })),
        };
      }

      if (result.errors) {
        response.errors = result.errors;
      }

      return response;
    }

    case 'ps_document_batch': {
      const { documents, companyTicker, companyName, symbolTypes, mergeStrategy, dryRun } =
        args as {
          documents: Array<{
            source: string;
            sourceType: 'path' | 'content' | 'url';
            documentContext?: string;
            fiscalPeriod?: string;
          }>;
          companyTicker: string;
          companyName?: string;
          symbolTypes?: ('profile' | 'event' | 'financial' | 'risk' | 'competitive')[];
          mergeStrategy?: MergeStrategy;
          dryRun?: boolean;
        };

      // Build document sources
      const documentSources = documents.map((doc) => {
        const source: Record<string, unknown> = {
          type: 'text',
        };

        switch (doc.sourceType) {
          case 'path':
            source.path = doc.source;
            break;
          case 'content':
            source.content = doc.source;
            break;
          case 'url':
            source.url = doc.source;
            break;
        }

        return source;
      });

      const result = await agent.process({
        documents: documentSources as any,
        extraction: {
          companyTicker,
          companyName,
          symbolTypes: symbolTypes || ['profile', 'event', 'financial', 'risk', 'competitive'],
        },
        merge: mergeStrategy ? { strategy: mergeStrategy } : undefined,
        dryRun,
      });

      return {
        success: result.success,
        documentsProcessed: result.documentsProcessed,
        symbolsExtracted: result.extraction.symbols.length,
        merge: result.merge
          ? {
              created: result.merge.summary.created,
              updated: result.merge.summary.updated,
              unchanged: result.merge.summary.unchanged,
              failed: result.merge.summary.failed,
            }
          : undefined,
        proposedChanges: result.proposedChanges?.length,
        processingTimeMs: result.metadata.processingTimeMs,
        errors: result.errors,
      };
    }

    case 'ps_document_company_symbols': {
      const { companyTicker, category, includeDetails } = args as unknown as ListCompanySymbolsRequest;

      const result = agent.listCompanySymbols(companyTicker, {
        category,
        includeDetails,
      });

      return result;
    }

    case 'ps_document_stats': {
      return agent.getStats();
    }

    default:
      throw new Error(`Unknown document tool: ${name}`);
  }
}
