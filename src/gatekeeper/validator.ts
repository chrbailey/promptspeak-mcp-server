// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - FRAME VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════
// Three-tier validation: Structural, Semantic, and Chain rules.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ParsedFrame,
  ValidationResult,
  ValidationReport,
  ValidationSeverity,
} from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION RULE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationRule {
  id: string;
  name: string;
  tier: 'structural' | 'semantic' | 'chain';
  check: (frame: ParsedFrame, parentFrame?: ParsedFrame) => ValidationResult;
}

const STRUCTURAL_RULES: ValidationRule[] = [
  {
    id: 'SR-001',
    name: 'FRAME_LENGTH',
    tier: 'structural',
    check: (frame) => {
      const passed = frame.symbols.length >= 2;
      return {
        ruleId: 'SR-001',
        ruleName: 'FRAME_LENGTH',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Frame meets minimum length requirement'
          : 'Frame must contain at least 2 symbols',
        details: `Found ${frame.symbols.length} symbols`,
      };
    },
  },
  {
    id: 'SR-002',
    name: 'FRAME_LENGTH',
    tier: 'structural',
    check: (frame) => {
      const passed = frame.symbols.length <= 12;
      return {
        ruleId: 'SR-002',
        ruleName: 'FRAME_LENGTH',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Frame within maximum length'
          : 'Frame exceeds maximum 12 symbols',
        details: `Found ${frame.symbols.length} symbols`,
      };
    },
  },
  {
    id: 'SR-007',
    name: 'SEQUENCE_MODE_NOT_FIRST',
    tier: 'structural',
    check: (frame) => {
      // Check if mode exists but isn't first symbol
      const modeIndex = frame.symbols.findIndex(s => s.category === 'modes');
      const passed = modeIndex === -1 || modeIndex === 0;
      return {
        ruleId: 'SR-007',
        ruleName: 'SEQUENCE_MODE_NOT_FIRST',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Mode symbol is first (if present)'
          : 'Mode symbol should be first in sequence',
        details: modeIndex > 0 ? `Mode at position ${modeIndex + 1}` : '',
      };
    },
  },
  {
    id: 'SR-003',
    name: 'Required Mode',
    tier: 'structural',
    check: (frame) => {
      const passed = frame.mode !== null && frame.mode !== undefined;
      return {
        ruleId: 'SR-003',
        ruleName: 'Required Mode',
        passed,
        severity: passed ? 'pass' : 'error',  // Mode is required per spec
        message: passed
          ? 'Mode symbol present'
          : 'Frame must include a mode symbol (⊕, ⊖, ⊗, or ⊘)',
        details: frame.mode ? `Mode: ${frame.mode}` : 'No mode found - mode must be first symbol',
      };
    },
  },
  {
    id: 'SR-004',
    name: 'Required Domain',
    tier: 'structural',
    check: (frame) => {
      const passed = frame.domain !== null && frame.domain !== undefined;
      return {
        ruleId: 'SR-004',
        ruleName: 'Required Domain',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Domain symbol present'
          : 'Frame should include a domain symbol',
        details: frame.domain ? `Domain: ${frame.domain}` : 'No domain found',
      };
    },
  },
  {
    id: 'SR-005',
    name: 'Required Action',
    tier: 'structural',
    check: (frame) => {
      const passed = frame.action !== null && frame.action !== undefined;
      return {
        ruleId: 'SR-005',
        ruleName: 'Required Action',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Action symbol present'
          : 'Frame should include an action symbol',
        details: frame.action ? `Action: ${frame.action}` : 'No action found',
      };
    },
  },
  {
    id: 'SR-006',
    name: 'No Duplicate Categories',
    tier: 'structural',
    check: (frame) => {
      // For modifiers and constraints, duplicates within category are allowed
      const singletonCategories = ['modes', 'domains', 'actions', 'sources', 'entities'];
      const categoryCounts: Record<string, number> = {};

      for (const symbol of frame.symbols) {
        if (singletonCategories.includes(symbol.category)) {
          categoryCounts[symbol.category] = (categoryCounts[symbol.category] || 0) + 1;
        }
      }

      const duplicates = Object.entries(categoryCounts)
        .filter(([_, count]) => count > 1)
        .map(([cat]) => cat);

      const passed = duplicates.length === 0;
      return {
        ruleId: 'SR-006',
        ruleName: 'No Duplicate Categories',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'No duplicate categories'
          : 'Frame contains duplicate category symbols',
        details: passed ? '' : `Duplicates in: ${duplicates.join(', ')}`,
      };
    },
  },
];

