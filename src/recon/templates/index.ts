/**
 * ===============================================================================
 * MISSION TEMPLATES
 * ===============================================================================
 *
 * Pre-configured mission templates for common reconnaissance scenarios.
 * Templates provide sensible defaults, reducing configuration overhead while
 * remaining fully customizable via overrides.
 *
 * Usage:
 * ```typescript
 * import { TEMPLATE_REGISTRY, createMissionFromTemplate } from './templates';
 *
 * // List available templates
 * const templates = TEMPLATE_REGISTRY.getAll();
 *
 * // Create a mission from a template
 * const symbol = createMissionFromTemplate({
 *   templateId: 'refund-request',
 *   createdBy: 'user:chris',
 *   target: { organization: 'Acme Corp' },
 * });
 *
 * // Or use the template directly
 * const template = TEMPLATE_REGISTRY.get('refund-request');
 * const symbol = template.createMission({ created_by: 'user:chris' });
 * ```
 *
 * ===============================================================================
 */

// Export types
export * from './types';

// Export category templates
export * from './customer-service';
export * from './sales';
export * from './support';

// Import templates for registry
import { customerServiceTemplates } from './customer-service';
import { salesTemplates } from './sales';
import { supportTemplates } from './support';

import {
  MissionTemplate,
  TemplateRegistry,
  TemplateCategory,
  CreateMissionFromTemplateRequest,
  mergeTargetInfo,
} from './types';
import { MarineReconSymbol, TargetInfo } from '../types';

// ===============================================================================
// TEMPLATE REGISTRY
// ===============================================================================

/**
 * In-memory template registry implementation.
 */
class TemplateRegistryImpl implements TemplateRegistry {
  private templates: Map<string, MissionTemplate> = new Map();

  /**
   * Get a template by ID.
   */
  get(id: string): MissionTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Get all registered templates.
   */
  getAll(): MissionTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get templates by category.
   */
  getByCategory(category: TemplateCategory): MissionTemplate[] {
    return this.getAll().filter(t => t.category === category);
  }

  /**
   * Search templates by tag.
   */
  getByTag(tag: string): MissionTemplate[] {
    const lowerTag = tag.toLowerCase();
    return this.getAll().filter(t =>
      t.tags.some(templateTag => templateTag.toLowerCase().includes(lowerTag))
    );
  }

