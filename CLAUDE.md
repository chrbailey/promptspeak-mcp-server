# PromptSpeak - Claude Instructions

## Overview

Pre-execution governance layer for AI agents. Intercepts MCP tool calls, validates against deterministic rules, blocks or holds risky operations for human approval. Validation latency: 0.164ms avg (P95: 0.368ms).

**v0.4.1** — 834 tests, 56 MCP tools, MIT licensed, published as `@chrbailey/promptspeak-mcp-server`.
HTTPS live at `https://promptspeak.admin-as-a-service.com/mcp` (Cloudflare Tunnel → Mac Mini).
Safety annotations on all 56 tools. Streamable HTTP transport. Connectors submission: all requirements met, form submitted 2026-03-21.

## General Principles

- **Prefer simplicity over cleverness.** Before building new infrastructure or multi-layer abstractions, ask whether updating existing files (CLAUDE.md, MEMORY.md) or a simpler approach would suffice. The codebase was cut from 82K to 16K lines by following this principle.
- **Always produce complete output.** Never return "No response requested" or truncated results. If output will be long, break it into clearly labeled parts and continue without being asked.

## Pipeline Execution Rules

- **Validate phase output before proceeding.** Each phase must produce non-empty output before passing to the next phase. If upstream data is None/empty, halt and report the failure clearly rather than silently continuing with training knowledge.
- **Confirm the target before each phase.** When generating dossiers or research reports, always confirm the target company/entity name before each phase and never mix up targets mid-pipeline.
- **Verify tool access before starting.** Before web research tasks, verify that WebSearch and WebFetch tool permissions are granted. If denied, immediately inform the user rather than repeatedly attempting and failing silently.

## Architecture

```
Request → Circuit Breaker → Validation → Drift Check → Hold Check → Security Scan → Execute
              ↓                ↓             ↓             ↓              ↓
         (blocked?)      (valid frame?)  (drifting?)   (needs human?)  (vuln found?)
```

**Circuit breaker is FIRST** — halted agents are blocked before any validation runs.

### Security Enforcement (Check 6)

Write actions (`write_file`, `edit_file`, `create_file`, `patch_file`) are scanned for vulnerabilities.

| Severity | Enforcement | Action |
|----------|-------------|--------|
| CRITICAL | **Block** | SQL injection, hardcoded secrets |
| HIGH | **Hold** | Security TODOs, logging secrets, insecure defaults |
| MEDIUM | **Warn** | Empty catch blocks, hedging comments, disabled tests |
| LOW/INFO | **Log** | Destructive DB/filesystem operations |

**Tools:** `ps_security_scan`, `ps_security_gate`, `ps_security_config`

## Symbol Frame Syntax

Frames are 2-12 symbols. **Mode MUST be first.**

### Structure: `[Mode][Domain][Constraint?][Action][Entity?]`

Example: `⊕◊▶β` = "strict financial execute secondary-agent"

| Category | Symbols |
|----------|---------|
| **Modes** | `⊕` strict, `⊘` neutral, `⊖` flexible, `⊗` forbidden |
| **Domains** | `◊` financial, `◈` technical, `◇` legal, `◆` medical, `◐` operational |
| **Actions** | `▶` execute, `◀` retrieve, `▲` analyze, `▼` transform, `●` validate, `○` create |
| **Constraints** | `⛔` forbidden (inherits), `✗` rejected, `⚠` warning, `✓` approved |
| **Entities** | `α` primary, `β` secondary, `γ` tertiary, `ω` terminal |

## Validation Rules

1. **Structural:** Mode first, length 2-12, no duplicate singletons
2. **Semantic:** No conflicting modes (`⊕⊖`), no forbidden+execute (`⊗▶`)
3. **Chain:** Child cannot weaken parent mode, `⛔` must propagate

## Don't (Learned the Hard Way)

- **Don't reorder the pipeline.** Circuit breaker → validation → drift → hold → security scan. Changing this breaks safety guarantees.
- **Don't add new modules.** v0.2.0 removed 6 modules (swarm, recon, multi-agent, translation, legal, boot-camp). Ask before adding anything back.
- **Don't weaken validation to make tests pass.** Fix the test or the code — never loosen a rule.
- **Don't create `⊗▶` frames.** Forbidden + execute is an invalid semantic combination.
- **Don't skip chain inheritance checks.** `⛔` must propagate to all descendants.
- **Don't add tools without tests.** Every tool in `src/tools/` needs coverage.
- **Don't touch `src/gatekeeper/` casually.** 6-stage pipeline is load-bearing — needs integration tests.
- **Don't add abstractions "for later."** Codebase was cut from 82K to 16K lines for a reason.
