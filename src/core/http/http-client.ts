/**
 * ===============================================================================
 * HTTP CLIENT
 * ===============================================================================
 *
 * Reusable HTTP client with built-in:
 *   - Timeout handling (AbortController)
 *   - Retry with exponential backoff
 *   - Error classification using PromptSpeak error types
 *   - Request/response logging hooks
 *
 * Consolidates duplicate HTTP patterns from:
 *   - government/adapters/base-adapter.ts
 *   - swarm/ebay/client.ts
 *   - notifications/webhook-dispatcher.ts
 *
 * ===============================================================================
 */

import {
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  NotFoundError,
  AdapterError,
  ErrorCode,
  isPromptSpeakError,
} from '../errors/index.js';
import { RetryPolicy, createRetryPolicy, type RetryPolicyOptions, sleep } from './retry-policy.js';

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------

/**
 * HTTP client configuration.
 */
export interface HttpClientConfig {
  /** Base URL for all requests (optional) */
  baseUrl?: string;
  /** Default request timeout in milliseconds (default: 30000) */
  timeoutMs: number;
  /** Default headers to include in all requests */
  defaultHeaders?: Record<string, string>;
  /** Retry configuration (optional, disables retry if not provided) */
  retry?: RetryPolicyOptions;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes?: number[];
}

/**
 * Default HTTP client configuration.
 */
export const DEFAULT_HTTP_CONFIG: HttpClientConfig = {
  timeoutMs: 30000,
  defaultHeaders: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * HTTP request options.
 */
export interface HttpRequestOptions {
  /** HTTP method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  /** Request headers (merged with defaults) */
  headers?: Record<string, string>;
  /** Request body (will be JSON stringified for objects) */
  body?: unknown;
  /** Override timeout for this request */
  timeoutMs?: number;
  /** Skip retry for this request */
  skipRetry?: boolean;
  /** Parse response as JSON (default: true) */
  parseJson?: boolean;
}

/**
 * HTTP response wrapper.
 */
export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Parsed response data */
  data: T;
  /** Whether the response was successful (2xx) */
  ok: boolean;
}

// -----------------------------------------------------------------------------
// ERROR CLASSIFICATION
// -----------------------------------------------------------------------------

/**
 * Classifies HTTP errors into PromptSpeak error types.
 */
export function classifyHttpError(
  status: number,
  statusText: string,
  url: string,
  retryableStatusCodes: number[] = DEFAULT_HTTP_CONFIG.retryableStatusCodes!
): Error {
  const retryable = retryableStatusCodes.includes(status);
  const message = `HTTP ${status}: ${statusText}`;

  switch (status) {
    case 429:
      return new RateLimitError(message, {
        statusCode: status,
        retryable: true,
      });

    case 401:
    case 403:
      return new AuthenticationError(message, {
        statusCode: status,
        retryable: false,
      });

    case 404:
      return new NotFoundError('Resource', url, {
        statusCode: status,
        retryable: false,
      });

    default:
      return new AdapterError(message, {
        adapterName: 'HttpClient',
        code: status >= 500 ? ErrorCode.SERVER_ERROR : ErrorCode.ADAPTER_ERROR,
        statusCode: status,
        retryable,
      });
  }
}

/**
 * Wraps fetch errors in PromptSpeak error types.
 */
export function wrapFetchError(error: Error, url: string, timeoutMs: number): Error {
  // Already a PromptSpeak error
  if (isPromptSpeakError(error)) {
    return error;
  }

  // Timeout (AbortError)
  if (error.name === 'AbortError') {
    return new TimeoutError('Request timed out', {
      timeoutMs,
      originalError: error,
      retryable: true,
    });
  }

  // Network error (TypeError from fetch)
  if (error.name === 'TypeError') {
    return new NetworkError(`Network error: ${error.message}`, {
      url,
      originalError: error,
      retryable: true,
    });
  }

  // Generic network error
  return new NetworkError(`Request failed: ${error.message}`, {
    url,
    originalError: error,
    retryable: true,
  });
}

