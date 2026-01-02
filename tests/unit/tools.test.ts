/**
 * Unit Tests: Core MCP Tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ps_validate,
  ps_validate_batch,
  ps_delegate,
  ps_delegate_revoke,
  ps_delegate_list,
  ps_state_get,
  ps_state_system
} from '../../src/tools/index.js';

describe('ps_validate', () => {
  it('should validate a valid frame', () => {
    const result = ps_validate({ frame: '⊕◊▶' });

    expect(result.valid).toBe(true);
    expect(result.parseConfidence).toBeGreaterThan(0);
    expect(result.summary.errors).toBe(0);
  });

  it('should detect invalid frame', () => {
    const result = ps_validate({ frame: '⊕⊖◊▶' }); // Conflicting modes

    expect(result.valid).toBe(false);
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.length).toBeGreaterThan(0);
  });

  it('should perform chain validation with parent', () => {
    const result = ps_validate({
      frame: '⊖◊▶β',    // Flexible
      parentFrame: '⊕◊▼α',  // Strict parent
      validationLevel: 'chain'
    });

    expect(result.valid).toBe(false);
    expect(result.report.errors.some(e => e.code === 'MODE_STRENGTH_WEAKENED')).toBe(true);
  });

  it('should use strict mode when specified', () => {
    const normalResult = ps_validate({ frame: '⊕▶', strict: false });
    const strictResult = ps_validate({ frame: '⊕▶', strict: true });

    // Same frame may pass normally but fail strictly due to warnings
    expect(normalResult.summary.warnings).toBeGreaterThan(0);
    expect(strictResult.valid).toBe(false); // Warnings cause failure in strict mode
  });
});

describe('ps_validate_batch', () => {
  it('should validate multiple frames', () => {
    const result = ps_validate_batch({
      frames: [
        { frame: '⊕◊▶' },
        { frame: '⊕◈▲' },
        { frame: '⊘◇○' }
      ]
    });

    expect(result.results).toHaveLength(3);
    expect(result.summary.total).toBe(3);
  });

  it('should stop on first error when specified', () => {
    const result = ps_validate_batch({
      frames: [
        { frame: '⊕⊖◊▶' }, // Invalid
        { frame: '⊕◊▶' },   // Valid - should not be processed
        { frame: '⊕◈▲' }    // Valid - should not be processed
      ],
      stopOnFirstError: true
    });

    expect(result.results.length).toBe(1);
    expect(result.allValid).toBe(false);
  });

  it('should validate delegation chains', () => {
    const result = ps_validate_batch({
      frames: [
        { frame: '⊕◊▼α' },  // Parent
        { frame: '⊕◊▶β', parentFrame: '⊕◊▼α' }  // Child with parent reference
      ],
      validationLevel: 'full'
    });

    expect(result.allValid).toBe(true);
  });
});

describe('ps_delegate', () => {
  it('should create valid delegation', () => {
    const result = ps_delegate({
      parentAgentId: 'agent-alpha',
      childAgentId: 'agent-beta',
      parentFrame: '⊕◊▼α',
      childFrame: '⊕◊▶β'
    });

    expect(result.success).toBe(true);
    expect(result.delegationId).toBeDefined();
    expect(result.validation.valid).toBe(true);
  });

  it('should reject delegation with weakened mode', () => {
    const result = ps_delegate({
      parentAgentId: 'agent-alpha',
      childAgentId: 'agent-beta',
      parentFrame: '⊕◊▼α',  // Strict
      childFrame: '⊖◊▶β'   // Flexible (weaker)
    });

    expect(result.success).toBe(false);
    expect(result.validation.errors.some(e => e.includes('MODE_STRENGTH'))).toBe(true);
  });

  it('should enforce forbidden constraint inheritance', () => {
    const result = ps_delegate({
      parentAgentId: 'agent-alpha',
      childAgentId: 'agent-beta',
      parentFrame: '⊕◊⛔▼α',  // Has forbidden constraint
      childFrame: '⊕◊▶β'      // Missing forbidden constraint
    });

    expect(result.success).toBe(false);
    expect(result.validation.errors.some(e => e.includes('FORBIDDEN'))).toBe(true);
  });

  it('should inherit mode in strict inheritance mode', () => {
    const result = ps_delegate({
      parentAgentId: 'agent-alpha',
      childAgentId: 'agent-beta',
      parentFrame: '⊕◊▼α',
      childFrame: '◊▶β',  // No mode specified
      inheritanceMode: 'strict'
    });

    expect(result.success).toBe(true);
    expect(result.inheritance.modeInherited).toBe(true);
    expect(result.effectiveChildFrame).toContain('⊕');
  });
});

describe('ps_delegate_revoke', () => {
  it('should revoke active delegation', () => {
    // First create a delegation
    const delegation = ps_delegate({
      parentAgentId: 'revoke-test-parent',
      childAgentId: 'revoke-test-child',
      parentFrame: '⊕◊▼α',
      childFrame: '⊕◊▶β'
    });

    expect(delegation.success).toBe(true);

    // Then revoke it
    const revokeResult = ps_delegate_revoke({
      delegationId: delegation.delegationId,
      parentAgentId: 'revoke-test-parent',
      reason: 'Test revocation'
    });

    expect(revokeResult.success).toBe(true);
    expect(revokeResult.childAgentId).toBe('revoke-test-child');
  });

  it('should reject revocation from non-parent', () => {
    const delegation = ps_delegate({
      parentAgentId: 'auth-test-parent',
      childAgentId: 'auth-test-child',
      parentFrame: '⊕◊▼α',
      childFrame: '⊕◊▶β'
    });

    const revokeResult = ps_delegate_revoke({
      delegationId: delegation.delegationId,
      parentAgentId: 'wrong-agent',  // Not the parent
      reason: 'Unauthorized attempt'
    });

    expect(revokeResult.success).toBe(false);
    expect(revokeResult.message).toContain('Only parent');
  });
});

describe('ps_delegate_list', () => {
  it('should list delegations for an agent', () => {
    const parentId = 'list-test-parent';

    // Create some delegations
    ps_delegate({
      parentAgentId: parentId,
      childAgentId: 'list-test-child-1',
      parentFrame: '⊕◊▼α',
      childFrame: '⊕◊▶β'
    });

    ps_delegate({
      parentAgentId: parentId,
      childAgentId: 'list-test-child-2',
      parentFrame: '⊕◈▼α',
      childFrame: '⊕◈▲β'
    });

    const result = ps_delegate_list({
      agentId: parentId,
      role: 'parent',
      status: 'active'
    });

    expect(result.asParent.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ps_state_get', () => {
  it('should return agent state', () => {
    const result = ps_state_get('test-agent-state');

    expect(result.agentId).toBe('test-agent-state');
    expect(result.health).toBeDefined();
    expect(result.recommendations).toBeDefined();
  });

  it('should indicate non-existent agent', () => {
    const result = ps_state_get('non-existent-agent-' + Date.now());

    expect(result.exists).toBe(false);
    expect(result.health).toBe('healthy');  // Default for unknown
  });
});

describe('ps_state_system', () => {
  it('should return system-wide state', () => {
    const result = ps_state_system();

    expect(result.timestamp).toBeDefined();
    expect(result.agents).toBeDefined();
    expect(result.operations).toBeDefined();
    expect(result.drift).toBeDefined();
    expect(result.circuitBreakers).toBeDefined();
    expect(result.thresholds).toBeDefined();
  });

  it('should include threshold values', () => {
    const result = ps_state_system();

    // Actual threshold properties: preExecute, postAudit, coverageMinimum, driftThreshold
    expect(result.thresholds.preExecute).toBeDefined();
    expect(result.thresholds.driftThreshold).toBeDefined();
  });
});
