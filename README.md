# promptspeak-mcp-server

[![CI](https://github.com/chrbailey/promptspeak-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/chrbailey/promptspeak-mcp-server/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@chrbailey/promptspeak-mcp-server)](https://www.npmjs.com/package/@chrbailey/promptspeak-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-829%20passing-brightgreen)](https://github.com/chrbailey/promptspeak-mcp-server/actions)

**Pre-execution governance for AI agents. Blocks dangerous tool calls before they execute.**

AI agents call tools (file writes, API requests, shell commands) with no validation layer between intent and execution. A prompt injection, hallucinated argument, or drifting goal can trigger irreversible actions. PromptSpeak intercepts every MCP tool call, validates it against deterministic rules, and blocks or holds risky operations for human approval — in 0.1ms, before anything executes.

![PromptSpeak Governance Demo](demo/promptspeak-demo.gif)


## When to use this

- You run AI agents that call tools (MCP servers, function calling, tool use) and need a governance layer between the agent and the tools.
- You need human-in-the-loop approval for high-risk operations (production deployments, financial transactions, legal filings).
- You want to detect behavioral drift — an agent gradually shifting away from its assigned task.
- You need an audit trail of every tool call an agent attempted, whether it was allowed or blocked.
- You operate in a regulated domain (legal, financial, healthcare) where agent actions must be deterministically constrained.


## Install

### Claude Code

Add to `~/.claude/settings.json` (or project-level `.claude/settings.json`):

```json
{
  "mcpServers": {
    "promptspeak": {
      "command": "npx",
      "args": ["promptspeak-mcp-server"]
    }
  }
}
```

Restart Claude Code. All 56 governance tools are immediately available.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "promptspeak": {
      "command": "npx",
      "args": ["promptspeak-mcp-server"]
    }
  }
}
```

### As a library

```bash
npm install promptspeak-mcp-server
```

### From source

```bash
git clone https://github.com/chrbailey/promptspeak-mcp-server.git
cd promptspeak-mcp-server
npm install && npm run build
npm start
```


## Usage examples

### 1. Validate a governance frame

Validate that a PromptSpeak frame is structurally and semantically correct before using it. Frames encode governance constraints as symbol sequences — mode first, then domain, action, and entity.

```jsonc
// Tool call: ps_validate
{
  "name": "ps_validate",
  "arguments": {
    "frame": "⊕◊▶α",
    "validationLevel": "full"
  }
}
```

```jsonc
// Response
{
  "valid": true,
  "frame": "⊕◊▶α",
  "parsedFrame": {
    "mode": { "symbol": "⊕", "meaning": "strict" },
    "domain": { "symbol": "◊", "meaning": "financial" },
    "action": { "symbol": "▶", "meaning": "execute" },
    "entity": { "symbol": "α", "meaning": "primary" }
  },
  "parseConfidence": 1.0,
  "report": {
    "valid": true,
    "errors": [],
    "warnings": [
      { "code": "ACTION_MISSING_DOMAIN", "message": "Consider adding domain context", "severity": "warning" }
    ]
  },
  "summary": { "errors": 0, "warnings": 1, "passed": 16 }
}
```

Invalid frames return actionable suggestions:

```jsonc
// Tool call: validate a frame with conflicting modes
{
  "name": "ps_validate",
  "arguments": { "frame": "⊕⊖▶", "validationLevel": "semantic" }
}

