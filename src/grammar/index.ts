/**
 * PromptSpeak Grammar Module
 *
 * EBNF grammar parser, AST types, and English expander.
 */

export { NodeType, type ActionNode, type TargetNode, type FilterNode, type ModifierNode, type ExpressionNode, type BranchNode, type Noun, type Qualifier, type ASTNode } from './ast.js';
export { tokenize, TokenType, type Token } from './lexer.js';
export { parse, ParseError } from './parser.js';
export { expand } from './expander.js';
export { validateExpression, type ExpressionValidationReport, type VerbCheckResult, type ExpressionDecision } from './governance.js';
