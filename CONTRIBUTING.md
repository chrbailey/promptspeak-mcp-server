# Contributing to PromptSpeak MCP Server

Thank you for contributing to PromptSpeak! This document outlines our development practices and requirements.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npx tsc --noEmit

# Build
npm run build
```

## Code Quality Requirements

All PRs must:
- [ ] Pass TypeScript type checking (`npx tsc --noEmit`)
- [ ] Pass all tests (`npm test`)
- [ ] Pass linting (`npm run lint`)
- [ ] Pass security checks (see below)

---

## 🔒 SECURITY REQUIREMENTS

### Secure Logging (MANDATORY)

**Read the full guide:** [docs/SECURITY_LOGGING.md](docs/SECURITY_LOGGING.md)

#### Quick Rules

1. **NEVER log raw sensitive values:**
   ```typescript
   // ❌ WRONG - Will be rejected by CI
   logger.debug(`Customer: ${customer.email}`);
   logger.info('Response:', apiResponse);

   // ✅ CORRECT - Use secure logging
   import { createSecureLogger } from '../core/security/index.js';
   const logger = createSecureLogger('MyModule');
   logger.safeDebug('Customer lookup', { email: customer.email });
   ```

2. **Use SecureLogger in sensitive modules:**
   - `government/adapters/*`
   - `swarm/ebay/*`
   - `auth/*`
   - `http/routes/*`
   - Any code handling PII, financial data, or credentials

3. **For existing loggers, use the wrapper:**
   ```typescript
   import { safeDebug } from '../core/security/index.js';
   safeDebug(logger, 'Processing', sensitiveData);
   ```

### CI Security Checks

PRs are automatically scanned for:
- Direct logging of sensitive field names
- Template string injection in logs
- Unredacted API response logging

**Violations will block merge.**

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- --grep "security"

# Watch mode
npm test -- --watch
```

### Writing Tests

- Place tests in `__tests__/` directories or `*.test.ts` files
- Use descriptive test names
- Mock external APIs
- Test error cases

---

## Architecture Overview

```
src/
├── core/           # Shared utilities
│   ├── logging/    # Structured logging
│   ├── security/   # Redaction & secure logging ← NEW
│   ├── errors/     # Error types
│   └── result/     # Result pattern utilities
├── handlers/       # MCP tool handlers
├── symbols/        # Symbol registry
├── government/     # SAM.gov, USASpending adapters
├── swarm/          # eBay swarm agents
└── http/           # Express HTTP server
```

---

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all checks pass locally
4. Submit PR with clear description
5. Address review feedback
6. Squash and merge when approved

---

## Questions?

- Check existing issues
- Open a discussion for design questions
- Tag `@maintainers` for urgent security issues
