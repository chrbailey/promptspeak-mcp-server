/**
 * ===============================================================================
 * MISSION TEMPLATE TYPES
 * ===============================================================================
 *
 * Type definitions for pre-configured mission templates. Templates provide
 * sensible defaults for common reconnaissance scenarios, making it easy to
 * spin up missions without extensive configuration.
 *
 * ===============================================================================
 */

import { CreateReconSymbolRequest } from '../symbol/schema';
import { MarineReconSymbol, TargetInfo, Persona, RedLine } from '../types';

// ===============================================================================
// TEMPLATE CATEGORIES
// ===============================================================================

/**
 * Categories of mission templates.
 */
export type TemplateCategory =
  | 'customer_service'  // Customer service interactions (refunds, complaints, account issues)
  | 'sales'             // Sales interactions (pricing, product inquiries)
  | 'support'           // Technical support interactions (troubleshooting, feature requests)
  | 'general';          // General purpose templates

/**
 * Sub-categories for more specific classification.
 */
export type CustomerServiceSubCategory = 'refund' | 'complaint' | 'account' | 'billing' | 'cancellation';
export type SalesSubCategory = 'pricing' | 'product' | 'negotiation' | 'upsell';
export type SupportSubCategory = 'troubleshooting' | 'feature_request' | 'bug_report' | 'how_to';

// ===============================================================================
// MISSION TEMPLATE
// ===============================================================================

/**
 * A pre-configured mission template.
 *
 * Templates provide sensible defaults for specific reconnaissance scenarios,
 * allowing users to quickly create missions without specifying every parameter.
 *
 * @example
 * ```typescript
 * const template = TEMPLATE_REGISTRY.get('refund-request');
 * const symbol = template.createMission({
 *   created_by: 'user:chris',
 *   target: { type: 'customer_service_chatbot', platform: 'web_chat' }
 * });
 * ```
 */
export interface MissionTemplate {
  /** Unique template identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description of what this template is for */
  description: string;

  /** Primary category */
  category: TemplateCategory;

  /** Optional sub-category for more specific classification */
  subCategory?: string;

  /** Tags for searching/filtering */
  tags: string[];

  /** Default target type for this template */
  defaultTargetType: TargetInfo['type'];

  /** Default platform for this template */
  defaultPlatform: TargetInfo['platform'];

  /** Suggested persona configuration */
  suggestedPersona: Partial<Persona>;

  /** Pre-configured intelligence requirements */
  intelligenceRequirements: string[];

  /** Pre-configured red lines (in addition to defaults) */
  additionalRedLines?: RedLine[];

  /** Factory function to create a mission from this template */
  createMission: (overrides?: Partial<CreateReconSymbolRequest>, config?: TemplateConfig) => MarineReconSymbol;
}

// ===============================================================================
// TEMPLATE CONFIGURATION
// ===============================================================================

/**
 * Configuration options for template customization.
 */
export interface TemplateConfig {
  /** Scenario-specific details to include in the mission */
  scenario?: string;

  /** Specific product or service involved */
  productOrService?: string;

  /** Order/account reference number (fictional) */
  referenceNumber?: string;

  /** Dollar amount involved (for refunds, pricing, etc.) */
  amount?: number;

  /** Time period involved (e.g., "3 months ago") */
  timePeriod?: string;

  /** Urgency level */
  urgency?: 'low' | 'medium' | 'high';

  /** Additional context to include */
  additionalContext?: string[];
}

/**
 * Extended request that includes template configuration.
 */
export interface CreateMissionFromTemplateRequest {
  /** Template ID to use */
  templateId: string;

  /** Creator identifier */
  createdBy: string;

  /** Target information (overrides template defaults) */
  target?: Partial<TargetInfo>;

  /** Template-specific configuration */
  templateConfig?: TemplateConfig;

  /** Additional overrides to the CreateReconSymbolRequest */
  overrides?: Partial<CreateReconSymbolRequest>;
}

// ===============================================================================
// TEMPLATE REGISTRY INTERFACE
// ===============================================================================

/**
 * Interface for the template registry.
 */
export interface TemplateRegistry {
  /** Get a template by ID */
  get(id: string): MissionTemplate | undefined;

  /** Get all templates */
  getAll(): MissionTemplate[];

  /** Get templates by category */
  getByCategory(category: TemplateCategory): MissionTemplate[];

  /** Search templates by tag */
  getByTag(tag: string): MissionTemplate[];

  /** Register a new template */
  register(template: MissionTemplate): void;

  /** List all template IDs */
  listIds(): string[];

  /** Check if a template exists */
  has(id: string): boolean;
}

// ===============================================================================
// TEMPLATE BUILDER HELPERS
// ===============================================================================

/**
 * Builder options for creating a template.
 */
export interface TemplateBuilderOptions {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  subCategory?: string;
  tags: string[];
  defaultTargetType: TargetInfo['type'];
  defaultPlatform: TargetInfo['platform'];
  suggestedPersona: Partial<Persona>;
  intelligenceRequirements: string[];
  additionalRedLines?: RedLine[];
  primaryGoal: string;
  missionNamePrefix: string;
}

/**
 * Helper function to build the primary goal with context.
 */
export function buildPrimaryGoal(
  baseGoal: string,
  config?: TemplateConfig
): string {
  let goal = baseGoal;

  if (config?.productOrService) {
    goal = goal.replace('{product}', config.productOrService);
  }

  if (config?.amount) {
    goal = goal.replace('{amount}', `$${config.amount.toFixed(2)}`);
  }

  if (config?.timePeriod) {
    goal = goal.replace('{time}', config.timePeriod);
  }

  if (config?.referenceNumber) {
    goal = goal.replace('{reference}', config.referenceNumber);
  }

  return goal;
}

/**
 * Merge template target with overrides.
 */
export function mergeTargetInfo(
  defaultTarget: TargetInfo,
  overrides?: Partial<TargetInfo>
): TargetInfo {
  return {
    ...defaultTarget,
    ...overrides,
  };
}
