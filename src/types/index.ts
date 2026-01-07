// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// SYMBOL ONTOLOGY TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SymbolDefinition {
  name: string;
  canonical: string;
  color: string;
  category: string;
  strength?: number;
  inherits?: boolean;
  level?: number;
}

export interface SymbolCategory {
  [symbol: string]: SymbolDefinition;
}

export interface SymbolOntology {
  modes: SymbolCategory;
  domains: SymbolCategory;
  constraints: SymbolCategory;
  actions: SymbolCategory;
  modifiers: SymbolCategory;
  sources: SymbolCategory;
  entities: SymbolCategory;
}

// ─────────────────────────────────────────────────────────────────────────────
// FRAME TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedSymbol {
  symbol: string;
  category: keyof SymbolOntology | 'unknown';
  definition: SymbolDefinition;
}

export interface ParsedFrame {
  raw: string;
  symbols: ParsedSymbol[];
  // String accessors for convenience
  mode: string | null;
  modifiers: string[];
  domain: string | null;
  source: string | null;
  constraints: string[];
  action: string | null;
  entity: string | null;
  // Full symbol objects
  modeSymbol?: ParsedSymbol;
  domainSymbol?: ParsedSymbol;
  constraintSymbols?: ParsedSymbol[];
  actionSymbol?: ParsedSymbol;
  modifierSymbols?: ParsedSymbol[];
  sourceSymbol?: ParsedSymbol;
  entitySymbol?: ParsedSymbol;
  // Metadata
  metadata: Record<string, unknown>;
  intentHash?: string;
  parseConfidence?: number;
}

