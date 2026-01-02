/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYMBOL MERGER
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Implements smart merge logic for updating existing symbols with new extracted
 * data. Supports different merge strategies and conflict resolution.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type {
  MergeConfig,
  MergeResult,
  BatchMergeResult,
  FieldChange,
  ExtractedSymbolData,
} from './types.js';
import type { DirectiveSymbol, CreateSymbolRequest } from '../symbols/types.js';
import { getSymbolManager, type SymbolManager } from '../symbols/manager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MERGE_CONFIG: MergeConfig = {
  strategy: 'smart',
  minConfidenceToUpdate: 0.7,
  protectedFields: ['symbolId', 'created_at', 'created_by'],
  preserveRequirements: true,
  verbose: false,
};

// Fields that are arrays and should be merged, not replaced
const ARRAY_MERGE_FIELDS = new Set([
  'requirements',
  'anti_requirements',
  'key_terms',
  'tags',
  'related_symbols',
]);

// Fields in the 'how' object
const HOW_FIELDS = new Set(['focus', 'constraints', 'output_format']);

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL MERGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SymbolMerger {
  private symbolManager: SymbolManager;
  private config: MergeConfig;

  constructor(config?: Partial<MergeConfig>) {
    this.symbolManager = getSymbolManager();
    this.config = { ...DEFAULT_MERGE_CONFIG, ...config };
  }

  /**
   * Merge a batch of extracted symbols into the registry
   */
  async mergeBatch(symbols: ExtractedSymbolData[]): Promise<BatchMergeResult> {
    const startTime = new Date();
    const results: MergeResult[] = [];

    const summary = {
      total: symbols.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
    };

    for (const symbol of symbols) {
      const result = await this.mergeSymbol(symbol);
      results.push(result);

      switch (result.action) {
        case 'created':
          summary.created++;
          break;
        case 'updated':
          summary.updated++;
          break;
        case 'unchanged':
          summary.unchanged++;
          break;
        case 'skipped':
          summary.skipped++;
          break;
      }

      if (!result.success) {
        summary.failed++;
      }
    }

    const endTime = new Date();

    return {
      results,
      summary,
      metadata: {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        processingTimeMs: endTime.getTime() - startTime.getTime(),
      },
    };
  }

  /**
   * Merge a single extracted symbol into the registry
   */
  async mergeSymbol(extracted: ExtractedSymbolData): Promise<MergeResult> {
    const symbolId = extracted.suggestedSymbolId;

    // Check confidence threshold
    if (extracted.confidence < (this.config.minConfidenceToUpdate || 0)) {
      return {
        symbolId,
        action: 'skipped',
        changes: [],
        reason: `Confidence ${extracted.confidence} below threshold ${this.config.minConfidenceToUpdate}`,
        success: true,
      };
    }

    // Check if symbol exists
    const existing = this.symbolManager.get({ symbolId });

    if (!existing.found || !existing.symbol) {
      // Create new symbol
      return this.createSymbol(extracted);
    }

    // Apply merge strategy
    switch (this.config.strategy) {
      case 'replace':
        return this.replaceSymbol(existing.symbol, extracted);
      case 'append':
        return this.appendToSymbol(existing.symbol, extracted);
      case 'smart':
      default:
        return this.smartMergeSymbol(existing.symbol, extracted);
    }
  }

  /**
   * Create a new symbol from extracted data
   */
  private createSymbol(extracted: ExtractedSymbolData): MergeResult {
    const request: CreateSymbolRequest = {
      symbolId: extracted.suggestedSymbolId,
      category: extracted.category,
      subcategory: extracted.subcategory,
      tags: extracted.tags,
      who: extracted.who,
      what: extracted.what,
      why: extracted.why,
      where: extracted.where,
      when: extracted.when,
      how: extracted.how,
      commanders_intent: extracted.commanders_intent,
      requirements: extracted.requirements,
      anti_requirements: extracted.anti_requirements,
      key_terms: extracted.key_terms,
      created_by: 'document-agent',
    };

    const result = this.symbolManager.create(request);

    if (result.success) {
      return {
        symbolId: extracted.suggestedSymbolId,
        action: 'created',
        newVersion: 1,
        changes: this.computeCreationChanges(extracted),
        reason: 'New symbol created from document extraction',
        success: true,
      };
    }

    return {
      symbolId: extracted.suggestedSymbolId,
      action: 'skipped',
      changes: [],
      reason: result.error || 'Failed to create symbol',
      success: false,
      error: result.error,
    };
  }

  /**
   * Replace existing symbol entirely (except protected fields)
   */
  private replaceSymbol(
    existing: DirectiveSymbol,
    extracted: ExtractedSymbolData
  ): MergeResult {
    const changes = this.computeChanges(existing, extracted);

    // If no meaningful changes, skip
    if (changes.filter((c) => c.changeType !== 'unchanged').length === 0) {
      return {
        symbolId: existing.symbolId,
        action: 'unchanged',
        oldVersion: existing.version,
        newVersion: existing.version,
        changes,
        reason: 'No changes detected',
        success: true,
      };
    }

    // Build update request
    const updateChanges: Partial<DirectiveSymbol> = {};

    // Apply all non-protected fields
    const fieldsToUpdate = [
      'who', 'what', 'why', 'where', 'when', 'how',
      'commanders_intent', 'requirements', 'anti_requirements',
      'key_terms', 'tags', 'subcategory',
    ];

    const extractedRecord = extracted as unknown as Record<string, unknown>;
    const updateRecord = updateChanges as unknown as Record<string, unknown>;
    for (const field of fieldsToUpdate) {
      if (!this.config.protectedFields?.includes(field as keyof DirectiveSymbol)) {
        const value = extractedRecord[field];
        if (value !== undefined) {
          updateRecord[field] = value;
        }
      }
    }

    const result = this.symbolManager.update({
      symbolId: existing.symbolId,
      changes: updateChanges,
      change_description: `Replaced via document extraction (confidence: ${extracted.confidence})`,
      changed_by: 'document-agent',
    });

    if (result.success) {
      return {
        symbolId: existing.symbolId,
        action: 'updated',
        oldVersion: result.old_version,
        newVersion: result.new_version,
        changes,
        reason: 'Symbol replaced with extracted data',
        success: true,
      };
    }

    return {
      symbolId: existing.symbolId,
      action: 'skipped',
      oldVersion: existing.version,
      changes,
      reason: result.error || 'Failed to update symbol',
      success: false,
      error: result.error,
    };
  }

  /**
   * Append new data to existing symbol (only add, never remove)
   */
  private appendToSymbol(
    existing: DirectiveSymbol,
    extracted: ExtractedSymbolData
  ): MergeResult {
    const changes: FieldChange[] = [];
    const updateChanges: Partial<DirectiveSymbol> = {};

    const existingRecord = existing as unknown as Record<string, unknown>;
    const extractedRecord = extracted as unknown as Record<string, unknown>;
    const updateRecord = updateChanges as unknown as Record<string, unknown>;

    // Merge array fields
    for (const field of ARRAY_MERGE_FIELDS) {
      const existingValue = existingRecord[field] as string[] | undefined;
      const extractedValue = extractedRecord[field] as string[] | undefined;

      if (extractedValue && extractedValue.length > 0) {
        const merged = this.mergeArrays(existingValue || [], extractedValue);
        const added = merged.filter((v) => !existingValue?.includes(v));

        if (added.length > 0) {
          updateRecord[field] = merged;
          changes.push({
            field,
            oldValue: existingValue,
            newValue: merged,
            changeType: 'modified',
          });
        }
      }
    }

    // Merge how.focus and how.constraints
    if (extracted.how) {
      const mergedHow = { ...existing.how };

      if (extracted.how.focus) {
        mergedHow.focus = this.mergeArrays(existing.how.focus, extracted.how.focus);
        if (mergedHow.focus.length !== existing.how.focus.length) {
          changes.push({
            field: 'how.focus',
            oldValue: existing.how.focus,
            newValue: mergedHow.focus,
            changeType: 'modified',
          });
        }
      }

      if (extracted.how.constraints) {
        mergedHow.constraints = this.mergeArrays(
          existing.how.constraints,
          extracted.how.constraints
        );
        if (mergedHow.constraints.length !== existing.how.constraints.length) {
          changes.push({
            field: 'how.constraints',
            oldValue: existing.how.constraints,
            newValue: mergedHow.constraints,
            changeType: 'modified',
          });
        }
      }

      if (changes.some((c) => c.field.startsWith('how.'))) {
        updateChanges.how = mergedHow;
      }
    }

    // If no changes, return unchanged
    if (Object.keys(updateChanges).length === 0) {
      return {
        symbolId: existing.symbolId,
        action: 'unchanged',
        oldVersion: existing.version,
        newVersion: existing.version,
        changes,
        reason: 'No new data to append',
        success: true,
      };
    }

    const result = this.symbolManager.update({
      symbolId: existing.symbolId,
      changes: updateChanges,
      change_description: `Appended data from document extraction`,
      changed_by: 'document-agent',
    });

    if (result.success) {
      return {
        symbolId: existing.symbolId,
        action: 'updated',
        oldVersion: result.old_version,
        newVersion: result.new_version,
        changes,
        reason: 'New data appended to symbol',
        success: true,
      };
    }

    return {
      symbolId: existing.symbolId,
      action: 'skipped',
      oldVersion: existing.version,
      changes,
      reason: result.error || 'Failed to update symbol',
      success: false,
      error: result.error,
    };
  }

  /**
   * Smart merge: Update only if extracted data is more specific or complete
   */
  private smartMergeSymbol(
    existing: DirectiveSymbol,
    extracted: ExtractedSymbolData
  ): MergeResult {
    const changes: FieldChange[] = [];
    const updateChanges: Partial<DirectiveSymbol> = {};

    const existingRecord = existing as unknown as Record<string, unknown>;
    const extractedRecord = extracted as unknown as Record<string, unknown>;
    const updateRecord = updateChanges as unknown as Record<string, unknown>;

    // Compare each field and decide whether to update
    const fieldsToCompare: Array<{ field: string; isArray: boolean }> = [
      { field: 'who', isArray: false },
      { field: 'what', isArray: false },
      { field: 'why', isArray: false },
      { field: 'where', isArray: false },
      { field: 'when', isArray: false },
      { field: 'commanders_intent', isArray: false },
      { field: 'subcategory', isArray: false },
      { field: 'requirements', isArray: true },
      { field: 'anti_requirements', isArray: true },
      { field: 'key_terms', isArray: true },
      { field: 'tags', isArray: true },
    ];

    for (const { field, isArray } of fieldsToCompare) {
      // Skip protected fields
      if (this.config.protectedFields?.includes(field as keyof DirectiveSymbol)) {
        continue;
      }

      const existingValue = existingRecord[field];
      const extractedValue = extractedRecord[field];

      if (extractedValue === undefined) continue;

      if (isArray) {
        // For arrays, merge and check for additions
        const existingArr = (existingValue as string[]) || [];
        const extractedArr = extractedValue as string[];

        if (this.config.preserveRequirements && field === 'requirements') {
          // For requirements, only add new ones, never remove
          const merged = this.mergeArrays(existingArr, extractedArr);
          if (merged.length > existingArr.length) {
            updateRecord[field] = merged;
            changes.push({
              field,
              oldValue: existingArr,
              newValue: merged,
              changeType: 'modified',
              confidence: extracted.confidence,
            });
          }
        } else {
          // For other arrays, merge
          const merged = this.mergeArrays(existingArr, extractedArr);
          if (JSON.stringify(merged) !== JSON.stringify(existingArr)) {
            updateRecord[field] = merged;
            changes.push({
              field,
              oldValue: existingArr,
              newValue: merged,
              changeType: 'modified',
              confidence: extracted.confidence,
            });
          }
        }
      } else {
        // For scalar fields, update if extracted is more specific
        const shouldUpdate = this.shouldUpdateScalar(
          existingValue as string,
          extractedValue as string,
          extracted.confidence
        );

        if (shouldUpdate) {
          updateRecord[field] = extractedValue;
          changes.push({
            field,
            oldValue: existingValue,
            newValue: extractedValue,
            changeType: existingValue ? 'modified' : 'added',
            confidence: extracted.confidence,
          });
        }
      }
    }

    // Handle 'how' object specially
    if (extracted.how) {
      const existingHow = existing.how;
      const mergedHow = { ...existingHow };
      let howChanged = false;

      // Merge focus
      const mergedFocus = this.mergeArrays(existingHow.focus, extracted.how.focus);
      if (JSON.stringify(mergedFocus) !== JSON.stringify(existingHow.focus)) {
        mergedHow.focus = mergedFocus;
        howChanged = true;
        changes.push({
          field: 'how.focus',
          oldValue: existingHow.focus,
          newValue: mergedFocus,
          changeType: 'modified',
          confidence: extracted.confidence,
        });
      }

      // Merge constraints
      const mergedConstraints = this.mergeArrays(
        existingHow.constraints,
        extracted.how.constraints
      );
      if (JSON.stringify(mergedConstraints) !== JSON.stringify(existingHow.constraints)) {
        mergedHow.constraints = mergedConstraints;
        howChanged = true;
        changes.push({
          field: 'how.constraints',
          oldValue: existingHow.constraints,
          newValue: mergedConstraints,
          changeType: 'modified',
          confidence: extracted.confidence,
        });
      }

      // Update output_format if more specific
      if (
        extracted.how.output_format &&
        this.shouldUpdateScalar(
          existingHow.output_format,
          extracted.how.output_format,
          extracted.confidence
        )
      ) {
        mergedHow.output_format = extracted.how.output_format;
        howChanged = true;
        changes.push({
          field: 'how.output_format',
          oldValue: existingHow.output_format,
          newValue: extracted.how.output_format,
          changeType: existingHow.output_format ? 'modified' : 'added',
          confidence: extracted.confidence,
        });
      }

      if (howChanged) {
        updateChanges.how = mergedHow;
      }
    }

    // If no changes, return unchanged
    if (Object.keys(updateChanges).length === 0) {
      return {
        symbolId: existing.symbolId,
        action: 'unchanged',
        oldVersion: existing.version,
        newVersion: existing.version,
        changes,
        reason: 'No updates warranted by smart merge',
        success: true,
      };
    }

    const result = this.symbolManager.update({
      symbolId: existing.symbolId,
      changes: updateChanges,
      change_description: `Smart merge from document extraction (confidence: ${extracted.confidence})`,
      changed_by: 'document-agent',
    });

    if (result.success) {
      return {
        symbolId: existing.symbolId,
        action: 'updated',
        oldVersion: result.old_version,
        newVersion: result.new_version,
        changes,
        reason: `Smart merge updated ${changes.length} field(s)`,
        success: true,
      };
    }

    return {
      symbolId: existing.symbolId,
      action: 'skipped',
      oldVersion: existing.version,
      changes,
      reason: result.error || 'Failed to update symbol',
      success: false,
      error: result.error,
    };
  }

  /**
   * Determine if a scalar value should be updated
   */
  private shouldUpdateScalar(
    existing: string | undefined,
    extracted: string,
    confidence: number
  ): boolean {
    // If nothing exists, update
    if (!existing || existing.length === 0) {
      return true;
    }

    // If confidence is high and extracted is longer/more specific, update
    if (confidence >= 0.8 && extracted.length > existing.length * 1.2) {
      return true;
    }

    // If very high confidence, always update
    if (confidence >= 0.95) {
      return true;
    }

    return false;
  }

  /**
   * Merge two arrays, preserving order and removing duplicates
   */
  private mergeArrays(existing: string[], extracted: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    // Add existing first
    for (const item of existing) {
      const normalized = item.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(item);
      }
    }

    // Add new items from extracted
    for (const item of extracted) {
      const normalized = item.toLowerCase().trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Compute changes for a new symbol creation
   */
  private computeCreationChanges(extracted: ExtractedSymbolData): FieldChange[] {
    const fields = [
      'who', 'what', 'why', 'where', 'when', 'commanders_intent',
      'requirements', 'anti_requirements', 'key_terms', 'tags',
    ];

    const extractedRecord = extracted as unknown as Record<string, unknown>;
    return fields
      .filter((field) => extractedRecord[field] !== undefined)
      .map((field) => ({
        field,
        oldValue: undefined,
        newValue: extractedRecord[field],
        changeType: 'added' as const,
        confidence: extracted.confidence,
      }));
  }

  /**
   * Compute detailed changes between existing and extracted
   */
  private computeChanges(
    existing: DirectiveSymbol,
    extracted: ExtractedSymbolData
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const fields = [
      'who', 'what', 'why', 'where', 'when', 'commanders_intent',
      'subcategory', 'requirements', 'anti_requirements', 'key_terms', 'tags',
    ];

    const existingRecord = existing as unknown as Record<string, unknown>;
    const extractedRecord = extracted as unknown as Record<string, unknown>;

    for (const field of fields) {
      const existingValue = existingRecord[field];
      const extractedValue = extractedRecord[field];

      if (extractedValue === undefined) continue;

      let changeType: FieldChange['changeType'] = 'unchanged';

      if (existingValue === undefined && extractedValue !== undefined) {
        changeType = 'added';
      } else if (JSON.stringify(existingValue) !== JSON.stringify(extractedValue)) {
        changeType = 'modified';
      }

      changes.push({
        field,
        oldValue: existingValue,
        newValue: extractedValue,
        changeType,
        confidence: extracted.confidence,
      });
    }

    return changes;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let symbolMerger: SymbolMerger | null = null;

export function getSymbolMerger(config?: Partial<MergeConfig>): SymbolMerger {
  if (!symbolMerger || config) {
    symbolMerger = new SymbolMerger(config);
  }
  return symbolMerger;
}

export function resetSymbolMerger(): void {
  symbolMerger = null;
}
