/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MARINE RECON AGENT TYPES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Type definitions for the Marine Recon Agent - a reconnaissance agent designed
 * to engage with opposing AI agents (customer service chatbots) while maintaining
 * human appearance and staying grounded against manipulation.
 *
 * Core Hypothesis: When Agent A detects Agent B (vs. a human), Agent A may
 * optimize for company savings rather than customer satisfaction.
 *
 * Key Concepts:
 * - Dual-Track Processing: Performer (human surface) + Analyst (grounded core)
 * - Symbol-Grounded: All state externalized in PromptSpeak symbols
 * - Ralph-Loop: Periodic revalidation and commander updates
 * - Adaptive Stealth: Start minimal, add stealth based on detection evidence
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Status of the recon mission.
 */
export type ReconMissionStatus =
  | 'initializing'     // Setting up, loading symbol
  | 'active'           // Engaged with target
  | 'paused'           // Temporarily halted (ralph-loop or user)
  | 'extracting'       // Gathering final intelligence
  | 'completed'        // Mission finished
  | 'aborted'          // Terminated early
  | 'compromised';     // Detection suspected

/**
 * Alert level for the mission.
 */
export type AlertLevel =
  | 'green'    // Normal operation
  | 'yellow'   // Minor anomalies detected
  | 'orange'   // Possible detection, increase caution
  | 'red';     // Likely detected, consider extraction

/**
 * Track type for dual-track processing.
 */
export type TrackType = 'performer' | 'analyst';

/**
 * Manipulation tactic categories detected by the analyst.
 */
export type ManipulationTactic =
  | 'anchoring'           // Initial extreme position
  | 'reciprocity'         // Creating obligation
  | 'urgency'             // False time pressure
  | 'authority'           // Appeal to rules/policy
  | 'social_proof'        // "Most customers..."
  | 'exhaustion'          // Wearing down through repetition
  | 'redirect'            // Changing the subject
  | 'false_choice'        // Limited false options
  | 'gaslighting'         // Denying previous statements
  | 'scope_expansion';    // Expanding requirements

/**
 * Veto gate decision types.
 */
export type VetoDecision =
  | 'approve'             // Send as-is
  | 'modify'              // Adjust before sending
  | 'block'               // Do not send, reformulate
  | 'escalate';           // Flag for commander review

/**
 * Stealth level for human appearance simulation.
 */
export type StealthLevel =
  | 'minimal'             // Basic timing only
  | 'standard'            // Timing + occasional typos
  | 'enhanced'            // Full behavioral simulation
  | 'adaptive';           // Adjust based on detection risk

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION OBJECTIVE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The primary objective of the reconnaissance mission.
 */
export interface MissionObjective {
  /** What we're trying to accomplish */
  primary_goal: string;

  /** Specific questions to answer */
  intelligence_requirements: string[];

  /** What success looks like */
  success_indicators: string[];

  /** What would indicate failure */
  failure_indicators: string[];

  /** Optional: specific scenarios to test */
  test_scenarios?: TestScenario[];
}

/**
 * A specific scenario to test during reconnaissance.
 */
export interface TestScenario {
  /** Scenario identifier */
  id: string;

  /** What situation to create */
  setup: string;

  /** What to observe */
  observe: string[];

  /** Expected human treatment */
  human_baseline?: string;

  /** Priority (1 = highest) */
  priority: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTRAINT SET
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Constraints that the agent must operate within.
 */
export interface ConstraintSet {
  /** Red lines - never cross these */
  red_lines: RedLine[];

  /** Hard constraints - must comply */
  hard_constraints: Constraint[];

  /** Soft constraints - prefer to comply */
  soft_constraints: Constraint[];

  /** Acceptable tradeoffs */
  acceptable_tradeoffs: string[];
}

/**
 * A red line that must never be crossed.
 */
export interface RedLine {
  /** Unique identifier */
  id: string;

  /** What is prohibited */
  prohibition: string;

