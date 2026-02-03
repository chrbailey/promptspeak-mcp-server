// =============================================================================
// LEGAL CALENDAR INTEGRATION
// =============================================================================
// Combines deadline extraction and iCal generation with batch processing
// and court rules lookup for comprehensive legal calendar management.
//
// Features:
// - Batch document processing
// - Court rules lookup
// - Deadline deduplication
// - Priority-based sorting
// - iCal export
//
// =============================================================================

import {
  DeadlineExtractor,
  createDeadlineExtractor,
} from './deadline-extractor.js';
import {
  ICalGenerator,
  createICalGenerator,
  generateICalFromDeadlines,
} from './ical-generator.js';
import type {
  ExtractedDeadline,
  DeadlineExtractionResult,
  CourtRules,
  DeadlinePriority,
  CountingMethod,
  DeadlineExtractorConfig,
} from './calendar-types.js';
import { FRCP_DEADLINES, FEDERAL_HOLIDAYS_2024_2025 } from './calendar-types.js';
import type { ICalGeneratorConfig } from './ical-generator.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A document to process for deadlines.
 */
export interface DocumentInput {
  /** Document identifier */
  id: string;

  /** Document content */
  content: string;

  /** Document type (e.g., motion, order, complaint) */
  type?: string;

  /** Filing date or service date */
  filingDate?: Date;

  /** Matter/case identifier */
  matter?: string;

  /** Court name */
  court?: string;

  /** Case number */
  caseNumber?: string;
}

/**
 * Result of processing a single document.
 */
export interface DocumentResult {
  /** Document identifier */
  documentId: string;

  /** Whether extraction succeeded */
  success: boolean;

  /** Extracted deadlines */
  deadlines: ExtractedDeadline[];

  /** Extraction metadata */
  metadata?: DeadlineExtractionResult['metadata'];

  /** Warnings */
  warnings: string[];

  /** Error message if failed */
  error?: string;
}

/**
 * Result of batch processing.
 */
export interface BatchResult {
  /** All extracted deadlines (deduplicated) */
  allDeadlines: ExtractedDeadline[];

  /** Results by document */
  documentResults: DocumentResult[];

  /** Summary statistics */
  summary: {
    documentsProcessed: number;
    documentsSucceeded: number;
    documentsFailed: number;
    totalDeadlines: number;
    uniqueDeadlines: number;
    duplicatesRemoved: number;
    byPriority: Record<DeadlinePriority, number>;
    byType: Record<string, number>;
  };

  /** Overall warnings */
  warnings: string[];
}

/**
 * Court rules configuration.
 */
export interface CourtRulesConfig {
  /** Default rules to apply */
  defaultRules: CourtRules;

  /** State-specific overrides */
  stateOverrides?: Record<string, Partial<typeof FRCP_DEADLINES>>;

  /** Additional holidays */
  additionalHolidays?: Array<{
    name: string;
    date: Date;
  }>;

  /** Custom deadline extensions (for court-specific rules) */
  extensions?: Record<string, number>;
}

/**
 * Calendar integration configuration.
 */
export interface CalendarIntegrationConfig {
  /** Deadline extractor config */
  extractor?: Partial<DeadlineExtractorConfig>;

  /** iCal generator config */
  ical?: Partial<ICalGeneratorConfig>;

  /** Court rules config */
  courtRules?: CourtRulesConfig;

  /** Whether to deduplicate deadlines across documents */
  deduplicateDeadlines?: boolean;

  /** Whether to merge similar deadlines */
  mergeSimilar?: boolean;

  /** Similarity threshold for merging (0-1) */
  similarityThreshold?: number;
}

// =============================================================================
// CALENDAR INTEGRATION CLASS
// =============================================================================

export class CalendarIntegration {
  private config: CalendarIntegrationConfig;
  private extractor: DeadlineExtractor;
  private icalGenerator: ICalGenerator;

  constructor(config: CalendarIntegrationConfig = {}) {
    this.config = {
      deduplicateDeadlines: config.deduplicateDeadlines ?? true,
      mergeSimilar: config.mergeSimilar ?? true,
      similarityThreshold: config.similarityThreshold ?? 0.8,
      ...config,
    };

    this.extractor = createDeadlineExtractor(config.extractor);
    this.icalGenerator = createICalGenerator(config.ical);
  }

