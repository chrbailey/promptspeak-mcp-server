/**
 * eBay OAuth 2.0 Authentication
 *
 * Handles OAuth 2.0 authentication flow for eBay APIs,
 * including token management and refresh.
 */

import {
  getEbayConfig,
  getAuthBaseUrl,
  getAuthHeaders,
  OAUTH_ENDPOINTS,
  REQUIRED_EBAY_SCOPES,
} from './sandbox-config.js';
import type { EbayOAuthToken, EbayOAuthScope } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp
  refreshExpiresAt?: number;
  scopes: string[];
}

let currentToken: StoredToken | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// EBAY AUTH CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay OAuth 2.0 authentication handler.
 */
export class EbayAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private authBaseUrl: string;
  private tokenRefreshBuffer: number = 300000; // 5 minutes in ms

  constructor() {
    const config = getEbayConfig();
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUri = config.redirectUri;
    this.authBaseUrl = config.authBaseUrl;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPLICATION TOKEN (Client Credentials Grant)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get an application access token using client credentials.
   * This is for API calls that don't require user authorization.
   */
  async getApplicationToken(scopes: EbayOAuthScope[] = ['https://api.ebay.com/oauth/api_scope']): Promise<string> {
    // Check if we have a valid cached token
    if (currentToken && this.isTokenValid(currentToken)) {
      return currentToken.accessToken;
    }

    // Request new token
    const tokenUrl = `${this.authBaseUrl}${OAUTH_ENDPOINTS.token}`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: scopes.join(' '),
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: getAuthHeaders(this.clientId, this.clientSecret),
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new EbayAuthError(
        `Failed to get application token: ${response.status} ${response.statusText}`,
        errorData
      );
    }

    const tokenData: EbayOAuthToken = await response.json();

    // Store token
    currentToken = {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      scopes: scopes,
    };

    return currentToken.accessToken;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER TOKEN (Authorization Code Grant)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the authorization URL for user consent.
   * Redirect the user to this URL to authorize the application.
   */
  getAuthorizationUrl(
    scopes: EbayOAuthScope[] = REQUIRED_EBAY_SCOPES,
    state?: string
  ): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
    });

    if (state) {
      params.set('state', state);
    }

    return `${this.authBaseUrl}${OAUTH_ENDPOINTS.authorize}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for user access token.
   * Call this after the user is redirected back from eBay.
   */
  async exchangeAuthorizationCode(code: string): Promise<StoredToken> {
    const tokenUrl = `${this.authBaseUrl}${OAUTH_ENDPOINTS.token}`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: getAuthHeaders(this.clientId, this.clientSecret),
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new EbayAuthError(
        `Failed to exchange authorization code: ${response.status} ${response.statusText}`,
        errorData
      );
    }

    const tokenData: EbayOAuthToken = await response.json();

    // Store token
    currentToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      refreshExpiresAt: tokenData.refresh_token_expires_in
        ? Date.now() + (tokenData.refresh_token_expires_in * 1000)
        : undefined,
      scopes: REQUIRED_EBAY_SCOPES,
    };

    return currentToken;
  }

  /**
   * Refresh the user access token using the refresh token.
   */
  async refreshAccessToken(): Promise<string> {
    if (!currentToken?.refreshToken) {
      throw new EbayAuthError('No refresh token available. User must re-authorize.');
    }

    // Check if refresh token is still valid
    if (currentToken.refreshExpiresAt && Date.now() >= currentToken.refreshExpiresAt) {
      throw new EbayAuthError('Refresh token has expired. User must re-authorize.');
    }

    const tokenUrl = `${this.authBaseUrl}${OAUTH_ENDPOINTS.token}`;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentToken.refreshToken,
      scope: currentToken.scopes.join(' '),
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: getAuthHeaders(this.clientId, this.clientSecret),
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new EbayAuthError(
        `Failed to refresh token: ${response.status} ${response.statusText}`,
        errorData
      );
    }

    const tokenData: EbayOAuthToken = await response.json();

    // Update stored token
    currentToken = {
      ...currentToken,
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      // Refresh token may or may not be returned
      refreshToken: tokenData.refresh_token || currentToken.refreshToken,
    };

    return currentToken.accessToken;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get a valid access token, refreshing if necessary.
   */
  async getAccessToken(): Promise<string> {
    if (!currentToken) {
      // No token, get application token for Browse API
      return this.getApplicationToken();
    }

    // Check if token needs refresh
    if (this.tokenNeedsRefresh(currentToken)) {
      if (currentToken.refreshToken) {
        return this.refreshAccessToken();
      } else {
        // Application token - get a new one
        return this.getApplicationToken();
      }
    }

    return currentToken.accessToken;
  }

  /**
   * Check if token is still valid (not expired).
   */
  private isTokenValid(token: StoredToken): boolean {
    return Date.now() < token.expiresAt;
  }

  /**
   * Check if token should be refreshed (approaching expiry).
   */
  private tokenNeedsRefresh(token: StoredToken): boolean {
    return Date.now() >= (token.expiresAt - this.tokenRefreshBuffer);
  }

  /**
   * Check if we have a user token (vs application token).
   */
  hasUserToken(): boolean {
    return currentToken !== null && currentToken.refreshToken !== undefined;
  }

  /**
   * Get current token info (for debugging).
   */
  getTokenInfo(): {
    hasToken: boolean;
    isUserToken: boolean;
    expiresIn: number | null;
    scopes: string[];
  } {
    if (!currentToken) {
      return {
        hasToken: false,
        isUserToken: false,
        expiresIn: null,
        scopes: [],
      };
    }

    return {
      hasToken: true,
      isUserToken: !!currentToken.refreshToken,
      expiresIn: Math.max(0, Math.floor((currentToken.expiresAt - Date.now()) / 1000)),
      scopes: currentToken.scopes,
    };
  }

  /**
   * Clear stored tokens (logout).
   */
  clearTokens(): void {
    currentToken = null;
  }

  /**
   * Set token from external storage (e.g., database).
   */
  setStoredToken(token: StoredToken): void {
    currentToken = token;
  }

  /**
   * Get stored token for persistence.
   */
  getStoredToken(): StoredToken | null {
    return currentToken;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * eBay authentication error.
 */
export class EbayAuthError extends Error {
  public readonly errorData: unknown;

  constructor(message: string, errorData?: unknown) {
    super(message);
    this.name = 'EbayAuthError';
    this.errorData = errorData;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let authInstance: EbayAuth | null = null;

/**
 * Get the eBay auth singleton.
 */
export function getEbayAuth(): EbayAuth {
  if (!authInstance) {
    authInstance = new EbayAuth();
  }
  return authInstance;
}

/**
 * Initialize eBay auth (validates configuration).
 */
export async function initializeEbayAuth(): Promise<EbayAuth> {
  const auth = getEbayAuth();

  // Validate by attempting to get an application token
  await auth.getApplicationToken();

  return auth;
}
