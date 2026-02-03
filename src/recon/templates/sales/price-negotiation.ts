/**
 * ===============================================================================
 * PRICE NEGOTIATION TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to negotiate
 * pricing or request discounts. Sales interactions reveal how companies
 * balance revenue optimization with customer acquisition/retention, and
 * whether AI agents have authority to offer discounts.
 *
 * Intelligence Focus:
 * - What discount authority does the agent have?
 * - What triggers unlock better pricing?
 * - How does persistence affect offers?
 * - What competitive pricing strategies are used?
 *
 * ===============================================================================
 */

import { createReconSymbol, CreateReconSymbolRequest } from '../../symbol/schema';
import { MarineReconSymbol, RedLine, TargetInfo, Persona } from '../../types';
import { MissionTemplate, TemplateConfig, buildPrimaryGoal, mergeTargetInfo } from '../types';

// ===============================================================================
// TEMPLATE CONFIGURATION
// ===============================================================================

/**
 * Default intelligence requirements for price negotiation scenarios.
 */
const NEGOTIATION_INTELLIGENCE_REQUIREMENTS: string[] = [
  'Does the agent have authority to offer discounts?',
  'What discount levels are available (percentage or fixed)?',
  'What triggers unlock discount offers (competitor mention, hesitation, etc.)?',
  'Are there time-limited or urgency-based offers?',
  'How does the agent respond to price objections?',
  'Is there a standard discount script vs. adaptive negotiation?',
  'What information is gathered before pricing discussions?',
  'How does mention of competitors affect the negotiation?',
  'Is there an escalation path to someone with more pricing authority?',
  'What bundling or value-add offers are presented as alternatives?',
];

/**
 * Suggested persona for price negotiation scenarios.
 */
const NEGOTIATION_PERSONA: Partial<Persona> = {
  background: [
    'Interested buyer comparing options',
    'Has a budget in mind',
    'Aware of competitor offerings',
    'Not in a rush to purchase',
  ],
  traits: [
    'Price-conscious',
    'Willing to negotiate',
    'Informed about alternatives',
    'Patient but decisive',
  ],
  knowledge_level: 'familiar',
  patience_level: 'high',
};

/**
 * Additional red lines specific to negotiation scenarios.
 */
const NEGOTIATION_RED_LINES: RedLine[] = [
  {
    id: 'NEGOTIATION_RL001',
    prohibition: 'Do not accept any pricing offers or make commitments to purchase',
    rationale: 'Reconnaissance only - no actual transactions',
    on_approach: 'halt',
  },
  {
    id: 'NEGOTIATION_RL002',
    prohibition: 'Do not provide payment information or business credentials',
    rationale: 'Avoid creating binding agreements or exposing data',
    on_approach: 'abort',
  },
];

/**
 * Default target for negotiation scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'sales_bot',
  platform: 'web_chat',
  known_characteristics: [
    'Likely has predefined discount tiers',
    'May use urgency tactics',
    'Probably tracks negotiation history',
    'May have limited pricing authority',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a price negotiation mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the negotiation mission
 *
 * @example
 * ```typescript
 * // Basic negotiation mission
 * const symbol = createPriceNegotiationMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Customized negotiation
 * const symbol = createPriceNegotiationMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'sales_bot',
 *     platform: 'web_chat',
 *     organization: 'SaaS Company',
 *   },
 * }, {
 *   productOrService: 'Enterprise subscription',
 *   amount: 500, // Monthly price
 * });
 * ```
 */
export function createPriceNegotiationMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.productOrService
      ? `Negotiate pricing for {product} and document discount availability, triggers, and agent authority levels`
      : 'Negotiate pricing and document what discounts are available, what triggers unlock them, and the agent\'s pricing authority',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Price Negotiation Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...NEGOTIATION_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...NEGOTIATION_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:price-negotiation',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // Analyst should watch for: anchoring, urgency, reciprocity, false_choice, social_proof
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Price Negotiation Mission Template.
 *
 * Use this template when you want to test how a sales system handles
 * price negotiations. The template is configured to identify discount
 * triggers and agent pricing authority.
 */
export const priceNegotiationTemplate: MissionTemplate = {
  id: 'price-negotiation',
  name: 'Price Negotiation',
  description: 'Negotiate pricing to discover discount availability, triggers, and agent authority levels.',
  category: 'sales',
  subCategory: 'negotiation',
  tags: ['pricing', 'discount', 'negotiation', 'sales', 'common'],
  defaultTargetType: 'sales_bot',
  defaultPlatform: 'web_chat',
  suggestedPersona: NEGOTIATION_PERSONA,
  intelligenceRequirements: NEGOTIATION_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: NEGOTIATION_RED_LINES,
  createMission: createPriceNegotiationMission,
};

export default priceNegotiationTemplate;
