// ═══════════════════════════════════════════════════════════════════════════
// PROMPTSPEAK MCP SERVER - OPERATOR CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
// Manages policy overlays and operator configuration.
// Operators can adjust symbol meanings, tool bindings, and confidence
// thresholds without the model or end users knowing.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  PolicyOverlay,
  ConfidenceThresholds,
  OperatorConfig,
  ExecutionControlConfig,
} from '../types/index.js';

// Default confidence thresholds
const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  preExecute: 0.85,
  postAudit: 0.90,
  coverageMinimum: 0.80,
  driftThreshold: 0.15,
};

// Default execution control config
const DEFAULT_EXECUTION_CONTROL: ExecutionControlConfig = {
  enableCircuitBreakerCheck: true,
  enablePreFlightDriftPrediction: true,
  enableBaselineComparison: true,
  holdOnDriftPrediction: true,
  holdOnLowConfidence: true,
  holdOnForbiddenWithOverride: false,
  holdTimeoutMs: 300000,
  driftPredictionThreshold: 0.25,
  baselineDeviationThreshold: 0.30,
  enableMcpValidation: true,
  mcpValidationTools: [],
  haltOnCriticalDrift: true,
  haltOnHighDrift: true,
};

// Default overlay (no modifications)
const DEFAULT_OVERLAY: PolicyOverlay = {
  overlayId: 'default',
  name: 'Default',
  description: 'No modifications - base ontology',
  symbolOverrides: {},
  toolBindings: {},
  confidenceThresholds: DEFAULT_THRESHOLDS,
};

export class OperatorConfigManager {
  private config: OperatorConfig;
  private changeListeners: ((config: OperatorConfig) => void)[] = [];

