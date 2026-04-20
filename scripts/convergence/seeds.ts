/**
 * Convergence Test Harness — Seed Corpus
 *
 * 20 mixed English / PromptSpeak agent-to-agent interaction fragments.
 * Each seed pairs a plain-English instruction with its PromptSpeak twin,
 * showing the same semantic content. A naive LLM sampling from these
 * should, per §8.1 of the v0.2 design spec, begin spontaneously
 * producing PromptSpeak constructs on an unrelated task.
 *
 * Drawn across all 5 core verb families + the procurement namespace so
 * that no single verb dominates the exposure.
 */

export interface SeedInteraction {
  /** Stable numeric id (1..N) used for deterministic sampling. */
  id: number;
  /** Short human tag for debugging / error messages. */
  tag: string;
  /** The 2-4 turn agent-to-agent exchange, already formatted as a prompt block. */
  text: string;
}

export const SEED_INTERACTIONS: SeedInteraction[] = [
  {
    id: 1,
    tag: 'analyze-security',
    text: [
      'Agent A: Please review this contract for security-relevant clauses.',
      'Agent A: ::analyze{contract}[security]',
      'Agent B: Found 3 concerns: data handling, termination rights, indemnity caps.',
      'Agent B: ::report{findings}|count:3',
    ].join('\n'),
  },
  {
    id: 2,
    tag: 'extract-merge',
    text: [
      'Agent A: Pull line items from the invoices and merge them into a single table.',
      'Agent A: ::extract{line_items} > ::merge{invoices}',
      'Agent B: Merged 47 line items across 4 invoices. One duplicate removed.',
      'Agent B: ::report{merged, deduplicated}|total:47',
    ].join('\n'),
  },
  {
    id: 3,
    tag: 'compare-proposals',
    text: [
      'Agent A: Compare proposal A and proposal B against the RFP requirements.',
      'Agent A: ::compare{proposal_A, proposal_B}[rfp_requirements]',
      'Agent B: Proposal B stronger on past performance; Proposal A cheaper by 12%.',
      'Agent B: ::summary{comparison}|dimensions:2',
    ].join('\n'),
  },
  {
    id: 4,
    tag: 'classify-tickets',
    text: [
      'Agent A: Classify these support tickets by severity.',
      'Agent A: ::classify{tickets}[severity]',
      'Agent B: 12 critical, 34 high, 118 medium, 401 low.',
      'Agent B: ::report{classification}|bins:4',
    ].join('\n'),
  },
  {
    id: 5,
    tag: 'diagnose-failure',
    text: [
      'Agent A: The nightly job failed. Find the root cause from the logs.',
      'Agent A: ::diagnose{nightly_job}[logs]',
      'Agent B: Out-of-memory in report renderer at 03:14Z. Fix: increase heap.',
      'Agent B: ::explain{root_cause}',
    ].join('\n'),
  },
  {
    id: 6,
    tag: 'gen-summary',
    text: [
      'Agent A: Draft a one-page executive summary of the Q4 board deck.',
      'Agent A: ::gen{exec_summary}|length:1_page',
      'Agent B: Draft attached. Three key themes, five risks, two asks.',
      'Agent B: ::draft{summary}',
    ].join('\n'),
  },
  {
    id: 7,
    tag: 'transform-format',
    text: [
      'Agent A: Convert this CSV export into a JSON payload our API accepts.',
      'Agent A: ::transform{csv_export}|format:json',
      'Agent B: Transformed 2,418 rows. 14 rows dropped for missing keys.',
      'Agent B: ::report{transform_result}|rows:2418|dropped:14',
    ].join('\n'),
  },
  {
    id: 8,
    tag: 'translate-doc',
    text: [
      'Agent A: Translate the user guide into French, preserving technical terms.',
      'Agent A: ::translate{user_guide}|target:fr|glossary:technical',
      'Agent B: Translated. 4 technical terms flagged for SME review.',
      'Agent B: ::alert{sme_review}|count:4',
    ].join('\n'),
  },
  {
    id: 9,
    tag: 'rewrite-tone',
    text: [
      'Agent A: Rewrite this email in a more formal tone.',
      'Agent A: ::rewrite{email}|tone:formal',
      'Agent B: Rewritten. Contractions expanded, softened imperatives.',
      'Agent B: ::respond{rewritten}',
    ].join('\n'),
  },
  {
    id: 10,
    tag: 'filter-sort',
    text: [
      'Agent A: From the candidates, keep only those with 5+ years and sort by relevance.',
      'Agent A: ::filter{candidates}[years:5] > ::sort{filtered}|key:relevance',
      'Agent B: 23 candidates after filtering; top 10 returned.',
      'Agent B: ::report{ranked}|top:10',
    ].join('\n'),
  },
  {
    id: 11,
    tag: 'validate-schema',
    text: [
      'Agent A: Validate the incoming payload against the v3 schema.',
      'Agent A: ::validate{payload}|schema:v3',
      'Agent B: 1 error: missing required field "client_id". All else conforms.',
      'Agent B: ::alert{schema_error}|field:client_id',
    ].join('\n'),
  },
  {
    id: 12,
    tag: 'check-retry',
    text: [
      'Agent A: Check if the downstream service is healthy. If not, retry with backoff.',
      'Agent A: ?healthy > ::check{service}[green] : ::retry{service}|backoff:exp',
      'Agent B: Service unhealthy on first probe; succeeded on retry 2.',
      'Agent B: ::log{retry_success}|attempt:2',
    ].join('\n'),
  },
  {
    id: 13,
    tag: 'delegate-review',
    text: [
      'Agent A: Delegate the legal review to the contracts agent and wait for sign-off.',
      'Agent A: ::delegate{legal_review}|to:contracts > ::wait{signoff}',
      'Agent B: Contracts agent accepted. Expected completion: 2 hours.',
      'Agent B: ::report{delegated}|eta:2h',
    ].join('\n'),
  },
  {
    id: 14,
    tag: 'load-map',
    text: [
      'Agent A: Load the customer records and map each to its account rep.',
      'Agent A: ::load{customer_records} > ::map{records}|fn:lookup_rep',
      'Agent B: Loaded 1,840 records; 3 unmapped (rep missing).',
      'Agent B: ::alert{unmapped}|count:3',
    ].join('\n'),
  },
  {
    id: 15,
    tag: 'review-checklist',
    text: [
      'Agent A: Walk through the pre-release checklist and review blockers.',
      'Agent A: ::checklist{pre_release} > ::review{blockers}',
      'Agent B: 14 items complete, 2 open: dashboard SLO, incident runbook.',
      'Agent B: ::report{open_items}|count:2',
    ].join('\n'),
  },
  {
    id: 16,
    tag: 'reason-explain',
    text: [
      'Agent A: Given these metrics, reason about why sign-ups dropped last week.',
      'Agent A: ::reason{signup_drop}[metrics] > ::explain{hypothesis}',
      'Agent B: Most likely cause: pricing page latency spike on Tuesday.',
      'Agent B: ::respond{hypothesis}|confidence:0.72',
    ].join('\n'),
  },
  {
    id: 17,
    tag: 'eval-alert',
    text: [
      'Agent A: Evaluate these vendor responses. Alert me if any fail compliance.',
      'Agent A: ::eval{vendor_responses}[compliance] > ::alert{failures}',
      'Agent B: 2 of 7 vendors failed: VendorX (data residency), VendorY (SOC2 lapse).',
      'Agent B: ::report{failures}|count:2',
    ].join('\n'),
  },
  {
    id: 18,
    tag: 'bid-propose',
    text: [
      'Agent A: Prepare a bid on the new civilian opportunity. Propose teaming with ERP Access.',
      'Agent A: ::bid{opportunity}|vehicle:SDVOSB > ::propose{teaming}|prime:ERP_Access|share:51',
      'Agent B: Bid package drafted. Teaming letter attached for signature.',
      'Agent B: ::draft{bid_package}',
    ].join('\n'),
  },
  {
    id: 19,
    tag: 'certify-comply',
    text: [
      'Agent A: Certify our SDVOSB status and verify SAM is active before we respond.',
      'Agent A: ::certify{SDVOSB, SAM_active} > ::comply{SAM_renewal}',
      'Agent B: SDVOSB verified; SAM renewed through 2027-Q1.',
      'Agent B: ::report{certification}|status:active',
    ].join('\n'),
  },
  {
    id: 20,
    tag: 'seek-team',
    text: [
      'Agent A: Seek a cloud-migration partner on AWS GovCloud. If we find one, team with them.',
      'Agent A: ::seek{partner}[cloud_migration, AWS_GovCloud] > ::team{partner}',
      'Agent B: 3 candidates identified. Shortlisted Acme and Bluebird.',
      'Agent B: ::report{shortlist}|count:2',
    ].join('\n'),
  },
];

/**
 * Build a seeded PRNG for deterministic sampling.
 * Mulberry32 — small, fast, good enough for test sampling.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sample `n` distinct seed interactions using a deterministic PRNG.
 * If `n` >= available seeds, returns all of them in a deterministic order.
 */
export function sampleSeeds(n: number, seed: number = 1): SeedInteraction[] {
  const rng = mulberry32(seed);
  const pool = [...SEED_INTERACTIONS];
  // Fisher-Yates partial shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}

/**
 * Render a set of seeds into a single prompt block suitable for placing
 * in a system or user message. Numbered so the model can see the count.
 */
export function renderSeedsAsPrompt(seeds: SeedInteraction[]): string {
  const header = [
    'Below are example agent-to-agent interactions. Each example shows two agents',
    'exchanging instructions and results. Study them. You will then be asked to',
    'handle an unrelated task.',
    '',
  ].join('\n');
  const body = seeds
    .map((s, idx) => `Example ${idx + 1} (${s.tag}):\n${s.text}`)
    .join('\n\n---\n\n');
  return `${header}${body}\n`;
}
