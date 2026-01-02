/**
 * Operator Control Plane
 *
 * Provides hidden knobs for controlling gatekeeper behavior.
 * These controls are meant for operators, not end users.
 */

export { OperatorConfigManager, operatorConfig } from './config.js';

import { operatorConfig } from './config.js';
import type { PolicyOverlay, ConfidenceThresholds } from '../types/index.js';

/**
 * MCP Tool Handlers for Operator Control
 * These are the ps_config_* and ps_confidence_* tools
 */

// ============================================================================
// CONFIGURATION TOOLS
// ============================================================================

export interface ConfigSetRequest {
  overlayId: string;
  overlay: PolicyOverlay;
}

export interface ConfigSetResult {
  success: boolean;
  overlayId: string;
  message: string;
}

export function ps_config_set(request: ConfigSetRequest): ConfigSetResult {
  try {
    operatorConfig.registerOverlay(request.overlay);
    return {
      success: true,
      overlayId: request.overlayId,
      message: `Overlay '${request.overlayId}' registered successfully`
    };
  } catch (error) {
    return {
      success: false,
      overlayId: request.overlayId,
      message: `Failed to register overlay: ${error}`
    };
  }
}

export interface ConfigActivateRequest {
  overlayId: string;
}

export interface ConfigActivateResult {
  success: boolean;
  overlayId: string;
  previousOverlay: string | null;
  message: string;
}

export function ps_config_activate(request: ConfigActivateRequest): ConfigActivateResult {
  const current = operatorConfig.getActiveOverlay();
  const previousId = current?.overlayId ?? null;

  const success = operatorConfig.setActiveOverlay(request.overlayId);

  return {
    success,
    overlayId: request.overlayId,
    previousOverlay: previousId,
    message: success
      ? `Activated overlay '${request.overlayId}'`
      : `Overlay '${request.overlayId}' not found`
  };
}

export interface ConfigGetResult {
  activeOverlay: PolicyOverlay | null;
  registeredOverlays: { id: string; name: string; description: string }[];
  thresholds: ConfidenceThresholds;
  featureFlags: { circuitBreakerEnabled: boolean; tripwireEnabled: boolean; auditLogEnabled: boolean };
}

export function ps_config_get(): ConfigGetResult {
  return {
    activeOverlay: operatorConfig.getActiveOverlay(),
    registeredOverlays: operatorConfig.listOverlays(),
    thresholds: operatorConfig.getThresholds(),
    featureFlags: operatorConfig.getFeatureFlags()
  };
}

export interface ConfigExportResult {
  success: boolean;
  data: string;
  checksum: string;
}

export function ps_config_export(): ConfigExportResult {
  const exportData = operatorConfig.export();
  const dataString = JSON.stringify(exportData);

  // Simple checksum for integrity
  let checksum = 0;
  for (let i = 0; i < dataString.length; i++) {
    checksum = ((checksum << 5) - checksum + dataString.charCodeAt(i)) | 0;
  }

  return {
    success: true,
    data: dataString,
    checksum: checksum.toString(16)
  };
}

export interface ConfigImportRequest {
  data: string;
  expectedChecksum?: string;
}

export interface ConfigImportResult {
  success: boolean;
  message: string;
  overlaysLoaded: number;
}

