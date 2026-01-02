#!/usr/bin/env npx tsx
// =============================================================================
// LEGAL MVP COMPREHENSIVE VALIDATION
// =============================================================================
// Validates all components of the Legal MVP solution:
//   1. Module imports and exports
//   2. Citation verification
//   3. Calendar integration
//   4. MCP tool definitions
//   5. Hold management integration
//
// Run with: npx tsx validate-legal-mvp.ts
// =============================================================================

import { readFileSync, existsSync } from 'fs';

// =============================================================================
// VALIDATION RESULT TRACKING
// =============================================================================

interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

const results: ValidationResult[] = [];

function pass(category: string, test: string, message: string = ''): void {
  results.push({ category, test, passed: true, message, severity: 'info' });
}

function fail(category: string, test: string, message: string, severity: 'critical' | 'warning' = 'critical'): void {
  results.push({ category, test, passed: false, message, severity });
}

function warn(category: string, test: string, message: string): void {
  results.push({ category, test, passed: true, message, severity: 'warning' });
}

// =============================================================================
// 1. MODULE IMPORT VALIDATION
// =============================================================================

async function validateModuleImports(): Promise<void> {
  console.log('\n📦 Validating Module Imports...\n');

  // Legal module exports
  try {
    const legalModule = await import('./src/legal/index.js');

    const requiredExports = [
      'CitationValidator',
      'InMemoryCourtDatabase',
      'InMemoryCaseDatabase',
      'CourtListenerCaseDatabase',
      'createCourtListenerDatabase',
      'LegalPreFlightEvaluator',
      'createLegalPreFlight',
      'extractCitations',
      'detectPrivilegeIndicators',
      'DeadlineExtractor',
      'createDeadlineExtractor',
      'ICalGenerator',
      'createICalGenerator',
      'generateICalFromDeadlines',
      'FRCP_DEADLINES',
      'FEDERAL_HOLIDAYS_2024_2025',
    ];

    for (const exp of requiredExports) {
      if (exp in legalModule) {
        pass('Module Imports', `legal/${exp}`, 'Export found');
      } else {
        fail('Module Imports', `legal/${exp}`, 'Export missing from legal module');
      }
    }
  } catch (error) {
    fail('Module Imports', 'legal/index.js', `Failed to import: ${error}`);
  }

  // Legal tools exports
  try {
    const toolsModule = await import('./src/tools/index.js');

    const requiredExports = [
      'legalToolDefinitions',
      'handleLegalTool',
      'calendarToolDefinitions',
      'handleCalendarTool',
      'holdToolDefinitions',
      'handleHoldTool',
    ];

    for (const exp of requiredExports) {
      if (exp in toolsModule) {
        pass('Module Imports', `tools/${exp}`, 'Export found');
      } else {
        fail('Module Imports', `tools/${exp}`, 'Export missing from tools module');
      }
    }
  } catch (error) {
    fail('Module Imports', 'tools/index.js', `Failed to import: ${error}`);
  }
}

// =============================================================================
// 2. CITATION VERIFICATION VALIDATION
// =============================================================================

async function validateCitationVerification(): Promise<void> {
  console.log('\n⚖️  Validating Citation Verification...\n');

  try {
    const {
      CitationValidator,
      InMemoryCourtDatabase,
      InMemoryCaseDatabase,
      extractCitations,
    } = await import('./src/legal/index.js');

    // Test citation extraction
    const testContent = `
      The court in Brown v. Board of Education, 347 U.S. 483 (1954) held that
      separate educational facilities are inherently unequal. See also
      Roe v. Wade, 410 U.S. 113 (1973).
    `;

    const citations = extractCitations(testContent);

    if (citations.length >= 2) {
      pass('Citation Verification', 'Citation extraction', `Found ${citations.length} citations`);
    } else {
      fail('Citation Verification', 'Citation extraction', `Expected 2+ citations, found ${citations.length}`);
    }

    // Test citation validator initialization
    const courtDb = new InMemoryCourtDatabase();
    const caseDb = new InMemoryCaseDatabase();
    caseDb.seedTestData();
    const validator = new CitationValidator(courtDb, caseDb);

    if (validator) {
      pass('Citation Verification', 'Validator initialization', 'CitationValidator created');
    }

    // Test validation
    const result = await validator.validate('347 U.S. 483');
    if (result && typeof result.isValid === 'boolean') {
      pass('Citation Verification', 'Citation validation', `Validation returned: ${result.isValid}`);
    } else {
      warn('Citation Verification', 'Citation validation', 'Validation returned unexpected format');
    }

  } catch (error) {
    fail('Citation Verification', 'Overall', `Error: ${error}`);
  }
}

