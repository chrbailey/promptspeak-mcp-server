#!/bin/bash
# =============================================================================
# LEGAL REVIEW TOOL INSTALLER
# =============================================================================
# Installs the PromptSpeak Legal Review tool for use with Claude Desktop.
#
# This tool helps attorneys:
#   - Verify legal citations before filing
#   - Detect privilege waiver risks
#   - Identify potential AI fabrication
#   - Create compliance audit trails
#
# Usage: curl -sSL https://example.com/install.sh | bash
#    or: ./install-legal-review.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║          LEGAL REVIEW TOOL INSTALLER                                      ║"
echo "║          For use with Claude Desktop                                      ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

info "Checking prerequisites..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js v20 or later from https://nodejs.org"
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    error "Node.js version 20 or later is required. Current version: $(node -v)"
fi
success "Node.js $(node -v) detected"

# Check for npm
if ! command -v npm &> /dev/null; then
    error "npm is not installed. Please install npm."
fi
success "npm $(npm -v) detected"

# =============================================================================
# INSTALLATION DIRECTORY
# =============================================================================

# Default installation directory
INSTALL_DIR="$HOME/.legal-review"

info "Installation directory: $INSTALL_DIR"

# Create directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# =============================================================================
# INSTALL DEPENDENCIES
# =============================================================================

info "Installing Legal Review tool..."

# Copy or clone the project
if [ -d "$INSTALL_DIR/node_modules" ]; then
    info "Updating existing installation..."
    cd "$INSTALL_DIR"
else
    info "Fresh installation..."
fi

# For now, we copy from the current directory (in production, this would clone from git)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ -f "$SCRIPT_DIR/package.json" ]; then
    # Local installation from repo
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
    cd "$INSTALL_DIR"
else
    error "Package not found. Please run this script from the mcp-server directory."
fi

# Install dependencies
info "Installing dependencies (this may take a minute)..."
npm install --silent

# Build TypeScript
info "Building TypeScript..."
npm run build --silent

success "Legal Review tool installed successfully!"

# =============================================================================
# CONFIGURE CLAUDE DESKTOP
# =============================================================================

echo ""
info "Configuring Claude Desktop..."

# Detect OS and set config path
case "$(uname -s)" in
    Darwin)
        CONFIG_DIR="$HOME/Library/Application Support/Claude"
        ;;
    Linux)
        CONFIG_DIR="$HOME/.config/claude"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        CONFIG_DIR="$APPDATA/Claude"
        ;;
    *)
        warn "Unknown OS. Please configure Claude Desktop manually."
        CONFIG_DIR=""
        ;;
esac

if [ -n "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

    # Create or update config
    if [ -f "$CONFIG_FILE" ]; then
        # Backup existing config
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
        info "Backed up existing config to $CONFIG_FILE.backup"

        # Check if already configured
        if grep -q "legal-review" "$CONFIG_FILE" 2>/dev/null; then
            success "Claude Desktop already configured for Legal Review"
        else
            # Add our MCP server to existing config using node
            node -e "
                const fs = require('fs');
                const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));

                if (!config.mcpServers) config.mcpServers = {};

                config.mcpServers['legal-review'] = {
                    command: 'node',
                    args: ['$INSTALL_DIR/dist/server.js']
                };

                fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
            "
            success "Added Legal Review to Claude Desktop config"
        fi
    else
        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "legal-review": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/server.js"]
    }
  }
}
EOF
        success "Created Claude Desktop config"
    fi
fi

# =============================================================================
# INSTALL SKILLS
# =============================================================================

echo ""
info "Installing Claude Code skills..."

SKILLS_DIR="$HOME/.claude/skills"
mkdir -p "$SKILLS_DIR"

# Copy skills
if [ -d "$INSTALL_DIR/skills" ]; then
    cp -r "$INSTALL_DIR/skills/"* "$SKILLS_DIR/" 2>/dev/null || true
    success "Installed legal review skill"
fi

# =============================================================================
# COMPLETION
# =============================================================================

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  INSTALLATION COMPLETE!                                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Restart Claude Desktop to load the Legal Review tool"
echo ""
echo "  2. In Claude Desktop, try these commands:"
echo "     - Ask Claude to 'review my motion for summary judgment'"
echo "     - Or use: /legal-review motion.md --to-court"
echo ""
echo "  3. Optional: Get a CourtListener API token for real citation verification"
echo "     - Visit: https://www.courtlistener.com/api/"
echo "     - Add to config: /legal-config set-token YOUR_TOKEN"
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  IMPORTANT LIMITATIONS                                                    ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "  This tool CANNOT verify that cited cases actually exist."
echo "  It can only:"
echo "    • Check citation FORMAT against known patterns"
echo "    • Query the FREE CourtListener database"
echo "    • Detect obvious privilege indicators"
echo ""
echo "  ALWAYS verify citations through Westlaw, Lexis, or official court records."
echo ""
echo "  For support: https://github.com/promptspeak/legal-review"
echo ""
