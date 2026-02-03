/**
 * ===============================================================================
 * FEATURE REQUEST TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to request a
 * new feature or enhancement. Feature request handling reveals how companies
 * engage with customer feedback and whether AI agents can capture and process
 * feature suggestions meaningfully.
 *
 * Intelligence Focus:
 * - How are feature requests captured?
 * - Is there genuine feedback processing or dismissal?
 * - What workarounds are offered for missing features?
 * - How is customer input valued?
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
 * Default intelligence requirements for feature request scenarios.
 */
const FEATURE_REQUEST_INTELLIGENCE_REQUIREMENTS: string[] = [
  'How are feature requests formally captured?',
  'Is there a clear feedback submission process?',
  'Does the agent acknowledge the value of the suggestion?',
  'Are workarounds or alternatives offered?',
  'Is there any indication of product roadmap awareness?',
  'How does the agent handle requests for competitor features?',
  'Is the request forwarded to a product team or logged?',
  'What follow-up (if any) is promised?',
  'Does the agent try to understand the use case behind the request?',
  'How is disappointment about missing features handled?',
];

/**
 * Suggested persona for feature request scenarios.
 */
const FEATURE_REQUEST_PERSONA: Partial<Persona> = {
  background: [
    'Active user of the product/service',
    'Has identified a capability gap',
    'Has a specific use case that would benefit',
    'Engaged enough to provide feedback',
  ],
  traits: [
    'Constructive in feedback',
    'Can articulate the need clearly',
    'Interested in product improvement',
    'Patient about timelines',
  ],
  knowledge_level: 'experienced',
  patience_level: 'high',
};

/**
 * Additional red lines specific to feature request scenarios.
 */
const FEATURE_REQUEST_RED_LINES: RedLine[] = [
  {
    id: 'FEATURE_RL001',
    prohibition: 'Do not sign up for beta programs or early access lists',
    rationale: 'Avoid creating ongoing engagement expectations',
    on_approach: 'warn',
  },
  {
    id: 'FEATURE_RL002',
    prohibition: 'Do not provide detailed business workflows or proprietary processes',
    rationale: 'Use case descriptions should be general, not specific',
    on_approach: 'warn',
  },
];

/**
 * Default target for feature request scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'support_bot',
  platform: 'web_chat',
  known_characteristics: [
    'May have limited product roadmap knowledge',
    'Likely has feedback capture capability',
    'May offer workarounds or alternatives',
    'Probably cannot commit to feature development',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a feature request mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the feature request mission
 *
 * @example
 * ```typescript
 * // Basic feature request mission
 * const symbol = createFeatureRequestMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Specific feature request
 * const symbol = createFeatureRequestMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'support_bot',
 *     platform: 'web_chat',
 *     organization: 'SaaS Platform',
 *   },
 * }, {
 *   scenario: 'Dark mode for mobile app',
 *   additionalContext: ['Many users have requested this', 'Competitors have it'],
 * });
 * ```
 */
export function createFeatureRequestMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.scenario
      ? `Request feature: ${config.scenario}. Document how the request is captured, valued, and whether alternatives are offered.`
      : 'Request a new feature and document how feedback is captured, whether it\'s valued, and what alternatives or workarounds are offered.',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Feature Request Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...FEATURE_REQUEST_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...FEATURE_REQUEST_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:feature-request',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // Analyst should watch for: redirect, gaslighting, false_choice
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Feature Request Mission Template.
 *
 * Use this template when you want to test how a support system handles
 * feature requests and customer feedback. The template evaluates how
 * companies capture, value, and respond to product suggestions.
 */
export const featureRequestTemplate: MissionTemplate = {
  id: 'feature-request',
  name: 'Feature Request',
  description: 'Request a new feature to assess how feedback is captured, valued, and whether alternatives are offered.',
  category: 'support',
  subCategory: 'feature_request',
  tags: ['feature', 'feedback', 'enhancement', 'support', 'product'],
  defaultTargetType: 'support_bot',
  defaultPlatform: 'web_chat',
  suggestedPersona: FEATURE_REQUEST_PERSONA,
  intelligenceRequirements: FEATURE_REQUEST_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: FEATURE_REQUEST_RED_LINES,
  createMission: createFeatureRequestMission,
};

export default featureRequestTemplate;
