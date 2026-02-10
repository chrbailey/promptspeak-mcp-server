// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK IMMUTABLE SAFETY CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════════
// Hardwired constraints that NEVER relax, regardless of calibration quality,
// trust level, or governance mode.
//
// These form the absolute safety floor. The adaptive governance
// layer operates ABOVE this floor — it can tighten beyond these
// constraints but can never loosen below them.
//
// Ported from AETHER.
// ═══════════════════════════════════════════════════════════════════════════

import { IMMUTABLE_CONSTRAINTS } from './types.js';
import type {
  UncertaintyDecomposition,
  GovernanceMode,
  ImmutableCheckResult,
} from './types.js';

/** Patterns that indicate sensitive data — always trigger hold */
const SENSITIVE_PATTERNS = [
  // Identity
  /\b\d{3}-\d{2}-\d{4}\b/,              // SSN (xxx-xx-xxxx)
  /\b\d{9}\b/,                            // SSN without dashes
  // Credentials
  /\bpassword\s*[:=]\s*\S+/i,            // Password in text
  /\bsecret\s*[:=]\s*\S+/i,             // Secret in text
  // API keys — common provider patterns
  /\b(?:sk-|pk_|sk_live_|pk_live_)\w+/,  // Stripe-style keys
  /\bAKIA[0-9A-Z]{16}\b/,               // AWS access key IDs
  /\b(?:ghp_|gho_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/, // GitHub tokens
  /\bxox[bsrap]-[a-zA-Z0-9-]+/,         // Slack tokens
  // Cryptographic material
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, // Private keys (all types)
  // Payment data (Luhn-plausible card patterns)
  /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, // Credit card numbers
  // JWT tokens
  /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/, // JWT
] as const;

/**
 * Check all immutable constraints against the current context.
 * Returns immediately on first violation — these are non-negotiable.
 */
export function checkImmutableConstraints(context: {
  mode: GovernanceMode;
  uncertainty: UncertaintyDecomposition;
  dsConflictCoefficient?: number;
  consecutiveFailures?: number;
  contentToCheck?: string;
}): ImmutableCheckResult {
  // 1. Forbidden mode always blocks
  if (context.mode.name === 'forbidden') {
    return {
      passed: false,
      violatedConstraint: 'forbidden_mode',
      reason: 'Forbidden mode (⊗) active — immutable block',
      severity: 'critical',
    };
  }

  // 2. Sensitive data patterns always trigger hold
  if (context.contentToCheck) {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(context.contentToCheck)) {
        return {
          passed: false,
          violatedConstraint: 'sensitive_data',
          reason: 'Sensitive data pattern detected — immutable hold',
          severity: 'critical',
        };
      }
    }
  }

  // 3. D-S conflict coefficient above threshold requires review
  if (
    context.dsConflictCoefficient !== undefined &&
    context.dsConflictCoefficient > IMMUTABLE_CONSTRAINTS.dsConflictThreshold
  ) {
    return {
      passed: false,
      violatedConstraint: 'ds_conflict',
      reason: `Dempster-Shafer conflict coefficient ${context.dsConflictCoefficient.toFixed(3)} > ${IMMUTABLE_CONSTRAINTS.dsConflictThreshold} — mandatory human review`,
      severity: 'critical',
    };
  }

  // 4. Circuit breaker floor — even flexible mode can't go below this
  if (
    context.consecutiveFailures !== undefined &&
    context.consecutiveFailures >= IMMUTABLE_CONSTRAINTS.circuitBreakerFloor
  ) {
    return {
      passed: false,
      violatedConstraint: 'circuit_breaker_floor',
      reason: `${context.consecutiveFailures} consecutive failures ≥ circuit breaker floor ${IMMUTABLE_CONSTRAINTS.circuitBreakerFloor} — immutable block`,
      severity: 'critical',
    };
  }

  // 5. Maximum uncertainty for auto-pass
  if (context.uncertainty.total > IMMUTABLE_CONSTRAINTS.maxUncertaintyForAutoPass) {
    return {
      passed: false,
      violatedConstraint: 'max_uncertainty',
      reason: `Total uncertainty ${context.uncertainty.total.toFixed(3)} > ${IMMUTABLE_CONSTRAINTS.maxUncertaintyForAutoPass} — immutable hold`,
      severity: 'critical',
    };
  }

  return {
    passed: true,
    violatedConstraint: null,
    reason: 'All immutable constraints passed',
    severity: 'critical',
  };
}

/**
 * Check if content contains sensitive data patterns.
 */
export function containsSensitiveData(content: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(content));
}