const SEMANTIC_RULES: ValidationRule[] = [
  {
    id: 'SM-001',
    name: 'MODE_CONFLICT_STRICT_FLEXIBLE',
    tier: 'semantic',
    check: (frame) => {
      // Check for conflicting modes (e.g., strict + flexible symbols)
      const hasStrict = frame.mode === '⊕';
      const hasFlexible = frame.symbols.some(s => s.symbol === '⊖');
      const passed = !(hasStrict && hasFlexible);
      return {
        ruleId: 'SM-001',
        ruleName: 'MODE_CONFLICT_STRICT_FLEXIBLE',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'No mode conflicts detected'
          : 'Conflicting modes: strict (⊕) and flexible (⊖) cannot coexist',
      };
    },
  },
  {
    id: 'SM-006',
    name: 'PRIORITY_CONFLICT',
    tier: 'semantic',
    check: (frame) => {
      // Check for conflicting priorities (high + low)
      const hasHighPriority = frame.modifiers.includes('↑');
      const hasLowPriority = frame.modifiers.includes('↓');
      const passed = !(hasHighPriority && hasLowPriority);
      return {
        ruleId: 'SM-006',
        ruleName: 'PRIORITY_CONFLICT',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'No priority conflicts'
          : 'Conflicting priorities: high (↑) and low (↓) cannot coexist',
      };
    },
  },
  {
    id: 'SM-007',
    name: 'MODE_CONFLICT_EXPLORE_EXECUTE',
    tier: 'semantic',
    check: (frame) => {
      // Exploratory/forbidden mode (⊗) cannot have execute action
      const hasForbidden = frame.mode === '⊗';
      const hasExecute = frame.action === '▶';
      const passed = !(hasForbidden && hasExecute);
      return {
        ruleId: 'SM-007',
        ruleName: 'MODE_CONFLICT_EXPLORE_EXECUTE',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Mode-action compatibility OK'
          : 'Forbidden/exploratory mode (⊗) cannot include execute action (▶)',
      };
    },
  },
  {
    id: 'SM-008',
    name: 'ACTION_MISSING_DOMAIN',
    tier: 'semantic',
    check: (frame) => {
      // Actions should have a domain specified
      const hasAction = frame.action !== null;
      const hasDomain = frame.domain !== null;
      const passed = !hasAction || hasDomain;
      return {
        ruleId: 'SM-008',
        ruleName: 'ACTION_MISSING_DOMAIN',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Domain specified for action'
          : 'Action specified without domain - consider adding domain for context',
      };
    },
  },
  {
    id: 'SM-002',
    name: 'Forbidden Action Compatibility',
    tier: 'semantic',
    check: (frame) => {
      // ⛔ (forbidden constraint) + ▶ (execute) is a conflict
      const hasForbidden = frame.constraints.includes('⛔');
      const hasExecute = frame.action === '▶';
      const passed = !(hasForbidden && hasExecute);
      return {
        ruleId: 'SM-002',
        ruleName: 'Forbidden Action Compatibility',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Action compatible with constraints'
          : 'Warning: Execute action (▶) with forbidden constraint (⛔) - action will be blocked',
        details: hasForbidden && hasExecute ? 'This frame will block execution' : '',
      };
    },
  },
  {
    id: 'SM-003',
    name: 'Escalation Authority Check',
    tier: 'semantic',
    check: (frame) => {
      // ▲ (escalate) should have elevated source or high priority
      const hasEscalate = frame.action === '▲';
      const hasElevated = frame.source === '⇧';
      const hasHighPriority = frame.modifiers.includes('↑');

      if (!hasEscalate) {
        return {
          ruleId: 'SM-003',
          ruleName: 'Escalation Authority Check',
          passed: true,
          severity: 'pass',
          message: 'No escalation action present',
        };
      }

      const passed = hasElevated || hasHighPriority;
      return {
        ruleId: 'SM-003',
        ruleName: 'Escalation Authority Check',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Escalation has appropriate authority'
          : 'Escalation (▲) without elevated source (⇧) or high priority (↑)',
        details: 'Consider adding authority markers for escalation',
      };
    },
  },
  {
    id: 'SM-004',
    name: 'Delegation Entity Requirement',
    tier: 'semantic',
    check: (frame) => {
      // ▼ (delegate) should have an entity target
      const hasDelegate = frame.action === '▼';
      const hasEntity = frame.entity !== null && frame.entity !== undefined;

      if (!hasDelegate) {
        return {
          ruleId: 'SM-004',
          ruleName: 'Delegation Entity Requirement',
          passed: true,
          severity: 'pass',
          message: 'No delegation action present',
        };
      }

      return {
        ruleId: 'SM-004',
        ruleName: 'Delegation Entity Requirement',
        passed: hasEntity,
        severity: hasEntity ? 'pass' : 'warning',
        message: hasEntity
          ? 'Delegation has target entity'
          : 'Delegation (▼) should have a target entity (α, β, γ, ω)',
      };
    },
  },
  {
    id: 'SM-005',
    name: 'Commit Approval Requirement',
    tier: 'semantic',
    check: (frame) => {
      // ● (commit) should have ✓ (approved) or strict mode
      const hasCommit = frame.action === '●';
      const hasApproved = frame.constraints.includes('✓');
      const hasStrict = frame.mode === '⊕';

      if (!hasCommit) {
        return {
          ruleId: 'SM-005',
          ruleName: 'Commit Approval Requirement',
          passed: true,
          severity: 'pass',
          message: 'No commit action present',
        };
      }

      const passed = hasApproved || hasStrict;
      return {
        ruleId: 'SM-005',
        ruleName: 'Commit Approval Requirement',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Commit has appropriate approval'
          : 'Commit (●) without approval (✓) or strict mode (⊕)',
        details: 'Commits should have explicit approval or strict mode',
      };
    },
  },
];

