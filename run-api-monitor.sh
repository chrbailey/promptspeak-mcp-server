#!/bin/bash
# =============================================================================
# CourtListener API Monitor Runner
# =============================================================================

LOG_DIR="/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date "+%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/monitor_${TIMESTAMP}.log"

cd "/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server"

echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"
echo "API MONITOR CHECK: $(date)" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"

/usr/local/bin/npx tsx monitor-courtlistener.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "" >> "$LOG_FILE"
echo "Exit Code: $EXIT_CODE" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"

# Clean up old monitor logs (keep last 48)
cd "$LOG_DIR"
ls -t monitor_*.log 2>/dev/null | tail -n +49 | xargs rm -f 2>/dev/null

exit $EXIT_CODE
