import { describe, it, expect } from 'vitest';
import { tokenize, TokenType, type Token } from '../../../src/grammar/lexer.js';

describe('Lexer', () => {
  it('should tokenize simple action ::analyze', () => {
    const tokens = tokenize('::analyze');
    expect(tokens).toEqual([
      { type: TokenType.ActionPrefix, value: '::', position: 0 },
      { type: TokenType.Identifier, value: 'analyze', position: 2 },
      { type: TokenType.EOF, value: '', position: 9 },
    ]);
  });

  it('should tokenize action with target ::analyze{document}', () => {
    const tokens = tokenize('::analyze{document}');
    expect(tokens).toEqual([
      { type: TokenType.ActionPrefix, value: '::', position: 0 },
      { type: TokenType.Identifier, value: 'analyze', position: 2 },
      { type: TokenType.LBrace, value: '{', position: 9 },
      { type: TokenType.Identifier, value: 'document', position: 10 },
      { type: TokenType.RBrace, value: '}', position: 18 },
      { type: TokenType.EOF, value: '', position: 19 },
    ]);
  });

  it('should tokenize filter ::analyze{doc}[security,compliance]', () => {
    const tokens = tokenize('::analyze{doc}[security,compliance]');
    expect(tokens).toContainEqual({ type: TokenType.LBracket, value: '[', position: 14 });
    expect(tokens).toContainEqual({ type: TokenType.Comma, value: ',', position: 23 });
    expect(tokens).toContainEqual({ type: TokenType.RBracket, value: ']', position: 34 });
  });

  it('should tokenize modifier |format:json', () => {
    const tokens = tokenize('::gen{code}|format:json');
    expect(tokens).toContainEqual({ type: TokenType.Pipe, value: '|', position: 11 });
    expect(tokens).toContainEqual({ type: TokenType.Colon, value: ':', position: 18 });
    expect(tokens).toContainEqual({ type: TokenType.Identifier, value: 'json', position: 19 });
  });

  it('should tokenize pipe > operator', () => {
    const tokens = tokenize('::analyze{doc} > ::report{findings}');
    expect(tokens).toContainEqual({ type: TokenType.PipeOp, value: '>', position: 15 });
  });

  it('should tokenize branch ? operator', () => {
    const tokens = tokenize('?valid > ::report{ok}');
    expect(tokens[0]).toEqual({ type: TokenType.Question, value: '?', position: 0 });
  });

  it('should tokenize string literal "hello world"', () => {
    const tokens = tokenize('::gen{text}|content:"hello world"');
    expect(tokens).toContainEqual({ type: TokenType.StringLiteral, value: 'hello world', position: 20 });
  });

  it('should tokenize number 3.14', () => {
    const tokens = tokenize('::eval{score}|threshold:3.14');
    expect(tokens).toContainEqual({ type: TokenType.NumberLiteral, value: '3.14', position: 24 });
  });

  it('should tokenize colon in qualified noun ::analyze{doc:report}', () => {
    const tokens = tokenize('::analyze{doc:report}');
    expect(tokens).toContainEqual({ type: TokenType.Colon, value: ':', position: 13 });
    expect(tokens).toContainEqual({ type: TokenType.Identifier, value: 'report', position: 14 });
  });

  it('should handle whitespace between tokens', () => {
    const t1 = tokenize('::analyze { document }');
    const t2 = tokenize('::analyze{document}');
    // Same meaningful tokens (ignoring positions)
    const strip = (tokens: Token[]) => tokens.map(t => ({ type: t.type, value: t.value }));
    expect(strip(t1)).toEqual(strip(t2));
  });

  it('should throw on unexpected character', () => {
    expect(() => tokenize('::analyze@doc')).toThrow(/Unexpected character/);
  });

  it('should tokenize multi-action pipeline', () => {
    const tokens = tokenize('::extract{data}[email] > ::filter{results}|min:10 > ::sort{output}');
    const pipeOps = tokens.filter(t => t.type === TokenType.PipeOp);
    expect(pipeOps).toHaveLength(2);
    const actionPrefixes = tokens.filter(t => t.type === TokenType.ActionPrefix);
    expect(actionPrefixes).toHaveLength(3);
  });

  it('should tokenize branch with colon separator', () => {
    const tokens = tokenize('?valid > ::report{ok} : ::alert{error}');
    const branchSeps = tokens.filter(t => t.type === TokenType.BranchSep);
    expect(branchSeps).toHaveLength(1);
  });

  it('should tokenize identifiers with hyphens', () => {
    const tokens = tokenize('::seek{partner}[cloud-migration, AWS-GovCloud]');
    const ids = tokens.filter(t => t.type === TokenType.Identifier);
    expect(ids.map(t => t.value)).toContain('cloud-migration');
    expect(ids.map(t => t.value)).toContain('AWS-GovCloud');
  });
});
