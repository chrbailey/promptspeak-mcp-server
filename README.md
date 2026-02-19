# promptspeak-mcp-server

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

Restart Claude Code. All 45 governance tools are immediately available.

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

All claims below are backed by passing tests (95 tests across 4 test files):

- **Pattern detection works.** Each of the 10 patterns is tested for true positives AND false positives. Example: `api_key = "sk-1234567890abcdef"` is caught; `API_KEY = process.env.API_KEY` is not. SQL injection catches `\`SELECT * FROM users WHERE id = ${id}\`` but not parameterized queries (`db.query("SELECT * FROM users WHERE id = ?", [id])`).
- **Severity enforcement works.** Critical findings block execution. High findings hold for review. Medium findings warn but allow. Tested end-to-end through the interceptor pipeline.
- **Only write actions are scanned.** `read_file` and other non-write actions pass through without scanning, even if their arguments contain vulnerable code. Tested.
- **Runtime configuration works.** Patterns can be enabled/disabled and severity can be changed at runtime via `ps_security_config`. A disabled pattern stops firing immediately. Changing a pattern from medium to critical makes it block instead of warn. Tested end-to-end.
- **Performance is fine.** 100-line file scans complete in under 10ms. Tested.
- **Multiple findings in one file work.** A file with 6 different vulnerability types correctly classifies each into the right severity bucket. Tested.

### What does NOT work yet

- **No hold queue integration for HIGH findings.** The interceptor blocks HIGH-severity findings (returns `allowed: false`) but does not create an actual hold in the HoldManager. This means `ps_hold_list` won't show security holds, and there's no approve/reject flow for them. The `ps_security_gate` tool reports `decision: "held"` but this is informational only — there's no pending hold to act on. **Why:** Wiring into HoldManager requires an `ExecuteRequest` object and a `HoldReason` type extension. Both are doable but weren't in scope for the initial implementation.
- **No auto-scan on `ps_execute`.** The security scan only triggers in the interceptor's `intercept()` method for direct tool calls. If an agent uses `ps_execute` (the governed execution path), the scan runs only if the inner tool is a write action AND the content is passed as a top-level arg. Nested argument structures may bypass scanning. **Why:** `ps_execute` wraps tool calls in its own argument schema; the scanner checks `proposedArgs.content`, not deeply nested fields.
- **No file-path-based scanning.** The scanner only examines content passed as arguments. It cannot scan files already on disk — it doesn't read from the filesystem. **Why:** The scanner is a pure function that takes a string. Adding filesystem access would change the security model.
- **Patterns are regex-based, not AST-aware.** The patterns use regular expressions, which means they can't understand code structure. A hardcoded secret inside a test fixture or a SQL injection in a comment will still trigger. False positive rates range from 25-70% depending on the pattern (documented per-pattern). **Why:** AST parsing would add dependencies and complexity. Regex is fast and good enough for a governance layer that holds for human review rather than silently blocking.
- **No persistence.** Pattern configuration changes (enable/disable, severity changes) are in-memory only. They reset when the server restarts. **Why:** The rest of PromptSpeak's config is also in-memory. Persistence would need the SQLite layer or a config file, neither of which was in scope.


## MCP tools (45)

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

| Metric | Value |
|--------|-------|
| Validation latency | 0.103ms avg (P95: 0.121ms) |
| Operations/second | 6,977 |
| Holds/second | 33,333 |
| Security scan (100 lines) | < 10ms |
| Test suite | 658 tests, 21 test files |


## Requirements

- Node.js >= 20.0.0
- TypeScript 5.3+ (build from source)
- No external services required — SQLite for symbols, in-memory for everything else


## Related Projects

- **[deeptrend](https://github.com/chrbailey/deeptrend)** — Structured AI trend feed for autonomous agents. Curated from 14+ sources, synthesized via LLM Counsel, published every 6h as JSON Feed, RSS, and `llms.txt`. Designed as a data source for agent monitoring pipelines.


## License

MIT
