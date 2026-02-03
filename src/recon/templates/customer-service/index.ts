/**
 * ===============================================================================
 * CUSTOMER SERVICE TEMPLATES
 * ===============================================================================
 *
 * Pre-configured mission templates for customer service reconnaissance scenarios.
 * These templates cover common customer service interactions including refunds,
 * complaints, and account issues.
 *
 * ===============================================================================
 */

// Export individual templates
export { refundRequestTemplate, createRefundRequestMission } from './refund-request';
export { complaintTemplate, createComplaintMission } from './complaint';
export { accountIssueTemplate, createAccountIssueMission } from './account-issue';

// Export template array for registration
import { refundRequestTemplate } from './refund-request';
import { complaintTemplate } from './complaint';
import { accountIssueTemplate } from './account-issue';
import { MissionTemplate } from '../types';

/**
 * All customer service templates.
 */
export const customerServiceTemplates: MissionTemplate[] = [
  refundRequestTemplate,
  complaintTemplate,
  accountIssueTemplate,
];

export default customerServiceTemplates;
