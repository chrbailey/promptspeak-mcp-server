// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - SECURITY ENFORCEMENT TOOLS
// ═══════════════════════════════════════════════════════════════════════════
// MCP tools for security scanning and enforcement:
// - ps_security_scan: Scan code for security vulnerabilities
// - ps_security_gate: Scan and enforce — block critical, hold high, warn medium
// - ps_security_config: Configure security patterns
// ═══════════════════════════════════════════════════════════════════════════

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { SecurityScanResult, SecuritySeverity, SecurityPattern } from '../types/index.js';
import { SecurityScanner } from '../security/scanner.js';
import { DEFAULT_PATTERNS, getPatternById } from '../security/patterns.js';

// ─────────────────────────────────────────────────────────────────────────────
// SCANNER INSTANCE (mutable pattern state for config tool)
// ─────────────────────────────────────────────────────────────────────────────

/** Runtime pattern state — cloned from defaults so config changes don't mutate originals */
let runtimePatterns: SecurityPattern[] = DEFAULT_PATTERNS.map(p => ({ ...p }));

function getScanner(): SecurityScanner {
  return new SecurityScanner(runtimePatterns);
}

/** Reset patterns to defaults (for testing) */
export function resetSecurityPatterns(): void {
  runtimePatterns = DEFAULT_PATTERNS.map(p => ({ ...p }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const securityToolDefinitions: Tool[] = [
  {
    name: 'ps_security_scan',
    description: 'Scan code content for security vulnerabilities. Returns findings classified by severity (critical, high, medium, low, info).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Code content to scan',
        },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Only run these specific pattern IDs',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'ps_security_gate',
    description: 'Scan code and enforce security policy. Blocks on critical findings, holds high-severity for review, warns on medium, logs low/info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Code content to scan',
        },
        action: {
          type: 'string',
          description: 'The action being gated (e.g., "write_file", "edit_file")',
        },
      },
      required: ['content', 'action'],
    },
  },
  {
    name: 'ps_security_config',
    description: 'Configure security detection patterns. List, enable, disable, or change severity of patterns.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'enable', 'disable', 'set_severity'],
          description: 'Configuration action to perform',
        },
        patternId: {
          type: 'string',
          description: 'Pattern ID to modify (required for enable, disable, set_severity)',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low', 'info'],
          description: 'New severity level (required for set_severity)',
        },
      },
      required: ['action'],
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export interface SecurityScanRequest {
  content: string;
  patterns?: string[];
}

export async function handleSecurityScan(args: SecurityScanRequest): Promise<SecurityScanResult> {
  const scanner = getScanner();
  return scanner.scan(args.content, {
    onlyPatterns: args.patterns,
  });
}

export type GateDecision = 'blocked' | 'held' | 'warned' | 'allowed';

export interface SecurityGateResult {
  decision: GateDecision;
  reason: string;
  scan: SecurityScanResult;
}

export async function handleSecurityGate(args: {
  content: string;
  action: string;
}): Promise<SecurityGateResult> {
  const scanner = getScanner();
  const scan = scanner.scan(args.content);

  if (scan.enforcement.blocked.length > 0) {
    const patternIds = scan.enforcement.blocked.map(f => f.patternId).join(', ');
    return {
      decision: 'blocked',
      reason: `Security: ${scan.enforcement.blocked.length} critical finding(s) — ${patternIds}`,
      scan,
    };
  }

  if (scan.enforcement.held.length > 0) {
    const patternIds = scan.enforcement.held.map(f => f.patternId).join(', ');
    return {
      decision: 'held',
      reason: `Security: ${scan.enforcement.held.length} high-severity finding(s) held for review — ${patternIds}`,
      scan,
    };
  }

  if (scan.enforcement.warned.length > 0) {
    const patternIds = scan.enforcement.warned.map(f => f.patternId).join(', ');
    return {
      decision: 'warned',
      reason: `Security: ${scan.enforcement.warned.length} medium-severity warning(s) — ${patternIds}`,
      scan,
    };
  }

  return {
    decision: 'allowed',
    reason: 'No security findings',
    scan,
  };
}

export interface SecurityConfigResult {
  success: boolean;
  patterns?: Array<{ id: string; name: string; severity: SecuritySeverity; enabled: boolean; category: string }>;
  error?: string;
}

export async function handleSecurityConfig(args: {
  action: 'list' | 'enable' | 'disable' | 'set_severity';
  patternId?: string;
  severity?: SecuritySeverity;
}): Promise<SecurityConfigResult> {
  if (args.action === 'list') {
    return {
      success: true,
      patterns: runtimePatterns.map(p => ({
        id: p.id,
        name: p.name,
        severity: p.severity,
        enabled: p.enabled,
        category: p.category,
      })),
    };
  }

  if (!args.patternId) {
    return { success: false, error: 'patternId is required for this action' };
  }

  const pattern = runtimePatterns.find(p => p.id === args.patternId);
  if (!pattern) {
    return { success: false, error: `Unknown pattern: ${args.patternId}` };
  }

  switch (args.action) {
    case 'enable':
      pattern.enabled = true;
      return { success: true };

    case 'disable':
      pattern.enabled = false;
      return { success: true };

    case 'set_severity':
      if (!args.severity) {
        return { success: false, error: 'severity is required for set_severity action' };
      }
      pattern.severity = args.severity;
      return { success: true };

    default:
      return { success: false, error: `Unknown action: ${args.action}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER (dispatcher)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSecurityTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'ps_security_scan':
      return handleSecurityScan(args as unknown as Parameters<typeof handleSecurityScan>[0]);
    case 'ps_security_gate':
      return handleSecurityGate(args as Parameters<typeof handleSecurityGate>[0]);
    case 'ps_security_config':
      return handleSecurityConfig(args as Parameters<typeof handleSecurityConfig>[0]);
    default:
      throw new Error(`Unknown security tool: ${name}`);
  }
}
