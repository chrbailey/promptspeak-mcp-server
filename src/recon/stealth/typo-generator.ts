/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TYPO GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates realistic typos and corrections to make messages appear more human.
 * Humans make predictable types of mistakes based on keyboard layout, typing
 * speed, and cognitive load.
 *
 * Typo Types:
 * - Adjacent key: Hitting a neighboring key (e.g., "teh" for "the")
 * - Transposition: Swapping adjacent letters (e.g., "hte" for "the")
 * - Omission: Missing a letter (e.g., "th" for "the")
 * - Doubling: Typing a letter twice (e.g., "thee" for "the")
 * - Phonetic: Spelling by sound (e.g., "definately" for "definitely")
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { ErrorConfig } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Types of typos that can be generated.
 */
export type TypoType = 'adjacent_key' | 'transposition' | 'omission' | 'doubling';

/**
 * A generated typo.
 */
export interface Typo {
  /** Position in the original text */
  position: number;

  /** Original character(s) */
  original: string;

  /** Typo version */
  typo: string;

  /** Type of typo */
  type: TypoType;

  /** Whether this typo will be corrected */
  will_correct: boolean;
}

/**
 * Result of applying typos to a message.
 */
export interface TypoResult {
  /** Original message */
  original: string;

  /** Message with typos (uncorrected version) */
  with_typos: string;

  /** Message with corrections shown (e.g., "teh*the") */
  with_corrections: string;

  /** Final message (after corrections applied) */
  final: string;

  /** Typos generated */
  typos: Typo[];

  /** Positions where corrections happen */
  correction_positions: number[];
}

/**
 * Common phonetic mistakes.
 */
interface PhoneticMistake {
  correct: string;
  mistake: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * QWERTY keyboard layout for adjacent key typos.
 */
const QWERTY_ADJACENT: Record<string, string[]> = {
  'a': ['q', 'w', 's', 'z'],
  'b': ['v', 'g', 'h', 'n'],
  'c': ['x', 'd', 'f', 'v'],
  'd': ['s', 'e', 'r', 'f', 'c', 'x'],
  'e': ['w', 's', 'd', 'r'],
  'f': ['d', 'r', 't', 'g', 'v', 'c'],
  'g': ['f', 't', 'y', 'h', 'b', 'v'],
  'h': ['g', 'y', 'u', 'j', 'n', 'b'],
  'i': ['u', 'j', 'k', 'o'],
  'j': ['h', 'u', 'i', 'k', 'n', 'm'],
  'k': ['j', 'i', 'o', 'l', 'm'],
  'l': ['k', 'o', 'p'],
  'm': ['n', 'j', 'k'],
  'n': ['b', 'h', 'j', 'm'],
  'o': ['i', 'k', 'l', 'p'],
  'p': ['o', 'l'],
  'q': ['w', 'a'],
  'r': ['e', 'd', 'f', 't'],
  's': ['a', 'w', 'e', 'd', 'x', 'z'],
  't': ['r', 'f', 'g', 'y'],
  'u': ['y', 'h', 'j', 'i'],
  'v': ['c', 'f', 'g', 'b'],
  'w': ['q', 'a', 's', 'e'],
  'x': ['z', 's', 'd', 'c'],
  'y': ['t', 'g', 'h', 'u'],
  'z': ['a', 's', 'x'],
};

/**
 * Common phonetic spelling mistakes.
 */
const PHONETIC_MISTAKES: PhoneticMistake[] = [
  { correct: 'definitely', mistake: 'definately' },
  { correct: 'separate', mistake: 'seperate' },
  { correct: 'occurrence', mistake: 'occurence' },
  { correct: 'receive', mistake: 'recieve' },
  { correct: 'believe', mistake: 'beleive' },
  { correct: 'their', mistake: 'thier' },
  { correct: 'until', mistake: 'untill' },
  { correct: 'necessary', mistake: 'neccessary' },
  { correct: 'accommodate', mistake: 'accomodate' },
  { correct: 'occurred', mistake: 'occured' },
];

/**
 * Words that are commonly typed fast and prone to transposition.
 */
const TRANSPOSITION_PRONE_WORDS = new Set([
  'the', 'and', 'that', 'have', 'with', 'this', 'from', 'they', 'been', 'would',
  'there', 'their', 'what', 'about', 'when', 'make', 'like', 'just', 'know', 'take',
]);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPO GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates realistic typos.
 */
export class TypoGenerator {
  private config: ErrorConfig;

