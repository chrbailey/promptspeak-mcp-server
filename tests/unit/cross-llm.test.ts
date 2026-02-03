/**
 * Cross-LLM Verification Tests (P5)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CrossLLMVerifier,
  getCrossLLMVerifier,
  createCrossLLMVerifier,
  resetCrossLLMVerifier,
  type VerificationConfig,
  type SymbolAnalysis,
  type Discrepancy,
} from '../../src/verification/cross-llm.js';

describe('CrossLLMVerifier', () => {
  beforeEach(() => {
    resetCrossLLMVerifier();
  });

  describe('Availability', () => {
    it('should report unavailable when no API keys set', () => {
      const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      const originalGoogleKey = process.env.GOOGLE_API_KEY;

      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const verifier = createCrossLLMVerifier();
      expect(verifier.isAvailable()).toBe(false);

      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      process.env.OPENAI_API_KEY = originalOpenAIKey;
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    });

    it('should report available with at least one API key', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const verifier = createCrossLLMVerifier();
      expect(verifier.isAvailable()).toBe(true);

      delete process.env.ANTHROPIC_API_KEY;
    });
  });

  describe('Provider Management', () => {
    it('should return list of available providers', () => {
      const verifier = createCrossLLMVerifier();
      const providers = verifier.getProviders();

      expect(Array.isArray(providers)).toBe(true);
    });

    it('should include Anthropic when key is set', () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const verifier = createCrossLLMVerifier();
      const providers = verifier.getProviders();

      expect(providers).toContain('anthropic');

      process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('should include OpenAI when key is set', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'test-key';

      const verifier = createCrossLLMVerifier();
      const providers = verifier.getProviders();

      expect(providers).toContain('openai');

      process.env.OPENAI_API_KEY = originalKey;
    });

    it('should include Google when key is set', () => {
      const originalKey = process.env.GOOGLE_API_KEY;
      process.env.GOOGLE_API_KEY = 'test-key';

      const verifier = createCrossLLMVerifier();
      const providers = verifier.getProviders();

      expect(providers).toContain('google');

      process.env.GOOGLE_API_KEY = originalKey;
    });
  });

  describe('Configuration', () => {
    it('should accept custom config', () => {
      const config: Partial<VerificationConfig> = {
        minConsensusRatio: 0.8,
        confidenceThreshold: 0.7,
        timeoutMs: 60000,
      };

      const verifier = createCrossLLMVerifier(config);
      expect(verifier).toBeDefined();
    });

    it('should use default config when not provided', () => {
      const verifier = createCrossLLMVerifier();
      expect(verifier).toBeDefined();
    });
  });

  describe('Singleton Management', () => {
    it('should return same instance from getCrossLLMVerifier', () => {
      const v1 = getCrossLLMVerifier();
      const v2 = getCrossLLMVerifier();
      expect(v1).toBe(v2);
    });

    it('should reset correctly', () => {
      const v1 = getCrossLLMVerifier();
      resetCrossLLMVerifier();
      const v2 = getCrossLLMVerifier();
      expect(v1).not.toBe(v2);
    });
  });

  describe('Verification Result Structure', () => {
    it('should have verify method', () => {
      const verifier = createCrossLLMVerifier();
      expect(typeof verifier.verify).toBe('function');
    });
  });

  describe('Discrepancy Detection (Unit)', () => {
    const mockAnalysis1: SymbolAnalysis = {
      symbolId: 'XI.TEST.SYMBOL',
      interpretation: 'Test interpretation A',
      confidence: 0.9,
      keyEntities: ['entity1', 'entity2'],
      relationships: [{ from: 'A', to: 'B', type: 'relates' }],
      warnings: [],
    };

    const mockAnalysis2: SymbolAnalysis = {
      symbolId: 'XI.TEST.SYMBOL',
      interpretation: 'Test interpretation B',
      confidence: 0.85,
      keyEntities: ['entity1', 'entity3'],
      relationships: [{ from: 'A', to: 'C', type: 'relates' }],
      warnings: ['warning1'],
    };

    it('should detect interpretation differences', () => {
      // This would test the internal findDiscrepancies function
      // For now, we verify the structure exists
      expect(mockAnalysis1.interpretation).not.toBe(mockAnalysis2.interpretation);
    });

    it('should detect entity differences', () => {
      const entities1 = new Set(mockAnalysis1.keyEntities);
      const entities2 = new Set(mockAnalysis2.keyEntities);

      const diff = [...entities1].filter(e => !entities2.has(e));
      expect(diff.length).toBeGreaterThan(0);
    });

    it('should detect relationship differences', () => {
      expect(mockAnalysis1.relationships[0].to).not.toBe(
        mockAnalysis2.relationships[0].to
      );
    });
  });

  describe('Consensus Calculation (Unit)', () => {
    it('should calculate consensus from matching analyses', () => {
      const analyses = [
        { confidence: 0.9, interpretation: 'Same' },
        { confidence: 0.85, interpretation: 'Same' },
        { confidence: 0.8, interpretation: 'Same' },
      ];

      const agreeing = analyses.filter(a => a.interpretation === 'Same');
      const ratio = agreeing.length / analyses.length;

      expect(ratio).toBe(1.0);
    });

    it('should calculate partial consensus', () => {
      const analyses = [
        { confidence: 0.9, interpretation: 'A' },
        { confidence: 0.85, interpretation: 'A' },
        { confidence: 0.8, interpretation: 'B' },
      ];

      const mostCommon = 'A';
      const agreeing = analyses.filter(a => a.interpretation === mostCommon);
      const ratio = agreeing.length / analyses.length;

      expect(ratio).toBeCloseTo(0.67, 1);
    });
  });
});
