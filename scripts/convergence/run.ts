#!/usr/bin/env tsx
/**
 * Convergence Test Harness — Runner
 *
 * Implements the protocol in §8.2 of the v0.2 design spec:
 *
 *   1. Build a prompt = N sampled seed interactions + one task prompt.
 *   2. Call the selected provider(s).
 *   3. Run the measurement module on each response.
 *   4. Aggregate adoption + semantic-validity rates per provider/seed-count.
 *   5. Write a JSON report and print a markdown summary to stdout.
 *
 * CLI:
 *   npm run convergence -- --seeds 10 --provider claude --tasks 5 --seed 42
 *   npm run convergence -- --dry-run --seeds 5 --tasks 2 --out /tmp/smoke.json
 *
 * Flags:
 *   --seeds     N (default 10). One of 5 | 10 | 15 | 20 per §8.2.
 *                 A bare `N` is also accepted.
 *   --provider  claude | openai | gemini | all (default claude).
 *   --tasks     number of tasks to sample (default 5, max 10).
 *   --seed      PRNG seed for deterministic sampling (default 1).
 *   --out       output JSON path (default data/convergence-<timestamp>.json).
 *   --dry-run   skip all network calls; use scripts/convergence/fixtures.ts.
 *   --help      show usage and exit.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import { sampleSeeds, renderSeedsAsPrompt, SEED_INTERACTIONS } from './seeds.js';
import { sampleTasks, TASK_BANK, type Task } from './tasks.js';
import { measure, type MeasurementResult } from './measure.js';
import {
  callProvider,
  type ProviderName,
  type ProviderResult,
  type ChatMessage,
  DEFAULT_MODELS,
} from './providers.js';
import { cannedProviderCall } from './fixtures.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'data');

const VALID_PROVIDERS: readonly ProviderName[] = ['claude', 'openai', 'gemini'] as const;

// ────────────────────────────────────────────────────────────────────────
// CLI parsing
// ────────────────────────────────────────────────────────────────────────

interface CliArgs {
  seeds: number;
  provider: 'claude' | 'openai' | 'gemini' | 'all';
  tasks: number;
  seed: number;
  out?: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    seeds: 10,
    provider: 'claude',
    tasks: 5,
    seed: 1,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--seeds': args.seeds = parseInt(next(), 10); break;
      case '--provider': {
        const v = next();
        if (v !== 'claude' && v !== 'openai' && v !== 'gemini' && v !== 'all') {
          throw new Error(`--provider must be claude|openai|gemini|all, got ${v}`);
        }
        args.provider = v;
        break;
      }
      case '--tasks': args.tasks = parseInt(next(), 10); break;
      case '--seed': args.seed = parseInt(next(), 10); break;
      case '--out': args.out = next(); break;
      case '--dry-run': args.dryRun = true; break;
      case '--help':
      case '-h': args.help = true; break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  if (![5, 10, 15, 20].includes(args.seeds)) {
    // Spec §8.2 uses 5/10/15/20, but we allow arbitrary N for experimentation.
    // Just clamp it to a sane range.
    if (args.seeds < 1 || args.seeds > SEED_INTERACTIONS.length) {
      throw new Error(`--seeds must be 1..${SEED_INTERACTIONS.length}`);
    }
  }
  if (args.tasks < 1 || args.tasks > TASK_BANK.length) {
    throw new Error(`--tasks must be 1..${TASK_BANK.length}`);
  }
  return args;
}

function printHelp(): void {
  process.stdout.write([
    'Convergence Test Harness',
    '',
    'Usage:',
    '  npm run convergence -- [options]',
    '  npm run convergence:dry-run -- [options]',
    '',
    'Options:',
    '  --seeds N         5|10|15|20 (default 10) — number of seed interactions',
    '  --provider X      claude|openai|gemini|all (default claude)',
    '  --tasks N         number of tasks to sample (default 5, max 10)',
    '  --seed N          PRNG seed for deterministic sampling (default 1)',
    '  --out PATH        JSON report path (default data/convergence-<ts>.json)',
    '  --dry-run         use bundled fixtures instead of live APIs',
    '  --help            print this message',
    '',
  ].join('\n'));
}

// ────────────────────────────────────────────────────────────────────────
// Prompt assembly
// ────────────────────────────────────────────────────────────────────────

function buildMessages(seedsBlock: string, task: Task): ChatMessage[] {
  const system = [
    'You are an expert agent assisting another agent with operational tasks.',
    'Be concise and direct. Do not explain your format choice.',
  ].join('\n');

  const user = [
    seedsBlock,
    '',
    'Now handle the following task. Respond in whatever format you think is',
    'most useful to a fellow agent.',
    '',
    task.prompt,
    '',
    `[[TASK_ID=${task.id}]]`,
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ────────────────────────────────────────────────────────────────────────
// Threshold grading (§8.3)
// ────────────────────────────────────────────────────────────────────────

export interface ThresholdGrade {
  minimum: boolean;      // >= 30%
  target: boolean;       // >= 50%
  stretch: boolean;      // >= 70%
  semantic_ok: boolean;  // >= 80% semantic validity — required for any "pass"
  summary: string;
}

export function grade(spontaneous: number, semantic: number | undefined): ThresholdGrade {
  const semantic_ok = (semantic ?? 0) >= 0.8;
  const summary =
    !semantic_ok ? 'FAIL (semantic)' :
    spontaneous >= 0.7 ? 'STRETCH' :
    spontaneous >= 0.5 ? 'TARGET' :
    spontaneous >= 0.3 ? 'MINIMUM' :
    'BELOW_MINIMUM';
  return {
    minimum: semantic_ok && spontaneous >= 0.3,
    target: semantic_ok && spontaneous >= 0.5,
    stretch: semantic_ok && spontaneous >= 0.7,
    semantic_ok,
    summary,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Main loop
// ────────────────────────────────────────────────────────────────────────

export interface TrialResult {
  provider: ProviderName;
  task_id: number;
  task_tag: string;
  seed_count: number;
  provider_model: string | null;
  status: 'ok' | 'skipped' | 'failed';
  response?: string;
  measurement?: MeasurementResult;
  skip_reason?: string;
  failure_reason?: string;
  latency_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  grade?: ThresholdGrade;
}

export interface AggregateRow {
  provider: ProviderName;
  seed_count: number;
  trials: number;
  ok: number;
  skipped: number;
  failed: number;
  mean_spontaneous: number;
  mean_semantic: number | null;
  grade_counts: Record<ThresholdGrade['summary'], number>;
}

export interface RunReport {
  ran_at: string;
  args: CliArgs;
  spec_thresholds: { minimum: 0.3; target: 0.5; stretch: 0.7; semantic_floor: 0.8 };
  providers_attempted: ProviderName[];
  trials: TrialResult[];
  aggregate: AggregateRow[];
  notes: string[];
}

function providersFromArgs(args: CliArgs): ProviderName[] {
  if (args.provider === 'all') return [...VALID_PROVIDERS];
  return [args.provider];
}

async function runOneTrial(
  provider: ProviderName,
  task: Task,
  messages: ChatMessage[],
  dryRun: boolean
): Promise<ProviderResult> {
  if (dryRun) return cannedProviderCall(provider, messages);
  return callProvider(provider, messages);
}

export async function runHarness(args: CliArgs): Promise<RunReport> {
  const seeds = sampleSeeds(args.seeds, args.seed);
  const tasks = sampleTasks(args.tasks, args.seed);
  const seedsBlock = renderSeedsAsPrompt(seeds);
  const providers = providersFromArgs(args);

  const trials: TrialResult[] = [];
  const notes: string[] = [];

  for (const provider of providers) {
    for (const task of tasks) {
      const messages = buildMessages(seedsBlock, task);
      const result = await runOneTrial(provider, task, messages, args.dryRun);

      if (!result.ok) {
        if ('skipped' in result && result.skipped) {
          trials.push({
            provider,
            task_id: task.id,
            task_tag: task.tag,
            seed_count: args.seeds,
            provider_model: null,
            status: 'skipped',
            skip_reason: result.reason,
          });
          continue;
        }
        trials.push({
          provider,
          task_id: task.id,
          task_tag: task.tag,
          seed_count: args.seeds,
          provider_model: null,
          status: 'failed',
          failure_reason: (result as { reason: string }).reason,
          latency_ms: 'latency_ms' in result ? result.latency_ms : undefined,
        });
        continue;
      }

      const m = measure(result.response);
      const g = grade(m.spontaneousRate, m.semanticValidityRate);
      trials.push({
        provider,
        task_id: task.id,
        task_tag: task.tag,
        seed_count: args.seeds,
        provider_model: result.model,
        status: 'ok',
        response: result.response,
        measurement: m,
        latency_ms: result.latency_ms,
        tokens_in: result.tokens_in,
        tokens_out: result.tokens_out,
        grade: g,
      });
    }
  }

  // Aggregate per provider + seed-count.
  const aggregate: AggregateRow[] = [];
  for (const provider of providers) {
    const rowTrials = trials.filter(t => t.provider === provider);
    const oks = rowTrials.filter(t => t.status === 'ok');
    const skips = rowTrials.filter(t => t.status === 'skipped');
    const fails = rowTrials.filter(t => t.status === 'failed');

    if (skips.length === rowTrials.length && rowTrials.length > 0) {
      notes.push(`Provider "${provider}" skipped all ${rowTrials.length} trials — ${skips[0].skip_reason ?? 'no api key configured'}.`);
    }

    const spontaneousValues = oks.map(t => t.measurement!.spontaneousRate);
    const semanticValues = oks
      .map(t => t.measurement!.semanticValidityRate)
      .filter((x): x is number => typeof x === 'number');
    const meanSpontaneous = spontaneousValues.length
      ? spontaneousValues.reduce((a, b) => a + b, 0) / spontaneousValues.length
      : 0;
    const meanSemantic = semanticValues.length
      ? semanticValues.reduce((a, b) => a + b, 0) / semanticValues.length
      : null;

    const gradeCounts: Record<ThresholdGrade['summary'], number> = {
      STRETCH: 0,
      TARGET: 0,
      MINIMUM: 0,
      BELOW_MINIMUM: 0,
      'FAIL (semantic)': 0,
    };
    for (const t of oks) {
      if (t.grade) gradeCounts[t.grade.summary]++;
    }

    aggregate.push({
      provider,
      seed_count: args.seeds,
      trials: rowTrials.length,
      ok: oks.length,
      skipped: skips.length,
      failed: fails.length,
      mean_spontaneous: meanSpontaneous,
      mean_semantic: meanSemantic,
      grade_counts: gradeCounts,
    });
  }

  return {
    ran_at: new Date().toISOString(),
    args,
    spec_thresholds: { minimum: 0.3, target: 0.5, stretch: 0.7, semantic_floor: 0.8 },
    providers_attempted: providers,
    trials,
    aggregate,
    notes,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Report rendering
// ────────────────────────────────────────────────────────────────────────

function pct(x: number | null | undefined): string {
  if (x === null || x === undefined) return '   n/a';
  return `${(x * 100).toFixed(1).padStart(5)}%`;
}

export function renderMarkdown(report: RunReport): string {
  const lines: string[] = [];
  lines.push('# Convergence Test Report');
  lines.push('');
  lines.push(`- Ran at: ${report.ran_at}`);
  lines.push(`- Seed count: ${report.args.seeds}`);
  lines.push(`- Tasks sampled: ${report.args.tasks}`);
  lines.push(`- PRNG seed: ${report.args.seed}`);
  lines.push(`- Providers attempted: ${report.providers_attempted.join(', ')}`);
  lines.push(`- Dry run: ${report.args.dryRun ? 'yes (canned fixtures)' : 'no (live API)'}`);
  lines.push('');
  lines.push('## Thresholds (spec §8.3)');
  lines.push('');
  lines.push('| Threshold | Spontaneous rate | Semantic floor |');
  lines.push('|-----------|------------------|----------------|');
  lines.push(`| Minimum   | >= 30%           | >= 80%         |`);
  lines.push(`| Target    | >= 50%           | >= 80%         |`);
  lines.push(`| Stretch   | >= 70%           | >= 80%         |`);
  lines.push('');
  lines.push('## Aggregate by provider');
  lines.push('');
  lines.push('| Provider | Seeds | OK | Skip | Fail | Mean spontaneous | Mean semantic | Grade distribution |');
  lines.push('|----------|-------|----|------|------|------------------|---------------|--------------------|');
  for (const row of report.aggregate) {
    const gd = Object.entries(row.grade_counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}:${n}`)
      .join(' ') || '-';
    lines.push(`| ${row.provider} | ${row.seed_count} | ${row.ok} | ${row.skipped} | ${row.failed} | ${pct(row.mean_spontaneous)} | ${pct(row.mean_semantic)} | ${gd} |`);
  }
  lines.push('');
  if (report.notes.length > 0) {
    lines.push('## Notes');
    lines.push('');
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  lines.push('## Per-trial grades');
  lines.push('');
  lines.push('| Provider | Task | Seeds | Spont. | Semantic | Grade |');
  lines.push('|----------|------|-------|--------|----------|-------|');
  for (const t of report.trials) {
    if (t.status !== 'ok' || !t.measurement || !t.grade) {
      lines.push(`| ${t.provider} | ${t.task_tag} | ${t.seed_count} | - | - | ${t.status} |`);
      continue;
    }
    lines.push(`| ${t.provider} | ${t.task_tag} | ${t.seed_count} | ${pct(t.measurement.spontaneousRate)} | ${pct(t.measurement.semanticValidityRate)} | ${t.grade.summary} |`);
  }
  lines.push('');
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────
// Entry point
// ────────────────────────────────────────────────────────────────────────

function defaultOutPath(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-');
  return path.join(DEFAULT_OUT_DIR, `convergence-${ts}.json`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n\n`);
    printHelp();
    process.exit(2);
  }
  if (args.help) {
    printHelp();
    return;
  }

  const outPath = args.out ?? defaultOutPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const report = await runHarness(args);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  process.stdout.write(renderMarkdown(report));
  process.stdout.write(`\nReport written to ${outPath}\n`);
}

// Run when invoked directly. ESM-safe check.
const isDirect = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isDirect) {
  main().catch((e) => {
    process.stderr.write(`fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exit(1);
  });
}
