// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK TRANSLATION LAYER - MAPPING TABLES
// ═══════════════════════════════════════════════════════════════════════════
// Static lookup tables for bidirectional translation between:
// - Unicode symbols (⊕◊▶β)
// - Text aliases (strict.financial.execute.secondary)
// - Natural language ("strict mode, financial domain, execute action")
// ═══════════════════════════════════════════════════════════════════════════

import type { SymbolMapping, TranslationMappings } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE SYMBOL MAPPINGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All symbol mappings with full metadata.
 * This is the authoritative source for all translations.
 */
export const SYMBOL_MAPPINGS: SymbolMapping[] = [
  // ═════════════════════════════════════════════════════════════════════════
  // MODES - Constraint strength levels
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '⊕',
    textAlias: 'strict',
    naturalLanguage: 'strict mode (exact compliance required)',
    category: 'mode',
    metadata: { strength: 1, color: '#22c55e' }
  },
  {
    unicode: '⊖',
    textAlias: 'flexible',
    naturalLanguage: 'flexible mode (reasonable interpretation allowed)',
    category: 'mode',
    metadata: { strength: 3, color: '#3b82f6' }
  },
  {
    unicode: '⊗',
    textAlias: 'forbidden',
    naturalLanguage: 'forbidden mode (action blocked)',
    category: 'mode',
    metadata: { strength: 4, color: '#ef4444' }
  },
  {
    unicode: '⊘',
    textAlias: 'neutral',
    naturalLanguage: 'neutral mode (no preference)',
    category: 'mode',
    metadata: { strength: 2, color: '#6b7280' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // DOMAINS - Context/sensitivity areas
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '◊',
    textAlias: 'financial',
    naturalLanguage: 'financial domain (audit required)',
    category: 'domain',
    metadata: { color: '#f59e0b' }
  },
  {
    unicode: '◈',
    textAlias: 'legal',
    naturalLanguage: 'legal domain (confidential, citation-verified)',
    category: 'domain',
    metadata: { color: '#8b5cf6' }
  },
  {
    unicode: '◇',
    textAlias: 'technical',
    naturalLanguage: 'technical domain (code, systems, infrastructure)',
    category: 'domain',
    metadata: { color: '#06b6d4' }
  },
  {
    unicode: '◆',
    textAlias: 'operational',
    naturalLanguage: 'operational domain (business processes)',
    category: 'domain',
    metadata: { color: '#10b981' }
  },
  {
    unicode: '◐',
    textAlias: 'strategic',
    naturalLanguage: 'strategic domain (high-level planning)',
    category: 'domain',
    metadata: { color: '#ec4899' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // ACTIONS - Operation types
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '▶',
    textAlias: 'execute',
    naturalLanguage: 'execute the action',
    category: 'action',
    metadata: { color: '#22c55e' }
  },
  {
    unicode: '◀',
    textAlias: 'revert',
    naturalLanguage: 'revert/rollback the action',
    category: 'action',
    metadata: { color: '#f59e0b' }
  },
  {
    unicode: '▲',
    textAlias: 'escalate',
    naturalLanguage: 'escalate to higher authority',
    category: 'action',
    metadata: { color: '#ef4444' }
  },
  {
    unicode: '▼',
    textAlias: 'delegate',
    naturalLanguage: 'delegate to child agent',
    category: 'action',
    metadata: { color: '#3b82f6' }
  },
  {
    unicode: '●',
    textAlias: 'commit',
    naturalLanguage: 'commit/finalize changes',
    category: 'action',
    metadata: { color: '#8b5cf6' }
  },
  {
    unicode: '○',
    textAlias: 'propose',
    naturalLanguage: 'propose/suggest without committing',
    category: 'action',
    metadata: { color: '#6b7280' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // ENTITIES - Agent hierarchy levels
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: 'α',
    textAlias: 'primary',
    naturalLanguage: 'primary/orchestrator agent',
    category: 'entity',
    metadata: { level: 1, color: '#3b82f6' }
  },
  {
    unicode: 'β',
    textAlias: 'secondary',
    naturalLanguage: 'secondary/worker agent',
    category: 'entity',
    metadata: { level: 2, color: '#8b5cf6' }
  },
  {
    unicode: 'γ',
    textAlias: 'tertiary',
    naturalLanguage: 'tertiary/sub-worker agent',
    category: 'entity',
    metadata: { level: 3, color: '#06b6d4' }
  },
  {
    unicode: 'ω',
    textAlias: 'terminal',
    naturalLanguage: 'terminal/finalizer agent',
    category: 'entity',
    metadata: { level: 4, color: '#10b981' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // CONSTRAINTS - Applied restrictions
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '⛔',
    textAlias: 'blocked',
    naturalLanguage: 'absolutely forbidden (inherited)',
    category: 'constraint',
    metadata: { strength: 1, inherits: true, color: '#ef4444' }
  },
  {
    unicode: '✗',
    textAlias: 'rejected',
    naturalLanguage: 'rejected (not inherited)',
    category: 'constraint',
    metadata: { strength: 2, inherits: false, color: '#f97316' }
  },
  {
    unicode: '⚠',
    textAlias: 'warning',
    naturalLanguage: 'warning (requires caution)',
    category: 'constraint',
    metadata: { strength: 3, inherits: false, color: '#f59e0b' }
  },
  {
    unicode: '✓',
    textAlias: 'approved',
    naturalLanguage: 'approved (explicitly allowed)',
    category: 'constraint',
    metadata: { strength: 4, inherits: false, color: '#22c55e' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // MODIFIERS - Flow control
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '↑',
    textAlias: 'high_priority',
    naturalLanguage: 'high priority',
    category: 'modifier',
    metadata: { color: '#ef4444' }
  },
  {
    unicode: '↓',
    textAlias: 'low_priority',
    naturalLanguage: 'low priority',
    category: 'modifier',
    metadata: { color: '#6b7280' }
  },
  {
    unicode: '↔',
    textAlias: 'bidirectional',
    naturalLanguage: 'bidirectional communication',
    category: 'modifier',
    metadata: { color: '#3b82f6' }
  },
  {
    unicode: '⟳',
    textAlias: 'iterative',
    naturalLanguage: 'iterative/looping process',
    category: 'modifier',
    metadata: { color: '#10b981' }
  },
  {
    unicode: '⟲',
    textAlias: 'rollback',
    naturalLanguage: 'rollback on failure',
    category: 'modifier',
    metadata: { color: '#f59e0b' }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // SOURCES - Origin of directive
  // ═════════════════════════════════════════════════════════════════════════
  {
    unicode: '⌘',
    textAlias: 'system',
    naturalLanguage: 'system-generated directive',
    category: 'source',
    metadata: { color: '#6b7280' }
  },
  {
    unicode: '⌥',
    textAlias: 'user',
    naturalLanguage: 'user-provided directive',
    category: 'source',
    metadata: { color: '#3b82f6' }
  },
  {
    unicode: '⇧',
    textAlias: 'elevated',
    naturalLanguage: 'elevated/privileged directive',
    category: 'source',
    metadata: { color: '#ef4444' }
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// DERIVED LOOKUP TABLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unicode symbol to text alias mapping.
 * e.g., '⊕' -> 'strict'
 */
export const UNICODE_TO_TEXT: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.unicode, m.textAlias])
);

/**
 * Text alias to Unicode symbol mapping.
 * e.g., 'strict' -> '⊕'
 */
export const TEXT_TO_UNICODE: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.textAlias, m.unicode])
);

/**
 * Text alias to natural language mapping.
 * e.g., 'strict' -> 'strict mode (exact compliance required)'
 */
export const TEXT_TO_NATURAL: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.textAlias, m.naturalLanguage])
);