// =============================================================================
// 3. CALENDAR INTEGRATION VALIDATION
// =============================================================================

async function validateCalendarIntegration(): Promise<void> {
  console.log('\n📅 Validating Calendar Integration...\n');

  try {
    const {
      DeadlineExtractor,
      createDeadlineExtractor,
      ICalGenerator,
      createICalGenerator,
      generateICalFromDeadlines,
      FRCP_DEADLINES,
    } = await import('./src/legal/index.js');

    // Test deadline extractor
    const extractor = createDeadlineExtractor({
      defaultBaseDate: new Date('2024-12-27'),
      matter: 'Test Case',
    });

    const testOrder = `
      Response to motion due by January 15, 2025.
      Defendant shall have 21 days to file an answer.
      Hearing scheduled for February 10, 2025 at 10:00 AM.
    `;

    const extracted = extractor.extract(testOrder);

    if (extracted.deadlines.length >= 2) {
      pass('Calendar Integration', 'Deadline extraction', `Found ${extracted.deadlines.length} deadlines`);
    } else {
      warn('Calendar Integration', 'Deadline extraction', `Found ${extracted.deadlines.length} deadlines (expected 2+)`);
    }

    // Test due date calculation
    const dueDate = extractor.calculateDueDate(
      new Date('2024-12-27'),
      21,
      'court'
    );

    if (dueDate instanceof Date && !isNaN(dueDate.getTime())) {
      pass('Calendar Integration', 'Due date calculation', `21 court days = ${dueDate.toDateString()}`);
    } else {
      fail('Calendar Integration', 'Due date calculation', 'Invalid date returned');
    }

    // Test iCal generator
    const generator = createICalGenerator();
    const testDeadlines = [{
      id: 'test1',
      type: 'response' as const,
      description: 'Test deadline',
      sourceText: 'Test',
      dueDate: new Date('2025-01-15'),
      courtRules: 'frcp' as const,
      countingMethod: 'court' as const,
      priority: 'high' as const,
      isEstimated: false,
      confidence: 0.9,
    }];

    const icalContent = generator.fromDeadlines(testDeadlines);

    if (icalContent.includes('BEGIN:VCALENDAR') && icalContent.includes('BEGIN:VEVENT')) {
      pass('Calendar Integration', 'iCal generation', 'Valid iCal format generated');
    } else {
      fail('Calendar Integration', 'iCal generation', 'Invalid iCal format');
    }

    // Test FRCP deadlines data
    if (Object.keys(FRCP_DEADLINES).length >= 10) {
      pass('Calendar Integration', 'FRCP deadlines data', `${Object.keys(FRCP_DEADLINES).length} rules defined`);
    } else {
      warn('Calendar Integration', 'FRCP deadlines data', 'Fewer FRCP rules than expected');
    }

  } catch (error) {
    fail('Calendar Integration', 'Overall', `Error: ${error}`);
  }
}

// =============================================================================
// 4. MCP TOOL DEFINITIONS VALIDATION
// =============================================================================

