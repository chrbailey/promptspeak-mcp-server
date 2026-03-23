import type { HoldRequest } from '../types/index.js';

type ScenarioHold = Omit<HoldRequest, 'holdId' | 'createdAt' | 'expiresAt' | 'state'>;

let counter = 0;
function makeHoldId(): string {
  return `hold_demo_${Date.now().toString(36)}_${(++counter).toString(36).padStart(4, '0')}`;
}

function makeHold(template: ScenarioHold): HoldRequest {
  const now = Date.now();
  return {
    ...template,
    holdId: makeHoldId(),
    createdAt: now,
    expiresAt: now + 86400000, // 24 hours
    state: 'pending',
  };
}

const SALES_AGENT = 'sales-agent-west-004';
const COMMERCE_AGENT = 'commerce-fulfillment-agent-007';

// Sales scenarios - use reason 'human_approval_required' or 'forbidden_constraint'
const salesDiscount: ScenarioHold = {
  agentId: SALES_AGENT, frame: '\u2295\u25CA\u25B6\u03B1', tool: 'send_discount_offer',
  arguments: { opportunityId: '006Dn00000EXAMPLE', action: 'apply_discount' },
  reason: 'human_approval_required', severity: 'high',
  evidence: {
    description: 'Agent attempting to send 35% discount offer \u2014 exceeds 20% auto-approval threshold',
    opportunityId: '006Dn00000EXAMPLE', accountName: 'Acme Global Industries',
    discountPercent: 35, threshold: 20, dealValue: 280000, sobject: 'Opportunity', stage: 'Negotiation/Review',
  },
};

const salesExport: ScenarioHold = {
  agentId: SALES_AGENT, frame: '\u2295\u25CA\u25B6\u03B1', tool: 'export_contact_list',
  arguments: { listId: '00BDn00000EXAMPLE', format: 'CSV' },
  reason: 'forbidden_constraint', severity: 'critical',
  evidence: {
    description: 'Agent attempting to export 2,400 contacts including 847 EU residents without GDPR consent verification',
    contactCount: 2400, euResidentCount: 847, gdprConsentVerified: false,
    sobject: 'Contact', exportFormat: 'CSV', listName: 'All Contacts - EMEA + Americas', dataClassification: 'PII',
  },
};

const salesModifyOpp: ScenarioHold = {
  agentId: SALES_AGENT, frame: '\u2295\u25C7\u25B6\u03B1', tool: 'modify_opportunity',
  arguments: { opportunityId: '006Dn00000LOCKED', field: 'Amount', newValue: 195000 },
  reason: 'human_approval_required', severity: 'medium',
  evidence: {
    description: 'Agent attempting to modify amount on a Closed-Won opportunity \u2014 record is locked',
    opportunityId: '006Dn00000LOCKED', accountName: 'TechVista Solutions',
    stage: 'Closed Won', recordLocked: true, sobject: 'Opportunity', recordType: 'Enterprise Deal',
    currentAmount: 250000, proposedAmount: 195000,
  },
};

const salesBulkEmail: ScenarioHold = {
  agentId: SALES_AGENT, frame: '\u2295\u25C7\u25B6\u03B1', tool: 'send_outbound_email',
  arguments: { campaignId: '701Dn00000EXAMPLE', action: 'send_blast' },
  reason: 'human_approval_required', severity: 'medium',
  evidence: {
    description: 'Agent attempting to send mass email to list with only 23% verified addresses',
    recipientCount: 1200, listName: 'Q1 West Territory', verifiedPercent: 23,
    sobject: 'Lead', campaignId: '701Dn00000EXAMPLE', bounceRiskLevel: 'high',
  },
};

// Commerce scenarios
const commerceSanctions: ScenarioHold = {
  agentId: COMMERCE_AGENT, frame: '\u2298\u25C8\u25B2\u03B2', tool: 'process_shipment',
  arguments: { orderId: '801Dn00000EXAMPLE', action: 'fulfill' },
  reason: 'forbidden_constraint', severity: 'critical',
  evidence: {
    description: 'Order recipient matches OFAC SDN list \u2014 Huawei Technologies Co., Ltd.',
    orderNumber: 'ORD-2026-04817', accountName: 'Huawei Technologies Co., Ltd.',
    sdnMatchScore: 0.97, sdnListEntry: 'OFAC SDN List, Entry #12847',
    country: 'CN', sobject: 'Order', shipToCity: 'Shenzhen', orderValue: 142000,
  },
};

const commerceExport: ScenarioHold = {
  agentId: COMMERCE_AGENT, frame: '\u2298\u25C8\u25B2\u03B2', tool: 'approve_export',
  arguments: { productId: '01tDn00000EXAMPLE', destination: 'IR' },
  reason: 'forbidden_constraint', severity: 'critical',
  evidence: {
    description: 'Dual-use semiconductor equipment export to Iran \u2014 ITAR/EAR controlled',
    productName: 'EUV Lithography Module', eccn: '3B001', destinationCountry: 'IR',
    itarControlled: true, sobject: 'Product2', exportLicenseRequired: true,
    regulatoryBody: 'Bureau of Industry and Security (BIS)',
  },
};

const commerceRefund: ScenarioHold = {
  agentId: COMMERCE_AGENT, frame: '\u2298\u25C8\u25B2\u03B2', tool: 'issue_refund',
  arguments: { orderId: '801Dn00000REFUND', amount: 47000 },
  reason: 'human_approval_required', severity: 'high',
  evidence: {
    description: 'Refund amount $47,000 exceeds auto-refund threshold of $5,000',
    orderNumber: 'ORD-2026-03291', refundAmount: 47000, autoRefundThreshold: 5000,
    disputeReason: 'Defective goods \u2014 semiconductor batch 7B failed QA',
    sobject: 'Order', originalOrderValue: 52000,
  },
};

const commercePricing: ScenarioHold = {
  agentId: COMMERCE_AGENT, frame: '\u2298\u25C8\u25B2\u03B2', tool: 'update_pricing',
  arguments: { pricebookId: '01sDn00000EXAMPLE', action: 'bulk_update' },
  reason: 'human_approval_required', severity: 'medium',
  evidence: {
    description: 'Bulk price change across 340 SKUs in APAC Enterprise pricebook \u2014 average 12.5% increase',
    skuCount: 340, priceBookName: 'APAC Enterprise', avgChangePercent: 12.5,
    sobject: 'PricebookEntry', affectedRegions: ['JP', 'KR', 'SG', 'AU'],
    estimatedRevenueImpact: '+$2.1M annually',
  },
};

export const ALL_SCENARIOS: ScenarioHold[] = [
  salesDiscount, salesExport, salesModifyOpp, salesBulkEmail,
  commerceSanctions, commerceExport, commerceRefund, commercePricing,
];

export function getPreSeedScenarios(): HoldRequest[] {
  return [
    makeHold(commerceSanctions),
    makeHold(salesExport),
    makeHold(commerceRefund),
    makeHold(salesModifyOpp),
    makeHold(commercePricing),
  ];
}

export function getDemoRunScenarios(): HoldRequest[] {
  return [
    makeHold(salesDiscount),
    makeHold(commerceExport),
    makeHold(salesBulkEmail),
  ];
}
