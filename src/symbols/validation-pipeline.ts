/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SYMBOL VALIDATION PIPELINE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unified validation pipeline for symbol operations (create/update).
 * Consolidates security validation, audit logging, and epistemic checks
 * into a single reusable flow.
 *
 * This module exists to:
 * - Eliminate duplication between create() and update() validation
 * - Ensure consistent security checks across all symbol mutations
 * - Centralize audit logging for security events
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createLogger } from '../core/logging/index.js';
import { validateSymbolContent, type FullValidationResult } from './sanitizer.js';
import { getAuditLogger } from './audit.js';
import { getClaimValidator } from './claim-validator.js';
import type { SymbolDatabase } from './database.js';
import type { CreateSymbolRequest } from './types.js';
import type { EpistemicMetadata } from './epistemic-types.js';

const logger = createLogger('ValidationPipeline');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Operation type for audit logging context.
 */
export type ValidationOperation = 'CREATE' | 'UPDATE';

/**
 * Result of security validation step.
 */
export interface SecurityValidationResult {
  /** Whether validation passed (not blocked) */
  passed: boolean;
  /** The full validation result from the sanitizer */
  validation: FullValidationResult;
  /** Error message if blocked, undefined otherwise */
  error?: string;
}

/**
 * Result of epistemic validation step.
 */
export interface EpistemicValidationResult {
  /** Generated or merged epistemic metadata */
  metadata: EpistemicMetadata;
  /** Whether human review is required */
  requiresHumanReview: boolean;
  /** Reason for human review, if applicable */
  reviewReason?: string;
}

/**
 * How field structure - matches CreateSymbolRequest.how
 */
export interface HowField {
  focus: string[];
  constraints: string[];
  output_format?: string;
}

/**
 * Content to validate - subset of CreateSymbolRequest fields.
 */
