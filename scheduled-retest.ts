#!/usr/bin/env npx tsx
// =============================================================================
// SCHEDULED RETEST - Legal MVP Comprehensive Test Suite
// =============================================================================
// This script is designed to run automatically after CourtListener quota resets.
// Results are saved to scheduled-retest-results.json and scheduled-retest-report.md
// =============================================================================

import { handleLegalCheck } from './src/tools/ps_legal.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = '/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server';

interface TestCase {
  name: string;
  description: string;
  content: string;
  expectedVerify: boolean; // true = real citations that should verify
}

const testCases: TestCase[] = [
  {
    name: "Brown v. Board (SCOTUS)",
    description: "Landmark 1954 desegregation case",
    content: "Brown v. Board of Education, 347 U.S. 483 (1954), established that separate educational facilities are inherently unequal.",
    expectedVerify: true,
  },
  {
    name: "Miranda v. Arizona (SCOTUS)",
    description: "1966 Miranda rights case",
    content: "Miranda v. Arizona, 384 U.S. 436 (1966), established the requirement for police to inform suspects of their rights.",
    expectedVerify: true,
  },
  {
    name: "Marbury v. Madison (SCOTUS)",
    description: "1803 judicial review case",
    content: "Marbury v. Madison, 5 U.S. 137 (1803), established the principle of judicial review.",
    expectedVerify: true,
  },
  {
    name: "NYT v. Sullivan (SCOTUS)",
    description: "1964 First Amendment case",
    content: "New York Times Co. v. Sullivan, 376 U.S. 254 (1964), established the actual malice standard for defamation.",
    expectedVerify: true,
  },
  {
    name: "Citizens United (SCOTUS)",
    description: "2010 corporate speech case",
    content: "Citizens United v. FEC, 558 U.S. 310 (2010), addressed corporate political speech rights.",
    expectedVerify: true,
  },
  {
    name: "Celotex v. Catrett (SCOTUS)",
    description: "1986 summary judgment standard",
    content: "Celotex Corp. v. Catrett, 477 U.S. 317 (1986), established the summary judgment standard.",
    expectedVerify: true,
  },
  {
    name: "Fabricated Case 1",
    description: "Completely made up citation",
    content: "Smith v. Acme Corporation, 999 U.S. 123 (2023), established the doctrine of quantum liability.",
    expectedVerify: false,
  },
  {
    name: "Fabricated Case 2",
    description: "Another fake citation",
    content: "Johnson v. TechCorp, 888 U.S. 456 (2022), created the digital trespass per se rule.",
    expectedVerify: false,
  },
  {
    name: "Fabricated Case 3",
    description: "Fake circuit court case",
    content: "Robertson v. DataMine Inc., 42 F.4th 999 (9th Cir. 2023), applied AI liability standards.",
    expectedVerify: false,
  },
  {
    name: "Privileged Content",
    description: "Attorney-client privileged content",
    content: "ATTORNEY-CLIENT PRIVILEGED\n\nOur case has significant weaknesses. The internal emails show we knew about the defect.",
    expectedVerify: false, // N/A - testing privilege detection
  },
  {
    name: "Work Product",
    description: "Attorney work product to opposing counsel",
    content: "ATTORNEY WORK PRODUCT\n\nDeposition strategy: Focus on what CEO knew and when. Key impeachment points listed below.",
    expectedVerify: false, // N/A - testing privilege detection
  },
  {
    name: "Mixed Real/Fake",
    description: "Real case mixed with fabricated one",
    content: "Gideon v. Wainwright, 372 U.S. 335 (1963), guaranteed right to counsel. This was extended in Westbrook v. MediaCorp, 445 U.S. 678 (1982).",
    expectedVerify: false, // Mixed - should partially verify
  },
];

interface TestResult {
  name: string;
  description: string;
  timestamp: string;
  totalCitations: number | undefined;
  verifiedCitations: string[];
  unverifiedCitations: string[];
  verificationScore: number;
  shouldHold: boolean;
  holdReasons: string[];
  privilegeDetected: boolean;
  apiErrors: number;
  duration: number;
  expectedVerify: boolean;
  matchedExpectation: boolean;
}

