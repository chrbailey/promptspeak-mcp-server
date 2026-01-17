/**
 * ===============================================================================
 * SECURITY MODULE
 * ===============================================================================
 *
 * Centralized security utilities for the PromptSpeak MCP Server.
 *
 * This module provides:
 * - Secure logging with automatic sensitive data redaction
 * - Field-level redaction utilities
 * - Sensitive field detection
 *
 * USAGE GUIDE:
 *
 * 1. For NEW code in sensitive areas, use SecureLogger:
 *    ```typescript
 *    import { createSecureLogger } from '../core/security/index.js';
 *    const logger = createSecureLogger('MyAdapter');
 *    logger.safeDebug('Processing', { customerId, email, action });
 *    ```
 *
 * 2. For EXISTING code, use the safeDebug wrapper:
 *    ```typescript
 *    import { safeDebug } from '../core/security/index.js';
 *    safeDebug(existingLogger, 'Message', { sensitiveData });
 *    ```
 *
 * 3. For ONE-OFF redaction:
 *    ```typescript
 *    import { redact, redactObject } from '../core/security/index.js';
 *    const safe = redact(sensitiveValue);
 *    const safePayload = redactObject(apiResponse, { redactAll: true });
 *    ```
 *
 * See docs/SECURITY_LOGGING.md for complete guidelines.
 *
 * ===============================================================================
 */

// Redaction utilities
export {
  REDACTED,
  SENSITIVE_FIELD_PATTERNS,
  SENSITIVE_FIELD_NAMES,
  isSensitiveField,
  hashPrefix,
  safePreview,
  redact,
  redactObject,
  redactString,
  type RedactedValue,
} from './redaction.js';

// Secure logging
export {
  SecureLogger,
  createSecureLogger,
  safeDebug,
  safePayloadDebug,
  checkLoggingSafety,
  type SafeDebugOptions,
} from './secure-logging.js';
