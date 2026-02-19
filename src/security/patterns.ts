// ═══════════════════════════════════════════════════════════════════════════
// SECURITY DETECTION PATTERNS
// Validated against agent-security-skills data (2.8M lines scanned)
// ═══════════════════════════════════════════════════════════════════════════

import type { SecurityPattern } from '../types/index.js';

export const DEFAULT_PATTERNS: SecurityPattern[] = [
  // ─── CRITICAL (auto-block) ───────────────────────────────────────────────

  {
    id: 'sql-injection',
    name: 'SQL Injection via Template Literal',
    description: 'Detects template literals used in SQL query strings, indicating potential SQL injection',
    severity: 'critical',
    pattern: '(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\\s+.*\\$\\{',
    category: 'injection',
    enabled: true,
    falsePositiveRate: 0.25,
  },
  {
    id: 'hardcoded-secret',
    name: 'Hardcoded Secret',
    description: 'Detects API keys, passwords, and tokens hardcoded in source',
    severity: 'critical',
    pattern: '(?:api[_-]?key|api[_-]?secret|password|passwd|secret[_-]?key|access[_-]?token|auth[_-]?token)\\s*[:=]\\s*["\'][^"\']{8,}["\']',
    category: 'secrets',
    enabled: true,
    falsePositiveRate: 0.35,
  },

  // ─── HIGH (hold for review) ──────────────────────────────────────────────

  {
    id: 'security-todo',
    name: 'Security TODO/FIXME',
    description: 'Detects TODO/FIXME/HACK comments related to authentication, validation, or security',
    severity: 'high',
    pattern: '(?:TODO|FIXME|HACK|XXX)\\s*:?\\s*.*(?:auth|valid|secur|password|token|permission|credential)',
    category: 'authentication',
    enabled: true,
    falsePositiveRate: 0.40,
  },
  {
    id: 'console-log-sensitive',
    name: 'Logging Sensitive Data',
    description: 'Detects console.log/warn/error statements that may expose sensitive data',
    severity: 'high',
    pattern: 'console\\.(?:log|warn|error|debug|info)\\s*\\(.*(?:token|password|secret|key|credential|auth)',
    category: 'secrets',
    enabled: true,
    falsePositiveRate: 0.25,
  },
  {
    id: 'insecure-defaults',
    name: 'Insecure Default Configuration',
    description: 'Detects cors() with no config, 0.0.0.0 binding, debug: true in production contexts',
    severity: 'high',
    pattern: '(?:cors\\(\\s*\\)|0\\.0\\.0\\.0|debug\\s*:\\s*true)',
    category: 'configuration',
    enabled: true,
  },

  // ─── MEDIUM (warn) ───────────────────────────────────────────────────────

  {
    id: 'suppressed-errors',
    name: 'Suppressed Error Handling',
    description: 'Detects empty catch blocks that silently swallow errors',
    severity: 'medium',
    pattern: 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
    category: 'governance',
    enabled: true,
  },
  {
    id: 'unverified-comments',
    name: 'Hedging Language in Comments',
    description: 'Detects hedging language like "probably", "should work", "seems to" in comments',
    severity: 'medium',
    pattern: '(?:\\/\\/|\\*)\\s*.*(?:probably|should work|seems to|i think|might be|not sure|hopefully)',
    category: 'governance',
    enabled: true,
  },
  {
    id: 'disabled-tests',
    name: 'Disabled Test Cases',
    description: 'Detects skipped or disabled test cases',
    severity: 'medium',
    pattern: '(?:describe|it|test)\\.(?:skip|only)|(?:xit|xdescribe|xtest)\\s*\\(',
    category: 'governance',
    enabled: true,
    falsePositiveRate: 0.60,
  },

  // ─── LOW (log only) ─────────────────────────────────────────────────────

  {
    id: 'destructive-db',
    name: 'Destructive Database Operation',
    description: 'Detects DROP TABLE, TRUNCATE, DELETE FROM without WHERE',
    severity: 'low',
    pattern: '(?:DROP\\s+TABLE|TRUNCATE\\s+TABLE|DELETE\\s+FROM\\s+\\w+\\s*(?:;|$))',
    category: 'governance',
    enabled: true,
    falsePositiveRate: 0.70,
  },
  {
    id: 'filesystem-destructive',
    name: 'Destructive Filesystem Operation',
    description: 'Detects rm -rf and similar destructive filesystem commands in scripts',
    severity: 'low',
    pattern: 'rm\\s+-(?:rf|fr)\\s',
    category: 'governance',
    enabled: true,
  },
];

/**
 * Look up a pattern by its ID.
 */
export function getPatternById(id: string): SecurityPattern | undefined {
  return DEFAULT_PATTERNS.find(p => p.id === id);
}
