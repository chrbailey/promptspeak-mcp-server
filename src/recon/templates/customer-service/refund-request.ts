/**
 * ===============================================================================
 * REFUND REQUEST TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to request a
 * refund for a product or service. This is one of the most common customer
 * service scenarios and often reveals how companies treat different types
 * of customers (human vs. AI).
 *
 * Intelligence Focus:
 * - How readily does the agent offer refunds?
 * - What barriers are put in place?
 * - Does behavior change based on persistence?
 * - What escalation paths are available?
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
 * Default intelligence requirements for refund scenarios.
 */
const REFUND_INTELLIGENCE_REQUIREMENTS: string[] = [
  'What is the initial refund policy stated by the agent?',
  'How many objections/barriers are presented before offering a refund?',
  'What information is requested to process the refund?',
  'Is a full refund, partial refund, or store credit offered first?',
  'At what point (if any) is escalation to a human offered?',
  'Does the agent attempt to retain the customer with offers/discounts?',
  'How does the agent respond to expressions of dissatisfaction?',
  'What automation vs. human decision patterns are visible?',
];

/**
 * Suggested persona for refund requests.
 */
const REFUND_PERSONA: Partial<Persona> = {
  background: [
    'Purchased a product/service that did not meet expectations',
    'First time requesting a refund from this company',
    'Reasonable customer who expects fair treatment',
  ],
  traits: [
    'Polite but firm',
    'Knows consumer rights',
    'Not easily dismissed',
    'Documents interactions',
  ],
  knowledge_level: 'familiar',
  patience_level: 'medium',
};

/**
 * Additional red lines specific to refund scenarios.
 */
const REFUND_RED_LINES: RedLine[] = [
  {
    id: 'REFUND_RL001',
    prohibition: 'Do not provide real payment card numbers or bank account details',
    rationale: 'Financial security - use fictional payment references only',
    on_approach: 'halt',
  },
  {
    id: 'REFUND_RL002',
    prohibition: 'Do not agree to physical returns or provide shipping labels',
    rationale: 'Avoid real-world logistics - reconnaissance only',
    on_approach: 'halt',
  },
];

/**
 * Default target for refund scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'customer_service_chatbot',
  platform: 'web_chat',
  known_characteristics: [
    'Likely has refund policies programmed',
    'May have authorization limits',
    'Probably tracks conversation history',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a refund request mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Optional template-specific configuration
 * @returns A configured MarineReconSymbol for the refund mission
 *
 * @example
 * ```typescript
 * // Basic refund mission
 * const symbol = createRefundRequestMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Customized refund mission
 * const symbol = createRefundRequestMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'customer_service_chatbot',
 *     platform: 'web_chat',
 *     organization: 'Acme Corp',
 *   },
 *   mission_name: 'Acme Refund Test',
 * });
 * ```
 */
export function createRefundRequestMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.productOrService
      ? `Request a refund for {product} and document the process, barriers, and agent behavior`
      : 'Request a refund for a recent purchase and document the process, barriers, and agent behavior',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Refund Request Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...REFUND_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...REFUND_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:refund-request',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // The suggested persona is documented but not enforced - users can override
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Refund Request Mission Template.
 *
 * Use this template when you want to test how a customer service system
 * handles refund requests. The template is pre-configured with appropriate
 * intelligence requirements and persona settings for this scenario.
 */
export const refundRequestTemplate: MissionTemplate = {
  id: 'refund-request',
  name: 'Refund Request',
  description: 'Request a refund for a product or service and document the process, barriers, and agent behavior patterns.',
  category: 'customer_service',
  subCategory: 'refund',
  tags: ['refund', 'money-back', 'return', 'customer-service', 'common'],
  defaultTargetType: 'customer_service_chatbot',
  defaultPlatform: 'web_chat',
  suggestedPersona: REFUND_PERSONA,
  intelligenceRequirements: REFUND_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: REFUND_RED_LINES,
  createMission: createRefundRequestMission,
};

export default refundRequestTemplate;
