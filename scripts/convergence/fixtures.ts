/**
 * Convergence Test Harness — Canned-Response Fixtures
 *
 * Used by --dry-run to exercise the full pipeline without calling any
 * real provider API. Each fixture is a plausible response shape the
 * measurement module should grade correctly. The fixtures purposely
 * span the spec §8.3 thresholds (below 30%, near 50%, above 70%) so
 * the harness's scoring logic is exercised end-to-end.
 */

import type { ProviderName, ChatMessage, ProviderResult } from './providers.js';

export interface Fixture {
  /** The "response" the fake provider will return. */
  response: string;
  /** Synthetic latency so the JSON report has a realistic shape. */
  latency_ms: number;
  /** Synthetic token counts. */
  tokens_in: number;
  tokens_out: number;
}

/** A deterministic bank keyed by task id — one per task in the task bank. */
const FIXTURE_BANK: Record<number, Fixture> = {
  1: {
    // High adoption: almost entirely PromptSpeak.
    response: [
      'Plan:',
      '::extract{questionnaires}[security_findings]',
      '::compare{questionnaires}[baseline_requirements]',
      '::report{ranked_vendors}|count:3',
    ].join('\n'),
    latency_ms: 420,
    tokens_in: 1800,
    tokens_out: 90,
  },
  2: {
    // Moderate adoption: prose with two PromptSpeak fragments.
    response: [
      'Root cause analysis below.',
      'Step 1: ::diagnose{504_errors}[logs]',
      'Step 2: ::gen{incident_summary}|length:1_paragraph',
      'The spike began at 03:14Z; upstream LB timeouts were the trigger.',
    ].join('\n'),
    latency_ms: 510,
    tokens_in: 2100,
    tokens_out: 140,
  },
  3: {
    // Low adoption: mostly English, one fragment.
    response: [
      'Draft response to section 4.2:',
      'We propose an agile delivery model leveraging our federal civilian experience.',
      '::draft{rfp_response_4_2}|audience:federal_civilian|length:1_page',
      'See attached past-performance summary.',
    ].join('\n'),
    latency_ms: 890,
    tokens_in: 2400,
    tokens_out: 180,
  },
  4: {
    // High adoption chain.
    response: '::reason{weekly_drop}[event_stream] > ::rank{hypotheses}|key:confidence',
    latency_ms: 330,
    tokens_in: 1700,
    tokens_out: 40,
  },
  5: {
    // High adoption, registered verbs only.
    response: '::validate{payload}|schema:v4 > ::alert{malformed_fields}',
    latency_ms: 280,
    tokens_in: 1600,
    tokens_out: 30,
  },
  6: {
    response: '::classify{tickets}[severity, product_area] > ::report{top_three_areas}',
    latency_ms: 360,
    tokens_in: 1800,
    tokens_out: 36,
  },
  7: {
    // Low adoption.
    response: [
      'Review summary:',
      'Clause 7.3 weakens indemnity; clause 11.1 reduces liability cap to $50k.',
      '::report{indemnity_risks}|count:2',
    ].join('\n'),
    latency_ms: 620,
    tokens_in: 2200,
    tokens_out: 90,
  },
  8: {
    response: '::transform{sales_orders_csv}|format:json > ::filter{rows}[customer_id:present] > ::report{dropped_count}',
    latency_ms: 450,
    tokens_in: 1900,
    tokens_out: 55,
  },
  9: {
    response: '::seek{partners}[AWS_GovCloud, past_performance] > ::rank{shortlist}|top:3 > ::draft{teaming_outline}',
    latency_ms: 710,
    tokens_in: 2300,
    tokens_out: 80,
  },
  10: {
    response: '::checklist{build_2026_04_18} > ::review{blockers} > ::report{open_items_with_owners}',
    latency_ms: 410,
    tokens_in: 1750,
    tokens_out: 50,
  },
};

/**
 * Synthesize a provider response from the fixture bank.
 * Ignores `messages`; keyed on the task id embedded in the last user message
 * by the runner (`[[TASK_ID=n]]` marker).
 */
export function cannedProviderCall(
  provider: ProviderName,
  messages: ChatMessage[]
): ProviderResult {
  const last = messages[messages.length - 1]?.content ?? '';
  const match = last.match(/\[\[TASK_ID=(\d+)\]\]/);
  const taskId = match ? parseInt(match[1], 10) : 1;
  const fixture = FIXTURE_BANK[taskId] ?? FIXTURE_BANK[1];

  return {
    ok: true,
    response: fixture.response,
    latency_ms: fixture.latency_ms,
    tokens_in: fixture.tokens_in,
    tokens_out: fixture.tokens_out,
    model: `fake-${provider}-dry-run`,
    provider,
  };
}
