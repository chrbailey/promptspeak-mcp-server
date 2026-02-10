// ═══════════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK — LIBRARY ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
// Direct import for programmatic use (e.g., @promptspeak/ai-sdk middleware).
// For MCP server mode, use dist/server.js instead.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Gatekeeper (8-stage validation pipeline) ────────────────────────────────
export { Gatekeeper, gatekeeper } from './gatekeeper/index.js';
export type { AgentEvictionConfig } from './gatekeeper/index.js';

// ─── Drift Detection ─────────────────────────────────────────────────────────
export {
  DriftDetectionEngine,
  driftEngine,
  BaselineStore,
  TripwireInjector,
  CircuitBreaker,
  ContinuousMonitor,
} from './drift/index.js';

// ─── Governance Math ─────────────────────────────────────────────────────────
export {
  // Modulation
  computeModeFactor,
  computeUncertaintyFactor,
  computeCalibrationFactor,
  computeModulation,
  computeEffectiveThresholds,
  makeGateDecision,

  // Autonomy controller
  createInitialTrustState,
  processCalibrationWindow,
  summarizeTrustState,
  isActionPermitted,

  // Immutable safety floor
  checkImmutableConstraints,
  containsSensitiveData,

  // Configuration
  BASE_THRESHOLDS,
  COEFFICIENTS,
  CLAMP_BOUNDS,
  GOVERNANCE_MODES,
  AUTONOMY_RANK,
  ASCENT_REQUIREMENTS,
  IMMUTABLE_CONSTRAINTS,
} from './governance/index.js';

export type {
  GovernanceMode,
  GovernanceModulation,
  EffectiveThresholds,
  GateDecision,
  UncertaintyDecomposition,
  CalibrationMetrics,
  AutonomyLevel,
  TrustState,
  TrustTransition,
  ImmutableCheckResult,
  ImmutableConstraints,
  ThresholdComputeOptions,
} from './governance/index.js';

// ─── Core Types ──────────────────────────────────────────────────────────────
export type {
  ExecuteRequest,
  ExecuteResult,
  PostAuditResult,
  PreFlightCheck,
  HoldRequest,
  HoldDecision,
  DriftAlert,
  InterceptorDecision,
  ValidationReport,
  ParsedFrame,
  ResolvedFrame,
  PolicyOverlay,
  ConfidenceThresholds,
  AuditLogEntry,
  ExecutionControlConfig,
} from './types/index.js';
