// ═══════════════════════════════════════════════════════════════════════════
// GOVERNANCE PERSISTENCE TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GovernanceDatabase } from '../../../src/persistence/database.js';
import type { HoldRequest, HoldDecision, CircuitBreakerState } from '../../../src/types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('GovernanceDatabase', () => {
  let db: GovernanceDatabase;
  let dbPath: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-gov-'));
    dbPath = path.join(tmpDir, 'test-governance.db');
    db = new GovernanceDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    // Clean up temp files
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HOLD PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  describe('Hold Operations', () => {
    const makeHold = (overrides?: Partial<HoldRequest>): HoldRequest => ({
      holdId: 'hold_test_001',
      agentId: 'agent_alpha',
      frame: '⊕◊▶',
      tool: 'write_file',
      arguments: { path: '/tmp/test.txt' },
      reason: 'human_approval_required',
      severity: 'high',
      state: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000,
      evidence: { driftScore: 0.3 },
      ...overrides,
    });

    it('should save and retrieve a hold', () => {
      const hold = makeHold();
      db.saveHold(hold);

      const retrieved = db.getHold('hold_test_001');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.holdId).toBe('hold_test_001');
      expect(retrieved!.agentId).toBe('agent_alpha');
      expect(retrieved!.frame).toBe('⊕◊▶');
      expect(retrieved!.tool).toBe('write_file');
      expect(retrieved!.reason).toBe('human_approval_required');
      expect(retrieved!.severity).toBe('high');
      expect(retrieved!.state).toBe('pending');
      expect(retrieved!.arguments).toEqual({ path: '/tmp/test.txt' });
      expect(retrieved!.evidence).toEqual({ driftScore: 0.3 });
    });

    it('should handle Infinity expiresAt (privilege risk)', () => {
      const hold = makeHold({
        holdId: 'hold_privilege_001',
        reason: 'legal_privilege_risk',
        expiresAt: Infinity,
      });
      db.saveHold(hold);

      const retrieved = db.getHold('hold_privilege_001');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.expiresAt).toBe(Infinity);
    });

    it('should list pending holds', () => {
      db.saveHold(makeHold({ holdId: 'hold_1', state: 'pending' }));
      db.saveHold(makeHold({ holdId: 'hold_2', state: 'pending' }));
      db.saveHold(makeHold({ holdId: 'hold_3', state: 'approved' }));

      const pending = db.getPendingHolds();
      expect(pending).toHaveLength(2);
      expect(pending.map(h => h.holdId)).toContain('hold_1');
      expect(pending.map(h => h.holdId)).toContain('hold_2');
    });

    it('should get holds by agent', () => {
      db.saveHold(makeHold({ holdId: 'hold_a1', agentId: 'agent_a' }));
      db.saveHold(makeHold({ holdId: 'hold_a2', agentId: 'agent_a' }));
      db.saveHold(makeHold({ holdId: 'hold_b1', agentId: 'agent_b' }));

      const agentAHolds = db.getHoldsByAgent('agent_a');
      expect(agentAHolds).toHaveLength(2);

      const agentBHolds = db.getHoldsByAgent('agent_b');
      expect(agentBHolds).toHaveLength(1);
    });

    it('should update hold state', () => {
      db.saveHold(makeHold());
      db.updateHoldState('hold_test_001', 'approved');

      const retrieved = db.getHold('hold_test_001');
      expect(retrieved!.state).toBe('approved');
    });

    it('should delete a hold', () => {
      db.saveHold(makeHold());
      db.deleteHold('hold_test_001');

      const retrieved = db.getHold('hold_test_001');
      expect(retrieved).toBeNull();
    });

    it('should handle optional drift fields', () => {
      const hold = makeHold({
        driftScore: 0.42,
        predictedDrift: 0.35,
      });
      db.saveHold(hold);

      const retrieved = db.getHold('hold_test_001');
      expect(retrieved!.driftScore).toBe(0.42);
      expect(retrieved!.predictedDrift).toBe(0.35);
    });

    it('should handle missing drift fields as undefined', () => {
      const hold = makeHold();
      delete hold.driftScore;
      delete hold.predictedDrift;
      db.saveHold(hold);

      const retrieved = db.getHold('hold_test_001');
      expect(retrieved!.driftScore).toBeUndefined();
      expect(retrieved!.predictedDrift).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HOLD DECISION PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  describe('Hold Decision Operations', () => {
    it('should save and retrieve decisions', () => {
      const decision: HoldDecision = {
        holdId: 'hold_test_001',
        state: 'approved',
        decidedBy: 'human',
        decidedAt: Date.now(),
        reason: 'Reviewed and approved',
      };

      db.saveDecision(decision);
      const decisions = db.getDecisions(10);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].holdId).toBe('hold_test_001');
      expect(decisions[0].state).toBe('approved');
      expect(decisions[0].decidedBy).toBe('human');
    });

    it('should save decisions with modified frame and args', () => {
      const decision: HoldDecision = {
        holdId: 'hold_test_002',
        state: 'approved',
        decidedBy: 'human',
        decidedAt: Date.now(),
        reason: 'Modified and approved',
        modifiedFrame: '⊕◊▶(restricted)',
        modifiedArgs: { path: '/safe/location.txt' },
      };

      db.saveDecision(decision);
      const decisions = db.getDecisionsByHold('hold_test_002');
      expect(decisions).toHaveLength(1);
      expect(decisions[0].modifiedFrame).toBe('⊕◊▶(restricted)');
      expect(decisions[0].modifiedArgs).toEqual({ path: '/safe/location.txt' });
    });

    it('should respect limit on getDecisions', () => {
      for (let i = 0; i < 5; i++) {
        db.saveDecision({
          holdId: `hold_${i}`,
          state: 'rejected',
          decidedBy: 'system',
          decidedAt: Date.now() + i,
          reason: `Decision ${i}`,
        });
      }

      const all = db.getDecisions(100);
      expect(all).toHaveLength(5);

      const limited = db.getDecisions(3);
      expect(limited).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CIRCUIT BREAKER PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  describe('Circuit Breaker Operations', () => {
    const makeCB = (overrides?: Partial<CircuitBreakerState>): CircuitBreakerState => ({
      agentId: 'agent_test',
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      ...overrides,
    });

    it('should save and retrieve circuit breaker state', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1', state: 'open', reason: 'drift exceeded' }));

      const retrieved = db.getCircuitBreaker('agent_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.agentId).toBe('agent_1');
      expect(retrieved!.state).toBe('open');
      expect(retrieved!.reason).toBe('drift exceeded');
    });

    it('should upsert on save (update existing)', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1', state: 'closed' }));
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1', state: 'open', reason: 'halted' }));

      const all = db.getAllCircuitBreakers();
      expect(all).toHaveLength(1);
      expect(all[0].state).toBe('open');
    });

    it('should list all circuit breakers', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1', state: 'closed' }));
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_2', state: 'open' }));
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_3', state: 'half-open' }));

      const all = db.getAllCircuitBreakers();
      expect(all).toHaveLength(3);
    });

    it('should delete a circuit breaker', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1' }));
      db.deleteCircuitBreaker('agent_1');

      expect(db.getCircuitBreaker('agent_1')).toBeNull();
    });

    it('should clear all circuit breakers', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_1' }));
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_2' }));
      db.clearAllCircuitBreakers();

      expect(db.getAllCircuitBreakers()).toHaveLength(0);
    });

    it('should handle optional fields correctly', () => {
      db.saveCircuitBreaker(makeCB({
        agentId: 'agent_full',
        state: 'open',
        reason: 'test failure',
        openedAt: 1234567890,
        lastFailure: 'timeout',
        failureCount: 3,
        successCount: 10,
      }));

      const retrieved = db.getCircuitBreaker('agent_full');
      expect(retrieved!.reason).toBe('test failure');
      expect(retrieved!.openedAt).toBe(1234567890);
      expect(retrieved!.lastFailure).toBe('timeout');
      expect(retrieved!.failureCount).toBe(3);
      expect(retrieved!.successCount).toBe(10);
    });

    it('should convert null optional fields to undefined', () => {
      db.saveCircuitBreaker(makeCB({ agentId: 'agent_minimal' }));

      const retrieved = db.getCircuitBreaker('agent_minimal');
      expect(retrieved!.reason).toBeUndefined();
      expect(retrieved!.openedAt).toBeUndefined();
      expect(retrieved!.lastFailure).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CROSS-RESTART PERSISTENCE
  // ─────────────────────────────────────────────────────────────────────────

  describe('Cross-restart persistence', () => {
    it('should survive close and reopen', () => {
      // Save state
      db.saveHold({
        holdId: 'hold_persist_001',
        agentId: 'agent_durable',
        frame: '⊕◊▶',
        tool: 'dangerous_op',
        arguments: {},
        reason: 'human_approval_required',
        severity: 'critical',
        state: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000,
        evidence: { source: 'persistence_test' },
      });

      db.saveCircuitBreaker({
        agentId: 'agent_durable',
        state: 'open',
        reason: 'drift exceeded',
        failureCount: 5,
        successCount: 0,
        openedAt: Date.now(),
      });

      db.saveDecision({
        holdId: 'hold_old_001',
        state: 'rejected',
        decidedBy: 'system',
        decidedAt: Date.now(),
        reason: 'Auto-rejected',
      });

      // Close and reopen
      db.close();
      const db2 = new GovernanceDatabase(dbPath);

      // Verify holds survived
      const hold = db2.getHold('hold_persist_001');
      expect(hold).not.toBeNull();
      expect(hold!.agentId).toBe('agent_durable');
      expect(hold!.state).toBe('pending');

      // Verify circuit breaker survived
      const cb = db2.getCircuitBreaker('agent_durable');
      expect(cb).not.toBeNull();
      expect(cb!.state).toBe('open');
      expect(cb!.reason).toBe('drift exceeded');

      // Verify decisions survived
      const decisions = db2.getDecisions(10);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].holdId).toBe('hold_old_001');

      db2.close();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSACTION SUPPORT
  // ─────────────────────────────────────────────────────────────────────────

  describe('Transactions', () => {
    it('should commit all operations in a transaction', () => {
      db.transaction(() => {
        db.saveHold({
          holdId: 'hold_tx_1',
          agentId: 'agent_tx',
          frame: '⊕◊▶',
          tool: 'op_1',
          arguments: {},
          reason: 'human_approval_required',
          severity: 'medium',
          state: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + 300000,
          evidence: {},
        });
        db.saveHold({
          holdId: 'hold_tx_2',
          agentId: 'agent_tx',
          frame: '⊕◊▶',
          tool: 'op_2',
          arguments: {},
          reason: 'mcp_validation_pending',
          severity: 'low',
          state: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + 300000,
          evidence: {},
        });
      });

      expect(db.getPendingHolds()).toHaveLength(2);
    });
  });
});
