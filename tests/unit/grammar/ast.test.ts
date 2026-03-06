import { describe, it, expect } from 'vitest';
import {
  NodeType,
  type ActionNode,
  type TargetNode,
  type FilterNode,
  type ModifierNode,
  type PipeNode,
  type BranchNode,
  type ExpressionNode,
} from '../../../src/grammar/ast.js';

describe('AST Node Types', () => {
  it('should create ActionNode with verb only', () => {
    const node: ActionNode = {
      type: NodeType.Action,
      verb: 'analyze',
      target: undefined,
      filter: undefined,
      modifiers: [],
    };
    expect(node.type).toBe(NodeType.Action);
    expect(node.verb).toBe('analyze');
    expect(node.modifiers).toHaveLength(0);
  });

  it('should create ActionNode with target and filter', () => {
    const target: TargetNode = {
      type: NodeType.Target,
      nouns: [{ name: 'document', value: undefined }],
    };
    const filter: FilterNode = {
      type: NodeType.Filter,
      qualifiers: [{ key: 'security' }, { key: 'compliance' }],
    };
    const modifier: ModifierNode = {
      type: NodeType.Modifier,
      key: 'format',
      value: 'json',
    };
    const node: ActionNode = {
      type: NodeType.Action,
      verb: 'extract',
      target,
      filter,
      modifiers: [modifier],
    };
    expect(node.target!.nouns).toHaveLength(1);
    expect(node.filter!.qualifiers).toHaveLength(2);
    expect(node.modifiers).toHaveLength(1);
    expect(node.modifiers[0].key).toBe('format');
  });

  it('should create PipeNode chaining actions', () => {
    const pipe: PipeNode = {
      type: NodeType.Pipe,
      actions: [
        { type: NodeType.Action, verb: 'analyze', modifiers: [] },
        { type: NodeType.Action, verb: 'report', modifiers: [] },
      ],
    };
    expect(pipe.type).toBe(NodeType.Pipe);
    expect(pipe.actions).toHaveLength(2);
    expect(pipe.actions[0].verb).toBe('analyze');
    expect(pipe.actions[1].verb).toBe('report');
  });

  it('should create BranchNode with true and false paths', () => {
    const branch: BranchNode = {
      type: NodeType.Branch,
      condition: 'valid',
      trueBranch: { type: NodeType.Action, verb: 'report', modifiers: [] },
      falseBranch: { type: NodeType.Action, verb: 'alert', modifiers: [] },
    };
    expect(branch.type).toBe(NodeType.Branch);
    expect(branch.condition).toBe('valid');
    expect(branch.trueBranch.type).toBe(NodeType.Action);
    expect(branch.falseBranch).toBeDefined();
  });

  it('should create ExpressionNode as top-level container', () => {
    const expr: ExpressionNode = {
      type: NodeType.Expression,
      body: {
        type: NodeType.Action,
        verb: 'analyze',
        target: { type: NodeType.Target, nouns: [{ name: 'code' }] },
        modifiers: [],
      },
      pipes: [
        { type: NodeType.Action, verb: 'report', modifiers: [] },
      ],
    };
    expect(expr.type).toBe(NodeType.Expression);
    expect(expr.body.verb).toBe('analyze');
    expect(expr.pipes).toHaveLength(1);
    expect(expr.pipes[0].verb).toBe('report');
  });

  it('should support qualified nouns in target', () => {
    const target: TargetNode = {
      type: NodeType.Target,
      nouns: [
        { name: 'doc', value: 'report' },
        { name: 'config', value: 'yaml' },
      ],
    };
    expect(target.nouns[0].name).toBe('doc');
    expect(target.nouns[0].value).toBe('report');
    expect(target.nouns[1].value).toBe('yaml');
  });

  it('should support qualified filter entries', () => {
    const filter: FilterNode = {
      type: NodeType.Filter,
      qualifiers: [
        { key: 'lang', value: 'python' },
        { key: 'security' },
      ],
    };
    expect(filter.qualifiers[0].value).toBe('python');
    expect(filter.qualifiers[1].value).toBeUndefined();
  });
});
