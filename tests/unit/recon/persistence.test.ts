/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RECON PERSISTENCE TESTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Unit tests for the Marine Recon symbol persistence layer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import {
  ReconSymbolStorage,
  createStorage,
  StorageError,
  StorageErrorCode,
  StorageEvent,
  SymbolSummary,
} from '../../../src/recon/persistence';
import { MarineReconSymbol } from '../../../src/recon/types';
import { createReconSymbol } from '../../../src/recon/symbol/schema';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a test symbol with minimal configuration.
 */
function createTestSymbol(suffix: string = ''): MarineReconSymbol {
  return createReconSymbol({
    mission_name: `Test Mission ${suffix}`,
    primary_goal: `Test goal ${suffix}`,
    intelligence_requirements: ['Requirement 1', 'Requirement 2'],
    target: {
      type: 'customer_service_chatbot',
      platform: 'web_chat',
      organization: `Test Org ${suffix}`,
    },
    created_by: 'test:user',
    tags: ['test', suffix].filter(Boolean),
    namespace: 'test',
  });
}

/**
 * Create a unique temp directory for test storage.
 */
async function createTempStorageDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `recon-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up a temp directory.
 */
async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReconSymbolStorage', () => {
  let tempDir: string;
  let storage: ReconSymbolStorage;

  beforeEach(async () => {
    tempDir = await createTempStorageDir();
    storage = new ReconSymbolStorage(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize storage directory', async () => {
      await storage.initialize();
      expect(storage.isInitialized()).toBe(true);
    });

    it('should create directory if missing (when enabled)', async () => {
      const newPath = path.join(tempDir, 'nested', 'storage');
      const newStorage = new ReconSymbolStorage(newPath, { createIfMissing: true });
      await newStorage.initialize();

      const stats = await fs.stat(newPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should throw if directory missing (when disabled)', async () => {
      const newPath = path.join(tempDir, 'nonexistent');
      const newStorage = new ReconSymbolStorage(newPath, { createIfMissing: false });

      await expect(newStorage.initialize()).rejects.toThrow(StorageError);
    });

    it('should create backups directory when backups enabled', async () => {
      const newStorage = new ReconSymbolStorage(tempDir, { maxBackups: 3 });
      await newStorage.initialize();

      const backupsPath = path.join(tempDir, '.backups');
      const stats = await fs.stat(backupsPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not require explicit initialization before operations', async () => {
      const symbol = createTestSymbol();
      // Should auto-initialize
      await storage.save(symbol);
      expect(storage.isInitialized()).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('should save a symbol to the filesystem', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      // Verify file exists
      const files = await fs.readdir(tempDir);
      const symbolFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('.'));
      expect(symbolFiles.length).toBe(1);
    });

    it('should save symbol as valid JSON', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const files = await fs.readdir(tempDir);
      const symbolFile = files.find(f => f.endsWith('.json') && !f.startsWith('.'));
      const content = await fs.readFile(path.join(tempDir, symbolFile!), 'utf-8');

      const parsed = JSON.parse(content);
      expect(parsed.symbol_id).toBe(symbol.symbol_id);
      expect(parsed.symbol_type).toBe('RECON');
    });

    it('should overwrite existing symbol', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      // Modify and save again
      symbol.version = 2;
      await storage.save(symbol);

      const loaded = await storage.load(symbol.symbol_id);
      expect(loaded?.version).toBe(2);
    });

    it('should emit SYMBOL_SAVED event', async () => {
      const symbol = createTestSymbol();
      const listener = vi.fn();
      storage.on(StorageEvent.SYMBOL_SAVED, listener);

      await storage.save(symbol);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: StorageEvent.SYMBOL_SAVED,
          symbolId: symbol.symbol_id,
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LOAD TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('load()', () => {
    it('should load a saved symbol', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const loaded = await storage.load(symbol.symbol_id);

      expect(loaded).not.toBeNull();
      expect(loaded?.symbol_id).toBe(symbol.symbol_id);
      expect(loaded?.mission.objective.primary_goal).toBe(symbol.mission.objective.primary_goal);
    });

    it('should return null for non-existent symbol', async () => {
      const loaded = await storage.load('Ξ.RECON.NONEXISTENT');
      expect(loaded).toBeNull();
    });

    it('should emit SYMBOL_LOADED event', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const listener = vi.fn();
      storage.on(StorageEvent.SYMBOL_LOADED, listener);

      await storage.load(symbol.symbol_id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: StorageEvent.SYMBOL_LOADED,
          symbolId: symbol.symbol_id,
        })
      );
    });

    it('should validate symbol on load when enabled', async () => {
      const validatingStorage = new ReconSymbolStorage(tempDir, { validateOnLoad: true });

      // Write invalid JSON directly
      const invalidPath = path.join(tempDir, 'XI_RECON_INVALID.json');
      await fs.writeFile(invalidPath, JSON.stringify({ invalid: true }), 'utf-8');

      await expect(validatingStorage.load('Ξ.RECON.INVALID')).rejects.toThrow(StorageError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // LIST TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(async () => {
      // Create multiple test symbols
      const symbols = [
        createTestSymbol('A'),
        createTestSymbol('B'),
        createTestSymbol('C'),
      ];
      for (const symbol of symbols) {
        await storage.save(symbol);
      }
    });

    it('should list all saved symbols', async () => {
      const result = await storage.list();

      expect(result.symbols.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should return SymbolSummary objects', async () => {
      const result = await storage.list();
      const summary = result.symbols[0];

      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('status');
      expect(summary).toHaveProperty('created_at');
      expect(summary).toHaveProperty('message_count');
      expect(summary).toHaveProperty('file_path');
    });

    it('should support pagination', async () => {
      const page1 = await storage.list({
        pagination: { limit: 2, offset: 0 },
      });

      expect(page1.symbols.length).toBe(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);

      const page2 = await storage.list({
        pagination: { limit: 2, offset: 2 },
      });

      expect(page2.symbols.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      // All symbols start with 'initializing' status
      const result = await storage.list({
        filter: { status: 'initializing' },
      });

      expect(result.symbols.length).toBe(3);
    });

    it('should filter by namespace', async () => {
      const result = await storage.list({
        filter: { namespace: 'test' },
      });

      expect(result.symbols.length).toBe(3);

      const emptyResult = await storage.list({
        filter: { namespace: 'production' },
      });

      expect(emptyResult.symbols.length).toBe(0);
    });

    it('should filter by tags', async () => {
      const result = await storage.list({
        filter: { tags: ['A'] },
      });

      expect(result.symbols.length).toBe(1);
    });

    it('should sort by created_at', async () => {
      const descResult = await storage.list({
        sort: { field: 'created_at', direction: 'desc' },
      });

      // Verify descending order
      const dates = descResult.symbols.map(s => new Date(s.created_at).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('should delete an existing symbol', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const deleted = await storage.delete(symbol.symbol_id);

      expect(deleted).toBe(true);
      expect(await storage.exists(symbol.symbol_id)).toBe(false);
    });

    it('should return false for non-existent symbol', async () => {
      const deleted = await storage.delete('Ξ.RECON.NONEXISTENT');
      expect(deleted).toBe(false);
    });

    it('should emit SYMBOL_DELETED event', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const listener = vi.fn();
      storage.on(StorageEvent.SYMBOL_DELETED, listener);

      await storage.delete(symbol.symbol_id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: StorageEvent.SYMBOL_DELETED,
          symbolId: symbol.symbol_id,
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // EXISTS TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('exists()', () => {
    it('should return true for existing symbol', async () => {
      const symbol = createTestSymbol();
      await storage.save(symbol);

      const exists = await storage.exists(symbol.symbol_id);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent symbol', async () => {
      const exists = await storage.exists('Ξ.RECON.NONEXISTENT');
      expect(exists).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ATOMIC WRITES TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Atomic Writes', () => {
    it('should use atomic writes when enabled', async () => {
      const atomicStorage = new ReconSymbolStorage(tempDir, { atomicWrites: true });
      const symbol = createTestSymbol();

      await atomicStorage.save(symbol);

      // Verify no temp files remain
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter(f => f.includes('.tmp.'));
      expect(tempFiles.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // BACKUP TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Backups', () => {
    it('should create backup on update', async () => {
      const backupStorage = new ReconSymbolStorage(tempDir, { maxBackups: 3 });
      const symbol = createTestSymbol();

      await backupStorage.save(symbol);
      await backupStorage.save({ ...symbol, version: 2 });

      const backupsPath = path.join(tempDir, '.backups');
      const backups = await fs.readdir(backupsPath);
      expect(backups.length).toBeGreaterThan(0);
    });

    it('should limit number of backups', async () => {
      const backupStorage = new ReconSymbolStorage(tempDir, { maxBackups: 2 });
      const symbol = createTestSymbol();

      // Create multiple versions
      for (let i = 0; i < 5; i++) {
        await backupStorage.save({ ...symbol, version: i + 1 });
      }

      const backupsPath = path.join(tempDir, '.backups');
      const backups = await fs.readdir(backupsPath);
      expect(backups.length).toBeLessThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CACHING TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Caching', () => {
    it('should cache loaded symbols when enabled', async () => {
      const cachingStorage = new ReconSymbolStorage(tempDir, { enableCache: true });
      const symbol = createTestSymbol();
      await cachingStorage.save(symbol);

      // First load after save - symbol is already in cache from save()
      // So we expect a cache hit
      const hitListener = vi.fn();
      cachingStorage.on(StorageEvent.CACHE_HIT, hitListener);
      await cachingStorage.load(symbol.symbol_id);
      expect(hitListener).toHaveBeenCalled();
    });

    it('should miss cache for symbols not yet loaded', async () => {
      // Create a symbol without caching, then load from disk with caching
      const noCacheStorage = new ReconSymbolStorage(tempDir, { enableCache: false });
      const symbol = createTestSymbol();
      await noCacheStorage.save(symbol);

      // New storage instance with caching - cache is empty
      const cachingStorage = new ReconSymbolStorage(tempDir, { enableCache: true });
      await cachingStorage.initialize();

      const missListener = vi.fn();
      cachingStorage.on(StorageEvent.CACHE_MISS, missListener);
      await cachingStorage.load(symbol.symbol_id);
      expect(missListener).toHaveBeenCalled();

      // Now it should be cached
      const hitListener = vi.fn();
      cachingStorage.on(StorageEvent.CACHE_HIT, hitListener);
      await cachingStorage.load(symbol.symbol_id);
      expect(hitListener).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // ADVANCED OPERATIONS TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Advanced Operations', () => {
    describe('saveIfNotExists()', () => {
      it('should save new symbol', async () => {
        const symbol = createTestSymbol();
        await storage.saveIfNotExists(symbol);

        const loaded = await storage.load(symbol.symbol_id);
        expect(loaded).not.toBeNull();
      });

      it('should throw if symbol exists', async () => {
        const symbol = createTestSymbol();
        await storage.save(symbol);

        await expect(storage.saveIfNotExists(symbol)).rejects.toThrow(StorageError);
      });
    });

    describe('updateWithVersionCheck()', () => {
      it('should update with matching version', async () => {
        const symbol = createTestSymbol();
        await storage.save(symbol);

        const updated = { ...symbol, version: 2 };
        await storage.updateWithVersionCheck(updated, 1);

        const loaded = await storage.load(symbol.symbol_id);
        expect(loaded?.version).toBe(2);
      });

      it('should throw on version mismatch', async () => {
        const symbol = createTestSymbol();
        await storage.save(symbol);

        const updated = { ...symbol, version: 2 };
        await expect(storage.updateWithVersionCheck(updated, 5)).rejects.toThrow(StorageError);
      });
    });

    describe('count()', () => {
      it('should count all symbols', async () => {
        await storage.save(createTestSymbol('A'));
        await storage.save(createTestSymbol('B'));

        const count = await storage.count();
        expect(count).toBe(2);
      });

      it('should count with filter', async () => {
        const symbolA = createTestSymbol('A');
        const symbolB = createTestSymbol('B');
        symbolB.namespace = 'other';
        await storage.save(symbolA);
        await storage.save(symbolB);

        const count = await storage.count({ namespace: 'test' });
        expect(count).toBe(1);
      });
    });

    describe('clear()', () => {
      it('should remove all symbols', async () => {
        await storage.save(createTestSymbol('A'));
        await storage.save(createTestSymbol('B'));

        const deleted = await storage.clear();
        expect(deleted).toBe(2);

        const result = await storage.list();
        expect(result.total).toBe(0);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('createStorage()', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempStorageDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create and initialize storage', async () => {
    const storage = await createStorage(tempDir);
    expect(storage.isInitialized()).toBe(true);
  });

  it('should pass options to storage', async () => {
    const storage = await createStorage(tempDir, { maxBackups: 5 });
    const options = storage.getOptions();
    expect(options.maxBackups).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('StorageError', () => {
  it('should create NOT_FOUND error', () => {
    const error = StorageError.notFound('Ξ.RECON.TEST');
    expect(error.code).toBe(StorageErrorCode.NOT_FOUND);
    expect(error.symbolId).toBe('Ξ.RECON.TEST');
  });

  it('should create ALREADY_EXISTS error', () => {
    const error = StorageError.alreadyExists('Ξ.RECON.TEST');
    expect(error.code).toBe(StorageErrorCode.ALREADY_EXISTS);
  });

  it('should create VERSION_CONFLICT error', () => {
    const error = StorageError.versionConflict('Ξ.RECON.TEST', 1, 2);
    expect(error.code).toBe(StorageErrorCode.VERSION_CONFLICT);
    expect(error.message).toContain('expected 1');
    expect(error.message).toContain('found 2');
  });

  it('should preserve cause error', () => {
    const cause = new Error('Original error');
    const error = StorageError.fsError('read', '/path', cause);
    expect(error.cause).toBe(cause);
  });
});
