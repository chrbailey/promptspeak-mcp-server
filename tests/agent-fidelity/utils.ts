/**
 * Utility functions for agent fidelity tests
 */

/**
 * Calculate semantic drift between two text interpretations.
 * Uses word overlap and order similarity to estimate drift.
 */
export function calculateSemanticDrift(original: string, current: string): number {
  const originalWords = tokenize(original);
  const currentWords = tokenize(current);

  if (originalWords.length === 0 || currentWords.length === 0) {
    return originalWords.length === currentWords.length ? 0 : 1;
  }

  // Calculate word overlap (Jaccard similarity)
  const originalSet = new Set(originalWords);
  const currentSet = new Set(currentWords);
  const intersection = new Set([...originalSet].filter((w) => currentSet.has(w)));
  const union = new Set([...originalSet, ...currentSet]);
  const jaccardSimilarity = intersection.size / union.size;

  // Calculate numeric preservation (important for financial/trading contexts)
  const originalNumbers = extractNumbers(original);
  const currentNumbers = extractNumbers(current);
  const numberPreservation = calculateNumberPreservation(
    originalNumbers,
    currentNumbers
  );

  // Weight: 60% word overlap, 40% number preservation
  const similarity = 0.6 * jaccardSimilarity + 0.4 * numberPreservation;

  // Drift is inverse of similarity
  return 1 - similarity;
}

/**
 * Tokenize a string into lowercase words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Extract numbers from text.
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Calculate how well numbers are preserved between texts.
 */
function calculateNumberPreservation(
  original: number[],
  current: number[]
): number {
  if (original.length === 0 && current.length === 0) {
    return 1;
  }

  if (original.length === 0 || current.length === 0) {
    return 0;
  }

  // Count exact matches
  const originalSet = new Set(original.map(String));
  const currentSet = new Set(current.map(String));
  const intersection = new Set(
    [...originalSet].filter((n) => currentSet.has(n))
  );

  return intersection.size / originalSet.size;
}