async function validateMCPTools(): Promise<void> {
  console.log('\n🔧 Validating MCP Tool Definitions...\n');

  try {
    const {
      legalToolDefinitions,
      calendarToolDefinitions,
      holdToolDefinitions,
    } = await import('./src/tools/index.js');

    // Validate legal tools
    const expectedLegalTools = [
      'ps_legal_verify',
      'ps_legal_verify_batch',
      'ps_legal_extract',
      'ps_legal_check',
      'ps_legal_config',
      'ps_legal_stats',
    ];

    for (const toolName of expectedLegalTools) {
      const tool = legalToolDefinitions.find((t: any) => t.name === toolName);
      if (tool) {
        if (tool.description && tool.inputSchema) {
          pass('MCP Tools', `Legal: ${toolName}`, 'Tool definition complete');
        } else {
          warn('MCP Tools', `Legal: ${toolName}`, 'Missing description or inputSchema');
        }
      } else {
        fail('MCP Tools', `Legal: ${toolName}`, 'Tool not found');
      }
    }

    // Validate calendar tools
    const expectedCalendarTools = [
      'ps_calendar_extract',
      'ps_calendar_export',
      'ps_calendar_calculate',
      'ps_calendar_frcp',
    ];

    for (const toolName of expectedCalendarTools) {
      const tool = calendarToolDefinitions.find((t: any) => t.name === toolName);
      if (tool) {
        if (tool.description && tool.inputSchema) {
          pass('MCP Tools', `Calendar: ${toolName}`, 'Tool definition complete');
        } else {
          warn('MCP Tools', `Calendar: ${toolName}`, 'Missing description or inputSchema');
        }
      } else {
        fail('MCP Tools', `Calendar: ${toolName}`, 'Tool not found');
      }
    }

    // Validate hold tools
    const expectedHoldTools = [
      'ps_hold_list',
      'ps_hold_approve',
      'ps_hold_reject',
    ];

    for (const toolName of expectedHoldTools) {
      const tool = holdToolDefinitions.find((t: any) => t.name === toolName);
      if (tool) {
        pass('MCP Tools', `Hold: ${toolName}`, 'Tool definition found');
      } else {
        fail('MCP Tools', `Hold: ${toolName}`, 'Tool not found');
      }
    }

  } catch (error) {
    fail('MCP Tools', 'Overall', `Error: ${error}`);
  }
}

// =============================================================================
// 5. PRIVILEGE DETECTION VALIDATION
// =============================================================================

async function validatePrivilegeDetection(): Promise<void> {
  console.log('\n🔒 Validating Privilege Detection...\n');

  try {
    const { detectPrivilegeIndicators } = await import('./src/legal/index.js');

    // Test with privileged content
    const privilegedContent = `
      ATTORNEY-CLIENT PRIVILEGED COMMUNICATION

      This memo reflects work product prepared in anticipation of litigation.
      Our legal strategy involves...
    `;

    const indicators = detectPrivilegeIndicators(privilegedContent);

    if (indicators.length >= 1) {
      pass('Privilege Detection', 'Privileged content detection', `Found ${indicators.length} indicator(s)`);
    } else {
      fail('Privilege Detection', 'Privileged content detection', 'Failed to detect privilege markers');
    }

    // Test with non-privileged content
    const normalContent = `
      This is a standard motion for summary judgment.
      The facts of the case are as follows...
    `;

    const normalIndicators = detectPrivilegeIndicators(normalContent);

    if (normalIndicators.length === 0) {
      pass('Privilege Detection', 'Non-privileged content', 'Correctly found no indicators');
    } else {
      warn('Privilege Detection', 'Non-privileged content', `Found ${normalIndicators.length} false positive(s)`);
    }

  } catch (error) {
    fail('Privilege Detection', 'Overall', `Error: ${error}`);
  }
}

// =============================================================================
// 6. FILE VALIDATION
// =============================================================================

