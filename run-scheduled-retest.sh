#!/bin/bash
# =============================================================================
# Scheduled Retest Runner
# =============================================================================
# This script runs the Legal MVP test suite and logs output.
# Scheduled to run 24 hours after initial test to allow CourtListener quota reset.
# =============================================================================

LOG_DIR="/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date "+%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/retest_${TIMESTAMP}.log"

cd "/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server"

echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"
echo "SCHEDULED RETEST STARTED: $(date)" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"

# Run the test suite
/usr/local/bin/npx tsx scheduled-retest.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"
echo "COMPLETED: $(date) | Exit Code: $EXIT_CODE" >> "$LOG_FILE"
echo "═══════════════════════════════════════════════════════════════════════════════" >> "$LOG_FILE"

# Send notification (macOS)
if [ $EXIT_CODE -eq 0 ]; then
    osascript -e 'display notification "All tests passed! Check scheduled-retest-report.md" with title "Legal MVP Retest ✅"' 2>/dev/null || true
elif [ $EXIT_CODE -eq 2 ]; then
    osascript -e 'display notification "API errors detected - quota may still be limited" with title "Legal MVP Retest ⚠️"' 2>/dev/null || true
else
    osascript -e 'display notification "Some tests failed - check the report" with title "Legal MVP Retest ❌"' 2>/dev/null || true
fi

exit $EXIT_CODE