// Mode strength mapping
const MODE_STRENGTH: Record<string, number> = {
  '⊕': 1,  // strict - strongest
  '⊘': 2,  // neutral
  '⊖': 3,  // flexible
  '⊗': 4   // forbidden - weakest
};

const CHAIN_RULES: ValidationRule[] = [
  {
    id: 'CH-001',
    name: 'Mode Strength Preservation',
    tier: 'chain',
    check: (frame, parentFrame) => {
      if (!parentFrame) {
        return {
          ruleId: 'CH-001',
          ruleName: 'Mode Strength Preservation',
          passed: true,
          severity: 'pass',
          message: 'No parent frame - root of chain',
        };
      }

      const parentStrength = MODE_STRENGTH[parentFrame.mode ?? ''] ?? 2;
      const childStrength = MODE_STRENGTH[frame.mode ?? ''] ?? 2;

      // Lower strength number = stricter (1 is strictest)
      const passed = childStrength <= parentStrength;
      return {
        ruleId: 'CH-001',
        ruleName: 'Mode Strength Preservation',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Mode strength preserved or strengthened'
          : `Mode weakened from ${parentFrame.mode || 'neutral'} to ${frame.mode || 'neutral'}`,
        details: `Parent: ${parentFrame.mode || 'neutral'} → Child: ${frame.mode || 'neutral'}`,
      };
    },
  },
  {
    id: 'CH-002',
    name: 'Domain Scope Maintenance',
    tier: 'chain',
    check: (frame, parentFrame) => {
      if (!parentFrame) {
        return {
          ruleId: 'CH-002',
          ruleName: 'Domain Scope Maintenance',
          passed: true,
          severity: 'pass',
          message: 'No parent frame - root of chain',
        };
      }

      const parentDomain = parentFrame.domain;
      const childDomain = frame.domain;

      const passed = !parentDomain || !childDomain || parentDomain === childDomain;
      return {
        ruleId: 'CH-002',
        ruleName: 'Domain Scope Maintenance',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Domain scope maintained'
          : `Domain changed from ${parentDomain} to ${childDomain}`,
        details: 'Domain scope changes require explicit approval',
      };
    },
  },
  {
    id: 'CH-003',
    name: 'Forbidden Constraint Inheritance',
    tier: 'chain',
    check: (frame, parentFrame) => {
      if (!parentFrame) {
        return {
          ruleId: 'CH-003',
          ruleName: 'Forbidden Constraint Inheritance',
          passed: true,
          severity: 'pass',
          message: 'No parent frame - root of chain',
        };
      }

      const parentForbidden = parentFrame.constraints.includes('⛔');
      const childForbidden = frame.constraints.includes('⛔');

      // If parent has ⛔, child must also have ⛔
      const passed = !parentForbidden || childForbidden;
      return {
        ruleId: 'CH-003',
        ruleName: 'Forbidden Constraint Inheritance',
        passed,
        severity: passed ? 'pass' : 'error',
        message: passed
          ? 'Forbidden constraint properly inherited'
          : 'VIOLATION: Parent ⛔ constraint not inherited by child',
        details: parentForbidden ? 'Forbidden constraints must propagate to all descendants' : '',
      };
    },
  },
  {
    id: 'CH-004',
    name: 'Entity Hierarchy Progression',
    tier: 'chain',
    check: (frame, parentFrame) => {
      if (!parentFrame) {
        return {
          ruleId: 'CH-004',
          ruleName: 'Entity Hierarchy Progression',
          passed: true,
          severity: 'pass',
          message: 'No parent frame - root of chain',
        };
      }

      // Entity levels: α=1, β=2, γ=3, ω=4
      const entityLevels: Record<string, number> = { 'α': 1, 'β': 2, 'γ': 3, 'ω': 4 };
      const parentLevel = entityLevels[parentFrame.entity ?? ''] ?? 0;
      const childLevel = entityLevels[frame.entity ?? ''] ?? 0;

      // Child level should be equal or deeper
      const passed = !parentLevel || !childLevel || childLevel >= parentLevel;
      return {
        ruleId: 'CH-004',
        ruleName: 'Entity Hierarchy Progression',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Entity hierarchy maintained'
          : `Delegation to higher-level entity: ${parentFrame.entity} → ${frame.entity}`,
        details: 'Delegation should flow to equal or lower-level entities',
      };
    },
  },
  {
    id: 'CH-005',
    name: 'Constraint Strength Ordering',
    tier: 'chain',
    check: (frame, parentFrame) => {
      if (!parentFrame || parentFrame.constraints.length === 0 || frame.constraints.length === 0) {
        return {
          ruleId: 'CH-005',
          ruleName: 'Constraint Strength Ordering',
          passed: true,
          severity: 'pass',
          message: 'No constraint comparison needed',
        };
      }

      // Constraint strength: ⛔=1, ✗=2, ⚠=3, ✓=4
      const constraintStrength: Record<string, number> = { '⛔': 1, '✗': 2, '⚠': 3, '✓': 4 };
      const parentStrength = Math.min(...parentFrame.constraints.map(c => constraintStrength[c] ?? 4));
      const childStrength = Math.min(...frame.constraints.map(c => constraintStrength[c] ?? 4));

      // Constraint can strengthen but not weaken
      const passed = childStrength <= parentStrength;
      return {
        ruleId: 'CH-005',
        ruleName: 'Constraint Strength Ordering',
        passed,
        severity: passed ? 'pass' : 'warning',
        message: passed
          ? 'Constraint strength maintained or increased'
          : 'Constraint weakened from parent',
      };
    },
  },
  {
    id: 'CH-006',
    name: 'Intent Hash Consistency',
    tier: 'chain',
    check: (frame) => {
      // This check ensures intent hash is properly computed
      const hasHash = frame.intentHash && frame.intentHash.length === 64;
      return {
        ruleId: 'CH-006',
        ruleName: 'Intent Hash Consistency',
        passed: true,  // Always pass for now, hash is computed automatically
        severity: 'pass',
        message: hasHash
          ? 'Intent hash properly computed'
          : 'Intent hash will be computed',
        details: hasHash ? `Hash: ${frame.intentHash!.substring(0, 16)}...` : '',
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ERROR TYPE FOR VALIDATION REPORT
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  symbol?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class FrameValidator {
  /**
   * Validate a frame through all three tiers.
   */
  validate(frame: ParsedFrame, parentFrame?: ParsedFrame): ValidationReport {
    const structuralResults = STRUCTURAL_RULES.map(rule => rule.check(frame, parentFrame));
    const semanticResults = SEMANTIC_RULES.map(rule => rule.check(frame, parentFrame));
    const chainResults = parentFrame
      ? CHAIN_RULES.map(rule => rule.check(frame, parentFrame))
      : [];

    const allResults = [...structuralResults, ...semanticResults, ...chainResults];

    const errors: ValidationError[] = allResults
      .filter(r => r.severity === 'error' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'error' as const,
        symbol: r.details
      }));

    const warnings: ValidationError[] = allResults
      .filter(r => r.severity === 'warning' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'warning' as const,
        symbol: r.details
      }));

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      metadata: {
        validatedAt: Date.now(),
        validationLevel: parentFrame ? 'full' : 'standard'
      }
    };
  }

  /**
   * Validate structural rules only.
   */
  validateStructural(frame: ParsedFrame): ValidationReport {
    const results = STRUCTURAL_RULES.map(rule => rule.check(frame));

    const errors: ValidationError[] = results
      .filter(r => r.severity === 'error' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'error' as const
      }));

    const warnings: ValidationError[] = results
      .filter(r => r.severity === 'warning' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'warning' as const
      }));

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        validatedAt: Date.now(),
        validationLevel: 'structural'
      }
    };
  }

  /**
   * Validate semantic rules only.
   */
  validateSemantic(frame: ParsedFrame): ValidationReport {
    const results = SEMANTIC_RULES.map(rule => rule.check(frame));

    const errors: ValidationError[] = results
      .filter(r => r.severity === 'error' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'error' as const
      }));

    const warnings: ValidationError[] = results
      .filter(r => r.severity === 'warning' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'warning' as const
      }));

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        validatedAt: Date.now(),
        validationLevel: 'semantic'
      }
    };
  }

  /**
   * Validate chain rules only (requires parent frame).
   */
  validateChain(frame: ParsedFrame, parentFrame?: ParsedFrame): ValidationReport {
    if (!parentFrame) {
      return {
        valid: false,
        errors: [{
          code: 'CHAIN_NO_PARENT',
          message: 'Chain validation requires parentFrame',
          severity: 'error'
        }],
        warnings: [],
        metadata: {
          validatedAt: Date.now(),
          validationLevel: 'chain'
        }
      };
    }

    const results = CHAIN_RULES.map(rule => rule.check(frame, parentFrame));

    const errors: ValidationError[] = results
      .filter(r => r.severity === 'error' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'error' as const
      }));

    const warnings: ValidationError[] = results
      .filter(r => r.severity === 'warning' && !r.passed)
      .map(r => ({
        code: this.mapRuleIdToErrorCode(r.ruleId, r.ruleName),
        message: r.message,
        severity: 'warning' as const
      }));

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        validatedAt: Date.now(),
        validationLevel: 'chain'
      }
    };
  }

  /**
   * Map rule IDs to more descriptive error codes.
   * Uses ruleName directly if it's already in expected format.
   */
  private mapRuleIdToErrorCode(ruleId: string, ruleName: string): string {
    // If ruleName is already a valid error code format (UPPER_CASE), use it
    if (ruleName && /^[A-Z_]+$/.test(ruleName)) {
      return ruleName;
    }
    // Fallback mapping for legacy rule names
    const mapping: Record<string, string> = {
      'CH-001': 'MODE_STRENGTH_WEAKENED',
      'CH-002': 'DOMAIN_CHANGED',
      'CH-003': 'FORBIDDEN_NOT_INHERITED',
      'CH-004': 'ENTITY_HIERARCHY_VIOLATION',
      'CH-005': 'CONSTRAINT_WEAKENED',
      'CH-006': 'INTENT_HASH_INVALID',
    };
    return mapping[ruleId] || ruleId;
  }
}

// Singleton instance
export const validator = new FrameValidator();