// -----------------------------------------------------------------------------
// HTTP CLIENT
// -----------------------------------------------------------------------------

/**
 * Reusable HTTP client with retry, timeout, and error handling.
 */
export class HttpClient {
  private readonly config: HttpClientConfig;
  private readonly retryPolicy?: RetryPolicy;

  constructor(config: Partial<HttpClientConfig> = {}) {
    this.config = { ...DEFAULT_HTTP_CONFIG, ...config };

    if (this.config.retry) {
      this.retryPolicy = createRetryPolicy({
        ...this.config.retry,
        shouldRetry: (error) => {
          if (isPromptSpeakError(error)) {
            return error.retryable ?? false;
          }
          return false;
        },
      });
    }
  }

  /**
   * Make an HTTP request.
   *
   * @param endpoint - URL or path (appended to baseUrl if relative)
   * @param options - Request options
   * @returns Response wrapper with parsed data
   * @throws Classified PromptSpeak errors on failure
   */
  async request<T = unknown>(
    endpoint: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeoutMs = this.config.timeoutMs,
      skipRetry = false,
      parseJson = true,
    } = options;

    const url = this.resolveUrl(endpoint);

    const executeRequest = async (): Promise<HttpResponse<T>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers: this.mergeHeaders(headers),
          body: body !== undefined ? this.serializeBody(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        // Handle HTTP errors
        if (!response.ok) {
          throw classifyHttpError(
            response.status,
            response.statusText,
            url,
            this.config.retryableStatusCodes
          );
        }

        // Parse response
        const data = parseJson ? await response.json() : await response.text();

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: data as T,
          ok: true,
        };
      } catch (error) {
        clearTimeout(timeout);

        if (error instanceof Error) {
          throw wrapFetchError(error, url, timeoutMs);
        }
        throw error;
      }
    };

    // Execute with or without retry
    if (this.retryPolicy && !skipRetry) {
      return this.retryPolicy.execute(executeRequest);
    }
    return executeRequest();
  }

  /**
   * GET request.
   */
  async get<T = unknown>(
    endpoint: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request.
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * PUT request.
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * PATCH request.
   */
  async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETE request.
   */
  async delete<T = unknown>(
    endpoint: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Resolve URL from endpoint and baseUrl.
   */
  private resolveUrl(endpoint: string): string {
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }
    if (this.config.baseUrl) {
      const base = this.config.baseUrl.endsWith('/')
        ? this.config.baseUrl.slice(0, -1)
        : this.config.baseUrl;
      const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${base}${path}`;
    }
    return endpoint;
  }

  /**
   * Merge request headers with defaults.
   */
  private mergeHeaders(headers: Record<string, string>): Record<string, string> {
    return {
      ...this.config.defaultHeaders,
      ...headers,
    };
  }

  /**
   * Serialize request body.
   */
  private serializeBody(body: unknown): string | undefined {
    if (body === undefined || body === null) {
      return undefined;
    }
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  }
}

// -----------------------------------------------------------------------------
// FACTORY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Create an HTTP client with the given configuration.
 */
export function createHttpClient(config?: Partial<HttpClientConfig>): HttpClient {
  return new HttpClient(config);
}

/**
 * Create an HTTP client configured for JSON APIs.
 */
export function createJsonClient(
  baseUrl: string,
  options?: Partial<Omit<HttpClientConfig, 'baseUrl'>>
): HttpClient {
  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    ...options,
  });
}

/**
 * Create an HTTP client with authentication.
 */
export function createAuthenticatedClient(
  baseUrl: string,
  authHeader: string,
  authValue: string,
  options?: Partial<HttpClientConfig>
): HttpClient {
  return new HttpClient({
    baseUrl,
    defaultHeaders: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      [authHeader]: authValue,
    },
    ...options,
  });
}
