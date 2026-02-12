---
title: "Pre-Execution Governance for AI Agents: Why Post-Hoc Auditing Isn't Enough"
published: false
description: "AI agents can call tools. The question is whether they should call THIS tool, RIGHT NOW. Pre-execution governance intercepts every tool call before it runs, validates it against adaptive thresholds, and holds risky operations for human review."
tags: ai, mcp, governance, typescript
canonical_url: https://github.com/chrbailey/promptspeak-mcp-server
---

# Pre-Execution Governance for AI Agents: Why Post-Hoc Auditing Isn't Enough

Every AI agent framework ships with tool calling. None of them ship with tool call governance.

The assumption: let the agent act, log what it did, review later. This works until an agent deletes a production database, emails a client's privileged documents to opposing counsel, or commits AWS credentials to a public repo. By the time your audit catches it, the damage is done.

Pre-execution governance intercepts every tool call before it executes, validates it against deterministic rules and adaptive thresholds, and holds risky operations for human approval. The difference between "the agent did something bad and we found it in the logs" and "the agent tried to do something bad and we stopped it."

## The Gap: Can vs. Should

MCP (Model Context Protocol) gives agents tool access. An agent can call `fs_write`, `git_push`, `send_email`, `execute_sql`. The protocol handles the plumbing: schema, transport, argument passing.

What MCP does not handle:

- Should this agent be allowed to write to this path right now?
- Has this agent's behavior drifted from its declared intent?
- Is the agent's confidence in this action high enough to proceed unsupervised?
- Does this tool call contain sensitive data (credentials, PII, private keys)?

Post-hoc auditing answers these questions after execution. Pre-execution governance answers them before.

## What a Governance Hold Looks Like

When PromptSpeak detects a risky tool call, it creates a hold -- a pending request that blocks execution until a human reviews and approves or rejects it.

Here is what the hold creation looks like in the codebase:

```typescript
// An agent requests execution of a tool
const preFlightResults = {
  predictedDriftScore: 0.38,  // Agent behavior deviating from declared intent
  baselineDeviation: 0.12,
  confidenceScore: 0.62,      // Below the 0.7 threshold
};

// The hold manager evaluates whether to block
const holdResult = holdManager.shouldHold(request, preFlightResults);
// Returns:
// {
//   reason: 'pre_flight_drift_prediction',
//   severity: 'high',
//   evidence: {
//     predictedDrift: 0.38,
//     threshold: 0.25,
//   }
// }

// A hold is created -- execution is BLOCKED until human review
const hold = holdManager.createHold(request, holdResult.reason, holdResult.severity, holdResult.evidence);
// hold.state === 'pending'
// hold.expiresAt === Date.now() + 300000 (5 min default)

// Human reviews via MCP tool call:
// ps_hold_list  → see all pending holds
// ps_hold_approve hold_PS-GOV-1234 → approve with optional modified args
// ps_hold_reject hold_PS-GOV-1234 → reject with reason
```

The agent does not proceed. The tool call sits in a queue. A human (or an authorized supervisor agent) reviews the evidence, checks the drift score, and makes a decision. If the hold expires without a decision, it auto-rejects.

Certain holds never auto-expire. If the system detects privileged legal content being sent to an external destination, that hold stays pending until a human explicitly decides. No timeout. No bypass.

## Adaptive Thresholds: The Math

Static thresholds break. Set them too tight and everything gets held for review -- alert fatigue kills governance. Set them too loose and risky actions slip through.

PromptSpeak uses adaptive governance modulation with a compositional formula:

```
effective_threshold = base x mode_factor x uncertainty_factor x calibration_factor
```

Each factor is computed independently:

**Mode factor** -- derived from the symbolic governance mode of the current frame:

```typescript
// mode.strictness: 0=flexible, 1=standard, 2=strict, 3=forbidden
function computeModeFactor(mode: GovernanceMode): number {
  return 1 + (mode.strictness / 3) * 0.3;
  // flexible: 1.0, standard: 1.1, strict: 1.2, forbidden: 1.3
}
```

**Uncertainty factor** -- the key insight. Epistemic uncertainty (reducible with more data) should tighten governance because human review genuinely helps. Aleatoric uncertainty (irreducible randomness) should NOT tighten governance because more human review cannot reduce it:

```typescript
function computeUncertaintyFactor(uncertainty: UncertaintyDecomposition): number {
  const deviation = uncertainty.epistemicRatio - 0.3; // baseline
  return 1 + deviation * 0.5;
  // High epistemic ratio (0.8): factor = 1.25 → tighter
  // Low epistemic ratio (0.1):  factor = 0.9  → relaxed
}
```

