# PromptSpeak MCP Server

Pre-execution governance layer for AI agents, implemented as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server.

**What it does:** Intercepts every agent tool call before execution, validates against deterministic rules, and blocks or holds risky operations for human approval — in under 0.12ms.

## Install

```bash
npm install
npm run build
```

## Test

```bash
npm test          # ~490 tests
npm run test:stress  # Concurrent load tests
```

## Run

```bash
npm start         # Start MCP server via stdio
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "promptspeak": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/server.js"]
    }
  }
}
```

## Validation Pipeline

Every tool call passes through 5 stages:

1. **Circuit Breaker** — Halted agents blocked immediately (no further checks)
2. **Frame Validation** — Structural, semantic, and chain rule checks
3. **Drift Detection** — Behavioral anomaly detection against baseline
4. **Hold Manager** — Risky operations held for human approval
5. **Interceptor** — Final permission gate

If any stage fails, the tool call is blocked before execution.

## MCP Tools (25+)

| Category | Tools | Purpose |
|----------|-------|---------|
| Governance | `ps_validate`, `ps_execute`, `ps_execute_dry_run` | Core validation and execution |
| Holds | `ps_hold_list`, `ps_hold_approve`, `ps_hold_reject` | Human-in-the-loop approvals |
| State | `ps_state_halt`, `ps_state_resume`, `ps_drift_history` | Agent lifecycle control |
| Config | `ps_config_set`, `ps_config_get`, `ps_feature_set` | Runtime configuration |
| Symbols | `ps_symbol_create`, `ps_symbol_get`, `ps_symbol_list` | Entity registry |
| Audit | `ps_audit_get` | Compliance audit trail |

## Architecture

```
src/
├── gatekeeper/       # 5-stage validation pipeline
├── drift/            # Circuit breaker, tripwire, baseline monitoring
├── symbols/          # SQLite-backed entity registry
├── policies/         # Policy file loader + overlay system
├── operator/         # Operator configuration
├── tools/            # MCP tool implementations
├── handlers/         # Tool dispatch + metadata registry
└── core/             # Logging, errors, result patterns, utilities
```

## Performance

| Metric | Value |
|--------|-------|
| Validation latency | 0.103ms avg (P95: 0.121ms) |
| Operations/second | 6,977 |
| Holds/second | 33,333 |
| Test coverage | ~490 tests, 14 test files |

## Requirements

- Node.js ≥ 20.0.0
- TypeScript 5.3+

## License

MIT License. See [LICENSE](../LICENSE).