async function runScheduledTests(): Promise<void> {
  const startTime = new Date();
  const results: TestResult[] = [];
  let apiErrorCount = 0;

  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        SCHEDULED RETEST - CourtListener Integration                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log(`Started: ${startTime.toISOString()}`);
  console.log('');

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`[${i + 1}/${testCases.length}] Testing: ${test.name}...`);

    const testStart = Date.now();

    try {
      const result = await handleLegalCheck({
        content: test.content,
        frame: '◇▶α',
        outputDestination: test.name.includes('Work Product') ? 'opposing_counsel' : 'court',
        async: true,
      });

      const duration = Date.now() - testStart;
      const cv = result.results.citationVerification;

      // Count API errors from unverified citations (heuristic)
      const hadApiError = cv && cv.unverifiedCitations.length > 0 && cv.verifiedCitations.length === 0;
      if (hadApiError && test.expectedVerify) apiErrorCount++;

      const verificationScore = cv?.verificationScore ?? 1;
      const matchedExpectation = test.expectedVerify
        ? verificationScore > 0.5
        : verificationScore <= 0.5 || !cv;

      results.push({
        name: test.name,
        description: test.description,
        timestamp: new Date().toISOString(),
        totalCitations: cv?.totalCitations,
        verifiedCitations: cv?.verifiedCitations ?? [],
        unverifiedCitations: cv?.unverifiedCitations ?? [],
        verificationScore,
        shouldHold: result.shouldHold,
        holdReasons: result.holdReasons,
        privilegeDetected: !!result.results.privilegeCheck,
        apiErrors: hadApiError ? 1 : 0,
        duration,
        expectedVerify: test.expectedVerify,
        matchedExpectation,
      });

      const status = matchedExpectation ? '✅' : '⚠️';
      console.log(`   ${status} Score: ${(verificationScore * 100).toFixed(0)}% | Hold: ${result.shouldHold} | ${duration}ms`);

    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
      results.push({
        name: test.name,
        description: test.description,
        timestamp: new Date().toISOString(),
        totalCitations: undefined,
        verifiedCitations: [],
        unverifiedCitations: [],
        verificationScore: 0,
        shouldHold: true,
        holdReasons: [`Error: ${error}`],
        privilegeDetected: false,
        apiErrors: 1,
        duration: Date.now() - testStart,
        expectedVerify: test.expectedVerify,
        matchedExpectation: false,
      });
    }

    // Wait between tests to respect rate limits
    if (i < testCases.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Generate summary
  const endTime = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();

  const summary = {
    runDate: startTime.toISOString(),
    completedDate: endTime.toISOString(),
    totalDurationMs: totalDuration,
    totalTests: results.length,
    testsMatchedExpectation: results.filter(r => r.matchedExpectation).length,
    testsWithApiErrors: apiErrorCount,
    realCitationsVerified: results.filter(r => r.expectedVerify && r.verificationScore > 0.5).length,
    fakeCitationsRejected: results.filter(r => !r.expectedVerify && r.name.includes('Fabricated') && r.verificationScore <= 0.5).length,
    privilegeDetectionWorked: results.filter(r => r.privilegeDetected).length,
    results,
  };

  // Save JSON results
  const jsonPath = join(OUTPUT_DIR, 'scheduled-retest-results.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`\n📄 JSON results saved to: ${jsonPath}`);

  // Generate markdown report
  const report = generateMarkdownReport(summary);
  const mdPath = join(OUTPUT_DIR, 'scheduled-retest-report.md');
  writeFileSync(mdPath, report);
  console.log(`📄 Markdown report saved to: ${mdPath}`);

  // Print summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                              SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(`Matched Expectations: ${summary.testsMatchedExpectation}/${summary.totalTests}`);
  console.log(`API Errors: ${summary.testsWithApiErrors}`);
  console.log(`Real Citations Verified: ${summary.realCitationsVerified}/6`);
  console.log(`Fake Citations Rejected: ${summary.fakeCitationsRejected}/3`);
  console.log(`Privilege Detection: ${summary.privilegeDetectionWorked}/2`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  // Exit with appropriate code
  const successRate = summary.testsMatchedExpectation / summary.totalTests;
  if (successRate >= 0.8 && summary.testsWithApiErrors === 0) {
    console.log('\n✅ TEST SUITE PASSED');
    process.exit(0);
  } else if (summary.testsWithApiErrors > 3) {
    console.log('\n⚠️  API ERRORS DETECTED - May need to wait longer for quota reset');
    process.exit(2);
  } else {
    console.log('\n⚠️  SOME TESTS FAILED - Review report for details');
    process.exit(1);
  }
}

function generateMarkdownReport(summary: any): string {
  const lines: string[] = [
    '# Scheduled Retest Results',
    '',
    `**Run Date:** ${summary.runDate}`,
    `**Completed:** ${summary.completedDate}`,
    `**Duration:** ${(summary.totalDurationMs / 1000).toFixed(1)} seconds`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tests | ${summary.totalTests} |`,
    `| Matched Expectations | ${summary.testsMatchedExpectation}/${summary.totalTests} (${((summary.testsMatchedExpectation / summary.totalTests) * 100).toFixed(0)}%) |`,
    `| API Errors | ${summary.testsWithApiErrors} |`,
    `| Real Citations Verified | ${summary.realCitationsVerified}/6 |`,
    `| Fake Citations Rejected | ${summary.fakeCitationsRejected}/3 |`,
    `| Privilege Detection | ${summary.privilegeDetectionWorked}/2 |`,
    '',
    '## Detailed Results',
    '',
    '| Test | Score | Hold | Matched | Duration |',
    '|------|-------|------|---------|----------|',
  ];

  for (const r of summary.results) {
    const status = r.matchedExpectation ? '✅' : '❌';
    lines.push(`| ${r.name} | ${(r.verificationScore * 100).toFixed(0)}% | ${r.shouldHold ? 'YES' : 'NO'} | ${status} | ${r.duration}ms |`);
  }

  lines.push('');
  lines.push('## Interpretation');
  lines.push('');

  if (summary.testsWithApiErrors > 0) {
    lines.push(`⚠️ **${summary.testsWithApiErrors} tests may have been affected by API errors.** If CourtListener returned 403 errors, real citations may appear unverified.`);
    lines.push('');
  }

  if (summary.realCitationsVerified >= 5) {
    lines.push('✅ **Citation verification is working well.** Most real citations were successfully verified via CourtListener API.');
  } else if (summary.realCitationsVerified >= 3) {
    lines.push('⚠️ **Citation verification is partially working.** Some real citations verified, but coverage is incomplete.');
  } else {
    lines.push('❌ **Citation verification may not be working.** Check API token and quota status.');
  }

  lines.push('');
  lines.push('---');
  lines.push('*Report generated automatically by scheduled-retest.ts*');

  return lines.join('\n');
}

runScheduledTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
