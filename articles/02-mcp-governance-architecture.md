---
title: "Building an MCP Governance Server: Architecture Deep-Dive"
published: false
description: "How PromptSpeak intercepts every AI agent tool call before execution -- the 5-stage gatekeeper pipeline, adaptive governance math, hold queue, circuit breaker, and audit trail. Full architecture walkthrough with code."
tags: ai, mcp, architecture, typescript, governance
canonical_url: https://github.com/chrbailey/promptspeak-mcp-server
---

# Building an MCP Governance Server: Architecture Deep-Dive

MCP (Model Context Protocol) standardizes how AI agents call tools. It handles transport, schemas, argument passing, and result formatting. What it does not handle is whether a given tool call should be allowed to execute.

PromptSpeak is an MCP server that sits between the agent and its tools. Every tool call passes through a 5-stage governance pipeline before execution. This article walks through the architecture: how interception works, what each pipeline stage does, how the adaptive threshold math computes gate decisions, and how the hold queue enables human-in-the-loop review.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP CLIENT                               │
│                  (Claude Code, IDE, etc.)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ MCP tool call
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROMPTSPEAK MCP SERVER                        │
│                                                                 │
│  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌──────┐  ┌──────┐ │
│  │  CIRCUIT   │→│ VALIDATE  │→│  DRIFT   │→│ HOLD  │→│EXECUTE│ │
│  │  BREAKER   │  │  FRAME   │  │  CHECK   │  │CHECK │  │      │ │
│  └───────────┘  └──────────┘  └─────────┘  └──────┘  └──────┘ │
│       ↓              ↓             ↓            ↓         ↓     │
│    BLOCKED?      VALID FRAME?  DRIFTING?    NEEDS       RUN    │
│   (halted →      (structural,  (behavior    HUMAN?      TOOL   │
│    reject)       semantic,     deviation    (hold →            │
│                  chain)        detected)    queue)             │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   GOVERNANCE LAYER                        │   │
│  │  adaptive thresholds · immutable constraints · autonomy   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     AUDIT TRAIL                           │   │
│  │  every decision logged · audit IDs · evidence preserved   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

The pipeline is strictly ordered. Circuit breaker is first -- a halted agent is blocked before any validation runs. This ordering is a design invariant: if the system is in a bad state, no amount of valid framing should allow execution.

## Stage 1: Circuit Breaker

The circuit breaker is the emergency stop. When triggered, it blocks all tool calls for the affected agent immediately.

Triggers:
- Manual halt via `ps_state_halt` (operator decision)
- 3+ consecutive failures (immutable constraint)
- Critical drift detection (automatic)
- Immutable constraint violation (automatic trust reset)

The circuit breaker check is a constant-time lookup. No parsing, no validation, no computation. Just a boolean: is this agent halted? If yes, reject with reason. If no, proceed.

```typescript
// From the gatekeeper pipeline -- circuit breaker is ALWAYS first
if (circuitBreaker.isHalted(agentId)) {
  return {
    allowed: false,
    reason: circuitBreaker.getHaltReason(agentId),
    stage: 'circuit_breaker',
    auditId: generateAuditId(),
  };
}
```

## Stage 2: Frame Validation

PromptSpeak uses symbolic governance frames -- compact expressions that declare mode, domain, constraints, and actions. A frame like `⊕◊▶α` means "strict mode, financial domain, execute action, primary entity."

Validation is three-tier:

**Structural validation:**
- Mode symbol must be first position
- Frame length 2-12 symbols
- No duplicate singleton symbols

**Semantic validation:**
- No conflicting modes (`⊕⊖` -- strict and flexible simultaneously)
- No forbidden + execute (`⊗▶` -- cannot execute in forbidden mode)
- Domain-action compatibility

**Chain validation:**
- Child frames cannot weaken parent mode (if parent is strict, child cannot be flexible)
- Forbidden constraint (`⛔`) must propagate to all descendants
- Delegation depth limits

Each validation tier can reject with a specific reason. The three tiers run in order -- structural issues are caught before semantic analysis begins.

## Stage 3: Drift Detection

Drift detection compares the agent's current behavior against its declared intent. An agent that says it is doing code review but starts writing to the filesystem is drifting.

The drift score is a continuous value from 0.0 (perfectly aligned) to 1.0 (completely off-track). The threshold that triggers a hold is adaptive -- it depends on the governance mode, uncertainty decomposition, and calibration quality.

```typescript
// Lower-is-stricter: tightening DIVIDES the base threshold
const driftThreshold = clamp(
  BASE_THRESHOLDS.driftThreshold / tighteningFactor,
  0.02,  // minimum -- never relaxes beyond this
  0.30   // maximum -- never tightens beyond this
);
// Base drift threshold: 0.15
// In strict mode with high epistemic uncertainty: ~0.10
// In flexible mode with good calibration: ~0.20
```

