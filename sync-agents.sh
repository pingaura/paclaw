#!/bin/bash
# Sync agent workspace files between local agents/ directory and R2 storage.
# Usage: ./sync-agents.sh push|pull|status
#
# Reads R2 credentials from .env file (if present) or environment variables.
# Required env vars: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CF_ACCOUNT_ID
# Optional: R2_BUCKET_NAME (defaults to moltbot-data)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$SCRIPT_DIR/agents"
CONFIG_FILE="$AGENTS_DIR/openclaw-config.json"

R2_PREFIX="openclaw/workspaces"
R2_CONFIG_PATH="openclaw/openclaw.json"
RCLONE_FLAGS="--transfers=16 --fast-list --s3-no-check-bucket"

# ============================================================
# LOAD ENV VARS
# ============================================================

# Source .env file if it exists (supports KEY=VALUE and KEY="VALUE" formats)
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

R2_BUCKET="${R2_BUCKET_NAME:-moltbot-data}"

# ============================================================
# VALIDATE
# ============================================================

check_credentials() {
    local missing=()
    [ -z "${R2_ACCESS_KEY_ID:-}" ] && missing+=("R2_ACCESS_KEY_ID")
    [ -z "${R2_SECRET_ACCESS_KEY:-}" ] && missing+=("R2_SECRET_ACCESS_KEY")
    [ -z "${CF_ACCOUNT_ID:-}" ] && missing+=("CF_ACCOUNT_ID")

    if [ ${#missing[@]} -gt 0 ]; then
        echo "ERROR: Missing required environment variables: ${missing[*]}"
        echo "Set them in .env or export them before running this script."
        exit 1
    fi
}

check_rclone() {
    if ! command -v rclone &>/dev/null; then
        echo "ERROR: rclone is not installed."
        echo "Install it: https://rclone.org/install/"
        exit 1
    fi
}

# ============================================================
# RCLONE SETUP
# ============================================================

setup_rclone() {
    local conf_dir
    conf_dir="$(mktemp -d)/rclone"
    mkdir -p "$conf_dir"
    export RCLONE_CONFIG="$conf_dir/rclone.conf"

    cat > "$RCLONE_CONFIG" << EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $R2_ACCESS_KEY_ID
secret_access_key = $R2_SECRET_ACCESS_KEY
endpoint = https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
no_check_bucket = true
EOF
}

# ============================================================
# PUSH
# ============================================================

do_push() {
    echo "Pushing agent files to R2 (bucket: $R2_BUCKET)..."
    echo ""

    local total=0

    # Upload each agent role's .md files
    for role_dir in "$AGENTS_DIR"/*/; do
        [ -d "$role_dir" ] || continue
        local role
        role="$(basename "$role_dir")"
        local count
        count=$(find "$role_dir" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')

        if [ "$count" -gt 0 ]; then
            echo "  $role/ ($count files)"
            rclone copy "$role_dir" "r2:${R2_BUCKET}/${R2_PREFIX}/${role}/" \
                $RCLONE_FLAGS --include='*.md' -v 2>&1 | sed 's/^/    /'
            total=$((total + count))
        fi
    done

    # Upload config
    if [ -f "$CONFIG_FILE" ]; then
        echo "  openclaw-config.json -> openclaw.json"
        rclone copyto "$CONFIG_FILE" "r2:${R2_BUCKET}/${R2_CONFIG_PATH}" \
            $RCLONE_FLAGS -v 2>&1 | sed 's/^/    /'
        total=$((total + 1))
    fi

    echo ""
    echo "Push complete: $total files uploaded."
}

# ============================================================
# PULL
# ============================================================

do_pull() {
    echo "Pulling agent files from R2 (bucket: $R2_BUCKET)..."
    echo ""

    # Download workspaces
    local ws_count
    ws_count=$(rclone ls "r2:${R2_BUCKET}/${R2_PREFIX}/" $RCLONE_FLAGS 2>/dev/null | wc -l | tr -d ' ')

    if [ "$ws_count" -gt 0 ]; then
        echo "  Downloading workspaces ($ws_count files)..."
        rclone copy "r2:${R2_BUCKET}/${R2_PREFIX}/" "$AGENTS_DIR/" \
            $RCLONE_FLAGS -v 2>&1 | sed 's/^/    /'
    else
        echo "  No workspace files found in R2."
    fi

    # Download config
    if rclone ls "r2:${R2_BUCKET}/${R2_CONFIG_PATH}" $RCLONE_FLAGS 2>/dev/null | grep -q openclaw.json; then
        echo "  Downloading openclaw.json -> openclaw-config.json"
        rclone copyto "r2:${R2_BUCKET}/${R2_CONFIG_PATH}" "$CONFIG_FILE" \
            $RCLONE_FLAGS -v 2>&1 | sed 's/^/    /'
    else
        echo "  No openclaw.json found in R2."
    fi

    echo ""
    echo "Pull complete."
}

# ============================================================
# STATUS
# ============================================================

do_status() {
    echo "R2 agent files (bucket: $R2_BUCKET):"
    echo ""

    echo "=== Workspaces ==="
    rclone ls "r2:${R2_BUCKET}/${R2_PREFIX}/" $RCLONE_FLAGS 2>/dev/null || echo "  (empty or not found)"
    echo ""

    echo "=== Config ==="
    rclone ls "r2:${R2_BUCKET}/${R2_CONFIG_PATH}" $RCLONE_FLAGS 2>/dev/null || echo "  (not found)"
    echo ""

    echo "=== Last Modified ==="
    rclone lsl "r2:${R2_BUCKET}/${R2_PREFIX}/" $RCLONE_FLAGS 2>/dev/null | head -20 || echo "  (empty or not found)"
}

# ============================================================
# MAIN
# ============================================================

usage() {
    echo "Usage: $0 {push|pull|status}"
    echo ""
    echo "  push    Upload local agent files to R2"
    echo "  pull    Download agent files from R2 to local"
    echo "  status  List files in R2 for comparison"
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

check_rclone
check_credentials
setup_rclone

case "$1" in
    push)   do_push ;;
    pull)   do_pull ;;
    status) do_status ;;
    *)      usage ;;
esac
