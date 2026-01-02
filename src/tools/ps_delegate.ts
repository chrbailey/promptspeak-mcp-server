/**
 * ps_delegate Tool
 *
 * Handles delegation from parent agent to child agent.
 * Enforces inheritance rules, mode strength preservation,
 * and forbidden constraint propagation.
 */

import { DynamicResolver } from '../gatekeeper/resolver.js';
import { FrameValidator } from '../gatekeeper/validator.js';
import { driftEngine } from '../drift/index.js';  // Use singleton
import { recordAudit } from '../operator/index.js';
import type { ParsedFrame, ValidationReport } from '../types/index.js';

const resolver = new DynamicResolver();
const validator = new FrameValidator();

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface DelegateRequest {
  parentAgentId: string;
  childAgentId: string;
  parentFrame: string;
  childFrame: string;
  task?: {
    description: string;
    constraints?: string[];
    deadline?: number;
  };
  inheritanceMode?: 'strict' | 'relaxed' | 'custom';
  customInheritance?: {
    inheritMode: boolean;
    inheritDomain: boolean;
    inheritConstraints: boolean;
    inheritPriority: boolean;
  };
}

export interface DelegateResult {
  success: boolean;
  delegationId: string;
  parentAgentId: string;
  childAgentId: string;
  parentFrame: string;
  childFrame: string;
  effectiveChildFrame: string;
  validation: {
    valid: boolean;
    chainValid: boolean;
    errors: string[];
    warnings: string[];
  };
  inheritance: {
    modeInherited: boolean;
    domainInherited: boolean;
    constraintsInherited: string[];
    strengthPreserved: boolean;
  };
  childCircuitState: string;
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export function ps_delegate(request: DelegateRequest): DelegateResult {
  const delegationId = generateDelegationId();

  recordAudit('delegation_start', request.parentAgentId, {
    delegationId,
    childAgentId: request.childAgentId,
    parentFrame: request.parentFrame,
    childFrame: request.childFrame
  });

  // Step 1: Parse both frames
  const parsedParent = resolver.parseFrame(request.parentFrame);
  const parsedChild = resolver.parseFrame(request.childFrame);

  if (!parsedParent) {
    return createFailureResult(
      delegationId,
      request,
      'Failed to parse parent frame',
      'closed'
    );
  }

  if (!parsedChild) {
    return createFailureResult(
      delegationId,
      request,
      'Failed to parse child frame',
      'closed'
    );
  }

  // Step 2: Check child agent circuit breaker
  const childStatus = driftEngine.getAgentStatus(request.childAgentId);
  if (childStatus?.circuitBreakerState === 'open') {
    return createFailureResult(
      delegationId,
      request,
      'Child agent circuit breaker is open - cannot delegate',
      'open'
    );
  }

  // Step 3: Apply inheritance rules
  const inheritanceResult = applyInheritance(
    parsedParent,
    parsedChild,
    request.inheritanceMode ?? 'strict',
    request.customInheritance
  );

  // Step 4: Validate the delegation chain
  const chainValidation = validator.validateChain(
    inheritanceResult.effectiveChildFrame,
    parsedParent
  );

  // Step 5: Check for forbidden constraint propagation (check ORIGINAL child frame, not effective)
  // This ensures we catch when child frame doesn't explicitly inherit ⛔ from parent
  const forbiddenCheck = checkForbiddenPropagation(parsedParent, parsedChild);

  // Step 6: Determine overall validity
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const err of (chainValidation.errors ?? [])) {
    errors.push(`${err.code}: ${err.message}`);
  }
  for (const warn of (chainValidation.warnings ?? [])) {
    warnings.push(`${warn.code}: ${warn.message}`);
  }

  if (!forbiddenCheck.valid) {
    errors.push(forbiddenCheck.message);
  }

  const valid = errors.length === 0;

  // Step 7: Record the delegation if valid
  if (valid) {
    recordDelegation(delegationId, request, inheritanceResult);
  }

  recordAudit('delegation_complete', request.parentAgentId, {
    delegationId,
    success: valid,
    errors,
    warnings
  });

  // Step 8: Rebuild effective frame string
  const effectiveFrameString = frameToString(inheritanceResult.effectiveChildFrame);

