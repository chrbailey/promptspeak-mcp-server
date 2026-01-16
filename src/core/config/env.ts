/**
 * ===============================================================================
 * ENVIRONMENT VARIABLE UTILITIES
 * ===============================================================================
 *
 * Type-safe utilities for reading environment variables with validation.
 * Extracted from http/config.ts for reuse across the codebase.
 *
 * Usage:
 *   import { getEnv, getEnvNumber, getEnvBoolean } from '../core/config/env.js';
 *
 *   const port = getEnvNumber('PORT', 3000);
 *   const debug = getEnvBoolean('DEBUG', false);
 *   const apiKey = getEnv('API_KEY');  // throws if missing
 *
 * ===============================================================================
 */

// -----------------------------------------------------------------------------
// BASIC ACCESSORS
// -----------------------------------------------------------------------------

/**
 * Get a required environment variable.
 * Throws if the variable is not set and no default is provided.
 *
 * @param key - Environment variable name
 * @param defaultValue - Optional default value
 * @returns The environment variable value
 * @throws Error if variable is missing and no default provided
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default value.
 * Never throws - always returns a value.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns The environment variable value or default
 */
export function getEnvOptional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

/**
 * Get an optional environment variable, returning undefined if not set.
 *
 * @param key - Environment variable name
 * @returns The environment variable value or undefined
 */
export function getEnvOrUndefined(key: string): string | undefined {
  const value = process.env[key];
  return value === '' ? undefined : value;
}

// -----------------------------------------------------------------------------
// TYPED ACCESSORS
// -----------------------------------------------------------------------------

/**
 * Get an environment variable as a number.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed number value
 * @throws Error if value is not a valid number
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: "${value}"`);
  }
  return parsed;
}

/**
 * Get an environment variable as a float.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed float value
 * @throws Error if value is not a valid number
 */
export function getEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid float for environment variable ${key}: "${value}"`);
  }
  return parsed;
}

/**
 * Get an environment variable as a boolean.
 * Accepts: 'true', '1', 'yes', 'on' (case-insensitive) as truthy.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Boolean value
 */
export function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const lower = value.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
}

/**
 * Get an environment variable as a comma-separated list.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default array if not set
 * @param separator - Separator character (default: ',')
 * @returns Array of trimmed strings
 */
export function getEnvList(
  key: string,
  defaultValue: string[] = [],
  separator: string = ','
): string[] {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.split(separator).map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Get an environment variable as a JSON object.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed JSON object
 * @throws Error if value is not valid JSON
 */
export function getEnvJson<T>(key: string, defaultValue: T): T {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  try {
    return JSON.parse(value) as T;
  } catch (err) {
    throw new Error(`Invalid JSON for environment variable ${key}: ${(err as Error).message}`);
  }
}

/**
 * Get an environment variable constrained to specific values (enum-like).
 *
 * @param key - Environment variable name
 * @param allowedValues - Array of allowed values
 * @param defaultValue - Default value if not set
 * @returns The environment variable value
 * @throws Error if value is not in allowed values
 */
export function getEnvEnum<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  const value = process.env[key] as T | undefined;
  if (value === undefined || value === '') {
    return defaultValue;
  }
  if (!allowedValues.includes(value)) {
    throw new Error(
      `Invalid value for environment variable ${key}: "${value}". ` +
      `Allowed values: ${allowedValues.join(', ')}`
    );
  }
  return value;
}

// -----------------------------------------------------------------------------
// VALIDATION UTILITIES
// -----------------------------------------------------------------------------

/**
 * Result of environment validation.
 */
export interface EnvValidationResult {
  /** Whether all required variables are present */
  valid: boolean;
  /** List of missing required variables */
  missing: string[];
  /** List of invalid variables (wrong format) */
  invalid: Array<{ key: string; reason: string }>;
}

/**
 * Validate that required environment variables are set.
 *
 * @param required - Array of required variable names
 * @returns Validation result
 */
export function validateRequiredEnv(required: string[]): EnvValidationResult {
  const missing: string[] = [];
  for (const key of required) {
    const value = process.env[key];
    if (value === undefined || value === '') {
      missing.push(key);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
    invalid: [],
  };
}

/**
 * Check if an environment variable is set (non-empty).
 *
 * @param key - Environment variable name
 * @returns true if the variable is set and non-empty
 */
export function hasEnv(key: string): boolean {
  const value = process.env[key];
  return value !== undefined && value !== '';
}

/**
 * Get the current Node environment.
 *
 * @param defaultEnv - Default environment if NODE_ENV is not set
 * @returns Current environment name
 */
export function getNodeEnv(
  defaultEnv: 'development' | 'production' | 'test' = 'development'
): 'development' | 'production' | 'test' {
  return getEnvEnum('NODE_ENV', ['development', 'production', 'test'] as const, defaultEnv);
}

/**
 * Check if running in production mode.
 */
export function isProduction(): boolean {
  return getNodeEnv() === 'production';
}

/**
 * Check if running in development mode.
 */
export function isDevelopment(): boolean {
  return getNodeEnv() === 'development';
}

/**
 * Check if running in test mode.
 */
export function isTest(): boolean {
  return getNodeEnv() === 'test';
}