**Calibration factor** -- how well-calibrated the system's confidence estimates are. Poor calibration (high Expected Calibration Error) means the system does not know what it does not know:

```typescript
function computeCalibrationFactor(calibration: CalibrationMetrics): number {
  const ece = Math.min(calibration.ece, 1.0);
  return 1 + (ece - 0.05) * 0.4; // target ECE = 0.05
  // Well-calibrated (ECE=0.02): factor = 0.988 → slight relaxation
  // Poorly calibrated (ECE=0.15): factor = 1.04  → tightened
}
```

The composition is multiplicative. All three factors compound. And every effective threshold is clamped to safety bounds -- the system can never relax below a hardcoded floor or tighten above a maximum that would block everything:

```typescript
// Drift threshold: lower is stricter
const driftThreshold = clamp(
  BASE_THRESHOLDS.driftThreshold / tighteningFactor,
  0.02,  // absolute floor -- can never relax beyond this
  0.30   // absolute ceiling
);
```

## The Immutable Safety Floor

Below the adaptive layer sits a set of hardcoded constraints that never relax. No amount of good calibration, high confidence, or flexible governance mode can bypass them:

1. **Forbidden mode blocks** -- if the frame mode is `forbidden` (the `⊗` symbol), execution is blocked. Period.
2. **Sensitive data detection** -- regex patterns for SSNs, API keys, private keys, JWTs, credit card numbers. If detected in tool call arguments, the call is held for review.
3. **Dempster-Shafer conflict** -- when evidence sources fundamentally disagree (conflict coefficient > 0.7), mandatory human review.
4. **Circuit breaker floor** -- 3 consecutive failures trigger an immutable block.
5. **Maximum uncertainty** -- total uncertainty above 0.95 always requires human review.

```typescript
// These are compile-time constants. Not configurable. Not overridable.
export const IMMUTABLE_CONSTRAINTS = {
  forbiddenModeBlocks: true,
  sensitiveDataHold: true,
  dsConflictThreshold: 0.7,
  circuitBreakerFloor: 3,
  maxUncertaintyForAutoPass: 0.95,
};
```

The adaptive governance layer operates *above* this floor. It can tighten beyond these constraints but can never loosen below them.

## Progressive Trust: Asymmetric by Design

Agents start at `supervised` level -- every action reviewed. Trust ascent is slow and requires sustained good calibration:

```
SUPERVISED ──[10 calibrated windows]──→ GUIDED
GUIDED     ──[20 calibrated windows]──→ COLLABORATIVE
COLLABORATIVE ──[50 calibrated windows]──→ AUTONOMOUS
```

Trust descent is fast. One critical prediction failure drops the agent one level immediately. An immutable constraint violation resets to `supervised` -- full trust wipe. This asymmetry is intentional. It takes weeks of consistent behavior to earn autonomy. It takes one bad action to lose it.

## Integration

PromptSpeak runs as an MCP server. Add it to your `claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "promptspeak": {
      "command": "node",
      "args": ["/path/to/promptspeak-mcp-server/dist/index.js"]
    }
  }
}
```

The server exposes 41 MCP tools. The core governance tools:

| Tool | What It Does |
|------|-------------|
| `ps_execute` | Execute a tool call through the governance pipeline |
| `ps_execute_dry_run` | Test execution without side effects |
| `ps_hold_list` | List all pending holds awaiting human review |
| `ps_hold_approve` | Approve a held operation |
| `ps_hold_reject` | Reject a held operation |
| `ps_state_halt` | Emergency halt -- block all agent actions |
| `ps_state_resume` | Resume after halt |
| `ps_audit_get` | Retrieve the audit trail |

Every tool call that passes through `ps_execute` is validated, drift-checked, and either allowed, held, or blocked. Every decision is logged with an audit ID.

## The Cost of Waiting

The market for AI governance is projected to grow from $228M to $1.4B by 2030 (35.7% CAGR). The governance tools that exist today are focused on model-level guardrails: prompt injection detection, output filtering, content safety. These are necessary but insufficient for agent governance.

When an AI agent has tool access, the attack surface is not the model's output -- it is the model's actions. Pre-execution governance is the layer that controls those actions before they happen.

The validation pipeline runs in under 0.12ms. That is the cost of checking every tool call before execution. The cost of not checking is unbounded.

---

*[PromptSpeak](https://github.com/chrbailey/promptspeak-mcp-server) is an open-source pre-execution governance layer for AI agents. MIT licensed. 563 tests. Works with any MCP-compatible client.*