  constructor(config: ErrorConfig) {
    this.config = config;
  }

  /**
   * Generate typos for a message.
   */
  generateTypos(message: string): TypoResult {
    const typos: Typo[] = [];
    let workingMessage = message;

    // Get words and their positions
    const wordMatches = [...message.matchAll(/\b[a-zA-Z]+\b/g)];

    for (const match of wordMatches) {
      const word = match[0];
      const wordStart = match.index!;

      // Decide if this word gets a typo
      if (Math.random() > this.config.typo_probability * word.length / 5) {
        continue; // No typo for this word
      }

      // Select typo type
      const typoType = this.selectTypoType();
      if (!this.config.typo_types.includes(typoType)) {
        continue; // This typo type is disabled
      }

      // Generate typo
      const typo = this.generateTypo(word, wordStart, typoType);
      if (typo) {
        typos.push(typo);
      }
    }

    // Apply typos to create the typo version
    const with_typos = this.applyTypos(message, typos);

    // Determine corrections
    const correctionPositions: number[] = [];
    for (const typo of typos) {
      typo.will_correct = Math.random() < this.config.correction_probability;
      if (typo.will_correct) {
        correctionPositions.push(typo.position);
      }
    }

    // Create corrected version
    const with_corrections = this.createCorrectionView(message, typos);

    // Create final version (some typos corrected, some not)
    const final = this.createFinalVersion(message, typos);

    return {
      original: message,
      with_typos,
      with_corrections,
      final,
      typos,
      correction_positions: correctionPositions,
    };
  }

