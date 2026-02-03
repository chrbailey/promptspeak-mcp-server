/**
 * ===============================================================================
 * SALES TEMPLATES
 * ===============================================================================
 *
 * Pre-configured mission templates for sales reconnaissance scenarios.
 * These templates cover common sales interactions including price negotiations
 * and product inquiries.
 *
 * ===============================================================================
 */

// Export individual templates
export { priceNegotiationTemplate, createPriceNegotiationMission } from './price-negotiation';
export { productInquiryTemplate, createProductInquiryMission } from './product-inquiry';

// Export template array for registration
import { priceNegotiationTemplate } from './price-negotiation';
import { productInquiryTemplate } from './product-inquiry';
import { MissionTemplate } from '../types';

/**
 * All sales templates.
 */
export const salesTemplates: MissionTemplate[] = [
  priceNegotiationTemplate,
  productInquiryTemplate,
];

export default salesTemplates;
