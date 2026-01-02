#!/usr/bin/env npx tsx
// =============================================================================
// LEGAL MVP TEST SUITE
// =============================================================================
// Tests the Legal MVP citation verification pipeline:
//   1. Citation extraction from text
//   2. Format validation (structural, semantic, chain)
//   3. CourtListener API verification
//   4. Legal pre-flight checks
//   5. Hold decision logic
//
// Run with: npx tsx legal-mvp-test.ts
// =============================================================================

import {
  handleLegalVerify,
  handleLegalVerifyBatch,
  handleLegalExtract,
  handleLegalCheck,
  handleLegalConfig,
  handleLegalStats,
} from './src/tools/ps_legal.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => Promise<void> | void): void {
  console.log(`\n📋 Testing: ${name}`);
  try {
    const result = fn();
    if (result instanceof Promise) {
      result
        .then(() => {
          console.log(`  ✅ PASSED`);
          testsPassed++;
        })
        .catch((err) => {
          console.log(`  ❌ FAILED: ${err.message}`);
          testsFailed++;
        });
    } else {
      console.log(`  ✅ PASSED`);
      testsPassed++;
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${(err as Error).message}`);
    testsFailed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// =============================================================================
// TEST DATA
// =============================================================================

const KNOWN_REAL_CITATIONS = [
  'Brown v. Board of Education, 347 U.S. 483 (1954)',
  'Miranda v. Arizona, 384 U.S. 436 (1966)',
  'Marbury v. Madison, 5 U.S. 137 (1803)',
];

const LIKELY_FAKE_CITATIONS = [
  'Smith v. Jones, 999 F.3d 999 (9th Cir. 2030)', // Future date
  'Doe v. Roe, 500 F.5th 123 (2025)', // F.5th doesn't exist yet
];

const SAMPLE_LEGAL_BRIEF = `
MOTION FOR SUMMARY JUDGMENT

I. INTRODUCTION

This motion is brought pursuant to Fed. R. Civ. P. 56(a). As established in
Brown v. Board of Education, 347 U.S. 483 (1954), separate educational
facilities are inherently unequal. This principle was reaffirmed in
subsequent decisions including 500 F.3d 123 (9th Cir. 2020).

The defendant's actions constitute a clear violation of established precedent.
See Miranda v. Arizona, 384 U.S. 436 (1966) (establishing rights that must
be read to suspects).

PRIVILEGED AND CONFIDENTIAL - ATTORNEY WORK PRODUCT

II. STATEMENT OF FACTS

[Redacted for privilege]

III. ARGUMENT

Plaintiffs submit that summary judgment is appropriate...
`;

// =============================================================================
// TESTS
// =============================================================================

async function runTests(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('        LEGAL MVP TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Citation Extraction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 1: CITATION EXTRACTION\n');

  test('Extract citations from legal brief', () => {
    const result = handleLegalExtract({ content: SAMPLE_LEGAL_BRIEF });
    console.log(`  Found ${result.count} citations:`, result.citations);
    assert(result.count >= 2, `Expected at least 2 citations, got ${result.count}`);
    assert(
      result.citations.some(c => c.includes('347 U.S. 483')),
      'Should find Brown v. Board citation'
    );
  });

  test('Extract citations from simple text', () => {
    const result = handleLegalExtract({
      content: 'The court cited 123 F.3d 456 and 789 U.S. 101.',
    });
    console.log(`  Found ${result.count} citations:`, result.citations);
    assert(result.count >= 2, `Expected at least 2 citations, got ${result.count}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Single Citation Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 2: SINGLE CITATION VERIFICATION\n');

  test('Verify known real citation format', async () => {
    const result = await handleLegalVerify({
      citation: '347 U.S. 483',
      includeDetails: true,
    });
    console.log('  Result:', JSON.stringify(result, null, 2));
    assert(result.formatValidation.valid, 'Format should be valid');
    assert(result.formatValidation.confidenceScore > 0.5, 'Confidence should be reasonable');
    console.log(`  Source: ${result.source}`);
    console.log(`  Verified: ${result.verified}`);
  });

  test('Verify likely fake citation (future date)', async () => {
    const result = await handleLegalVerify({
      citation: 'Smith v. Jones, 999 F.3d 999 (9th Cir. 2030)',
      includeDetails: true,
    });
    console.log('  Result:', JSON.stringify(result, null, 2));
    // Should have format issues due to future date
    console.log(`  Issues:`, result.formatValidation.issues);
    console.log(`  Verified: ${result.verified}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Batch Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 3: BATCH VERIFICATION\n');

  test('Verify batch of citations', async () => {
    const result = await handleLegalVerifyBatch({
      citations: ['347 U.S. 483', '384 U.S. 436', '999 F.5th 999'],
    });
    console.log('  Summary:', result.summary);
    assert(result.summary.total === 3, 'Should have 3 citations');
    console.log(`  Format valid: ${result.summary.formatValid}/${result.summary.total}`);
    console.log(`  Verified via CourtListener: ${result.summary.verified}/${result.summary.total}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Full Legal Pre-Flight Check
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 4: FULL LEGAL PRE-FLIGHT CHECK\n');

  test('Legal pre-flight check on brief (internal)', async () => {
    const result = await handleLegalCheck({
      content: SAMPLE_LEGAL_BRIEF,
      frame: '◇▶α',
      outputDestination: 'internal',
    });
    console.log('  Is Legal Domain:', result.results.isLegalDomain);
    console.log('  Should Hold:', result.shouldHold);
    console.log('  Hold Reasons:', result.holdReasons);
    console.log('  Recommendations:', result.recommendations);

    // Should detect privilege indicators
    if (result.results.privilegeCheck) {
      console.log('  Privilege Risk Score:', result.results.privilegeCheck.riskScore);
      console.log('  Privilege Indicators:', result.results.privilegeCheck.privilegeIndicators.length);
    }
  });

  test('Legal pre-flight check (to opposing counsel - high risk)', async () => {
    const result = await handleLegalCheck({
      content: SAMPLE_LEGAL_BRIEF,
      frame: '◇▶α',
      outputDestination: 'opposing_counsel',
    });
    console.log('  Should Hold:', result.shouldHold);
    console.log('  Hold Reasons:', result.holdReasons);

    // Should DEFINITELY hold for opposing counsel with privilege markers
    assert(result.shouldHold, 'Should hold when sending privileged content to opposing counsel');
  });

  test('Legal pre-flight check (to court)', async () => {
    const result = await handleLegalCheck({
      content: SAMPLE_LEGAL_BRIEF,
      frame: '◇▶α',
      outputDestination: 'court',
    });
    console.log('  Should Hold:', result.shouldHold);
    console.log('  Hold Reasons:', result.holdReasons);
    console.log('  Citation Verification:', result.results.citationVerification);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Configuration
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 5: CONFIGURATION\n');

  test('Get legal config', () => {
    const result = handleLegalConfig({ action: 'get' });
    console.log('  Current config:', result.config);
    assert(result.success, 'Should succeed');
  });

  test('Set legal config (disable privilege detection)', () => {
    const result = handleLegalConfig({
      action: 'set',
      config: {
        enablePrivilegeDetection: false,
      },
    });
    console.log('  Updated config:', result.config);
    assert(!result.config.enablePrivilegeDetection, 'Privilege detection should be disabled');

    // Re-enable for other tests
    handleLegalConfig({
      action: 'set',
      config: { enablePrivilegeDetection: true },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Statistics
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n📦 SECTION 6: STATISTICS\n');

  test('Get legal stats', () => {
    const result = handleLegalStats();
    console.log('  CourtListener enabled:', result.courtListener.enabled);
    console.log('  CourtListener stats:', result.courtListener.stats);
  });

  // Wait for async tests to complete
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('        TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  ✅ Passed: ${testsPassed}`);
  console.log(`  ❌ Failed: ${testsFailed}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