// Response: blocked — strict + flexible modes conflict
{
  "valid": false,
  "summary": { "errors": 1, "warnings": 0, "passed": 10 },
  "suggestions": ["Remove either ⊕ (strict) or ⊖ (flexible) - cannot have both"]
}
```

### 2. Hold queue workflow — human-in-the-loop approval

When an agent attempts a risky operation (high drift score, low confidence, security finding), the action is held for human review instead of executing. This is the full hold lifecycle: list, inspect, approve or reject.

**Step 1: List pending holds**

```jsonc
// Tool call: ps_hold_list
{
  "name": "ps_hold_list",
  "arguments": {}
}
```

```jsonc
// Response: one hold awaiting human review
{
  "holds": [
    {
      "holdId": "hold_7k2m9x",
      "agentId": "devops-agent",
      "frame": "⊕◈▶α",
      "tool": "deploy_to_production",
      "severity": "high",
      "reason": "drift_prediction",
      "state": "pending",
      "evidence": { "driftScore": 0.72, "predictedDrift": 0.85 }
    }
  ],
  "count": 1,
  "expiredCount": 0
}
```

**Step 2: Approve with modifications (or reject)**

```jsonc
// Tool call: ps_hold_approve — approve but downgrade to staging
{
  "name": "ps_hold_approve",
  "arguments": {
    "holdId": "hold_7k2m9x",
    "reason": "Reviewed — safe for staging, not production",
    "modifiedArgs": { "environment": "staging" }
  }
}
```

```jsonc
// Response
{
  "success": true,
  "decision": {
    "holdId": "hold_7k2m9x",
    "state": "approved",
    "decidedBy": "human",
    "reason": "Reviewed — safe for staging, not production"
  },
  "executionResult": { "success": true }
}
```

To reject instead:

```jsonc
{
  "name": "ps_hold_reject",
  "arguments": {
    "holdId": "hold_7k2m9x",
    "reason": "Drift too high — recalibrate agent first",
    "haltAgent": true
  }
}
// Agent is halted (circuit breaker tripped) and the operation is denied.
```

### 3. Security scanning — catch vulnerabilities before execution

Scan code content for security issues before an agent writes it to disk. Critical findings block execution; high-severity findings are held for human review.

```jsonc
// Tool call: ps_security_scan
{
  "name": "ps_security_scan",
  "arguments": {
    "content": "const query = `SELECT * FROM users WHERE id = ${userId}`;\nconst API_KEY = 'sk-1234567890abcdef1234567890abcdef';"
  }
}
```

```jsonc
// Response: two findings — one critical (blocked), one critical (blocked)
{
  "findings": [
    {
      "patternId": "sql-injection",
      "severity": "critical",
      "match": "SELECT * FROM users WHERE id = ${userId}",
      "line": 1,
      "context": "const query = `SELECT * FROM users WHERE id = ${userId}`;",
      "suggestion": "Use parameterized queries or prepared statements instead of template literals"
    },
    {
      "patternId": "hardcoded-secret",
      "severity": "critical",
      "match": "API_KEY = 'sk-1234567890abcdef1234567890abcdef'",
      "line": 2,
      "context": "const API_KEY = 'sk-1234567890abcdef1234567890abcdef';",
      "suggestion": "Move secrets to environment variables or a secrets manager"
    }
  ],
  "scannedAt": "2026-03-19T12:00:00.000Z",
  "contentLength": 98,
  "patternsChecked": 10,
  "enforcement": {
    "blocked": [
      { "patternId": "sql-injection", "severity": "critical" },
      { "patternId": "hardcoded-secret", "severity": "critical" }
    ],
    "held": [],
    "warned": [],
    "logged": []
  }
}
```

Use `ps_security_gate` instead of `ps_security_scan` to enforce the policy — it blocks on critical, holds high-severity for human review, and warns on medium:

```jsonc
// Tool call: ps_security_gate — scan AND enforce
{
  "name": "ps_security_gate",
  "arguments": {
    "content": "app.use(cors());\napp.listen(0.0.0.0, 3000);",
    "action": "write_file"
  }
}

// Response: held for review (insecure defaults = high severity)
{
  "decision": "held",
  "reason": "Security: 1 high-severity finding(s) held for review — insecure-defaults",
  "scan": { "findings": [{ "patternId": "insecure-defaults", "severity": "high", "line": 1 }] }
}
```


## Hosted deployment

A hosted deployment is available on [Fronteir AI](https://fronteir.ai/mcp/chrbailey-promptspeak-mcp-server).

## How it works: 9-stage validation pipeline

Every tool call passes through this pipeline. If any stage fails, execution is blocked.

```
Agent calls tool
  │
  ├─ 1. Circuit Breaker ──── Halted agents blocked instantly (no further checks)
  ├─ 2. Frame Validation ─── Structural, semantic, and chain rule checks
  ├─ 3. Drift Prediction ─── Pre-flight behavioral anomaly detection
  ├─ 4. Hold Check ────────── Risky operations held for human approval
  ├─ 5. Interceptor ───────── Final permission gate (confidence thresholds)
  ├─ 6. Security Scan ─────── Scans write actions for vulnerabilities (see below)
  ├─ 7. Tool Execution ────── Only reached if all 6 pre-checks pass
  ├─ 8. Post-Audit ────────── Confirms behavior matched prediction
  └─ 9. Immediate Action ──── Halts agent if critical drift detected post-execution
