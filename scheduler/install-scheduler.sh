#!/bin/bash
#
# SAM.gov Monitor Scheduler Installation Script
#
# This script sets up the NAICS opportunity monitor to run at 6:00 AM daily.
#
# Scheduling Options:
# 1. macOS launchd (recommended for Mac)
# 2. cron (universal Unix/Linux)
# 3. systemd timer (Linux systems)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.promptspeak.sam-monitor.plist"
PLIST_SOURCE="$SCRIPT_DIR/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║           SAM.gov Monitor Scheduler Installation                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
else
    OS="other"
fi

echo "Detected OS: $OS"
echo "Project directory: $PROJECT_DIR"
echo ""

# Function to install on macOS using launchd
install_macos() {
    echo "Installing macOS launchd agent..."
    echo ""

    # Create LaunchAgents directory if needed
    mkdir -p "$HOME/Library/LaunchAgents"

    # Update plist with correct paths
    sed "s|/Users/christopherbailey/Promptspeak LLM-LLM Symbolic Language/mcp-server|$PROJECT_DIR|g" \
        "$PLIST_SOURCE" > "$PLIST_DEST"

    # Unload if already loaded
    launchctl unload "$PLIST_DEST" 2>/dev/null || true

    # Load the new configuration
    launchctl load "$PLIST_DEST"

    echo "✅ Scheduler installed!"
    echo ""
    echo "Schedule: Daily at 6:00 AM"
    echo "Logs:     $PROJECT_DIR/logs/sam-monitor.log"
    echo ""
    echo "Commands:"
    echo "  Start now:  launchctl start $PLIST_NAME"
    echo "  Stop:       launchctl stop $PLIST_NAME"
    echo "  Unload:     launchctl unload $PLIST_DEST"
    echo "  Status:     launchctl list | grep sam-monitor"
    echo ""
}

# Function to install on Linux using cron
install_linux_cron() {
    echo "Installing cron job..."
    echo ""

    CRON_JOB="0 6 * * * cd $PROJECT_DIR && /usr/bin/npx tsx run-naics-monitor.ts >> $PROJECT_DIR/logs/sam-monitor.log 2>&1"

    # Add to crontab (avoiding duplicates)
    (crontab -l 2>/dev/null | grep -v "run-naics-monitor" ; echo "$CRON_JOB") | crontab -

    echo "✅ Cron job installed!"
    echo ""
    echo "Schedule: Daily at 6:00 AM (0 6 * * *)"
    echo "Logs:     $PROJECT_DIR/logs/sam-monitor.log"
    echo ""
    echo "Commands:"
    echo "  View cron:  crontab -l"
    echo "  Edit cron:  crontab -e"
    echo "  Run now:    cd $PROJECT_DIR && npx tsx run-naics-monitor.ts"
    echo ""
}

# Function to show cron instructions
show_cron_instructions() {
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo "  Manual Cron Installation"
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Add this line to your crontab (crontab -e):"
    echo ""
    echo "0 6 * * * cd $PROJECT_DIR && npx tsx run-naics-monitor.ts >> $PROJECT_DIR/logs/sam-monitor.log 2>&1"
    echo ""
    echo "Cron schedule format: minute hour day month weekday"
    echo "  0 6 * * *  = 6:00 AM every day"
    echo "  0 */2 * * * = Every 2 hours"
    echo "  0 6 * * 1-5 = 6:00 AM weekdays only"
    echo ""
}

# Main logic
case "$1" in
    install)
        if [ "$OS" == "macos" ]; then
            install_macos
        elif [ "$OS" == "linux" ]; then
            install_linux_cron
        else
            show_cron_instructions
        fi
        ;;
    uninstall)
        if [ "$OS" == "macos" ]; then
            launchctl unload "$PLIST_DEST" 2>/dev/null || true
            rm -f "$PLIST_DEST"
            echo "✅ macOS scheduler uninstalled"
        else
            crontab -l 2>/dev/null | grep -v "run-naics-monitor" | crontab -
            echo "✅ Cron job removed"
        fi
        ;;
    status)
        echo "Checking scheduler status..."
        echo ""
        if [ "$OS" == "macos" ]; then
            launchctl list | grep sam-monitor || echo "Not running"
        else
            crontab -l 2>/dev/null | grep run-naics-monitor || echo "Not installed"
        fi
        ;;
    run)
        echo "Running monitor now..."
        cd "$PROJECT_DIR" && npx tsx run-naics-monitor.ts
        ;;
    *)
        echo "Usage: $0 {install|uninstall|status|run}"
        echo ""
        echo "  install   - Set up the scheduler for 6:00 AM daily"
        echo "  uninstall - Remove the scheduler"
        echo "  status    - Check if scheduler is running"
        echo "  run       - Run the monitor now (manual)"
        echo ""
        show_cron_instructions
        ;;
esac