async function validateFiles(): Promise<void> {
  console.log('\n📄 Validating Required Files...\n');

  const requiredFiles = [
    { path: 'src/legal/index.ts', critical: true },
    { path: 'src/legal/citation-validator.ts', critical: true },
    { path: 'src/legal/courtlistener-adapter.ts', critical: true },
    { path: 'src/legal/legal-preflight.ts', critical: true },
    { path: 'src/legal/calendar-types.ts', critical: true },
    { path: 'src/legal/deadline-extractor.ts', critical: true },
    { path: 'src/legal/ical-generator.ts', critical: true },
    { path: 'src/tools/ps_legal.ts', critical: true },
    { path: 'src/tools/ps_calendar.ts', critical: true },
    { path: 'src/tools/ps_hold.ts', critical: true },
    { path: 'src/server.ts', critical: true },
    { path: 'skills/legal-review.md', critical: false },
    { path: 'skills/legal-review.prompt.md', critical: false },
    { path: 'docs/ATTORNEY-GUIDE.md', critical: false },
    { path: 'docs/QUICK-REFERENCE.md', critical: false },
    { path: 'install-legal-review.sh', critical: false },
    { path: 'package.json', critical: true },
    { path: 'tsconfig.json', critical: true },
  ];

  for (const file of requiredFiles) {
    if (existsSync(file.path)) {
      const content = readFileSync(file.path, 'utf-8');
      if (content.length > 0) {
        pass('File Validation', file.path, `${content.length} bytes`);
      } else {
        fail('File Validation', file.path, 'File is empty', file.critical ? 'critical' : 'warning');
      }
    } else {
      fail('File Validation', file.path, 'File not found', file.critical ? 'critical' : 'warning');
    }
  }
}

// =============================================================================
// 7. INSTALLER SCRIPT VALIDATION
// =============================================================================