```

Stages 1-6 are **pre-execution** — the tool never runs if any check fails. Stages 8-9 are **post-execution** — they detect drift and can halt the agent for future calls.


## Security scanning

When an agent writes code (`write_file`, `edit_file`, `create_file`, `patch_file`), the content is scanned against 10 detection patterns before execution. Severity determines enforcement:

| Severity | Enforcement | What it catches |
|----------|-------------|-----------------|
| **CRITICAL** | **Blocked** — execution denied | SQL injection via template literals, hardcoded API keys/passwords/tokens |
| **HIGH** | **Held** — queued for human review | Security-related TODOs, logging sensitive data, insecure defaults (`cors()`, `0.0.0.0`, `debug: true`) |
| **MEDIUM** | **Warned** — logged, execution continues | Empty catch blocks, hedging comments ("probably works"), disabled tests |
| **LOW** | **Logged** — no enforcement | `DROP TABLE`, `rm -rf` (flagged for awareness) |

### What works (tested)

All claims below are backed by passing tests (104 tests across 5 test files):

- **Pattern detection works.** Each of the 10 patterns is tested for true positives AND false positives. Example: `api_key = "sk-1234567890abcdef"` is caught; `API_KEY = process.env.API_KEY` is not. SQL injection catches `\`SELECT * FROM users WHERE id = ${id}\`` but not parameterized queries (`db.query("SELECT * FROM users WHERE id = ?", [id])`).
- **Severity enforcement works.** Critical findings block execution. High findings hold for review. Medium findings warn but allow. Tested end-to-end through the interceptor pipeline.
- **Only write actions are scanned.** `read_file` and other non-write actions pass through without scanning, even if their arguments contain vulnerable code. Tested.
- **Runtime configuration works.** Patterns can be enabled/disabled and severity can be changed at runtime via `ps_security_config`. A disabled pattern stops firing immediately. Changing a pattern from medium to critical makes it block instead of warn. Tested end-to-end.
- **Performance is fine.** 100-line file scans complete in under 10ms. Tested.
- **Multiple findings in one file work.** A file with 6 different vulnerability types correctly classifies each into the right severity bucket. Tested.

### What does NOT work yet

- ~~**No hold queue integration for HIGH findings.**~~ **FIXED.** HIGH-severity security findings now create real holds in HoldManager via `security_finding` HoldReason. They appear in `ps_hold_list` and can be approved/rejected through the normal hold flow.
- **No auto-scan on `ps_execute`.** The security scan only triggers in the interceptor's `intercept()` method for direct tool calls. If an agent uses `ps_execute` (the governed execution path), the scan runs only if the inner tool is a write action AND the content is passed as a top-level arg. Nested argument structures may bypass scanning. **Why:** `ps_execute` wraps tool calls in its own argument schema; the scanner checks `proposedArgs.content`, not deeply nested fields.
- **No file-path-based scanning.** The scanner only examines content passed as arguments. It cannot scan files already on disk — it doesn't read from the filesystem. **Why:** The scanner is a pure function that takes a string. Adding filesystem access would change the security model.
- **Patterns are regex-based, not AST-aware.** The patterns use regular expressions, which means they can't understand code structure. A hardcoded secret inside a test fixture or a SQL injection in a comment will still trigger. False positive rates range from 25-70% depending on the pattern (documented per-pattern). **Why:** AST parsing would add dependencies and complexity. Regex is fast and good enough for a governance layer that holds for human review rather than silently blocking.
- **Partial persistence.** Holds and circuit breaker state now persist to SQLite (`data/governance.db`) and survive server restarts. However, pattern configuration changes (enable/disable, severity changes via `ps_security_config`) are still in-memory only and reset on restart. **Why:** Pattern config is lightweight and rarely changed; full config persistence would need a separate config store.


