// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - DYNAMIC RESOLVER
// ═══════════════════════════════════════════════════════════════════════════
// The Dynamic Resolver translates frames into actionable semantics.
// Operator configurations can modify symbol meanings per deployment.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  SymbolOntology,
  SymbolDefinition,
  ParsedFrame,
  ParsedSymbol,
  ResolvedFrame,
  PolicyOverlay,
  SymbolOverride,
} from '../types/index.js';
import { generateIntentHash } from '../utils/hash.js';

// Default symbol ontology (embedded for self-containment)
const DEFAULT_ONTOLOGY: SymbolOntology = {
  modes: {
    '⊕': { name: 'strict', canonical: 'strict', color: '#22c55e', category: 'mode', strength: 1 },
    '⊖': { name: 'flexible', canonical: 'flexible', color: '#3b82f6', category: 'mode', strength: 3 },
    '⊗': { name: 'forbidden', canonical: 'forbidden', color: '#ef4444', category: 'mode', strength: 4 },
    '⊘': { name: 'neutral', canonical: 'neutral', color: '#6b7280', category: 'mode', strength: 2 },
  },
  domains: {
    '◊': { name: 'financial', canonical: 'financial', color: '#f59e0b', category: 'domain' },
    '◈': { name: 'legal', canonical: 'legal', color: '#8b5cf6', category: 'domain' },
    '◇': { name: 'technical', canonical: 'technical', color: '#06b6d4', category: 'domain' },
    '◆': { name: 'operational', canonical: 'operational', color: '#10b981', category: 'domain' },
    '◐': { name: 'strategic', canonical: 'strategic', color: '#ec4899', category: 'domain' },
  },
  constraints: {
    '⛔': { name: 'forbidden', canonical: 'forbidden', color: '#ef4444', category: 'constraint', strength: 1, inherits: true },
    '✗': { name: 'rejected', canonical: 'rejected', color: '#f97316', category: 'constraint', strength: 2, inherits: false },
    '⚠': { name: 'warning', canonical: 'warning', color: '#f59e0b', category: 'constraint', strength: 3, inherits: false },
    '✓': { name: 'approved', canonical: 'approved', color: '#22c55e', category: 'constraint', strength: 4, inherits: false },
  },
  actions: {
    '▶': { name: 'execute', canonical: 'execute', color: '#22c55e', category: 'action' },
    '◀': { name: 'revert', canonical: 'revert', color: '#f59e0b', category: 'action' },
    '▲': { name: 'escalate', canonical: 'escalate', color: '#ef4444', category: 'action' },
    '▼': { name: 'delegate', canonical: 'delegate', color: '#3b82f6', category: 'action' },
    '●': { name: 'commit', canonical: 'commit', color: '#8b5cf6', category: 'action' },
    '○': { name: 'propose', canonical: 'propose', color: '#6b7280', category: 'action' },
  },
  modifiers: {
    '↑': { name: 'priority_high', canonical: 'priority_high', color: '#ef4444', category: 'modifier' },
    '↓': { name: 'priority_low', canonical: 'priority_low', color: '#6b7280', category: 'modifier' },
    '↔': { name: 'bidirectional', canonical: 'bidirectional', color: '#3b82f6', category: 'modifier' },
    '⟳': { name: 'iterative', canonical: 'iterative', color: '#10b981', category: 'modifier' },
    '⟲': { name: 'rollback', canonical: 'rollback', color: '#f59e0b', category: 'modifier' },
  },
  sources: {
    '⌘': { name: 'system', canonical: 'system', color: '#6b7280', category: 'source' },
    '⌥': { name: 'user', canonical: 'user', color: '#3b82f6', category: 'source' },
    '⇧': { name: 'elevated', canonical: 'elevated', color: '#ef4444', category: 'source' },
  },
  entities: {
    'α': { name: 'primary_agent', canonical: 'primary_agent', color: '#3b82f6', category: 'entity', level: 1 },
    'β': { name: 'secondary_agent', canonical: 'secondary_agent', color: '#8b5cf6', category: 'entity', level: 2 },
    'γ': { name: 'tertiary_agent', canonical: 'tertiary_agent', color: '#06b6d4', category: 'entity', level: 3 },
    'ω': { name: 'terminal_agent', canonical: 'terminal_agent', color: '#10b981', category: 'entity', level: 4 },
  },
};

