# Secure Logging Guidelines

> **MANDATORY READING** for anyone writing or reviewing code that handles sensitive data.

## Overview

This document defines the security requirements for logging in the PromptSpeak MCP Server. Following these guidelines prevents information leakage through logs, which is a common source of security vulnerabilities (flagged by CodeQL, OWASP, etc.).

## The Golden Rules

### ❌ NEVER DO THIS

```typescript
// DANGEROUS: Raw sensitive values in logs
logger.debug(`Customer email: ${customer.email}`);
logger.info(`Processing invoice ${invoice.number} for ${invoice.amount}`);
logger.error(`API failed for user ${userId} with token ${authToken}`);

// DANGEROUS: Logging entire API responses
logger.debug('SAM API response:', response.data);

// DANGEROUS: Template literals with untrusted input
logger.warn(`Failed to parse: ${userInput}`);
```

### ✅ ALWAYS DO THIS

```typescript
import { createSecureLogger, safeDebug } from '../core/security/index.js';

// Option 1: Use SecureLogger for new code
const logger = createSecureLogger('MyAdapter');
logger.safeDebug('Processing customer', {
  customerId: customer.id,     // Auto-redacted
  email: customer.email,       // Auto-redacted
  action: 'lookup'             // Safe, passed through
});

// Option 2: Use safeDebug wrapper for existing loggers
safeDebug(existingLogger, 'API response', responseData, { redactAll: true });

// Option 3: Log only metadata
logger.debug('Processing invoice', {
  invoiceId: redact(invoice.id),
  hasAmount: invoice.amount !== undefined,
  currency: invoice.currency  // Safe metadata
});
```

## What Counts as Sensitive Data?

### Automatically Detected (by field name patterns)

| Category | Field Patterns |
|----------|----------------|
| **Credentials** | `password`, `secret`, `token`, `apiKey`, `auth`, `bearer` |
| **PII** | `email`, `phone`, `address`, `ssn`, `dateOfBirth`, `nationalId` |
| **Financial** | `creditCard`, `accountNumber`, `routing`, `invoice`, `payment`, `salary` |
| **ERP/SAP** | `customerId`, `vendorId`, `employeeId`, `documentNumber`, `costCenter` |
| **Healthcare** | `patient`, `diagnosis`, `prescription`, `medical` |
| **Legal** | `caseNumber`, `docket`, `plaintiff`, `defendant` |

### Always Sensitive (regardless of field name)

- API responses from external services
- Request/response bodies
- User-provided input
- Database query results containing user data
- Error messages that might contain input values

## Using the Security Module

### SecureLogger (Recommended for New Code)

```typescript
import { createSecureLogger } from '../core/security/index.js';

const logger = createSecureLogger('SamAdapter');

// Automatic redaction of sensitive fields
logger.safeDebug('Entity lookup', {
  entityId: '123456',          // Redacted: { type: 'string', length: 6, preview: '1234***' }
  email: 'john@example.com',   // Redacted: { type: 'string', length: 16, preview: 'john***' }
  action: 'search'             // Passed through: 'search'
});

// Force-redact everything (for raw API responses)
logger.safeDebug('API response', apiResponse, { redactAll: true });

// Include hash for correlation
logger.safeDebug('Processing', { orderId }, { includeHashes: true });
// Produces: { orderId: { type: 'string', length: 10, hashPrefix: 'a1b2c3d4' } }
```

### safeDebug Wrapper (For Existing Loggers)

```typescript
import { safeDebug } from '../core/security/index.js';
import { createLogger } from '../core/logging/index.js';

const logger = createLogger('MyModule');

// Wrap sensitive logging calls
safeDebug(logger, 'Customer data', customerRecord);
```

### Manual Redaction (For Fine-Grained Control)

```typescript
import { redact, redactObject, isSensitiveField } from '../core/security/index.js';

// Redact a single value
const safeId = redact(customerId);
// Returns: { type: 'string', length: 10, preview: 'cust***' }

// Redact an object with options
const safePayload = redactObject(payload, {
  redactAll: false,                    // Only redact detected sensitive fields
  includeHashes: true,                 // Add hash prefixes for correlation
  additionalSensitive: ['internalId'], // Extra fields to redact
  allowList: ['action', 'status']      // Explicitly safe fields
});

// Check before logging
if (isSensitiveField('customerEmail')) {
  logger.debug('Has email', { hasEmail: true }); // Safe
} else {
  logger.debug('Email', { email: value }); // Would be dangerous
}
```

## Required in These Modules

The following modules **MUST** use secure logging:

| Module | Reason |
|--------|--------|
| `government/adapters/*` | SAM.gov, USASpending contain contractor PII |
| `swarm/ebay/*` | eBay API responses contain seller/buyer data |
| `auth/*` | API keys, tokens, credentials |
| `http/routes/*` | User requests may contain sensitive params |
| `symbols/manager.ts` | Symbol content may contain business data |
| `document/*` | Document extraction may include PII |

## CI Enforcement

Pull requests are automatically checked for:

1. **Pattern violations**: Direct logging of known sensitive field names
2. **Template string injection**: `logger.*\`.*\${` patterns
3. **Console.log remnants**: Direct console usage (should use logger)

Violations will block merge until fixed.

## What the Redaction Preserves

For debugging without exposure, redaction keeps:

| Property | Purpose |
|----------|---------|
| `type` | Data type (`string`, `object`, `array`) |
| `length` | Character/byte length for size debugging |
| `preview` | First 4 chars + `***` for visual correlation |
| `hashPrefix` | SHA-256 prefix for cross-log correlation |
| `count` | Element count for arrays/objects |
| `isNull` | Whether value was null/undefined |

Example output:
```json
{
  "customerId": { "type": "string", "length": 10, "preview": "cust***" },
  "email": { "type": "string", "length": 25, "preview": "john***" },
  "orders": { "type": "array", "count": 3, "length": 1547 }
}
```

## Migration Guide

### Before (Vulnerable)

```typescript
logger.debug(`Processing SAM entity: ${entity.ueiSAM}`);
logger.info('Entity data:', entity);
```

### After (Secure)

```typescript
import { createSecureLogger } from '../core/security/index.js';

const logger = createSecureLogger('SamAdapter');

logger.safeDebug('Processing SAM entity', {
  ueiSAM: entity.ueiSAM  // Auto-redacted
});

logger.safeDebug('Entity data', entity, { redactAll: true });
```

## FAQ

**Q: What if I need the actual value for debugging?**
A: Use breakpoints, not logs. If you must log, do it locally and never commit.

**Q: The auto-detection missed a sensitive field. What do I do?**
A: Use `additionalSensitive` option, and open a PR to add the pattern to `SENSITIVE_FIELD_PATTERNS`.

**Q: Performance impact?**
A: Minimal. Redaction adds ~0.1ms per object. Only applies when logging actually executes (respects log levels).

**Q: Can I log to a separate secure channel?**
A: Not currently. All logs should be safe for any channel. If you need secure audit logging, use the audit module.

---

*Last updated: 2026-01-16*
*Owner: Security Team*
