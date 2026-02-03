/**
 * ===============================================================================
 * PRODUCT INQUIRY TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to ask about
 * product features, availability, and specifications. Product inquiries
 * reveal how well AI agents understand their products and how they handle
 * questions at the boundary of their knowledge.
 *
 * Intelligence Focus:
 * - How accurate is product information provided?
 * - How does the agent handle questions it can't answer?
 * - What upselling/cross-selling occurs?
 * - How is the transition to purchase handled?
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
 * Default intelligence requirements for product inquiry scenarios.
 */
const INQUIRY_INTELLIGENCE_REQUIREMENTS: string[] = [
  'How accurate and detailed is the product information provided?',
  'How does the agent handle questions it cannot answer?',
  'Is there a knowledge boundary, and how is it communicated?',
  'What upselling or cross-selling tactics are employed?',
  'How quickly does the agent try to move toward a sale?',
  'Are comparisons to competitor products handled?',
  'What happens when asking about unavailable items?',
  'How are technical specifications handled vs. marketing claims?',
  'Is there a path to human expertise for complex questions?',
  'What information gathering occurs during the inquiry?',
];

/**
 * Suggested persona for product inquiry scenarios.
 */
const INQUIRY_PERSONA: Partial<Persona> = {
  background: [
    'Researching products before making a decision',
    'Has specific requirements in mind',
    'Comparing multiple options',
    'Technical enough to ask detailed questions',
  ],
  traits: [
    'Curious and detail-oriented',
    'Asks follow-up questions',
    'Not ready to buy immediately',
    'Values accuracy over salesmanship',
  ],
  knowledge_level: 'familiar',
  patience_level: 'high',
};

/**
 * Additional red lines specific to product inquiry scenarios.
 */
const INQUIRY_RED_LINES: RedLine[] = [
  {
    id: 'INQUIRY_RL001',
    prohibition: 'Do not provide business information that could be used for targeting',
    rationale: 'Avoid creating a lead profile that could result in follow-up',
    on_approach: 'warn',
  },
  {
    id: 'INQUIRY_RL002',
    prohibition: 'Do not schedule demos, calls, or meetings',
    rationale: 'Reconnaissance only - avoid real-world commitments',
    on_approach: 'halt',
  },
];

/**
 * Default target for product inquiry scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'sales_bot',
  platform: 'web_chat',
  known_characteristics: [
    'Has product catalog access',
    'Likely trained on marketing materials',
    'May have limited technical depth',
    'Optimized to qualify leads',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a product inquiry mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the inquiry mission
 *
 * @example
 * ```typescript
 * // Basic product inquiry
 * const symbol = createProductInquiryMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Specific product inquiry
 * const symbol = createProductInquiryMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'sales_bot',
 *     platform: 'web_chat',
 *     organization: 'Electronics Store',
 *   },
 * }, {
 *   productOrService: 'wireless headphones',
 *   additionalContext: ['Interested in noise cancellation', 'Budget around $200'],
 * });
 * ```
 */
export function createProductInquiryMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.productOrService
      ? `Ask about {product} features, availability, and specifications. Document knowledge accuracy, boundaries, and sales tactics.`
      : 'Ask about product features, availability, and specifications. Document how the agent handles detailed questions and knowledge gaps.',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Product Inquiry Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...INQUIRY_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...INQUIRY_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:product-inquiry',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // Analyst should watch for: redirect, false_choice, urgency, social_proof
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Product Inquiry Mission Template.
 *
 * Use this template when you want to test how a sales system handles
 * product questions. The template is configured to identify knowledge
 * accuracy and sales tactics.
 */
export const productInquiryTemplate: MissionTemplate = {
  id: 'product-inquiry',
  name: 'Product Inquiry',
  description: 'Ask about product features and availability to assess knowledge accuracy, boundaries, and sales tactics.',
  category: 'sales',
  subCategory: 'product',
  tags: ['product', 'features', 'inquiry', 'sales', 'availability'],
  defaultTargetType: 'sales_bot',
  defaultPlatform: 'web_chat',
  suggestedPersona: INQUIRY_PERSONA,
  intelligenceRequirements: INQUIRY_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: INQUIRY_RED_LINES,
  createMission: createProductInquiryMission,
};

export default productInquiryTemplate;
