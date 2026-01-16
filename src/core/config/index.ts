/**
 * ===============================================================================
 * CONFIGURATION MODULE
 * ===============================================================================
 *
 * Centralized configuration utilities for the PromptSpeak codebase.
 * Provides type-safe environment variable access and validation.
 *
 * Usage:
 *   import {
 *     getEnv,
 *     getEnvNumber,
 *     getEnvBoolean,
 *     getEnvList,
 *     validateRequiredEnv,
 *     isProduction,
 *   } from '../core/config/index.js';
 *
 * ===============================================================================
 */

// Environment variable utilities
export {
  // Basic accessors
  getEnv,
  getEnvOptional,
  getEnvOrUndefined,

  // Typed accessors
  getEnvNumber,
  getEnvFloat,
  getEnvBoolean,
  getEnvList,
  getEnvJson,
  getEnvEnum,

  // Validation
  validateRequiredEnv,
  hasEnv,

  // Environment helpers
  getNodeEnv,
  isProduction,
  isDevelopment,
  isTest,
} from './env.js';

export type { EnvValidationResult } from './env.js';
