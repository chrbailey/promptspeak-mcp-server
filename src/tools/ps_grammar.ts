/**
 * Grammar MCP Tool Handlers
 *
 * ps_parse  — Parse PromptSpeak expression into AST + metadata
 * ps_expand — Expand PromptSpeak expression to natural English
 */

import { parse, ParseError } from '../grammar/parser.js';
import { expand } from '../grammar/expander.js';
import type { ExpressionNode } from '../grammar/ast.js';

export interface ParseRequest {
  expression: string;
}

export interface ParseResult {
  success: boolean;
  ast?: ExpressionNode;
  metadata?: {
    verbCount: number;
    verbs: string[];
    hasPipes: boolean;
    hasBranch: boolean;
    hasFilters: boolean;
    hasModifiers: boolean;
  };
  error?: string;
}

export interface ExpandRequest {
  expression: string;
}

export interface ExpandResult {
  success: boolean;
  english?: string;
  error?: string;
}

function extractMetadata(ast: ExpressionNode) {
  const verbs: string[] = [ast.body.verb];
  for (const piped of ast.pipes) {
    verbs.push(piped.verb);
  }

  return {
    verbCount: verbs.length,
    verbs,
    hasPipes: ast.pipes.length > 0,
    hasBranch: ast.branch !== undefined,
    hasFilters: ast.body.filter !== undefined,
    hasModifiers: ast.body.modifiers.length > 0,
  };
}

export function ps_parse(args: ParseRequest): ParseResult {
  try {
    const ast = parse(args.expression);
    return {
      success: true,
      ast,
      metadata: extractMetadata(ast),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ParseError
        ? error.message
        : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function ps_expand(args: ExpandRequest): ExpandResult {
  try {
    const ast = parse(args.expression);
    return {
      success: true,
      english: expand(ast),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ParseError
        ? error.message
        : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