If the observed drift score exceeds the effective threshold, the call moves to the hold stage. If drift exceeds a critical threshold, the circuit breaker triggers automatically.

## Stage 4: Hold Check

The hold manager evaluates multiple conditions to decide whether a tool call needs human review:

| Condition | Hold Reason | Severity |
|-----------|------------|----------|
| Predicted drift > 0.25 | `pre_flight_drift_prediction` | medium-critical |
| Baseline deviation > 0.30 | `drift_threshold_exceeded` | high |
| Confidence < 0.70 | `confidence_below_threshold` | low |
| MCP validation required | `mcp_validation_pending` | medium |
| Forbidden with override | `forbidden_constraint` | critical |
| Sensitive data detected | Immutable hold | critical |

When a hold is created, the tool call is queued with full evidence:

```typescript
const hold: HoldRequest = {
  holdId: 'hold_PS-GOV-1707842400000-000042',
  agentId: 'claude-code-session-abc',
  frame: '⊕◊▶α',
  tool: 'fs_write',
  arguments: { path: '/etc/config', content: '...' },
  reason: 'pre_flight_drift_prediction',
  severity: 'high',
  createdAt: 1707842400000,
  expiresAt: 1707842700000,  // 5 min default
  state: 'pending',
  evidence: {
    predictedDrift: 0.38,
    threshold: 0.25,
  },
};
```

The hold sits in the pending queue until:
1. A human approves it (`ps_hold_approve`) -- optionally with modified arguments
2. A human rejects it (`ps_hold_reject`)
3. It expires (auto-rejected after timeout)

Certain holds never expire. Legal privilege risk holds (agent attempting to send privileged documents externally) remain pending indefinitely. A human must make the call.

## Stage 5: Execute

If the call passes all four prior stages, it executes. The execution itself is logged with:
- Full audit trail entry with unique audit ID
- Timestamp, agent ID, tool name, arguments
- Coverage confidence score
- Governance mode and effective thresholds at time of execution

## The Governance Math Layer

Underneath stages 3 and 4, the governance layer computes adaptive thresholds using a compositional formula:

```
effective_threshold = base x mode_factor x uncertainty_factor x calibration_factor
```

### Threshold Computation

Six gates are governed by adaptive thresholds:

| Gate | Base Value | Direction | Purpose |
|------|-----------|-----------|---------|
| `driftThreshold` | 0.15 | lower is stricter | Concept drift detection |
| `reviewGateAutoPass` | 0.55 | higher is stricter | Minimum confidence for auto-pass |
| `threatActivation` | 0.60 | higher is stricter | Threat detection activation |
| `conformanceDeviation` | 0.05 | lower is stricter | Process conformance tolerance |
| `sayDoGap` | 0.20 | lower is stricter | Declared vs. actual behavior gap |
| `knowledgePromotion` | 0.75 | higher is stricter | Knowledge verification threshold |

The direction matters for composition. For lower-is-stricter gates, tightening *divides* the base threshold (making it smaller). For higher-is-stricter gates, tightening *multiplies* the base threshold (making it larger).

### Uncertainty Decomposition

The uncertainty factor distinguishes between two types of uncertainty:

**Epistemic uncertainty** -- the system does not have enough data. Human review helps because it adds evidence. High epistemic ratio tightens governance.

**Aleatoric uncertainty** -- inherent randomness. Human review does not help because the randomness is irreducible. High aleatoric uncertainty does NOT tighten governance.

```typescript
// Only epistemic uncertainty drives governance tightening
const epistemicRatio = uncertainty.epistemic / uncertainty.total;
const uncertaintyFactor = 1 + (epistemicRatio - 0.3) * 0.5;
```

This prevents a common failure mode: systems that flood humans with review requests for inherently uncertain situations where human review adds no value.

### Immutable Safety Floor

Below the adaptive layer, five hardcoded constraints form an absolute safety floor:

```typescript
const IMMUTABLE_CONSTRAINTS = {
  forbiddenModeBlocks: true,      // ⊗ always blocks
  sensitiveDataHold: true,         // SSN, API keys, private keys → hold
  dsConflictThreshold: 0.7,        // Evidence conflict → mandatory review
  circuitBreakerFloor: 3,          // 3 failures → hard block
  maxUncertaintyForAutoPass: 0.95, // Near-total uncertainty → hold
};
```

The adaptive layer operates above this floor. Good calibration can relax thresholds, but never below the immutable minimum. Flexible mode can widen tolerances, but forbidden patterns still trigger holds.

### Autonomy Controller

Agents start at `supervised` level. Trust builds slowly and breaks fast:

