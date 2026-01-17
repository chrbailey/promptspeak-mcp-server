/**
 * =============================================================================
 * Time-Based Refresh Hooks Tests
 * =============================================================================
 *
 * Tests for time-based symbol refresh mechanisms using fake timers.
 *
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RefreshHookManager, RefreshConfig } from '../../../src/fidelity/refresh-hooks.js';
import { SymbolManager } from '../../../src/symbols/manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Time-Based Refresh Hooks', () => {
  let symbolManager: SymbolManager;
  let refreshManager: RefreshHookManager;
  let testDir: string;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create temporary directory for test database
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptspeak-time-refresh-test-'));
    const symbolsDir = path.join(testDir, 'symbols');
    fs.mkdirSync(symbolsDir, { recursive: true });

    symbolManager = new SymbolManager(symbolsDir);
  });

  afterEach(() => {
    if (refreshManager) {
      refreshManager.destroy();
    }
    symbolManager.clearCache();
    vi.useRealTimers();

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Time Interval Refresh', () => {
    it('should refresh at specified time intervals', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 1000, // Every 1 second
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      let refreshCount = 0;
      refreshManager.on('refresh', () => refreshCount++);

      // Advance time by 3.5 seconds
      vi.advanceTimersByTime(3500);

      // Should have refreshed 3 times (at 1s, 2s, 3s)
      expect(refreshCount).toBe(3);
    });

    it('should stop refreshing after destroy', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 500,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      let refreshCount = 0;
      refreshManager.on('refresh', () => refreshCount++);

      vi.advanceTimersByTime(1500); // 3 refreshes
      expect(refreshCount).toBe(3);

      refreshManager.destroy();

      vi.advanceTimersByTime(2000); // No more refreshes
      expect(refreshCount).toBe(3); // Still 3
    });

    it('should emit refresh events with time trigger', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 100,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      const events: Array<{ trigger: string; agentId: string }> = [];
      refreshManager.on('refresh', (event) => {
        events.push({ trigger: event.trigger, agentId: event.agentId });
      });

      vi.advanceTimersByTime(250);

      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event.trigger).toBe('time');
        expect(event.agentId).toBe('test-agent');
      }
    });

    it('should update lastRefreshTime on each interval', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 1000,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      const initialTime = refreshManager.getLastRefreshTime();

      vi.advanceTimersByTime(1500);

      const afterRefresh = refreshManager.getLastRefreshTime();
      expect(afterRefresh).toBeGreaterThanOrEqual(initialTime);
    });

    it('should log time-based refresh events', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 200,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      vi.advanceTimersByTime(1000);

      const log = refreshManager.getRefreshLog();
      expect(log).toHaveLength(5); // 200, 400, 600, 800, 1000

      for (const event of log) {
        expect(event.trigger).toBe('time');
      }
    });
  });

  describe('Short Intervals', () => {
    it('should handle very short intervals', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 10,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      let refreshCount = 0;
      refreshManager.on('refresh', () => refreshCount++);

      vi.advanceTimersByTime(100);

      expect(refreshCount).toBe(10);
    });
  });

  describe('Destroy Cleanup', () => {
    it('should remove all event listeners on destroy', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 100,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      let refreshCount = 0;
      refreshManager.on('refresh', () => refreshCount++);

      refreshManager.destroy();

      // Listener count should be 0 after destroy
      expect(refreshManager.listenerCount('refresh')).toBe(0);
    });

    it('should be safe to call destroy multiple times', () => {
      const config: RefreshConfig = {
        mode: 'time-based',
        timeIntervalMs: 100,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      // Should not throw
      refreshManager.destroy();
      refreshManager.destroy();
      refreshManager.destroy();
    });
  });
});
