/**
 * Grammar → Governance Bridge
 *
 * Validates PromptSpeak expressions against the verb registry
 * and safety classification system. This is the integration point
 * between the EBNF grammar parser (spec Section 2) and the
 * governance pipeline (spec Sections 4-5).
 *
 * Spec Section 5.1: Safety filters operate on English expansion.
 */

import { parse, ParseError } from './parser.js';
import { expand } from './expander.js';
import type { ExpressionNode, ActionNode } from './ast.js';
import type { VerbRegistryDB, VerbEntry } from '../registry/registry-db.js';
import { getRegistryDB } from '../tools/ps_registry.js';

export type ExpressionDecision = 'allow' | 'hold' | 'block' | 'reject';

export interface VerbCheckResult {
  verb: string;
  found: boolean;
  status?: string;
  safety_class?: string;
  decision: ExpressionDecision;
  reason?: string;
}

export interface ExpressionValidationReport {
  valid: boolean;
  expression: string;
  english: string;
  decision: ExpressionDecision;
  verbs: VerbCheckResult[];
  errors: string[];
  warnings: string[];
}

/**
 * Extract all verbs from an expression AST.
 */
function extractVerbs(ast: ExpressionNode): string[] {
  const verbs: string[] = [ast.body.verb];
  for (const piped of ast.pipes) {
    verbs.push(piped.verb);
  }
  if (ast.branch) {
    const trueBranch = ast.branch.trueBranch;
    if (trueBranch.type === 'Action') {
      verbs.push((trueBranch as ActionNode).verb);
    }
    if (ast.branch.falseBranch) {
      const falseBranch = ast.branch.falseBranch;
      if (falseBranch.type === 'Action') {
        verbs.push((falseBranch as ActionNode).verb);
      }
    }
  }
  return verbs;
}

/**
 * Check a single verb against the registry.
 */
function checkVerb(verb: string, db: VerbRegistryDB): VerbCheckResult {
  const symbol = verb.startsWith('::') ? verb : `::${verb}`;
  const entry = db.resolve(symbol);

  if (!entry) {
    return {
      verb,
      found: false,
      decision: 'reject',
      reason: `Unknown verb: ${symbol} — not in registry`,
    };
  }

  // Check lifecycle status
  if (entry.status === 'revoked') {
    return {
      verb,
      found: true,
      status: entry.status,
      safety_class: entry.safety_class,
      decision: 'reject',
      reason: `Verb ${symbol} has been revoked`,
    };
  }

  if (entry.status === 'deprecated') {
    // Deprecated verbs are allowed but warned
    return {
      verb,
      found: true,
      status: entry.status,
      safety_class: entry.safety_class,
      decision: 'allow',
      reason: `Verb ${symbol} is deprecated${entry.supersedes ? ` — superseded by ${entry.supersedes}` : ''}`,
    };
  }

  // Check safety classification
  switch (entry.safety_class) {
    case 'blocked':
      return {
        verb,
        found: true,
        status: entry.status,
        safety_class: entry.safety_class,
        decision: 'block',
        reason: `Verb ${symbol} is blocked by safety classification`,
      };
    case 'restricted':
      return {
        verb,
        found: true,
        status: entry.status,
        safety_class: entry.safety_class,
        decision: 'hold',
        reason: `Verb ${symbol} requires approval (restricted)`,
      };
    case 'monitored':
      return {
        verb,
        found: true,
        status: entry.status,
        safety_class: entry.safety_class,
        decision: 'allow',
        reason: `Verb ${symbol} is monitored`,
      };
    case 'unrestricted':
    default:
      return {
        verb,
        found: true,
        status: entry.status,
        safety_class: entry.safety_class,
        decision: 'allow',
      };
  }
}

/**
 * Compute overall decision from individual verb decisions.
 * Most restrictive wins: reject > block > hold > allow.
 */
function computeOverallDecision(verbResults: VerbCheckResult[]): ExpressionDecision {
  if (verbResults.some(v => v.decision === 'reject')) return 'reject';
  if (verbResults.some(v => v.decision === 'block')) return 'block';
  if (verbResults.some(v => v.decision === 'hold')) return 'hold';
  return 'allow';
}

/**
 * Validate a PromptSpeak expression against the verb registry.
 *
 * 1. Parse the expression
 * 2. Look up each verb in the registry
 * 3. Check lifecycle status (reject revoked)
 * 4. Check safety classification (block/hold/allow)
 * 5. Expand to English for audit trail
 *
 * @param expression - Raw PromptSpeak expression string
 * @param db - Optional VerbRegistryDB (falls back to module singleton)
 * @returns Validation report with decision, verb details, English expansion
 */
export function validateExpression(expression: string, db?: VerbRegistryDB): ExpressionValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Parse
  let ast: ExpressionNode;
  try {
    ast = parse(expression);
  } catch (error) {
    return {
      valid: false,
      expression,
      english: '',
      decision: 'reject',
      verbs: [],
      errors: [error instanceof ParseError ? error.message : `Parse error: ${String(error)}`],
      warnings: [],
    };
  }

  // Step 2: Expand to English
  const english = expand(ast);

  // Step 3: Look up verbs in registry
  const registry = db ?? getRegistryDB();
  if (!registry) {
    // No registry available — allow but warn
    const verbs = extractVerbs(ast).map(v => ({
      verb: v,
      found: false,
      decision: 'allow' as ExpressionDecision,
      reason: 'No verb registry available — skipping verb validation',
    }));
    return {
      valid: true,
      expression,
      english,
      decision: 'allow',
      verbs,
      errors: [],
      warnings: ['Verb registry not initialized — verb validation skipped'],
    };
  }

  // Step 4: Check each verb
  const verbResults = extractVerbs(ast).map(v => checkVerb(v, registry));

  // Collect warnings from deprecated verbs
  for (const vr of verbResults) {
    if (vr.status === 'deprecated' && vr.reason) {
      warnings.push(vr.reason);
    }
    if (vr.safety_class === 'monitored' && vr.reason) {
      warnings.push(vr.reason);
    }
  }

  // Collect errors from rejected/blocked verbs
  for (const vr of verbResults) {
    if ((vr.decision === 'reject' || vr.decision === 'block') && vr.reason) {
      errors.push(vr.reason);
    }
  }

  const decision = computeOverallDecision(verbResults);

  return {
    valid: decision === 'allow' || decision === 'hold',
    expression,
    english,
    decision,
    verbs: verbResults,
    errors,
    warnings,
  };
}
