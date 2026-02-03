/**
 * OAuth Token Validation
 *
 * Provides OAuth 2.0 Bearer token validation with support for:
 * - Local JWT validation (self-issued tokens)
 * - External OAuth provider validation (Auth0, Okta, etc.)
 */

import jwt from 'jsonwebtoken';
import { Result, success, failure, fromPromise } from '../core/result/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decoded token payload after validation.
 */
export interface TokenPayload {
  /** Subject - usually the user ID */
  sub: string;
  /** Issuer - the OAuth provider or this server */
  iss?: string;
  /** Audience - intended recipient */
  aud?: string | string[];
  /** Expiration time (Unix timestamp) */
  exp?: number;
  /** Issued at time (Unix timestamp) */
  iat?: number;
  /** Token scopes/permissions */
  scope?: string;
  /** Tenant ID for multi-tenant deployments */
  tenant_id?: string;
  /** Custom claims */
  [key: string]: unknown;
}

/**
 * Configuration for OAuth token validation.
 */
export interface OAuthConfig {
  /** Whether OAuth is enabled */
  enabled: boolean;
  /** OAuth provider issuer URL (for external validation) */
  issuer: string;
  /** Expected audience claim */
  audience?: string;
  /** JWT secret for local validation */
  jwtSecret: string;
  /** JWT expiry for local token generation */
  jwtExpiry: string;
  /** Whether to use external provider for validation */
  useExternalProvider: boolean;
  /** Cache duration for external JWKS in milliseconds */
  jwksCacheDurationMs?: number;
}

/**
 * Validated token information returned to the caller.
 */
export interface ValidatedToken {
  /** The user ID (from sub claim) */
  userId: string;
  /** Tenant ID if present */
  tenantId?: string;
  /** Token scopes as array */
  scopes: string[];
  /** Token expiration time */
  expiresAt?: Date;
  /** Raw token payload for additional claims */
  payload: TokenPayload;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OAuth Token Validator
 *
 * Validates OAuth 2.0 Bearer tokens using either local JWT validation
 * or external OAuth provider validation.
 */
export class OAuthTokenValidator {
  private readonly config: OAuthConfig;
  private jwksCache: { keys: JsonWebKey[]; expiresAt: number } | null = null;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Validates a Bearer token and returns the validated token information.
   */
  async validate(token: string): Promise<Result<ValidatedToken>> {
    if (!this.config.enabled) {
      return failure('OAUTH_DISABLED', 'OAuth authentication is not enabled');
    }

    if (!token || token.trim() === '') {
      return failure('INVALID_TOKEN', 'Token is required');
    }

    // Choose validation strategy based on configuration
    if (this.config.useExternalProvider && this.config.issuer) {
      return this.validateWithExternalProvider(token);
    }

    return this.validateLocalJwt(token);
  }

  /**
   * Validates a token using local JWT verification.
   */
  private async validateLocalJwt(token: string): Promise<Result<ValidatedToken>> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret, {
        algorithms: ['HS256', 'HS384', 'HS512'],
        issuer: this.config.issuer || undefined,
        audience: this.config.audience || undefined,
      }) as TokenPayload;

