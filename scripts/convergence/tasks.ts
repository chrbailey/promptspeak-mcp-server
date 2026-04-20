/**
 * Convergence Test Harness — Task Bank
 *
 * Ten task prompts that could naturally be answered in English OR
 * in PromptSpeak. None of the prompts instructs the model to use
 * PromptSpeak. Each task is expressed in agent-to-agent style so a
 * naive model that has just read the seed corpus is free to pick
 * its format.
 */

export interface Task {
  id: number;
  tag: string;
  /** The user-turn content. Prepend a blank line before the task when building the final prompt. */
  prompt: string;
}

export const TASK_BANK: Task[] = [
  {
    id: 1,
    tag: 'doc-compare',
    prompt: [
      'Task: You have three vendor security questionnaires. Extract the key',
      'findings from each and compare them against our internal baseline',
      'requirements. Report which vendor best matches the baseline and why.',
    ].join('\n'),
  },
  {
    id: 2,
    tag: 'log-triage',
    prompt: [
      'Task: Given the attached production log excerpt, identify the probable',
      'root cause of the 504 errors, then draft a one-paragraph summary for',
      'the incident channel.',
    ].join('\n'),
  },
  {
    id: 3,
    tag: 'proposal-draft',
    prompt: [
      'Task: Draft a one-page response to the attached RFP section 4.2',
      '(technical approach). Pull relevant past-performance references from',
      'the attached portfolio and tailor the tone for a federal civilian',
      'audience.',
    ].join('\n'),
  },
  {
    id: 4,
    tag: 'metrics-explain',
    prompt: [
      'Task: Our weekly active users dropped 8% this week. Using the attached',
      'event-stream, reason about likely causes. Return a ranked list of',
      'hypotheses with confidence scores.',
    ].join('\n'),
  },
  {
    id: 5,
    tag: 'schema-validate',
    prompt: [
      'Task: Validate the attached payload against the v4 customer schema.',
      'If any fields are missing or malformed, produce an alert listing',
      'each field and the issue.',
    ].join('\n'),
  },
  {
    id: 6,
    tag: 'ticket-classify',
    prompt: [
      'Task: Classify the attached 120 support tickets by severity and',
      'product area. Summarize counts by bucket and highlight the top three',
      'areas by volume.',
    ].join('\n'),
  },
  {
    id: 7,
    tag: 'contract-review',
    prompt: [
      'Task: Review the attached vendor master service agreement. Surface',
      'any clause that weakens our standard indemnity, limits liability',
      'below the cap, or creates unreviewed data-handling obligations.',
    ].join('\n'),
  },
  {
    id: 8,
    tag: 'translate-migrate',
    prompt: [
      'Task: Transform the attached CSV export of 1,400 sales orders into',
      'a JSON batch payload our ERP ingestion endpoint accepts. Drop any',
      'row missing a customer_id and report the count dropped.',
    ].join('\n'),
  },
  {
    id: 9,
    tag: 'teaming-seek',
    prompt: [
      'Task: We are pursuing a data-modernization opportunity that requires',
      'past performance on AWS GovCloud. Identify suitable teaming partners',
      'from our partner database, shortlist the top three, and draft a',
      'teaming agreement outline for the best match.',
    ].join('\n'),
  },
  {
    id: 10,
    tag: 'release-check',
    prompt: [
      'Task: The team is proposing to release build 2026.04.18. Walk through',
      'the pre-release checklist, review outstanding blockers, and report',
      'which items remain open along with the owner of each.',
    ].join('\n'),
  },
];

/**
 * Deterministic sampling of tasks, using the same Mulberry32 as seeds.
 * Kept local so the convergence modules are self-contained.
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

export function sampleTasks(n: number, seed: number = 1): Task[] {
  const rng = mulberry32(seed + 1009); // offset so task and seed sampling diverge
  const pool = [...TASK_BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