```
Ascent (slow):
  SUPERVISED ──[10 calibrated windows]──→ GUIDED
  GUIDED     ──[20 calibrated windows]──→ COLLABORATIVE
  COLLABORATIVE ──[50 calibrated windows]──→ AUTONOMOUS

Descent (fast):
  Any level  ──[1 critical miss]──→ one level down (immediate)
  Any level  ──[3 degraded windows]──→ one level down
  Any level  ──[immutable violation]──→ SUPERVISED (full reset)
```

Autonomy level governs which actions are permitted at all. Threshold modulation governs how strictly those actions are evaluated. These are orthogonal concerns by design.

## MCP Tool Surface

PromptSpeak exposes 41 MCP tools organized into four groups:

### Core Governance
| Tool | When To Call It |
|------|----------------|
| `ps_validate` | Check if a governance frame is valid before using it |
| `ps_validate_batch` | Validate multiple frames at once |
| `ps_execute` | Run a tool call through the full governance pipeline |
| `ps_execute_dry_run` | Test what would happen without side effects |
| `ps_delegate` | Grant limited delegation to another agent |
| `ps_delegate_revoke` | Revoke a delegation |
| `ps_state_halt` | Emergency stop -- block all agent actions |
| `ps_state_resume` | Resume after halt |

### Hold Queue (Human-in-the-Loop)
| Tool | When To Call It |
|------|----------------|
| `ps_hold_list` | See all pending holds awaiting review |
| `ps_hold_approve` | Approve a held operation (optionally modify args) |
| `ps_hold_reject` | Reject a held operation with reason |

### Configuration
| Tool | When To Call It |
|------|----------------|
| `ps_config_set` / `ps_config_get` | Runtime configuration |
| `ps_confidence_set` / `ps_confidence_get` | Confidence threshold tuning |
| `ps_feature_set` / `ps_feature_get` | Feature flag management |

### Monitoring
| Tool | When To Call It |
|------|----------------|
| `ps_audit_get` | Retrieve audit trail entries |
| `ps_state_drift_history` | View drift detection history |

## Integration Example

Add PromptSpeak as an MCP server to your configuration:

```json
{
  "mcpServers": {
    "promptspeak": {
      "command": "node",
      "args": ["/path/to/promptspeak-mcp-server/dist/index.js"],
      "env": {}
    }
  }
}
```

Then use the governance tools in your agent workflow:

```typescript
// 1. Validate the governance frame
const validation = await callTool('ps_validate', {
  frame: '⊕◈▶α'  // strict, technical, execute, primary
});
// { valid: true, mode: 'strict', domain: 'technical' }

// 2. Execute through governance pipeline
const result = await callTool('ps_execute', {
  frame: '⊕◈▶α',
  tool: 'fs_write',
  arguments: { path: '/app/config.json', content: '{ "debug": false }' },
  agentId: 'my-agent-session'
});

// If held:
// { status: 'held', holdId: 'hold_PS-GOV-...', reason: 'pre_flight_drift_prediction' }

// 3. Check for pending holds
const holds = await callTool('ps_hold_list', {});
// [{ holdId: '...', tool: 'fs_write', severity: 'high', evidence: {...} }]

// 4. Human approves
const decision = await callTool('ps_hold_approve', {
  holdId: 'hold_PS-GOV-...',
  reason: 'Reviewed -- config change is expected'
});
```

## Performance

The full governance pipeline -- frame validation, drift check, hold evaluation, threshold computation -- runs in under 0.12ms average. This is measured across 563 tests covering the complete pipeline.

The design choices that make this possible:
- No network calls in the hot path (all validation is local)
- Immutable constraints are compile-time constants
- Circuit breaker is a single map lookup
- Frame validation uses pre-compiled regex patterns
- Threshold computation is pure arithmetic (multiply, clamp)

The governance layer adds negligible latency to any tool call. The bottleneck is always the tool execution itself, never the governance check.

## Design Principles

Three principles guided the architecture:

**1. Circuit breaker is sacred.** It runs first, always. No validation result, governance mode, or operator override can bypass it. If the system is halted, nothing executes.

**2. Adaptive but bounded.** Thresholds adapt to mode, uncertainty, and calibration. But adaptation is clamped to safety bounds, and immutable constraints form an absolute floor. The system can get smarter but never unsafe.

**3. Asymmetric trust.** Earning autonomy is slow and requires sustained demonstrated competence. Losing it is fast and can be triggered by a single failure. This matches how trust works in human organizations -- and for the same reasons.

---

![PromptSpeak Governance Demo](https://raw.githubusercontent.com/chrbailey/promptspeak-mcp-server/main/demo/promptspeak-demo.gif)

*[PromptSpeak](https://github.com/chrbailey/promptspeak-mcp-server) is an open-source pre-execution governance layer for AI agents. MIT licensed. TypeScript. 563 tests. 41 MCP tools. ~16K lines of core governance code.*