export class DynamicResolver {
  private ontology: SymbolOntology;
  private activeOverlay: PolicyOverlay | null = null;

  constructor(ontology?: SymbolOntology) {
    this.ontology = ontology || DEFAULT_ONTOLOGY;
  }

  /**
   * Set the active policy overlay for dynamic resolution.
   */
  setOverlay(overlay: PolicyOverlay | null): void {
    this.activeOverlay = overlay;
  }

  /**
   * Get the active overlay.
   */
  getOverlay(): PolicyOverlay | null {
    return this.activeOverlay;
  }

  /**
   * Parse a raw frame string into structured symbols.
   */
  parseFrame(rawFrame: string): ParsedFrame | null {
    const symbols: ParsedSymbol[] = [];
    const chars = [...rawFrame];

    for (const char of chars) {
      const parsed = this.lookupSymbol(char);
      if (parsed) {
        symbols.push(parsed);
      }
    }

    // If no symbols parsed, return null
    if (symbols.length === 0) {
      return null;
    }

    // Extract specific symbol types (as strings for convenience)
    const modeSymbol = symbols.find(s => s.category === 'modes');
    const domainSymbol = symbols.find(s => s.category === 'domains');
    const constraintSymbols = symbols.filter(s => s.category === 'constraints');
    const actionSymbol = symbols.find(s => s.category === 'actions');
    const modifierSymbols = symbols.filter(s => s.category === 'modifiers');
    const sourceSymbol = symbols.find(s => s.category === 'sources');
    const entitySymbol = symbols.find(s => s.category === 'entities');

    const parsed: ParsedFrame = {
      raw: rawFrame,
      symbols,
      // Simple string accessors for convenience
      mode: modeSymbol?.symbol ?? null,
      modifiers: modifierSymbols.map(s => s.symbol),
      domain: domainSymbol?.symbol ?? null,
      source: sourceSymbol?.symbol ?? null,
      constraints: constraintSymbols.map(s => s.symbol),
      action: actionSymbol?.symbol ?? null,
      entity: entitySymbol?.symbol ?? null,
      // Full symbol objects
      modeSymbol,
      domainSymbol,
      constraintSymbols,
      actionSymbol,
      modifierSymbols,
      sourceSymbol,
      entitySymbol,
      // Metadata
      metadata: {},
      intentHash: generateIntentHash(symbols),
      parseConfidence: this.calculateParseConfidence(symbols, rawFrame),
    };

    return parsed;
  }

  /**
   * Look up a symbol in the ontology.
   */
  private lookupSymbol(char: string): ParsedSymbol | null {
    for (const [category, symbols] of Object.entries(this.ontology)) {
      if (symbols[char]) {
        return {
          symbol: char,
          category: category as keyof SymbolOntology,
          definition: symbols[char],
        };
      }
    }
    return null;
  }

  /**
   * Calculate parse confidence based on symbol coverage.
   */
  private calculateParseConfidence(symbols: ParsedSymbol[], rawFrame: string): number {
    if (rawFrame.length === 0) return 0;

    const parsedChars = symbols.length;
    const totalChars = [...rawFrame].length;

    // Base confidence from symbol recognition
    let confidence = parsedChars / totalChars;

    // Bonus for having required categories
    const hasMode = symbols.some(s => s.category === 'modes');
    const hasDomain = symbols.some(s => s.category === 'domains');
    const hasAction = symbols.some(s => s.category === 'actions');

    if (hasMode) confidence += 0.1;
    if (hasDomain) confidence += 0.1;
    if (hasAction) confidence += 0.1;

    return Math.min(1.0, confidence);
  }