export interface ValidatableContent {
  symbolId: string;
  who?: string;
  what?: string;
  why?: string;
  where?: string;
  when?: string;
  how?: HowField;
  commanders_intent?: string;
  requirements?: string[];
  anti_requirements?: string[];
  tags?: string[];
  epistemic?: Partial<EpistemicMetadata>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run security validation on symbol content.
 * Handles injection detection, audit logging, and violation tracking.
 *
 * @param content - The content to validate
 * @param operation - Whether this is a CREATE or UPDATE operation
 * @param db - Database instance for audit logging
 * @returns SecurityValidationResult indicating pass/fail with details
 */
export function runSecurityValidation(
  content: ValidatableContent,
  operation: ValidationOperation,
  db: SymbolDatabase
): SecurityValidationResult {
  const auditLogger = getAuditLogger();
  const validation = validateSymbolContent(content as CreateSymbolRequest);

  if (validation.blocked) {
    // Extract violations for logging
    const violations = Array.from(validation.fieldResults.values())
      .flatMap(r => r.violations);

    // Log injection attempt via audit logger
    if (auditLogger) {
      auditLogger.logInjectionAttempt(
        content.symbolId,
        violations,
        validation.totalRiskScore,
        true // blocked
      );
    }

    // Log to SQLite audit trail
    db.insertAuditEntry({
      eventType: `SYMBOL_${operation}_BLOCKED`,
      symbolId: content.symbolId,
      riskScore: validation.totalRiskScore,
      violations,
    });

    return {
      passed: false,
      validation,
      error: `${operation === 'CREATE' ? 'Symbol' : 'Update'} rejected: ${validation.summary}. Content contains injection patterns.`,
    };
  }

  // Log warnings for non-critical violations
  if (validation.totalViolations > 0 && auditLogger) {
    const violations = Array.from(validation.fieldResults.values())
      .flatMap(r => r.violations);
    auditLogger.logValidationWarning(
      content.symbolId,
      violations,
      validation.totalRiskScore
    );
  }

  return {
    passed: true,
    validation,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EPISTEMIC VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run epistemic validation and generate metadata.
 * Detects high-stakes claims and enforces evidence requirements.
 *
 * @param content - The content to validate for epistemic claims
 * @param db - Database instance for audit logging
 * @returns EpistemicValidationResult with generated metadata
 */
export function runEpistemicValidation(
  content: ValidatableContent,
  db: SymbolDatabase
): EpistemicValidationResult {
  const claimValidator = getClaimValidator();

  // Run claim detection
  const claimValidation = claimValidator.validateSymbol(
    {
      who: content.who,
      what: content.what,
      why: content.why,
      where: content.where,
      when: content.when,
      commanders_intent: content.commanders_intent,
      requirements: content.requirements,
      tags: content.tags,
    },
    content.epistemic?.evidence_basis
  );

  // Generate or merge epistemic metadata
  let metadata: EpistemicMetadata;

  if (content.epistemic) {
    // User provided epistemic metadata - use as base but may override
    metadata = claimValidator.generateEpistemicMetadata(
      claimValidation,
      content.epistemic as Partial<EpistemicMetadata>
    );

    // If user claims cross-reference but validator found accusations, still flag
    if (
      claimValidation.has_unverified_accusations &&
      !content.epistemic.evidence_basis?.cross_references_performed
    ) {
      metadata.requires_human_review = true;
      metadata.review_reason = claimValidation.reason;
      metadata.confidence = Math.min(
        metadata.confidence,
        claimValidation.recommended_confidence
      );
    }
  } else {
    // Auto-generate epistemic metadata
    metadata = claimValidator.generateEpistemicMetadata(claimValidation);
  }

  // Log and audit if flagged for human review
  if (claimValidation.requires_human_review) {
    logger.info('Symbol flagged for human review', {
      symbolId: content.symbolId,
      claimType: claimValidation.detected_claim_type,
      confidence: metadata.confidence,
      reason: claimValidation.reason,
      triggeredPatterns: claimValidation.triggered_patterns,
    });

    db.insertAuditEntry({
      eventType: 'EPISTEMIC_FLAG',
      symbolId: content.symbolId,
      riskScore: Math.round((1 - metadata.confidence) * 100),
      details: {
        claimType: claimValidation.detected_claim_type,
        confidence: metadata.confidence,
        triggeredPatterns: claimValidation.triggered_patterns,
        suggestedSources: claimValidation.suggested_sources,
      },
    });
  }

  return {
    metadata,
    requiresHumanReview: claimValidation.requires_human_review,
    reviewReason: claimValidation.reason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full validation pipeline result.
 */
export interface ValidationPipelineResult {
  /** Whether all validation passed */
  passed: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Security validation details */
  security: SecurityValidationResult;
  /** Epistemic validation details (only if runEpistemic was true) */
  epistemic?: EpistemicValidationResult;
}

/**
 * Run the full validation pipeline for symbol content.
 *
 * @param content - The content to validate
 * @param operation - Whether this is a CREATE or UPDATE operation
 * @param db - Database instance for audit logging
 * @param options - Pipeline options
 * @returns ValidationPipelineResult with all validation details
 */
export function runValidationPipeline(
  content: ValidatableContent,
  operation: ValidationOperation,
  db: SymbolDatabase,
  options: {
    /** Whether to run epistemic validation (default: true for CREATE, false for UPDATE) */
    runEpistemic?: boolean;
  } = {}
): ValidationPipelineResult {
  const runEpistemic = options.runEpistemic ?? (operation === 'CREATE');

  // Step 1: Security validation
  const security = runSecurityValidation(content, operation, db);

  if (!security.passed) {
    return {
      passed: false,
      error: security.error,
      security,
    };
  }

  // Step 2: Epistemic validation (if enabled)
  let epistemic: EpistemicValidationResult | undefined;
  if (runEpistemic) {
    epistemic = runEpistemicValidation(content, db);
  }

  return {
    passed: true,
    security,
    epistemic,
  };
}
