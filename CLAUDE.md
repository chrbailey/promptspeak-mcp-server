# PromptSpeak - Claude Instructions

## Project Overview

PromptSpeak is a **pre-execution governance layer for AI agents**. It intercepts every MCP tool call before execution, validates against deterministic rules, and blocks or holds risky operations for human approval — all in under 0.12ms.

**Core Value Prop:** Prevent AI drift by validating agent actions BEFORE they execute, with human-in-the-loop holds for risky operations.

---

## Project Status (Feb 2026)

- **v0.2.0 pushed** to `chrbailey/promptspeak-mcp-server` (public)
- **563 tests passing** across 16 test files, CI green (Node 20 + 22)
- **~16K lines of core governance code** (down from 82K)
- **MIT licensed**, 4 Dependabot PRs merged, demo GIF in README
- **npm package prepped** (335KB) — pending `npm login && npm publish`

---

## Quick Commands

```bash
# Run tests (563 tests)
cd mcp-server && npm test

# Build
cd mcp-server && npm run build

# Start MCP server
cd mcp-server && npm start

# Re-record demo GIF
cd mcp-server && ./demo/record.sh vhs
```

---

## Architecture

```
Request → Circuit Breaker → Validation → Drift Check → Hold Check → Execute
              ↓                ↓             ↓             ↓
         (blocked?)      (valid frame?)  (drifting?)   (needs human?)
```

**Key principle:** Circuit breaker is FIRST — halted agents are blocked immediately, before any validation.

---

## Code Locations

| Component | Path |
|-----------|------|
| MCP Server entry | `mcp-server/src/server.ts` |
| Gatekeeper (5-stage pipeline) | `mcp-server/src/gatekeeper/` |
| Drift detection + circuit breaker | `mcp-server/src/drift/` |
| Symbol registry (SQLite-backed) | `mcp-server/src/symbols/` |
| Policy loader + overlays | `mcp-server/src/policies/` |
| Operator configuration | `mcp-server/src/operator/` |
| MCP tool implementations | `mcp-server/src/tools/` |
| Tool dispatch + registry | `mcp-server/src/handlers/` |
| Core (logging, errors, patterns) | `mcp-server/src/core/` |
| Unit tests | `mcp-server/tests/unit/` |
| Integration tests | `mcp-server/tests/integration/` |
| Stress tests | `mcp-server/tests/stress/` |

---

## Symbol Frame Syntax

Frames are 2-12 symbols. **Mode MUST be first.**

### Structure: `[Mode][Domain][Constraint?][Action][Entity?]`

Example: `⊕◊▶β` = "strict financial execute secondary-agent"

### Key Symbols

| Category | Symbols |
|----------|---------|
| **Modes** | `⊕` strict, `⊘` neutral, `⊖` flexible, `⊗` forbidden |
| **Domains** | `◊` financial, `◈` technical, `◇` legal, `◆` medical, `◐` operational |
| **Actions** | `▶` execute, `◀` retrieve, `▲` analyze, `▼` transform, `●` validate, `○` create |
| **Constraints** | `⛔` forbidden (inherits), `✗` rejected, `⚠` warning, `✓` approved |
| **Entities** | `α` primary, `β` secondary, `γ` tertiary, `ω` terminal |

---

## Validation Rules (Critical)

### Three-Tier Validation
1. **Structural:** Mode first, length 2-12, no duplicate singletons
2. **Semantic:** No conflicting modes (`⊕⊖`), no forbidden+execute (`⊗▶`)
3. **Chain:** Child cannot weaken parent mode, `⛔` must propagate

---

## MCP Tools (~41 tools)

### Core Governance
| Tool | Purpose |
|------|---------|
| `ps_validate` / `ps_validate_batch` | Validate frame(s) |
| `ps_execute` / `ps_execute_dry_run` | Execute with governance |
| `ps_delegate` / `ps_delegate_revoke` | Delegation management |
| `ps_state_halt` / `ps_state_resume` | Circuit breaker control |
| `ps_hold_list` / `ps_hold_approve` / `ps_hold_reject` | Human-in-the-loop |

### Configuration + Monitoring
| Tool | Purpose |
|------|---------|
| `ps_config_set` / `ps_config_get` | Runtime configuration |
| `ps_confidence_set` / `ps_confidence_get` | Confidence thresholds |
| `ps_feature_set` / `ps_feature_get` | Feature flags |
| `ps_audit_get` | Audit trail |
| `ps_state_drift_history` | Drift history |

### Symbol Registry
| Tool | Purpose |
|------|---------|
| `ps_symbol_create` / `ps_symbol_get` / `ps_symbol_list` | Symbol CRUD |
| `ps_symbol_verify` / `ps_symbol_list_unverified` | Epistemic verification |

---

## When Working on This Project

1. **Always run tests** after code changes: `npm test`
2. **Validation is three-tier** — ensure changes respect structural → semantic → chain order
3. **Circuit breaker is sacred** — it must ALWAYS be the first check
4. **`⛔` propagates** — forbidden constraints must inherit to all child frames
5. **Performance matters** — current validation latency is 0.103ms avg
6. **563 tests must pass** — no regressions allowed
7. **Demo GIF** — re-record after visible changes: `./demo/record.sh vhs` (needs VHS + Chrome)

## Don't (Learned the Hard Way)

- **Don't reorder the pipeline.** Circuit breaker → validation → drift → hold. Changing this order breaks safety guarantees. A halted agent must be blocked before any validation runs.
- **Don't add new modules.** v0.2.0 deliberately removed 6 modules (swarm, recon, multi-agent, translation, legal, boot-camp). Ask before adding anything back.
- **Don't weaken validation to make tests pass.** If a test fails, fix the test or the code — never loosen a validation rule to green-light a test.
- **Don't create `⊗▶` frames.** Forbidden mode + execute action is an invalid semantic combination. The validator rejects this by design.
- **Don't skip chain inheritance checks.** Child frames cannot weaken parent mode. `⛔` must propagate to all descendants. This is not optional.
- **Don't add tools without tests.** Every tool in `src/tools/` needs unit test coverage. No exceptions.
- **Don't touch `src/gatekeeper/` casually.** The 5-stage pipeline is load-bearing. Changes need integration tests, not just unit tests.
- **Don't add abstractions "for later."** This codebase was cut from 82K to 16K lines for a reason. Every new file needs to justify its existence now, not hypothetically.
