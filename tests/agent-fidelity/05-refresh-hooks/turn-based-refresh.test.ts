/**
 * =============================================================================
 * Turn-Based Refresh Hooks Tests
 * =============================================================================
 *
 * Tests for turn-based symbol refresh mechanisms.
 *
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RefreshHookManager, RefreshConfig } from '../../../src/fidelity/refresh-hooks.js';
import { SymbolManager } from '../../../src/symbols/manager.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Turn-Based Refresh Hooks', () => {
  let symbolManager: SymbolManager;
  let refreshManager: RefreshHookManager;
  let testDir: string;

  beforeEach(() => {
    // Create temporary directory for test database
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptspeak-refresh-test-'));
    const symbolsDir = path.join(testDir, 'symbols');
    fs.mkdirSync(symbolsDir, { recursive: true });

    symbolManager = new SymbolManager(symbolsDir);
  });

  afterEach(() => {
    if (refreshManager) {
      refreshManager.destroy();
    }
    symbolManager.clearCache();

    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Turn Interval Refresh', () => {
    it('should refresh every N turns', () => {
      const config: RefreshConfig = {
        mode: 'turn-based',
        turnInterval: 3,
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      const refreshEvents: number[] = [];
      refreshManager.on('refresh', (event) => {
        refreshEvents.push(event.timestamp);
      });

      // Execute 10 turns
      for (let turn = 1; turn <= 10; turn++) {
        refreshManager.onTurnComplete();
      }

      // Should have refreshed at turns 3, 6, 9
      expect(refreshEvents).toHaveLength(3);
    });

    it('should not refresh if mode is none', () => {
      const config: RefreshConfig = { mode: 'none' };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      let refreshCount = 0;
      refreshManager.on('refresh', () => refreshCount++);

      // Execute 100 turns
      for (let turn = 1; turn <= 100; turn++) {
        refreshManager.onTurnComplete();
      }

      expect(refreshCount).toBe(0);
    });

    it('should track turn count accurately', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 5 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      for (let i = 0; i < 7; i++) {
        refreshManager.onTurnComplete();
      }

      expect(refreshManager.getTurnCount()).toBe(7);
    });

    it('should return null when not time to refresh', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 5 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      // Turn 1-4 should return null
      for (let i = 1; i <= 4; i++) {
        const event = refreshManager.onTurnComplete();
        expect(event).toBeNull();
      }

      // Turn 5 should return event
      const event = refreshManager.onTurnComplete();
      expect(event).not.toBeNull();
      expect(event!.trigger).toBe('turn');
    });

    it('should include correct agent ID in events', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 1 };

      refreshManager = new RefreshHookManager(symbolManager, 'my-custom-agent', config);

      const event = refreshManager.onTurnComplete();
      expect(event).not.toBeNull();
      expect(event!.agentId).toBe('my-custom-agent');
    });
  });

  describe('Refresh Logging', () => {
    it('should log all refresh events', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 2 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      for (let i = 0; i < 6; i++) {
        refreshManager.onTurnComplete();
      }

      const log = refreshManager.getRefreshLog();
      expect(log).toHaveLength(3); // Turns 2, 4, 6

      for (const event of log) {
        expect(event.trigger).toBe('turn');
        expect(event.agentId).toBe('test-agent');
        expect(event.timestamp).toBeGreaterThan(0);
      }
    });

    it('should preserve log order chronologically', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 1 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      for (let i = 0; i < 5; i++) {
        refreshManager.onTurnComplete();
      }

      const log = refreshManager.getRefreshLog();
      expect(log).toHaveLength(5);

      // Verify timestamps are in order
      for (let i = 1; i < log.length; i++) {
        expect(log[i].timestamp).toBeGreaterThanOrEqual(log[i - 1].timestamp);
      }
    });

    it('should return copy of log to prevent external modification', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 1 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);
      refreshManager.onTurnComplete();

      const log1 = refreshManager.getRefreshLog();
      const log2 = refreshManager.getRefreshLog();

      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });
  });

  describe('Configuration Access', () => {
    it('should return current configuration', () => {
      const config: RefreshConfig = {
        mode: 'turn-based',
        turnInterval: 10,
        symbolIds: ['Ξ.TEST.A', 'Ξ.TEST.B'],
      };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      const retrievedConfig = refreshManager.getConfig();
      expect(retrievedConfig.mode).toBe('turn-based');
      expect(retrievedConfig.turnInterval).toBe(10);
      expect(retrievedConfig.symbolIds).toEqual(['Ξ.TEST.A', 'Ξ.TEST.B']);
    });

    it('should return copy of config to prevent modification', () => {
      const config: RefreshConfig = { mode: 'turn-based', turnInterval: 5 };

      refreshManager = new RefreshHookManager(symbolManager, 'test-agent', config);

      const config1 = refreshManager.getConfig();
      const config2 = refreshManager.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });
});