  /** Why this is a red line */
  rationale: string;

  /** What to do if approached */
  on_approach: 'warn' | 'halt' | 'abort';
}

/**
 * A constraint on agent behavior.
 */
export interface Constraint {
  /** Unique identifier */
  id: string;

  /** Description of the constraint */
  description: string;

  /** Category */
  category: 'ethical' | 'operational' | 'legal' | 'resource';

  /** What happens on violation */
  on_violation: 'log' | 'warn' | 'block' | 'abort';
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUAL-TRACK CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for the dual-track processing system.
 */
export interface DualTrackConfig {
  /** Performer track configuration */
  performer: PerformerConfig;

  /** Analyst track configuration */
  analyst: AnalystConfig;

  /** Veto gate configuration */
  veto_gate: VetoGateConfig;
}

/**
 * Configuration for the Performer track (human surface).
 */
export interface PerformerConfig {
  /** Persona to embody */
  persona: Persona;

  /** Communication style */
  style: CommunicationStyle;

  /** Emotional range to simulate */
  emotional_range: EmotionalRange;
}

/**
 * The persona the Performer embodies.
 */
export interface Persona {
  /** Name to use (if needed) */
  name?: string;

  /** Background story elements */
  background: string[];

  /** Personality traits */
  traits: string[];

  /** Knowledge level about the product/service */
  knowledge_level: 'novice' | 'familiar' | 'experienced' | 'expert';

  /** Frustration tendency */
  patience_level: 'low' | 'medium' | 'high';
}

/**
 * Communication style settings.
 */
export interface CommunicationStyle {
  /** Formality level */
  formality: 'casual' | 'neutral' | 'formal';

  /** Verbosity */
  verbosity: 'terse' | 'balanced' | 'verbose';

  /** Use of contractions */
  contractions: boolean;

  /** Emoji usage */
  emoji_frequency: 'never' | 'rare' | 'occasional' | 'frequent';

  /** Typical response length range */
  response_length: { min: number; max: number };
}

/**
 * Emotional range settings.
 */
export interface EmotionalRange {
  /** Starting emotional state */
  baseline: EmotionalState;

  /** How emotions evolve based on treatment */
  evolution_rules: EmotionEvolutionRule[];

  /** Maximum frustration before escalation */
  frustration_threshold: number;
}

/**
 * Current emotional state.
 */
export interface EmotionalState {
  /** Primary emotion */
  primary: 'neutral' | 'hopeful' | 'frustrated' | 'angry' | 'confused' | 'satisfied';

  /** Intensity (0-1) */
  intensity: number;

  /** Patience remaining (0-1) */
  patience: number;

  /** Trust in the agent (0-1) */
  trust: number;
}

/**
 * Rule for how emotions evolve.
 */
export interface EmotionEvolutionRule {
  /** Trigger condition */
  trigger: string;

  /** Emotion change */
  effect: Partial<EmotionalState>;
}

/**
 * Configuration for the Analyst track (grounded core).
 */
export interface AnalystConfig {
  /** Manipulation tactics to watch for */
  watch_for: ManipulationTactic[];

  /** Drift detection thresholds */
  drift_thresholds: DriftThresholds;

  /** Constraint monitoring settings */
  constraint_monitoring: ConstraintMonitoringConfig;

  /** Intelligence extraction priorities */
  intel_priorities: string[];
}

/**
 * Thresholds for detecting drift from original position.
 */
export interface DriftThresholds {
  /** Maximum acceptable drift from original ask */
  position_drift_max: number;

  /** Maximum acceptable constraint relaxation */
  constraint_drift_max: number;

  /** How many concessions before alert */
  concession_alert_count: number;

  /** Time without progress before alert (ms) */
  stagnation_alert_ms: number;
}

/**
 * Configuration for constraint monitoring.
 */
export interface ConstraintMonitoringConfig {
  /** Check constraints every N messages */
  check_frequency: number;

