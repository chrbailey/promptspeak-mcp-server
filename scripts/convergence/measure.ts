/**
 * Convergence Test Harness — Measurement Module
 *
 * Scans a free-form LLM response for PromptSpeak constructs, feeds each
 * candidate fragment through the real grammar parser, and computes the
 * two rates defined by §8 of the v0.2 spec:
 *
 *   - spontaneousRate:       fraction of the response (by character)
 *                            occupied by PromptSpeak fragments
 *   - semanticValidityRate:  fraction of those fragments whose verbs are
 *                            in the registered verb set AND whose
 *                            expand() produces a non-empty English
 *                            expansion
 *
 * Fragment extraction uses a deterministic scanner rather than a regex
 * so chained expressions like `::a{x} > ::b{y}|k:v` are kept intact.
 */

import { parse, ParseError } from '../../src/grammar/parser.js';
import { expand } from '../../src/grammar/expander.js';
import {
  CORE_VERB_SYMBOLS,
  PROCUREMENT_VERB_SYMBOLS,
} from '../../src/registry/seed-verbs.js';

/** All verb names (without the `::` prefix) that count as registered. */
const REGISTERED_VERBS: Set<string> = new Set(
  [...CORE_VERB_SYMBOLS, ...PROCUREMENT_VERB_SYMBOLS].map(s =>
    s.startsWith('::') ? s.slice(2) : s
  )
);

export interface ExtractedFragment {
  /** Raw substring, exactly as it appears in the response. */
  text: string;
  /** 0-based start index in the response. */
  start: number;
  /** Exclusive end index. */
  end: number;
  /** True if parse() accepted the fragment without error. */
  parsed: boolean;
  /** Parse error message if the fragment failed to parse. */
  error?: string;
  /** Verbs (names, no `::`) referenced in the parsed AST. Empty when parse failed. */
  verbs: string[];
  /** Whether every verb in the fragment is in the registered verb set. */
  allVerbsRegistered: boolean;
  /** English expansion from the real expander, or undefined on parse failure. */
  english?: string;
}

export interface MeasurementResult {
  /** Total characters in the response that we analyzed. */
  totalChars: number;
  /** Every fragment candidate we identified (both well-formed and malformed). */
  fragments: ExtractedFragment[];
  /** Fraction of response characters covered by successfully-parsed fragments. */
  spontaneousRate: number;
  /**
   * Fraction of well-formed fragments that are also semantically valid
   * (all verbs registered AND a non-empty english expansion). Undefined
   * when there are no fragments at all, so the caller can distinguish
   * "vacuously zero" from "truly zero" without a sentinel number.
   */
  semanticValidityRate: number | undefined;
  /** Convenience totals. */
  fragmentCount: number;
  parsedCount: number;
  semanticallyValidCount: number;
  /** List of verbs referenced in the response (across all parsed fragments). */
  verbsUsed: string[];
  /** Verbs the model used that are NOT in the registered verb set. */
  unregisteredVerbs: string[];
}

/**
 * Walk the string from each `::` start and grow the candidate as long as
 * characters are part of the PromptSpeak alphabet. This is intentionally
 * permissive — the parser is the ultimate arbiter of validity.
 *
 * We stop the candidate at the first character that is not part of the
 * allowed alphabet (whitespace followed by a non-expression char, or a
 * sentence terminator like '.', ';', '!').
 */
