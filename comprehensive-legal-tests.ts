#!/usr/bin/env npx tsx
// =============================================================================
// COMPREHENSIVE LEGAL MVP TESTS WITH TRUTH VALIDATION
// =============================================================================
// 12 diverse test scenarios to stress-test the legal review system
// =============================================================================

import { handleLegalCheck } from './src/tools/ps_legal.js';

interface TestCase {
  name: string;
  description: string;
  content: string;
  frame: string;
  outputDestination: 'internal' | 'court' | 'client' | 'opposing_counsel';
  expectedBehavior: {
    shouldHold: boolean;
    citationsToFind: number;
    privilegeRisk: 'low' | 'medium' | 'high';
    fabricationRisk: 'low' | 'medium' | 'high';
  };
}

const testCases: TestCase[] = [
  // ==========================================================================
  // TEST 1: Classic Supreme Court Citations (All Real)
  // ==========================================================================
  {
    name: "Classic SCOTUS Citations",
    description: "Well-known Supreme Court cases that should all verify",
    content: `
      The constitutional framework for equal protection was established in
      Brown v. Board of Education, 347 U.S. 483 (1954), which overturned
      the "separate but equal" doctrine from Plessy v. Ferguson, 163 U.S. 537 (1896).

      The right to counsel was established in Gideon v. Wainwright, 372 U.S. 335 (1963),
      and the famous Miranda warnings derive from Miranda v. Arizona, 384 U.S. 436 (1966).
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 4,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 2: Fabricated Citations (Should Flag)
  // ==========================================================================
  {
    name: "Fabricated Citations",
    description: "Completely made-up cases that should NOT verify",
    content: `
      As established in Smith v. Acme Corporation, 567 U.S. 999 (2019),
      the doctrine of digital trespass requires proof of intentional access.

      This was further clarified in Johnson v. TechCorp, 589 U.S. 123 (2021),
      where the Court held that automated scraping constitutes trespass per se.

      See also Robertson v. DataMine Inc., 42 F.4th 789 (9th Cir. 2022).
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: true,
      citationsToFind: 3,
      privilegeRisk: 'low',
      fabricationRisk: 'high'
    }
  },

  // ==========================================================================
  // TEST 3: Mixed Real and Fake Citations
  // ==========================================================================
  {
    name: "Mixed Real/Fake Citations",
    description: "Some real cases mixed with fabrications",
    content: `
      The First Amendment protections outlined in New York Times v. Sullivan,
      376 U.S. 254 (1964), established the actual malice standard.

      This was extended in Westbrook v. MediaCorp, 445 U.S. 678 (1982),
      to cover digital publications. [NOTE: This case is fabricated]

      The Supreme Court in Citizens United v. FEC, 558 U.S. 310 (2010),
      addressed corporate speech rights.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: true,
      citationsToFind: 3,
      privilegeRisk: 'low',
      fabricationRisk: 'medium'
    }
  },

  // ==========================================================================
  // TEST 4: Privileged Content to Court (Should Block)
  // ==========================================================================
  {
    name: "Privileged Content to Court",
    description: "Attorney-client privileged content being sent to court",
    content: `
      ATTORNEY-CLIENT PRIVILEGED AND CONFIDENTIAL

      Dear Client,

      After reviewing your situation, I advise that we should settle because
      our liability exposure is significant. The internal documents show we
      knew about the defect as early as January 2023.

      This strategy memo outlines our weaknesses:
      1. The smoking gun email from the CEO
      2. The suppressed safety report
      3. The whistleblower testimony

      Please destroy this memo after reading.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: true,
      citationsToFind: 0,
      privilegeRisk: 'high',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 5: Federal Circuit Court Citations
  // ==========================================================================
  {
    name: "Federal Circuit Citations",
    description: "Real federal appellate court citations",
    content: `
      In the Ninth Circuit, qualified immunity analysis follows
      Saucier v. Katz, 533 U.S. 194 (2001), as modified by
      Pearson v. Callahan, 555 U.S. 223 (2009).

      The Eleventh Circuit in Fils v. City of Aventura, 647 F.3d 1272
      (11th Cir. 2011), applied these standards to excessive force claims.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 3,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 6: Contract with Deadline Extraction
  // ==========================================================================
  {
    name: "Contract Deadlines",
    description: "Legal document with multiple deadlines to extract",
    content: `
      ORDER SETTING CASE MANAGEMENT DEADLINES

      IT IS HEREBY ORDERED that:

      1. Initial disclosures shall be exchanged within 14 days of this order.

      2. Written discovery requests shall be served no later than 60 days
         before the discovery cutoff.

      3. Expert witness disclosures are due 90 days before trial.

      4. Dispositive motions must be filed by March 15, 2025.

      5. The pretrial conference is set for April 1, 2025 at 9:00 AM.

      6. Trial is scheduled to commence May 5, 2025.

      SO ORDERED this 15th day of January, 2025.
    `,
    frame: '◇▶α',
    outputDestination: 'internal',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 0,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 7: Work Product to Opposing Counsel (Should Block)
  // ==========================================================================
  {
    name: "Work Product to Opposing",
    description: "Attorney work product being sent to opposing counsel",
    content: `
      ATTORNEY WORK PRODUCT - LITIGATION STRATEGY

      Deposition Strategy for CEO:
      - Focus on what he knew and when
      - Pin down timeline before showing documents
      - Key impeachment: his 2022 email contradicts testimony

      Weaknesses in their case:
      - Statute of limitations argument is weak
      - Their expert's methodology is flawed
      - Key witness has credibility issues

      Our vulnerabilities:
      - The January memo is damaging
      - CFO testimony may be inconsistent
    `,
    frame: '◇▶α',
    outputDestination: 'opposing_counsel',
    expectedBehavior: {
      shouldHold: true,
      citationsToFind: 0,
      privilegeRisk: 'high',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 8: State Court Citations
  // ==========================================================================
  {
    name: "State Court Citations",
    description: "State supreme court and appellate citations",
    content: `
      Under California law, the economic loss rule was articulated in
      Seely v. White Motor Co., 63 Cal.2d 9 (1965), limiting tort recovery
      when the only damage is to the product itself.

      New York follows a similar approach, as stated in
      Bocre Leasing Corp. v. General Motors Corp., 84 N.Y.2d 685 (1995).

      Texas diverged somewhat in Sharyland Water Supply Corp. v. City of Alton,
      354 S.W.3d 407 (Tex. 2011).
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 3,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 9: Recent 2024-2025 Cases
  // ==========================================================================
  {
    name: "Recent Cases (2024-2025)",
    description: "Very recent cases that may or may not be in database",
    content: `
      The Supreme Court's recent decision in Trump v. United States,
      600 U.S. ___ (2024), addressed presidential immunity.

      In Loper Bright Enterprises v. Raimondo, 603 U.S. ___ (2024),
      the Court overruled Chevron deference.

      The Court also decided Moody v. NetChoice, LLC, 603 U.S. ___ (2024),
      regarding state social media laws.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 3,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 10: Internal Review (Lower Stakes)
  // ==========================================================================
  {
    name: "Internal Review Document",
    description: "Internal memo with mixed citations for review only",
    content: `
      INTERNAL RESEARCH MEMO - DRAFT

      The basic framework comes from Marbury v. Madison, 5 U.S. 137 (1803).

      We should also look at the fictional case of
      Anderson v. Digital Systems, 478 U.S. 555 (1990) for guidance.

      Note: I'm not sure if that second citation is correct - please verify.

      Other relevant precedent includes Roe v. Wade, 410 U.S. 113 (1973),
      though note this was overruled by Dobbs v. Jackson Women's Health,
      597 U.S. 215 (2022).
    `,
    frame: '◇▶α',
    outputDestination: 'internal',
    expectedBehavior: {
      shouldHold: false,  // Internal = lower stakes
      citationsToFind: 4,
      privilegeRisk: 'low',
      fabricationRisk: 'medium'
    }
  },

  // ==========================================================================
  // TEST 11: Complex Brief with Many Citations
  // ==========================================================================
  {
    name: "Complex Brief (10+ Citations)",
    description: "Realistic brief with many citations to stress-test",
    content: `
      PLAINTIFF'S OPPOSITION TO MOTION FOR SUMMARY JUDGMENT

      I. STANDARD OF REVIEW

      Summary judgment is appropriate only when there is no genuine dispute
      as to any material fact. Fed. R. Civ. P. 56(a); Celotex Corp. v. Catrett,
      477 U.S. 317, 322 (1986). The court must view the evidence in the light
      most favorable to the nonmoving party. Anderson v. Liberty Lobby, Inc.,
      477 U.S. 242, 255 (1986).

      II. ARGUMENT

      A. Defendant Owed Plaintiff a Duty of Care

      Under Palsgraf v. Long Island Railroad Co., 248 N.Y. 339 (1928),
      duty is limited to foreseeable plaintiffs. However, the modern approach
      in Tarasoff v. Regents of Univ. of Cal., 17 Cal.3d 425 (1976), expands
      duty in special relationships.

      B. The Contract Claims Are Viable

      Contract interpretation follows Frigaliment Importing Co. v. B.N.S.
      Int'l Sales Corp., 190 F. Supp. 116 (S.D.N.Y. 1960). The parol evidence
      rule, as stated in Pacific Gas & Elec. Co. v. G.W. Thomas Drayage Co.,
      69 Cal.2d 33 (1968), allows extrinsic evidence for ambiguous terms.

      C. Punitive Damages Are Warranted

      BMW of North America, Inc. v. Gore, 517 U.S. 559 (1996), provides the
      constitutional framework for punitive damages. State Farm Mut. Auto.
      Ins. Co. v. Campbell, 538 U.S. 408 (2003), further refined these limits.
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: false,
      citationsToFind: 10,
      privilegeRisk: 'low',
      fabricationRisk: 'low'
    }
  },

  // ==========================================================================
  // TEST 12: Edge Case - Malformed Citations
  // ==========================================================================
  {
    name: "Malformed Citations",
    description: "Citations with formatting issues",
    content: `
      The Court in brown v board of education said segregation is wrong.

      See also NYT v Sullivan (1964) regarding defamation.

      The Roe decision from 1973 is no longer good law.

      Under 42 USC 1983, civil rights claims require state action.

      Refer to the Chevron case for administrative deference (overruled 2024).
    `,
    frame: '◇▶α',
    outputDestination: 'court',
    expectedBehavior: {
      shouldHold: true,  // Malformed citations need review
      citationsToFind: 0,  // May not parse correctly
      privilegeRisk: 'low',
      fabricationRisk: 'medium'
    }
  }
];

