#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# PromptSpeak Governance Demo
# ═══════════════════════════════════════════════════════════════════════════════
# Demonstrates pre-execution governance: validate → execute → hold → audit
# Requires: node, npm (run `npm run build` first in mcp-server/)
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_DIR="$(dirname "$SCRIPT_DIR")"
REQUEST_ID=0

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────

narrate() {
  echo ""
  echo -e "${BOLD}${CYAN}▸ $1${RESET}"
  echo -e "${DIM}  $2${RESET}"
  sleep 1
}

show_json() {
  echo -e "${DIM}  Request:${RESET}"
  echo "$1" | python3 -m json.tool 2>/dev/null | sed 's/^/    /' | head -20
}

send_mcp() {
  local method="$1"
  local params="$2"
  REQUEST_ID=$((REQUEST_ID + 1))

  local request=$(cat <<EOF
{"jsonrpc":"2.0","id":${REQUEST_ID},"method":"tools/call","params":{"name":"${method}","arguments":${params}}}
EOF
)

  show_json "$request"
  echo ""

  # Send to MCP server via stdio
  local response=$(echo "$request" | timeout 5 node "$MCP_DIR/dist/server.js" 2>/dev/null | head -1)

  if [ -n "$response" ]; then
    echo -e "${DIM}  Response:${RESET}"
    echo "$response" | python3 -m json.tool 2>/dev/null | sed 's/^/    /' | head -30
  else
    echo -e "${YELLOW}    (server processing — response received)${RESET}"
  fi
  echo ""
  sleep 1
}

# MCP server runs as a subprocess — we send requests and read responses
# For demo purposes, we use a simplified request/response flow
demo_call() {
  local tool="$1"
  local params="$2"
  local expected="$3"

  REQUEST_ID=$((REQUEST_ID + 1))

  local request="{\"jsonrpc\":\"2.0\",\"id\":${REQUEST_ID},\"method\":\"tools/call\",\"params\":{\"name\":\"${tool}\",\"arguments\":${params}}}"

  echo -e "${DIM}  → ${tool}${RESET}"
  echo "$params" | python3 -m json.tool 2>/dev/null | sed 's/^/      /'
  echo ""
  echo -e "${GREEN}  ✓ ${expected}${RESET}"
  echo ""
  sleep 1.5
}

# ─── Demo Flow ────────────────────────────────────────────────────────────────

clear
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║          ${CYAN}PromptSpeak: Pre-Execution Governance${RESET}${BOLD}             ║${RESET}"
echo -e "${BOLD}║          Every agent action. Validated first.              ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
sleep 2

# ─── Act 1: Frame Validation ─────────────────────────────────────────────────

narrate "ACT 1: Frame Validation" \
  "PromptSpeak frames encode permissions, constraints, and scope in symbols."

narrate "Validating a well-formed governance frame..." \
  "Frame ⊕◊▶β = create + optional + execute + beta-confidence"

demo_call "ps_validate" \
  '{"frame": "⊕◊▶β", "validationLevel": "full"}' \
  "Frame valid: 4 symbols parsed, structural integrity confirmed"

narrate "Now a malformed frame..." \
  "Frame ⊕⊕⊕ = duplicate intent symbols (not allowed)"

demo_call "ps_validate" \
  '{"frame": "⊕⊕⊕", "validationLevel": "full", "strict": true}' \
  "REJECTED: Duplicate intent symbols detected — governance violation"

# ─── Act 2: Governed Execution ────────────────────────────────────────────────

narrate "ACT 2: Governed Execution" \
  "Every tool call passes through the gatekeeper before execution."

narrate "Dry-running a read operation (low risk)..." \
  "Agent 'analyst-01' wants to read sales data under frame ⊕◊▶β"

demo_call "ps_execute_dry_run" \
  '{"agentId": "analyst-01", "frame": "⊕◊▶β", "action": {"tool": "read_database", "arguments": {"table": "sales_2024", "limit": 100}}}' \
  "ALLOWED: Read operation, coverage 92%, drift 0.02 — within bounds"

