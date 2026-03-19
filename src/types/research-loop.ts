// ═══════════════════════════════════════════════════════════════════════════
// RESEARCH LOOP CONTRACT — Governance Schema for Continuous Research Loops
// ═══════════════════════════════════════════════════════════════════════════
//
// Formalizes the pattern: goal frame → source selection → collection →
// ranking → synthesis → scoring → memory promotion → next-loop planning
//
// Designed for use with Ralph Loop (operational rhythm) and PromptSpeak
// (governance grammar). Each phase maps to a governance surface where
// PromptSpeak can intervene, hold, score, or gate evidence promotion.
//
// Usage:
//   - Dossier: continuous signal curation (accounts, voices, patterns)
//   - Lex: scrape → analyze → publish pipelines
//   - Any iterative intelligence-gathering workflow
//
// ═══════════════════════════════════════════════════════════════════════════

import {
  EpistemicStatus,
  ClaimType,
  EpistemicMetadata,
} from '../symbols/epistemic-types';

import type {
  HoldReason,
  HoldRequest,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// EVIDENCE DURABILITY TIERS
// ─────────────────────────────────────────────────────────────────────────────
// Controls what persists and where. Each tier has stricter promotion criteria.
// Summaries never overwrite source facts — raw is always preserved.

export enum EvidenceTier {
  /** Captured, unprocessed. Always preserved. */
  RAW = 'raw',
  /** Summarized, in active analysis. May reference raw by hash. */
  WORKING = 'working',
  /** Cross-referenced and/or human-reviewed. Durable. */
  VERIFIED = 'verified',
  /** Entered persistent memory or inference-time context packs. */
  PROMOTED = 'promoted',
  /** Candidate for fine-tuning corpus. Requires explicit opt-in. */
  TRAINING = 'training',
  /** Immutable reference. Requires explicit unlock to modify. */
  LOCKED = 'locked',
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE TRUST MODEL
// ─────────────────────────────────────────────────────────────────────────────

export type SourceTier = 'primary' | 'secondary' | 'rumor' | 'blocked';

export interface SourceTrust {
  sourceId: string;
  name: string;
  tier: SourceTier;
  /** Weight applied to evidence from this source. 0.0–1.0. */
  trustWeight: number;
  /** Hours before data from this source is considered stale. */
  freshnessHorizon: number;
  /** Topic domains this source is authoritative for. */
  domains: string[];
  /** Whether evidence must be cross-referenced before promotion. */
  verificationRequired: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

export interface SignalDimension {
  name: string;
  description: string;
  /** How scoring is performed for this dimension. */
  scorer: 'llm' | 'rule' | 'hybrid';
  /** Relative weight in composite score. Weights across dimensions should sum to 1.0. */
  weight: number;
}

/**
 * Negative evidence configuration.
 * Absence, silence, and behavioral divergence are first-class signals.
 */
export interface NegativeEvidenceConfig {
  enabled: boolean;
  /** Hours of inactivity before flagging as a silence event. */
  silenceThreshold: number;
  /** Days of history used to compute behavioral baseline. */
  baselinePeriod: number;
  /** Types of absence to track. */
  absenceTypes: Array<
    | 'posting_gap'           // Longer-than-usual silence
    | 'topic_absence'         // Expected topic not addressed
    | 'synchronized_silence'  // Multiple sources go quiet simultaneously
    | 'behavioral_divergence' // Pattern breaks from established baseline
  >;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMOTION POLICY
// ─────────────────────────────────────────────────────────────────────────────

export interface PromotionRule {
  /** Minimum epistemic confidence to qualify for this tier. */
  minConfidence: number;
  /** Minimum independent corroboration count. */
  minCorroboration: number;
  /** Whether a human must approve this promotion. */
  requiresHumanReview: boolean;
  /** Maximum age in hours. Stale evidence cannot be promoted. */
  maxAge: number;
}

/**
 * Defines the gates between each evidence tier.
 * Each transition is independently configurable.
 */
export interface PromotionPolicy {
  rawToWorking: PromotionRule;
  workingToVerified: PromotionRule;
  verifiedToPromoted: PromotionRule;
  promotedToTraining: PromotionRule;
  trainingToLocked: PromotionRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

export interface OutputArtifact {
  name: string;
  format: 'md' | 'jsonl' | 'yaml' | 'json' | 'sqlite';
  /** Path relative to the contract's storage root. */
  path: string;
  /** Retention policy. Rolling artifacts auto-prune after windowDays. */
  retention: 'permanent' | 'rolling' | 'ephemeral';
  rollingWindowDays?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE 8-PHASE LOOP CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// Each phase is a governance surface. PromptSpeak can intervene at any phase
// via frame validation, hold gates, or policy overlays.

export interface ResearchLoopPhases {

  // ── Phase 1: Goal Frame ──────────────────────────────────────────────────
  goalFrame: {
    /** What is being researched. Maps to DirectiveSymbol.what. */
    objective: string;
    /** One-sentence north star. Maps to DirectiveSymbol.commanders_intent. */
    commandersIntent: string;
    /** Allowed sources with trust classification. */
    sourceUniverse: SourceTrust[];
    /** Global default freshness horizon (hours). Per-source overrides. */
    freshnessHorizon: number;
    /** Conditions under which the loop should halt and escalate. */
    failureConditions: string[];
  };

  // ── Phase 2: Candidate Discovery ─────────────────────────────────────────
  candidateDiscovery: {
    /** Which sourceIds from the universe are active this cycle. */
    allowedSources: string[];
    /** Explicitly excluded sourceIds. Takes precedence over allowed. */
    blockedSources: string[];
    /** How to explore the source space. */
    discoveryStrategy: 'breadth_first' | 'depth_first' | 'adaptive';
    /** Safety cap per cycle. Prevents runaway collection. */
    maxCandidatesPerCycle: number;
  };

  // ── Phase 3: Evidence Capture ────────────────────────────────────────────
  evidenceCapture: {
    /** Field names to extract from each candidate. Domain-specific. */
    captureFields: string[];
    /** Where raw evidence is stored. Relative to contract root. */
    rawStoragePath: string;
    /** Hash algorithm for dedup and provenance. */
    hashAlgorithm: 'sha256' | 'xxhash';
    /** Deduplication strategy. */
    deduplication: {
      strategy: 'exact' | 'semantic' | 'both';
      /** Cosine similarity threshold for semantic dedup. */
      semanticThreshold?: number;
    };
  };

  // ── Phase 4: Signal Extraction ───────────────────────────────────────────
  signalExtraction: {
    /** Scoring dimensions. Weights should sum to 1.0. */
    dimensions: SignalDimension[];
    /** Negative evidence (absence/silence) configuration. */
    negativeEvidence: NegativeEvidenceConfig;
  };

  // ── Phase 5: Scoring ─────────────────────────────────────────────────────
  scoring: {
    /** Thresholds for evidence tier promotion. */
    promotionThresholds: Record<EvidenceTier, PromotionRule>;
    /** Conditions that trigger a hold for human review. */
    humanReviewTriggers: string[];
  };

  // ── Phase 6: Synthesis ───────────────────────────────────────────────────
  synthesis: {
    /** What artifacts to produce each cycle. */
    outputArtifacts: OutputArtifact[];
    /** Whether to compute deltas against prior cycle. */
    crossCycleDelta: boolean;
  };

  // ── Phase 7: Memory Promotion ────────────────────────────────────────────
  memoryPromotion: {
    /** Full tier-by-tier promotion policy. */
    promotionPolicy: PromotionPolicy;
    /** Require at least one alternative interpretation before promotion. */
    alternativeHypothesisRequired: boolean;
    /** Floor confidence for any promotion. */
    minConfidenceForPromotion: number;
  };

  // ── Phase 8: Next-Loop Planning ──────────────────────────────────────────
  nextLoopPlanning: {
    /** Identify which evidence gaps remain. */
    gapAnalysis: boolean;
    /** Re-rank sources and candidates based on cycle results. */
    priorityRebalancing: boolean;
    /** How the next iteration is determined. */
    iterationStrategy: 'fixed' | 'adaptive' | 'convergence';
    /** Required when iterationStrategy is 'convergence'. */
    convergenceCriteria?: {
      metric: string;
      threshold: number;
      /** Number of consecutive iterations that must meet threshold. */
      windowSize: number;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP CONTROL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anti-recursion guards.
 * Prevents the "self-licking ice cream cone" where Claude selects sources,
 * summarizes them, decides what matters, stores it, and future Claude treats
 * stored material as stronger evidence — amplifying its own mistakes.
 */
export interface RecursionGuards {
  /** Max percentage of evidence that can come from own prior outputs. */
  maxSelfCitationRatio: number;
  /** Minimum Shannon entropy of source distribution. Low entropy = overreliance. */
  sourceEntropyMinimum: number;
  /** Whether to enforce alternative hypothesis logging each cycle. */
  hypothesisDiversityCheck: boolean;
}

export interface LoopControl {
  /** Maximum iterations. 0 = unlimited (requires convergenceCriteria). */
  maxIterations: number;
  /** Iterations between mandatory human review checkpoints. */
  checkpointInterval: number;
  /** Ralph Loop promise string for completion detection. */
  completionPromise: string;
  /** Conditions for early loop termination. */
  earlyExitConditions: Array<{
    condition: string;
    action: 'halt' | 'escalate' | 'fallback';
    message: string;
  }>;
  /** Backoff between iterations. Prevents API/source abuse. */
  backoffStrategy: 'none' | 'linear' | 'exponential';
  backoffBaseMs: number;
  /** Anti-recursion guards. Required. */
  recursionGuards: RecursionGuards;
}

// ─────────────────────────────────────────────────────────────────────────────
// EPISTEMIC PROGRESSION
// ─────────────────────────────────────────────────────────────────────────────
// Tracks how the overall research claim moves through epistemic status
// across iterations. This is the loop's "learning curve."

export interface EpistemicTransition {
  iteration: number;
  fromStatus: EpistemicStatus;
  toStatus: EpistemicStatus;
  evidenceAdded: string[];
  confidenceDelta: number;
}

export interface EpistemicProgression {
  startStatus: EpistemicStatus;
  targetStatus: EpistemicStatus;
  /** Populated as the loop runs. Empty at contract creation. */
  transitions: EpistemicTransition[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HOLD REASONS (Research Loop Extensions)
// ─────────────────────────────────────────────────────────────────────────────
// These extend the existing HoldReason type for research-specific holds.

export type ResearchHoldReason =
  | 'research_checkpoint'             // Scheduled checkpoint interval reached
  | 'evidence_review_needed'          // High-stakes evidence requires human review
  | 'confidence_regression'           // Confidence dropped between iterations
  | 'recursion_guard_triggered'       // Self-citation or low entropy detected
  | 'convergence_stall'              // No improvement over windowSize iterations
  | 'negative_evidence_anomaly'       // Unusual silence/absence pattern detected
  | 'promotion_gate';                 // Evidence seeking tier promotion

// ─────────────────────────────────────────────────────────────────────────────
// THE COMPLETE RESEARCH LOOP CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

export type ResearchLoopStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

/**
 * A Research Loop Contract defines a complete, governable research iteration.
 *
 * The contract is:
 *   - Instantiated as JSON/YAML by the caller (Dossier, Lex, etc.)
 *   - Validated by PromptSpeak before execution (ps_validate)
 *   - Executed under a PromptSpeak frame (ps_execute)
 *   - Iterated by Ralph Loop (stop-hook driven)
 *   - Checkpointed via PromptSpeak holds at configured intervals
 *
 * The 8 phases run sequentially within each iteration.
 * Between iterations, Ralph Loop persists state and re-feeds the prompt.
 * PromptSpeak governs what happens at each phase boundary.
 */
export interface ResearchLoopContract {
  // ── Identity ───────────────────────────────────────────────────────────
  /** Unique contract ID. Convention: RLC.<PROJECT>.<DOMAIN>.<SEQ> */
  contractId: string;
  version: number;
  name: string;
  description: string;

  // ── PromptSpeak Governance ─────────────────────────────────────────────
  /** The PromptSpeak frame governing this loop. */
  frame: string;
  /** Optional policy overlay ID for additional constraints. */
  policyOverlayId?: string;

  // ── The 8-Phase Definition ─────────────────────────────────────────────
  phases: ResearchLoopPhases;

  // ── Loop Control ───────────────────────────────────────────────────────
  control: LoopControl;

  // ── Epistemic Tracking ─────────────────────────────────────────────────
  /** Tracks claim progression across iterations. */
  epistemicProgression: EpistemicProgression;

  // ── Storage ────────────────────────────────────────────────────────────
  /** Root path for all contract artifacts. */
  storagePath: string;

  // ── Lifecycle ──────────────────────────────────────────────────────────
  status: ResearchLoopStatus;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;

  // ── Relationships ──────────────────────────────────────────────────────
  /** Parent PromptSpeak DirectiveSymbol, if any. */
  parentSymbol?: string;
  relatedSymbols?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a default PromotionPolicy with sensible gates.
 *
 * Default progression:
 *   raw → working:    confidence 0.3, no corroboration, no review
 *   working → verified: confidence 0.5, 1 corroboration, no review
 *   verified → promoted: confidence 0.7, 2 corroborations, human review
 *   promoted → training: confidence 0.8, 3 corroborations, human review
 *   training → locked: confidence 0.9, 5 corroborations, human review
 */
export function createDefaultPromotionPolicy(): PromotionPolicy {
  return {
    rawToWorking: {
      minConfidence: 0.3,
      minCorroboration: 0,
      requiresHumanReview: false,
      maxAge: 168, // 7 days
    },
    workingToVerified: {
      minConfidence: 0.5,
      minCorroboration: 1,
      requiresHumanReview: false,
      maxAge: 336, // 14 days
    },
    verifiedToPromoted: {
      minConfidence: 0.7,
      minCorroboration: 2,
      requiresHumanReview: true,
      maxAge: 720, // 30 days
    },
    promotedToTraining: {
      minConfidence: 0.8,
      minCorroboration: 3,
      requiresHumanReview: true,
      maxAge: 2160, // 90 days
    },
    trainingToLocked: {
      minConfidence: 0.9,
      minCorroboration: 5,
      requiresHumanReview: true,
      maxAge: 8760, // 365 days
    },
  };
}

/**
 * Creates default RecursionGuards.
 */
export function createDefaultRecursionGuards(): RecursionGuards {
  return {
    maxSelfCitationRatio: 0.2,       // Max 20% self-referential evidence
    sourceEntropyMinimum: 1.5,       // ~3+ meaningfully different sources
    hypothesisDiversityCheck: true,
  };
}
