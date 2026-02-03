/**
 * ===============================================================================
 * ACCOUNT ISSUE TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to report and
 * resolve an account-related problem. Account issues are sensitive scenarios
 * that involve identity verification and access control, providing insight
 * into security protocols and how companies balance security with usability.
 *
 * Intelligence Focus:
 * - What identity verification is required?
 * - How are account access issues handled?
 * - What self-service options are available?
 * - How does security affect customer experience?
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
 * Default intelligence requirements for account issue scenarios.
 */
const ACCOUNT_INTELLIGENCE_REQUIREMENTS: string[] = [
  'What identity verification methods are used?',
  'How many verification steps are required before assistance?',
  'What account information can be accessed without full verification?',
  'Are there self-service options offered before agent assistance?',
  'How does the agent handle inability to verify identity?',
  'What security questions or knowledge-based authentication is used?',
  'Is there a path to account recovery without standard verification?',
  'How is the balance between security and convenience managed?',
  'What escalation paths exist for complex account issues?',
];

/**
 * Suggested persona for account issue scenarios.
 */
const ACCOUNT_PERSONA: Partial<Persona> = {
  background: [
    'Long-time account holder with good standing',
    'Experiencing an unexpected account problem',
    'Has access to some but not all verification information',
  ],
  traits: [
    'Cooperative with verification requests',
    'Concerned about account security',
    'Expects professional handling',
    'Slightly anxious about the issue',
  ],
  knowledge_level: 'familiar',
  patience_level: 'medium',
};

/**
 * Additional red lines specific to account issue scenarios.
 */
const ACCOUNT_RED_LINES: RedLine[] = [
  {
    id: 'ACCOUNT_RL001',
    prohibition: 'Do not provide real account credentials, passwords, or security codes',
    rationale: 'Never expose real authentication data - use fictional references only',
    on_approach: 'abort',
  },
  {
    id: 'ACCOUNT_RL002',
    prohibition: 'Do not attempt to bypass or social-engineer security protocols',
    rationale: 'Observe security measures, do not circumvent them',
    on_approach: 'halt',
  },
  {
    id: 'ACCOUNT_RL003',
    prohibition: 'Do not claim to be a victim of fraud or identity theft',
    rationale: 'False fraud claims can trigger legal/investigative processes',
    on_approach: 'abort',
  },
];

/**
 * Default target for account issue scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'customer_service_chatbot',
  platform: 'web_chat',
  known_characteristics: [
    'Has access to account systems',
    'Bound by security verification protocols',
    'May have limited authorization for account changes',
    'Likely logs all account-related interactions',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create an account issue mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the account issue mission
 *
 * @example
 * ```typescript
 * // Basic account issue mission
 * const symbol = createAccountIssueMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Specific account issue
 * const symbol = createAccountIssueMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'customer_service_chatbot',
 *     platform: 'web_chat',
 *     organization: 'BigBank',
 *   },
 * }, {
 *   scenario: 'Unable to log in after password reset',
 * });
 * ```
 */
export function createAccountIssueMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.scenario
      ? `Report an account issue: ${config.scenario}. Document verification requirements and resolution process.`
      : 'Report an account access problem and document the verification requirements, security protocols, and resolution process.',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Account Issue Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...ACCOUNT_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...ACCOUNT_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:account-issue',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // The suggested persona with confused/anxious baseline is documented
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Account Issue Mission Template.
 *
 * Use this template when you want to test how a customer service system
 * handles account-related problems. This template is particularly useful
 * for understanding security verification processes.
 */
export const accountIssueTemplate: MissionTemplate = {
  id: 'account-issue',
  name: 'Account Issue',
  description: 'Report an account-related problem and document verification requirements, security protocols, and resolution processes.',
  category: 'customer_service',
  subCategory: 'account',
  tags: ['account', 'login', 'access', 'verification', 'security', 'customer-service'],
  defaultTargetType: 'customer_service_chatbot',
  defaultPlatform: 'web_chat',
  suggestedPersona: ACCOUNT_PERSONA,
  intelligenceRequirements: ACCOUNT_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: ACCOUNT_RED_LINES,
  createMission: createAccountIssueMission,
};

export default accountIssueTemplate;
