# PromptSpeak - Claude Instructions

## Overview

Pre-execution governance layer for AI agents. Intercepts MCP tool calls, validates against deterministic rules, blocks or holds risky operations for human approval. Validation latency: 0.103ms avg.

**v0.2.1** — 658 tests, 45 MCP tools, 16K lines, MIT licensed, published as `promptspeak-mcp-server`.

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
