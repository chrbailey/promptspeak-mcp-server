/**
 * eBay Sandbox Configuration
 *
 * Environment-specific configuration for eBay API endpoints.
 * Defaults to sandbox mode for safe testing.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine if we're in sandbox mode.
 * Defaults to true (sandbox) for safety.
 */
export function isSandboxMode(): boolean {
  const envValue = process.env.EBAY_SANDBOX;
  if (envValue === undefined) return true; // Default to sandbox
  return envValue.toLowerCase() !== 'false';
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay API base URLs.
 */
export const EBAY_API_URLS = {
  sandbox: {
    api: 'https://api.sandbox.ebay.com',
    auth: 'https://auth.sandbox.ebay.com',
    signin: 'https://signin.sandbox.ebay.com',
  },
  production: {
    api: 'https://api.ebay.com',
    auth: 'https://auth.ebay.com',
    signin: 'https://signin.ebay.com',
  },
} as const;

/**
 * Get the appropriate API base URL.
 */
export function getApiBaseUrl(): string {
  return isSandboxMode() ? EBAY_API_URLS.sandbox.api : EBAY_API_URLS.production.api;
}

/**
 * Get the appropriate auth base URL.
 */
export function getAuthBaseUrl(): string {
  return isSandboxMode() ? EBAY_API_URLS.sandbox.auth : EBAY_API_URLS.production.auth;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Browse API endpoints.
 */
export const BROWSE_API = {
  /** Search for items */
  search: '/buy/browse/v1/item_summary/search',
  /** Get item details */
  getItem: (itemId: string) => `/buy/browse/v1/item/${itemId}`,
  /** Get items by group */
  getItemsByGroup: (itemGroupId: string) => `/buy/browse/v1/item/get_items_by_item_group?item_group_id=${itemGroupId}`,
  /** Check compatibility */
  checkCompatibility: (itemId: string) => `/buy/browse/v1/item/${itemId}/check_compatibility`,
} as const;

/**
 * Buy Offer API endpoints (for auctions).
 */
export const OFFER_API = {
  /** Place a bid on an auction item */
  placeBid: (itemId: string) => `/buy/offer/v1_beta/bidding/${itemId}`,
  /** Get bidding status for an item */
  getBidding: (itemId: string) => `/buy/offer/v1_beta/bidding/${itemId}`,
} as const;

/**
 * Best Offer API endpoints.
 */
export const BEST_OFFER_API = {
  /** Submit a best offer */
  createOffer: '/buy/offer/v1_beta/offer',
  /** Get offer details */
  getOffer: (offerId: string) => `/buy/offer/v1_beta/offer/${offerId}`,
  /** Accept/decline counter offer */
  respondToOffer: (offerId: string) => `/buy/offer/v1_beta/offer/${offerId}`,
} as const;

/**
 * Buy Order API endpoints.
 */
export const ORDER_API = {
  /** Initiate checkout session */
  initiateCheckout: '/buy/order/v2/checkout_session/initiate',
  /** Get checkout session */
  getCheckoutSession: (sessionId: string) => `/buy/order/v2/checkout_session/${sessionId}`,
  /** Update checkout session */
  updateCheckoutSession: (sessionId: string) => `/buy/order/v2/checkout_session/${sessionId}`,
  /** Place order */
  placeOrder: (sessionId: string) => `/buy/order/v2/checkout_session/${sessionId}/place_order`,
  /** Get purchase order */
  getPurchaseOrder: (orderId: string) => `/buy/order/v2/purchase_order/${orderId}`,
} as const;

/**
 * OAuth endpoints.
 */
export const OAUTH_ENDPOINTS = {
  /** Authorization URL (user consent) */
  authorize: '/oauth2/authorize',
  /** Token exchange */
  token: '/identity/v1/oauth2/token',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay API rate limits (sandbox has lower limits).
 */
export const RATE_LIMITS = {
  sandbox: {
    browse: {
      perDay: 5000,
      perMinute: 100,
    },
    offer: {
      perDay: 1000,
      perMinute: 20,
    },
    order: {
      perDay: 1000,
      perMinute: 20,
    },
  },
  production: {
    browse: {
      perDay: 25000,
      perMinute: 500,
    },
    offer: {
      perDay: 5000,
      perMinute: 100,
    },
    order: {
      perDay: 5000,
      perMinute: 100,
    },
  },
} as const;

/**
 * Get rate limits for current environment.
 */
export function getRateLimits() {
  return isSandboxMode() ? RATE_LIMITS.sandbox : RATE_LIMITS.production;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE IDS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay marketplace IDs.
 */
export const MARKETPLACE_IDS = {
  EBAY_US: 'EBAY_US',
  EBAY_GB: 'EBAY_GB',
  EBAY_DE: 'EBAY_DE',
  EBAY_AU: 'EBAY_AU',
  EBAY_CA: 'EBAY_CA',
  EBAY_FR: 'EBAY_FR',
  EBAY_IT: 'EBAY_IT',
  EBAY_ES: 'EBAY_ES',
} as const;

export type MarketplaceId = keyof typeof MARKETPLACE_IDS;

/**
 * Get the configured marketplace ID.
 */
export function getMarketplaceId(): string {
  return process.env.EBAY_MARKETPLACE || MARKETPLACE_IDS.EBAY_US;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST HEADERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get standard headers for eBay API requests.
 */
export function getStandardHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': getMarketplaceId(),
    'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=<ePNCampaignId>,affiliateReferenceId=<referenceId>',
  };
}

/**
 * Get headers for authentication requests.
 */
export function getAuthHeaders(clientId: string, clientSecret: string): Record<string, string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Required environment variables for eBay integration.
 */
export const REQUIRED_ENV_VARS = [
  'EBAY_CLIENT_ID',
  'EBAY_CLIENT_SECRET',
] as const;

/**
 * Optional environment variables.
 */
export const OPTIONAL_ENV_VARS = [
  'EBAY_REDIRECT_URI',
  'EBAY_MARKETPLACE',
  'EBAY_SANDBOX',
  'EBAY_TOKEN_ENCRYPTION_KEY',
  'EBAY_RATE_LIMIT_PER_MINUTE',
  'EBAY_RATE_LIMIT_PER_DAY',
] as const;

/**
 * Validate that required environment variables are set.
 */
export function validateEbayConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get the full eBay configuration.
 */
export function getEbayConfig() {
  const validation = validateEbayConfig();
  if (!validation.valid) {
    throw new Error(`Missing required eBay environment variables: ${validation.missing.join(', ')}`);
  }

  return {
    clientId: process.env.EBAY_CLIENT_ID!,
    clientSecret: process.env.EBAY_CLIENT_SECRET!,
    redirectUri: process.env.EBAY_REDIRECT_URI || 'http://localhost:3000/api/v1/ebay/callback',
    marketplace: getMarketplaceId(),
    sandbox: isSandboxMode(),
    apiBaseUrl: getApiBaseUrl(),
    authBaseUrl: getAuthBaseUrl(),
    rateLimits: getRateLimits(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a warning if production mode is enabled.
 */
export function warnIfProduction(): void {
  if (!isSandboxMode()) {
    console.warn('⚠️  WARNING: eBay PRODUCTION mode is enabled!');
    console.warn('⚠️  Real money transactions will be processed.');
    console.warn('⚠️  Set EBAY_SANDBOX=true to use sandbox mode.');
  }
}

/**
 * Require explicit confirmation for production mode.
 * Call this before making any real purchases.
 */
export function requireProductionConfirmation(): void {
  if (!isSandboxMode()) {
    const confirmed = process.env.EBAY_PRODUCTION_CONFIRMED === 'true';
    if (!confirmed) {
      throw new Error(
        'Production mode requires explicit confirmation. ' +
        'Set EBAY_PRODUCTION_CONFIRMED=true to proceed with real transactions.'
      );
    }
  }
}