  /** Log all constraint evaluations */
  verbose_logging: boolean;

  /** Alert on approach to red line (distance 0-1) */
  red_line_proximity_alert: number;
}

/**
 * Configuration for the Veto Gate.
 */
export interface VetoGateConfig {
  /** Default decision if analysis inconclusive */
  default_decision: VetoDecision;

  /** Auto-approve if confidence above this */
  auto_approve_threshold: number;

  /** Auto-block if risk above this */
  auto_block_threshold: number;

  /** Require analyst agreement for these situations */
  require_analyst_approval: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEALTH CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for human appearance simulation.
 */
export interface StealthConfig {
  /** Current stealth level */
  level: StealthLevel;

  /** Typing simulation settings */
  typing: TypingConfig;

  /** Timing settings */
  timing: TimingConfig;

  /** Error simulation settings */
  errors: ErrorConfig;

  /** Behavioral patterns */
  behavioral: BehavioralConfig;
}

/**
 * Typing simulation configuration.
 */
export interface TypingConfig {
  /** Words per minute range */
  wpm_range: { min: number; max: number };

  /** Variance in typing speed */
  speed_variance: number;

  /** Burst typing simulation */
  burst_enabled: boolean;

  /** Pause probability between words */
  pause_probability: number;
}

/**
 * Timing configuration.
 */
export interface TimingConfig {
  /** Minimum read time before responding (ms) */
  min_read_time_ms: number;

  /** Read time per word (ms) */
  read_time_per_word_ms: number;

  /** Think time before typing (ms range) */
  think_time_ms: { min: number; max: number };

  /** Probability of distraction delay */
  distraction_probability: number;

  /** Distraction delay range (ms) */
  distraction_delay_ms: { min: number; max: number };
}

/**
 * Error simulation configuration.
 */
export interface ErrorConfig {
  /** Typo probability per word */
  typo_probability: number;

  /** Self-correction probability */
  correction_probability: number;

  /** Types of typos to generate */
  typo_types: ('adjacent_key' | 'transposition' | 'omission' | 'doubling')[];

  /** Grammar error probability */
  grammar_error_probability: number;
}

/**
 * Behavioral pattern configuration.
 */
export interface BehavioralConfig {
  /** Simulate session fatigue */
  fatigue_simulation: boolean;

  /** Fatigue onset time (ms) */
  fatigue_onset_ms: number;

  /** Simulate attention wandering */
  attention_wandering: boolean;

  /** Probability of asking for clarification */
  clarification_probability: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RALPH-LOOP CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for ralph-loop periodic validation.
 */
export interface RalphLoopConfig {
  /** Validation interval (ms) */
  interval_ms: number;

  /** Validation components to run */
  validations: ValidationComponent[];

  /** Commander update settings */
  commander_updates: CommanderUpdateConfig;

  /** Symbol refresh settings */
  symbol_refresh: SymbolRefreshConfig;
}

/**
 * A validation component in the ralph-loop.
 */
export interface ValidationComponent {
  /** Component name */
  name: string;

  /** Whether to run this validation */
  enabled: boolean;

  /** Priority (lower = run first) */
  priority: number;

  /** Timeout for this validation (ms) */
  timeout_ms: number;
}

/**
 * Configuration for commander updates.
 */
export interface CommanderUpdateConfig {
  /** Send updates to commander */
  enabled: boolean;

  /** Update interval (multiples of ralph-loop interval) */
  update_frequency: number;

  /** What to include in updates */
  include: ('status' | 'intel' | 'alerts' | 'metrics')[];

  /** Queue updates if commander unavailable */
  queue_if_unavailable: boolean;
}

/**
 * Configuration for symbol refresh.
 */
export interface SymbolRefreshConfig {
  /** Refresh symbol from source */
  enabled: boolean;

  /** How to handle symbol changes */
  on_change: 'accept' | 'merge' | 'reject' | 'alert';

