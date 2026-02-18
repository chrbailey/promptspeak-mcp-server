// ═══════════════════════════════════════════════════════════════════════════
// SECURITY SCANNER ENGINE
// Scans code content for security vulnerabilities using detection patterns
// ═══════════════════════════════════════════════════════════════════════════

import type { SecurityPattern, SecurityFinding, SecurityScanResult } from '../types/index.js';
import { DEFAULT_PATTERNS } from './patterns.js';

export interface ScanOptions {
  /** Pattern IDs to skip during this scan */
  disabledPatterns?: string[];
  /** Only run these pattern IDs (overrides disabledPatterns) */
  onlyPatterns?: string[];
}

const SUGGESTIONS: Record<string, string> = {
  'sql-injection': 'Use parameterized queries or prepared statements instead of template literals',
  'hardcoded-secret': 'Move secrets to environment variables or a secrets manager',
  'security-todo': 'Resolve security-related TODOs before deploying',
  'console-log-sensitive': 'Remove or redact sensitive data from log statements',
  'insecure-defaults': 'Configure CORS origins explicitly, bind to 127.0.0.1, disable debug in production',
  'suppressed-errors': 'Add error handling logic or at minimum log the error',
  'unverified-comments': 'Replace hedging language with definitive statements or remove the comment',
  'disabled-tests': 'Re-enable skipped tests or remove them if no longer needed',
  'destructive-db': 'Verify destructive database operations are intentional and have backups',
  'filesystem-destructive': 'Verify destructive filesystem operations are intentional and scoped correctly',
};

export class SecurityScanner {
  private patterns: SecurityPattern[];

  constructor(patterns?: SecurityPattern[]) {
    this.patterns = patterns ?? DEFAULT_PATTERNS;
  }

  scan(content: string, options?: ScanOptions): SecurityScanResult {
    const findings: SecurityFinding[] = [];
    const lines = content.split('\n');

    const activePatterns = this.getActivePatterns(options);

    for (const pattern of activePatterns) {
      const regex = new RegExp(pattern.pattern, 'gim');

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(regex);
        if (match) {
          findings.push({
            patternId: pattern.id,
            severity: pattern.severity,
            match: match[0],
            line: i + 1,
            context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
            suggestion: SUGGESTIONS[pattern.id],
          });
        }
      }
    }

    return {
      findings,
      scannedAt: new Date().toISOString(),
      contentLength: content.length,
      patternsChecked: activePatterns.length,
      enforcement: classifyFindings(findings),
    };
  }

  private getActivePatterns(options?: ScanOptions): SecurityPattern[] {
    let patterns = this.patterns.filter(p => p.enabled);

    if (options?.onlyPatterns) {
      const only = new Set(options.onlyPatterns);
      patterns = patterns.filter(p => only.has(p.id));
    } else if (options?.disabledPatterns) {
      const disabled = new Set(options.disabledPatterns);
      patterns = patterns.filter(p => !disabled.has(p.id));
    }

    return patterns;
  }
}

function classifyFindings(findings: SecurityFinding[]) {
  return {
    blocked: findings.filter(f => f.severity === 'critical'),
    held: findings.filter(f => f.severity === 'high'),
    warned: findings.filter(f => f.severity === 'medium'),
    logged: findings.filter(f => f.severity === 'low' || f.severity === 'info'),
  };
}
