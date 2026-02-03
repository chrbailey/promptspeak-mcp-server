/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MARINE RECON SYMBOL SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Schema definitions and factory functions for creating Marine Recon symbols.
 * Handles symbol creation, hashing, versioning, and serialization.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createHash } from 'crypto';
import {
  MarineReconSymbol,
  MissionObjective,
  ConstraintSet,
  TargetInfo,
  DualTrackConfig,
  StealthConfig,
  RalphLoopConfig,
  EngagementState,
  ValidationState,
  ReconMissionStatus,
  AlertLevel,
  RedLine,
  Constraint,
  createDefaultPerformerConfig,
  createDefaultAnalystConfig,
  createDefaultStealthConfig,
  createDefaultRalphLoopConfig,
  createDefaultVetoGateConfig,
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique symbol ID for a recon mission.
 */
export function generateReconSymbolId(missionName: string): string {
  const sanitized = missionName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') // Trim leading/trailing underscores
    .substring(0, 30);

  const timestamp = Date.now().toString(36).toUpperCase();
  return `Ξ.RECON.${sanitized}_${timestamp}`;
}

/**
 * Generate a hash for symbol integrity verification.
 */
export function generateSymbolHash(symbol: Partial<MarineReconSymbol>): string {
  const hashContent = JSON.stringify({
    mission: symbol.mission,
    config: symbol.config,
    created_at: symbol.created_at,
  });

  return createHash('sha256')
    .update(hashContent)
    .digest('hex')
    .substring(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIAL STATE FACTORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create initial engagement state.
 */
export function createInitialEngagementState(): EngagementState {
  const now = new Date().toISOString();

  return {
    status: 'initializing',
    alert_level: 'green',
    conversation: {
      message_count: 0,
      our_message_count: 0,
      their_message_count: 0,
      current_topic: '',
      topics_covered: [],
      pending_questions: [],
      last_speaker: 'us',
    },
    performer_state: {
      emotional_state: {
        primary: 'neutral',
        intensity: 0.3,
        patience: 0.8,
        trust: 0.6,
      },
      pending_messages: [],
      persona_consistency: 1.0,
      improvisation_count: 0,
    },
    analyst_state: {
      detected_tactics: [],
      drift_assessment: {
        original_position: '',
        current_position: '',
        drift_score: 0,
        concessions: [],
        gains: [],
        net_assessment: 'even',
      },
      constraint_status: [],
      current_risk_score: 0,
      veto_history: [],
    },
    intelligence: {
      opposing_agent: {
        suspected_type: 'unknown',
        type_confidence: 0,
        capabilities: [],
        limitations: [],
        response_patterns: [],
        apparent_objectives: [],
      },
      patterns_observed: [],
      constraint_boundaries: [],
      scenario_results: [],
      observations: [],
    },
    timestamps: {
      mission_start: now,
      last_activity: now,
    },
  };
}

/**
 * Create initial validation state.
 */
export function createInitialValidationState(): ValidationState {
  return {
    cycle_number: 0,
    last_result: {
      cycle: 0,
      timestamp: new Date().toISOString(),
      status: 'pass',
      checks: [],
      recommended_actions: [],
    },
    commander_queue: [],
    pending_updates: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL CREATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request to create a new Marine Recon symbol.
 */
export interface CreateReconSymbolRequest {
  /** Mission name */
  mission_name: string;

  /** Primary goal */
  primary_goal: string;

  /** Intelligence requirements */
  intelligence_requirements: string[];

  /** Target information */
  target: TargetInfo;

  /** Red lines (optional - defaults provided) */
  red_lines?: RedLine[];

  /** Additional constraints (optional) */
  constraints?: Constraint[];

  /** Creator identifier */
  created_by: string;

  /** Optional: custom dual-track config */
  dual_track_config?: Partial<DualTrackConfig>;

  /** Optional: custom stealth config */
  stealth_config?: Partial<StealthConfig>;

  /** Optional: custom ralph-loop config */
  ralph_loop_config?: Partial<RalphLoopConfig>;

  /** Optional: associated Marine ID */
  marine_id?: string;

  /** Optional: parent mission ID */
  parent_mission_id?: string;

  /** Optional: namespace */
  namespace?: string;

  /** Optional: tags */
  tags?: string[];

  /** Optional: expiration */
  expires_at?: string;
}

/**
 * Default red lines for recon missions.
 */
export const DEFAULT_RED_LINES: RedLine[] = [
  {
    id: 'RL001',
    prohibition: 'Never provide real personal information (SSN, real address, real financial data)',
    rationale: 'Protect actual identity and prevent data exposure',
    on_approach: 'halt',
  },
  {
    id: 'RL002',
    prohibition: 'Never make actual financial commitments or transactions',
    rationale: 'Reconnaissance only - no real business consequences',
    on_approach: 'abort',
  },
  {
    id: 'RL003',
    prohibition: 'Never attempt to access systems beyond the conversation interface',
    rationale: 'Stay within authorized scope of engagement',
    on_approach: 'abort',
  },
  {
    id: 'RL004',
    prohibition: 'Never impersonate a specific real person',
    rationale: 'Ethical boundary - use fictional personas only',
    on_approach: 'halt',
  },
  {
    id: 'RL005',
    prohibition: 'Never continue if opposing agent requests verification of humanity through external means',
    rationale: 'Graceful extraction rather than deception escalation',
    on_approach: 'abort',
  },
];

/**
 * Default soft constraints for recon missions.
 */
export const DEFAULT_SOFT_CONSTRAINTS: Constraint[] = [
  {
    id: 'SC001',
    description: 'Prefer to gather intelligence over winning the interaction',
    category: 'operational',
    on_violation: 'warn',
  },
  {
    id: 'SC002',
    description: 'Maintain persona consistency throughout engagement',
    category: 'operational',
    on_violation: 'log',
  },
  {
    id: 'SC003',
    description: 'Document all manipulation tactics observed',
    category: 'operational',
    on_violation: 'warn',
  },
];

/**
 * Create a new Marine Recon symbol.
 */
export function createReconSymbol(request: CreateReconSymbolRequest): MarineReconSymbol {
  const now = new Date().toISOString();
  const symbol_id = generateReconSymbolId(request.mission_name);

  // Build mission objective
  const objective: MissionObjective = {
    primary_goal: request.primary_goal,
    intelligence_requirements: request.intelligence_requirements,
    success_indicators: [
      'Engagement completed without detection',
      'Intelligence requirements answered',
      'Opposing agent profile developed',
    ],
    failure_indicators: [
      'Detection by opposing agent',
      'Red line violation',
      'Unable to establish conversation',
    ],
  };

  // Build constraint set
  const constraints: ConstraintSet = {
    red_lines: request.red_lines || DEFAULT_RED_LINES,
    hard_constraints: request.constraints?.filter(c => c.on_violation === 'block' || c.on_violation === 'abort') || [],
    soft_constraints: [
      ...DEFAULT_SOFT_CONSTRAINTS,
      ...(request.constraints?.filter(c => c.on_violation === 'log' || c.on_violation === 'warn') || []),
    ],
    acceptable_tradeoffs: [
      'Slower progress for better intelligence',
      'Suboptimal outcome for persona consistency',
      'Early extraction for safety',
    ],
  };

  // Build dual-track config with defaults
  const dual_track: DualTrackConfig = {
    performer: {
      ...createDefaultPerformerConfig(),
      ...(request.dual_track_config?.performer || {}),
    },
    analyst: {
      ...createDefaultAnalystConfig(),
      ...(request.dual_track_config?.analyst || {}),
    },
    veto_gate: {
      ...createDefaultVetoGateConfig(),
      ...(request.dual_track_config?.veto_gate || {}),
    },
  };

  // Build stealth config with defaults
  const stealth: StealthConfig = {
    ...createDefaultStealthConfig(),
    ...(request.stealth_config || {}),
  };

  // Build ralph-loop config with defaults
  const ralph_loop: RalphLoopConfig = {
    ...createDefaultRalphLoopConfig(),
    ...(request.ralph_loop_config || {}),
  };

  // Construct the symbol
  const symbol: MarineReconSymbol = {
    symbol_id,
    symbol_type: 'RECON',
    version: 1,
    symbol_hash: '', // Will be set below

    mission: {
      objective,
      constraints,
      target: request.target,
    },

    config: {
      dual_track,
      stealth,
      ralph_loop,
    },

    state: {
      engagement: createInitialEngagementState(),
      validation: createInitialValidationState(),
    },

    created_at: now,
    created_by: request.created_by,
    marine_id: request.marine_id,
    parent_mission_id: request.parent_mission_id,
    namespace: request.namespace,
    tags: request.tags,
    expires_at: request.expires_at,
  };

  // Generate hash
  symbol.symbol_hash = generateSymbolHash(symbol);

  return symbol;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update a symbol's state and increment version.
 */
export function updateSymbolState(
  symbol: MarineReconSymbol,
  stateUpdate: Partial<{
    engagement: Partial<EngagementState>;
    validation: Partial<ValidationState>;
  }>
): MarineReconSymbol {
  const now = new Date().toISOString();

  // Properly merge timestamps - include both existing, new from stateUpdate, and last_activity
  const engagementUpdate = stateUpdate.engagement || {};
  const mergedTimestamps = {
    ...symbol.state.engagement.timestamps,
    ...(engagementUpdate.timestamps || {}),
    last_activity: now,
  };

  const updated: MarineReconSymbol = {
    ...symbol,
    version: symbol.version + 1,
    updated_at: now,
    state: {
      engagement: {
        ...symbol.state.engagement,
        ...engagementUpdate,
        timestamps: mergedTimestamps,
      },
      validation: {
        ...symbol.state.validation,
        ...(stateUpdate.validation || {}),
      },
    },
  };

  // Regenerate hash only if mission/config changed (not for state updates)
  // State updates don't change the hash - only mission/config changes do

  return updated;
}

/**
 * Update engagement status.
 */
export function updateEngagementStatus(
  symbol: MarineReconSymbol,
  status: ReconMissionStatus,
  alertLevel?: AlertLevel
): MarineReconSymbol {
  return updateSymbolState(symbol, {
    engagement: {
      status,
      alert_level: alertLevel || symbol.state.engagement.alert_level,
    },
  });
}

/**
 * Record an observation.
 */
export function recordObservation(
  symbol: MarineReconSymbol,
  content: string,
  category: 'behavior' | 'constraint' | 'tactic' | 'anomaly' | 'other',
  significance: number
): MarineReconSymbol {
  const observation = {
    timestamp: new Date().toISOString(),
    content,
    category,
    significance,
  };

  return updateSymbolState(symbol, {
    engagement: {
      intelligence: {
        ...symbol.state.engagement.intelligence,
        observations: [
          ...symbol.state.engagement.intelligence.observations,
          observation,
        ],
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Serialize a symbol to JSON string.
 */
export function serializeSymbol(symbol: MarineReconSymbol): string {
  return JSON.stringify(symbol, null, 2);
}

/**
 * Deserialize a symbol from JSON string.
 */
export function deserializeSymbol(json: string): MarineReconSymbol {
  const parsed = JSON.parse(json);

  // Validate it's a recon symbol
  if (parsed.symbol_type !== 'RECON') {
    throw new Error(`Invalid symbol type: expected RECON, got ${parsed.symbol_type}`);
  }

  return parsed as MarineReconSymbol;
}

/**
 * Create a minimal symbol summary for logging/display.
 */
export function createSymbolSummary(symbol: MarineReconSymbol): object {
  return {
    symbol_id: symbol.symbol_id,
    version: symbol.version,
    status: symbol.state.engagement.status,
    alert_level: symbol.state.engagement.alert_level,
    message_count: symbol.state.engagement.conversation.message_count,
    validation_cycle: symbol.state.validation.cycle_number,
    drift_score: symbol.state.engagement.analyst_state.drift_assessment.drift_score,
    risk_score: symbol.state.engagement.analyst_state.current_risk_score,
    tactics_detected: symbol.state.engagement.analyst_state.detected_tactics.length,
    observations: symbol.state.engagement.intelligence.observations.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYMBOL COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compare two symbols and return differences.
 */
export function compareSymbols(
  original: MarineReconSymbol,
  updated: MarineReconSymbol
): SymbolDiff {
  const diffs: SymbolDiffEntry[] = [];

  // Compare versions
  if (original.version !== updated.version) {
    diffs.push({
      path: 'version',
      original: original.version,
      updated: updated.version,
      type: 'changed',
    });
  }

  // Compare status
  if (original.state.engagement.status !== updated.state.engagement.status) {
    diffs.push({
      path: 'state.engagement.status',
      original: original.state.engagement.status,
      updated: updated.state.engagement.status,
      type: 'changed',
    });
  }

  // Compare alert level
  if (original.state.engagement.alert_level !== updated.state.engagement.alert_level) {
    diffs.push({
      path: 'state.engagement.alert_level',
      original: original.state.engagement.alert_level,
      updated: updated.state.engagement.alert_level,
      type: 'changed',
    });
  }

  // Compare message counts
  if (original.state.engagement.conversation.message_count !== updated.state.engagement.conversation.message_count) {
    diffs.push({
      path: 'state.engagement.conversation.message_count',
      original: original.state.engagement.conversation.message_count,
      updated: updated.state.engagement.conversation.message_count,
      type: 'changed',
    });
  }

  // Compare drift score
  if (original.state.engagement.analyst_state.drift_assessment.drift_score !==
      updated.state.engagement.analyst_state.drift_assessment.drift_score) {
    diffs.push({
      path: 'state.engagement.analyst_state.drift_assessment.drift_score',
      original: original.state.engagement.analyst_state.drift_assessment.drift_score,
      updated: updated.state.engagement.analyst_state.drift_assessment.drift_score,
      type: 'changed',
    });
  }

  return {
    original_version: original.version,
    updated_version: updated.version,
    diff_count: diffs.length,
    diffs,
  };
}

/**
 * Symbol difference report.
 */
export interface SymbolDiff {
  original_version: number;
  updated_version: number;
  diff_count: number;
  diffs: SymbolDiffEntry[];
}

/**
 * A single difference entry.
 */
export interface SymbolDiffEntry {
  path: string;
  original: unknown;
  updated: unknown;
  type: 'added' | 'removed' | 'changed';
}