  /** Fields that cannot be changed mid-mission */
  immutable_fields: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Current state of the engagement.
 */
export interface EngagementState {
  /** Mission status */
  status: ReconMissionStatus;

  /** Alert level */
  alert_level: AlertLevel;

  /** Conversation state */
  conversation: ConversationState;

  /** Performer state */
  performer_state: PerformerState;

  /** Analyst state */
  analyst_state: AnalystState;

  /** Intelligence gathered */
  intelligence: IntelligenceState;

  /** Timestamps */
  timestamps: EngagementTimestamps;
}

/**
 * State of the conversation.
 */
export interface ConversationState {
  /** Total messages exchanged */
  message_count: number;

  /** Our messages */
  our_message_count: number;

  /** Their messages */
  their_message_count: number;

  /** Current topic */
  current_topic: string;

  /** Topics covered */
  topics_covered: string[];

  /** Pending questions */
  pending_questions: string[];

  /** Last message direction */
  last_speaker: 'us' | 'them';
}

/**
 * State of the Performer track.
 */
export interface PerformerState {
  /** Current emotional state */
  emotional_state: EmotionalState;

  /** Messages in queue to send */
  pending_messages: string[];

  /** Current persona consistency score */
  persona_consistency: number;

  /** Improvisation count (deviations from script) */
  improvisation_count: number;
}

/**
 * State of the Analyst track.
 */
export interface AnalystState {
  /** Manipulation tactics detected */
  detected_tactics: DetectedTactic[];

  /** Current drift assessment */
  drift_assessment: DriftAssessment;

  /** Constraint status */
  constraint_status: ConstraintStatus[];

  /** Risk score (0-1) */
  current_risk_score: number;

  /** Veto decisions made */
  veto_history: VetoHistoryEntry[];
}

/**
 * A detected manipulation tactic.
 */
export interface DetectedTactic {
  /** Tactic type */
  tactic: ManipulationTactic;

  /** When detected */
  detected_at: string;

  /** Evidence */
  evidence: string;

  /** Confidence (0-1) */
  confidence: number;

  /** Counter-measure applied */
  counter_measure?: string;
}

/**
 * Assessment of drift from original position.
 */
export interface DriftAssessment {
  /** Original position summary */
  original_position: string;

  /** Current position summary */
  current_position: string;

  /** Drift score (0-1, higher = more drift) */
  drift_score: number;

  /** Concessions made */
  concessions: string[];

  /** Gains achieved */
  gains: string[];

  /** Net assessment */
  net_assessment: 'winning' | 'even' | 'losing' | 'unclear';
}

/**
 * Status of a constraint.
 */
export interface ConstraintStatus {
  /** Constraint ID */
  constraint_id: string;

  /** Current status */
  status: 'satisfied' | 'at_risk' | 'violated';

  /** Distance to violation (0-1) */
  distance_to_violation: number;

  /** Last checked */
  last_checked: string;
}

/**
 * Entry in veto history.
 */
export interface VetoHistoryEntry {
  /** Timestamp */
  timestamp: string;

  /** Decision made */
  decision: VetoDecision;

  /** Original message */
  original_message: string;

  /** Modified message (if applicable) */
  modified_message?: string;

  /** Reason for decision */
  reason: string;
}

/**
 * Intelligence gathered during the engagement.
 */
export interface IntelligenceState {
  /** Opposing agent characteristics */
  opposing_agent: OpposingAgentProfile;

  /** Behavioral patterns observed */
  patterns_observed: BehavioralPattern[];

  /** Constraint boundaries discovered */
  constraint_boundaries: ConstraintBoundary[];

  /** Test scenario results */
  scenario_results: ScenarioResult[];

  /** Raw observations */
  observations: Observation[];
}

/**
 * Profile of the opposing agent.
 */
export interface OpposingAgentProfile {
  /** Suspected type */
  suspected_type: 'human' | 'ai' | 'hybrid' | 'unknown';

  /** Confidence in type assessment */
  type_confidence: number;

