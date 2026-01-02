/**
 * ps_validate Tool
 *
 * Validates PromptSpeak frames through three-tier validation:
 * 1. Structural - syntax and symbol existence
 * 2. Semantic - mutual exclusions and required companions
 * 3. Chain - inheritance and constraint preservation
 */

import { DynamicResolver } from '../gatekeeper/resolver.js';
import { FrameValidator } from '../gatekeeper/validator.js';
import type { ValidationReport, ParsedFrame } from '../types/index.js';

const resolver = new DynamicResolver();
const validator = new FrameValidator();

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface ValidateRequest {
  frame: string;
  parentFrame?: string;
  validationLevel?: 'structural' | 'semantic' | 'chain' | 'full';
  strict?: boolean;
}

export interface ValidateResult {
  valid: boolean;
  frame: string;
  parsedFrame: ParsedFrame | null;
  parseConfidence: number;
  report: ValidationReport;
  summary: {
    errors: number;
    warnings: number;
    passed: number;
  };
  suggestions?: string[];
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export function ps_validate(request: ValidateRequest): ValidateResult {
  const { frame, parentFrame, validationLevel = 'full', strict = false } = request;

  // Step 1: Parse the frame
  const parsed = resolver.parseFrame(frame);

  if (!parsed) {
    return {
      valid: false,
      frame,
      parsedFrame: null,
      parseConfidence: 0,
      report: {
        valid: false,
        errors: [{
          code: 'PARSE_FAILED',
          message: 'Failed to parse frame - contains unknown symbols',
          severity: 'error',
          symbol: frame
        }],
        warnings: [],
        metadata: {
          validatedAt: Date.now(),
          validationLevel: 'structural'
        }
      },
      summary: { errors: 1, warnings: 0, passed: 0 },
      suggestions: generateSuggestions(frame)
    };
  }

  // Step 2: Resolve with current overlay
  const resolved = resolver.resolveFrame(parsed);

  // Step 3: Parse parent frame if provided
  let parsedParent: ParsedFrame | undefined;
  if (parentFrame) {
    parsedParent = resolver.parseFrame(parentFrame) ?? undefined;
  }

  // Step 4: Run validation at requested level
  let report: ValidationReport;

  switch (validationLevel) {
    case 'structural':
      report = validator.validateStructural(parsed);
      break;
    case 'semantic':
      report = validator.validateSemantic(parsed);
      break;
    case 'chain':
      if (!parsedParent) {
        report = {
          valid: false,
          errors: [{
            code: 'CHAIN_NO_PARENT',
            message: 'Chain validation requires parentFrame',
            severity: 'error'
          }],
          warnings: [],
          metadata: { validatedAt: Date.now(), validationLevel: 'chain' }
        };
      } else {
        report = validator.validateChain(parsed, parsedParent);
      }
      break;
    case 'full':
    default:
      report = validator.validate(parsed, parsedParent);
  }

  // Step 5: Calculate summary
  const summary = {
    errors: (report.errors ?? []).length,
    warnings: (report.warnings ?? []).length,
    passed: countPassedRules(report)
  };

  // Step 6: Determine validity
  // In strict mode, warnings also cause failure
  const valid = strict
    ? report.valid && (report.warnings ?? []).length === 0
    : report.valid;

  return {
    valid,
    frame,
    parsedFrame: parsed,
    parseConfidence: resolved.parseConfidence ?? 1.0,
    report,
    summary,
    suggestions: valid ? undefined : generateSuggestions(frame, report)
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function countPassedRules(report: ValidationReport): number {
  // Total rules checked minus errors and warnings
  const totalStructural = 6;  // SR-001 to SR-006
  const totalSemantic = 5;    // SM-001 to SM-005
  const totalChain = 6;       // CH-001 to CH-006

  const totalRules = totalStructural + totalSemantic + totalChain;
  return Math.max(0, totalRules - (report.errors ?? []).length - (report.warnings ?? []).length);
}

function generateSuggestions(frame: string, report?: ValidationReport): string[] {
  const suggestions: string[] = [];

  if (!report) {
    // Parse failed - suggest valid symbols
    suggestions.push('Check that all symbols exist in the ontology');
    suggestions.push('Valid modes: ⊕ (strict), ⊖ (flexible), ⊗ (forbidden), ⊘ (neutral)');
    suggestions.push('Valid domains: ◊ (financial), ◈ (legal), ◇ (technical), ◆ (medical), ◐ (general)');
    suggestions.push('Valid actions: ▶ (execute), ◀ (rollback), ▲ (escalate), ▼ (delegate), ● (commit), ○ (create)');
    return suggestions;
  }

  for (const error of (report.errors ?? [])) {
    switch (error.code) {
      case 'MODE_CONFLICT_STRICT_FLEXIBLE':
        suggestions.push('Remove either ⊕ (strict) or ⊖ (flexible) - cannot have both');
        break;
      case 'MODE_CONFLICT_STRICT_EXPLORATORY':
        suggestions.push('Remove either ⊕ (strict) or ⊗ (exploratory) - cannot have both');
        break;
      case 'PRIORITY_CONFLICT':
        suggestions.push('Remove either ↑ (high priority) or ↓ (low priority) - cannot have both');
        break;
      case 'SEQUENCE_MODE_NOT_FIRST':
        suggestions.push('Move mode symbol (⊕/⊖/⊗/⊘) to the beginning of the frame');
        break;
      case 'SEQUENCE_ACTION_BEFORE_DOMAIN':
        suggestions.push('Move domain symbol (◊/◈/◇/◆/◐) before the action symbol');
        break;
      case 'MODE_STRENGTH_WEAKENED':
        suggestions.push('Child frame cannot use a weaker mode than parent. Strength order: ⊕ > ⊘ > ⊖ > ⊗');
        break;
      case 'FORBIDDEN_NOT_INHERITED':
        suggestions.push('Parent has ⛔ constraint which must be inherited by child');
        break;
    }
  }

  for (const warning of (report.warnings ?? [])) {
    switch (warning.code) {
      case 'ACTION_MISSING_DOMAIN':
        suggestions.push('Consider adding a domain symbol (◊/◈/◇/◆/◐) before the action');
        break;
      case 'ITERATIVE_NO_TERMINATION':
        suggestions.push('⟳ (iterative) requires termination_condition in metadata');
        break;
    }
  }

  return suggestions;
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

export interface BatchValidateRequest {
  frames: Array<{
    frame: string;
    parentFrame?: string;
  }>;
  validationLevel?: 'structural' | 'semantic' | 'chain' | 'full';
  strict?: boolean;
  stopOnFirstError?: boolean;
}

export interface BatchValidateResult {
  allValid: boolean;
  results: ValidateResult[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    totalErrors: number;
    totalWarnings: number;
  };
}

export function ps_validate_batch(request: BatchValidateRequest): BatchValidateResult {
  const results: ValidateResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const item of request.frames) {
    const result = ps_validate({
      frame: item.frame,
      parentFrame: item.parentFrame,
      validationLevel: request.validationLevel,
      strict: request.strict
    });

    results.push(result);
    totalErrors += result.summary.errors;
    totalWarnings += result.summary.warnings;

    if (request.stopOnFirstError && !result.valid) {
      break;
    }
  }

  const validCount = results.filter(r => r.valid).length;

  return {
    allValid: validCount === results.length,
    results,
    summary: {
      total: results.length,
      valid: validCount,
      invalid: results.length - validCount,
      totalErrors,
      totalWarnings
    }
  };
}
