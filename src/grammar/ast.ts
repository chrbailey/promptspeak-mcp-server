/**
 * PromptSpeak EBNF Grammar — AST Node Types
 *
 * Represents the parsed form of PromptSpeak expressions:
 *   ::verb{target}[filter]|key:value > ::verb2
 *
 * Grammar (EBNF from v0.2 spec Section 2.2):
 *   <expr>      ::= <action> <pipes>?
 *   <action>    ::= '::' <verb> <target>? <filter>? <modifiers>?
 *   <target>    ::= '{' <noun> (',' <noun>)* '}'
 *   <filter>    ::= '[' <qualifier> (',' <qualifier>)* ']'
 *   <qualifier> ::= <ident> | <ident> ':' <value>
 *   <modifiers> ::= ('|' <key> ':' <value>)+
 *   <pipes>     ::= ('>' <action>)+
 *   <branch>    ::= '?' <condition> '>' <expr> (':' <expr>)?
 */

export enum NodeType {
  Expression = 'Expression',
  Action = 'Action',
  Target = 'Target',
  Filter = 'Filter',
  Modifier = 'Modifier',
  Pipe = 'Pipe',
  Branch = 'Branch',
}

export interface Noun {
  name: string;
  value?: string;
}

export interface Qualifier {
  key: string;
  value?: string;
}

export interface TargetNode {
  type: NodeType.Target;
  nouns: Noun[];
}

export interface FilterNode {
  type: NodeType.Filter;
  qualifiers: Qualifier[];
}

export interface ModifierNode {
  type: NodeType.Modifier;
  key: string;
  value: string;
}

export interface ActionNode {
  type: NodeType.Action;
  verb: string;
  target?: TargetNode;
  filter?: FilterNode;
  modifiers: ModifierNode[];
}

export interface PipeNode {
  type: NodeType.Pipe;
  actions: ActionNode[];
}

export interface BranchNode {
  type: NodeType.Branch;
  condition: string;
  trueBranch: ActionNode | ExpressionNode;
  falseBranch?: ActionNode | ExpressionNode;
}

export interface ExpressionNode {
  type: NodeType.Expression;
  body: ActionNode;
  pipes: ActionNode[];
  branch?: BranchNode;
}

export type ASTNode =
  | ExpressionNode
  | ActionNode
  | TargetNode
  | FilterNode
  | ModifierNode
  | PipeNode
  | BranchNode;
