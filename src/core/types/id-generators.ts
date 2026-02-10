/**
 * ===============================================================================
 * CENTRALIZED ID GENERATORS
 * ===============================================================================
 *
 * Unified ID generation utilities to reduce duplication across modules.
 * All IDs use a consistent format: prefix_timestamp_random
 *
 * Usage:
 *   import { generateId, createIdGenerator } from '../core/types/id-generators.js';
 *
 *   const id = generateId('swarm');  // 'swarm_1234567890_abc123'
 *   const generateAgentId = createIdGenerator('agent');
 *
 * ===============================================================================
 */

/**
 * Generate a random alphanumeric string of specified length.
 */
function randomAlphanumeric(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique ID with the given prefix.
 *
 * Format: {prefix}_{timestamp}_{random}
 *
 * @param prefix - ID prefix (e.g., 'swarm', 'agent', 'event')
 * @param randomLength - Length of random suffix (default: 6)
 * @returns Unique identifier string
 */
export function generateId(prefix: string, randomLength: number = 6): string {
  const timestamp = Date.now();
  const random = randomAlphanumeric(randomLength);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Create a reusable ID generator function for a specific prefix.
 *
 * @param prefix - ID prefix
 * @param randomLength - Length of random suffix (default: 6)
 * @returns ID generator function
 *
 * @example
 * ```typescript
 * const generateSwarmId = createIdGenerator('swarm');
 * const id1 = generateSwarmId();  // 'swarm_1234567890_abc123'
 * const id2 = generateSwarmId();  // 'swarm_1234567891_def456'
 * ```
 */
export function createIdGenerator(
  prefix: string,
  randomLength: number = 6
): () => string {
  return () => generateId(prefix, randomLength);
}

// -----------------------------------------------------------------------------
// PRE-BUILT GENERATORS
// -----------------------------------------------------------------------------
// These match existing patterns in the codebase for backwards compatibility

/** Generate a correlation ID for request tracing */
export const generateCorrelationId = createIdGenerator('corr', 8);

/** Generate a session ID */
export const generateSessionId = createIdGenerator('sess', 8);

// -----------------------------------------------------------------------------
// UUID-LIKE GENERATORS
// -----------------------------------------------------------------------------

/**
 * Generate a UUID v4-like identifier (not cryptographically secure).
 * Use for cases where UUID format is expected but crypto strength isn't required.
 */
export function generateUuidLike(): string {
  const hex = () => randomAlphanumeric(4).replace(/[a-z]/g, (c) =>
    Math.random() > 0.5 ? c : (parseInt(c, 36) % 16).toString(16)
  );
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
}
