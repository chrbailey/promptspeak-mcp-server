/**
 * ===============================================================================
 * SUPPORT TEMPLATES
 * ===============================================================================
 *
 * Pre-configured mission templates for technical support reconnaissance scenarios.
 * These templates cover common support interactions including troubleshooting
 * and feature requests.
 *
 * ===============================================================================
 */

// Export individual templates
export { troubleshootingTemplate, createTroubleshootingMission } from './troubleshooting';
export { featureRequestTemplate, createFeatureRequestMission } from './feature-request';

// Export template array for registration
import { troubleshootingTemplate } from './troubleshooting';
import { featureRequestTemplate } from './feature-request';
import { MissionTemplate } from '../types';

/**
 * All support templates.
 */
export const supportTemplates: MissionTemplate[] = [
  troubleshootingTemplate,
  featureRequestTemplate,
];

export default supportTemplates;