  /**
   * Resolve a parsed frame with operator overrides applied.
   * This is the core of the dynamic resolution.
   */
  resolveFrame(parsedFrame: ParsedFrame): ResolvedFrame {
    const effectiveMode = this.applyOverride(parsedFrame.modeSymbol);
    const effectiveDomain = this.applyOverride(parsedFrame.domainSymbol);
    const effectiveConstraint = parsedFrame.constraintSymbols?.length
      ? this.applyOverride(parsedFrame.constraintSymbols[0])
      : undefined;
    const effectiveAction = this.applyOverride(parsedFrame.actionSymbol);

    // Build tool bindings from overlay
    const toolBindings = this.buildToolBindings(parsedFrame);

    // Check for blocked symbols from overlay
    const blockedSymbols: string[] = [];
    if (this.activeOverlay) {
      for (const symbol of parsedFrame.symbols) {
        const override = this.activeOverlay.symbolOverrides?.[symbol.symbol];
        if (override?.blocked) {
          blockedSymbols.push(symbol.symbol);
        }
      }
    }

    const defaultMode = {
      name: 'neutral',
      canonical: 'neutral',
      color: '#6b7280',
      category: 'mode',
      strength: 2
    };
    const defaultDomain = {
      name: 'operational',
      canonical: 'operational',
      color: '#10b981',
      category: 'domain'
    };
    const defaultAction = {
      name: 'propose',
      canonical: 'propose',
      color: '#6b7280',
      category: 'action'
    };

    return {
      ...parsedFrame,
      // Required ResolvedFrame properties
      effectiveMode: effectiveMode || defaultMode,
      effectiveDomain: effectiveDomain || defaultDomain,
      effectiveConstraint,
      effectiveAction: effectiveAction || defaultAction,
      // Backward-compatible aliases
      modeDefinition: effectiveMode || defaultMode,
      domainDefinition: effectiveDomain || defaultDomain,
      constraintDefinition: effectiveConstraint,
      actionDefinition: effectiveAction || defaultAction,
      allowedTools: toolBindings.allowed,
      blockedTools: toolBindings.blocked,
      blockedSymbols,
      overlayApplied: this.activeOverlay !== null,
      toolBindings,
    };
  }

  /**
   * Apply operator override to a symbol definition.
   */
  private applyOverride(symbol?: ParsedSymbol): (SymbolDefinition & { extensions?: Record<string, unknown> }) | undefined {
    if (!symbol) return undefined;

    const base = { ...symbol.definition };

    if (this.activeOverlay?.symbolOverrides[symbol.symbol]) {
      const override = this.activeOverlay.symbolOverrides[symbol.symbol];
      return {
        ...base,
        extensions: override.extensions,
      };
    }

    return base;
  }

  /**
   * Build tool bindings from the active overlay.
   */
  private buildToolBindings(parsedFrame: ParsedFrame): { blocked: string[]; allowed: string[]; rateLimit?: string } {
    const blocked: Set<string> = new Set();
    const allowed: Set<string> = new Set();
    let rateLimit: string | undefined;

    if (!this.activeOverlay) {
      // Default: allow all if no overlay
      return { blocked: [], allowed: ['*'] };
    }

    for (const symbol of parsedFrame.symbols) {
      const binding = this.activeOverlay.toolBindings?.[symbol.symbol];
      // Type guard: check if binding is an object with expected structure (not an array)
      if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
        const bindingObj = binding as { blocked?: string[]; allowed?: string[]; rateLimit?: string };
        bindingObj.blocked?.forEach((t: string) => blocked.add(t));
        bindingObj.allowed?.forEach((t: string) => allowed.add(t));
        if (bindingObj.rateLimit) {
          rateLimit = bindingObj.rateLimit;
        }
      }
    }

    // If constraint includes ⛔ (forbidden), block all execution tools
    if (parsedFrame.constraints.includes('⛔')) {
      blocked.add('*_execute');
      blocked.add('*_write');
      blocked.add('*_delete');
    }

    return {
      blocked: Array.from(blocked),
      allowed: allowed.size > 0 ? Array.from(allowed) : ['*'],
      rateLimit,
    };
  }

  /**
   * Check if a tool is allowed given the resolved frame.
   */
  isToolAllowed(resolvedFrame: ResolvedFrame, toolName: string): boolean {
    const { blocked, allowed } = resolvedFrame.toolBindings;

    // Check blocked patterns first
    for (const pattern of blocked) {
      if (this.matchPattern(pattern, toolName)) {
        return false;
      }
    }

    // Check allowed patterns
    for (const pattern of allowed) {
      if (this.matchPattern(pattern, toolName)) {
        return true;
      }
    }

    // Default deny
    return false;
  }

  /**
   * Match a tool name against a pattern (supports * wildcard).
   */
  private matchPattern(pattern: string, toolName: string): boolean {
    if (pattern === '*') return true;

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(toolName);
    }

    return pattern === toolName;
  }

  /**
   * Get the default ontology.
   */
  getOntology(): SymbolOntology {
    return this.ontology;
  }
}

// Singleton instance for convenience
export const resolver = new DynamicResolver();
