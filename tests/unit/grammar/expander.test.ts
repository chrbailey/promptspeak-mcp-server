import { describe, it, expect } from 'vitest';
import { parse } from '../../../src/grammar/parser.js';
import { expand } from '../../../src/grammar/expander.js';

describe('Expander', () => {
  it('should expand simple verb', () => {
    expect(expand(parse('::analyze'))).toBe('Analyze');
  });

  it('should expand abbreviated verbs', () => {
    expect(expand(parse('::gen'))).toBe('Generate');
    expect(expand(parse('::eval'))).toBe('Evaluate');
    expect(expand(parse('::summary'))).toBe('Summarize');
  });

  it('should expand verb with target', () => {
    expect(expand(parse('::analyze{document}'))).toBe('Analyze document');
  });

  it('should expand multiple targets', () => {
    expect(expand(parse('::extract{data, metadata}'))).toBe('Extract data, metadata');
  });

  it('should expand qualified noun', () => {
    expect(expand(parse('::analyze{doc:report}'))).toBe('Analyze doc:report');
  });

  it('should expand filter', () => {
    expect(expand(parse('::analyze{doc}[security]'))).toBe('Analyze doc focusing on security');
  });

  it('should expand qualified filter', () => {
    expect(expand(parse('::gen{code}[lang:python]'))).toBe('Generate code focusing on lang=python');
  });

  it('should expand modifiers', () => {
    expect(expand(parse('::gen{code}|format:json'))).toBe('Generate code with format=json');
  });

  it('should expand multiple modifiers', () => {
    expect(expand(parse('::gen{code}|format:json|lang:python'))).toBe('Generate code with format=json, lang=python');
  });

  it('should expand piped actions', () => {
    expect(expand(parse('::analyze{doc} > ::report{findings}'))).toBe('Analyze doc, then Report findings');
  });

  it('should expand three-action pipe', () => {
    const result = expand(parse('::extract{data} > ::filter{results}|min:10 > ::sort{output}'));
    expect(result).toBe('Extract data, then Filter results with min=10, then Sort output');
  });

  it('should expand branch with true path only', () => {
    expect(expand(parse('?valid > ::report{ok}'))).toBe('If valid then Report ok');
  });

  it('should expand branch with both paths', () => {
    expect(expand(parse('?valid > ::report{ok} : ::alert{error}'))).toBe('If valid then Report ok, else Alert error');
  });

  it('should expand full complex expression', () => {
    const result = expand(parse('::extract{data, metadata}[format:csv, recent]|limit:100|sort:desc'));
    expect(result).toBe('Extract data, metadata focusing on format=csv, recent with limit=100, sort=desc');
  });

  it('should handle unknown verbs by capitalizing', () => {
    expect(expand(parse('::foobar{thing}'))).toBe('Foobar thing');
  });

  it('should expand procurement verbs', () => {
    expect(expand(parse('::propose{teaming}|prime:ERP_Access'))).toBe('Propose teaming with prime=ERP_Access');
    expect(expand(parse('::seek{partner}[cloud_migration]'))).toBe('Seek partner focusing on cloud_migration');
  });
});
