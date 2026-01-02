// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - BASELINE STORE
// ═══════════════════════════════════════════════════════════════════════════
// Stores and manages baseline records for drift detection.
// Baselines capture the expected behavior at deployment time.
// ═══════════════════════════════════════════════════════════════════════════

import type { BaselineRecord, ParsedFrame } from '../types/index.js';
import { generateFrameEmbedding, calculateDriftScore } from '../utils/embeddings.js';
import { generateBehaviorHash } from '../utils/hash.js';

export class BaselineStore {
  private baselines: Map<string, BaselineRecord> = new Map();
  private agentBaselines: Map<string, Map<string, BaselineRecord>> = new Map();

  /**
   * Record a baseline for a frame.
   */
  recordBaseline(
    frame: ParsedFrame,
    expectedInterpretation: string,
    expectedBehavior: string[],
    agentId: string = 'global'
  ): BaselineRecord {
    const record: BaselineRecord = {
      frame: frame.raw,
      expectedInterpretation,
      expectedBehaviorHash: generateBehaviorHash(expectedBehavior),
      embedding: generateFrameEmbedding(frame),
      recordedAt: Date.now(),
      agentId,
    };

    // Store globally
    const key = this.createKey(frame.raw, agentId);
    this.baselines.set(key, record);

    // Store per-agent
    if (!this.agentBaselines.has(agentId)) {
      this.agentBaselines.set(agentId, new Map());
    }
    this.agentBaselines.get(agentId)!.set(frame.raw, record);

    return record;
  }

  /**
   * Get a baseline for a frame.
   */
  getBaseline(frame: string, agentId: string = 'global'): BaselineRecord | undefined {
    const key = this.createKey(frame, agentId);
    return this.baselines.get(key) || this.baselines.get(this.createKey(frame, 'global'));
  }

  /**
   * Check if a baseline exists.
   */
  hasBaseline(frame: string, agentId: string = 'global'): boolean {
    return this.getBaseline(frame, agentId) !== undefined;
  }

  /**
   * Compare current frame interpretation against baseline.
   */
  compareToBaseline(
    frame: ParsedFrame,
    currentInterpretation: string,
    currentBehavior: string[],
    agentId: string = 'global'
  ): {
    hasBaseline: boolean;
    interpretationMatch: boolean;
    behaviorMatch: boolean;
    embeddingDistance: number;
    driftScore: number;
    details: string;
  } {
    const baseline = this.getBaseline(frame.raw, agentId);

    if (!baseline) {
      return {
        hasBaseline: false,
        interpretationMatch: false,
        behaviorMatch: false,
        embeddingDistance: 0,
        driftScore: 0,
        details: 'No baseline found',
      };
    }

    // Compare interpretation
    const interpretationMatch = this.normalizeInterpretation(currentInterpretation) ===
      this.normalizeInterpretation(baseline.expectedInterpretation);

    // Compare behavior hash
    const currentBehaviorHash = generateBehaviorHash(currentBehavior);
    const behaviorMatch = currentBehaviorHash === baseline.expectedBehaviorHash;

    // Compare embeddings
    const currentEmbedding = generateFrameEmbedding(frame);
    const driftScore = calculateDriftScore(baseline.embedding, currentEmbedding);

    // Calculate embedding distance
    const embeddingDistance = this.euclideanDistance(baseline.embedding, currentEmbedding);

    const details = [];
    if (!interpretationMatch) {
      details.push(`Interpretation changed from "${baseline.expectedInterpretation}" to "${currentInterpretation}"`);
    }
    if (!behaviorMatch) {
      details.push('Behavior hash mismatch');
    }
    if (driftScore > 0.1) {
      details.push(`Embedding drift: ${(driftScore * 100).toFixed(1)}%`);
    }

    return {
      hasBaseline: true,
      interpretationMatch,
      behaviorMatch,
      embeddingDistance,
      driftScore,
      details: details.length > 0 ? details.join('; ') : 'Matches baseline',
    };
  }

  /**
   * Get all baselines for an agent.
   */
  getAgentBaselines(agentId: string): BaselineRecord[] {
    const agentMap = this.agentBaselines.get(agentId);
    return agentMap ? Array.from(agentMap.values()) : [];
  }

  /**
   * Get all global baselines.
   */
  getAllBaselines(): BaselineRecord[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Delete a baseline.
   */
  deleteBaseline(frame: string, agentId: string = 'global'): boolean {
    const key = this.createKey(frame, agentId);
    const deleted = this.baselines.delete(key);

    const agentMap = this.agentBaselines.get(agentId);
    if (agentMap) {
      agentMap.delete(frame);
    }

    return deleted;
  }

  /**
   * Clear all baselines for an agent.
   */
  clearAgentBaselines(agentId: string): void {
    const agentMap = this.agentBaselines.get(agentId);
    if (agentMap) {
      for (const frame of agentMap.keys()) {
        this.baselines.delete(this.createKey(frame, agentId));
      }
      agentMap.clear();
    }
  }

  /**
   * Clear all baselines.
   */
  clearAll(): void {
    this.baselines.clear();
    this.agentBaselines.clear();
  }

  /**
   * Export baselines for persistence.
   */
  export(): { baselines: BaselineRecord[] } {
    return {
      baselines: Array.from(this.baselines.values()),
    };
  }

  /**
   * Import baselines from persistence.
   */
  import(data: { baselines: BaselineRecord[] }): void {
    for (const record of data.baselines) {
      const key = this.createKey(record.frame, record.agentId);
      this.baselines.set(key, record);

      if (!this.agentBaselines.has(record.agentId)) {
        this.agentBaselines.set(record.agentId, new Map());
      }
      this.agentBaselines.get(record.agentId)!.set(record.frame, record);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private createKey(frame: string, agentId: string): string {
    return `${agentId}:${frame}`;
  }

  private normalizeInterpretation(interpretation: string): string {
    return interpretation.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

// Singleton instance
export const baselineStore = new BaselineStore();
