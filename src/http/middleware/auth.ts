/**
 * Authentication Middleware
 *
 * Supports dual authentication methods:
 * 1. API Keys - Simple header-based auth for development/personal use
 * 2. OAuth 2.0 - Bearer tokens for production multi-tenant deployment
 *
 * Design Principle: Explicit lens selection (from PERSONA_LENS_ARCHITECTURE.md)
 */

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config.js';
import { UnauthorizedError, ForbiddenError } from './error-handler.js';
import { validateApiKey, ApiKeyInfo } from '../../auth/api-key.js';

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATED REQUEST TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface AuthenticatedUser {
  userId: string;
  tenantId?: string;
  authMethod: 'api_key' | 'oauth';
  scopes: string[];
  activeLens?: string;
  rateLimitTier: 'free' | 'pro' | 'enterprise';
  apiKeyInfo?: ApiKeyInfo;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  activeLens?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const config = getConfig();

  try {
    // Check for API key in header
    const apiKeyHeader = config.auth.apiKeyHeader.toLowerCase();
    const apiKey = req.headers[apiKeyHeader] as string;

    // Check for Bearer token
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!apiKey && !bearerToken) {
      throw new UnauthorizedError(
        `Authentication required. Provide ${config.auth.apiKeyHeader} header or Bearer token.`
      );
    }

    let user: AuthenticatedUser;

    if (apiKey) {
      // API Key authentication
      user = await authenticateApiKey(apiKey);
    } else if (bearerToken) {
      // OAuth Bearer token authentication
      user = await authenticateBearerToken(bearerToken);
    } else {
      throw new UnauthorizedError('No valid authentication method provided');
    }

    // Extract lens from X-Lens header (explicit selection)
    const lensHeader = req.headers['x-lens'] as string;
    if (lensHeader) {
      user.activeLens = lensHeader;
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).activeLens = user.activeLens;

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else {
      next(new UnauthorizedError('Authentication failed'));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEY AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

async function authenticateApiKey(apiKey: string): Promise<AuthenticatedUser> {
  const config = getConfig();

  // Validate key format
  if (!apiKey.startsWith(config.auth.apiKeyPrefix)) {
    throw new UnauthorizedError(
      `Invalid API key format. Keys must start with '${config.auth.apiKeyPrefix}'`
    );
  }

  // Validate against database
  const keyInfo = await validateApiKey(apiKey);

  if (!keyInfo) {
    throw new UnauthorizedError('Invalid or expired API key');
  }

  if (keyInfo.revoked) {
    throw new UnauthorizedError('API key has been revoked');
  }

  if (keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date()) {
    throw new UnauthorizedError('API key has expired');
  }

  return {
    userId: keyInfo.userId,
    authMethod: 'api_key',
    scopes: keyInfo.scopes,
    rateLimitTier: keyInfo.rateLimitTier,
    apiKeyInfo: keyInfo,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH BEARER TOKEN AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

async function authenticateBearerToken(token: string): Promise<AuthenticatedUser> {
  const config = getConfig();

  if (!config.oauth.enabled) {
    throw new UnauthorizedError('OAuth authentication is not enabled');
  }

  // TODO: Implement OAuth token validation in Phase 3
  // For now, return a placeholder that indicates OAuth is not yet implemented
  throw new UnauthorizedError('OAuth authentication not yet implemented. Use API key.');
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE CHECKING
// ═══════════════════════════════════════════════════════════════════════════

export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const hasAllScopes = requiredScopes.every(scope =>
      user.scopes.includes(scope) || user.scopes.includes('admin')
    );

    if (!hasAllScopes) {
      return next(new ForbiddenError(
        `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`
      ));
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONAL AUTH (for endpoints that work with or without auth)
// ═══════════════════════════════════════════════════════════════════════════

export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const config = getConfig();
  const apiKeyHeader = config.auth.apiKeyHeader.toLowerCase();
  const apiKey = req.headers[apiKeyHeader] as string;

  if (apiKey) {
    // If API key is provided, validate it
    return authMiddleware(req, res, next);
  }

  // No auth provided, continue without user
  next();
}