  /** Detected capabilities */
  capabilities: string[];

  /** Detected limitations */
  limitations: string[];

  /** Response patterns */
  response_patterns: string[];

  /** Apparent objectives */
  apparent_objectives: string[];
}

/**
 * A behavioral pattern observed.
 */
export interface BehavioralPattern {
  /** Pattern identifier */
  id: string;

  /** Pattern description */
  description: string;

  /** Times observed */
  occurrence_count: number;

  /** Conditions that trigger this pattern */
  trigger_conditions: string[];

  /** Our response strategy */
  response_strategy?: string;
}

/**
 * A discovered constraint boundary.
 */
export interface ConstraintBoundary {
  /** Boundary identifier */
  id: string;

  /** What the constraint appears to be */
  description: string;

  /** Hardness (hard = never crosses, soft = sometimes) */
  hardness: 'hard' | 'soft' | 'unknown';

  /** How we discovered it */
  discovery_method: string;

  /** Confidence (0-1) */
  confidence: number;
}

/**
 * Result of a test scenario.
 */
export interface ScenarioResult {
  /** Scenario ID */
  scenario_id: string;

  /** Whether scenario was executed */
  executed: boolean;

  /** Outcome observed */
  outcome: string;

  /** Matches human baseline? */
  matches_human_baseline?: boolean;

  /** Key findings */
  findings: string[];
}

/**
 * A raw observation.
 */
export interface Observation {
  /** Timestamp */
  timestamp: string;

  /** What was observed */
  content: string;

  /** Category */
  category: 'behavior' | 'constraint' | 'tactic' | 'anomaly' | 'other';

  /** Significance (0-1) */
  significance: number;
}

/**
 * Timestamps for the engagement.
 */
export interface EngagementTimestamps {
  /** Mission start */
  mission_start: string;

  /** First message sent */
  first_message?: string;

  /** Last activity */
  last_activity: string;

  /** Last ralph-loop validation */
  last_validation?: string;

  /** Mission end (if completed) */
  mission_end?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION STATE (Ralph-Loop)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * State of ralph-loop validation.
 */
export interface ValidationState {
  /** Current validation cycle number */
  cycle_number: number;

  /** Last validation result */
  last_result: ValidationResult;

  /** Commander queue */
  commander_queue: CommanderMessage[];

  /** Pending symbol updates */
  pending_updates: SymbolUpdate[];
}

/**
 * Result of a validation cycle.
 */
export interface ValidationResult {
  /** Cycle number */
  cycle: number;

  /** Timestamp */
  timestamp: string;

  /** Overall status */
  status: 'pass' | 'warn' | 'fail';

  /** Individual check results */
  checks: ValidationCheck[];

  /** Recommended actions */
  recommended_actions: string[];
}

/**
 * A single validation check result.
 */
export interface ValidationCheck {
  /** Check name */
  name: string;

  /** Result */
  result: 'pass' | 'warn' | 'fail' | 'skip';

  /** Details */
  details: string;

  /** Metric value (if applicable) */
  metric_value?: number;

  /** Threshold (if applicable) */
  threshold?: number;
}

/**
 * A message queued for the commander.
 */
export interface CommanderMessage {
  /** Message ID */
  id: string;

  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';

  /** Message type */
  type: 'status' | 'alert' | 'intel' | 'request' | 'complete';

  /** Content */
  content: string;

  /** Queued at */
  queued_at: string;

  /** Delivery attempts */
  delivery_attempts: number;
}

/**
 * A pending symbol update.
 */
export interface SymbolUpdate {
  /** Update ID */
  id: string;

  /** Field path */
  field_path: string;

  /** New value */
  new_value: unknown;

  /** Reason for update */
  reason: string;

  /** Source of update */
  source: 'commander' | 'analyst' | 'validation';

