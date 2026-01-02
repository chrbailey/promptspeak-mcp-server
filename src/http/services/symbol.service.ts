/**
 * Symbol Service
 *
 * Wraps the existing SymbolManager with HTTP-specific handling.
 * Adds user isolation and lens enforcement at the service layer.
 */

import {
  getSymbolManager,
  CreateSymbolRequest,
  CreateSymbolResponse,
  GetSymbolRequest,
  GetSymbolResponse,
  UpdateSymbolRequest,
  UpdateSymbolResponse,
  ListSymbolsRequest,
  ListSymbolsResponse,
  DeleteSymbolRequest,
  DeleteSymbolResponse,
  ImportSymbolsRequest,
  ImportSymbolsResponse,
} from '../../symbols/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../middleware/error-handler.js';

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class SymbolService {
  /**
   * Create a new symbol
   */
  async create(
    userId: string,
    request: Omit<CreateSymbolRequest, 'created_by'>
  ): Promise<CreateSymbolResponse> {
    const manager = getSymbolManager();

    const fullRequest: CreateSymbolRequest = {
      ...request,
      created_by: userId,
    };

    const result = manager.create(fullRequest);

    if (!result.success) {
      if (result.error?.includes('already exists')) {
        throw new ConflictError(result.error);
      }
      throw new Error(result.error || 'Failed to create symbol');
    }

    return result;
  }

  /**
   * Get a symbol by ID
   */
  async get(
    userId: string,
    symbolId: string,
    options?: { version?: number; includeChangelog?: boolean }
  ): Promise<GetSymbolResponse> {
    const manager = getSymbolManager();

    const request: GetSymbolRequest = {
      symbolId,
      version: options?.version,
      include_changelog: options?.includeChangelog,
    };

    const result = manager.get(request);

    if (!result.found) {
      throw new NotFoundError('Symbol', symbolId);
    }

    return result;
  }

  /**
   * Update a symbol
   */
  async update(
    userId: string,
    symbolId: string,
    changes: Partial<CreateSymbolRequest>,
    changeDescription: string
  ): Promise<UpdateSymbolResponse> {
    const manager = getSymbolManager();

    // First verify the symbol exists
    const existing = manager.get({ symbolId });
    if (!existing.found) {
      throw new NotFoundError('Symbol', symbolId);
    }

    const request: UpdateSymbolRequest = {
      symbolId,
      changes,
      change_description: changeDescription,
      changed_by: userId,
    };

    const result = manager.update(request);

    if (!result.success) {
      throw new Error(result.error || 'Failed to update symbol');
    }

    return result;
  }

  /**
   * List symbols with filtering
   */
  async list(
    userId: string,
    options?: {
      category?: string;
      tags?: string[];
      createdAfter?: string;
      createdBefore?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ListSymbolsResponse> {
    const manager = getSymbolManager();

    const request: ListSymbolsRequest = {
      category: options?.category as any,
      tags: options?.tags,
      created_after: options?.createdAfter,
      created_before: options?.createdBefore,
      search: options?.search,
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    };

    return manager.list(request);
  }

  /**
   * Delete a symbol
   */
  async delete(
    userId: string,
    symbolId: string,
    reason: string
  ): Promise<DeleteSymbolResponse> {
    const manager = getSymbolManager();

    // Verify the symbol exists
    const existing = manager.get({ symbolId });
    if (!existing.found) {
      throw new NotFoundError('Symbol', symbolId);
    }

    const request: DeleteSymbolRequest = {
      symbolId,
      reason,
    };

    const result = manager.delete(request);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete symbol');
    }

    return result;
  }

  /**
   * Import symbols from external source
   */
  async import(
    userId: string,
    request: ImportSymbolsRequest
  ): Promise<ImportSymbolsResponse> {
    const manager = getSymbolManager();

    // Add created_by to defaults if not present
    const fullRequest: ImportSymbolsRequest = {
      ...request,
      defaults: {
        ...request.defaults,
        created_by: userId,
      },
    };

    return manager.import(fullRequest);
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<{
    total_symbols: number;
    by_category: Record<string, number>;
  }> {
    const manager = getSymbolManager();
    return manager.getStats();
  }

  /**
   * Format a symbol for prompt injection
   */
  async format(
    userId: string,
    symbolId: string,
    format: 'full' | 'compact' | 'requirements_only' = 'full'
  ): Promise<{ formatted: string }> {
    const manager = getSymbolManager();

    // Verify symbol exists
    const existing = manager.get({ symbolId });
    if (!existing.found || !existing.symbol) {
      throw new NotFoundError('Symbol', symbolId);
    }

    const symbol = existing.symbol;

    // Format based on requested format
    let formatted: string;

    switch (format) {
      case 'compact':
        formatted = this.formatCompact(symbol);
        break;
      case 'requirements_only':
        formatted = this.formatRequirementsOnly(symbol);
        break;
      case 'full':
      default:
        formatted = this.formatFull(symbol);
        break;
    }

    return { formatted };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FORMATTING HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private formatFull(symbol: any): string {
    return `
═══════════════════════════════════════════════════════════════════════════════
SYMBOL: ${symbol.symbolId} (v${symbol.version}, hash: ${symbol.hash})
═══════════════════════════════════════════════════════════════════════════════

COMMANDER'S INTENT:
${symbol.commanders_intent}

5W+H FRAMEWORK:
• WHO: ${symbol.who}
• WHAT: ${symbol.what}
• WHY: ${symbol.why}
• WHERE: ${symbol.where}
• WHEN: ${symbol.when}
• HOW:
  - Focus: ${symbol.how?.focus?.join(', ') || 'N/A'}
  - Constraints: ${symbol.how?.constraints?.join(', ') || 'N/A'}
  - Output Format: ${symbol.how?.output_format || 'N/A'}

REQUIREMENTS:
${symbol.requirements?.map((r: string) => `✓ ${r}`).join('\n') || 'None specified'}

ANTI-REQUIREMENTS:
${symbol.anti_requirements?.map((r: string) => `✗ ${r}`).join('\n') || 'None specified'}

KEY TERMS:
${symbol.key_terms?.join(', ') || 'None specified'}
═══════════════════════════════════════════════════════════════════════════════
`.trim();
  }

  private formatCompact(symbol: any): string {
    return `
[${symbol.symbolId}] ${symbol.commanders_intent}
Focus: ${symbol.how?.focus?.join(', ') || 'N/A'}
Constraints: ${symbol.how?.constraints?.join(', ') || 'N/A'}
Requirements: ${symbol.requirements?.join('; ') || 'None'}
`.trim();
  }

  private formatRequirementsOnly(symbol: any): string {
    const requirements = symbol.requirements || [];
    const antiRequirements = symbol.anti_requirements || [];
    const constraints = symbol.how?.constraints || [];

    return `
[${symbol.symbolId}] Grounding Requirements:

MUST INCLUDE:
${requirements.map((r: string) => `• ${r}`).join('\n') || '• None specified'}

MUST NOT INCLUDE:
${antiRequirements.map((r: string) => `• ${r}`).join('\n') || '• None specified'}

CONSTRAINTS:
${constraints.map((c: string) => `• ${c}`).join('\n') || '• None specified'}
`.trim();
  }
}

// Singleton instance
let symbolService: SymbolService | null = null;

export function getSymbolService(): SymbolService {
  if (!symbolService) {
    symbolService = new SymbolService();
  }
  return symbolService;
}
