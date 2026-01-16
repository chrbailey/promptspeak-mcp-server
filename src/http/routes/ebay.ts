/**
 * eBay OAuth Routes
 *
 * Handles eBay OAuth 2.0 authorization flow:
 * - Initiate authorization (redirect to eBay)
 * - Handle OAuth callback (receive authorization code)
 * - Get authorization status
 *
 * These routes are PUBLIC (no auth middleware) because:
 * - /authorize needs to redirect user to eBay
 * - /callback receives redirect from eBay
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getEbayClient } from '../../swarm/ebay/client.js';
import { getEbayAuth, EbayAuthError } from '../../swarm/ebay/auth.js';
import { isSandboxMode, requireProductionConfirmation } from '../../swarm/ebay/sandbox-config.js';
import crypto from 'crypto';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT (for CSRF protection)
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory state storage (replace with Redis in production)
const pendingAuthorizations = new Map<string, {
  createdAt: number;
  redirectAfter?: string;
}>();

// Clean up old states every 5 minutes
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pendingAuthorizations.entries()) {
    if (now - data.createdAt > STATE_EXPIRY_MS) {
      pendingAuthorizations.delete(state);
    }
  }
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/ebay/status - Check eBay connection status
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = getEbayClient();
    const status = await client.checkConnection();
    const auth = getEbayAuth();
    const tokenInfo = auth.getTokenInfo();

    res.json({
      success: true,
      status: {
        connected: status.connected,
        sandbox: status.sandbox,
        hasUserAuth: status.hasUserAuth,
        tokenInfo: {
          hasToken: tokenInfo.hasToken,
          isUserToken: tokenInfo.isUserToken,
          expiresIn: tokenInfo.expiresIn,
          scopeCount: tokenInfo.scopes.length,
        },
        rateLimits: status.rateLimitStatus,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/ebay/authorize - Initiate OAuth authorization
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/authorize', (req: Request, res: Response) => {
  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Store state for validation on callback
  pendingAuthorizations.set(state, {
    createdAt: Date.now(),
    redirectAfter: req.query.redirect as string | undefined,
  });

  // Get authorization URL
  const client = getEbayClient();
  const authUrl = client.getAuthorizationUrl(state);

  // Log for debugging
  console.log(`[eBay OAuth] Initiating authorization, state: ${state.substring(0, 8)}...`);
  console.log(`[eBay OAuth] Sandbox mode: ${isSandboxMode()}`);

  // Redirect user to eBay
  res.redirect(authUrl);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/ebay/callback - Handle OAuth callback from eBay
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle errors from eBay
    if (error) {
      console.error(`[eBay OAuth] Authorization error: ${error} - ${error_description}`);
      return res.status(400).json({
        success: false,
        error: 'authorization_failed',
        message: error_description || 'User denied authorization or an error occurred',
        ebayError: error,
      });
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'invalid_callback',
        message: 'Missing required parameters: code or state',
      });
    }

    // Validate state (CSRF protection)
    const stateData = pendingAuthorizations.get(state as string);
    if (!stateData) {
      return res.status(400).json({
        success: false,
        error: 'invalid_state',
        message: 'Invalid or expired authorization state. Please try again.',
      });
    }

    // Remove used state
    pendingAuthorizations.delete(state as string);

    // Check if state is expired
    if (Date.now() - stateData.createdAt > STATE_EXPIRY_MS) {
      return res.status(400).json({
        success: false,
        error: 'state_expired',
        message: 'Authorization timed out. Please try again.',
      });
    }

    // Exchange authorization code for tokens
    console.log(`[eBay OAuth] Exchanging authorization code, state: ${(state as string).substring(0, 8)}...`);

    const client = getEbayClient();
    await client.handleAuthCallback(code as string);

    // Get updated status
    const auth = getEbayAuth();
    const tokenInfo = auth.getTokenInfo();

    console.log(`[eBay OAuth] Authorization successful! User token obtained.`);

    // If there's a redirect, use it
    if (stateData.redirectAfter) {
      return res.redirect(stateData.redirectAfter);
    }

    // Return success response
    res.json({
      success: true,
      message: 'eBay authorization successful!',
      authorization: {
        hasUserToken: tokenInfo.isUserToken,
        expiresIn: tokenInfo.expiresIn,
        scopes: tokenInfo.scopes,
        sandbox: isSandboxMode(),
      },
      nextSteps: [
        'User can now bid on auctions',
        'User can make offers on items',
        'User can complete purchases',
      ],
    });
  } catch (error) {
    if (error instanceof EbayAuthError) {
      console.error(`[eBay OAuth] Token exchange failed:`, error.message, error.errorData);
      return res.status(400).json({
        success: false,
        error: 'token_exchange_failed',
        message: error.message,
        details: error.errorData,
      });
    }
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/ebay/logout - Revoke user authorization
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/logout', (req: Request, res: Response) => {
  const auth = getEbayAuth();
  const hadUserToken = auth.hasUserToken();

  auth.clearTokens();

  console.log(`[eBay OAuth] User tokens cleared`);

  res.json({
    success: true,
    message: hadUserToken
      ? 'User authorization revoked'
      : 'No user authorization was active',
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/v1/ebay/authorize-url - Get authorization URL without redirecting
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/authorize-url', (req: Request, res: Response) => {
  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Store state for validation on callback
  pendingAuthorizations.set(state, {
    createdAt: Date.now(),
    redirectAfter: req.query.redirect as string | undefined,
  });

  // Get authorization URL
  const client = getEbayClient();
  const authUrl = client.getAuthorizationUrl(state);

  res.json({
    success: true,
    authorizationUrl: authUrl,
    state,
    expiresIn: STATE_EXPIRY_MS / 1000,
    sandbox: isSandboxMode(),
    instructions: [
      '1. Open the authorization URL in a browser',
      '2. Sign in to eBay sandbox account',
      '3. Grant permission to the application',
      '4. User will be redirected to callback URL',
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/v1/ebay/confirm-production - Confirm production mode (safety check)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/confirm-production', (req: Request, res: Response) => {
  if (isSandboxMode()) {
    return res.json({
      success: true,
      message: 'Currently in sandbox mode. No confirmation needed.',
      sandbox: true,
    });
  }

  try {
    // This will throw if not confirmed
    requireProductionConfirmation();

    res.json({
      success: true,
      message: 'Production mode is confirmed and active',
      sandbox: false,
      warning: 'REAL MONEY TRANSACTIONS ARE ENABLED',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: 'production_not_confirmed',
      message: (error as Error).message,
      action: 'Set EBAY_PRODUCTION_CONFIRMED=true in environment to enable production mode',
    });
  }
});

export default router;
