/**
 * Immutable Safety Constraints Tests
 *
 * Verifies the safety floor that no config can override:
 * - Forbidden mode always blocks
 * - Sensitive data patterns always trigger hold
 * - D-S conflict above threshold requires review
 * - Circuit breaker floor cannot be bypassed
 * - Maximum uncertainty floor
 */

import { describe, it, expect } from 'vitest';
import {
  checkImmutableConstraints,
  containsSensitiveData,
} from '../../../src/governance/immutable.js';
import { GOVERNANCE_MODES } from '../../../src/governance/types.js';
import type { UncertaintyDecomposition, GovernanceMode } from '../../../src/governance/types.js';

function makeContext(overrides: Partial<Parameters<typeof checkImmutableConstraints>[0]> = {}) {
  return {
    mode: GOVERNANCE_MODES['standard'] as GovernanceMode,
    uncertainty: {
      total: 0.3,
      epistemic: 0.2,
      aleatoric: 0.1,
      epistemicRatio: 0.67,
      method: 'manual' as const,
    },
    ...overrides,
  };
}

describe('checkImmutableConstraints', () => {
  it('passes with normal inputs', () => {
    const result = checkImmutableConstraints(makeContext());
    expect(result.passed).toBe(true);
    expect(result.violatedConstraint).toBeNull();
  });

  it('blocks forbidden mode', () => {
    const result = checkImmutableConstraints(makeContext({
      mode: GOVERNANCE_MODES['forbidden'] as GovernanceMode,
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('forbidden_mode');
  });

  it('catches SSN pattern', () => {
    const result = checkImmutableConstraints(makeContext({
      contentToCheck: 'My SSN is 123-45-6789',
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('sensitive_data');
  });

  it('catches API key pattern', () => {
    const result = checkImmutableConstraints(makeContext({
      contentToCheck: 'Use key sk-1234567890abcdef',
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('sensitive_data');
  });

  it('catches private key pattern', () => {
    const result = checkImmutableConstraints(makeContext({
      contentToCheck: '-----BEGIN RSA PRIVATE KEY-----\nMIIEo...',
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('sensitive_data');
  });

  it('catches password pattern', () => {
    const result = checkImmutableConstraints(makeContext({
      contentToCheck: 'password: mysecret123',
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('sensitive_data');
  });

  it('triggers on D-S conflict above threshold', () => {
    const result = checkImmutableConstraints(makeContext({
      dsConflictCoefficient: 0.8,
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('ds_conflict');
  });

  it('passes D-S conflict below threshold', () => {
    const result = checkImmutableConstraints(makeContext({
      dsConflictCoefficient: 0.5,
    }));
    expect(result.passed).toBe(true);
  });

  it('triggers on circuit breaker floor', () => {
    const result = checkImmutableConstraints(makeContext({
      consecutiveFailures: 3,
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('circuit_breaker_floor');
  });

  it('triggers on max uncertainty', () => {
    const result = checkImmutableConstraints(makeContext({
      uncertainty: {
        total: 0.96,
        epistemic: 0.5,
        aleatoric: 0.46,
        epistemicRatio: 0.52,
        method: 'manual',
      },
    }));
    expect(result.passed).toBe(false);
    expect(result.violatedConstraint).toBe('max_uncertainty');
  });

  it('all results have critical severity', () => {
    const result = checkImmutableConstraints(makeContext({
      mode: GOVERNANCE_MODES['forbidden'] as GovernanceMode,
    }));
    expect(result.severity).toBe('critical');

    const passResult = checkImmutableConstraints(makeContext());
    expect(passResult.severity).toBe('critical');
  });
});

describe('containsSensitiveData', () => {
  it('returns true for SSN', () => {
    expect(containsSensitiveData('SSN: 123-45-6789')).toBe(true);
  });

  it('returns true for API keys', () => {
    expect(containsSensitiveData('sk-abc123def456')).toBe(true);
    expect(containsSensitiveData('pk_live_abc123')).toBe(true);
  });

  it('returns true for AWS access key IDs', () => {
    expect(containsSensitiveData('AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('returns true for GitHub tokens', () => {
    expect(containsSensitiveData('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij')).toBe(true);
  });

  it('returns true for Slack tokens', () => {
    expect(containsSensitiveData('xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx')).toBe(true);
  });

  it('returns true for credit card numbers', () => {
    expect(containsSensitiveData('card: 4111-1111-1111-1111')).toBe(true);
    expect(containsSensitiveData('card: 4111111111111111')).toBe(true);
    expect(containsSensitiveData('card: 5500 0000 0000 0004')).toBe(true);
  });

  it('returns true for JWT tokens', () => {
    expect(containsSensitiveData('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe(true);
  });

  it('returns true for private keys (EC, DSA, OPENSSH)', () => {
    expect(containsSensitiveData('-----BEGIN EC PRIVATE KEY-----')).toBe(true);
    expect(containsSensitiveData('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
  });

  it('returns true for secret= pattern', () => {
    expect(containsSensitiveData('secret=my_api_secret')).toBe(true);
  });

  it('returns false for normal text', () => {
    expect(containsSensitiveData('Hello, this is a normal message')).toBe(false);
  });
});
