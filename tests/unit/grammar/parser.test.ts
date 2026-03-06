import { describe, it, expect } from 'vitest';
import { parse, ParseError } from '../../../src/grammar/parser.js';
import { NodeType } from '../../../src/grammar/ast.js';

describe('Parser', () => {
  describe('simple actions', () => {
    it('should parse ::analyze', () => {
      const ast = parse('::analyze');
      expect(ast.type).toBe(NodeType.Expression);
      expect(ast.body.verb).toBe('analyze');
      expect(ast.body.target).toBeUndefined();
      expect(ast.body.filter).toBeUndefined();
      expect(ast.body.modifiers).toHaveLength(0);
      expect(ast.pipes).toHaveLength(0);
    });

    it('should parse ::analyze{document}', () => {
      const ast = parse('::analyze{document}');
      expect(ast.body.verb).toBe('analyze');
      expect(ast.body.target!.nouns).toEqual([{ name: 'document', value: undefined }]);
    });

    it('should parse multiple nouns ::analyze{document, code}', () => {
      const ast = parse('::analyze{document, code}');
      expect(ast.body.target!.nouns).toHaveLength(2);
      expect(ast.body.target!.nouns[0].name).toBe('document');
      expect(ast.body.target!.nouns[1].name).toBe('code');
    });

    it('should parse qualified noun ::analyze{doc:report}', () => {
      const ast = parse('::analyze{doc:report}');
      expect(ast.body.target!.nouns[0]).toEqual({ name: 'doc', value: 'report' });
    });
  });

  describe('filters', () => {
    it('should parse single filter', () => {
      const ast = parse('::analyze{doc}[security]');
      expect(ast.body.filter!.qualifiers).toEqual([{ key: 'security', value: undefined }]);
    });

    it('should parse multiple filters', () => {
      const ast = parse('::analyze{doc}[security, compliance]');
      expect(ast.body.filter!.qualifiers).toHaveLength(2);
    });

    it('should parse qualified filter', () => {
      const ast = parse('::gen{code}[lang:python]');
      expect(ast.body.filter!.qualifiers[0]).toEqual({ key: 'lang', value: 'python' });
    });
  });

  describe('modifiers', () => {
    it('should parse single modifier', () => {
      const ast = parse('::gen{code}|format:json');
      expect(ast.body.modifiers).toHaveLength(1);
      expect(ast.body.modifiers[0]).toEqual({ type: NodeType.Modifier, key: 'format', value: 'json' });
    });

    it('should parse multiple modifiers', () => {
      const ast = parse('::gen{code}|format:json|lang:python');
      expect(ast.body.modifiers).toHaveLength(2);
      expect(ast.body.modifiers[0].key).toBe('format');
      expect(ast.body.modifiers[1].key).toBe('lang');
    });

    it('should parse string value modifier', () => {
      const ast = parse('::gen{text}|content:"hello world"');
      expect(ast.body.modifiers[0].value).toBe('hello world');
    });

    it('should parse numeric value modifier', () => {
      const ast = parse('::eval{score}|threshold:3.14');
      expect(ast.body.modifiers[0].value).toBe('3.14');
    });
  });

  describe('pipes', () => {
    it('should parse two-action pipe', () => {
      const ast = parse('::analyze{doc} > ::report{findings}');
      expect(ast.pipes).toHaveLength(1);
      expect(ast.pipes[0].verb).toBe('report');
      expect(ast.pipes[0].target!.nouns[0].name).toBe('findings');
    });

    it('should parse three-action pipe', () => {
      const ast = parse('::extract{data}[email] > ::filter{results}|min:10 > ::sort{output}');
      expect(ast.pipes).toHaveLength(2);
      expect(ast.pipes[0].verb).toBe('filter');
      expect(ast.pipes[0].modifiers[0].value).toBe('10');
      expect(ast.pipes[1].verb).toBe('sort');
    });
  });

  describe('branches', () => {
    it('should parse branch with true path only', () => {
      const ast = parse('?valid > ::report{ok}');
      expect(ast.branch).toBeDefined();
      expect(ast.branch!.condition).toBe('valid');
      expect((ast.branch!.trueBranch as any).verb).toBe('report');
    });

    it('should parse branch with true and false paths', () => {
      const ast = parse('?valid > ::report{ok} : ::alert{error}');
      expect(ast.branch!.falseBranch).toBeDefined();
      expect((ast.branch!.falseBranch as any).verb).toBe('alert');
    });
  });

  describe('complex expressions from spec', () => {
    it('should parse procurement capability statement', () => {
      const ast = parse('::propose{teaming}|prime:ERP_Access|share:51');
      expect(ast.body.verb).toBe('propose');
      expect(ast.body.target!.nouns[0].name).toBe('teaming');
      expect(ast.body.modifiers).toHaveLength(2);
      expect(ast.body.modifiers[0].key).toBe('prime');
      expect(ast.body.modifiers[1].value).toBe('51');
    });

    it('should parse piped procurement flow', () => {
      const ast = parse('::seek{partner}[cloud_migration, AWS_GovCloud] > ::certify{SDVOSB, SAM_active}');
      expect(ast.body.verb).toBe('seek');
      expect(ast.body.filter!.qualifiers).toHaveLength(2);
      expect(ast.pipes[0].verb).toBe('certify');
      expect(ast.pipes[0].target!.nouns).toHaveLength(2);
    });

    it('should parse action with all components', () => {
      const ast = parse('::extract{data, metadata}[format:csv, recent]|limit:100|sort:desc');
      expect(ast.body.verb).toBe('extract');
      expect(ast.body.target!.nouns).toHaveLength(2);
      expect(ast.body.filter!.qualifiers).toHaveLength(2);
      expect(ast.body.modifiers).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw on empty input', () => {
      expect(() => parse('')).toThrow(ParseError);
    });

    it('should throw on missing verb after ::', () => {
      expect(() => parse('::{doc}')).toThrow(ParseError);
    });

    it('should throw on unclosed target brace', () => {
      expect(() => parse('::analyze{doc')).toThrow(ParseError);
    });

    it('should throw on unclosed filter bracket', () => {
      expect(() => parse('::analyze{doc}[security')).toThrow(ParseError);
    });
  });
});
