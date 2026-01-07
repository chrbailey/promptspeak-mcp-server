/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * COMMANDER'S INTENT SYMBOL TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for Commander's Intent - the military doctrine that enables
 * autonomous agent decision-making while maintaining alignment with mission objectives.
 *
 * Key Concept: Every agent carrying Commander's Intent knows the "why" and has
 * latitude to accomplish it without coordinator round-trips for every decision.
 *
 * Reference: wise-giggling-dahl.md (Commander's Intent + Marine Agents plan)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// AUTONOMY LEVELS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Autonomy levels define how much latitude agents have in decision-making.
 *
 * | Level       | Behavior                                    | Use Case                    |
 * |-------------|---------------------------------------------|----------------------------|
 * | STRICT      | Follow instructions exactly, escalate all   | Critical ops, compliance   |
 * | GUIDED      | Use Intent for minor ambiguity, escalate    | Default for most agents    |
 * | AUTONOMOUS  | Make decisions freely within constraints    | Trusted agents, time-sens  |
 * | EXPLORATORY | Try novel approaches, propose changes       | Research, innovation       |
 */
export type AutonomyLevel = 'strict' | 'guided' | 'autonomous' | 'exploratory';

// ═══════════════════════════════════════════════════════════════════════════════
// END STATE CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Conditions that define mission success or failure.
 * Used by agents to self-assess completion status.
 */
export interface EndStateConditions {
  /** Conditions that indicate success (any one is sufficient) */
  success: string[];

  /** Conditions that indicate failure (any one triggers failure) */
  failure: string[];

  /** Optional partial success criteria */
  partial_success?: string[];

  /** Maximum duration before automatic failure (ISO 8601 duration, e.g., "PT1H") */
  timeout?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Constraint severity levels.
 */
export type ConstraintSeverity = 'advisory' | 'required' | 'critical';

/**
 * A constraint that limits agent behavior.
 */
export interface Constraint {
  /** Unique identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** Severity level */
  severity: ConstraintSeverity;

  /** Machine-checkable condition (optional - can be a PromptSpeak frame or rule) */
  condition?: string;

  /** What happens on violation */
  on_violation: 'warn' | 'block' | 'escalate' | 'terminate';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUCCESS CRITERIA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Measurable criteria for success evaluation.
 */
export interface SuccessCriterion {
  /** Criterion identifier */
  id: string;

  /** Description of what constitutes success */
  description: string;

  /** Metric name for measurement */
  metric?: string;

  /** Threshold value */
  threshold?: number;

  /** Comparison operator */
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

  /** Weight for weighted scoring (0-1) */
  weight?: number;

  /** Whether this criterion is required */
  required: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAILURE MODES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Anticipated failure modes and mitigation strategies.
 */
export interface FailureMode {
  /** Failure mode identifier */
  id: string;

  /** Description of the failure condition */
  description: string;

  /** Detection method */
  detection: string;

  /** Recommended mitigation */
  mitigation: string;

  /** Fallback action if mitigation fails */
  fallback?: string;

  /** Whether this failure is recoverable */
  recoverable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT SYMBOL (Ξ.I.*)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Commander's Intent Symbol (Ξ.I.MISSION_ID)
 *
 * The core grounding mechanism for multi-agent operations.
 * Every agent in a mission carries a copy of the Intent and can
 * consult it for autonomous decision-making.
 *
 * @example
 * ```typescript
 * const intent: IntentSymbol = {
 *   symbol_id: 'Ξ.I.MARKET_ANALYSIS_001',
 *   symbol_type: 'INTENT',
 *   mission_id: 'MARKET_ANALYSIS_001',
 *   version: 1,
 *   intent_hash: 'a1b2c3d4e5f6g7h8',
 *   objective: 'Analyze competitor product launch and market positioning',
 *   end_state: {
 *     success: ['comprehensive_report_created', 'key_differentiators_identified'],
 *     failure: ['timeout_exceeded', 'no_public_data_found']
 *   },
 *   constraints: [
 *     { id: 'C1', description: 'Only use public information', severity: 'critical', on_violation: 'block' }
 *   ],
 *   red_lines: ['No accessing non-public systems', 'No contacting competitor employees'],
 *   autonomy_level: 'autonomous',
 *   success_criteria: [...],
 *   failure_modes: [...],
 *   created_at: '2026-01-06T12:00:00Z',
 *   created_by: 'user:chris'
 * };
 * ```
 */
export interface IntentSymbol {
  // ─────────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────

  /** Unique symbol ID (e.g., "Ξ.I.MARKET_ANALYSIS_001") */
  symbol_id: string;

  /** Symbol type discriminator */
  symbol_type: 'INTENT';

  /** Associated mission ID */
  mission_id: string;

  /** Version number, increments on updates */
  version: number;

  /** SHA-256 hash for integrity verification (first 16 chars) */
  intent_hash: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // CORE INTENT (Immutable during mission)
  // ─────────────────────────────────────────────────────────────────────────────

  /** What we're trying to accomplish - the north star */
  objective: string;

  /** How we know we're done */
  end_state: EndStateConditions;

  /** What agents must NOT do */
  constraints: Constraint[];

  /** Absolute prohibitions - never cross these (immutable) */
  red_lines: string[];

  /** How much latitude agents have */
  autonomy_level: AutonomyLevel;

  // ─────────────────────────────────────────────────────────────────────────────
  // SUCCESS & FAILURE CRITERIA
  // ─────────────────────────────────────────────────────────────────────────────

  /** Measurable success criteria */
  success_criteria: SuccessCriterion[];

  /** Anticipated failure modes with mitigation */
  failure_modes: FailureMode[];

  // ─────────────────────────────────────────────────────────────────────────────
  // DECISION GUIDANCE
  // ─────────────────────────────────────────────────────────────────────────────

  /** When objectives conflict, which takes priority (ordered) */
  priority_order?: string[];

  /** What can be sacrificed to achieve the objective */
  acceptable_tradeoffs?: string[];

  /** Context for decision-making */
  context?: {
    /** Background information */
    background?: string;
    /** Key assumptions */
    assumptions?: string[];
    /** Relevant domain knowledge */
    domain_hints?: string[];
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // METADATA
  // ─────────────────────────────────────────────────────────────────────────────

  /** ISO 8601 creation timestamp */
  created_at: string;

  /** ISO 8601 last update timestamp */
  updated_at?: string;

  /** Creator identifier */
  created_by: string;

  /** Optional expiration (ISO 8601) */
  expires_at?: string;

  /** Namespace for multi-tenant isolation */
  namespace?: string;

  /** Tags for filtering */
  tags?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT CONSULTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of consulting Commander's Intent for a decision.
 * This is the OODA Loop's "Decide" output.
 */
export interface IntentConsultationResult {
  /** Recommended action */
  recommendation: 'proceed' | 'proceed_with_caution' | 'escalate' | 'abort';

  /** Confidence in the recommendation (0-1) */
  confidence: number;

  /** Reasoning chain */
  reasoning: string[];

  /** Which constraints were evaluated */
  constraints_evaluated: Array<{
    constraint_id: string;
    passed: boolean;
    notes?: string;
  }>;

  /** Whether any red lines would be crossed */
  red_line_violation: boolean;

  /** Violated red line if any */
  violated_red_line?: string;

  /** Whether the action advances the objective */
  advances_objective: boolean;

  /** Suggested alternatives if blocked */
  alternatives?: string[];
}

/**
 * Request to consult Commander's Intent for a decision.
 * This is how agents ask "Should I do this?" when uncertain.
 */
export interface IntentConsultationRequest {
  /** Agent making the request */
  agent_id: string;

  /** Intent being consulted */
  intent_id: string;

  /** Situation description */
  situation: string;

  /** Options being considered */
  options: Array<{
    id: string;
    description: string;
    pros?: string[];
    cons?: string[];
  }>;

  /** Urgency level */
  urgency?: 'low' | 'medium' | 'high' | 'critical';

  /** Additional context */
  context?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTENT BINDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Binding between an agent and an Intent.
 * An agent MUST have an Intent binding to operate in a mission.
 */
export interface IntentBinding {
  /** Binding ID */
  binding_id: string;

  /** Agent receiving the Intent */
  agent_id: string;

  /** Intent being bound */
  intent_id: string;

  /** Hash of the Intent at binding time (for drift detection) */
  bound_intent_hash: string;

  /** When the binding was created */
  bound_at: string;

  /** Who authorized the binding */
  bound_by: string;

  /** Optional scope restrictions for this binding */
  scope_restrictions?: {
    /** Subset of constraints that apply */
    applicable_constraints?: string[];
    /** Additional constraints for this agent */
    additional_constraints?: Constraint[];
    /** Override autonomy level */
    autonomy_override?: AutonomyLevel;
  };

  /** Binding status */
  status: 'active' | 'suspended' | 'revoked';
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TYPES (for Multi-Agent operations)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent role in the mission hierarchy.
 * Based on Marine Corps "every Marine a rifleman" doctrine.
 */
export type AgentRole =
  | 'coordinator'    // High-level orchestration (α agent)
  | 'specialist'     // Domain-specific execution (β agent)
  | 'support'        // Auxiliary functions (γ agent)
  | 'terminal';      // Final output generation (ω agent)

/**
 * Agent status in the mission.
 */
export type AgentStatus =
  | 'idle'           // Not assigned to mission
  | 'briefed'        // Has Intent, not yet executing
  | 'executing'      // Actively working
  | 'blocked'        // Waiting on dependency or human
  | 'completed'      // Finished successfully
  | 'failed'         // Terminated due to error
  | 'recalled';      // Pulled from mission

/**
 * Agent registration in the multi-agent system.
 */
export interface AgentRegistration {
  /** Unique agent identifier */
  agent_id: string;

  /** Human-readable name */
  name: string;

  /** Agent role */
  role: AgentRole;

  /** Current status */
  status: AgentStatus;

  /** Capabilities this agent provides */
  capabilities: string[];

  /** Current Intent binding (if any) */
  current_binding?: IntentBinding;

  /** Performance metrics */
  metrics?: {
    missions_completed: number;
    missions_failed: number;
    avg_completion_time_ms: number;
    last_active: string;
  };

  /** Registration timestamp */
  registered_at: string;

  /** Last heartbeat */
  last_heartbeat?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE/UPDATE REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request to create a new Intent symbol.
 */
export interface CreateIntentRequest {
  /** Mission this Intent belongs to */
  mission_id: string;

  /** What we're trying to accomplish */
  objective: string;

  /** End state conditions */
  end_state: EndStateConditions;

  /** Constraints on agent behavior */
  constraints?: Constraint[];

  /** Red lines that must never be crossed */
  red_lines: string[];

  /** Autonomy level for bound agents */
  autonomy_level: AutonomyLevel;

  /** Success criteria */
  success_criteria?: SuccessCriterion[];

  /** Anticipated failure modes */
  failure_modes?: FailureMode[];

  /** Priority ordering for conflicting objectives */
  priority_order?: string[];

  /** Acceptable tradeoffs */
  acceptable_tradeoffs?: string[];

  /** Additional context */
  context?: IntentSymbol['context'];

  /** Creator identifier */
  created_by: string;

  /** Expiration date */
  expires_at?: string;

  /** Namespace */
  namespace?: string;

  /** Tags */
  tags?: string[];
}

/**
 * Response from creating an Intent.
 */
export interface CreateIntentResponse {
  success: boolean;
  intent_id?: string;
  intent_hash?: string;
  version?: number;
  error?: string;
}

/**
 * Request to bind an agent to an Intent.
 */
export interface BindAgentRequest {
  /** Intent to bind */
  intent_id: string;

  /** Agent to bind */
  agent_id: string;

  /** Who is authorizing the binding */
  bound_by: string;

  /** Optional scope restrictions */
  scope_restrictions?: IntentBinding['scope_restrictions'];
}

/**
 * Response from binding an agent.
 */
export interface BindAgentResponse {
  success: boolean;
  binding_id?: string;
  bound_intent_hash?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mission status.
 */
export type MissionStatus =
  | 'planning'       // Being designed
  | 'briefing'       // Agents being assigned
  | 'active'         // In execution
  | 'paused'         // Temporarily halted
  | 'completed'      // Successfully finished
  | 'failed'         // Terminated due to failure
  | 'aborted';       // Manually terminated

/**
 * A Mission is a coordinated multi-agent operation with a single Intent.
 */
export interface Mission {
  /** Mission ID */
  mission_id: string;

  /** Human-readable name */
  name: string;

  /** Mission description */
  description: string;

  /** The Intent governing this mission */
  intent_id: string;

  /** Current status */
  status: MissionStatus;

  /** Assigned agents with their roles */
  agents: Array<{
    agent_id: string;
    role: AgentRole;
    binding_id: string;
  }>;

  /** Mission timeline */
  timeline: {
    created_at: string;
    started_at?: string;
    completed_at?: string;
    estimated_duration?: string;
  };

  /** Progress tracking */
  progress?: {
    phase: string;
    percent_complete: number;
    milestones_achieved: string[];
    current_blockers: string[];
  };

  /** Mission creator */
  created_by: string;

  /** Namespace */
  namespace?: string;
}

/**
 * Request to create a new Mission.
 */
export interface CreateMissionRequest {
  /** Mission name */
  name: string;

  /** Mission description */
  description: string;

  /** Intent to use (created separately) */
  intent_id: string;

  /** Initial agent assignments */
  agent_assignments?: Array<{
    agent_id: string;
    role: AgentRole;
  }>;

  /** Estimated duration (ISO 8601) */
  estimated_duration?: string;

  /** Creator */
  created_by: string;

  /** Namespace */
  namespace?: string;
}

/**
 * Response from creating a Mission.
 */
export interface CreateMissionResponse {
  success: boolean;
  mission_id?: string;
  bindings_created?: number;
  error?: string;
}

