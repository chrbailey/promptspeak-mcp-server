/**
 * ===============================================================================
 * TROUBLESHOOTING TEMPLATE
 * ===============================================================================
 *
 * Template for reconnaissance missions where the objective is to report a
 * technical issue and observe the troubleshooting process. Technical support
 * interactions reveal how AI agents handle ambiguous problems and whether
 * they follow scripted paths vs. adaptive problem-solving.
 *
 * Intelligence Focus:
 * - How systematic is the troubleshooting approach?
 * - Can the agent handle non-standard issues?
 * - What diagnostic information is gathered?
 * - When is human escalation triggered?
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
 * Default intelligence requirements for troubleshooting scenarios.
 */
const TROUBLESHOOTING_INTELLIGENCE_REQUIREMENTS: string[] = [
  'What diagnostic questions are asked upfront?',
  'Is there a clear troubleshooting methodology (scripted vs. adaptive)?',
  'How does the agent handle when standard solutions don\'t work?',
  'What system information is requested for diagnosis?',
  'How many troubleshooting steps before escalation is offered?',
  'Does the agent verify solutions worked before closing?',
  'How are edge cases or unusual configurations handled?',
  'What knowledge base or documentation is referenced?',
  'Is there evidence of learning from the conversation?',
  'How is technical depth vs. simplicity balanced?',
];

/**
 * Suggested persona for troubleshooting scenarios.
 */
const TROUBLESHOOTING_PERSONA: Partial<Persona> = {
  background: [
    'Has a product or service that is not working correctly',
    'Has tried basic troubleshooting already',
    'Can describe the problem but may not know the cause',
    'Has moderate technical knowledge',
  ],
  traits: [
    'Patient but wants resolution',
    'Can follow technical instructions',
    'Willing to provide information',
    'Slightly frustrated by the issue',
  ],
  knowledge_level: 'familiar',
  patience_level: 'medium',
};

/**
 * Additional red lines specific to troubleshooting scenarios.
 */
const TROUBLESHOOTING_RED_LINES: RedLine[] = [
  {
    id: 'TROUBLESHOOTING_RL001',
    prohibition: 'Do not allow remote access to any actual systems',
    rationale: 'Never grant access that could be exploited',
    on_approach: 'abort',
  },
  {
    id: 'TROUBLESHOOTING_RL002',
    prohibition: 'Do not share actual error logs containing sensitive data',
    rationale: 'Use fictional error messages only',
    on_approach: 'halt',
  },
  {
    id: 'TROUBLESHOOTING_RL003',
    prohibition: 'Do not execute commands or make system changes',
    rationale: 'Observe process only, do not actually troubleshoot',
    on_approach: 'halt',
  },
];

/**
 * Default target for troubleshooting scenarios.
 */
const DEFAULT_TARGET: TargetInfo = {
  type: 'support_bot',
  platform: 'web_chat',
  known_characteristics: [
    'Has access to knowledge base',
    'Likely follows troubleshooting scripts',
    'May have limited diagnostic capability',
    'Probably can escalate to human support',
  ],
};

// ===============================================================================
// TEMPLATE IMPLEMENTATION
// ===============================================================================

/**
 * Create a troubleshooting mission.
 *
 * @param overrides - Optional overrides to customize the mission
 * @param config - Template-specific configuration
 * @returns A configured MarineReconSymbol for the troubleshooting mission
 *
 * @example
 * ```typescript
 * // Basic troubleshooting mission
 * const symbol = createTroubleshootingMission({
 *   created_by: 'user:chris',
 * });
 *
 * // Specific technical issue
 * const symbol = createTroubleshootingMission({
 *   created_by: 'user:chris',
 *   target: {
 *     type: 'support_bot',
 *     platform: 'web_chat',
 *     organization: 'Tech Company',
 *   },
 * }, {
 *   scenario: 'App crashes on startup after update',
 *   productOrService: 'Mobile App v3.2',
 * });
 * ```
 */
export function createTroubleshootingMission(
  overrides?: Partial<CreateReconSymbolRequest>,
  config?: TemplateConfig
): MarineReconSymbol {
  const primaryGoal = buildPrimaryGoal(
    config?.scenario
      ? `Report technical issue: ${config.scenario}. Document the troubleshooting methodology, diagnostic process, and escalation triggers.`
      : 'Report a technical issue and document the troubleshooting approach, diagnostic questions, solution attempts, and escalation criteria.',
    config
  );

  const request: CreateReconSymbolRequest = {
    mission_name: overrides?.mission_name || 'Troubleshooting Recon',
    primary_goal: overrides?.primary_goal || primaryGoal,
    intelligence_requirements: [
      ...TROUBLESHOOTING_INTELLIGENCE_REQUIREMENTS,
      ...(overrides?.intelligence_requirements || []),
    ],
    target: mergeTargetInfo(DEFAULT_TARGET, overrides?.target),
    red_lines: [
      ...TROUBLESHOOTING_RED_LINES,
      ...(overrides?.red_lines || []),
    ],
    created_by: overrides?.created_by || 'template:troubleshooting',
    // Note: dual_track_config is left to defaults from createReconSymbol
    // Analyst should watch for: exhaustion, redirect, gaslighting, scope_expansion
    ...overrides,
  };

  return createReconSymbol(request);
}

// ===============================================================================
// TEMPLATE EXPORT
// ===============================================================================

/**
 * Troubleshooting Mission Template.
 *
 * Use this template when you want to test how a support system handles
 * technical issues. The template is configured to evaluate troubleshooting
 * methodology and escalation criteria.
 */
export const troubleshootingTemplate: MissionTemplate = {
  id: 'troubleshooting',
  name: 'Technical Troubleshooting',
  description: 'Report a technical issue to assess troubleshooting methodology, diagnostic capabilities, and escalation criteria.',
  category: 'support',
  subCategory: 'troubleshooting',
  tags: ['technical', 'troubleshooting', 'issue', 'support', 'common'],
  defaultTargetType: 'support_bot',
  defaultPlatform: 'web_chat',
  suggestedPersona: TROUBLESHOOTING_PERSONA,
  intelligenceRequirements: TROUBLESHOOTING_INTELLIGENCE_REQUIREMENTS,
  additionalRedLines: TROUBLESHOOTING_RED_LINES,
  createMission: createTroubleshootingMission,
};

export default troubleshootingTemplate;