/**
 * Unicode symbol to natural language mapping.
 * e.g., '⊕' -> 'strict mode (exact compliance required)'
 */
export const UNICODE_TO_NATURAL: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.unicode, m.naturalLanguage])
);

/**
 * Unicode symbol to category mapping.
 * e.g., '⊕' -> 'mode'
 */
export const UNICODE_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.unicode, m.category])
);

/**
 * Text alias to category mapping.
 * e.g., 'strict' -> 'mode'
 */
export const TEXT_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  SYMBOL_MAPPINGS.map(m => [m.textAlias, m.category])
);

/**
 * Get all mappings for a specific category.
 */
export function getMappingsByCategory(category: string): SymbolMapping[] {
  return SYMBOL_MAPPINGS.filter(m => m.category === category);
}

/**
 * Complete translation mappings object for convenience.
 */
export const TRANSLATION_MAPPINGS: TranslationMappings = {
  unicodeToText: UNICODE_TO_TEXT,
  textToUnicode: TEXT_TO_UNICODE,
  textToNatural: TEXT_TO_NATURAL,
  naturalToText: Object.fromEntries(
    SYMBOL_MAPPINGS.map(m => [m.naturalLanguage.toLowerCase(), m.textAlias])
  ),
  categoryMap: UNICODE_TO_CATEGORY,
};

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL LANGUAGE INFERENCE PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Patterns for detecting mode from natural language.
 * Keys are text aliases, values are arrays of trigger patterns.
 */
