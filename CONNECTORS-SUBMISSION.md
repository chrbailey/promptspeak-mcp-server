# Anthropic Connectors Directory — Submission Prep

**Form URL**: https://docs.google.com/forms/d/e/1FAIpQLSeafJF2NDI7oYx1r8o0ycivCSVLNq92Mpc1FPxMKSw1CzDkqA/viewform

**Status**: Ready to submit (all requirements met as of 2026-03-19)

## Submission Answers

### Server Name
PromptSpeak

### Server Description
Pre-execution governance for AI agents. Validates every MCP tool call against deterministic rules, detects behavioral drift, and holds risky operations for human approval — in 0.1ms, before anything executes. 56 governance tools including human-in-the-loop holds, circuit breakers, security scanning, delegation chains, and full audit trail.

### Server URL (Streamable HTTP endpoint)
https://promptspeak.admin-as-a-service.com/mcp

### GitHub Repository
https://github.com/chrbailey/promptspeak-mcp-server

### npm Package
https://www.npmjs.com/package/@chrbailey/promptspeak-mcp-server

### Privacy Policy URL
https://promptspeak.admin-as-a-service.com/privacy

### Data Processing Terms URL
https://promptspeak.admin-as-a-service.com/dpa

### Authentication
No authentication required (authless). Optional Bearer token auth available via PS_API_KEYS environment variable.

### Tool Count
56 tools with safety annotations (30 read-only, 24 destructive, 2 additive)

### Categories / Use Cases
- AI agent governance and safety
- Human-in-the-loop approval workflows
- Behavioral drift detection
- Security vulnerability scanning for code writes
- Audit trail and compliance
- Regulated domains (legal, financial, healthcare)

### Contact Email
chris@erpaccess.com

---

## Checklist

- [x] Privacy policy live at /privacy
- [x] Data processing terms live at /dpa
- [x] Safety annotations on all 56 tools
- [x] Streamable HTTP endpoint at /mcp (stateless, per-request transport)
- [x] 4 usage examples in README
- [x] npm package published (@chrbailey/promptspeak-mcp-server@0.4.1)
- [x] GitHub repo public (chrbailey/promptspeak-mcp-server)
- [x] 829 tests passing
- [x] HTTPS via Cloudflare Tunnel

## IP Allowlisting Note

PromptSpeak runs behind a Cloudflare Tunnel (tunnel ID 401f738a):
- Claude → Cloudflare edge → Cloudflare Tunnel → Mac Mini :3000
- Traffic flows through Cloudflare's network, not directly from Claude's IPs
- The tunnel is already authenticated and secure
- IP allowlisting at the origin server level is **not required** because Cloudflare Tunnel doesn't expose the origin — Cloudflare's edge handles all inbound connections
- If Anthropic requires explicit IP allowlisting, it would be at the Cloudflare WAF level (Access rules), not at the origin. Check the submission form for specific instructions.

## Post-Submission

After submitting, the DPA and privacy pages need to remain accessible. The HTTP server (com.promptspeak.ops-center plist) must stay running. Rebuild and restart the server to pick up the new /dpa route:

```bash
cd "/Volumes/OWC drive/Dev/promptspeak/mcp-server"
npm run build
# Restart the launchd service:
launchctl kickstart -k gui/$(id -u)/com.promptspeak.ops-center
```
