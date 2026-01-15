/**
 * Unified Logging Module for PromptSpeak MCP Server
 *
 * This module provides a comprehensive logging solution with:
 * - Structured logging with multiple severity levels
 * - Correlation ID tracking across async operations
 * - Multiple output formats (JSON for production, colored console for development)
 * - Environment-based configuration via LOG_LEVEL env var
 * - Module prefixes for easy log filtering
 *
 * @example
 * ```typescript
 * import { createLogger, LogContextManager } from './core/logging';
 *
 * const logger = createLogger('MyModule');
 *
 * // Basic logging
 * logger.info('Operation started');
 * logger.debug('Debug details', { key: 'value' });
 * logger.error('Operation failed', error);
 *
 * // With correlation tracking
 * LogContextManager.runWithCorrelation(() => {
 *   logger.info('Request received');  // Includes correlation ID
 *   processRequest();
 *   logger.info('Request completed'); // Same correlation ID
 * });
 *
 * // Child loggers
 * const childLogger = logger.child('SubComponent');
 * childLogger.info('Sub-component message'); // Module: MyModule:SubComponent
 *
 * // Timing operations
 * await logger.time('fetchData', async () => {
 *   return await fetchDataFromAPI();
 * });
 * ```
 *
 * @packageDocumentation
 */

// Types (type-only exports for interfaces/type aliases)
export type {
  LogLevel,
  LogContext,
  LogEntry,
  LoggerConfig,
} from './types.js';

// Runtime values
export {
  LOG_LEVEL_PRIORITY,
  getDefaultConfig,
} from './types.js';

// Context Management
export {
  LogContextManager,
  withCorrelation,
} from './context.js';

// Formatters (type-only for interface)
export type { LogFormatter } from './formatters.js';

// Formatters (runtime values)
export {
  ConsoleFormatter,
  JSONFormatter,
  createFormatter,
} from './formatters.js';

// Logger
export {
  Logger,
  createLogger,
  configureLogger,
  getLoggerConfig,
  rootLogger,
} from './logger.js';

// Convenience re-export of the main factory function as default-like behavior
import { createLogger } from './logger.js';
export default createLogger;
