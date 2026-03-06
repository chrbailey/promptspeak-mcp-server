/**
 * PromptSpeak English Expander
 *
 * Deterministic conversion of ASTs to natural English.
 * Spec Section 5.1 requires safety filters to operate on the English expansion.
 */

import type { ExpressionNode, ActionNode } from './ast.js';

/**
 * Verb display names — expands abbreviations to readable English.
 * Covers all 30 core verbs + 6 procurement verbs.
 */
const VERB_MAP: Record<string, string> = {
  // Analysis domain
  analyze: 'Analyze',
  compare: 'Compare',
  eval: 'Evaluate',
  classify: 'Classify',
  reason: 'Reason about',
  diagnose: 'Diagnose',
  // Generation domain
  gen: 'Generate',
  summary: 'Summarize',
  transform: 'Transform',
  translate: 'Translate',
  rewrite: 'Rewrite',
  draft: 'Draft',
  // Data domain
  extract: 'Extract',
  filter: 'Filter',
  sort: 'Sort',
  merge: 'Merge',
  validate: 'Validate',
  map: 'Map',
  // Communication domain
  report: 'Report',
  alert: 'Alert',
  log: 'Log',
  explain: 'Explain',
  respond: 'Respond with',
  checklist: 'Checklist',
  // Control domain
  check: 'Check',
  retry: 'Retry',
  delegate: 'Delegate',
  wait: 'Wait for',
  load: 'Load',
  review: 'Review',
  // Procurement domain
  bid: 'Bid on',
  team: 'Team with',
  certify: 'Certify',
  comply: 'Comply with',
  propose: 'Propose',
  seek: 'Seek',
};

/**
 * Expand a verb to its English display form.
 * Falls back to capitalized verb if not in the map.
 */
function expandVerb(verb: string): string {
  return VERB_MAP[verb] ?? verb.charAt(0).toUpperCase() + verb.slice(1);
}

/**
 * Expand a single action node to English.
 */
function expandAction(action: ActionNode): string {
  const parts: string[] = [expandVerb(action.verb)];

  // Target nouns
  if (action.target && action.target.nouns.length > 0) {
    const nounStrs = action.target.nouns.map(n =>
      n.value ? `${n.name}:${n.value}` : n.name
    );
    parts.push(nounStrs.join(', '));
  }

  // Filter qualifiers
  if (action.filter && action.filter.qualifiers.length > 0) {
    const qualStrs = action.filter.qualifiers.map(q =>
      q.value ? `${q.key}=${q.value}` : q.key
    );
    parts.push(`focusing on ${qualStrs.join(', ')}`);
  }

  // Modifiers
  if (action.modifiers.length > 0) {
    const modStrs = action.modifiers.map(m => `${m.key}=${m.value}`);
    parts.push(`with ${modStrs.join(', ')}`);
  }

  return parts.join(' ');
}

/**
 * Expand a full expression AST to natural English.
 *
 * @param ast - Parsed ExpressionNode
 * @returns Human-readable English description
 *
 * @example
 * ```
 * expand(parse('::analyze{document}[security]'))
 * // => "Analyze document focusing on security"
 *
 * expand(parse('::extract{data} > ::filter{results}|min:10'))
 * // => "Extract data, then Filter results with min=10"
 *
 * expand(parse('?valid > ::report{ok} : ::alert{error}'))
 * // => "If valid then Report ok, else Alert error"
 * ```
 */
export function expand(ast: ExpressionNode): string {
  // Branch expression
  if (ast.branch) {
    const truePart = expandAction(
      ast.branch.trueBranch.type === 'Action'
        ? ast.branch.trueBranch as ActionNode
        : (ast.branch.trueBranch as ExpressionNode).body
    );

    if (ast.branch.falseBranch) {
      const falsePart = expandAction(
        ast.branch.falseBranch.type === 'Action'
          ? ast.branch.falseBranch as ActionNode
          : (ast.branch.falseBranch as ExpressionNode).body
      );
      return `If ${ast.branch.condition} then ${truePart}, else ${falsePart}`;
    }

    return `If ${ast.branch.condition} then ${truePart}`;
  }

  // Action + pipes
  const parts = [expandAction(ast.body)];
  for (const piped of ast.pipes) {
    parts.push(expandAction(piped));
  }

  return parts.join(', then ');
}
