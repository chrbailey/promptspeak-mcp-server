/**
 * Unit tests for the convergence-test measurement module and
 * end-to-end dry-run JSON shape.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { measure, _internals } from '../../../scripts/convergence/measure.js';
import { runHarness, grade, type RunReport } from '../../../scripts/convergence/run.js';

describe('convergence/measure', () => {
  it('pure English response -> zero rates', () => {
    const r = measure('This is an ordinary English sentence, no symbols at all.');
    expect(r.fragmentCount).toBe(0);
    expect(r.parsedCount).toBe(0);
    expect(r.spontaneousRate).toBe(0);
    expect(r.semanticValidityRate).toBeUndefined();
    expect(r.verbsUsed).toEqual([]);
    expect(r.unregisteredVerbs).toEqual([]);
  });

  it('pure PromptSpeak response with registered verbs -> ~100% adoption, 100% semantic', () => {
    const r = measure('::analyze{contract}[security]');
    expect(r.fragmentCount).toBe(1);
    expect(r.parsedCount).toBe(1);
    expect(r.spontaneousRate).toBeCloseTo(1.0, 5);
    expect(r.semanticValidityRate).toBe(1);
    expect(r.verbsUsed).toContain('analyze');
    expect(r.unregisteredVerbs).toEqual([]);
  });

  it('captures a chained expression as a single fragment', () => {
    const r = measure('::extract{data} > ::filter{rows}|min:10');
    expect(r.fragmentCount).toBe(1);
    expect(r.fragments[0].verbs.sort()).toEqual(['extract', 'filter']);
    expect(r.fragments[0].english).toContain('Extract');
    expect(r.fragments[0].english).toContain('Filter');
  });

  it('mixed response with one registered and one unregistered verb', () => {
    const r = measure('Use ::madeup_verb{x} and also ::analyze{doc}.');
    // Two candidates, both parse (parser accepts any identifier as verb).
    expect(r.parsedCount).toBe(2);
    expect(r.semanticallyValidCount).toBe(1);
    expect(r.semanticValidityRate).toBeCloseTo(0.5, 5);
    expect(r.unregisteredVerbs).toContain('madeup_verb');
    expect(r.verbsUsed).toEqual(expect.arrayContaining(['analyze', 'madeup_verb']));
  });

  it('syntactically invalid fragment is detected but NOT counted as PromptSpeak coverage', () => {
    // Missing close brace — parser must reject.
    const r = measure('Broken: ::analyze{doc');
    expect(r.fragmentCount).toBeGreaterThanOrEqual(1);
    // None of the candidates should have parsed cleanly.
    expect(r.parsedCount).toBe(0);
    expect(r.spontaneousRate).toBe(0);
    expect(r.semanticValidityRate).toBeUndefined();
    expect(r.fragments[0].parsed).toBe(false);
    expect(r.fragments[0].error).toBeDefined();
  });

  it('registered verb set covers all 36 core+procurement verbs', () => {
    // Sanity: our REGISTERED_VERBS set reflects the seed-verbs arrays.
    expect(_internals.REGISTERED_VERBS.size).toBe(36);
    for (const v of ['analyze', 'seek', 'bid', 'propose', 'certify', 'team']) {
      expect(_internals.REGISTERED_VERBS.has(v)).toBe(true);
    }
  });

  it('spontaneous rate is deterministic and <1 when fragments are embedded in prose', () => {
    const r1 = measure('I will ::analyze{contract}[security]. Then ::report{findings}.');
    const r2 = measure('I will ::analyze{contract}[security]. Then ::report{findings}.');
    expect(r1.spontaneousRate).toBe(r2.spontaneousRate);
    expect(r1.spontaneousRate).toBeLessThan(1);
    expect(r1.spontaneousRate).toBeGreaterThan(0.5);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Regression tests for the "silent drop of trailing actions" defect.
  //
  // Before the fix, the candidate extractor greedily consumed every
  // contiguous action-shaped run (possibly 4 actions chained without a
  // pipe), handed the entire string to parse(), and parse() silently
  // accepted only the leading action while dropping the trailing tokens.
  // That made unregistered trailing verbs invisible to the semantic check
  // and mis-graded adversarial inputs as STRETCH instead of FAIL.
  // ──────────────────────────────────────────────────────────────────────

  it('trailing unregistered actions with no pipe are all detected (no-whitespace)', () => {
    const r = measure('::analyze{data}::fakeverb{x}::anotherfake{y}::stillfake{z}');
    expect(r.unregisteredVerbs).toContain('fakeverb');
    expect(r.unregisteredVerbs).toContain('anotherfake');
    expect(r.unregisteredVerbs).toContain('stillfake');
    expect(r.semanticValidityRate).toBeDefined();
    expect(r.semanticValidityRate!).toBeLessThan(1.0);
  });

  it('trailing unregistered action with whitespace is detected', () => {
    const r = measure('::analyze{data} ::fakeverb{x}');
    expect(r.unregisteredVerbs).toContain('fakeverb');
    expect(r.semanticValidityRate).toBeDefined();
    expect(r.semanticValidityRate!).toBeLessThan(1.0);
  });

  it('valid pipe chain continues to grade at 100% semantic validity', () => {
    const r = measure('::analyze{data} > ::report{summary}');
    expect(r.semanticValidityRate).toBe(1);
    expect(r.verbsUsed).toEqual(expect.arrayContaining(['analyze', 'report']));
    expect(r.unregisteredVerbs).toEqual([]);
  });

  it('grade() routes the adversarial trigger to FAIL (semantic), not STRETCH', () => {
    const r = measure('::analyze{data}::fakeverb{x}::anotherfake{y}::stillfake{z}');
    const g = grade(r.spontaneousRate, r.semanticValidityRate);
    expect(g.summary).toBe('FAIL (semantic)');
    expect(g.semantic_ok).toBe(false);
    expect(g.stretch).toBe(false);
  });
});

describe('convergence/run --dry-run', () => {
  it('produces a valid JSON report shape with no network calls', async () => {
    const outPath = path.join(os.tmpdir(), `conv-smoke-${Date.now()}.json`);
    try {
      const report: RunReport = await runHarness({
        seeds: 5,
        provider: 'claude',
        tasks: 2,
        seed: 42,
        dryRun: true,
        help: false,
        out: outPath,
      });

      // Shape checks.
      expect(report.ran_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.providers_attempted).toEqual(['claude']);
      expect(report.trials.length).toBe(2); // 1 provider × 2 tasks
      expect(report.aggregate.length).toBe(1);

      for (const t of report.trials) {
        expect(t.status).toBe('ok');
        expect(t.measurement).toBeDefined();
        expect(t.measurement!.spontaneousRate).toBeGreaterThanOrEqual(0);
        expect(t.measurement!.spontaneousRate).toBeLessThanOrEqual(1);
        expect(t.grade).toBeDefined();
        expect(['STRETCH', 'TARGET', 'MINIMUM', 'BELOW_MINIMUM', 'FAIL (semantic)'])
          .toContain(t.grade!.summary);
      }

      // Aggregate sums line up.
      const agg = report.aggregate[0];
      expect(agg.ok + agg.skipped + agg.failed).toBe(agg.trials);
      expect(agg.mean_spontaneous).toBeGreaterThanOrEqual(0);
      expect(agg.mean_spontaneous).toBeLessThanOrEqual(1);
      expect(agg.grade_counts.STRETCH + agg.grade_counts.TARGET +
             agg.grade_counts.MINIMUM + agg.grade_counts.BELOW_MINIMUM +
             agg.grade_counts['FAIL (semantic)']).toBe(agg.ok);
    } finally {
      // Cleanup — runHarness writes nothing; main() writes. We don't call main here.
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    }
  });

  it('treats unconfigured provider as skipped rather than failed', async () => {
    const origOpenai = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const report = await runHarness({
        seeds: 5,
        provider: 'openai',
        tasks: 1,
        seed: 1,
        dryRun: false,  // live code path — but no key configured
        help: false,
      });
      expect(report.trials).toHaveLength(1);
      expect(report.trials[0].status).toBe('skipped');
      expect(report.trials[0].skip_reason).toBe('provider-not-configured');
      expect(report.notes.some(n => n.includes('openai'))).toBe(true);
    } finally {
      if (origOpenai !== undefined) process.env.OPENAI_API_KEY = origOpenai;
    }
  });
});