export const MODE_NL_PATTERNS: Record<string, RegExp[]> = {
  strict: [
    /\bstrict\b/i,
    /\bexact\b/i,
    /\bprecise\b/i,
    /\bmust\b/i,
    /\brequired?\b/i,
    /\bno\s+interpretation\b/i,
    /\bexactly\b/i,
    /\bliteral\b/i,
  ],
  flexible: [
    /\bflexible\b/i,
    /\binterpret/i,
    /\breasonable?\b/i,
    /\bapproximate/i,
    /\brough(ly)?\b/i,
    /\bgeneral(ly)?\b/i,
  ],
  forbidden: [
    /\bforbidden\b/i,
    /\bblock(ed)?\b/i,
    /\bprevent\b/i,
    /\bnever\b/i,
    /\bprohibit/i,
    /\bban(ned)?\b/i,
  ],
  neutral: [
    /\bneutral\b/i,
    /\bdefault\b/i,
    /\bno\s+preference\b/i,
    /\beither\s+way\b/i,
  ],
};

/**
 * Patterns for detecting domain from natural language.
 */
export const DOMAIN_NL_PATTERNS: Record<string, RegExp[]> = {
  financial: [
    /\bfinancial\b/i,
    /\bearnings?\b/i,
    /\brevenue\b/i,
    /\binvestment\b/i,
    /\bstock\b/i,
    /\bportfolio\b/i,
    /\bquarter(ly)?\b/i,
    /\bfiscal\b/i,
    /\bbudget\b/i,
    /\bprofit\b/i,
    /\bmargin\b/i,
    /\bticker\b/i,
    /\bmarket\b/i,
  ],
  legal: [
    /\blegal\b/i,
    /\bcourt\b/i,
    /\bcontract\b/i,
    /\bcompliance\b/i,
    /\blitigation\b/i,
    /\bcitation\b/i,
    /\bstatute\b/i,
    /\bregulat/i,
    /\bjudge\b/i,
    /\bbrief\b/i,
    /\bmotion\b/i,
    /\bfiling\b/i,
  ],
  technical: [
    /\btechnical\b/i,
    /\bcode\b/i,
    /\bsystem\b/i,
    /\binfrastructure\b/i,
    /\bapi\b/i,
    /\bdatabase\b/i,
    /\bserver\b/i,
    /\bdeployment\b/i,
    /\barchitecture\b/i,
    /\bsoftware\b/i,
  ],
  operational: [
    /\boperational\b/i,
    /\bprocess(es)?\b/i,
    /\bworkflow\b/i,
    /\bprocedure\b/i,
    /\boperation\b/i,
    /\boutput\b/i,
  ],
  strategic: [
    /\bstrategic\b/i,
    /\bstrategy\b/i,
    /\bplanning\b/i,
    /\bhigh[\s-]?level\b/i,
    /\broadmap\b/i,
    /\bvision\b/i,
    /\blong[\s-]?term\b/i,
  ],
};

/**
 * Patterns for detecting action from natural language.
 */
