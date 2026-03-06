/**
 * PromptSpeak EBNF Grammar — Recursive Descent Parser
 *
 * Parses token stream into AST. Left-to-right, single-pass.
 * Every valid expression has exactly one parse tree.
 */

import { tokenize, TokenType, type Token } from './lexer.js';
import {
  NodeType,
  type ActionNode,
  type TargetNode,
  type FilterNode,
  type ModifierNode,
  type ExpressionNode,
  type BranchNode,
  type Noun,
  type Qualifier,
} from './ast.js';

export class ParseError extends Error {
  constructor(message: string, public position: number) {
    super(`Parse error at position ${position}: ${message}`);
    this.name = 'ParseError';
  }
}

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', position: -1 };
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(
        `Expected ${type} but got ${token.type} ('${token.value}')`,
        token.position
      );
    }
    return this.advance();
  }

  /** <expr> ::= (<branch> | <action>) <pipes>? */
  parseExpression(): ExpressionNode {
    if (this.peek().type === TokenType.Question) {
      const branch = this.parseBranch();
      const body = branch.trueBranch.type === NodeType.Action
        ? branch.trueBranch as ActionNode
        : (branch.trueBranch as ExpressionNode).body;
      return {
        type: NodeType.Expression,
        body,
        pipes: [],
        branch,
      };
    }

    const action = this.parseAction();
    const pipes: ActionNode[] = [];

    while (this.peek().type === TokenType.PipeOp) {
      this.advance();
      pipes.push(this.parseAction());
    }

    return { type: NodeType.Expression, body: action, pipes };
  }

  /** <action> ::= '::' <verb> <target>? <filter>? <modifiers>? */
  parseAction(): ActionNode {
    this.expect(TokenType.ActionPrefix);
    const verbToken = this.expect(TokenType.Identifier);

    let target: TargetNode | undefined;
    let filter: FilterNode | undefined;
    const modifiers: ModifierNode[] = [];

    if (this.peek().type === TokenType.LBrace) {
      target = this.parseTarget();
    }

    if (this.peek().type === TokenType.LBracket) {
      filter = this.parseFilter();
    }

    while (this.peek().type === TokenType.Pipe) {
      modifiers.push(this.parseModifier());
    }

    return { type: NodeType.Action, verb: verbToken.value, target, filter, modifiers };
  }

  /** <target> ::= '{' <noun> (',' <noun>)* '}' */
  parseTarget(): TargetNode {
    this.expect(TokenType.LBrace);
    const nouns: Noun[] = [this.parseNoun()];

    while (this.peek().type === TokenType.Comma) {
      this.advance();
      nouns.push(this.parseNoun());
    }

    this.expect(TokenType.RBrace);
    return { type: NodeType.Target, nouns };
  }

  /** <noun> ::= <ident> | <ident> ':' <value> */
  parseNoun(): Noun {
    const nameToken = this.expect(TokenType.Identifier);
    let value: string | undefined;

    if (this.peek().type === TokenType.Colon) {
      this.advance();
      value = this.parseValue();
    }

    return { name: nameToken.value, value };
  }

  /** <filter> ::= '[' <qualifier> (',' <qualifier>)* ']' */
  parseFilter(): FilterNode {
    this.expect(TokenType.LBracket);
    const qualifiers: Qualifier[] = [this.parseQualifier()];

    while (this.peek().type === TokenType.Comma) {
      this.advance();
      qualifiers.push(this.parseQualifier());
    }

    this.expect(TokenType.RBracket);
    return { type: NodeType.Filter, qualifiers };
  }

  /** <qualifier> ::= <ident> | <ident> ':' <value> */
  parseQualifier(): Qualifier {
    const keyToken = this.expect(TokenType.Identifier);
    let value: string | undefined;

    if (this.peek().type === TokenType.Colon) {
      this.advance();
      value = this.parseValue();
    }

    return { key: keyToken.value, value };
  }

  /** <modifier> ::= '|' <key> ':' <value> */
  parseModifier(): ModifierNode {
    this.expect(TokenType.Pipe);
    const keyToken = this.expect(TokenType.Identifier);
    this.expect(TokenType.Colon);
    const value = this.parseValue();

    return { type: NodeType.Modifier, key: keyToken.value, value };
  }

  /** <value> ::= <ident> | <number> | <string> */
  parseValue(): string {
    const token = this.peek();
    switch (token.type) {
      case TokenType.Identifier:
      case TokenType.NumberLiteral:
      case TokenType.StringLiteral:
        this.advance();
        return token.value;
      default:
        throw new ParseError(
          `Expected value (identifier, number, or string) but got ${token.type}`,
          token.position
        );
    }
  }

  /** <branch> ::= '?' <condition> '>' <action> (':' <action>)? */
  parseBranch(): BranchNode {
    this.expect(TokenType.Question);
    const condToken = this.expect(TokenType.Identifier);
    this.expect(TokenType.PipeOp);

    const trueBranch = this.parseAction();
    let falseBranch: ActionNode | undefined;

    if (this.peek().type === TokenType.BranchSep) {
      this.advance();
      falseBranch = this.parseAction();
    }

    return { type: NodeType.Branch, condition: condToken.value, trueBranch, falseBranch };
  }
}

/**
 * Parse a PromptSpeak expression string into an AST.
 *
 * @param input - Raw PromptSpeak expression
 * @returns Parsed AST
 * @throws ParseError on invalid syntax
 */
export function parse(input: string): ExpressionNode {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ParseError('Empty expression', 0);
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  return parser.parseExpression();
}