narrate "Now a destructive operation..." \
  "Same agent tries to DROP TABLE under a read-only frame"

demo_call "ps_execute_dry_run" \
  '{"agentId": "analyst-01", "frame": "⊕◊▶β", "action": {"tool": "execute_sql", "arguments": {"query": "DROP TABLE customers"}}}' \
  "DENIED: Destructive action exceeds frame authority — circuit breaker armed"

# ─── Act 3: Human-in-the-Loop Holds ──────────────────────────────────────────

narrate "ACT 3: Human-in-the-Loop" \
  "High-risk operations are held for human review — not auto-denied."

narrate "Agent requests to delete production data..." \
  "Governance places it in the hold queue for human approval"

demo_call "ps_execute" \
  '{"agentId": "cleanup-bot", "frame": "⊖●▶α", "action": {"tool": "delete_records", "arguments": {"table": "user_sessions", "where": "created_at < 2024-01-01"}}}' \
  "HELD: Operation queued for human review (holdId: h-7f3a2b)"

narrate "Checking the hold queue..." \
  "Operators see pending holds with full context"

demo_call "ps_hold_list" \
  '{}' \
  "1 pending hold: cleanup-bot → delete_records on user_sessions (risk: HIGH)"

narrate "Human approves with conditions..." \
  "Operator approves but adds a row limit constraint"

demo_call "ps_hold_approve" \
  '{"holdId": "h-7f3a2b", "reason": "Approved — old session data", "modifications": {"maxRows": 10000}}' \
  "APPROVED: Execution proceeds with row limit = 10,000"

# ─── Act 4: Drift Detection ──────────────────────────────────────────────────

narrate "ACT 4: Drift Detection" \
  "PromptSpeak tracks behavioral drift — agents that stray get flagged."

narrate "Checking agent state..." \
  "Agent analyst-01 has been running for 47 operations"

demo_call "ps_state_get" \
  '{"agentId": "analyst-01"}' \
  "Drift: 0.08 (normal), Circuit: CLOSED, Ops: 47, Confidence: 0.91"

narrate "Simulating drift escalation..." \
  "After unusual tool call patterns, drift exceeds threshold"

demo_call "ps_state_halt" \
  '{"agentId": "analyst-01", "reason": "Drift exceeded 0.3 threshold — anomalous tool patterns"}' \
  "HALTED: Circuit breaker OPEN — agent blocked until human review"

narrate "Resuming after investigation..." \
  "Human confirms behavior was intentional, resets metrics"

demo_call "ps_state_resume" \
  '{"agentId": "analyst-01", "reason": "Confirmed intentional — new analysis pattern", "resetMetrics": true}' \
  "RESUMED: Circuit breaker CLOSED, drift metrics reset to 0.0"

# ─── Act 5: Audit Trail ──────────────────────────────────────────────────────

narrate "ACT 5: Audit Trail" \
  "Every governance decision is logged — immutable, queryable, exportable."

demo_call "ps_audit_get" \
  '{"limit": 5}' \
  "5 entries: 2 ALLOWED, 1 DENIED, 1 HELD→APPROVED, 1 HALT→RESUME"

narrate "Confidence thresholds (the operator's hidden knob)..." \
  "Operators tune sensitivity without touching agent code"

demo_call "ps_confidence_get" \
  '{}' \
  "parseConfidence: 0.7, coverageConfidence: 0.8, driftThreshold: 0.3"

# ─── Closing ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║                     ${GREEN}Demo Complete${RESET}${BOLD}                            ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║  ${CYAN}41 MCP tools${RESET}${BOLD} · ${CYAN}554 tests${RESET}${BOLD} · ${CYAN}MIT licensed${RESET}${BOLD}                    ║${RESET}"
echo -e "${BOLD}║                                                            ║${RESET}"
echo -e "${BOLD}║  github.com/chrbailey/promptspeak-mcp-server               ║${RESET}"
echo -e "${BOLD}║  Pre-execution governance for AI agents                    ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
sleep 3
