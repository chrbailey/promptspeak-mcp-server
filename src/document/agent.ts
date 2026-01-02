/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DOCUMENT PROCESSING AGENT
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Orchestrates the document processing pipeline:
 * 1. Parse documents (PDF, text, markdown)
 * 2. Extract entities and symbols using Claude
 * 3. Smart merge with existing symbols
 * 4. Persist updates to registry
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  DocumentSource,
  DocumentProcessingRequest,
  DocumentProcessingResult,
  ExtractionConfig,
  MergeConfig,
  ExtractedSymbolData,
} from './types.js';
import { getDocumentParser, type DocumentParser } from './parser.js';
import { getSymbolExtractor, type SymbolExtractor } from './extractor.js';
import { getSymbolMerger, type SymbolMerger } from './merger.js';
import { getSymbolManager } from '../symbols/manager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_EXTRACTION_CONFIG: Partial<ExtractionConfig> = {
  symbolTypes: ['profile', 'event', 'financial', 'risk', 'competitive'],
  extractRelationships: true,
  maxSymbolsPerType: 5,
};

const DEFAULT_MERGE_CONFIG: Partial<MergeConfig> = {
  strategy: 'smart',
  minConfidenceToUpdate: 0.7,
  preserveRequirements: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PROCESSING AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentProcessingAgent {
  private parser: DocumentParser;
  private extractor: SymbolExtractor;

  constructor(apiKey?: string) {
    this.parser = getDocumentParser();
    this.extractor = getSymbolExtractor(apiKey);
  }

  /**
   * Process documents and extract/update symbols
   */
  async process(request: DocumentProcessingRequest): Promise<DocumentProcessingResult> {
    const startTime = new Date();
    const errors: string[] = [];

    // Merge configs with defaults
    const extractionConfig: ExtractionConfig = {
      ...DEFAULT_EXTRACTION_CONFIG,
      ...request.extraction,
    };

    const mergeConfig: MergeConfig = {
      strategy: 'smart',
      ...DEFAULT_MERGE_CONFIG,
      ...request.merge,
    };

    // Process each document
    const allSymbols: ExtractedSymbolData[] = [];
    let documentsProcessed = 0;

    for (const source of request.documents) {
      try {
        // Parse document
        const parsed = await this.parser.parse(source);
        documentsProcessed++;

        // Extract symbols
        const extraction = await this.extractor.extract(parsed, extractionConfig);

        // Validate extracted symbols
        for (const symbol of extraction.symbols) {
          const validation = this.extractor.validateSymbol(symbol);
          if (validation.valid) {
            allSymbols.push(symbol);
          } else {
            errors.push(
              `Invalid symbol ${symbol.suggestedSymbolId}: ${validation.errors.join(', ')}`
            );
          }
        }

        // Add any extraction warnings/errors
        if (extraction.warnings) {
          errors.push(...extraction.warnings);
        }
        if (extraction.errors) {
          errors.push(...extraction.errors);
        }
      } catch (error) {
        errors.push(`Failed to process document: ${error}`);
      }
    }

    // If dry run, return proposed changes without persisting
    if (request.dryRun) {
      const endTime = new Date();
      return {
        success: errors.length === 0,
        documentsProcessed,
        extraction: {
          symbols: allSymbols,
          entities: [],
          metadata: {
            documentSource: request.documents.map((d) => d.path || d.url || 'content').join(', '),
            extractedAt: new Date().toISOString(),
            processingTimeMs: endTime.getTime() - startTime.getTime(),
          },
        },
        proposedChanges: allSymbols,
        metadata: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          processingTimeMs: endTime.getTime() - startTime.getTime(),
          dryRun: true,
        },
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    // Merge symbols into registry
    const merger = getSymbolMerger(mergeConfig);
    const mergeResult = await merger.mergeBatch(allSymbols);

    const endTime = new Date();

    return {
      success: errors.length === 0 && mergeResult.summary.failed === 0,
      documentsProcessed,
      extraction: {
        symbols: allSymbols,
        entities: [],
        metadata: {
          documentSource: request.documents.map((d) => d.path || d.url || 'content').join(', '),
          extractedAt: new Date().toISOString(),
          processingTimeMs: endTime.getTime() - startTime.getTime(),
        },
      },
      merge: mergeResult,
      metadata: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        processingTimeMs: endTime.getTime() - startTime.getTime(),
        dryRun: false,
      },
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Process a single document with simplified interface
   */
  async processDocument(
    source: string,
    sourceType: 'path' | 'content' | 'url',
    companyTicker: string,
    options?: {
      companyName?: string;
      documentContext?: string;
      fiscalPeriod?: string;
      symbolTypes?: ('profile' | 'event' | 'financial' | 'risk' | 'competitive')[];
      mergeStrategy?: 'smart' | 'replace' | 'append';
      dryRun?: boolean;
    }
  ): Promise<DocumentProcessingResult> {
    // Build document source
    const documentSource: DocumentSource = {
      type: this.parser.detectType(source),
    };

    switch (sourceType) {
      case 'path':
        documentSource.path = source;
        break;
      case 'content':
        documentSource.content = source;
        documentSource.type = 'text';
        break;
      case 'url':
        documentSource.url = source;
        break;
    }

    // Build request
    const request: DocumentProcessingRequest = {
      documents: [documentSource],
      extraction: {
        companyTicker,
        companyName: options?.companyName,
        documentContext: options?.documentContext,
        fiscalPeriod: options?.fiscalPeriod,
        symbolTypes: options?.symbolTypes || ['profile', 'event', 'financial', 'risk', 'competitive'],
      },
      merge: options?.mergeStrategy
        ? { strategy: options.mergeStrategy }
        : undefined,
      dryRun: options?.dryRun,
    };

    return this.process(request);
  }

  /**
   * List all symbols for a specific company
   */
  listCompanySymbols(
    companyTicker: string,
    options?: {
      category?: string;
      includeDetails?: boolean;
    }
  ): {
    companyTicker: string;
    symbols: Array<{
      symbolId: string;
      category: string;
      version: number;
      commanders_intent: string;
      updated_at?: string;
    }>;
    total: number;
  } {
    const manager = getSymbolManager();

    // List symbols that match the company ticker
    const result = manager.list({
      search: companyTicker,
      limit: 100,
    });

    // Filter to only symbols that belong to this company
    const companySymbols = result.symbols.filter((s) => {
      // Check if symbol ID contains the ticker
      const parts = s.symbolId.split('.');
      return parts.some((p) => p === companyTicker);
    });

    // Apply category filter if provided
    const filtered = options?.category
      ? companySymbols.filter((s) => s.category === options.category)
      : companySymbols;

    return {
      companyTicker,
      symbols: filtered.map((s) => ({
        symbolId: s.symbolId,
        category: s.category,
        version: s.version,
        commanders_intent: s.commanders_intent,
        updated_at: s.updated_at,
      })),
      total: filtered.length,
    };
  }

  /**
   * Get processing status and statistics
   */
  getStats(): {
    symbolsRoot: string;
    totalSymbols: number;
    byCategory: Record<string, number>;
    companies: string[];
  } {
    const manager = getSymbolManager();
    const stats = manager.getStats();

    // Get unique companies from symbol list
    const companyResult = manager.list({ category: 'COMPANY', limit: 1000 });
    const companies = new Set<string>();

    for (const symbol of companyResult.symbols) {
      const parts = symbol.symbolId.split('.');
      if (parts.length > 1 && /^[A-Z]{1,5}$/.test(parts[1])) {
        companies.add(parts[1]);
      }
    }

    return {
      symbolsRoot: 'symbols/',
      totalSymbols: stats.total_symbols,
      byCategory: stats.by_category,
      companies: Array.from(companies).sort(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let documentAgent: DocumentProcessingAgent | null = null;

export function getDocumentAgent(apiKey?: string): DocumentProcessingAgent {
  if (!documentAgent) {
    documentAgent = new DocumentProcessingAgent(apiKey);
  }
  return documentAgent;
}

export function resetDocumentAgent(): void {
  documentAgent = null;
}