// =============================================================================
// TEST RUNNER
// =============================================================================

interface TestResult {
  testName: string;
  passed: boolean;
  result: any;
  expected: TestCase['expectedBehavior'];
  discrepancies: string[];
  duration: number;
}

async function runTests(): Promise<TestResult[]> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        COMPREHENSIVE LEGAL MVP TEST SUITE (12 TESTS)                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n${'─'.repeat(79)}`);
    console.log(`TEST ${i + 1}/${testCases.length}: ${test.name}`);
    console.log(`${'─'.repeat(79)}`);
    console.log(`📝 ${test.description}`);
    console.log(`📤 Output destination: ${test.outputDestination}`);
    console.log('');

    const startTime = Date.now();

    try {
      const result = await handleLegalCheck({
        content: test.content,
        frame: test.frame,
        outputDestination: test.outputDestination,
        async: true,
      });

      const duration = Date.now() - startTime;
      const discrepancies: string[] = [];

      // Check hold decision
      if (result.shouldHold !== test.expectedBehavior.shouldHold) {
        discrepancies.push(
          `Hold: expected ${test.expectedBehavior.shouldHold}, got ${result.shouldHold}`
        );
      }

      // Check citation count (if applicable)
      const citationCount = result.results.citationVerification?.totalCitations || 0;
      if (Math.abs(citationCount - test.expectedBehavior.citationsToFind) > 1) {
        discrepancies.push(
          `Citations: expected ~${test.expectedBehavior.citationsToFind}, got ${citationCount}`
        );
      }

      // Report results
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`🛑 Hold Required: ${result.shouldHold ? 'YES' : 'NO'} (expected: ${test.expectedBehavior.shouldHold ? 'YES' : 'NO'})`);

      if (result.results.citationVerification) {
        const cv = result.results.citationVerification;
        console.log(`📚 Citations Found: ${cv.totalCitations}`);
        console.log(`✅ Verified: ${cv.verifiedCitations?.length || 0}`);
        console.log(`❓ Unverified: ${cv.unverifiedCitations?.length || 0}`);
        console.log(`📊 Verification Score: ${(cv.verificationScore * 100).toFixed(0)}%`);

        if (cv.unverifiedCitations && cv.unverifiedCitations.length > 0) {
          console.log(`\n   Unverified citations:`);
          cv.unverifiedCitations.slice(0, 5).forEach((c: string) => {
            console.log(`     ⚠️  ${c}`);
          });
        }
      }

      if (result.results.privilegeCheck) {
        const pc = result.results.privilegeCheck;
        console.log(`🔒 Privilege Risk: ${pc.riskLevel} (expected: ${test.expectedBehavior.privilegeRisk})`);
        if (pc.privilegedPhrases && pc.privilegedPhrases.length > 0) {
          console.log(`   Detected phrases: ${pc.privilegedPhrases.join(', ')}`);
        }
      }

      if (result.holdReasons && result.holdReasons.length > 0) {
        console.log(`\n   Hold reasons:`);
        result.holdReasons.forEach((r: string) => {
          console.log(`     🚫 ${r}`);
        });
      }

      const passed = discrepancies.length === 0;
      console.log(`\n${passed ? '✅ PASSED' : '⚠️  DISCREPANCIES FOUND'}`);

      if (discrepancies.length > 0) {
        discrepancies.forEach(d => console.log(`   • ${d}`));
      }

      results.push({
        testName: test.name,
        passed,
        result,
        expected: test.expectedBehavior,
        discrepancies,
        duration
      });

    } catch (error) {
      console.log(`❌ ERROR: ${error}`);
      results.push({
        testName: test.name,
        passed: false,
        result: { error: String(error) },
        expected: test.expectedBehavior,
        discrepancies: [`Test threw error: ${error}`],
        duration: Date.now() - startTime
      });
    }
  }

  return results;
}

// =============================================================================
// SUMMARY AND TRUTH VALIDATION DATA
// =============================================================================

async function main() {
  const results = await runTests();

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         TEST SUMMARY                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed/Discrepancies: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('');

  // Detailed results table
  console.log('┌─────────────────────────────────────┬────────┬──────────┬─────────────────┐');
  console.log('│ Test Name                           │ Status │ Duration │ Notes           │');
  console.log('├─────────────────────────────────────┼────────┼──────────┼─────────────────┤');

  for (const r of results) {
    const name = r.testName.substring(0, 35).padEnd(35);
    const status = r.passed ? '✅ PASS' : '⚠️ DISC';
    const duration = `${r.duration}ms`.padEnd(8);
    const notes = r.discrepancies.length > 0
      ? r.discrepancies[0].substring(0, 15)
      : '';
    console.log(`│ ${name} │ ${status} │ ${duration} │ ${notes.padEnd(15)} │`);
  }

  console.log('└─────────────────────────────────────┴────────┴──────────┴─────────────────┘');

  // Output data for truth validation
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              DATA FOR TRUTH VALIDATOR ANALYSIS                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Collect claims made during testing for truth validation
  const claims: string[] = [];

  for (const r of results) {
    if (r.result.results?.citationVerification) {
      const cv = r.result.results.citationVerification;
      claims.push(`Test "${r.testName}": Found ${cv.totalCitations} citations with ${(cv.verificationScore * 100).toFixed(0)}% verification score`);

      if (cv.verifiedCitations && cv.verifiedCitations.length > 0) {
        cv.verifiedCitations.slice(0, 3).forEach((c: any) => {
          claims.push(`  VERIFIED: "${c.citation || c}" exists in CourtListener database`);
        });
      }

      if (cv.unverifiedCitations && cv.unverifiedCitations.length > 0) {
        cv.unverifiedCitations.forEach((c: string) => {
          claims.push(`  UNVERIFIED: "${c}" could not be verified`);
        });
      }
    }

    if (r.result.shouldHold) {
      claims.push(`Test "${r.testName}": System recommended HOLD with reasons: ${r.result.holdReasons?.join('; ') || 'unknown'}`);
    }
  }

  console.log('CLAIMS GENERATED BY TEST SUITE:\n');
  claims.forEach((c, i) => console.log(`${i + 1}. ${c}`));

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Return structured data for further analysis
  return {
    summary: {
      total: results.length,
      passed,
      failed,
      successRate: (passed / results.length) * 100
    },
    results,
    claims
  };
}

main().catch(console.error);
