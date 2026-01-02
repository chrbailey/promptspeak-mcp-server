// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - HASH UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

import CryptoJS from 'crypto-js';
import type { ParsedFrame, ParsedSymbol } from '../types/index.js';

/**
 * Generate a canonical representation of a frame for hashing.
 * Ensures consistent ordering regardless of input order.
 */
export function canonicalizeFrame(symbols: ParsedSymbol[]): string {
  const categoryOrder: string[] = ['modes', 'domains', 'modifiers', 'sources', 'constraints', 'actions', 'entities'];

  const sorted = [...symbols].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a.category);
    const bIndex = categoryOrder.indexOf(b.category);
    return aIndex - bIndex;
  });

  return sorted.map(s => `${s.category}:${s.symbol}:${s.definition.name}`).join('|');
}

/**
 * Generate an intent hash for a frame.
 * This hash represents the semantic intent of the frame.
 * Used for drift detection (CH-006).
 */
export function generateIntentHash(frame: ParsedFrame | ParsedSymbol[]): string {
  const symbols = Array.isArray(frame) ? frame : frame.symbols;
  const canonical = canonicalizeFrame(symbols);
  return CryptoJS.SHA256(canonical).toString();
}

/**
 * Generate a behavior hash for a sequence of actions.
 * Used to compare expected vs actual behavior.
 */
export function generateBehaviorHash(actions: string[] | undefined): string {
  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return CryptoJS.SHA256('empty').toString();
  }
  const sorted = [...actions].sort();
  const canonical = sorted.join('|');
  return CryptoJS.SHA256(canonical).toString();
}

/**
 * Generate a unique audit ID.
 */
export function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `audit_${timestamp}_${random}`;
}

/**
 * Generate a unique agent ID.
 */
export function generateAgentId(entityType: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `agent_${entityType}_${timestamp}_${random}`;
}

/**
 * Generate a unique tripwire ID.
 */
export function generateTripwireId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `tripwire_${timestamp}_${random}`;
}

/**
 * Generate a unique alert ID.
 */
export function generateAlertId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `alert_${timestamp}_${random}`;
}