  /**
   * Register a new template.
   */
  register(template: MissionTemplate): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template with ID '${template.id}' is already registered`);
    }
    this.templates.set(template.id, template);
  }

  /**
   * List all template IDs.
   */
  listIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if a template exists.
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }
}

// Create and populate the registry
const registry = new TemplateRegistryImpl();

// Register all templates
[...customerServiceTemplates, ...salesTemplates, ...supportTemplates].forEach(template => {
  registry.register(template);
});

/**
 * The global template registry.
 *
 * @example
 * ```typescript
 * // Get a specific template
 * const template = TEMPLATE_REGISTRY.get('refund-request');
 *
 * // List all templates
 * const all = TEMPLATE_REGISTRY.getAll();
 *
 * // Get templates by category
 * const customerService = TEMPLATE_REGISTRY.getByCategory('customer_service');
 *
 * // Search by tag
 * const refundTemplates = TEMPLATE_REGISTRY.getByTag('refund');
 * ```
 */
export const TEMPLATE_REGISTRY: TemplateRegistry = registry;

// ===============================================================================
// CONVENIENCE FUNCTIONS
// ===============================================================================

/**
 * Create a mission from a template.
 *
 * This is the recommended way to create missions from templates, as it handles
 * target merging and provides a consistent interface.
 *
 * @param request - The template request configuration
 * @returns A configured MarineReconSymbol
 * @throws Error if the template ID is not found
 *
 * @example
 * ```typescript
 * const symbol = createMissionFromTemplate({
 *   templateId: 'refund-request',
 *   createdBy: 'user:chris',
 *   target: {
 *     organization: 'Acme Corp',
 *     endpoint: 'https://acme.com/support',
 *   },
 *   templateConfig: {
 *     productOrService: 'Premium subscription',
 *     amount: 99.99,
 *   },
 * });
 * ```
 */
export function createMissionFromTemplate(
  request: CreateMissionFromTemplateRequest
): MarineReconSymbol {
  const template = TEMPLATE_REGISTRY.get(request.templateId);

  if (!template) {
    throw new Error(
      `Template '${request.templateId}' not found. ` +
      `Available templates: ${TEMPLATE_REGISTRY.listIds().join(', ')}`
    );
  }

  // Build the default target from template
  const defaultTarget: TargetInfo = {
    type: template.defaultTargetType,
    platform: template.defaultPlatform,
  };

  // Merge with any target overrides
  const target = request.target
    ? mergeTargetInfo(defaultTarget, request.target)
    : defaultTarget;

  // Create the mission with overrides
  return template.createMission(
    {
      created_by: request.createdBy,
      target,
      ...request.overrides,
    },
    request.templateConfig
  );
}

/**
 * List all available templates with their metadata.
 *
 * @returns Array of template summaries
 *
 * @example
 * ```typescript
 * const summaries = listTemplates();
 * summaries.forEach(t => {
 *   console.log(`${t.id}: ${t.name} (${t.category})`);
 * });
 * ```
 */
export function listTemplates(): TemplateSummary[] {
  return TEMPLATE_REGISTRY.getAll().map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    subCategory: t.subCategory,
    tags: t.tags,
    defaultTargetType: t.defaultTargetType,
    defaultPlatform: t.defaultPlatform,
  }));
}

/**
 * Summary of a template (without the factory function).
 */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  subCategory?: string;
  tags: string[];
  defaultTargetType: TargetInfo['type'];
  defaultPlatform: TargetInfo['platform'];
}

/**
 * Get templates organized by category.
 *
 * @returns Object with templates grouped by category
 *
 * @example
 * ```typescript
 * const byCategory = getTemplatesByCategory();
 * console.log(byCategory.customer_service.length); // 3
 * console.log(byCategory.sales.length); // 2
 * ```
 */
export function getTemplatesByCategory(): Record<TemplateCategory, MissionTemplate[]> {
  return {
    customer_service: TEMPLATE_REGISTRY.getByCategory('customer_service'),
    sales: TEMPLATE_REGISTRY.getByCategory('sales'),
    support: TEMPLATE_REGISTRY.getByCategory('support'),
    general: TEMPLATE_REGISTRY.getByCategory('general'),
  };
}

/**
 * Search templates by query string.
 *
 * Searches across template ID, name, description, and tags.
 *
 * @param query - Search query
 * @returns Matching templates
 *
 * @example
 * ```typescript
 * const results = searchTemplates('refund');
 * // Returns templates with 'refund' in ID, name, description, or tags
 * ```
 */
export function searchTemplates(query: string): MissionTemplate[] {
  const lowerQuery = query.toLowerCase();

  return TEMPLATE_REGISTRY.getAll().filter(t =>
    t.id.toLowerCase().includes(lowerQuery) ||
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

// ===============================================================================
// QUICK-START FUNCTIONS
// ===============================================================================

/**
 * Quick-start functions for common scenarios.
 * These provide the simplest way to create a mission.
 */

/**
 * Create a refund request mission (quick-start).
 *
 * @param createdBy - Creator identifier
 * @param organization - Target organization (optional)
 * @returns Configured mission symbol
 */
export function quickRefundMission(
  createdBy: string,
  organization?: string
): MarineReconSymbol {
  return createMissionFromTemplate({
    templateId: 'refund-request',
    createdBy,
    target: organization ? { organization } : undefined,
  });
}

/**
 * Create a complaint mission (quick-start).
 *
 * @param createdBy - Creator identifier
 * @param organization - Target organization (optional)
 * @returns Configured mission symbol
 */
export function quickComplaintMission(
  createdBy: string,
  organization?: string
): MarineReconSymbol {
  return createMissionFromTemplate({
    templateId: 'complaint',
    createdBy,
    target: organization ? { organization } : undefined,
  });
}

/**
 * Create a price negotiation mission (quick-start).
 *
 * @param createdBy - Creator identifier
 * @param organization - Target organization (optional)
 * @returns Configured mission symbol
 */
export function quickNegotiationMission(
  createdBy: string,
  organization?: string
): MarineReconSymbol {
  return createMissionFromTemplate({
    templateId: 'price-negotiation',
    createdBy,
    target: organization ? { organization } : undefined,
  });
}

/**
 * Create a troubleshooting mission (quick-start).
 *
 * @param createdBy - Creator identifier
 * @param organization - Target organization (optional)
 * @returns Configured mission symbol
 */
export function quickTroubleshootingMission(
  createdBy: string,
  organization?: string
): MarineReconSymbol {
  return createMissionFromTemplate({
    templateId: 'troubleshooting',
    createdBy,
    target: organization ? { organization } : undefined,
  });
}

// ===============================================================================
// DEFAULT EXPORT
// ===============================================================================

export default {
  TEMPLATE_REGISTRY,
  createMissionFromTemplate,
  listTemplates,
  getTemplatesByCategory,
  searchTemplates,
  quickRefundMission,
  quickComplaintMission,
  quickNegotiationMission,
  quickTroubleshootingMission,
};
