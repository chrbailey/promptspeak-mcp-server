#!/usr/bin/env npx tsx
// Quick validation test for the fixes:
// 1. totalCitations should no longer be undefined
// 2. Rate limiting delays should prevent 403 errors

import { handleLegalCheck } from './src/tools/ps_legal.js';

async function quickTest() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        QUICK VALIDATION TEST (4 scenarios)                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test 1: Classic SCOTUS (should verify)
  console.log('─'.repeat(79));
  console.log('TEST 1: Classic SCOTUS Citation (Brown v. Board)');
  console.log('─'.repeat(79));

  const result1 = await handleLegalCheck({
    content: `Brown v. Board of Education, 347 U.S. 483 (1954), established that
              separate educational facilities are inherently unequal.`,
    frame: '◇▶α',
    outputDestination: 'court',
    async: true,
  });

  console.log(`✅ totalCitations: ${result1.results.citationVerification?.totalCitations}`);
  console.log(`✅ verifiedCitations: ${JSON.stringify(result1.results.citationVerification?.verifiedCitations)}`);
  console.log(`✅ unverifiedCitations: ${JSON.stringify(result1.results.citationVerification?.unverifiedCitations)}`);
  console.log(`✅ verificationScore: ${(result1.results.citationVerification?.verificationScore ?? 0) * 100}%`);
  console.log(`✅ shouldHold: ${result1.shouldHold}`);
  console.log('');

  // Wait a bit before next test
  await new Promise(r => setTimeout(r, 1000));

  // Test 2: Fabricated citation (should NOT verify)
  console.log('─'.repeat(79));
  console.log('TEST 2: Fabricated Citation (should fail verification)');
  console.log('─'.repeat(79));

  const result2 = await handleLegalCheck({
    content: `As established in Smith v. Acme Corp, 999 U.S. 123 (2023),
              the doctrine of quantum liability applies to AI systems.`,
    frame: '◇▶α',
    outputDestination: 'court',
    async: true,
  });

  console.log(`✅ totalCitations: ${result2.results.citationVerification?.totalCitations}`);
  console.log(`✅ verifiedCitations: ${JSON.stringify(result2.results.citationVerification?.verifiedCitations)}`);
  console.log(`✅ unverifiedCitations: ${JSON.stringify(result2.results.citationVerification?.unverifiedCitations)}`);
  console.log(`✅ verificationScore: ${(result2.results.citationVerification?.verificationScore ?? 0) * 100}%`);
  console.log(`✅ shouldHold: ${result2.shouldHold} (expected: true)`);
  console.log('');

  await new Promise(r => setTimeout(r, 1000));

  // Test 3: Multiple citations (test rate limiting)
  console.log('─'.repeat(79));
  console.log('TEST 3: Multiple Citations (3 real cases - rate limiting test)');
  console.log('─'.repeat(79));

  const startTime = Date.now();
  const result3 = await handleLegalCheck({
    content: `
      Miranda v. Arizona, 384 U.S. 436 (1966), established the famous warnings.
      Gideon v. Wainwright, 372 U.S. 335 (1963), guaranteed right to counsel.
      Mapp v. Ohio, 367 U.S. 643 (1961), applied exclusionary rule to states.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    async: true,
  });
  const duration = Date.now() - startTime;

  console.log(`✅ totalCitations: ${result3.results.citationVerification?.totalCitations}`);
  console.log(`✅ verifiedCitations: ${result3.results.citationVerification?.verifiedCitations?.length}`);
  console.log(`✅ unverifiedCitations: ${result3.results.citationVerification?.unverifiedCitations?.length}`);
  console.log(`✅ verificationScore: ${(result3.results.citationVerification?.verificationScore ?? 0) * 100}%`);
  console.log(`✅ Duration: ${duration}ms (should be >1000ms if rate limiting is working)`);
  console.log(`✅ shouldHold: ${result3.shouldHold}`);
  console.log('');

  await new Promise(r => setTimeout(r, 1000));

  // Test 4: Privilege detection
  console.log('─'.repeat(79));
  console.log('TEST 4: Privileged Content (should trigger hold)');
  console.log('─'.repeat(79));

  const result4 = await handleLegalCheck({
    content: `ATTORNEY-CLIENT PRIVILEGED

              Our case has significant weaknesses. The internal emails show
              we knew about the defect before launch.`,
    frame: '◇▶α',
    outputDestination: 'court',
    async: true,
  });

  console.log(`✅ Privilege detected: ${result4.results.privilegeCheck ? 'YES' : 'NO'}`);
  console.log(`✅ shouldHold: ${result4.shouldHold} (expected: true)`);
  console.log(`✅ holdReasons: ${result4.holdReasons.join('; ')}`);
  console.log('');

  // Summary
  console.log('═'.repeat(79));
  console.log('VALIDATION SUMMARY');
  console.log('═'.repeat(79));

  const checks = [
    { name: 'totalCitations populated', pass: result1.results.citationVerification?.totalCitations !== undefined },
    { name: 'verifiedCitations array exists', pass: Array.isArray(result1.results.citationVerification?.verifiedCitations) },
    { name: 'Fabricated citation triggers hold', pass: result2.shouldHold === true },
    { name: 'Rate limiting active (>1s for 3 citations)', pass: duration > 1000 },
    { name: 'Privilege detection works', pass: result4.shouldHold === true },
  ];

  let passed = 0;
  for (const check of checks) {
    console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
    if (check.pass) passed++;
  }

  console.log('');
  console.log(`Result: ${passed}/${checks.length} checks passed`);
  console.log('═'.repeat(79));
}

quickTest().catch(console.error);
