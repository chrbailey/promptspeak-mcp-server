# Convergence Test Harness

Measures whether a naive LLM begins spontaneously producing PromptSpeak
constructs after processing a handful of mixed English / PromptSpeak
example interactions. This is the regression test behind the adoption
hypothesis stated in the PromptSpeak v0.2 design spec, section 8.

## What it does

1. Samples `N` seed interactions from `seeds.ts` (20 available).
   Each seed pairs a plain-English agent instruction with its
   PromptSpeak equivalent, drawn from all 5 core verb families plus
   procurement.
2. Samples `K` tasks from `tasks.ts` (10 available). Tasks are written
   agent-to-agent style so the naive model is free to answer in
   English, PromptSpeak, or a mix — no instruction is given.
3. Calls the selected provider(s) (Claude, OpenAI, Gemini, or all).
4. Runs every response through `measure.ts`, which reuses the real
   PromptSpeak lexer + parser + expander to score each response for:
   - `spontaneousRate` — fraction of response characters that are
     well-formed PromptSpeak fragments.
   - `semanticValidityRate` — fraction of those fragments whose verbs
     are in the registered verb set and whose `expand()` produces a
     non-empty English expansion.
5. Grades each response against the spec §8.3 thresholds
   (`>= 30%` minimum, `>= 50%` target, `>= 70%` stretch — with a
   semantic-validity floor of `>= 80%`) and writes a JSON report plus
   a markdown summary to stdout.

## How to run

```bash
# Default — live call to Anthropic, 10 seeds, 5 tasks
npm run convergence

# Different seed counts to chart the adoption curve
npm run convergence -- --seeds 5
npm run convergence -- --seeds 15
npm run convergence -- --seeds 20

# Multi-provider sweep (skips providers without API keys)
npm run convergence -- --provider all --tasks 5 --out data/conv-sweep.json

# Deterministic run
npm run convergence -- --seed 42 --seeds 10 --tasks 3
```

Provider API keys are read from the environment (loaded from `.env`
via `dotenv/config`):

- `ANTHROPIC_API_KEY` — required for `--provider claude` (or `all`)
- `OPENAI_API_KEY` — optional, enables `--provider openai`
- `GOOGLE_API_KEY` or `GEMINI_API_KEY` — optional, enables `--provider gemini`

A provider without a key is reported as `skipped` with
`reason=provider-not-configured` and the run continues.

## Dry-run mode

For CI and local smoke testing without network calls:

```bash
npm run convergence:dry-run -- --seeds 5 --tasks 2 --out /tmp/conv-smoke.json
```

In dry-run mode, `run.ts` feeds the prompt to a canned-response bank
in `fixtures.ts` keyed on the task id. The response strings cover a
range of adoption levels so the measurement + grading logic is
exercised end-to-end.

## Reading the report

Each run produces two artifacts:

- `data/convergence-<timestamp>.json` — full structured report:
  - `args` — CLI arguments used
  - `spec_thresholds` — the minimum/target/stretch thresholds from §8.3
  - `trials[]` — one entry per (provider, task); each entry carries
    the raw response, a full `MeasurementResult`, and a grade
  - `aggregate[]` — one row per provider summarizing ok/skipped/
    failed counts plus mean adoption and semantic-validity rates

- stdout — a markdown summary with the same data in table form.
  Look at the "Aggregate by provider" table for the headline
  numbers and the "Per-trial grades" table for the per-task detail.

## Interpreting the grade

| Grade           | Meaning                                                       |
|-----------------|---------------------------------------------------------------|
| `STRETCH`       | Spontaneous >= 70% AND semantic >= 80% — spec §8.3 stretch    |
| `TARGET`        | Spontaneous >= 50% AND semantic >= 80% — spec §8.3 target     |
| `MINIMUM`       | Spontaneous >= 30% AND semantic >= 80% — spec §8.3 minimum    |
| `BELOW_MINIMUM` | Adoption fell short; spec §8.4 flags as Axiom 2 violation     |
| `FAIL (semantic)` | Syntax copied but verbs unregistered or unexpandable;       |
|                 | spec §8.4 flags as Axiom 1 violation                          |

If adoption is inconsistent across providers, that is the §8.4
"grammar is model-specific" failure mode.

## Files

- `seeds.ts` — 20 seed interactions + deterministic sampler
- `tasks.ts` — 10 task prompts + sampler
- `measure.ts` — fragment extractor + rate calculator
- `providers.ts` — Anthropic / OpenAI / Gemini adapters (built-in `fetch`)
- `fixtures.ts` — canned responses used in `--dry-run` mode
- `run.ts` — CLI runner, aggregator, markdown renderer

Tests live at `tests/unit/convergence/measure.test.ts`.
