/**
 * PromptSpeak MCP Tools
 *
 * Core tools for frame validation, execution, delegation, and state management.
 */

// Validation tools
export {
  ps_validate,
  ps_validate_batch,
  type ValidateRequest,
  type ValidateResult,
  type BatchValidateRequest,
  type BatchValidateResult
} from './ps_validate.js';

// Execution tools
export {
  ps_execute,
  ps_execute_batch,
  ps_execute_dry_run,
  type PSExecuteRequest,
  type PSExecuteResult,
  type BatchExecuteRequest,
  type BatchExecuteResult,
  type DryRunRequest,
  type DryRunResult
} from './ps_execute.js';

// Delegation tools
export {
  ps_delegate,
  ps_delegate_revoke,
  ps_delegate_list,
  type DelegateRequest,
  type DelegateResult,
  type RevokeRequest,
  type RevokeResult,
  type ListDelegationsRequest,
  type ListDelegationsResult
} from './ps_delegate.js';

// State management tools
export {
  ps_state_get,
  ps_state_system,
  ps_state_reset,
  ps_state_recalibrate,
  ps_state_halt,
  ps_state_resume,
  ps_state_drift_history,
  type AgentStateResult,
  type SystemStateResult,
  type ResetRequest,
  type ResetResult,
  type RecalibrateRequest,
  type RecalibrateResult,
  type HaltRequest,
  type ResumeRequest,
  type DriftHistoryRequest,
  type DriftHistoryResult
} from './ps_state.js';

// Re-export operator tools
export {
  ps_config_set,
  ps_config_activate,
  ps_config_get,
  ps_config_export,
  ps_config_import,
  ps_confidence_set,
  ps_confidence_get,
  ps_confidence_bulk_set,
  ps_feature_set,
  ps_feature_get,
  ps_audit_get
} from '../operator/index.js';

// Hold management tools (human-in-the-loop)
export {
  holdToolDefinitions,
  handleHoldTool,
  handleHoldList,
  handleHoldApprove,
  handleHoldReject,
  handleHoldConfig,
  handleHoldStats
} from './ps_hold.js';

// Security enforcement tools
export {
  securityToolDefinitions,
  handleSecurityTool,
  handleSecurityScan,
  handleSecurityGate,
  handleSecurityConfig,
  resetSecurityPatterns,
  type SecurityScanRequest,
  type SecurityGateResult,
  type GateDecision,
  type SecurityConfigResult,
} from './ps_security.js';

// Tool Registry (centralized tool definitions)
export {
  buildToolRegistry,
  getToolStats,
  VALIDATION_TOOLS,
  EXECUTION_TOOLS,
  DELEGATION_TOOLS,
  STATE_TOOLS,
  CONFIG_TOOLS,
  CONFIDENCE_TOOLS,
  FEATURE_TOOLS,
  AUDIT_TOOLS
} from './registry.js';
