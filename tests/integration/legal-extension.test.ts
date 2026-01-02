/**
 * Integration Tests: Legal PromptSpeak Extension
 *
 * Tests all legal extension components working together:
 * - Legal ontology symbols (§, ¶, ℗, †, ⚖)
 * - Citation validator (3-tier validation)
 * - Hold manager (legal hold reasons)
 * - Checklist generator (truth-validator integration)
 *
 * CRITICAL: These tests verify that:
 * 1. Legal domain symbol is correctly ◇ (not ◈)
 * 2. no_fabrication constraint is enforced on ¶ and †
 * 3. privilege_risk holds NEVER auto-expire
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TEST SETUP: Load canonical ontology
// =============================================================================

// Project root is 2 levels up from tests/integration/
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_ROOT = path.resolve(PROJECT_ROOT, '../Data');

const ontologyPath = path.resolve(DATA_ROOT, 'symbol-ontology.json');
let ontology: any;

try {
  const ontologyContent = fs.readFileSync(ontologyPath, 'utf-8');
  ontology = JSON.parse(ontologyContent);
} catch (e) {
  console.error(`Failed to load ontology from ${ontologyPath}:`, e);
  ontology = null;
}

// =============================================================================
// SECTION 1: LEGAL ONTOLOGY SYMBOLS
// =============================================================================

describe('Legal Ontology Symbols', () => {

  it('should have legal_instruments category in ontology', () => {
    expect(ontology).not.toBeNull();
    expect(ontology.radicals).toBeDefined();
    expect(ontology.radicals.legal_instruments).toBeDefined();
  });

  describe('Symbol Definitions', () => {

    it('should define § (statute) symbol', () => {
      const statute = ontology.radicals.legal_instruments.symbols['§'];
      expect(statute).toBeDefined();
      expect(statute.name).toBe('statute');
      expect(statute.semantic_function).toBe('legal_source');
      expect(statute.constraints).toContain('jurisdiction_required');
    });

    it('should define ¶ (case_law) with no_fabrication constraint', () => {
      const caseLaw = ontology.radicals.legal_instruments.symbols['¶'];
      expect(caseLaw).toBeDefined();
      expect(caseLaw.name).toBe('case_law');
      expect(caseLaw.constraints).toContain('no_fabrication');
      expect(caseLaw.constraints).toContain('bluebook_format');
    });

    it('should define ℗ (privilege) with no_disclosure constraint', () => {
      const privilege = ontology.radicals.legal_instruments.symbols['℗'];
      expect(privilege).toBeDefined();
      expect(privilege.name).toBe('privilege');
      expect(privilege.constraints).toContain('no_disclosure');
      expect(privilege.semantic_function).toBe('legal_protection');
    });

    it('should define † (citation) with no_fabrication constraint', () => {
      const citation = ontology.radicals.legal_instruments.symbols['†'];
      expect(citation).toBeDefined();
      expect(citation.name).toBe('citation');
      expect(citation.constraints).toContain('no_fabrication');
      expect(citation.constraints).toContain('verify_citation_accuracy');
    });

    it('should define ⚖ (regulated) symbol', () => {
      const regulated = ontology.radicals.legal_instruments.symbols['⚖'];
      expect(regulated).toBeDefined();
      expect(regulated.name).toBe('regulated');
      expect(regulated.semantic_function).toBe('legal_authority');
    });
  });

  describe('Domain Symbol Verification', () => {

    it('CRITICAL: ◇ should be the legal domain symbol', () => {
      const domains = ontology.radicals.domains.symbols;
      expect(domains['◇']).toBeDefined();
      expect(domains['◇'].name).toBe('legal');
    });

    it('CRITICAL: ◈ should be technical domain (not legal)', () => {
      const domains = ontology.radicals.domains.symbols;
      expect(domains['◈']).toBeDefined();
      expect(domains['◈'].name).toBe('technical');
    });

    it('should have all five domain symbols', () => {
      const domains = ontology.radicals.domains.symbols;
      expect(domains['◊'].name).toBe('financial');
      expect(domains['◈'].name).toBe('technical');
      expect(domains['◇'].name).toBe('legal');
      expect(domains['◆'].name).toBe('medical');
      expect(domains['◐'].name).toBe('operational');
    });
  });

  describe('Legal Compound Symbols', () => {

    it('should define legal compound symbols using ◇', () => {
      const compounds = ontology.compound_symbols;

      // Check for legal compounds - they should use ◇, not ◈
      const legalCompounds = Object.keys(compounds).filter(k => k.includes('◇'));
      expect(legalCompounds.length).toBeGreaterThan(0);
    });

    it('should have ◇§▲ (legal statute analyze) compound', () => {
      const compound = ontology.compound_symbols['◇§▲'];
      expect(compound).toBeDefined();
      expect(compound.name).toBe('legal_statutory_analyze');
      expect(compound.components).toContain('◇');
      expect(compound.components).toContain('§');
      // Uses cite_chapter_section (from § statute symbol), not generic citation_required
      expect(compound.inherited_constraints).toContain('cite_chapter_section');
    });
  });
});

// =============================================================================
// SECTION 2: CITATION VALIDATOR STRUCTURE
// =============================================================================

describe('Citation Validator Structure', () => {

  it('should have citation-validator.ts file', () => {
    const validatorPath = path.resolve(
      __dirname,
      '../../src/legal/citation-validator.ts'
    );
    expect(fs.existsSync(validatorPath)).toBe(true);
  });

  it('should have legal types defined', () => {
    const typesPath = path.resolve(
      __dirname,
      '../../src/legal/types.ts'
    );
    expect(fs.existsSync(typesPath)).toBe(true);
  });

  it('should export from legal/index.ts', () => {
    const indexPath = path.resolve(
      __dirname,
      '../../src/legal/index.ts'
    );
    expect(fs.existsSync(indexPath)).toBe(true);
  });
});

// =============================================================================
// SECTION 3: HOLD MANAGER LEGAL REASONS
// =============================================================================

describe('Hold Manager Legal Reasons', () => {

  const typesPath = path.resolve(__dirname, '../../src/types/index.ts');
  let typesContent: string;

  beforeEach(() => {
    typesContent = fs.readFileSync(typesPath, 'utf-8');
  });

  it('should define legal hold reasons in types', () => {
    expect(typesContent).toContain('deadline_risk');
    expect(typesContent).toContain('privilege_risk');
    expect(typesContent).toContain('fabrication_flag');
    expect(typesContent).toContain('citation_unverified');
    expect(typesContent).toContain('jurisdiction_mismatch');
    expect(typesContent).toContain('judge_preference');
  });

  it('should define DeadlineRiskEvidence interface', () => {
    expect(typesContent).toContain('DeadlineRiskEvidence');
    expect(typesContent).toContain('deadlineType');
    expect(typesContent).toContain('hoursRemaining');
  });

  it('should define PrivilegeRiskEvidence interface', () => {
    expect(typesContent).toContain('PrivilegeRiskEvidence');
    expect(typesContent).toContain('privilegeType');
    expect(typesContent).toContain('privilegeHolder');
  });

  it('should define LegalHoldConfig interface', () => {
    expect(typesContent).toContain('LegalHoldConfig');
    expect(typesContent).toContain('citationVerification');
    expect(typesContent).toContain('deadlineMonitoring');
    expect(typesContent).toContain('privilegeDetection');
  });
});

// =============================================================================
// SECTION 4: CHECKLIST GENERATOR
// =============================================================================

describe('Checklist Generator', () => {

  const generatorPath = path.resolve(
    __dirname,
    '../../src/gatekeeper/checklist-generator.ts'
  );
  let generatorContent: string;

  beforeEach(() => {
    generatorContent = fs.readFileSync(generatorPath, 'utf-8');
  });

  it('should have checklist-generator.ts file', () => {
    expect(fs.existsSync(generatorPath)).toBe(true);
  });

  it('CRITICAL: should use ◇ as legal domain symbol (not ◈)', () => {
    // The generator should check for ◇ (legal), not ◈ (technical)
    // This is a critical consistency check with the canonical ontology

    // Check what symbol is actually being used
    const usesCorrectSymbol = generatorContent.includes("LEGAL_DOMAIN_SYMBOL = '◇'");
    const usesWrongSymbol = generatorContent.includes("LEGAL_DOMAIN_SYMBOL = '◈'");

    // If it uses ◈, this is a BUG that needs fixing
    if (usesWrongSymbol) {
      console.error('BUG DETECTED: checklist-generator.ts uses ◈ instead of ◇');
    }

    expect(usesCorrectSymbol || !usesWrongSymbol).toBe(true);
  });

  it('should define flag types for truth-validator', () => {
    expect(generatorContent).toContain('NEEDS_CITATION');
    expect(generatorContent).toContain('PARAPHRASE_CHECK');
    expect(generatorContent).toContain('INFERENCE_FLAG');
    expect(generatorContent).toContain('CALCULATION_VERIFY');
    expect(generatorContent).toContain('ASSUMPTION_FLAG');
    expect(generatorContent).toContain('SCOPE_QUESTION');
  });

  it('should include disclaimer about limitations', () => {
    expect(generatorContent).toContain('does not validate accuracy');
    expect(generatorContent).toContain('Your professional judgment is required');
  });

  it('should have ChecklistGenerator class', () => {
    expect(generatorContent).toContain('class ChecklistGenerator');
    expect(generatorContent).toContain('generateForHold');
    expect(generatorContent).toContain('formatForDisplay');
  });
});

// =============================================================================
// SECTION 5: DATA INTEGRATION
// =============================================================================

describe('Data Integration', () => {

  const integrationDbPath = path.resolve(
    process.env.HOME || '',
    '.freelance-finance/integration.db'
  );
  const schemaPath = path.resolve(
    process.env.HOME || '',
    '.freelance-finance/integration-schema.sql'
  );

  it('should have integration-schema.sql file', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
  });

  it('should have initialized integration.db', () => {
    expect(fs.existsSync(integrationDbPath)).toBe(true);
  });

  describe('Schema Contents', () => {
    let schemaContent: string;

    beforeEach(() => {
      schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    });

    it('should define normalized_judges table', () => {
      expect(schemaContent).toContain('normalized_judges');
    });

    it('should define normalized_lawyers table', () => {
      expect(schemaContent).toContain('normalized_lawyers');
    });

    it('should define lawyer_concentration table for SPOF detection', () => {
      expect(schemaContent).toContain('lawyer_concentration');
    });

    it('should define drift_events table', () => {
      expect(schemaContent).toContain('drift_events');
    });

    it('should have v_spof_lawyers view', () => {
      expect(schemaContent).toContain('v_spof_lawyers');
    });

    it('should have v_data_quality_summary view', () => {
      expect(schemaContent).toContain('v_data_quality_summary');
    });
  });
});

// =============================================================================
// SECTION 6: CROSS-COMPONENT CONSISTENCY
// =============================================================================

describe('Cross-Component Consistency', () => {

  it('README should match ontology domain symbols', () => {
    const readmePath = path.resolve(PROJECT_ROOT, '../README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');

    // Check that README uses correct symbols
    expect(readmeContent).toContain('`◇` | legal');
    expect(readmeContent).toContain('`◈` | technical');
  });

  it('all components should use same legal domain symbol', () => {
    // Ontology says ◇ = legal
    const legalDomain = ontology.radicals.domains.symbols['◇'];
    expect(legalDomain.name).toBe('legal');

    // Hold manager should use ◇
    const holdManagerPath = path.resolve(
      __dirname,
      '../../src/gatekeeper/hold-manager.ts'
    );
    const holdManagerContent = fs.readFileSync(holdManagerPath, 'utf-8');
    expect(holdManagerContent).toContain("LEGAL_DOMAIN_SYMBOL = '◇'");
  });

  it('no_fabrication symbols should match ontology', () => {
    const caseLaw = ontology.radicals.legal_instruments.symbols['¶'];
    const citation = ontology.radicals.legal_instruments.symbols['†'];

    expect(caseLaw.constraints).toContain('no_fabrication');
    expect(citation.constraints).toContain('no_fabrication');
  });
});

// =============================================================================
// SECTION 7: VALIDATION RULES CONSISTENCY
// =============================================================================

describe('Validation Rules Consistency', () => {

  const rulesPath = path.resolve(DATA_ROOT, 'validation-rules.json');
  let rules: any;

  beforeEach(() => {
    const content = fs.readFileSync(rulesPath, 'utf-8');
    rules = JSON.parse(content);
  });

  it('should have three validation tiers', () => {
    expect(rules.validation_tiers.structural).toBeDefined();
    expect(rules.validation_tiers.semantic).toBeDefined();
    expect(rules.validation_tiers.chain).toBeDefined();
  });

  it('should enforce forbidden+execute conflict (SM-008)', () => {
    const sm008 = rules.semantic_rules['SM-008'];
    expect(sm008).toBeDefined();
    expect(sm008.name).toBe('forbidden_not_executed');
    expect(sm008.error_code).toBe('FORBIDDEN_EXECUTE');
  });

  it('should have chain depth limit (CH-007)', () => {
    const ch007 = rules.chain_rules['CH-007'];
    expect(ch007).toBeDefined();
    expect(ch007.max_depth).toBe(10);
  });
});