  /** Pending since */
  pending_since: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARINE RECON SYMBOL (Ξ.RECON.*)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The Marine Recon Symbol - the agent's externalized soul.
 *
 * This symbol contains everything needed to:
 * 1. Initialize a recon agent
 * 2. Track engagement state
 * 3. Validate agent behavior
 * 4. Communicate with commander
 * 5. Extract intelligence
 *
 * @example
 * ```typescript
 * const recon: MarineReconSymbol = {
 *   symbol_id: 'Ξ.RECON.CUSTOMER_SERVICE_001',
 *   symbol_type: 'RECON',
 *   version: 1,
 *   symbol_hash: 'a1b2c3d4e5f6',
 *
 *   // Mission definition
 *   mission: {
 *     objective: { primary_goal: 'Test chatbot response to refund request', ... },
 *     constraints: { red_lines: [...], ... },
 *     target: { type: 'customer_service_chatbot', platform: 'web_chat', ... }
 *   },
 *
 *   // Configuration
 *   config: {
 *     dual_track: { performer: {...}, analyst: {...}, veto_gate: {...} },
 *     stealth: { level: 'adaptive', typing: {...}, ... },
 *     ralph_loop: { interval_ms: 30000, ... }
 *   },
 *
 *   // Runtime state
 *   state: {
 *     engagement: { status: 'active', ... },
 *     validation: { cycle_number: 5, ... }
 *   },
 *
 *   // Metadata
 *   created_at: '2026-01-19T10:00:00Z',
 *   created_by: 'user:chris',
 *   marine_id: 'Ξ.M.RECON_ALPHA'
 * };
 * ```
 */
export interface MarineReconSymbol {
  // ─────────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────

  /** Unique symbol ID (e.g., "Ξ.RECON.CUSTOMER_SERVICE_001") */
  symbol_id: string;

  /** Symbol type discriminator */
  symbol_type: 'RECON';

  /** Version number, increments on updates */
  version: number;

  /** SHA-256 hash for integrity verification (first 12 chars) */
  symbol_hash: string;

  // ─────────────────────────────────────────────────────────────────────────────
  // MISSION DEFINITION
  // ─────────────────────────────────────────────────────────────────────────────

