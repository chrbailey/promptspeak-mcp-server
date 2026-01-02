#!/bin/bash
# =============================================================================
# RETEST MANAGER - Control Legal MVP retest and API monitoring
# =============================================================================
# Usage:
#   ./retest-manager.sh status   - Check API monitor and job status
#   ./retest-manager.sh run      - Run tests immediately (manual trigger)
#   ./retest-manager.sh monitor  - Check API once immediately
#   ./retest-manager.sh stop     - Stop all scheduled jobs
#   ./retest-manager.sh start    - Start API monitoring
#   ./retest-manager.sh results  - View latest results
#   ./retest-manager.sh logs     - View execution logs
# =============================================================================

MONITOR_PLIST="$HOME/Library/LaunchAgents/com.promptspeak.api-monitor.plist"
RETEST_PLIST="$HOME/Library/LaunchAgents/com.promptspeak.legal-retest.plist"
SCRIPT_DIR="/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server"
STATUS_FILE="$SCRIPT_DIR/logs/api-monitor-status.json"

case "$1" in
    status)
        echo "╔═══════════════════════════════════════════════════════════════╗"
        echo "║           LEGAL MVP - STATUS DASHBOARD                        ║"
        echo "╚═══════════════════════════════════════════════════════════════╝"
        echo ""

        echo "🔄 API MONITOR:"
        if launchctl list 2>/dev/null | grep -q "com.promptspeak.api-monitor"; then
            echo "   ✅ Running (checks every hour at :00)"
        else
            echo "   ❌ Not running"
            echo "   Run: ./retest-manager.sh start"
        fi

        if [ -f "$STATUS_FILE" ]; then
            echo ""
            LAST_STATUS=$(cat "$STATUS_FILE" | grep -o '"lastStatus":[0-9]*' | cut -d: -f2)
            FAILURES=$(cat "$STATUS_FILE" | grep -o '"consecutiveFailures":[0-9]*' | cut -d: -f2)
            LAST_CHECK=$(cat "$STATUS_FILE" | grep -o '"lastCheck":"[^"]*"' | cut -d'"' -f4)

            if [ "$LAST_STATUS" = "200" ]; then
                echo "   🟢 CourtListener API: ONLINE"
            else
                echo "   🔴 CourtListener API: DOWN (status: $LAST_STATUS)"
                echo "   📊 Consecutive failures: $FAILURES"
            fi
            echo "   🕐 Last check: $LAST_CHECK"
        fi
        echo ""

        echo "📋 JOBS:"
        launchctl list 2>/dev/null | grep promptspeak | while read line; do
            echo "   $line"
        done
        echo ""

        if [ -f "$SCRIPT_DIR/scheduled-retest-report.md" ]; then
            echo "📄 Latest report: scheduled-retest-report.md"
            echo "   Modified: $(stat -f '%Sm' "$SCRIPT_DIR/scheduled-retest-report.md")"
        fi
        echo ""
        ;;

    run)
        echo "🚀 Running full test suite immediately..."
        echo ""
        cd "$SCRIPT_DIR"
        npx tsx scheduled-retest.ts
        ;;

    monitor)
        echo "🔍 Checking CourtListener API status..."
        echo ""
        cd "$SCRIPT_DIR"
        npx tsx monitor-courtlistener.ts
        ;;

    stop)
        echo "Stopping all scheduled jobs..."
        launchctl unload "$MONITOR_PLIST" 2>/dev/null && echo "   ✅ API monitor stopped"
        launchctl unload "$RETEST_PLIST" 2>/dev/null && echo "   ✅ Scheduled retest stopped"
        echo "Done."
        ;;

    start)
        echo "Starting API monitor (hourly checks)..."
        launchctl unload "$MONITOR_PLIST" 2>/dev/null
        launchctl load "$MONITOR_PLIST"
        echo "✅ API monitor started"
        echo ""
        echo "The monitor will:"
        echo "  • Check CourtListener API every hour"
        echo "  • Send notification when API comes back online"
        echo "  • Automatically run full test suite when API recovers"
        echo ""
        launchctl list 2>/dev/null | grep promptspeak
        ;;

    results)
        if [ -f "$SCRIPT_DIR/scheduled-retest-report.md" ]; then
            cat "$SCRIPT_DIR/scheduled-retest-report.md"
        else
            echo "❌ No results file found yet"
            echo "   Tests haven't run or results weren't saved"
        fi
        ;;

    logs)
        echo "📋 Log Files:"
        echo "─────────────────────────────────────────────────────────────────"
        if [ -d "$SCRIPT_DIR/logs" ]; then
            ls -lht "$SCRIPT_DIR/logs/" | head -10
            echo ""
            echo "📜 Latest monitor log:"
            echo "─────────────────────────────────────────────────────────────────"
            LATEST_MONITOR=$(ls -t "$SCRIPT_DIR/logs/"monitor_*.log 2>/dev/null | head -1)
            if [ -n "$LATEST_MONITOR" ]; then
                cat "$LATEST_MONITOR"
            else
                echo "No monitor logs yet"
            fi
        else
            echo "No logs directory yet"
        fi
        ;;

    history)
        echo "📊 API Monitor History:"
        echo "─────────────────────────────────────────────────────────────────"
        if [ -f "$STATUS_FILE" ]; then
            cat "$STATUS_FILE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for h in data.get('history', [])[-12:]:
    icon = '✅' if h['status'] == 200 else '❌'
    print(f\"  {icon} {h['time'][:19]} | {h['status']} | {h['message'][:40]}\")"
        else
            echo "No history yet"
        fi
        ;;

    *)
        echo "Usage: $0 {status|run|monitor|stop|start|results|logs|history}"
        echo ""
        echo "Commands:"
        echo "  status  - Show API monitor status and job info"
        echo "  run     - Run full test suite immediately"
        echo "  monitor - Check API status once (immediate)"
        echo "  stop    - Stop all scheduled jobs"
        echo "  start   - Start hourly API monitoring"
        echo "  results - View latest test results"
        echo "  logs    - View execution logs"
        echo "  history - View API check history"
        exit 1
        ;;
esac