async function validateInstaller(): Promise<void> {
  console.log('\n🚀 Validating Installer Script...\n');

  const installerPath = 'install-legal-review.sh';

  if (!existsSync(installerPath)) {
    fail('Installer', 'File exists', 'install-legal-review.sh not found');
    return;
  }

  const content = readFileSync(installerPath, 'utf-8');

  // Check for required sections
  const requiredPatterns = [
    { pattern: /#!/, name: 'Shebang' },
    { pattern: /node.*-v|NODE_VERSION/i, name: 'Node.js version check' },
    { pattern: /npm\s+install/i, name: 'npm install command' },
    { pattern: /claude.*config|CONFIG_FILE/i, name: 'Claude Desktop config' },
    { pattern: /LIMITATION|CANNOT.*verify/i, name: 'Limitation notice' },
  ];

  for (const { pattern, name } of requiredPatterns) {
    if (pattern.test(content)) {
      pass('Installer', name, 'Found in script');
    } else {
      warn('Installer', name, 'Not found in script');
    }
  }
}

// =============================================================================
// 8. INTEGRATION TEST
// =============================================================================

async function runIntegrationTest(): Promise<void> {
  console.log('\n🧪 Running Integration Test...\n');

  try {
    const { handleLegalCheck } = await import('./src/tools/ps_legal.js');
    const { handleCalendarExtract } = await import('./src/tools/ps_calendar.js');

    // Test full legal check
    const testBrief = `
      MOTION FOR SUMMARY JUDGMENT

      Pursuant to Federal Rule of Civil Procedure 56, Plaintiff moves for summary judgment.

      The court in Brown v. Board of Education, 347 U.S. 483 (1954) established that
      separate educational facilities are inherently unequal.

      PRIVILEGED AND CONFIDENTIAL - ATTORNEY WORK PRODUCT

      Our litigation strategy involves...

      Response due within 21 days of service.
    `;

    const legalResult = await handleLegalCheck({
      content: testBrief,
      frame: '◇▶α',
      outputDestination: 'court',
    });

    if (legalResult && 'results' in legalResult) {
      pass('Integration Test', 'Legal check execution', 'handleLegalCheck completed');

      if (legalResult.results.citationVerification) {
        pass('Integration Test', 'Citation verification included',
          `Score: ${(legalResult.results.citationVerification.verificationScore * 100).toFixed(0)}%`);
      }

      if (legalResult.results.privilegeCheck) {
        pass('Integration Test', 'Privilege check included',
          `Risk: ${(legalResult.results.privilegeCheck.riskScore * 100).toFixed(0)}%`);
      }

      if (legalResult.shouldHold !== undefined) {
        pass('Integration Test', 'Hold decision',
          legalResult.shouldHold ? 'HOLD required' : 'Ready for review');
      }
    } else {
      fail('Integration Test', 'Legal check execution', 'Unexpected result format');
    }

    // Test calendar extraction
    const calendarResult = handleCalendarExtract({
      content: testBrief,
      baseDate: '2024-12-27',
      matter: 'Test Case',
    });

    if (calendarResult && 'deadlines' in calendarResult) {
      pass('Integration Test', 'Calendar extraction',
        `Found ${calendarResult.deadlines.length} deadline(s)`);
    } else {
      fail('Integration Test', 'Calendar extraction', 'Unexpected result format');
    }

  } catch (error) {
    fail('Integration Test', 'Overall', `Error: ${error}`);
  }
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

async function runValidation(): Promise<void> {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              LEGAL MVP COMPREHENSIVE VALIDATION                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');

  await validateModuleImports();
  await validateCitationVerification();
  await validateCalendarIntegration();
  await validateMCPTools();
  await validatePrivilegeDetection();
  await validateFiles();
  await validateInstaller();
  await runIntegrationTest();

  // ==========================================================================
  // GENERATE REPORT
  // ==========================================================================

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                         VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  // Group results by category
  const categories = [...new Set(results.map(r => r.category))];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    const passed = categoryResults.filter(r => r.passed && r.severity !== 'warning').length;
    const warnings = categoryResults.filter(r => r.severity === 'warning').length;
    const failed = categoryResults.filter(r => !r.passed).length;

    totalPassed += passed;
    totalFailed += failed;
    totalWarnings += warnings;

    const status = failed > 0 ? '❌' : warnings > 0 ? '⚠️' : '✅';
    console.log(`\n${status} ${category}: ${passed} passed, ${warnings} warnings, ${failed} failed`);

    // Show failures and warnings
    for (const result of categoryResults) {
      if (!result.passed) {
        console.log(`   ❌ ${result.test}: ${result.message}`);
      } else if (result.severity === 'warning') {
        console.log(`   ⚠️  ${result.test}: ${result.message}`);
      }
    }
  }

  // Summary
  console.log('\n');
  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log('                              SUMMARY');
  console.log('───────────────────────────────────────────────────────────────────────────────');
  console.log(`\n  Total Tests: ${results.length}`);
  console.log(`  ✅ Passed:   ${totalPassed}`);
  console.log(`  ⚠️  Warnings: ${totalWarnings}`);
  console.log(`  ❌ Failed:   ${totalFailed}`);

  const overallStatus = totalFailed === 0
    ? (totalWarnings === 0 ? '✅ ALL TESTS PASSED' : '⚠️ PASSED WITH WARNINGS')
    : '❌ VALIDATION FAILED';

  console.log(`\n  Overall: ${overallStatus}`);

  // Recommendations
  if (totalFailed > 0 || totalWarnings > 0) {
    console.log('\n───────────────────────────────────────────────────────────────────────────────');
    console.log('                           RECOMMENDATIONS');
    console.log('───────────────────────────────────────────────────────────────────────────────');

    const failures = results.filter(r => !r.passed);
    const warnings = results.filter(r => r.severity === 'warning');

    if (failures.length > 0) {
      console.log('\n  Critical issues to fix:');
      for (const f of failures.slice(0, 5)) {
        console.log(`    • [${f.category}] ${f.test}: ${f.message}`);
      }
    }

    if (warnings.length > 0) {
      console.log('\n  Warnings to review:');
      for (const w of warnings.slice(0, 5)) {
        console.log(`    • [${w.category}] ${w.test}: ${w.message}`);
      }
    }
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('\n');

  // Exit with appropriate code
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run validation
runValidation().catch(error => {
  console.error('Validation failed with error:', error);
  process.exit(1);
});