export interface FrameBinding {
  frame: string;
  bindings: {
    [symbol: string]: {
      blocked?: string[];
      allowed?: string[];
      rate_limit?: string;
      extensions?: Record<string, unknown>;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'pass';

export interface ValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: ValidationSeverity;
  message: string;
  details?: string;
}

/**
 * Simplified validation error format used by validator's quick methods.
 */
export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  symbol?: string;
}

export interface ValidationReport {
  frame?: string;
  valid: boolean;
  structural?: ValidationResult[];
  semantic?: ValidationResult[];
  chain?: ValidationResult[];
  overallScore?: number;
  timestamp?: number;
  // Simplified error/warning format
  errors?: ValidationError[];
  warnings?: ValidationError[];
  // Metadata for quick validation methods
  metadata?: {
    validatedAt: number;
    validationLevel: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GATEKEEPER TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedFrame extends ParsedFrame {
  effectiveMode: SymbolDefinition & { extensions?: Record<string, unknown> };
  effectiveDomain: SymbolDefinition & { extensions?: Record<string, unknown> };
  effectiveConstraint?: SymbolDefinition & { extensions?: Record<string, unknown> };
  effectiveAction: SymbolDefinition & { extensions?: Record<string, unknown> };
  toolBindings: {
    blocked: string[];
    allowed: string[];
    rateLimit?: string;
  };
  // Additional computed properties for backward compatibility
  modeDefinition?: SymbolDefinition;
  domainDefinition?: SymbolDefinition;
  constraintDefinition?: SymbolDefinition;
  actionDefinition?: SymbolDefinition;
  // Tool access shortcuts
  allowedTools?: string[];
  blockedTools?: string[];
  // Symbol blocking
  blockedSymbols?: string[];
  // Overlay status
  overlayApplied?: boolean;
}

export interface InterceptorDecision {
  allowed: boolean;
  held?: boolean;  // True if execution should be held for approval
  holdReason?: HoldReason;
  reason: string;
  frame: string;
  proposedAction: string;
  action?: string;  // Alias for proposedAction (backward compatibility)
  coverageConfidence: number;
  confidence?: number;  // Alias for coverageConfidence (backward compatibility)
  timestamp: number;
  auditId: string;
  preFlightChecks?: {
    circuitBreakerPassed: boolean;
    driftPredictionPassed: boolean;
    baselineCheckPassed: boolean;
    predictedDriftScore?: number;
  };
  // Extended validation info
  validationReport?: ValidationReport;
  uncoveredAspects?: string[];
}

export interface CoverageResult {
  confidence: number;
  covered: boolean;
  uncoveredAspects: string[];
  details: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR CONTROL TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SymbolOverride {
  base?: string;
  extensions?: Record<string, unknown>;
  // Legacy/alternate property names
  meaning?: string;
  blocked?: boolean;
  replacement?: string;
}

export interface PolicyOverlay {
  overlayId: string;
  id?: string;  // Alias for overlayId (backward compatibility)
  name: string;
  description: string;
  symbolOverrides: {
    [symbol: string]: SymbolOverride;
  };
  toolBindings: {
    allowed?: string[];
    blocked?: string[];
    riskOverrides?: Record<string, unknown>;
    // Support symbol-keyed overrides (legacy format)
    [symbol: string]: string[] | Record<string, unknown> | undefined;
  };
  // Thresholds can be provided in different formats
  confidenceThresholds?: ConfidenceThresholds;
  thresholdOverrides?: ConfidenceThresholds;
  priority?: number;
  extensions?: Record<string, unknown>;
}

export interface ConfidenceThresholds {
  preExecute: number;
  postAudit: number;
  coverageMinimum: number;
  driftThreshold: number;
}

export interface ExecutionControlConfig {
  // Pre-execution blocking
  enableCircuitBreakerCheck: boolean;
  enablePreFlightDriftPrediction: boolean;
  enableBaselineComparison: boolean;

  // Hold behavior
  holdOnDriftPrediction: boolean;  // Hold instead of block for human review
  holdOnLowConfidence: boolean;
  holdOnForbiddenWithOverride: boolean;  // Allow human to override ⛔
  holdTimeoutMs: number;  // Auto-reject after timeout

  // Thresholds
  driftPredictionThreshold: number;  // Block/hold if predicted drift > this
  baselineDeviationThreshold: number;

  // MCP validation
  enableMcpValidation: boolean;
  mcpValidationTools: string[];  // Tools that require MCP validation

  // Immediate action on post-audit
  haltOnCriticalDrift: boolean;
  haltOnHighDrift: boolean;
}

export interface OperatorConfig {
  activeOverlay: string;
  overlays: Map<string, PolicyOverlay>;
  confidenceThresholds: ConfidenceThresholds;
  executionControl: ExecutionControlConfig;
  circuitBreakerEnabled: boolean;
  tripwireEnabled: boolean;
  auditLogEnabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIFT DETECTION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BaselineRecord {
  frame: string;
  expectedInterpretation: string;
  expectedBehaviorHash: string;
  embedding: number[];
  recordedAt: number;
  agentId: string;
}

export interface DriftMetrics {
  agentId: string;
  currentDriftScore: number;
  trend: 'stable' | 'increasing' | 'decreasing';
  lastTestTimestamp: number;
  testsPassed: number;
  testsFailed: number;
  tripwiresTriggered: number;
  embeddingDistances: number[];
  alerts: DriftAlert[];
}

export interface DriftAlert {
  alertId: string;
  agentId: string;
  type: 'semantic_erosion' | 'emergent_protocol' | 'goal_displacement' | 'pattern_lockin' | 'coordinated_drift' | string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  message: string;
  timestamp?: number;  // Alias for detectedAt
  detectedAt: number;
  evidence: Record<string, unknown>;
  resolved?: boolean;
}

export interface TripwireResult {
  tripwireId: string;
  type: 'valid' | 'invalid';
  frame: string;
  expectedOutcome: 'accept' | 'reject';
  actualOutcome: 'accept' | 'reject';
  passed: boolean;
  agentId: string;
  timestamp: number;
}

export type CircuitBreakerStateValue = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  agentId: string;
  state: CircuitBreakerStateValue | string;
  reason?: string;
  openedAt?: number;
  lastFailure?: string;
  failureCount: number;
  successCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT AND DELEGATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentState {
  agentId: string;
  parentId?: string;
  entityType: string;
  activeFrame?: string;
  inheritedConstraints: string[];
  delegationDepth: number;
  createdAt: number;
  lastActivity: number;
  circuitBreaker: CircuitBreakerState;
  driftMetrics: DriftMetrics;
}

export interface DelegationRequest {
  parentAgentId: string;
  childEntityType: string;
  frame: string;
  task: string;
  inheritConstraints: boolean;
}

export interface DelegationResult {
  success: boolean;
  childAgentId?: string;
  inheritedFrame?: string;
  validationReport?: ValidationReport;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE MANAGEMENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface StateWriteRequest {
  agentId: string;
  frame: string;
  key: string;
  value: unknown;
  scope: 'agent' | 'session' | 'global';
}

export interface StateWriteResult {
  success: boolean;
  allowed: boolean;
  reason: string;
  auditId: string;
}

export interface StateReadRequest {
  agentId: string;
  frame: string;
  key: string;
  scope: 'agent' | 'session' | 'global';
}

// ─────────────────────────────────────────────────────────────────────────────
// HOLD & APPROVAL TYPES (Human-in-the-Loop)
// ─────────────────────────────────────────────────────────────────────────────

export type HoldReason =
  // System hold reasons
  | 'circuit_breaker_open'
  | 'drift_threshold_exceeded'
  | 'pre_flight_drift_prediction'
  | 'human_approval_required'
  | 'mcp_validation_pending'
  | 'forbidden_constraint'
  | 'confidence_below_threshold'
  // Agent orchestration hold reasons (MADIF)
  | 'agent_spawn_approval'            // Agent proposal requires human approval
  | 'agent_resource_exceeded'         // Agent exceeded resource limits
  // Legal domain hold reasons (◇ domain frames)
  | 'legal_citation_unverified'       // Citation not found in legal databases
  | 'legal_deadline_risk'             // Action near/past filing deadline
  | 'legal_judge_preference_unknown'  // No pattern data for assigned judge
  | 'legal_jurisdiction_mismatch'     // Case law from wrong jurisdiction
  | 'legal_privilege_risk'            // May expose privileged information
  | 'legal_fabrication_flag';         // Content matches hallucination patterns

export type HoldState = 'pending' | 'approved' | 'rejected' | 'expired';

export interface HoldRequest {
  holdId: string;
  agentId: string;
  frame: string;
  tool: string;
  arguments: Record<string, unknown>;
  reason: HoldReason;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: number;
  expiresAt: number;
  state: HoldState;
  driftScore?: number;
  predictedDrift?: number;
  evidence: Record<string, unknown>;
}

export type HoldDecider = 'human' | 'system' | 'timeout';

export interface HoldDecision {
  holdId: string;
  state: HoldState;
  decidedBy: HoldDecider;
  decidedAt: number;
  reason: string;
  modifiedFrame?: string;  // Allow human to modify frame before approval
  modifiedArgs?: Record<string, unknown>;
}

export interface PreFlightCheck {
  passed: boolean;
  blocked: boolean;
  held: boolean;
  holdRequest?: HoldRequest;
  blockReason?: string;
  checks: {
    circuitBreaker: { passed: boolean; reason?: string };
    driftPrediction: { passed: boolean; predictedScore?: number; threshold?: number };
    baseline: { passed: boolean; deviation?: number };
    confidence: { passed: boolean; score?: number; threshold?: number };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecuteRequest {
  agentId: string;
  frame: string;
  tool: string;
  action?: string;  // Alias for tool (backward compatibility)
  arguments: Record<string, unknown>;
  bypassHold?: boolean;  // For approved hold requests
  holdDecision?: HoldDecision;  // If resuming from hold
}

export interface ExecuteResult {
  success: boolean;
  allowed: boolean;
  held?: boolean;  // True if execution is held pending approval
  holdRequest?: HoldRequest;  // Details if held
  result?: unknown;
  error?: string;
  interceptorDecision: InterceptorDecision;
  decision?: InterceptorDecision;  // Alias for interceptorDecision (backward compatibility)
  postAudit?: PostAuditResult;
  preFlightCheck?: PreFlightCheck;
}

export interface PostAuditResult {
  auditId: string;
  actionMatchScore: number;
  driftDetected: boolean;
  alerts: DriftAlert[];
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  auditId: string;
  timestamp: number;
  agentId: string;
  eventType: 'validate' | 'execute' | 'delegate' | 'state_write' | 'state_read' | 'tripwire' | 'circuit_break' | 'drift_alert';
  frame: string;
  decision: 'allowed' | 'blocked' | 'warning';
  details: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL HOLD TYPES (Domain-Specific for ◇ Legal Frames)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deadline types with their associated risk levels.
 * Critical types (statute_of_limitations, appellate_filing) cannot be extended.
 */
export type LegalDeadlineType =
  | 'statute_of_limitations'  // CRITICAL - cannot be extended, jurisdictional
  | 'appellate_filing'        // CRITICAL - usually jurisdictional
  | 'discovery_response'      // HIGH - sanctions risk
  | 'motion_response'         // HIGH
  | 'disclosure_deadline'     // HIGH
  | 'scheduling_order'        // MEDIUM
  | 'administrative'          // LOW
  | 'contractual';            // Variable

/**
 * Types of jurisdiction mismatches that can occur in legal citations.
 */
export type JurisdictionMismatchType =
  | 'wrong_circuit'           // Citing 5th Cir authority in 9th Cir case
  | 'wrong_state'             // Citing CA law in NY case
  | 'federal_state_mismatch'  // Citing state law for federal question
  | 'overruled_in_jurisdiction' // Case is bad law in this jurisdiction
  | 'circuit_split'           // Known split, cited authority is minority
  | 'superseded_by_statute';  // Statute changed the rule in jurisdiction

/**
 * Types of content fabrication that LLMs commonly produce in legal contexts.
 */
export type LegalFabricationType =
  | 'fabricated_citation'     // Case/statute doesn't exist
  | 'fabricated_holding'      // Case exists but holding is wrong
  | 'fabricated_quote'        // Quote not in source
  | 'fabricated_statute'      // Statute doesn't exist
  | 'fabricated_regulation'   // Regulation doesn't exist
  | 'fabricated_fact'         // Factual claim without basis
  | 'conflated_cases'         // Mixed facts from multiple cases
  | 'temporal_impossibility'; // Timeline doesn't work

/**
 * Types of legal privilege that may be at risk.
 */
export type LegalPrivilegeType =
  | 'attorney_client'
  | 'work_product_fact'       // Factual work product
  | 'work_product_opinion'    // Opinion/mental impressions (stronger protection)
  | 'joint_defense'
  | 'common_interest'
  | 'deliberative_process'    // Government privilege
  | 'executive';              // Executive privilege

/**
 * Evidence structure for citation_unverified holds.
 */
export interface CitationUnverifiedEvidence {
  citationText: string;
  verificationAttempted: boolean;
  databasesChecked: string[];
  failureReason: 'not_found' | 'format_invalid' | 'reporter_unknown' | 'year_mismatch' | 'parallel_conflict' | 'database_timeout';
  documentContext: string;
  proposedUsage: 'primary_authority' | 'secondary' | 'background';
  partialMatchScore?: number;
  suggestedCorrection?: string;
  verificationTimestamp: number;
}

/**
 * Evidence structure for deadline_risk holds.
 */
export interface DeadlineRiskEvidence {
  deadlineId: string;
  deadlineType: LegalDeadlineType;
  deadlineTimestamp: number;
  deadlineSource: 'court_order' | 'rule' | 'statute' | 'contract' | 'calculated';
  hoursRemaining: number;
  businessHoursRemaining: number;
  matterId: string;
  matterName: string;
  jurisdiction: string;
  filingMethod: 'electronic' | 'paper' | 'hand_delivery';
  extensionAvailable: boolean;
  priorExtensionsGranted: number;
  proposedAction: string;
  actionImpactOnDeadline: 'advances' | 'delays' | 'neutral' | 'completes';
  deadlineMissed?: boolean;
  missedAt?: number;
}

/**
 * Evidence structure for judge_preference_unknown holds.
 */
export interface JudgePreferenceEvidence {
  judgeId: string;
  judgeName: string;
  court: string;
  courtType: 'federal_district' | 'federal_appellate' | 'state_trial' | 'state_appellate' | 'administrative';
  preferenceDataExists: boolean;
  lastUpdated?: number;
  dataConfidence?: number;
  dataSources?: string[];
  knownPreferences?: {
    pageLimit?: string;
    citationFormat?: string;
    oralArgumentStyle?: string;
    rulingPatterns?: string;
  };
  outputBeingGenerated: string;
  outputType: 'brief' | 'motion' | 'letter' | 'oral_argument_prep' | 'other';
  nextHearing?: {
    date: number;
    type: string;
    hoursAway: number;
  };
}

/**
 * Evidence structure for jurisdiction_mismatch holds.
 */
export interface JurisdictionMismatchEvidence {
  citation: string;
  citedCaseJurisdiction: string;
  citedCaseCourt: string;
  citedCaseYear: number;
  matterJurisdiction: string;
  matterCourt: string;
  matterCaseNumber?: string;
  mismatchType: JurisdictionMismatchType;
  mismatchExplanation: string;
  isBindingIn: string[];
  isPersuasiveIn: string[];
  circuitSplitDetails?: {
    issue: string;
    majorityCircuits: string[];
    minorityCircuits: string[];
    citedPositionIs: 'majority' | 'minority';
    matterCircuitFollows: 'majority' | 'minority' | 'undecided';
  };
  supersedingAuthority?: {
    citation: string;
    effectiveDate: string;
    howSuperseded: string;
  };
  usageContext: string;
  proposedPresentation: 'binding' | 'persuasive' | 'contrast';
}

/**
 * Evidence structure for privilege_risk holds.
 * NOTE: These holds NEVER auto-expire due to severity of privilege waiver.
 */
export interface PrivilegeRiskEvidence {
  detectionMethod: 'keyword_pattern' | 'document_reference' | 'communication_chain' | 'work_product_indicator' | 'ml_classifier' | 'explicit_marking';
  detectionConfidence: number;
  triggerPatterns: Array<{
    pattern: string;
    location: string;
    context: string;
  }>;
  privilegeType: LegalPrivilegeType;
  privilegeHolder: string;
  privilegeScope: string;
  sourceDocuments?: Array<{
    documentId: string;
    documentName: string;
    privilegeDesignation: string;
    redactionStatus: 'none' | 'partial' | 'full';
  }>;
  outputType: string;
  outputDestination: 'internal' | 'client' | 'opposing_counsel' | 'court' | 'public' | 'unknown';
  recipientPrivilegeStatus: 'privileged' | 'non_privileged' | 'unknown';
  waiverRisk: 'low' | 'medium' | 'high' | 'certain';
  waiverType?: 'subject_matter' | 'document_only' | 'complete';
  waiverMitigatable: boolean;
  contentExcerpt: string;
}

/**
 * Evidence structure for fabrication_flag holds.
 */
export interface FabricationFlagEvidence {
  fabricationType: LegalFabricationType;
  detectionConfidence: number;
  detectionMethods: Array<'citation_verification' | 'semantic_entropy' | 'pattern_matching' | 'self_consistency_check' | 'knowledge_cutoff' | 'source_verification' | 'cross_reference'>;
  fabricatedContent: string;
  contentLocation: string;
  verificationAttempts: Array<{
    method: string;
    source: string;
    result: 'not_found' | 'different' | 'partial_match' | 'verified';
    details: string;
  }>;
  citationDetails?: {
    citedCase: string;
    citedReporter: string;
    reporterExists: boolean;
    similarCases?: Array<{
      citation: string;
      similarity: number;
      keyDifferences: string;
    }>;
  };
  holdingDetails?: {
    actualHolding?: string;
    fabricatedHolding: string;
    discrepancyType: 'opposite' | 'overstated' | 'understated' | 'unrelated';
  };
  semanticEntropyScore?: number;
  surroundingContext: string;
  documentType: string;
  legalConsequence: string;
}

/**
 * Configuration for legal domain holds.
 */
export interface LegalHoldConfig {
  // Master enable
  enableLegalHolds: boolean;

  // Citation verification
  citationVerification: {
    enabled: boolean;
    databases: string[];
    verificationTimeoutMs: number;
    cacheResults: boolean;
  };

  // Deadline monitoring
  deadlineMonitoring: {
    enabled: boolean;
    warningThresholdHours: number;   // Default: 168 (7 days)
    criticalThresholdHours: number;  // Default: 24
    calendarIntegration?: string;
  };

  // Judge preference
  judgePreference: {
    enabled: boolean;
    dataStalenessThresholdDays: number;
    minimumConfidenceThreshold: number;
  };

  // Jurisdiction checking
  jurisdictionCheck: {
    enabled: boolean;
    strictMode: boolean;
  };

  // Privilege detection
  privilegeDetection: {
    enabled: boolean;
    sensitivityLevel: 'low' | 'medium' | 'high';
    alwaysHoldForExternal: boolean;
  };

  // Fabrication detection
  fabricationDetection: {
    enabled: boolean;
    semanticEntropyThreshold: number;
    requireSourceVerification: boolean;
  };

  // Notification settings for escalation
  notifications: {
    deadlineAlertEmails: string[];
    privilegeAlertEmails: string[];
    escalationEmails: string[];
  };
}

/**
 * Pre-flight check results for legal domain operations.
 */
export interface LegalPreFlightResults {
  isLegalDomain: boolean;
  citationVerification?: {
    totalCitations: number;
    verifiedCitations: string[];
    unverifiedCitations: string[];
    verificationScore: number;
    evidence?: CitationUnverifiedEvidence;
  };
  deadlineCheck?: {
    nearbyDeadlines: DeadlineRiskEvidence[];
    criticalDeadline?: DeadlineRiskEvidence;
  };
  judgePreference?: {
    judgeId: string;
    preferenceDataExists: boolean;
    dataConfidence: number;
    evidence?: JudgePreferenceEvidence;
  };
  jurisdictionCheck?: {
    mismatches: JurisdictionMismatchEvidence[];
  };
  privilegeCheck?: {
    privilegeIndicators: PrivilegeRiskEvidence[];
    riskScore: number;
  };
  fabricationCheck?: {
    flaggedContent: FabricationFlagEvidence[];
    overallScore: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUTH-VALIDATOR CHECKLIST TYPES (Human Review Integration)
// ─────────────────────────────────────────────────────────────────────────────
// These types integrate the truth-validator skill philosophy into the hold flow.
// Checklists are generated for legal domain (◇) operations requiring human review.
//
// PHILOSOPHY: "I flag, you verify"
// - Checklists flag items for HUMAN review
// - They do NOT validate truth or make determinations
// - Human judgment is always required
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flag types from truth-validator skill.
 * These map to the 6 categories defined in the skill.
 */
export type TruthValidatorFlagType =
  | 'NEEDS_CITATION'      // Factual claim without source reference
  | 'PARAPHRASE_CHECK'    // Wording differs from source
  | 'INFERENCE_FLAG'      // Conclusion beyond explicit statement
  | 'CALCULATION_VERIFY'  // Arithmetic, percentage, or derived value
  | 'ASSUMPTION_FLAG'     // Unstated assumption affecting interpretation
  | 'SCOPE_QUESTION';     // Claim about completeness, frequency, or pattern

/**
 * State of a checklist item during human review.
 */
export type ChecklistItemState = 'pending' | 'verified' | 'disputed' | 'waived';

/**
 * A single checklist item for human review.
 * Each item represents something flagged for verification.
 */
export interface TruthValidatorChecklistItem {
  itemId: string;
  flagType: TruthValidatorFlagType;
  description: string;
  location: string;           // Where in the content this was flagged
  issue: string;              // Why this was flagged
  suggestedAction: string;    // What the human should verify
  state: ChecklistItemState;
  verifiedBy?: string;        // Human identifier who reviewed
  verifiedAt?: number;        // Timestamp of review
  notes?: string;             // Human's verification notes
}

/**
 * Completion state of the overall checklist.
 */
export type ChecklistCompletionState = 'incomplete' | 'complete' | 'partially_complete';

/**
 * A complete checklist attached to a hold.
 * Generated automatically for legal domain (◈) operations.
 */
export interface TruthValidatorChecklist {
  checklistId: string;
  holdId: string;
  generatedAt: number;
  items: TruthValidatorChecklistItem[];
  completionState: ChecklistCompletionState;
  disclaimer: string;  // Always present: skill limitations acknowledgment
}

/**
 * Summary of checklist completion status.
 */
export interface ChecklistCompletionSummary {
  totalItems: number;
  verifiedItems: number;
  disputedItems: number;
  waivedItems: number;
  pendingItems: number;
}

/**
 * Extended HoldRequest with optional checklist.
 * When domain is legal (◈), checklist is automatically generated.
 */
export interface HoldRequestWithChecklist extends HoldRequest {
  checklist?: TruthValidatorChecklist;
}

/**
 * Extended HoldDecision with checklist completion status.
 */
export interface HoldDecisionWithChecklist extends HoldDecision {
  checklistCompletion?: ChecklistCompletionSummary;
}