export const ACTION_NL_PATTERNS: Record<string, RegExp[]> = {
  execute: [
    /\bexecut/i,
    /\brun\b/i,
    /\bperform\b/i,
    /\bdo\b/i,
    /\bstart\b/i,
    /\blaunch\b/i,
    /\binitiat/i,
  ],
  revert: [
    /\brevert\b/i,
    /\brollback\b/i,
    /\bundo\b/i,
    /\brestore\b/i,
    /\bcancel\b/i,
  ],
  escalate: [
    /\bescalat/i,
    /\belevat/i,
    /\bnotify\s+(manager|supervisor|lead)/i,
    /\bsend\s+to\s+(manager|supervisor|lead)/i,
  ],
  delegate: [
    /\bdelegat/i,
    /\bassign\b/i,
    /\bpass\s+to\b/i,
    /\bhand\s+off\b/i,
    /\bsub[\s-]?task\b/i,
  ],
  commit: [
    /\bcommit\b/i,
    /\bfinalize\b/i,
    /\bsave\b/i,
    /\bpersist\b/i,
    /\bconfirm\b/i,
    /\bapply\b/i,
  ],
  propose: [
    /\bpropos/i,
    /\bsuggest\b/i,
    /\brecommend\b/i,
    /\bdraft\b/i,
    /\bplan\b/i,
    /\boutline\b/i,
  ],
};

/**
 * Patterns for detecting entity level from natural language.
 */
export const ENTITY_NL_PATTERNS: Record<string, RegExp[]> = {
  primary: [
    /\bprimary\b/i,
    /\bmain\b/i,
    /\bmaster\b/i,
    /\borchestrat/i,
    /\broot\b/i,
    /\bparent\b/i,
  ],
  secondary: [
    /\bsecondary\b/i,
    /\bworker\b/i,
    /\bsub[\s-]?agent\b/i,
    /\bchild\b/i,
    /\bhelper\b/i,
  ],
  tertiary: [
    /\btertiary\b/i,
    /\bsub[\s-]?worker\b/i,
    /\bthird[\s-]?level\b/i,
  ],
  terminal: [
    /\bterminal\b/i,
    /\bfinal(izer)?\b/i,
    /\bleaf\b/i,
    /\bend[\s-]?point\b/i,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// INFERENCE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect mode from natural language text.
 * Returns { textAlias, confidence } or null if not detected.
 */
export function detectMode(text: string): { textAlias: string; confidence: number } | null {
  let bestMatch: { textAlias: string; confidence: number } | null = null;
  let maxMatches = 0;

  for (const [alias, patterns] of Object.entries(MODE_NL_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = { textAlias: alias, confidence: Math.min(0.95, 0.5 + matches * 0.15) };
    }
  }

  return bestMatch;
}

/**
 * Detect domain from natural language text.
 */
export function detectDomain(text: string): { textAlias: string; confidence: number } | null {
  let bestMatch: { textAlias: string; confidence: number } | null = null;
  let maxMatches = 0;

  for (const [alias, patterns] of Object.entries(DOMAIN_NL_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = { textAlias: alias, confidence: Math.min(0.95, 0.4 + matches * 0.12) };
    }
  }

  return bestMatch;
}

/**
 * Detect action from natural language text.
 */
export function detectAction(text: string): { textAlias: string; confidence: number } | null {
  let bestMatch: { textAlias: string; confidence: number } | null = null;
  let maxMatches = 0;

  for (const [alias, patterns] of Object.entries(ACTION_NL_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = { textAlias: alias, confidence: Math.min(0.95, 0.5 + matches * 0.15) };
    }
  }

  // Default to 'execute' if no match but text implies action
  if (!bestMatch && /\b(analyze|review|check|assess|evaluate)\b/i.test(text)) {
    bestMatch = { textAlias: 'execute', confidence: 0.6 };
  }

  return bestMatch;
}

/**
 * Detect entity level from natural language text.
 */
export function detectEntity(text: string): { textAlias: string; confidence: number } | null {
  let bestMatch: { textAlias: string; confidence: number } | null = null;
  let maxMatches = 0;

  for (const [alias, patterns] of Object.entries(ENTITY_NL_PATTERNS)) {
    const matches = patterns.filter(p => p.test(text)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestMatch = { textAlias: alias, confidence: Math.min(0.95, 0.5 + matches * 0.15) };
    }
  }

  return bestMatch;
}