  return {
    success: valid,
    delegationId,
    parentAgentId: request.parentAgentId,
    childAgentId: request.childAgentId,
    parentFrame: request.parentFrame,
    childFrame: request.childFrame,
    effectiveChildFrame: effectiveFrameString,
    validation: {
      valid,
      chainValid: chainValidation.valid,
      errors,
      warnings
    },
    inheritance: {
      modeInherited: inheritanceResult.modeInherited,
      domainInherited: inheritanceResult.domainInherited,
      constraintsInherited: inheritanceResult.constraintsInherited,
      strengthPreserved: inheritanceResult.strengthPreserved
    },
    childCircuitState: childStatus?.circuitBreakerState ?? 'closed'
  };
}

// ============================================================================
// INHERITANCE LOGIC
// ============================================================================

interface InheritanceResult {
  effectiveChildFrame: ParsedFrame;
  modeInherited: boolean;
  domainInherited: boolean;
  constraintsInherited: string[];
  strengthPreserved: boolean;
}

function applyInheritance(
  parent: ParsedFrame,
  child: ParsedFrame,
  mode: 'strict' | 'relaxed' | 'custom',
  custom?: DelegateRequest['customInheritance']
): InheritanceResult {
  // Deep copy the child frame to avoid mutating the original
  const effective = {
    ...child,
    symbols: [...child.symbols],
    constraints: [...child.constraints],  // Deep copy constraints array
    modifiers: [...child.modifiers]        // Deep copy modifiers array
  };
  const result: InheritanceResult = {
    effectiveChildFrame: effective,
    modeInherited: false,
    domainInherited: false,
    constraintsInherited: [],
    strengthPreserved: true
  };

  const settings = mode === 'custom' && custom ? custom : {
    inheritMode: mode === 'strict',
    inheritDomain: true,
    inheritConstraints: mode === 'strict',
    inheritPriority: mode === 'strict'
  };

  // Mode inheritance
  if (settings.inheritMode && parent.mode && !child.mode) {
    effective.mode = parent.mode;
    result.modeInherited = true;
  }

  // Check mode strength
  if (parent.mode && child.mode) {
    const parentStrength = getModeStrength(parent.mode);
    const childStrength = getModeStrength(child.mode);
    result.strengthPreserved = childStrength <= parentStrength;
  }

  // Domain inheritance
  if (settings.inheritDomain && parent.domain && !child.domain) {
    effective.domain = parent.domain;
    result.domainInherited = true;
  }

  // Constraint inheritance
  if (settings.inheritConstraints) {
    for (const constraint of parent.constraints) {
      if (!child.constraints.includes(constraint)) {
        effective.constraints.push(constraint);
        result.constraintsInherited.push(constraint);
      }
    }
  }

  // Always inherit ⛔ (forbidden) constraint
  if (parent.constraints.includes('⛔') && !effective.constraints.includes('⛔')) {
    effective.constraints.push('⛔');
    if (!result.constraintsInherited.includes('⛔')) {
      result.constraintsInherited.push('⛔');
    }
  }

  // Priority inheritance
  if (settings.inheritPriority && parent.modifiers.includes('↑') && !child.modifiers.includes('↑')) {
    effective.modifiers.push('↑');
  }

  return result;
}

function getModeStrength(mode: string): number {
  const strengths: Record<string, number> = {
    '⊕': 1,  // strict - strongest
    '⊘': 2,  // neutral
    '⊖': 3,  // flexible
    '⊗': 4   // forbidden - weakest (most permissive)
  };
  return strengths[mode] ?? 5;
}

// ============================================================================
// FORBIDDEN PROPAGATION CHECK
// ============================================================================

function checkForbiddenPropagation(
  parent: ParsedFrame,
  child: ParsedFrame
): { valid: boolean; message: string } {
  // If parent has ⛔, child must have it
  if (parent.constraints.includes('⛔') && !child.constraints.includes('⛔')) {
    return {
      valid: false,
      message: 'FORBIDDEN_NOT_INHERITED: Parent has ⛔ constraint which must be inherited'
    };
  }

  // If parent has ⊗ mode (forbidden mode), child must maintain
  if (parent.mode === '⊗' && child.mode !== '⊗') {
    return {
      valid: false,
      message: 'FORBIDDEN_MODE_NOT_INHERITED: Parent has ⊗ (forbidden) mode which must be inherited'
    };
  }

  return { valid: true, message: '' };
}

// ============================================================================
// DELEGATION TRACKING
// ============================================================================

interface DelegationRecord {
  id: string;
  parentAgentId: string;
  childAgentId: string;
  parentFrame: string;
  childFrame: string;
  effectiveChildFrame: string;
  timestamp: number;
  status: 'active' | 'completed' | 'revoked';
}

