/**
 * PromptSpeak EBNF Grammar — Lexer (Tokenizer)
 *
 * Converts raw PromptSpeak strings into token streams.
 * Tokens are the input to the recursive descent parser.
 */

export enum TokenType {
  ActionPrefix = 'ActionPrefix',   // ::
  Identifier = 'Identifier',       // verb, noun, qualifier names
  LBrace = 'LBrace',               // {
  RBrace = 'RBrace',               // }
  LBracket = 'LBracket',           // [
  RBracket = 'RBracket',           // ]
  Pipe = 'Pipe',                   // | (modifier separator)
  PipeOp = 'PipeOp',               // > (chain operator)
  Question = 'Question',           // ? (branch)
  Colon = 'Colon',                 // : (key:value separator)
  BranchSep = 'BranchSep',         // : (branch else separator)
  Comma = 'Comma',                 // ,
  StringLiteral = 'StringLiteral', // "..."
  NumberLiteral = 'NumberLiteral', // 123, 3.14
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Tokenize a PromptSpeak expression string into a token array.
 *
 * @param input - Raw PromptSpeak expression
 * @returns Array of tokens
 * @throws Error on unexpected characters
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  // Context tracking for disambiguating : as Colon vs BranchSep
  let seenQuestion = false;
  let seenPipeAfterQuestion = false;

  while (pos < input.length) {
    // Skip whitespace
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    // :: action prefix
    if (input[pos] === ':' && pos + 1 < input.length && input[pos + 1] === ':') {
      tokens.push({ type: TokenType.ActionPrefix, value: '::', position: pos });
      pos += 2;
      continue;
    }

    // String literal
    if (input[pos] === '"') {
      const start = pos;
      pos++; // skip opening "
      let value = '';
      while (pos < input.length && input[pos] !== '"') {
        value += input[pos];
        pos++;
      }
      if (pos >= input.length) throw new Error(`Unterminated string at position ${start}`);
      pos++; // skip closing "
      tokens.push({ type: TokenType.StringLiteral, value, position: start });
      continue;
    }

    // Number literal (must check before single-char to handle digits)
    if (/[0-9]/.test(input[pos])) {
      const start = pos;
      let value = '';
      while (pos < input.length && /[0-9.]/.test(input[pos])) {
        value += input[pos];
        pos++;
      }
      tokens.push({ type: TokenType.NumberLiteral, value, position: start });
      continue;
    }

    // Single-character tokens
    const ch = input[pos];
    switch (ch) {
      case '{':
        tokens.push({ type: TokenType.LBrace, value: '{', position: pos });
        pos++;
        continue;
      case '}':
        tokens.push({ type: TokenType.RBrace, value: '}', position: pos });
        pos++;
        continue;
      case '[':
        tokens.push({ type: TokenType.LBracket, value: '[', position: pos });
        pos++;
        continue;
      case ']':
        tokens.push({ type: TokenType.RBracket, value: ']', position: pos });
        pos++;
        continue;
      case '|':
        tokens.push({ type: TokenType.Pipe, value: '|', position: pos });
        pos++;
        continue;
      case '>':
        tokens.push({ type: TokenType.PipeOp, value: '>', position: pos });
        pos++;
        if (seenQuestion) seenPipeAfterQuestion = true;
        continue;
      case '?':
        tokens.push({ type: TokenType.Question, value: '?', position: pos });
        pos++;
        seenQuestion = true;
        seenPipeAfterQuestion = false;
        continue;
      case ',':
        tokens.push({ type: TokenType.Comma, value: ',', position: pos });
        pos++;
        continue;
      case ':':
        // BranchSep: we're in ?cond > expr context and this : separates true/false branches
        if (seenQuestion && seenPipeAfterQuestion) {
          tokens.push({ type: TokenType.BranchSep, value: ':', position: pos });
          pos++;
          seenQuestion = false;
          seenPipeAfterQuestion = false;
        } else {
          tokens.push({ type: TokenType.Colon, value: ':', position: pos });
          pos++;
        }
        continue;
    }

    // Identifier: [a-zA-Z_][a-zA-Z0-9_-]*
    if (/[a-zA-Z_]/.test(ch)) {
      const start = pos;
      let value = '';
      while (pos < input.length && /[a-zA-Z0-9_\-]/.test(input[pos])) {
        value += input[pos];
        pos++;
      }
      tokens.push({ type: TokenType.Identifier, value, position: start });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${pos}`);
  }

  tokens.push({ type: TokenType.EOF, value: '', position: pos });
  return tokens;
}