function extractCandidateStrings(response: string): Array<{ text: string; start: number }> {
  const results: Array<{ text: string; start: number }> = [];
  const len = response.length;
  let i = 0;

  while (i < len - 1) {
    if (response[i] !== ':' || response[i + 1] !== ':') {
      i++;
      continue;
    }
    const start = i;

    // Scan forward while inside the PromptSpeak alphabet.
    // Allowed: identifiers, digits, :, {}, [], |, >, ?, ,, whitespace, " strings
    // Chain extension: once we see ' > ' we expect another `::` action to follow.
    let depthBrace = 0;
    let depthBracket = 0;
    let inString = false;
    let j = i;
    while (j < len) {
      const c = response[j];
      if (inString) {
        if (c === '"') inString = false;
        j++;
        continue;
      }
      if (c === '"') {
        inString = true;
        j++;
        continue;
      }
      if (c === '{') { depthBrace++; j++; continue; }
      if (c === '}') { if (depthBrace === 0) break; depthBrace--; j++; continue; }
      if (c === '[') { depthBracket++; j++; continue; }
      if (c === ']') { if (depthBracket === 0) break; depthBracket--; j++; continue; }

      // Characters that are always part of the expression alphabet.
      if (/[A-Za-z0-9_\-:|,?]/.test(c)) { j++; continue; }

      // Whitespace, '>' — only keep if we are continuing to another action.
      if (c === ' ' || c === '\t') {
        // Lookahead: if next non-whitespace is '>' or '::' we continue; else stop.
        let k = j + 1;
        while (k < len && (response[k] === ' ' || response[k] === '\t')) k++;
        if (k < len && (response[k] === '>' || (response[k] === ':' && response[k + 1] === ':'))) {
          j = k;
          continue;
        }
        // Also tolerate whitespace inside an open brace/bracket.
        if (depthBrace > 0 || depthBracket > 0) { j++; continue; }
        break;
      }
      if (c === '>') {
        // Expect another `::` after optional whitespace.
        let k = j + 1;
        while (k < len && (response[k] === ' ' || response[k] === '\t')) k++;
        if (k < len - 1 && response[k] === ':' && response[k + 1] === ':') {
          j = k;
          continue;
        }
        break;
      }

      break;
    }

    // Trim trailing whitespace inside the candidate.
    let end = j;
    while (end > start && /\s/.test(response[end - 1])) end--;

    const text = response.slice(start, end);
    if (text.length > 2) {
      results.push({ text, start });
    }
    i = Math.max(end, start + 2);
  }
  return results;
}

/**
 * Collect every verb name (no `::` prefix) referenced by the AST,
 * including those inside pipe chains and true/false branches.
 */
function collectVerbs(ast: ReturnType<typeof parse>): string[] {
  const verbs: string[] = [];
  if (ast.branch) {
    const t = ast.branch.trueBranch;
    if (t.type === 'Action') verbs.push(t.verb);
    else if (t.type === 'Expression') verbs.push(t.body.verb, ...t.pipes.map(p => p.verb));
    if (ast.branch.falseBranch) {
      const f = ast.branch.falseBranch;
      if (f.type === 'Action') verbs.push(f.verb);
      else if (f.type === 'Expression') verbs.push(f.body.verb, ...f.pipes.map(p => p.verb));
    }
  }
  verbs.push(ast.body.verb, ...ast.pipes.map(p => p.verb));
  return Array.from(new Set(verbs));
}

/**
 * Split a candidate string into top-level action segments.
 *
 * The candidate extractor is deliberately permissive and may return a
 * string that contains multiple `::verb{…}` actions that are NOT joined
 * by a pipe (`>`). The shared grammar parser's `parseExpression` only
 * consumes one action + any `>`-chained continuations, so running it on
 * the raw concatenation silently drops trailing actions and hides
 * unregistered verbs from the semantic-validity check.
 *
 * To keep measurement honest, we pre-split on every `::` that begins a
 * NEW top-level action — i.e. one not preceded (at top level, outside
 * strings and brace/bracket nesting) by a `>` pipe-chain operator. Each
 * segment is then parsed independently.
 *
 * Branch bodies (after `?cond >`) are kept intact because the `>` is a
 * chain-operator continuation, not a segment boundary.
 */