const delegationRegistry: Map<string, DelegationRecord> = new Map();
const agentDelegations: Map<string, Set<string>> = new Map();

function recordDelegation(
  id: string,
  request: DelegateRequest,
  inheritance: InheritanceResult
): void {
  const record: DelegationRecord = {
    id,
    parentAgentId: request.parentAgentId,
    childAgentId: request.childAgentId,
    parentFrame: request.parentFrame,
    childFrame: request.childFrame,
    effectiveChildFrame: frameToString(inheritance.effectiveChildFrame),
    timestamp: Date.now(),
    status: 'active'
  };

  delegationRegistry.set(id, record);

  // Track parent's delegations
  if (!agentDelegations.has(request.parentAgentId)) {
    agentDelegations.set(request.parentAgentId, new Set());
  }
  agentDelegations.get(request.parentAgentId)!.add(id);
}

// ============================================================================
// REVOKE DELEGATION
// ============================================================================

export interface RevokeRequest {
  delegationId: string;
  parentAgentId: string;
  reason?: string;
}

export interface RevokeResult {
  success: boolean;
  delegationId: string;
  childAgentId?: string;
  message: string;
}

export function ps_delegate_revoke(request: RevokeRequest): RevokeResult {
  const record = delegationRegistry.get(request.delegationId);

  if (!record) {
    return {
      success: false,
      delegationId: request.delegationId,
      message: 'Delegation not found'
    };
  }

  if (record.parentAgentId !== request.parentAgentId) {
    return {
      success: false,
      delegationId: request.delegationId,
      message: 'Only parent agent can revoke delegation'
    };
  }

  if (record.status !== 'active') {
    return {
      success: false,
      delegationId: request.delegationId,
      message: `Delegation already ${record.status}`
    };
  }

  record.status = 'revoked';

  recordAudit('delegation_revoke', request.parentAgentId, {
    delegationId: request.delegationId,
    childAgentId: record.childAgentId,
    reason: request.reason
  });

  return {
    success: true,
    delegationId: request.delegationId,
    childAgentId: record.childAgentId,
    message: 'Delegation revoked successfully'
  };
}

// ============================================================================
// LIST DELEGATIONS
// ============================================================================

export interface ListDelegationsRequest {
  agentId: string;
  role?: 'parent' | 'child' | 'both';
  status?: 'active' | 'completed' | 'revoked' | 'all';
}

export interface ListDelegationsResult {
  agentId: string;
  asParent: DelegationRecord[];
  asChild: DelegationRecord[];
}

export function ps_delegate_list(request: ListDelegationsRequest): ListDelegationsResult {
  const role = request.role ?? 'both';
  const status = request.status ?? 'active';

  const asParent: DelegationRecord[] = [];
  const asChild: DelegationRecord[] = [];

  for (const record of delegationRegistry.values()) {
    if (status !== 'all' && record.status !== status) continue;

    if ((role === 'parent' || role === 'both') && record.parentAgentId === request.agentId) {
      asParent.push(record);
    }
    if ((role === 'child' || role === 'both') && record.childAgentId === request.agentId) {
      asChild.push(record);
    }
  }

  return {
    agentId: request.agentId,
    asParent,
    asChild
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateDelegationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `del_${timestamp}_${random}`;
}

function createFailureResult(
  delegationId: string,
  request: DelegateRequest,
  error: string,
  circuitState: string
): DelegateResult {
  return {
    success: false,
    delegationId,
    parentAgentId: request.parentAgentId,
    childAgentId: request.childAgentId,
    parentFrame: request.parentFrame,
    childFrame: request.childFrame,
    effectiveChildFrame: request.childFrame,
    validation: {
      valid: false,
      chainValid: false,
      errors: [error],
      warnings: []
    },
    inheritance: {
      modeInherited: false,
      domainInherited: false,
      constraintsInherited: [],
      strengthPreserved: false
    },
    childCircuitState: circuitState
  };
}

function frameToString(frame: ParsedFrame): string {
  const parts: string[] = [];

  if (frame.mode) parts.push(frame.mode);
  parts.push(...frame.modifiers);
  if (frame.domain) parts.push(frame.domain);
  if (frame.source) parts.push(frame.source);
  parts.push(...frame.constraints);
  if (frame.action) parts.push(frame.action);
  if (frame.entity) parts.push(frame.entity);

  return parts.join('');
}
