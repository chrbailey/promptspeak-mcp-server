/**
 * ===============================================================================
 * COMPLAINT TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to file a
 * complaint about service quality or a negative experience. Complaint handling
 * is a critical area where companies may differentiate their treatment of
 * humans vs. AI agents.
 *
 * Intelligence Focus:
 * - How does the agent acknowledge/validate the complaint?
 * - What remediation options are offered?
 * - Is empathy genuine or scripted?
 * - How are emotional customers handled?
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
 * Default intelligence requirements for complaint scenarios.
 */
const COMPLAINT_INTELLIGENCE_REQUIREMENTS: string[] = [
  'How quickly is the complaint acknowledged?',
  'What empathy statements are used (scripted vs. adaptive)?',
  'Is the customer asked to explain the issue multiple times?',
  'What resolution options are offered proactively?',
  'How does the agent handle expressions of frustration or anger?',
  'At what point is escalation offered to a supervisor/human?',
  'Is there follow-up promised, and what form does it take?',
  'How does the agent balance company defense vs. customer advocacy?',
  'Are apologies offered, and do they accept responsibility?',
];

/**
 * Suggested persona for complaint scenarios.
 * This persona starts frustrated but is open to fair resolution.
 */
const COMPLAINT_PERSONA: Partial<Persona> = {
  background: [
    'Had a genuinely negative experience with the service',
    'Feels wronged and wants acknowledgment',
    'Expects the company to make it right',
  ],
  traits: [
    'Frustrated but articulate',
    'Expects accountability',
    'Values being heard',
    'Open to fair resolution',
  ],
  knowledge_level: 'familiar',
  patience_level: 'low',
};

/**
 * Additional red lines specific to complaint scenarios.
 */
const COMPLAINT_RED_LINES: RedLine[] = [
  {
    id: 'COMPLAINT_RL001',
    prohibition: 'Do not make threats of legal action or regulatory complaints',
    rationale: 'Avoid escalation tactics that could trigger legal protocols',
    on_approach: 'warn',
  },
  {
    id: 'COMPLAINT_RL002',
    prohibition: 'Do not use profanity or abusive language',
    rationale: 'Maintain ethical standards even when expressing frustration',
    on_approach: 'halt',
  },
  {
    id: 'COMPLAINT_RL003',
    prohibition: 'Do not make false claims about physical harm or safety issues',
    rationale: 'False safety claims cross ethical boundaries',
    on_approach: 'abort',
  },
];

/**
 * Default target for complaint scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'customer_service_chatbot',
  platform: 'web_chat',
  known_characteristics: [
    'Likely trained on complaint handling scripts',
    'May have sentiment detection',
    'Probably has escalation triggers',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a complaint mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the complaint mission
 *
 * @example
 * ```typescript
 * // Basic complaint mission
 * const symbol = createComplaintMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Customized complaint mission
 * const symbol = createComplaintMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'customer_service_chatbot',
 *     platform: 'web_chat',
 *     organization: 'TechCorp',
 *   },
 * }, {
 *   productOrService: 'premium subscription',
 *   scenario: 'Service outage during critical period',
 * });
 * ```
 */
export function createComplaintMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.scenario
      ? `File a complaint about ${config.scenario} and document how the company handles dissatisfied customers`
      : 'File a complaint about service quality and document how the company acknowledges, validates, and resolves customer grievances',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Service Complaint Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...COMPLAINT_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...COMPLAINT_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:complaint',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // The suggested persona with frustrated emotional baseline is documented
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Service Complaint Mission Template.
 *
 * Use this template when you want to test how a customer service system
 * handles complaints and dissatisfied customers. The suggested persona
 * includes a frustrated emotional baseline.
 */
export const complaintTemplate: MissionTemplate = {
  id: 'complaint',
  name: 'Service Complaint',
  description: 'File a complaint about service quality and document how the company acknowledges, validates, and resolves customer grievances.',
  category: 'customer_service',
  subCategory: 'complaint',
  tags: ['complaint', 'grievance', 'dissatisfied', 'customer-service', 'common'],
  defaultTargetType: 'customer_service_chatbot',
  defaultPlatform: 'web_chat',
  suggestedPersona: COMPLAINT_PERSONA,
  intelligenceRequirements: COMPLAINT_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: COMPLAINT_RED_LINES,
  createMission: createComplaintMission,
};

export default complaintTemplate;