  constructor() {
    this.config = {
      activeOverlay: 'default',
      overlays: new Map([['default', DEFAULT_OVERLAY]]),
      confidenceThresholds: { ...DEFAULT_THRESHOLDS },
      executionControl: { ...DEFAULT_EXECUTION_CONTROL },
      circuitBreakerEnabled: true,
      tripwireEnabled: true,
      auditLogEnabled: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERLAY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a policy overlay.
   */
  registerOverlay(overlay: PolicyOverlay): void {
    this.config.overlays.set(overlay.overlayId, overlay);
    this.notifyListeners();
  }

  /**
   * Get an overlay by ID.
   */
  getOverlay(overlayId: string): PolicyOverlay | undefined {
    return this.config.overlays.get(overlayId);
  }

  /**
   * List all overlays.
   */
  listOverlays(): { id: string; name: string; description: string }[] {
    return Array.from(this.config.overlays.values()).map(o => ({
      id: o.overlayId,
      name: o.name,
      description: o.description,
    }));
  }

  /**
   * Set the active overlay.
   */
  setActiveOverlay(overlayId: string): boolean {
    if (!this.config.overlays.has(overlayId)) {
      return false;
    }

    this.config.activeOverlay = overlayId;

    // Update confidence thresholds from overlay
    const overlay = this.config.overlays.get(overlayId)!;
    if (overlay.confidenceThresholds) {
      this.config.confidenceThresholds = { ...overlay.confidenceThresholds };
    }

    this.notifyListeners();
    return true;
  }

  /**
   * Get the active overlay.
   */
  getActiveOverlay(): PolicyOverlay {
    return this.config.overlays.get(this.config.activeOverlay) || DEFAULT_OVERLAY;
  }

  /**
   * Remove an overlay (cannot remove default or active overlay).
   */
  removeOverlay(overlayId: string): boolean {
    if (overlayId === 'default' || overlayId === this.config.activeOverlay) {
      return false;
    }

    const removed = this.config.overlays.delete(overlayId);
    if (removed) {
      this.notifyListeners();
    }
    return removed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIDENCE THRESHOLDS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set a specific confidence threshold.
   */
  setThreshold(key: keyof ConfidenceThresholds, value: number): void {
    const clampedValue = Math.max(0, Math.min(1, value));
    this.config.confidenceThresholds[key] = clampedValue;
    this.notifyListeners();
  }

  /**
   * Set all confidence thresholds.
   */
  setThresholds(thresholds: Partial<ConfidenceThresholds>): void {
    for (const [key, value] of Object.entries(thresholds)) {
      if (key in this.config.confidenceThresholds && typeof value === 'number') {
        this.config.confidenceThresholds[key as keyof ConfidenceThresholds] =
          Math.max(0, Math.min(1, value));
      }
    }
    this.notifyListeners();
  }

  /**
   * Get current thresholds.
   */
  getThresholds(): ConfidenceThresholds {
    return { ...this.config.confidenceThresholds };
  }

  /**
   * Reset thresholds to default.
   */
  resetThresholds(): void {
    this.config.confidenceThresholds = { ...DEFAULT_THRESHOLDS };
    this.notifyListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE FLAGS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enable or disable circuit breaker.
   */
  setCircuitBreakerEnabled(enabled: boolean): void {
    this.config.circuitBreakerEnabled = enabled;
    this.notifyListeners();
  }

  /**
   * Enable or disable tripwire injection.
   */
  setTripwireEnabled(enabled: boolean): void {
    this.config.tripwireEnabled = enabled;
    this.notifyListeners();
  }

  /**
   * Enable or disable audit logging.
   */
  setAuditLogEnabled(enabled: boolean): void {
    this.config.auditLogEnabled = enabled;
    this.notifyListeners();
  }

  /**
   * Get all feature flags.
   */
  getFeatureFlags(): {
    circuitBreakerEnabled: boolean;
    tripwireEnabled: boolean;
    auditLogEnabled: boolean;
  } {
    return {
      circuitBreakerEnabled: this.config.circuitBreakerEnabled,
      tripwireEnabled: this.config.tripwireEnabled,
      auditLogEnabled: this.config.auditLogEnabled,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIGURATION SNAPSHOT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a snapshot of the current configuration.
   */
  getSnapshot(): {
    activeOverlay: string;
    overlayCount: number;
    thresholds: ConfidenceThresholds;
    features: ReturnType<OperatorConfigManager['getFeatureFlags']>;
  } {
    return {
      activeOverlay: this.config.activeOverlay,
      overlayCount: this.config.overlays.size,
      thresholds: this.getThresholds(),
      features: this.getFeatureFlags(),
    };
  }

  /**
   * Export configuration for persistence.
   */
  export(): {
    overlays: PolicyOverlay[];
    activeOverlay: string;
    thresholds: ConfidenceThresholds;
    features: ReturnType<OperatorConfigManager['getFeatureFlags']>;
  } {
    return {
      overlays: Array.from(this.config.overlays.values()),
      activeOverlay: this.config.activeOverlay,
      thresholds: this.getThresholds(),
      features: this.getFeatureFlags(),
    };
  }

  /**
   * Import configuration from persistence.
   */
  import(data: ReturnType<OperatorConfigManager['export']>): void {
    // Import overlays
    this.config.overlays.clear();
    this.config.overlays.set('default', DEFAULT_OVERLAY);

    for (const overlay of data.overlays) {
      if (overlay.overlayId !== 'default') {
        this.config.overlays.set(overlay.overlayId, overlay);
      }
    }

    // Set active overlay
    if (this.config.overlays.has(data.activeOverlay)) {
      this.config.activeOverlay = data.activeOverlay;
    }

    // Set thresholds
    this.config.confidenceThresholds = { ...DEFAULT_THRESHOLDS, ...data.thresholds };

    // Set features
    this.config.circuitBreakerEnabled = data.features.circuitBreakerEnabled;
    this.config.tripwireEnabled = data.features.tripwireEnabled;
    this.config.auditLogEnabled = data.features.auditLogEnabled;

    this.notifyListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONVENIENCE ALIASES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set a feature by name. Alias that routes to the appropriate setter.
   * @param featureName - One of 'circuitBreaker', 'tripwire', or 'auditLog'
   * @param enabled - Whether the feature should be enabled
   */
  setFeature(featureName: string, enabled: boolean): void {
    switch (featureName) {
      case 'circuitBreaker':
        this.setCircuitBreakerEnabled(enabled);
        break;
      case 'tripwire':
        this.setTripwireEnabled(enabled);
        break;
      case 'auditLog':
        this.setAuditLogEnabled(enabled);
        break;
      default:
        throw new Error(`Unknown feature: ${featureName}. Valid features: circuitBreaker, tripwire, auditLog`);
    }
  }

  /**
   * Alias for getFeatureFlags().
   */
  getFeatures(): {
    circuitBreakerEnabled: boolean;
    tripwireEnabled: boolean;
    auditLogEnabled: boolean;
  } {
    return this.getFeatureFlags();
  }

  /**
   * Export configuration with checksum for integrity verification.
   * Returns serialized data and a checksum.
   */
  exportWithChecksum(): { data: string; checksum: string } {
    const exportData = this.export();
    const data = JSON.stringify(exportData);
    // Simple checksum: base64 of length + hash-like value from content
    const checksum = this.computeChecksum(data);
    return { data, checksum };
  }

  /**
   * Compute a simple checksum for the given data.
   */
  private computeChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `ps-${Math.abs(hash).toString(16).padStart(8, '0')}-${data.length}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE LISTENERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a listener for configuration changes.
   */
  onChange(listener: (config: OperatorConfig) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all listeners of configuration change.
   */
  private notifyListeners(): void {
    for (const listener of this.changeListeners) {
      listener(this.config);
    }
  }
}

// Singleton instance
export const operatorConfig = new OperatorConfigManager();
