/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROMPTSPEAK DIRECTIVE SYMBOL MODULE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Exports for the directive symbol registry system.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// Types
export * from './types.js';

// Manager
export {
  SymbolManager,
  initializeSymbolManager,
  getSymbolManager,
} from './manager.js';

// MCP Tools
export {
  symbolToolDefinitions,
  handleSymbolTool,
  formatSymbolForPrompt,
} from './tools.js';

// Security: Sanitizer
export {
  sanitizeContent,
  validateSymbolContent,
  verifySymbolUsage,
  calculateEntropy,
  wrapWithSafetyDelimiters,
  normalizeUnicode,
  detectUnicodeEvasion,
  SAFETY_HEADER,
  SAFETY_FOOTER,
  SANITIZER_CONFIG,
  sanitizer,
  type SanitizationResult,
  type FullValidationResult,
  type InjectionViolation,
  type ViolationSeverity,
  type UsageVerificationResult,
} from './sanitizer.js';

// Security: Audit Logging
export {
  AuditLogger,
  initializeAuditLogger,
  getAuditLogger,
  type AuditEntry,
  type AuditEventType,
  type AuditStats,
} from './audit.js';

// Database (SQLite backend)
export {
  SymbolDatabase,
  initializeDatabase,
  getDatabase,
  closeDatabase,
  type SymbolRow,
  type AuditRow,
  type DatabaseStats,
} from './database.js';

// Graph Types
export * from './graph-types.js';

// Graph Manager
export {
  GraphManager,
  getGraphManager,
  resetGraphManager,
} from './graph-manager.js';