## MCP tools (56)

### Core governance

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_validate` | Before executing any agent action | Validate a frame against all rules without executing |
| `ps_validate_batch` | When checking multiple actions at once | Batch validation for efficiency |
| `ps_execute` | When an agent wants to perform a tool call | Full pipeline: validate → hold check → execute → audit |
| `ps_execute_dry_run` | When previewing what would happen | Run full pipeline without executing the tool |

### Human-in-the-loop holds

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_hold_list` | When reviewing pending agent actions | List all operations awaiting human approval |
| `ps_hold_approve` | When a held operation should proceed | Approve with optional modified arguments |
| `ps_hold_reject` | When a held operation should be denied | Reject with reason |
| `ps_hold_config` | When tuning which operations require approval | Configure hold triggers and thresholds |
| `ps_hold_stats` | When monitoring hold queue health | Hold queue statistics |

### Agent lifecycle

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_state_get` | When checking what an agent is doing | Get agent's active frame and last action |
| `ps_state_system` | When monitoring overall system health | System-wide statistics |
| `ps_state_halt` | When an agent must be stopped immediately | Trip circuit breaker — blocks all future calls |
| `ps_state_resume` | When a halted agent should be allowed to continue | Reset circuit breaker |
| `ps_state_reset` | When clearing agent state | Full state reset |
| `ps_state_drift_history` | When investigating behavioral changes | Drift detection alert history |

### Delegation

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_delegate` | When an agent spawns a sub-agent | Create parent→child delegation with constrained permissions |
| `ps_delegate_revoke` | When revoking a sub-agent's authority | Remove delegation |
| `ps_delegate_list` | When auditing delegation chains | List active delegations |

### Configuration

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_config_set` | When changing governance rules at runtime | Set configuration key-value pairs |
| `ps_config_get` | When reading current configuration | Get current config |
| `ps_config_activate` | When switching policy profiles | Activate a named configuration |
| `ps_config_export` | When backing up configuration | Export full config as JSON |
| `ps_config_import` | When restoring configuration | Import config from JSON |
| `ps_confidence_set` | When tuning validation strictness | Set confidence thresholds |
| `ps_confidence_get` | When checking current thresholds | Get current thresholds |
| `ps_confidence_bulk_set` | When reconfiguring multiple thresholds | Batch threshold update |
| `ps_feature_set` | When toggling pipeline stages | Enable/disable specific checks |
| `ps_feature_get` | When checking which stages are active | Get feature flags |

### Symbol registry (entity tracking)

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_symbol_create` | When registering a new entity (company, person, system) | Create symbol with type, metadata, and tags |
| `ps_symbol_get` | When looking up an entity | Retrieve by ID |
| `ps_symbol_update` | When entity data changes | Update metadata or tags |
| `ps_symbol_list` | When browsing entities by type | List with optional type filter |
| `ps_symbol_delete` | When removing an entity | Delete by ID |
| `ps_symbol_import` | When bulk-loading entities | Batch import |
| `ps_symbol_stats` | When monitoring registry health | Registry statistics |
| `ps_symbol_format` | When displaying an entity | Format symbol for display |
| `ps_symbol_verify` | When confirming entity data is current | Mark symbol as verified |
| `ps_symbol_list_unverified` | When auditing stale data | List symbols needing verification |
| `ps_symbol_add_alternative` | When an entity has aliases | Add alternative identifier |

