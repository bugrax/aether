#!/usr/bin/env bash
# ──────────────────────────────────────────────────────
# Aether AI Worker — Startup Script
#
# Flow:
# 1. Checks Claude CLI is installed
# 2. If not authorized → runs `claude auth login` (opens browser)
# 3. Verifies auth works with a test call
# 4. Starts Celery with --pool=solo (no fork = Keychain access)
# ──────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}╔══════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║     🌀 Aether AI Worker                  ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Load .env ─────────────────────────────────────────
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a; source "$PROJECT_ROOT/.env"; set +a
fi

# ── Check Claude CLI ──────────────────────────────────
CLAUDE_BIN="${CLAUDE_CLI_PATH:-claude}"

if ! command -v "$CLAUDE_BIN" &> /dev/null; then
    echo -e "${RED}❌ Claude CLI not found${NC}"
    echo -e "   Install: ${YELLOW}npm install -g @anthropic-ai/claude-code${NC}"
    exit 1
fi

echo -e "${GREEN}✅${NC} Claude CLI $(${CLAUDE_BIN} --version 2>/dev/null)"

# ── Check / Do Auth ───────────────────────────────────
echo -e "\n${CYAN}🔐 Checking authentication...${NC}"

check_auth() {
    local status
    status=$("$CLAUDE_BIN" auth status 2>&1 || true)
    echo "$status" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if d.get('loggedIn'):
        print(f'email={d.get(\"email\",\"?\")},type={d.get(\"subscriptionType\",\"?\")}')
        sys.exit(0)
    else:
        sys.exit(1)
except:
    sys.exit(1)
" 2>/dev/null
}

AUTH_INFO=$(check_auth) && AUTH_OK=true || AUTH_OK=false

if [ "$AUTH_OK" = true ]; then
    echo -e "${GREEN}✅${NC} Logged in: ${AUTH_INFO}"
else
    echo -e "${YELLOW}🔑 Not logged in. Opening browser for authorization...${NC}"
    echo ""
    "$CLAUDE_BIN" auth login
    
    AUTH_INFO=$(check_auth) && AUTH_OK=true || AUTH_OK=false
    if [ "$AUTH_OK" != true ]; then
        echo -e "${RED}❌ Login failed. Try again.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅${NC} Logged in: ${AUTH_INFO}"
fi

# ── Test API call ─────────────────────────────────────
echo -e "\n${CYAN}🧪 Testing Claude API...${NC}"

TEST_OUT=$(echo "Reply with only: OK" | "$CLAUDE_BIN" -p --model sonnet --output-format text --no-session-persistence 2>&1)
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
    echo -e "${RED}❌ API test failed:${NC} $TEST_OUT"
    echo -e "   Try: ${YELLOW}claude auth logout && claude auth login${NC}"
    exit 1
fi

echo -e "${GREEN}✅${NC} API works: ${TEST_OUT}"

# ── Activate venv ─────────────────────────────────────
cd "$SCRIPT_DIR"
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# ── Start Celery ──────────────────────────────────────
echo ""
echo -e "${PURPLE}🚀 Starting worker (pool=threads for Keychain access)${NC}"
echo -e "   Model: ${CYAN}${CLAUDE_MODEL:-sonnet}${NC}"
echo ""

exec celery -A celery_app worker \
    --loglevel=info \
    --pool=threads \
    --concurrency=2