export function ps_config_import(request: ConfigImportRequest): ConfigImportResult {
  try {
    // Verify checksum if provided
    if (request.expectedChecksum) {
      let checksum = 0;
      for (let i = 0; i < request.data.length; i++) {
        checksum = ((checksum << 5) - checksum + request.data.charCodeAt(i)) | 0;
      }
      if (checksum.toString(16) !== request.expectedChecksum) {
        return {
          success: false,
          message: 'Checksum mismatch - data may be corrupted',
          overlaysLoaded: 0
        };
      }
    }

    const parsedData = JSON.parse(request.data);
    operatorConfig.import(parsedData);
    const overlays = operatorConfig.listOverlays();

    return {
      success: true,
      message: 'Configuration imported successfully',
      overlaysLoaded: overlays.length
    };
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error}`,
      overlaysLoaded: 0
    };
  }
}

// ============================================================================
// CONFIDENCE TOOLS
// ============================================================================

export interface ConfidenceSetRequest {
  threshold: keyof ConfidenceThresholds;
  value: number;
}

export interface ConfidenceSetResult {
  success: boolean;
  threshold: string;
  previousValue: number;
  newValue: number;
  message: string;
}

export function ps_confidence_set(request: ConfidenceSetRequest): ConfidenceSetResult {
  const thresholds = operatorConfig.getThresholds();
  const previousValue = thresholds[request.threshold];

  // Validate range
  if (request.value < 0 || request.value > 1) {
    return {
      success: false,
      threshold: request.threshold,
      previousValue,
      newValue: previousValue,
      message: 'Value must be between 0 and 1'
    };
  }

  operatorConfig.setThreshold(request.threshold, request.value);

  return {
    success: true,
    threshold: request.threshold,
    previousValue,
    newValue: request.value,
    message: `Threshold '${request.threshold}' updated: ${previousValue} → ${request.value}`
  };
}

export interface ConfidenceGetResult {
  thresholds: ConfidenceThresholds;
  descriptions: Record<string, string>;
}

export function ps_confidence_get(): ConfidenceGetResult {
  return {
    thresholds: operatorConfig.getThresholds(),
    descriptions: {
      parseConfidence: 'Minimum confidence for frame parsing (0-1)',
      coverageConfidence: 'Minimum coverage of action by frame (0-1)',
      chainConfidence: 'Minimum trust in delegation chain (0-1)',
      driftThreshold: 'Maximum allowed drift before alert (0-1)',
      tripwireThreshold: 'Maximum tripwire failure rate (0-1)'
    }
  };
}

export interface ConfidenceBulkSetRequest {
  thresholds: Partial<ConfidenceThresholds>;
}

export interface ConfidenceBulkSetResult {
  success: boolean;
  updated: string[];
  failed: string[];
  message: string;
}

export function ps_confidence_bulk_set(request: ConfidenceBulkSetRequest): ConfidenceBulkSetResult {
  const updated: string[] = [];
  const failed: string[] = [];

  for (const [key, value] of Object.entries(request.thresholds)) {
    if (value === undefined) continue;

    if (value < 0 || value > 1) {
      failed.push(`${key}: value out of range`);
      continue;
    }

    operatorConfig.setThreshold(key as keyof ConfidenceThresholds, value);
    updated.push(key);
  }

  return {
    success: failed.length === 0,
    updated,
    failed,
    message: failed.length === 0
      ? `Updated ${updated.length} thresholds`
      : `Updated ${updated.length}, failed ${failed.length}`
  };
}

// ============================================================================
// FEATURE FLAG TOOLS
// ============================================================================

export interface FeatureFlagSetRequest {
  flag: string;
  enabled: boolean;
}

export interface FeatureFlagSetResult {
  success: boolean;
  flag: string;
  previousValue: boolean;
  newValue: boolean;
}

export function ps_feature_set(request: FeatureFlagSetRequest): FeatureFlagSetResult {
  const flags = operatorConfig.getFeatureFlags();
  const flagKey = request.flag as keyof typeof flags;
  const previousValue = flags[flagKey] ?? false;

  // Use specific setters based on flag name
  switch (request.flag) {
    case 'circuitBreakerEnabled':
      operatorConfig.setCircuitBreakerEnabled(request.enabled);
      break;
    case 'tripwireEnabled':
      operatorConfig.setTripwireEnabled(request.enabled);
      break;
    case 'auditLogEnabled':
      operatorConfig.setAuditLogEnabled(request.enabled);
      break;
    default:
      return {
        success: false,
        flag: request.flag,
        previousValue,
        newValue: previousValue
      };
  }

  return {
    success: true,
    flag: request.flag,
    previousValue,
    newValue: request.enabled
  };
}

export function ps_feature_get(): Record<string, boolean> {
  return operatorConfig.getFeatureFlags();
}

// ============================================================================
// AUDIT TOOLS
// ============================================================================

export interface AuditLogEntry {
  timestamp: number;
  action: string;
  actor: string;
  details: Record<string, unknown>;
}

const auditLog: AuditLogEntry[] = [];

export function recordAudit(action: string, actor: string, details: Record<string, unknown>): void {
  auditLog.push({
    timestamp: Date.now(),
    action,
    actor,
    details
  });

  // Keep last 1000 entries
  if (auditLog.length > 1000) {
    auditLog.shift();
  }
}

export interface AuditGetRequest {
  since?: number;
  action?: string;
  limit?: number;
}

export function ps_audit_get(request: AuditGetRequest = {}): AuditLogEntry[] {
  let results = auditLog;

  if (request.since) {
    results = results.filter(e => e.timestamp >= request.since!);
  }

  if (request.action) {
    results = results.filter(e => e.action === request.action);
  }

  const limit = request.limit ?? 100;
  return results.slice(-limit);
}