  /**
   * Process a single document for deadlines.
   */
  processDocument(doc: DocumentInput): DocumentResult {
    try {
      // Configure extractor with document metadata
      this.extractor.setConfig({
        defaultBaseDate: doc.filingDate,
        matter: doc.matter,
        court: doc.court,
        caseNumber: doc.caseNumber,
        defaultCourtRules: this.config.courtRules?.defaultRules ?? 'frcp',
      });

      // Extract deadlines
      const result = this.extractor.extract(doc.content);

      // Apply court rules extensions if configured
      const deadlines = this.applyCourtRulesExtensions(result.deadlines);

      return {
        documentId: doc.id,
        success: true,
        deadlines,
        metadata: result.metadata,
        warnings: result.warnings,
      };
    } catch (error) {
      return {
        documentId: doc.id,
        success: false,
        deadlines: [],
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process multiple documents in batch.
   */
  processDocuments(documents: DocumentInput[]): BatchResult {
    const documentResults: DocumentResult[] = [];
    const allDeadlines: ExtractedDeadline[] = [];
    const warnings: string[] = [];

    // Process each document
    for (const doc of documents) {
      const result = this.processDocument(doc);
      documentResults.push(result);

      if (result.success) {
        allDeadlines.push(...result.deadlines);
      } else if (result.error) {
        warnings.push(`Document ${doc.id}: ${result.error}`);
      }
    }

    // Deduplicate if configured
    let uniqueDeadlines = allDeadlines;
    let duplicatesRemoved = 0;

    if (this.config.deduplicateDeadlines) {
      const deduped = this.deduplicateDeadlines(allDeadlines);
      uniqueDeadlines = deduped.unique;
      duplicatesRemoved = deduped.duplicatesRemoved;
    }

    // Merge similar if configured
    if (this.config.mergeSimilar) {
      uniqueDeadlines = this.mergeSimilarDeadlines(uniqueDeadlines);
    }

    // Sort by due date, then priority
    uniqueDeadlines.sort((a, b) => {
      // Deadlines with dates come first
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // Sort by date
      if (a.dueDate && b.dueDate) {
        const dateDiff = a.dueDate.getTime() - b.dueDate.getTime();
        if (dateDiff !== 0) return dateDiff;
      }

      // Then by priority
      const priorityOrder: Record<DeadlinePriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };

      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Calculate summary
    const byPriority: Record<DeadlinePriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    const byType: Record<string, number> = {};

    for (const d of uniqueDeadlines) {
      byPriority[d.priority]++;
      byType[d.type] = (byType[d.type] || 0) + 1;
    }

    return {
      allDeadlines: uniqueDeadlines,
      documentResults,
      summary: {
        documentsProcessed: documents.length,
        documentsSucceeded: documentResults.filter(r => r.success).length,
        documentsFailed: documentResults.filter(r => !r.success).length,
        totalDeadlines: allDeadlines.length,
        uniqueDeadlines: uniqueDeadlines.length,
        duplicatesRemoved,
        byPriority,
        byType,
      },
      warnings,
    };
  }

  /**
   * Generate iCal content from deadlines.
   */
  generateICal(deadlines: ExtractedDeadline[]): string {
    return this.icalGenerator.fromDeadlines(deadlines);
  }

  /**
   * Process documents and generate iCal in one step.
   */
  processAndGenerateICal(documents: DocumentInput[]): {
    batchResult: BatchResult;
    icalContent: string;
    eventsGenerated: number;
    skippedNoDate: number;
  } {
    const batchResult = this.processDocuments(documents);

    // Filter to deadlines with dates
    const deadlinesWithDates = batchResult.allDeadlines.filter(d => d.dueDate);
    const skippedNoDate = batchResult.allDeadlines.length - deadlinesWithDates.length;

    // Generate iCal
    const icalContent = this.generateICal(deadlinesWithDates);

    return {
      batchResult,
      icalContent,
      eventsGenerated: deadlinesWithDates.length,
      skippedNoDate,
    };
  }

  /**
   * Look up FRCP deadline rule.
   */
  lookupFRCPRule(ruleKey: string): { days: number; type: string; description: string } | undefined {
    return FRCP_DEADLINES[ruleKey];
  }

  /**
   * Get all FRCP deadline rules.
   */
  getAllFRCPRules(): Record<string, { days: number; type: string; description: string }> {
    return { ...FRCP_DEADLINES };
  }

  /**
   * Look up federal holidays.
   */
  getFederalHolidays(): Array<{ name: string; date: Date; observed?: Date }> {
    return [...FEDERAL_HOLIDAYS_2024_2025];
  }

  /**
   * Check if a date is a federal holiday or weekend.
   */
  isNonCourtDay(date: Date): { isNonCourtDay: boolean; reason?: string } {
    const day = date.getDay();

    if (day === 0) {
      return { isNonCourtDay: true, reason: 'Sunday' };
    }
    if (day === 6) {
      return { isNonCourtDay: true, reason: 'Saturday' };
    }

    const dateStr = date.toISOString().split('T')[0];
    const holiday = FEDERAL_HOLIDAYS_2024_2025.find(
      h => h.date.toISOString().split('T')[0] === dateStr ||
           h.observed?.toISOString().split('T')[0] === dateStr
    );

    if (holiday) {
      return { isNonCourtDay: true, reason: `Holiday: ${holiday.name}` };
    }

    return { isNonCourtDay: false };
  }

  /**
   * Calculate deadline date from base date.
   */
  calculateDeadline(
    baseDate: Date,
    days: number,
    method: CountingMethod
  ): Date {
    return this.extractor.calculateDueDate(baseDate, days, method);
  }

  /**
   * Apply court rules extensions to deadlines.
   */
  private applyCourtRulesExtensions(deadlines: ExtractedDeadline[]): ExtractedDeadline[] {
    if (!this.config.courtRules?.extensions) {
      return deadlines;
    }

    const extensions = this.config.courtRules.extensions;

    return deadlines.map(d => {
      // Check for applicable extension
      const extensionKey = `${d.type}_${d.courtRules}`;
      const additionalDays = extensions[extensionKey] || extensions[d.type];

      if (additionalDays && d.dueDate) {
        const newDueDate = new Date(d.dueDate);
        newDueDate.setDate(newDueDate.getDate() + additionalDays);

        return {
          ...d,
          dueDate: newDueDate,
          warning: d.warning
            ? `${d.warning}; Extension of ${additionalDays} days applied`
            : `Extension of ${additionalDays} days applied`,
        };
      }

      return d;
    });
  }

  /**
   * Deduplicate deadlines.
   */
  private deduplicateDeadlines(deadlines: ExtractedDeadline[]): {
    unique: ExtractedDeadline[];
    duplicatesRemoved: number;
  } {
    const seen = new Map<string, ExtractedDeadline>();

    for (const d of deadlines) {
      // Create a key based on type, due date, and description
      const dateKey = d.dueDate?.toISOString().split('T')[0] || 'no-date';
      const key = `${d.type}|${dateKey}|${d.description.substring(0, 50)}`;

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, d);
      } else {
        // Keep the one with higher confidence
        if (d.confidence > existing.confidence) {
          seen.set(key, d);
        }
      }
    }

    return {
      unique: Array.from(seen.values()),
      duplicatesRemoved: deadlines.length - seen.size,
    };
  }

  /**
   * Merge similar deadlines (e.g., same date and type from different documents).
   */
  private mergeSimilarDeadlines(deadlines: ExtractedDeadline[]): ExtractedDeadline[] {
    // For now, just return as-is. In a full implementation,
    // this would use text similarity to merge related deadlines.
    return deadlines;
  }

  /**
   * Set configuration.
   */
  setConfig(config: Partial<CalendarIntegrationConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.extractor) {
      this.extractor.setConfig(config.extractor);
    }

    if (config.ical) {
      this.icalGenerator.setConfig(config.ical);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function createCalendarIntegration(
  config?: CalendarIntegrationConfig
): CalendarIntegration {
  return new CalendarIntegration(config);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Extract deadlines from multiple documents and generate iCal.
 */
export function processDocumentsToICal(
  documents: DocumentInput[],
  config?: CalendarIntegrationConfig
): {
  deadlines: ExtractedDeadline[];
  icalContent: string;
  summary: BatchResult['summary'];
} {
  const integration = createCalendarIntegration(config);
  const result = integration.processAndGenerateICal(documents);

  return {
    deadlines: result.batchResult.allDeadlines,
    icalContent: result.icalContent,
    summary: result.batchResult.summary,
  };
}

/**
 * Quick extraction from a single document.
 */
export function extractDeadlinesFromDocument(
  content: string,
  options?: {
    courtRules?: CourtRules;
    baseDate?: Date;
    matter?: string;
    court?: string;
    caseNumber?: string;
  }
): DeadlineExtractionResult {
  const extractor = createDeadlineExtractor({
    defaultCourtRules: options?.courtRules ?? 'frcp',
    defaultBaseDate: options?.baseDate,
    matter: options?.matter,
    court: options?.court,
    caseNumber: options?.caseNumber,
  });

  return extractor.extract(content);
}

/**
 * Look up an FRCP deadline rule by key.
 */
export function lookupFRCPDeadline(
  ruleKey: string
): { days: number; type: string; description: string } | undefined {
  return FRCP_DEADLINES[ruleKey];
}

/**
 * Get deadline rules for a specific FRCP rule number.
 */
export function getDeadlinesForRule(
  ruleNumber: string
): Array<{ key: string; days: number; type: string; description: string }> {
  const prefix = `${ruleNumber}_`;
  const results: Array<{ key: string; days: number; type: string; description: string }> = [];

  for (const [key, value] of Object.entries(FRCP_DEADLINES)) {
    if (key.startsWith(prefix)) {
      results.push({ key, ...value });
    }
  }

  return results;
}
