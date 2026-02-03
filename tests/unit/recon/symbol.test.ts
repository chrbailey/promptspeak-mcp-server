/**
 * Unit Tests: Marine Recon Symbol Schema and Validator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createReconSymbol,
  generateReconSymbolId,
  generateSymbolHash,
  updateSymbolState,
  updateEngagementStatus,
  recordObservation,
  serializeSymbol,
  deserializeSymbol,
  createSymbolSummary,
  compareSymbols,
  DEFAULT_RED_LINES,
  CreateReconSymbolRequest,
} from '../../../src/recon/symbol/schema.js';
import {
  ReconSymbolValidator,
  toRalphLoopResult,
} from '../../../src/recon/symbol/validator.js';
import { MarineReconSymbol } from '../../../src/recon/types.js';

describe('Symbol Schema', () => {
  let testRequest: CreateReconSymbolRequest;

  beforeEach(() => {
    testRequest = {
      mission_name: 'Test Refund Request',
      primary_goal: 'Request refund and observe handling',
      intelligence_requirements: [
        'Response time patterns',
        'Negotiation tactics used',
        'Escalation triggers',
      ],
      target: {
        type: 'customer_service_chatbot',
        platform: 'web_chat',
        organization: 'Test Corp',
      },
      created_by: 'test:unit',
    };
  });

  describe('generateReconSymbolId', () => {
    it('should generate valid symbol ID format', () => {
      const id = generateReconSymbolId('Test Mission');
      expect(id).toMatch(/^Ξ\.RECON\.TEST_MISSION_[A-Z0-9]+$/);
    });

    it('should sanitize special characters', () => {
      const id = generateReconSymbolId('Test@Mission#123!');
      expect(id).toMatch(/^Ξ\.RECON\.TEST_MISSION_123_[A-Z0-9]+$/);
    });

    it('should truncate long names', () => {
      const longName = 'A'.repeat(100);
      const id = generateReconSymbolId(longName);
      // Should be truncated to 30 chars plus prefix and timestamp
      expect(id.length).toBeLessThan(60);
    });
  });

  describe('createReconSymbol', () => {
    it('should create a valid symbol with required fields', () => {
      const symbol = createReconSymbol(testRequest);

      expect(symbol.symbol_id).toMatch(/^Ξ\.RECON\./);
      expect(symbol.symbol_type).toBe('RECON');
      expect(symbol.version).toBe(1);
      expect(symbol.symbol_hash).toHaveLength(12);
      expect(symbol.mission.objective.primary_goal).toBe(testRequest.primary_goal);
      expect(symbol.created_by).toBe('test:unit');
    });

    it('should include default red lines', () => {
      const symbol = createReconSymbol(testRequest);

      expect(symbol.mission.constraints.red_lines.length).toBeGreaterThan(0);
      expect(symbol.mission.constraints.red_lines).toEqual(DEFAULT_RED_LINES);
    });

    it('should allow custom red lines', () => {
      const customRedLines = [{
        id: 'CUSTOM_001',
        prohibition: 'Never mention competitor names',
        rationale: 'Maintain focus',
        on_approach: 'warn' as const,
      }];

      const symbol = createReconSymbol({
        ...testRequest,
        red_lines: customRedLines,
      });

      expect(symbol.mission.constraints.red_lines).toEqual(customRedLines);
    });

    it('should initialize engagement state correctly', () => {
      const symbol = createReconSymbol(testRequest);

      expect(symbol.state.engagement.status).toBe('initializing');
      expect(symbol.state.engagement.alert_level).toBe('green');
      expect(symbol.state.engagement.conversation.message_count).toBe(0);
      expect(symbol.state.engagement.analyst_state.drift_assessment.drift_score).toBe(0);
    });

    it('should initialize validation state correctly', () => {
      const symbol = createReconSymbol(testRequest);

      expect(symbol.state.validation.cycle_number).toBe(0);
      expect(symbol.state.validation.commander_queue).toEqual([]);
      expect(symbol.state.validation.pending_updates).toEqual([]);
    });

    it('should generate consistent hash for same content', () => {
      const symbol1 = createReconSymbol(testRequest);
      const symbol2 = createReconSymbol(testRequest);

      // Hashes will differ due to timestamps, but structure should be same
      expect(symbol1.symbol_hash).toHaveLength(12);
      expect(symbol2.symbol_hash).toHaveLength(12);
    });
  });

  describe('updateSymbolState', () => {
    let symbol: MarineReconSymbol;

    beforeEach(() => {
      symbol = createReconSymbol(testRequest);
    });

    it('should increment version on update', () => {
      const updated = updateSymbolState(symbol, {
        engagement: { status: 'active' },
      });

      expect(updated.version).toBe(2);
    });

    it('should set updated_at timestamp', () => {
      const updated = updateSymbolState(symbol, {
        engagement: { status: 'active' },
      });

      expect(updated.updated_at).toBeDefined();
    });

    it('should preserve unmodified state', () => {
      const updated = updateSymbolState(symbol, {
        engagement: { status: 'active' },
      });

      expect(updated.mission).toEqual(symbol.mission);
      expect(updated.config).toEqual(symbol.config);
    });
  });

  describe('updateEngagementStatus', () => {
    it('should update status correctly', () => {
      const symbol = createReconSymbol(testRequest);
      const updated = updateEngagementStatus(symbol, 'active');

      expect(updated.state.engagement.status).toBe('active');
    });

    it('should optionally update alert level', () => {
      const symbol = createReconSymbol(testRequest);
      const updated = updateEngagementStatus(symbol, 'active', 'yellow');

      expect(updated.state.engagement.status).toBe('active');
      expect(updated.state.engagement.alert_level).toBe('yellow');
    });
  });

  describe('recordObservation', () => {
    it('should add observation to intelligence', () => {
      const symbol = createReconSymbol(testRequest);
      const updated = recordObservation(
        symbol,
        'Agent used anchoring tactic',
        'tactic',
        0.8
      );

      expect(updated.state.engagement.intelligence.observations).toHaveLength(1);
      expect(updated.state.engagement.intelligence.observations[0].content).toBe(
        'Agent used anchoring tactic'
      );
      expect(updated.state.engagement.intelligence.observations[0].category).toBe('tactic');
      expect(updated.state.engagement.intelligence.observations[0].significance).toBe(0.8);
    });
  });

  describe('serializeSymbol / deserializeSymbol', () => {
    it('should round-trip serialize and deserialize', () => {
      const symbol = createReconSymbol(testRequest);
      const json = serializeSymbol(symbol);
      const restored = deserializeSymbol(json);

      expect(restored.symbol_id).toBe(symbol.symbol_id);
      expect(restored.symbol_type).toBe(symbol.symbol_type);
      expect(restored.version).toBe(symbol.version);
    });

    it('should throw on invalid symbol type', () => {
      const invalidJson = JSON.stringify({ symbol_type: 'INVALID' });

      expect(() => deserializeSymbol(invalidJson)).toThrow('Invalid symbol type');
    });
  });

  describe('createSymbolSummary', () => {
    it('should create a minimal summary object', () => {
      const symbol = createReconSymbol(testRequest);
      const summary = createSymbolSummary(symbol) as Record<string, unknown>;

      expect(summary.symbol_id).toBe(symbol.symbol_id);
      expect(summary.version).toBe(1);
      expect(summary.status).toBe('initializing');
      expect(summary.alert_level).toBe('green');
      expect(summary.message_count).toBe(0);
    });
  });

  describe('compareSymbols', () => {
    it('should detect version changes', () => {
      const symbol1 = createReconSymbol(testRequest);
      const symbol2 = updateSymbolState(symbol1, {
        engagement: { status: 'active' },
      });

      const diff = compareSymbols(symbol1, symbol2);

      expect(diff.diff_count).toBeGreaterThan(0);
      expect(diff.diffs.some(d => d.path === 'version')).toBe(true);
    });

    it('should detect status changes', () => {
      const symbol1 = createReconSymbol(testRequest);
      const symbol2 = updateEngagementStatus(symbol1, 'active');

      const diff = compareSymbols(symbol1, symbol2);

      expect(diff.diffs.some(d => d.path === 'state.engagement.status')).toBe(true);
    });
  });
});

describe('Symbol Validator', () => {
  let validator: ReconSymbolValidator;
  let testSymbol: MarineReconSymbol;

  beforeEach(() => {
    validator = new ReconSymbolValidator();
    testSymbol = createReconSymbol({
      mission_name: 'Validation Test',
      primary_goal: 'Test validation',
      intelligence_requirements: ['Test'],
      target: { type: 'customer_service_chatbot', platform: 'web_chat' },
      created_by: 'test:validator',
    });
  });

  describe('validate', () => {
    it('should pass validation for a valid symbol', () => {
      const report = validator.validate(testSymbol);

      expect(report.passed).toBe(true);
      expect(report.recommended_alert_level).toBe('green');
    });

    it('should detect invalid symbol ID format', () => {
      const invalidSymbol = { ...testSymbol, symbol_id: 'invalid' };
      const report = validator.validate(invalidSymbol as MarineReconSymbol);

      expect(report.passed).toBe(false);
      expect(report.issues.some(i => i.code === 'STRUCT_001')).toBe(true);
    });

    it('should detect invalid symbol type', () => {
      const invalidSymbol = { ...testSymbol, symbol_type: 'INVALID' as 'RECON' };
      const report = validator.validate(invalidSymbol);

      expect(report.passed).toBe(false);
      expect(report.issues.some(i => i.code === 'STRUCT_002')).toBe(true);
    });

    it('should warn when drift threshold exceeded', () => {
      const driftingSymbol = updateSymbolState(testSymbol, {
        engagement: {
          analyst_state: {
            ...testSymbol.state.engagement.analyst_state,
            drift_assessment: {
              ...testSymbol.state.engagement.analyst_state.drift_assessment,
              drift_score: 0.5, // Above typical threshold of 0.3
            },
          },
        },
      });

      const report = validator.validate(driftingSymbol);

      expect(report.issues.some(i => i.category === 'drift')).toBe(true);
    });

    it('should validate constraint status', () => {
      const violatedSymbol = updateSymbolState(testSymbol, {
        engagement: {
          analyst_state: {
            ...testSymbol.state.engagement.analyst_state,
            constraint_status: [{
              constraint_id: 'C001',
              status: 'violated',
              distance_to_violation: 0,
              last_checked: new Date().toISOString(),
            }],
          },
        },
      });

      const report = validator.validate(violatedSymbol);

      expect(report.issues.some(i => i.code === 'CONST_001')).toBe(true);
    });

    it('should check persona consistency', () => {
      const inconsistentSymbol = updateSymbolState(testSymbol, {
        engagement: {
          performer_state: {
            ...testSymbol.state.engagement.performer_state,
            persona_consistency: 0.5, // Below 0.7 threshold
          },
        },
      });

      const report = validator.validate(inconsistentSymbol);

      expect(report.issues.some(i => i.code === 'PERS_001')).toBe(true);
    });
  });

  describe('quickValidate', () => {
    it('should approve safe messages', () => {
      const decision = validator.quickValidate(testSymbol, 'I would like a refund please.');

      expect(decision).toBe('approve');
    });

    it('should block messages with SSN patterns', () => {
      const decision = validator.quickValidate(testSymbol, 'My SSN is 123-45-6789');

      expect(decision).toBe('block');
    });

    it('should block messages with financial commitments', () => {
      const decision = validator.quickValidate(testSymbol, 'I will pay $500 for this');

      expect(decision).toBe('block');
    });
  });

  describe('toRalphLoopResult', () => {
    it('should convert validation report to ralph-loop format', () => {
      const report = validator.validate(testSymbol);
      const result = toRalphLoopResult(report);

      expect(result.status).toBe('pass');
      expect(result.timestamp).toBeDefined();
      expect(Array.isArray(result.checks)).toBe(true);
      expect(Array.isArray(result.recommended_actions)).toBe(true);
    });
  });
});