  /**
   * Generate a simple typo for a single word.
   */
  generateSimpleTypo(word: string): { typo: string; type: TypoType } | null {
    const typoType = this.selectTypoType();

    switch (typoType) {
      case 'adjacent_key':
        return this.createAdjacentKeyTypo(word);
      case 'transposition':
        return this.createTranspositionTypo(word);
      case 'omission':
        return this.createOmissionTypo(word);
      case 'doubling':
        return this.createDoublingTypo(word);
      default:
        return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TYPO TYPE SELECTION
  // ─────────────────────────────────────────────────────────────────────────────

  private selectTypoType(): TypoType {
    // Weight by commonality
    const weights: Record<TypoType, number> = {
      'adjacent_key': 0.4,
      'transposition': 0.3,
      'omission': 0.2,
      'doubling': 0.1,
    };

    const enabledTypes = this.config.typo_types;
    let totalWeight = 0;
    for (const type of enabledTypes) {
      totalWeight += weights[type] || 0;
    }

    let random = Math.random() * totalWeight;
    for (const type of enabledTypes) {
      random -= weights[type] || 0;
      if (random <= 0) {
        return type;
      }
    }

    return enabledTypes[0] || 'adjacent_key';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TYPO GENERATION
  // ─────────────────────────────────────────────────────────────────────────────

  private generateTypo(word: string, wordStart: number, type: TypoType): Typo | null {
    let result: { typo: string; type: TypoType } | null = null;

    switch (type) {
      case 'adjacent_key':
        result = this.createAdjacentKeyTypo(word);
        break;
      case 'transposition':
        result = this.createTranspositionTypo(word);
        break;
      case 'omission':
        result = this.createOmissionTypo(word);
        break;
      case 'doubling':
        result = this.createDoublingTypo(word);
        break;
    }

    if (!result) return null;

    // Find the position of the difference
    let position = wordStart;
    for (let i = 0; i < Math.min(word.length, result.typo.length); i++) {
      if (word[i] !== result.typo[i]) {
        position = wordStart + i;
        break;
      }
    }

    return {
      position,
      original: word,
      typo: result.typo,
      type: result.type,
      will_correct: false, // Set later
    };
  }

  private createAdjacentKeyTypo(word: string): { typo: string; type: TypoType } | null {
    if (word.length < 2) return null;

    // Pick a random position
    const pos = Math.floor(Math.random() * word.length);
    const char = word[pos].toLowerCase();
    const adjacent = QWERTY_ADJACENT[char];

    if (!adjacent || adjacent.length === 0) return null;

    // Pick a random adjacent key
    const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];

    // Preserve case
    const replacement = word[pos] === word[pos].toUpperCase()
      ? wrongChar.toUpperCase()
      : wrongChar;

    const typo = word.slice(0, pos) + replacement + word.slice(pos + 1);

    return { typo, type: 'adjacent_key' };
  }

  private createTranspositionTypo(word: string): { typo: string; type: TypoType } | null {
    if (word.length < 2) return null;

    // More likely in the middle of the word
    const startRange = Math.floor(word.length * 0.2);
    const endRange = Math.floor(word.length * 0.8);

    if (endRange <= startRange) return null;

    const pos = startRange + Math.floor(Math.random() * (endRange - startRange));

    if (pos >= word.length - 1) return null;

    // Swap characters at pos and pos+1
    const chars = word.split('');
    [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];

    return { typo: chars.join(''), type: 'transposition' };
  }

  private createOmissionTypo(word: string): { typo: string; type: TypoType } | null {
    if (word.length < 3) return null;

    // More likely to omit middle characters
    const startRange = 1;
    const endRange = word.length - 1;

    const pos = startRange + Math.floor(Math.random() * (endRange - startRange));

    // Don't create words that are too short
    if (word.length - 1 < 2) return null;

    const typo = word.slice(0, pos) + word.slice(pos + 1);

    return { typo, type: 'omission' };
  }

  private createDoublingTypo(word: string): { typo: string; type: TypoType } | null {
    if (word.length < 2) return null;

    // Pick a random position
    const pos = Math.floor(Math.random() * word.length);

    // Double the character
    const typo = word.slice(0, pos + 1) + word[pos] + word.slice(pos + 1);

    return { typo, type: 'doubling' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TYPO APPLICATION
  // ─────────────────────────────────────────────────────────────────────────────

  private applyTypos(message: string, typos: Typo[]): string {
    // Sort typos by position in reverse order to apply from end to start
    const sorted = [...typos].sort((a, b) => b.position - a.position);

    let result = message;
    for (const typo of sorted) {
      // Find and replace the original word with the typo
      const before = result.slice(0, typo.position);
      const after = result.slice(typo.position + typo.original.length);
      result = before + typo.typo + after;
    }

    return result;
  }

  private createCorrectionView(message: string, typos: Typo[]): string {
    // Show typos with corrections like "teh*the"
    const sorted = [...typos].sort((a, b) => b.position - a.position);

    let result = message;
    for (const typo of sorted) {
      if (typo.will_correct) {
        const before = result.slice(0, typo.position);
        const after = result.slice(typo.position + typo.original.length);
        result = before + typo.typo + '*' + typo.original + after;
      } else {
        const before = result.slice(0, typo.position);
        const after = result.slice(typo.position + typo.original.length);
        result = before + typo.typo + after;
      }
    }

    return result;
  }

  private createFinalVersion(message: string, typos: Typo[]): string {
    // Apply only uncorrected typos
    const uncorrectedTypos = typos.filter(t => !t.will_correct);
    return this.applyTypos(message, uncorrectedTypos);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHONETIC ERRORS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Apply phonetic spelling mistakes (not typos, actual spelling errors).
   */
  applyPhoneticErrors(message: string): string {
    if (this.config.grammar_error_probability <= 0) {
      return message;
    }

    let result = message;

    for (const mistake of PHONETIC_MISTAKES) {
      if (Math.random() < this.config.grammar_error_probability) {
        const regex = new RegExp(`\\b${mistake.correct}\\b`, 'gi');
        result = result.replace(regex, match => {
          // Preserve case
          if (match === match.toUpperCase()) {
            return mistake.mistake.toUpperCase();
          } else if (match[0] === match[0].toUpperCase()) {
            return mistake.mistake.charAt(0).toUpperCase() + mistake.mistake.slice(1);
          }
          return mistake.mistake;
        });
      }
    }

    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a TypoGenerator from config.
 */
export function createTypoGenerator(config: ErrorConfig): TypoGenerator {
  return new TypoGenerator(config);
}

/**
 * Quick function to add typos to a message.
 */
export function addTyposToMessage(message: string, config: ErrorConfig): TypoResult {
  const generator = new TypoGenerator(config);
  return generator.generateTypos(message);
}
