/**
 * =============================================================================
 * PROMPTSPEAK REFRESH HOOKS
 * =============================================================================
 *
 * Manages symbol refresh mechanisms for multi-agent scenarios.
 * Ensures agents have up-to-date symbol data through configurable refresh modes.
 *
 * Refresh Modes:
 * - none: No automatic refresh (manual only)
 * - turn-based: Refresh every N agent turns
 * - time-based: Refresh every N milliseconds
 * - subscription: Refresh on external symbol update notifications
 *
 * =============================================================================
 */

import { EventEmitter } from 'events';
import type { SymbolManager } from '../symbols/manager.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RefreshConfig {
  mode: 'none' | 'turn-based' | 'time-based' | 'subscription';
  turnInterval?: number;      // Refresh every N turns
  timeIntervalMs?: number;    // Refresh every N milliseconds
  symbolIds?: string[];       // Specific symbols to refresh (empty = all)
}

export interface RefreshEvent {
  timestamp: number;
  trigger: 'turn' | 'time' | 'manual' | 'subscription';
  symbolsRefreshed: number;
  staleSymbolsDetected: number;
  agentId: string;
}

// =============================================================================
// REFRESH HOOK MANAGER
// =============================================================================

export class RefreshHookManager extends EventEmitter {
  private symbolManager: SymbolManager;
  private config: RefreshConfig;
  private agentId: string;
  private turnCount: number = 0;
  private lastRefreshTime: number = Date.now();
  private timeInterval: ReturnType<typeof setInterval> | null = null;
  private refreshLog: RefreshEvent[] = [];

  constructor(
    symbolManager: SymbolManager,
    agentId: string,
    config: RefreshConfig = { mode: 'none' }
  ) {
    super();
    this.symbolManager = symbolManager;
    this.agentId = agentId;
    this.config = config;

    if (config.mode === 'time-based' && config.timeIntervalMs) {
      this.startTimeBasedRefresh(config.timeIntervalMs);
    }
  }

  /**
   * Called after each agent turn to check if refresh is needed
   */
  public onTurnComplete(): RefreshEvent | null {
    this.turnCount++;

    if (this.config.mode === 'turn-based' && this.config.turnInterval) {
      if (this.turnCount % this.config.turnInterval === 0) {
        return this.executeRefresh('turn');
      }
    }

    return null;
  }

  /**
   * Manual refresh trigger (stop-hook style)
   */
  public triggerManualRefresh(): RefreshEvent {
    return this.executeRefresh('manual');
  }

  /**
   * Handle push notification of symbol update
   */
  public onSymbolUpdated(symbolId: string): RefreshEvent {
    if (this.config.mode === 'subscription') {
      return this.executeRefresh('subscription');
    }
    // Even if not in subscription mode, log the update
    console.log(`[RefreshHook] Symbol ${symbolId} updated externally`);
    return this.executeRefresh('subscription');
  }

  private startTimeBasedRefresh(intervalMs: number): void {
    this.timeInterval = setInterval(() => {
      this.executeRefresh('time');
    }, intervalMs);
  }

  private executeRefresh(trigger: RefreshEvent['trigger']): RefreshEvent {
    // Count stale symbols before refresh
    const staleCount = this.countStaleSymbols();

    // Execute refresh by clearing and reloading cache
    if (this.config.symbolIds && this.config.symbolIds.length > 0) {
      // For specific symbols, we reload each one individually
      for (const symbolId of this.config.symbolIds) {
        this.refreshSymbol(symbolId);
      }
    } else {
      // Refresh all by clearing cache
      this.refreshAllSymbols();
    }

    const event: RefreshEvent = {
      timestamp: Date.now(),
      trigger,
      symbolsRefreshed: this.config.symbolIds?.length ?? -1, // -1 = all
      staleSymbolsDetected: staleCount,
      agentId: this.agentId,
    };

    this.refreshLog.push(event);
    this.lastRefreshTime = event.timestamp;
    this.emit('refresh', event);

    return event;
  }

  /**
   * Refresh a specific symbol by re-fetching from database
   */
  private refreshSymbol(symbolId: string): void {
    // Clear from cache and re-fetch
    // The SymbolManager.get() will re-populate the cache
    this.symbolManager.clearCache();
    this.symbolManager.get({ symbolId });
  }

  /**
   * Refresh all symbols by clearing the cache
   */
  private refreshAllSymbols(): void {
    // SymbolManager uses reload() to clear cache
    this.symbolManager.reload();
  }

  private countStaleSymbols(): number {
    // This would require tracking symbol versions
    // For now, return 0 - in production, compare cached vs DB versions
    return 0;
  }

  public getRefreshLog(): RefreshEvent[] {
    return [...this.refreshLog];
  }

  public getTurnCount(): number {
    return this.turnCount;
  }

  public getLastRefreshTime(): number {
    return this.lastRefreshTime;
  }

  public getConfig(): RefreshConfig {
    return { ...this.config };
  }

  public getAgentId(): string {
    return this.agentId;
  }

  public destroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
    this.removeAllListeners();
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create refresh hooks for an agent
 */
export function createRefreshHooks(
  symbolManager: SymbolManager,
  agentId: string,
  config: RefreshConfig
): RefreshHookManager {
  return new RefreshHookManager(symbolManager, agentId, config);
}