### Security enforcement

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_security_scan` | When checking code for vulnerabilities | Scan content, return findings by severity |
| `ps_security_gate` | When enforcing security policy on writes | Scan + enforce: block/hold/warn/allow |
| `ps_security_config` | When tuning detection patterns | List, enable, disable, change severity of patterns |

### Audit

| Tool | When to call it | What it does |
|------|----------------|--------------|
| `ps_audit_get` | When reviewing what happened | Full audit trail with filters |


## Architecture

```
src/
├── gatekeeper/       # 8-stage validation pipeline (core enforcement)
│   ├── index.ts      #   Pipeline orchestrator + agent eviction policy
│   ├── validator.ts  #   Frame structural/semantic/chain validation
│   ├── interceptor.ts#   Permission gate with confidence thresholds
│   ├── hold-manager.ts#  Human-in-the-loop hold queue
│   ├── resolver.ts   #   Frame resolution with operator overrides
│   └── coverage.ts   #   Coverage confidence calculator
├── drift/            # Behavioral drift detection
│   ├── circuit-breaker.ts  # Per-agent halt/resume
│   ├── baseline.ts         # Behavioral baseline comparison
│   ├── tripwire.ts         # Anomaly tripwires
│   └── monitor.ts          # Continuous monitoring
├── security/         # Security vulnerability scanning
│   ├── patterns.ts   #   10 detection patterns (regex-based)
│   └── scanner.ts    #   Scanner engine + severity classification
├── persistence/      # SQLite governance persistence
│   └── database.ts   #   Holds, decisions, circuit breakers (WAL mode)
├── symbols/          # SQLite-backed entity registry (11 CRUD tools)
├── policies/         # Policy file loader + overlay system
├── operator/         # Operator configuration
├── tools/            # MCP tool implementations
│   ├── registry.ts   #   29 core tools
│   ├── ps_hold.ts    #   5 hold tools
│   └── ps_security.ts#   3 security tools
├── handlers/         # Tool dispatch + metadata registry
├── core/             # Logging, errors, result patterns
└── server.ts         # MCP server entry point (stdio transport)
```


## Performance

PromptSpeak adds governance to every tool call with sub-millisecond overhead. Benchmarked on Apple M2 Pro, Node.js 22, Vitest 4.0:

### Latency (pre-execution check, 1000 iterations)

| Percentile | Latency |
|-----------|---------|
| Average | **0.164ms** |
| P95 | 0.368ms |
| P99 | 1.183ms |
| Full execution path P95 | **0.074ms** |

### Throughput (concurrent operations)

| Operation | Rate |
|-----------|------|
| Circuit breaker checks (1000 concurrent) | **6,173 ops/sec** |
| Hold creation | **55,556 holds/sec** |
| Hold approval/rejection | **200,000+/sec** |
| Mixed operations (halt + hold + allow) | **6,818 ops/sec** |

### Stress Tests

| Test | Result |
|------|--------|
| 1000 concurrent blocked executions | 162ms total, all blocked correctly |
| 100 rapid halt/resume cycles | 100% correct state transitions |
| 500 agents with mixed states | 250 blocked, 250 allowed — zero misclassification |
| Memory under sustained load (1000 ops) | **Negative delta** (-11.76 MB, GC reclaimed) |

### Suite

| Metric | Value |
|--------|-------|
| Test count | **829 tests** across 33 files |
| Test duration | **1.11s** total |
| Categories | Unit, integration, stress, security, grammar |


## Requirements

- Node.js >= 20.0.0
- TypeScript 5.3+ (build from source)
- No external services required — SQLite for symbols and governance persistence


## Related Projects

- **[deeptrend](https://github.com/chrbailey/deeptrend)** — Structured AI trend feed for autonomous agents. Curated from 14+ sources, synthesized via LLM Counsel, published every 6h as JSON Feed, RSS, and `llms.txt`. Designed as a data source for agent monitoring pipelines.


## Privacy Policy

[https://promptspeak.admin-as-a-service.com/privacy](https://promptspeak.admin-as-a-service.com/privacy)

PromptSpeak does not collect personal data, has no telemetry, and stores all governance data locally in SQLite. See the full policy at the link above.


## Data Processing Terms

[https://promptspeak.admin-as-a-service.com/dpa](https://promptspeak.admin-as-a-service.com/dpa)

Standard data processing terms for platform integrations (e.g., Anthropic Connectors). PromptSpeak acts as a data processor; no sub-processors, no external data transmission.


## License

MIT
