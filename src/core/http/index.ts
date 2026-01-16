/**
 * ===============================================================================
 * HTTP MODULE - REUSABLE HTTP CLIENT INFRASTRUCTURE
 * ===============================================================================
 *
 * Provides a unified HTTP client with:
 *   - Automatic retry with exponential backoff
 *   - Timeout handling (AbortController)
 *   - Error classification using PromptSpeak error types
 *   - Configurable defaults and per-request overrides
 *
 * Usage:
 *   import { createHttpClient, createJsonClient, withRetry } from './core/http/index.js';
 *
 *   // Simple JSON API client
 *   const client = createJsonClient('https://api.example.com');
 *   const response = await client.get<UserData>('/users/123');
 *
 *   // With retry configuration
 *   const robustClient = createHttpClient({
 *     baseUrl: 'https://api.example.com',
 *     timeoutMs: 10000,
 *     retry: { maxRetries: 3, initialDelayMs: 500 },
 *   });
 *
 *   // One-off retry
 *   const data = await withRetry(() => fetch(url), { maxRetries: 2 });
 *
 * ===============================================================================
 */

// -----------------------------------------------------------------------------
// HTTP CLIENT
// -----------------------------------------------------------------------------

export {
  HttpClient,
  createHttpClient,
  createJsonClient,
  createAuthenticatedClient,
  classifyHttpError,
  wrapFetchError,
} from './http-client.js';

export type {
  HttpClientConfig,
  HttpRequestOptions,
  HttpResponse,
} from './http-client.js';

export { DEFAULT_HTTP_CONFIG } from './http-client.js';

// -----------------------------------------------------------------------------
// RETRY POLICY
// -----------------------------------------------------------------------------

export {
  RetryPolicy,
  createRetryPolicy,
  noRetry,
  retryTransient,
  withRetry,
  sleep,
} from './retry-policy.js';

export type {
  RetryConfig,
  RetryPolicyOptions,
  ShouldRetryFn,
  OnRetryFn,
} from './retry-policy.js';

export { DEFAULT_RETRY_CONFIG } from './retry-policy.js';