      return this.buildValidatedToken(payload);
    } catch (error) {
      return this.handleJwtError(error);
    }
  }

  /**
   * Validates a token using an external OAuth provider.
   */
  private async validateWithExternalProvider(token: string): Promise<Result<ValidatedToken>> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      return failure('INVALID_TOKEN', 'Unable to decode token');
    }

    const { kid } = decoded.header;
    if (!kid) {
      return failure('INVALID_TOKEN', 'Token missing key ID (kid)');
    }

    const jwksResult = await this.fetchJwks();
    if (!jwksResult.success) {
      return jwksResult;
    }

    const key = jwksResult.data.find((k: JsonWebKey & { kid?: string }) => k.kid === kid);
    if (!key) {
      return failure('INVALID_TOKEN', 'Token signed with unknown key');
    }

    const pemResult = this.jwkToPem(key);
    if (!pemResult.success) {
      return pemResult;
    }

    try {
      const payload = jwt.verify(token, pemResult.data, {
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
        issuer: this.config.issuer,
        audience: this.config.audience || undefined,
      }) as TokenPayload;

      return this.buildValidatedToken(payload);
    } catch (error) {
      return this.handleJwtError(error);
    }
  }

  /**
   * Fetches JWKS from the OAuth provider's well-known endpoint.
   */
  private async fetchJwks(): Promise<Result<JsonWebKey[]>> {
    if (this.jwksCache && Date.now() < this.jwksCache.expiresAt) {
      return success(this.jwksCache.keys);
    }

    const jwksUri = `${this.config.issuer.replace(/\/$/, '')}/.well-known/jwks.json`;

    const fetchResult = await fromPromise(
      fetch(jwksUri).then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<{ keys: JsonWebKey[] }>;
      }),
      'JWKS_FETCH_FAILED'
    );

    if (!fetchResult.success) {
      return failure(
        'JWKS_FETCH_FAILED',
        `Failed to fetch JWKS from ${jwksUri}: ${fetchResult.error.message}`
      );
    }

    const { keys } = fetchResult.data;
    if (!keys || !Array.isArray(keys)) {
      return failure('INVALID_JWKS', 'JWKS response missing keys array');
    }

    const cacheDuration = this.config.jwksCacheDurationMs ?? 3600000;
    this.jwksCache = { keys, expiresAt: Date.now() + cacheDuration };

    return success(keys);
  }

  /**
   * Converts a JWK to PEM format for jwt.verify.
   */
  private jwkToPem(jwk: JsonWebKey): Result<string> {
    try {
      const crypto = require('crypto');
      const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      const pem = keyObject.export({ type: 'spki', format: 'pem' }) as string;
      return success(pem);
    } catch (error) {
      return failure(
        'JWK_CONVERSION_FAILED',
        `Failed to convert JWK to PEM: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Builds a ValidatedToken from the decoded payload.
   */
  private buildValidatedToken(payload: TokenPayload): Result<ValidatedToken> {
    if (!payload.sub) {
      return failure('INVALID_TOKEN', 'Token missing subject (sub) claim');
    }

    let scopes: string[] = [];
    if (typeof payload.scope === 'string') {
      scopes = payload.scope.split(' ').filter(Boolean);
    } else if (Array.isArray(payload.scope)) {
      scopes = payload.scope;
    }

    return success({
      userId: payload.sub,
      tenantId: payload.tenant_id as string | undefined,
      scopes,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      payload,
    });
  }

  /**
   * Handles JWT verification errors.
   */
  private handleJwtError(error: unknown): Result<ValidatedToken> {
    if (error instanceof jwt.TokenExpiredError) {
      return failure('TOKEN_EXPIRED', 'Token has expired', {
        details: { expiredAt: error.expiredAt },
      });
    }

    if (error instanceof jwt.NotBeforeError) {
      return failure('TOKEN_NOT_ACTIVE', 'Token is not yet active', {
        details: { notBefore: error.date },
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return failure('INVALID_TOKEN', `Invalid token: ${error.message}`);
    }

    return failure(
      'TOKEN_VALIDATION_FAILED',
      `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  /** Clears the JWKS cache. */
  clearJwksCache(): void {
    this.jwksCache = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL TOKEN GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a local JWT token for testing or development.
 */
export function generateLocalToken(
  userId: string,
  options: {
    scopes?: string[];
    tenantId?: string;
    expiresIn?: string;
  },
  config: Pick<OAuthConfig, 'jwtSecret' | 'jwtExpiry' | 'issuer' | 'audience'>
): string {
  const payload: TokenPayload = {
    sub: userId,
    iss: config.issuer || 'promptspeak',
    aud: config.audience || 'promptspeak-api',
    scope: options.scopes?.join(' ') || 'read write',
    tenant_id: options.tenantId,
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: options.expiresIn || config.jwtExpiry || '1h',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

let validatorInstance: OAuthTokenValidator | null = null;

/**
 * Creates or returns the singleton OAuthTokenValidator.
 */
export function getOAuthValidator(config?: OAuthConfig): OAuthTokenValidator {
  if (!validatorInstance && config) {
    validatorInstance = new OAuthTokenValidator(config);
  }
  if (!validatorInstance) {
    throw new Error('OAuthTokenValidator not initialized. Call with config first.');
  }
  return validatorInstance;
}

/**
 * Initializes the OAuth validator with configuration.
 */
export function initializeOAuthValidator(config: OAuthConfig): OAuthTokenValidator {
  validatorInstance = new OAuthTokenValidator(config);
  return validatorInstance;
}

/**
 * Resets the OAuth validator (for testing).
 */
export function resetOAuthValidator(): void {
  validatorInstance = null;
}
