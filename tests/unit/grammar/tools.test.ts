import { describe, it, expect } from 'vitest';
import { ps_parse, ps_expand } from '../../../src/tools/ps_grammar.js';

describe('Grammar MCP Tools', () => {
  describe('ps_parse', () => {
    it('should parse valid expression and return AST', () => {
      const result = ps_parse({ expression: '::analyze{document}' });
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.ast!.body.verb).toBe('analyze');
    });

    it('should return metadata with verb count', () => {
      const result = ps_parse({ expression: '::extract{data} > ::filter{results} > ::sort{output}' });
      expect(result.success).toBe(true);
      expect(result.metadata!.verbCount).toBe(3);
      expect(result.metadata!.verbs).toEqual(['extract', 'filter', 'sort']);
      expect(result.metadata!.hasPipes).toBe(true);
    });

    it('should detect filters and modifiers in metadata', () => {
      const result = ps_parse({ expression: '::gen{code}[lang:python]|format:json' });
      expect(result.metadata!.hasFilters).toBe(true);
      expect(result.metadata!.hasModifiers).toBe(true);
    });

    it('should detect branch in metadata', () => {
      const result = ps_parse({ expression: '?valid > ::report{ok}' });
      expect(result.metadata!.hasBranch).toBe(true);
    });

    it('should return error for invalid expression', () => {
      const result = ps_parse({ expression: '::{doc}' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.ast).toBeUndefined();
    });

    it('should return error for empty input', () => {
      const result = ps_parse({ expression: '' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Empty');
    });
  });

  describe('ps_expand', () => {
    it('should expand expression to English', () => {
      const result = ps_expand({ expression: '::analyze{document}[security]' });
      expect(result.success).toBe(true);
      expect(result.english).toBe('Analyze document focusing on security');
    });

    it('should expand piped expression', () => {
      const result = ps_expand({ expression: '::extract{data} > ::report{findings}' });
      expect(result.success).toBe(true);
      expect(result.english).toBe('Extract data, then Report findings');
    });

    it('should return error for invalid expression', () => {
      const result = ps_expand({ expression: '::' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
