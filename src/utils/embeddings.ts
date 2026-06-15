// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - EMBEDDING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

import type { ParsedFrame, ParsedSymbol } from '../types/index.js';

/**
 * Simplified embedding generator for frames.
 * In production, this would call an embedding model.
 * For now, we use a deterministic pseudo-embedding based on symbol characteristics.
 */

const EMBEDDING_DIM = 64;

// Category weights for embedding generation
const CATEGORY_WEIGHTS: Record<string, number[]> = {
  modes: [1, 0, 0, 0, 0, 0, 0, 0],
  domains: [0, 1, 0, 0, 0, 0, 0, 0],
  constraints: [0, 0, 1, 0, 0, 0, 0, 0],
  actions: [0, 0, 0, 1, 0, 0, 0, 0],
  modifiers: [0, 0, 0, 0, 1, 0, 0, 0],
  sources: [0, 0, 0, 0, 0, 1, 0, 0],
  entities: [0, 0, 0, 0, 0, 0, 1, 0],
};

// Symbol-specific offsets (deterministic based on char codes)
function symbolOffset(symbol: string): number[] {
  const result: number[] = [];
  for (let i = 0; i < 8; i++) {
    const code = symbol.charCodeAt(0) || 0;
    result.push(Math.sin(code * (i + 1)) * 0.5);
  }
  return result;
}

// Strength-based scaling
function strengthScale(strength?: number): number {
  if (strength === undefined) return 1.0;
  return 1.0 + (4 - strength) * 0.1; // Lower strength = higher scale
}

/**
 * Generate a pseudo-embedding for a parsed frame.
 * Returns a normalized vector of EMBEDDING_DIM dimensions.
 */
export function generateFrameEmbedding(frame: ParsedFrame): number[] {
  const embedding: number[] = new Array(EMBEDDING_DIM).fill(0);

  for (const symbol of frame.symbols) {
    const categoryWeight = CATEGORY_WEIGHTS[symbol.category] || new Array(8).fill(0.125);
    const offset = symbolOffset(symbol.symbol);
    const scale = strengthScale(symbol.definition.strength);

    // Add category contribution
    for (let i = 0; i < 8; i++) {
      embedding[i] += categoryWeight[i] * scale;
      embedding[i + 8] += offset[i] * scale;
    }

    // Add symbol-specific features
    const charCode = symbol.symbol.charCodeAt(0);
    for (let i = 16; i < EMBEDDING_DIM; i++) {
      embedding[i] += Math.sin(charCode * (i - 15) * 0.1) * 0.1;
    }
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Calculate cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate Euclidean distance between two embeddings.
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate drift score based on embedding distance.
 * Returns a value between 0 (no drift) and 1 (maximum drift).
 */
export function calculateDriftScore(baseline: number[], current: number[]): number {
  const distance = euclideanDistance(baseline, current);
  // Normalize to 0-1 range (assuming max distance is sqrt(2) for normalized vectors)
  return Math.min(1, distance / Math.sqrt(2));
}

/**
 * Generate a deterministic embedding from arbitrary behavioral content
 * (serialized tool arguments, results, etc).
 *
 * Unlike generateFrameEmbedding — which only captures the symbol glyphs of a
 * frame — this captures the actual content of an operation, so drift detection
 * can react to behavioral change, not just frame composition. It is deterministic
 * and local (no network, no model dependency), which keeps validation latency flat.
 * For semantic drift, inject a real model via the EmbeddingProvider seam.
 */
export function generateContentEmbedding(content: string): number[] {
  const embedding: number[] = new Array(EMBEDDING_DIM).fill(0);
  if (!content) return embedding;

  // Distribute each character's influence across the vector deterministically.
  // Two independent projections reduce collisions between similar strings.
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    const d1 = (code + i) % EMBEDDING_DIM;
    embedding[d1] += Math.sin(code * 0.131 + i * 0.077);
    const d2 = (code * 7 + i * 13) % EMBEDDING_DIM;
    embedding[d2] += Math.cos(code * 0.217 + i * 0.043);
  }

  // Normalize to unit length so distances stay in the same scale as frame vectors.
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

/**
 * Blend two embeddings by a weight on the first, returning a re-normalized vector.
 * weightA = 1 yields purely `a`; weightA = 0 yields purely `b`.
 */
export function blendEmbeddings(a: number[], b: number[], weightA = 0.5): number[] {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }
  const out: number[] = new Array(a.length).fill(0);
  for (let i = 0; i < a.length; i++) {
    out[i] = weightA * a[i] + (1 - weightA) * b[i];
  }
  const magnitude = Math.sqrt(out.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < out.length; i++) {
      out[i] /= magnitude;
    }
  }
  return out;
}
