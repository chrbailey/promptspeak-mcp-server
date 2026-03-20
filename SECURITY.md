# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x | Yes |
| < 0.4 | No |

## Reporting a Vulnerability

PromptSpeak is a governance layer for AI agents. We take security seriously.

**Do not open a public issue for security vulnerabilities.**

Email: **ahgen.topps@erp-access.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could achieve)
- Suggested fix (if you have one)

You will receive an acknowledgment within 48 hours. We aim to release a patch within 7 days for critical issues.

## Scope

The following are in scope:
- Bypass of frame validation (allowing invalid frames to execute)
- Bypass of circuit breaker (allowing halted agents to execute)
- Hold queue manipulation (approving holds without authorization)
- Security scanner evasion (code with known vulnerabilities passing scan)
- Drift detection bypass
- SQLite injection in governance persistence layer

The following are out of scope:
- Denial of service against the MCP server itself
- Issues requiring physical access to the host machine
- Social engineering

## Security Architecture

PromptSpeak's security model is defense-in-depth:

1. **Circuit Breaker** — Halted agents are blocked before any validation runs
2. **Frame Validation** — Structural, semantic, and chain validation
3. **Drift Detection** — Behavioral deviation triggers automatic halt
4. **Hold Queue** — Human-in-the-loop approval for high-risk operations
5. **Security Scanner** — Static analysis for SQL injection, hardcoded secrets, insecure defaults
6. **Audit Trail** — Every tool call logged with decision and reason

All governance data is stored locally in SQLite. No telemetry. No external services.
