#!/bin/bash
# =============================================================================
# COURTLISTENER TOKEN CONFIGURATION
# =============================================================================
# This script helps you configure your CourtListener API token for the
# Legal Review tool.
#
# Usage: ./configure-courtlistener.sh [YOUR_TOKEN]
#    or: ./configure-courtlistener.sh (interactive mode)
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

CONFIG_DIR="$HOME/.legal-review"
TOKEN_FILE="$CONFIG_DIR/.courtlistener-token"

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║          COURTLISTENER API TOKEN CONFIGURATION                            ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if token provided as argument
if [ -n "$1" ]; then
    TOKEN="$1"
else
    echo -e "${BLUE}To get your API token:${NC}"
    echo ""
    echo "  1. Go to: https://www.courtlistener.com"
    echo "  2. Click 'Sign Up' or 'Log In'"
    echo "  3. Enable Two-Factor Authentication (required for API access)"
    echo "  4. Go to: https://www.courtlistener.com/profile/api/"
    echo "  5. Click 'Create New Token'"
    echo "  6. Copy the token (starts with a long alphanumeric string)"
    echo ""
    echo -e "${YELLOW}Paste your CourtListener API token below:${NC}"
    read -r TOKEN
fi

# Validate token format (basic check)
if [ -z "$TOKEN" ]; then
    echo -e "\n${YELLOW}No token provided. Exiting.${NC}\n"
    exit 1
fi

if [ ${#TOKEN} -lt 20 ]; then
    echo -e "\n${YELLOW}Warning: Token seems too short. CourtListener tokens are typically 40+ characters.${NC}"
    echo "Continue anyway? (y/n)"
    read -r CONFIRM
    if [ "$CONFIRM" != "y" ]; then
        exit 1
    fi
fi

# Create config directory
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

# Save token
echo "$TOKEN" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

echo ""
echo -e "${GREEN}✅ Token saved successfully!${NC}"
echo ""
echo "  Location: $TOKEN_FILE"
echo "  Permissions: 600 (owner read/write only)"
echo ""

# Test the token
echo -e "${BLUE}Testing token...${NC}"
echo ""

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Token $TOKEN" \
    "https://www.courtlistener.com/api/rest/v4/courts/?page_size=1" 2>/dev/null || echo "000")

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Token is valid! API connection successful.${NC}"
    echo ""
    echo "  You now have access to:"
    echo "    • Real-time case lookups"
    echo "    • Citation verification"
    echo "    • 5,000 requests per day (free tier)"
    echo ""
elif [ "$RESPONSE" = "401" ]; then
    echo -e "${YELLOW}⚠️  Token rejected (401 Unauthorized)${NC}"
    echo ""
    echo "  Possible issues:"
    echo "    • Token may be expired (90-day limit)"
    echo "    • Token may have been revoked"
    echo "    • Two-factor authentication may not be enabled"
    echo ""
    echo "  Visit https://www.courtlistener.com/profile/api/ to check your token."
    echo ""
elif [ "$RESPONSE" = "000" ]; then
    echo -e "${YELLOW}⚠️  Could not connect to CourtListener${NC}"
    echo ""
    echo "  Check your internet connection and try again."
    echo ""
else
    echo -e "${YELLOW}⚠️  Unexpected response: $RESPONSE${NC}"
    echo ""
fi

echo "───────────────────────────────────────────────────────────────────────────────"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Restart Claude Desktop to pick up the new token"
echo "  2. Try: /legal-review your-motion.md --to-court"
echo "  3. Citations will now be verified against CourtListener's database"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""