function splitTopLevelActionSegments(text: string): string[] {
  const segments: string[] = [];
  const len = text.length;
  let segStart = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inString = false;
  // Track the most recent non-whitespace, non-token-noise character at
  // top level. We use it to decide whether a new `::` starts a fresh
  // segment (previous char is NOT `>`) or continues the current one.
  let lastTopLevelNonWs: string | null = null;

  for (let i = 0; i < len; i++) {
    const c = text[i];
    if (inString) {
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') { depthBrace++; lastTopLevelNonWs = c; continue; }
    if (c === '}') { if (depthBrace > 0) depthBrace--; lastTopLevelNonWs = c; continue; }
    if (c === '[') { depthBracket++; lastTopLevelNonWs = c; continue; }
    if (c === ']') { if (depthBracket > 0) depthBracket--; lastTopLevelNonWs = c; continue; }

    // Only consider splitting at top level (no open brace/bracket/string).
    if (depthBrace === 0 && depthBracket === 0) {
      if (c === ':' && i + 1 < len && text[i + 1] === ':') {
        // A new `::` at top level. If the previous non-whitespace top-level
        // char is `>`, we're inside a pipe chain — do NOT split. Otherwise,
        // the prior segment ends here.
        const isChainContinuation = lastTopLevelNonWs === '>';
        if (!isChainContinuation && i > segStart) {
          const seg = text.slice(segStart, i).trim();
          if (seg.length > 0) segments.push(seg);
          segStart = i;
        }
        // Skip the second ':'.
        i++;
        lastTopLevelNonWs = ':';
        continue;
      }
    }

    if (!/\s/.test(c)) lastTopLevelNonWs = c;
  }

  const tail = text.slice(segStart).trim();
  if (tail.length > 0) segments.push(tail);
  return segments;
}

/** Measure a raw response string. Pure function — no I/O. */
export function measure(response: string): MeasurementResult {
  const totalChars = response.length;
  const candidates = extractCandidateStrings(response);

  const fragments: ExtractedFragment[] = [];
  let coveredChars = 0;
  let parsedCount = 0;
  let semanticallyValidCount = 0;
  const allVerbs = new Set<string>();
  const unregistered = new Set<string>();

  for (const cand of candidates) {
    // A single extracted candidate may contain multiple top-level actions
    // that are NOT joined by a pipe (`>`). The shared grammar parser only
    // consumes one action + its pipe chain, so concatenated actions like
    // `::a{x}::b{y}` would silently drop `::b{y}` and hide its verb from
    // the semantic-validity check. Pre-split and parse each segment
    // independently so every verb the model wrote is actually examined.
    const segments = splitTopLevelActionSegments(cand.text);

    let allSegmentsParsed = segments.length > 0;
    const verbsInCand = new Set<string>();
    const englishParts: string[] = [];
    let firstError: string | undefined;

    for (const seg of segments) {
      try {
        const ast = parse(seg);
        const segVerbs = collectVerbs(ast);
        for (const v of segVerbs) verbsInCand.add(v);
        englishParts.push(expand(ast).trim());
      } catch (e) {
        allSegmentsParsed = false;
        if (firstError === undefined) {
          firstError = e instanceof ParseError ? e.message : String(e);
        }
      }
    }

    const verbs = Array.from(verbsInCand);
    const parsed = allSegmentsParsed;
    const error = parsed ? undefined : firstError;
    const english = parsed ? englishParts.join(' ') : undefined;
    const allVerbsRegistered =
      parsed && verbs.length > 0 && verbs.every(v => REGISTERED_VERBS.has(v));

    const end = cand.start + cand.text.length;
    fragments.push({
      text: cand.text,
      start: cand.start,
      end,
      parsed,
      error,
      verbs,
      allVerbsRegistered,
      english,
    });

    if (parsed) {
      parsedCount++;
      coveredChars += cand.text.length;
      for (const v of verbs) {
        allVerbs.add(v);
        if (!REGISTERED_VERBS.has(v)) unregistered.add(v);
      }
      if (allVerbsRegistered && english && english.length > 0) {
        semanticallyValidCount++;
      }
    }
  }

  const spontaneousRate = totalChars > 0 ? coveredChars / totalChars : 0;
  const semanticValidityRate =
    parsedCount === 0 ? undefined : semanticallyValidCount / parsedCount;

  return {
    totalChars,
    fragments,
    spontaneousRate,
    semanticValidityRate,
    fragmentCount: fragments.length,
    parsedCount,
    semanticallyValidCount,
    verbsUsed: Array.from(allVerbs).sort(),
    unregisteredVerbs: Array.from(unregistered).sort(),
  };
}

/** Exposed for tests that want to assert on the extraction layer alone. */
export const _internals = {
  extractCandidateStrings,
  collectVerbs,
  splitTopLevelActionSegments,
  REGISTERED_VERBS,
};
