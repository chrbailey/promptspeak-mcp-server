/**
 * ===============================================================================
 * SECURE REDACTION UTILITIES
 * ===============================================================================
 *
 * Provides utilities for redacting sensitive information from logs and outputs.
 * This module is the first line of defense against information leakage.
 *
 * SECURITY PRINCIPLE: Never log raw values that could contain PII, financial
 * data, credentials, or business-sensitive information. Instead, log metadata
 * about the value (type, length, hash prefix) for debugging.
 *
 * @example
 * ```typescript
 * import { redact, redactObject, isSensitiveField } from './redaction.js';
 *
 * // Redact a single value
 * const safe = redact(customerEmail);
 * // Returns: { type: 'string', length: 25, preview: 'cust***' }
 *
 * // Redact all sensitive fields in an object
 * const safePayload = redactObject(erpResponse);
 * ```
 *
 * ===============================================================================
 */

import { createHash } from 'crypto';

/**
 * Redaction placeholder for logs.
 */
export const REDACTED = '<redacted>';

/**
 * Patterns that indicate a field name contains sensitive data.
 * These are matched case-insensitively against field names.
 */
export const SENSITIVE_FIELD_PATTERNS: readonly RegExp[] = [
  // Authentication & Credentials
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /bearer/i,
  /session[_-]?id/i,

  // Personal Identifiable Information (PII)
  /email/i,
  /phone/i,
  /address/i,
  /ssn/i,
  /social[_-]?security/i,
  /tax[_-]?id/i,
  /passport/i,
  /driver[_-]?license/i,
  /date[_-]?of[_-]?birth/i,
  /dob/i,
  /national[_-]?id/i,

  // Financial Data
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /cvv/i,
  /cvc/i,
  /account[_-]?number/i,
  /routing[_-]?number/i,
  /iban/i,
  /swift/i,
  /bank/i,
  /billing/i,
  /invoice[_-]?(number|id|amount)/i,
  /payment/i,
  /salary/i,
  /compensation/i,

  // ERP/SAP Specific Fields
  /customer[_-]?(id|name|number)/i,
  /vendor[_-]?(id|name|number)/i,
  /employee[_-]?(id|name|number)/i,
  /posting[_-]?date/i,
  /document[_-]?number/i,
  /material[_-]?(number|id)/i,
  /purchase[_-]?order/i,
  /sales[_-]?order/i,
  /cost[_-]?center/i,
  /profit[_-]?center/i,
  /gl[_-]?account/i,
  /company[_-]?code/i,

  // Healthcare (HIPAA)
  /patient/i,
  /diagnosis/i,
  /prescription/i,
  /medical/i,
  /health/i,

  // Legal
  /case[_-]?number/i,
  /docket/i,
  /plaintiff/i,
  /defendant/i,

  // Generic Sensitive Patterns
  /private/i,
  /confidential/i,
  /sensitive/i,
  /pii/i,
];

/**
 * Specific field names that should always be redacted regardless of pattern.
 */
export const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'secret',
  'apiKey',
  'api_key',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'cookie',
  'ssn',
  'creditCard',
  'credit_card',
  'cvv',
  'pin',
]);

/**
 * Result of redacting a value - preserves metadata for debugging.
 */
export interface RedactedValue {
  /** Original type of the value */
  type: string;
  /** Length of string representation */
  length: number;
  /** First 4 chars with asterisks (for correlation) */
  preview?: string;
  /** SHA-256 hash prefix (8 chars) for correlation without exposure */
  hashPrefix?: string;
  /** Whether the value was null/undefined */
  isNull?: boolean;
  /** For arrays, the count of elements */
  count?: number;
}

/**
 * Check if a field name matches sensitive patterns.
 *
 * @param fieldName - The field name to check
 * @returns true if the field name indicates sensitive data
 */
export function isSensitiveField(fieldName: string): boolean {
  // Check exact matches first (fast path)
  if (SENSITIVE_FIELD_NAMES.has(fieldName)) {
    return true;
  }

  // Check patterns
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Compute a safe hash prefix for correlation purposes.
 * Uses a salted hash to prevent rainbow table attacks.
 *
 * @param value - Value to hash
 * @param salt - Optional salt (defaults to empty string)
 * @returns First 8 characters of SHA-256 hash
 */
export function hashPrefix(value: unknown, salt = ''): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const hash = createHash('sha256')
    .update(salt + str)
    .digest('hex');
  return hash.substring(0, 8);
}

