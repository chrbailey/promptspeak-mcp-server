// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - EMBEDDING PROVIDER SEAM
// ═══════════════════════════════════════════════════════════════════════════
// Drift detection compares embeddings over time. Historically the only signal
// was the frame's symbol glyphs (generateFrameEmbedding), which carries NO
// information about what an agent actually did — so two operations with the same
// frame but wildly different arguments/results were indistinguishable.
//
// This module introduces a pluggable provider so behavioral content (arguments,
// results) contributes to the embedding. The default provider is deterministic
// and local (no network, no model), preserving latency. A real embedding model
// can be injected via setEmbeddingProvider() for semantic drift detection.
//
// Backward compatibility: when no behavioral context is supplied, the default
// provider returns exactly generateFrameEmbedding(frame), so existing callers
// (and tests) that record frame-only operations are unaffected.
// ═══════════════════════════════════════════════════════════════════════════

import type { ParsedFrame } from '../types/index.js';
import {
  generateFrameEmbedding,
  generateContentEmbedding,
  blendEmbeddings,
} from './embeddings.js';

/** Behavioral context for an operation — the actual inputs/outputs of a tool call. */
export interface OperationContext {
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface EmbeddingInput {
  frame: ParsedFrame;
  /** Behavior labels (e.g. tool names). Reserved for richer providers. */
  behavior?: string[];
  /** Behavioral content — drives content-sensitive drift. */
  context?: OperationContext;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(input: EmbeddingInput): number[];
}

/**
 * Serialize behavioral context into a stable string for embedding.
 * Object keys are sorted so semantically identical payloads hash identically.
 * Returns '' when there is no behavioral content (preserves legacy frame-only path).
 */
export function serializeContext(context?: OperationContext): string {
  if (!context) return '';
  const parts: string[] = [];
  if (context.args && Object.keys(context.args).length > 0) {
    parts.push(stableStringify(context.args));
  }
  if (context.result !== undefined) {
    parts.push(stableStringify(context.result));
  }
  return parts.join('::');
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, k) => {
            acc[k] = (val as Record<string, unknown>)[k];
            return acc;
          }, {});
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

/** Relative weight of the frame structure vs behavioral content when blending. */
const FRAME_WEIGHT = 0.5;

/**
 * Default deterministic, local provider. No external dependencies.
 * Combines frame-structure signal with behavioral-content signal.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'deterministic-local';

  embed(input: EmbeddingInput): number[] {
    const frameVec = generateFrameEmbedding(input.frame);
    const content = serializeContext(input.context);
    if (!content) {
      // No behavioral signal — identical to legacy behavior.
      return frameVec;
    }
    const contentVec = generateContentEmbedding(content);
    return blendEmbeddings(frameVec, contentVec, FRAME_WEIGHT);
  }
}

let activeProvider: EmbeddingProvider = new DeterministicEmbeddingProvider();

export function getEmbeddingProvider(): EmbeddingProvider {
  return activeProvider;
}

/** Inject a custom provider (e.g. a real semantic embedding model). */
export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  activeProvider = provider;
}

/** Restore the default deterministic provider (useful for tests). */
export function resetEmbeddingProvider(): void {
  activeProvider = new DeterministicEmbeddingProvider();
}