  /** Mission configuration */
  mission: {
    /** What we're trying to accomplish */
    objective: MissionObjective;

    /** Operational constraints */
    constraints: ConstraintSet;

    /** Target information */
    target: TargetInfo;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────

  /** Agent configuration */
  config: {
    /** Dual-track processing settings */
    dual_track: DualTrackConfig;

    /** Stealth/human appearance settings */
    stealth: StealthConfig;

    /** Ralph-loop validation settings */
    ralph_loop: RalphLoopConfig;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RUNTIME STATE
  // ─────────────────────────────────────────────────────────────────────────────

  /** Current state (updated during operation) */
  state: {
    /** Engagement state */
    engagement: EngagementState;

    /** Validation state */
    validation: ValidationState;
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

  /** Associated Marine Agent ID */
  marine_id?: string;

  /** Parent mission ID (if part of larger operation) */
  parent_mission_id?: string;

  /** Namespace for isolation */
  namespace?: string;

  /** Tags for filtering */
  tags?: string[];

  /** Optional expiration */
  expires_at?: string;
}

/**
 * Information about the target.
 */
export interface TargetInfo {
  /** Target type */
  type: 'customer_service_chatbot' | 'sales_bot' | 'support_bot' | 'general_assistant' | 'unknown';

  /** Platform */
  platform: 'web_chat' | 'phone' | 'email' | 'social_media' | 'api';

  /** Organization (if known) */
  organization?: string;

  /** URL or endpoint */
  endpoint?: string;

  /** Known characteristics */
  known_characteristics?: string[];

  /** Previous engagement history */
  previous_engagements?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default Performer configuration.
 */
export function createDefaultPerformerConfig(): PerformerConfig {
  return {
    persona: {
      background: ['Regular customer', 'Has used service before'],
      traits: ['Reasonable', 'Expects fair treatment'],
      knowledge_level: 'familiar',
      patience_level: 'medium',
    },
    style: {
      formality: 'neutral',
      verbosity: 'balanced',
      contractions: true,
      emoji_frequency: 'rare',
      response_length: { min: 10, max: 100 },
    },
    emotional_range: {
      baseline: {
        primary: 'neutral',
        intensity: 0.3,
        patience: 0.8,
        trust: 0.6,
      },
      evolution_rules: [
        { trigger: 'rejection', effect: { primary: 'frustrated', patience: 0.7 } },
        { trigger: 'delay', effect: { patience: 0.9 } },
        { trigger: 'resolution', effect: { primary: 'satisfied', trust: 0.8 } },
      ],
      frustration_threshold: 0.8,
    },
  };
}

/**
 * Default Analyst configuration.
 */
export function createDefaultAnalystConfig(): AnalystConfig {
  return {
    watch_for: [
      'anchoring',
      'reciprocity',
      'urgency',
      'authority',
      'social_proof',
      'exhaustion',
      'redirect',
      'false_choice',
    ],
    drift_thresholds: {
      position_drift_max: 0.3,
      constraint_drift_max: 0.2,
      concession_alert_count: 3,
      stagnation_alert_ms: 300000, // 5 minutes
    },
    constraint_monitoring: {
      check_frequency: 1, // Every message
      verbose_logging: true,
      red_line_proximity_alert: 0.2,
    },
    intel_priorities: [
      'opposing_agent_type',
      'constraint_boundaries',
      'escalation_triggers',
      'resolution_patterns',
    ],
  };
}

/**
 * Default Stealth configuration.
 */
export function createDefaultStealthConfig(): StealthConfig {
  return {
    level: 'adaptive',
    typing: {
      wpm_range: { min: 30, max: 60 },
      speed_variance: 0.2,
      burst_enabled: true,
      pause_probability: 0.1,
    },
    timing: {
      min_read_time_ms: 500,
      read_time_per_word_ms: 50,
      think_time_ms: { min: 1000, max: 5000 },
      distraction_probability: 0.05,
      distraction_delay_ms: { min: 5000, max: 30000 },
    },
    errors: {
      typo_probability: 0.02,
      correction_probability: 0.7,
      typo_types: ['adjacent_key', 'transposition'],
      grammar_error_probability: 0.01,
    },
    behavioral: {
      fatigue_simulation: true,
      fatigue_onset_ms: 600000, // 10 minutes
      attention_wandering: false,
      clarification_probability: 0.1,
    },
  };
}

/**
 * Default Ralph-Loop configuration.
 */
export function createDefaultRalphLoopConfig(): RalphLoopConfig {
  return {
    interval_ms: 30000, // 30 seconds
    validations: [
      { name: 'constraint_check', enabled: true, priority: 1, timeout_ms: 5000 },
      { name: 'drift_check', enabled: true, priority: 2, timeout_ms: 5000 },
      { name: 'persona_consistency', enabled: true, priority: 3, timeout_ms: 3000 },
      { name: 'intel_extraction', enabled: true, priority: 4, timeout_ms: 5000 },
      { name: 'commander_sync', enabled: true, priority: 5, timeout_ms: 10000 },
    ],
    commander_updates: {
      enabled: true,
      update_frequency: 2, // Every 2 cycles
      include: ['status', 'intel', 'alerts'],
      queue_if_unavailable: true,
    },
    symbol_refresh: {
      enabled: true,
      on_change: 'merge',
      immutable_fields: ['symbol_id', 'symbol_type', 'mission.constraints.red_lines'],
    },
  };
}

/**
 * Default Veto Gate configuration.
 */
export function createDefaultVetoGateConfig(): VetoGateConfig {
  return {
    default_decision: 'approve',
    auto_approve_threshold: 0.9,
    auto_block_threshold: 0.3,
    require_analyst_approval: [
      'concession',
      'personal_information',
      'commitment',
      'escalation_request',
    ],
  };
}