/**
 * Create a safe preview of a string value.
 * Shows first 4 characters followed by asterisks.
 *
 * @param value - String to preview
 * @returns Safe preview string
 */
export function safePreview(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, 4) + '***';
}

/**
 * Redact a single value, returning metadata for debugging.
 *
 * @param value - Any value that might be sensitive
 * @param includeHash - Whether to include hash prefix for correlation
 * @returns Redacted metadata object
 *
 * @example
 * ```typescript
 * redact('john.doe@company.com')
 * // Returns: { type: 'string', length: 20, preview: 'john***' }
 *
 * redact({ nested: 'data' })
 * // Returns: { type: 'object', length: 18 }
 * ```
 */
export function redact(value: unknown, includeHash = false): RedactedValue {
  if (value === null || value === undefined) {
    return { type: 'null', length: 0, isNull: true };
  }

  const type = typeof value;

  if (type === 'string') {
    const str = value as string;
    const result: RedactedValue = {
      type: 'string',
      length: str.length,
      preview: safePreview(str),
    };
    if (includeHash) {
      result.hashPrefix = hashPrefix(str);
    }
    return result;
  }

  if (type === 'number' || type === 'boolean') {
    // Numbers and booleans are generally safe, but we still redact
    return { type, length: String(value).length };
  }

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: JSON.stringify(value).length,
      count: value.length,
    };
  }

  if (type === 'object') {
    const keys = Object.keys(value as object);
    return {
      type: 'object',
      length: JSON.stringify(value).length,
      count: keys.length,
    };
  }

  return { type, length: String(value).length };
}

/**
 * Redact all values in an object, automatically detecting sensitive fields.
 *
 * @param obj - Object to redact
 * @param options - Redaction options
 * @returns New object with sensitive values redacted
 *
 * @example
 * ```typescript
 * const payload = {
 *   customerId: '12345',
 *   email: 'john@example.com',
 *   action: 'purchase'
 * };
 *
 * redactObject(payload)
 * // Returns: {
 * //   customerId: { type: 'string', length: 5, preview: '1234***' },
 * //   email: { type: 'string', length: 16, preview: 'john***' },
 * //   action: 'purchase'  // Not sensitive, passed through
 * // }
 * ```
 */
export function redactObject(
  obj: Record<string, unknown>,
  options: {
    /** Redact ALL fields, not just sensitive ones */
    redactAll?: boolean;
    /** Include hash prefixes for correlation */
    includeHashes?: boolean;
    /** Additional field names to treat as sensitive */
    additionalSensitive?: string[];
    /** Field names to explicitly allow (whitelist) */
    allowList?: string[];
  } = {}
): Record<string, unknown> {
  const {
    redactAll = false,
    includeHashes = false,
    additionalSensitive = [],
    allowList = [],
  } = options;

  const allowSet = new Set(allowList);
  const additionalSet = new Set(additionalSensitive);

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if explicitly allowed
    if (allowSet.has(key)) {
      result[key] = value;
      continue;
    }

    // Check if should be redacted
    const shouldRedact =
      redactAll || isSensitiveField(key) || additionalSet.has(key);

    if (shouldRedact) {
      result[key] = redact(value, includeHashes);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively handle nested objects
      result[key] = redactObject(value as Record<string, unknown>, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Redact sensitive patterns from a string (for log messages).
 *
 * @param message - Message that might contain sensitive data
 * @returns Message with sensitive patterns replaced
 */
export function redactString(message: string): string {
  // Redact common sensitive patterns in strings
  return (
    message
      // Email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<email-redacted>')
      // Credit card numbers (various formats)
      .replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '<card-redacted>')
      // SSN (US)
      .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, '<ssn-redacted>')
      // Phone numbers (basic)
      .replace(/\b\d{3}[- .]?\d{3}[- .]?\d{4}\b/g, '<phone-redacted>')
      // API keys (common patterns)
      .replace(/\b[A-Za-z0-9]{32,}\b/g, (match) => {
        // Only redact if it looks like a key (mixed case/numbers, long)
        if (/[A-Z]/.test(match) && /[a-z]/.test(match) && /\d/.test(match)) {
          return '<key-redacted>';
        }
        return match;
      })
  );
}
