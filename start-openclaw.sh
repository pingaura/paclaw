#!/bin/bash
# Startup script for OpenClaw in Cloudflare Sandbox
# This script:
# 1. Restores config/workspace/skills from R2 via rclone (if configured)
# 2. Runs openclaw onboard --non-interactive to configure from env vars (first run only)
# 3. Patches config to inject runtime secrets and agent configuration
# 4. Starts a background sync loop (rclone, watches for file changes)
# 5. Starts the gateway

set -e

if pgrep -f "openclaw gateway" > /dev/null 2>&1; then
    echo "OpenClaw gateway is already running, exiting."
    exit 0
fi

CONFIG_DIR="/root/.openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
WORKSPACE_DIR="/root/clawd"
SKILLS_DIR="/root/clawd/skills"
ABHIYAN_DIR="/root/clawd/abhiyan"
RCLONE_CONF="/root/.config/rclone/rclone.conf"
LAST_SYNC_FILE="/tmp/.last-sync"
PROJECTS_DIR="/root/clawd/projects"

mkdir -p "$PROJECTS_DIR"

echo "Config directory: $CONFIG_DIR"

mkdir -p "$CONFIG_DIR"

# ============================================================
# RCLONE SETUP
# ============================================================

r2_configured() {
    [ -n "$R2_ACCESS_KEY_ID" ] && [ -n "$R2_SECRET_ACCESS_KEY" ] && [ -n "$CF_ACCOUNT_ID" ]
}

R2_BUCKET="${R2_BUCKET_NAME:-moltbot-data}"

setup_rclone() {
    mkdir -p "$(dirname "$RCLONE_CONF")"
    cat > "$RCLONE_CONF" << EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $R2_ACCESS_KEY_ID
secret_access_key = $R2_SECRET_ACCESS_KEY
endpoint = https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
no_check_bucket = true
EOF
    touch /tmp/.rclone-configured
    echo "Rclone configured for bucket: $R2_BUCKET"
}

RCLONE_FLAGS="--transfers=16 --fast-list --s3-no-check-bucket"

# ============================================================
# RESTORE FROM R2
# ============================================================

if r2_configured; then
    setup_rclone

    echo "Checking R2 for existing backup..."
    if rclone ls "r2:${R2_BUCKET}/openclaw/openclaw.json" $RCLONE_FLAGS 2>/dev/null | grep -q openclaw.json; then
        echo "Restoring config from R2..."
        rclone copy "r2:${R2_BUCKET}/openclaw/" "$CONFIG_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: config restore failed with exit code $?"
        echo "Config restored"
    else
        echo "No backup found in R2, starting fresh"
    fi

    # Restore workspace
    REMOTE_WS_COUNT=$(rclone ls "r2:${R2_BUCKET}/workspace/" $RCLONE_FLAGS 2>/dev/null | wc -l)
    if [ "$REMOTE_WS_COUNT" -gt 0 ]; then
        echo "Restoring workspace from R2 ($REMOTE_WS_COUNT files)..."
        mkdir -p "$WORKSPACE_DIR"
        rclone copy "r2:${R2_BUCKET}/workspace/" "$WORKSPACE_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: workspace restore failed with exit code $?"
        echo "Workspace restored"
    fi

    # Restore skills
    REMOTE_SK_COUNT=$(rclone ls "r2:${R2_BUCKET}/skills/" $RCLONE_FLAGS 2>/dev/null | wc -l)
    if [ "$REMOTE_SK_COUNT" -gt 0 ]; then
        echo "Restoring skills from R2 ($REMOTE_SK_COUNT files)..."
        mkdir -p "$SKILLS_DIR"
        rclone copy "r2:${R2_BUCKET}/skills/" "$SKILLS_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: skills restore failed with exit code $?"
        echo "Skills restored"
    fi

    # Re-overlay deploy-baked skills so new deploys always win over stale R2 data.
    # R2 may have older versions of SKILL.md / scripts; the Docker image is the
    # source of truth for skill code. Runtime-only files from R2 (not in the
    # Docker image) are preserved since cp --no-clobber is NOT used.
    DEPLOY_SKILLS="/root/clawd/skills-deploy"
    if [ -d "$DEPLOY_SKILLS" ]; then
        echo "Overlaying deploy-baked skills over R2 restore..."
        cp -r "$DEPLOY_SKILLS"/* "$SKILLS_DIR/" 2>/dev/null || true
        echo "Deploy skills overlay complete"
    fi

    # Restore abhiyan project data
    REMOTE_AB_COUNT=$(rclone ls "r2:${R2_BUCKET}/abhiyan/" $RCLONE_FLAGS 2>/dev/null | wc -l)
    if [ "$REMOTE_AB_COUNT" -gt 0 ]; then
        echo "Restoring abhiyan data from R2 ($REMOTE_AB_COUNT files)..."
        mkdir -p "$ABHIYAN_DIR"
        rclone copy "r2:${R2_BUCKET}/abhiyan/" "$ABHIYAN_DIR/" $RCLONE_FLAGS -v 2>&1 || echo "WARNING: abhiyan restore failed with exit code $?"
        echo "Abhiyan data restored"
    fi

    # ── Restore project git repos from R2 bundles ──
    echo "Checking for project repo bundles..."
    BUNDLE_LIST=$(rclone lsf --dirs-only "r2:${R2_BUCKET}/repos/" $RCLONE_FLAGS 2>/dev/null || echo "")
    if [ -n "$BUNDLE_LIST" ]; then
        echo "$BUNDLE_LIST" | while IFS= read -r project_dir; do
            project_id="${project_dir%/}"
            [ -z "$project_id" ] && continue
            REPO_DIR="/root/clawd/projects/$project_id"
            BUNDLE_TMP="/tmp/${project_id}.bundle"
            echo "Restoring repo: $project_id"
            rclone copyto "r2:${R2_BUCKET}/repos/${project_id}/repo.bundle" "$BUNDLE_TMP" $RCLONE_FLAGS 2>/dev/null || {
                    echo "WARNING: Failed to download bundle for $project_id"
                    continue
                }
            if [ -f "$BUNDLE_TMP" ]; then
                rm -rf "$REPO_DIR"
                mkdir -p "$REPO_DIR"
                git clone "$BUNDLE_TMP" "$REPO_DIR" 2>/dev/null || {
                    echo "WARNING: Failed to clone bundle for $project_id"
                    rm -f "$BUNDLE_TMP"
                    continue
                }
                git -C "$REPO_DIR" remote remove origin 2>/dev/null || true
                git -C "$REPO_DIR" config user.email "abhiyan@local"
                git -C "$REPO_DIR" config user.name "Abhiyan"
                rm -f "$BUNDLE_TMP"
                echo "Restored: $project_id"
            fi
        done
        echo "Repo restore complete"
    else
        echo "No repo bundles found in R2"
    fi
else
    echo "R2 not configured, starting fresh"
fi

# ============================================================
# ONBOARD (only if no config exists yet)
# ============================================================
if [ ! -f "$CONFIG_FILE" ]; then
    echo "No existing config found, running openclaw onboard..."

    # Priority: OpenAI > Anthropic > Cloudflare AI Gateway
    AUTH_ARGS=""
    if [ -n "$OPENAI_API_KEY" ]; then
        AUTH_ARGS="--auth-choice openai-api-key --openai-api-key $OPENAI_API_KEY"
    elif [ -n "$ANTHROPIC_API_KEY" ]; then
        AUTH_ARGS="--auth-choice apiKey --anthropic-api-key $ANTHROPIC_API_KEY"
    elif [ -n "$CLOUDFLARE_AI_GATEWAY_API_KEY" ] && [ -n "$CF_AI_GATEWAY_ACCOUNT_ID" ] && [ -n "$CF_AI_GATEWAY_GATEWAY_ID" ]; then
        AUTH_ARGS="--auth-choice cloudflare-ai-gateway-api-key \
            --cloudflare-ai-gateway-account-id $CF_AI_GATEWAY_ACCOUNT_ID \
            --cloudflare-ai-gateway-gateway-id $CF_AI_GATEWAY_GATEWAY_ID \
            --cloudflare-ai-gateway-api-key $CLOUDFLARE_AI_GATEWAY_API_KEY"
    fi

    openclaw onboard --non-interactive --accept-risk \
        --mode local \
        $AUTH_ARGS \
        --gateway-port 18789 \
        --gateway-bind lan \
        --skip-channels \
        --skip-skills \
        --skip-health

    echo "Onboard completed"
else
    echo "Using existing config"
fi

# ============================================================
# PATCH CONFIG (inject runtime secrets + agent configuration)
# ============================================================
# R2 config is the source of truth for models, agents, skills, and channels.
# This script only injects runtime secrets from env vars and ensures
# agent coordination (subagents, skills) is configured.
node << 'EOFPATCH'
const fs = require('fs');

const configPath = '/root/.openclaw/openclaw.json';
console.log('Patching config at:', configPath);
let config = {};

try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
    console.log('Starting with empty config');
}

config.gateway = config.gateway || {};
config.channels = config.channels || {};

// ── Gateway ──
config.gateway.port = 18789;
config.gateway.mode = 'local';
// Trust the Cloudflare Sandbox internal network so X-Forwarded-For: 127.0.0.1
// makes the gateway treat worker-proxied connections as local (no device identity needed).
config.gateway.trustedProxies = ['10.0.0.0/8'];

if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.gateway.auth = config.gateway.auth || {};
    config.gateway.auth.token = process.env.OPENCLAW_GATEWAY_TOKEN;
}

if (process.env.OPENCLAW_DEV_MODE === 'true') {
    config.gateway.controlUi = config.gateway.controlUi || {};
    config.gateway.controlUi.allowInsecureAuth = true;
}

// ── AI Gateway model override (CF_AI_GATEWAY_MODEL=provider/model-id) ──
if (process.env.CF_AI_GATEWAY_MODEL) {
    const raw = process.env.CF_AI_GATEWAY_MODEL;
    const slashIdx = raw.indexOf('/');
    const gwProvider = raw.substring(0, slashIdx);
    const modelId = raw.substring(slashIdx + 1);

    const accountId = process.env.CF_AI_GATEWAY_ACCOUNT_ID;
    const gatewayId = process.env.CF_AI_GATEWAY_GATEWAY_ID;
    const apiKey = process.env.CLOUDFLARE_AI_GATEWAY_API_KEY;

    let baseUrl;
    if (accountId && gatewayId) {
        baseUrl = 'https://gateway.ai.cloudflare.com/v1/' + accountId + '/' + gatewayId + '/' + gwProvider;
        if (gwProvider === 'workers-ai') baseUrl += '/v1';
    } else if (gwProvider === 'workers-ai' && process.env.CF_ACCOUNT_ID) {
        baseUrl = 'https://api.cloudflare.com/client/v4/accounts/' + process.env.CF_ACCOUNT_ID + '/ai/v1';
    }

    if (baseUrl && apiKey) {
        const api = gwProvider === 'anthropic' ? 'anthropic-messages' : 'openai-completions';
        const providerName = 'cf-ai-gw-' + gwProvider;

        config.models = config.models || {};
        config.models.providers = config.models.providers || {};
        config.models.providers[providerName] = {
            baseUrl: baseUrl,
            apiKey: apiKey,
            api: api,
            models: [{ id: modelId, name: modelId, contextWindow: 131072, maxTokens: 8192 }],
        };
        config.agents = config.agents || {};
        config.agents.defaults = config.agents.defaults || {};
        config.agents.defaults.model = { primary: providerName + '/' + modelId };
        console.log('AI Gateway model override: provider=' + providerName + ' model=' + modelId + ' via ' + baseUrl);
    } else {
        console.warn('CF_AI_GATEWAY_MODEL set but missing required config (account ID, gateway ID, or API key)');
    }
}

// ── Channel tokens (inject from env, never stored in R2) ──

if (process.env.TELEGRAM_BOT_TOKEN) {
    const dmPolicy = process.env.TELEGRAM_DM_POLICY || 'pairing';
    config.channels.telegram = {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        enabled: true,
        dmPolicy: dmPolicy,
    };
    if (process.env.TELEGRAM_DM_ALLOW_FROM) {
        config.channels.telegram.allowFrom = process.env.TELEGRAM_DM_ALLOW_FROM.split(',');
    } else if (dmPolicy === 'open') {
        config.channels.telegram.allowFrom = ['*'];
    }
}

if (process.env.DISCORD_BOT_TOKEN) {
    const dmPolicy = process.env.DISCORD_DM_POLICY || 'pairing';
    const dm = { policy: dmPolicy };
    if (dmPolicy === 'open') {
        dm.allowFrom = ['*'];
    }
    config.channels.discord = {
        token: process.env.DISCORD_BOT_TOKEN,
        enabled: true,
        dm: dm,
    };
}

if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    config.channels.slack = Object.assign({}, config.channels.slack || {}, {
        botToken: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        enabled: true,
    });
}

// ── Skills ──

config.skills = config.skills || {};
config.skills.entries = config.skills.entries || {};

// cloudflare-browser skill (needs CDP env vars)
if (process.env.CDP_SECRET && process.env.WORKER_URL) {
    if (!config.skills.entries['cloudflare-browser']) {
        config.skills.entries['cloudflare-browser'] = {
            enabled: true,
            env: {
                CDP_SECRET: process.env.CDP_SECRET,
                WORKER_URL: process.env.WORKER_URL
            }
        };
        console.log('Registered cloudflare-browser skill');
    }

    // Browser profile for remote CDP
    // attachOnly: true prevents OpenClaw from scanning for local Chrome/Brave/Edge
    // binaries and forces it to use the remote cdpUrl instead.
    config.browser = config.browser || {};
    if (config.browser.enabled === undefined) config.browser.enabled = true;
    config.browser.attachOnly = true;
    config.browser.remoteCdpTimeoutMs = 15000;
    config.browser.remoteCdpHandshakeTimeoutMs = 10000;
    config.browser.ssrfPolicy = config.browser.ssrfPolicy || {};
    config.browser.ssrfPolicy.dangerouslyAllowPrivateNetwork = true;
    config.browser.defaultProfile = config.browser.defaultProfile || 'cloudflare';
    config.browser.profiles = config.browser.profiles || {};
    if (!config.browser.profiles.cloudflare) {
        const workerUrl = process.env.WORKER_URL.replace(/\/+$/, '');
        config.browser.profiles.cloudflare = {
            cdpUrl: workerUrl + '/cdp?secret=' + encodeURIComponent(process.env.CDP_SECRET),
            color: '#F48120'
        };
        console.log('Created cloudflare CDP browser profile');
    }
}

// Ensure all skills are registered globally
const allSkillNames = ['abhiyan', 'tdd', 'planning', 'executing-tasks', 'code-review', 'debugging', 'workspace-lifecycle', 'orchestrator-protocol'];
for (const skillName of allSkillNames) {
    if (!config.skills.entries[skillName]) {
        config.skills.entries[skillName] = { enabled: true };
        console.log('Registered ' + skillName + ' skill');
    }
}

// Ensure agents can discover custom skills in /root/clawd/skills/
config.skills.load = config.skills.load || {};
config.skills.load.extraDirs = config.skills.load.extraDirs || [];
if (!config.skills.load.extraDirs.includes('/root/clawd/skills')) {
    config.skills.load.extraDirs.push('/root/clawd/skills');
    console.log('Added /root/clawd/skills to skills.load.extraDirs');
}

// ── Agent subagents allowlists & per-agent skills ──

const allAgentIds = ['sage', 'atlas', 'forge', 'pixel', 'harbor', 'sentinel', 'aegis', 'scribe'];

const allowMap = {
    sage:     ['atlas', 'forge', 'pixel', 'harbor', 'sentinel', 'aegis', 'scribe'],
    atlas:    ['sage', 'forge', 'pixel', 'harbor'],
    forge:    ['sage', 'pixel', 'harbor', 'sentinel'],
    pixel:    ['sage', 'forge', 'harbor', 'sentinel'],
    harbor:   ['sage', 'forge', 'pixel', 'sentinel', 'aegis'],
    sentinel: ['sage', 'forge', 'pixel', 'harbor'],
    aegis:    ['sage', 'forge', 'pixel', 'harbor', 'sentinel'],
    scribe:   ['sage', 'atlas', 'forge', 'pixel', 'harbor'],
};

const agentSkillMap = {
    sage:     ['abhiyan', 'cloudflare-browser', 'planning', 'orchestrator-protocol'],
    atlas:    ['abhiyan', 'planning'],
    forge:    ['abhiyan', 'tdd', 'executing-tasks', 'code-review', 'debugging', 'workspace-lifecycle'],
    pixel:    ['abhiyan', 'cloudflare-browser', 'tdd', 'executing-tasks', 'code-review', 'debugging', 'workspace-lifecycle'],
    harbor:   ['abhiyan', 'tdd', 'executing-tasks', 'code-review', 'debugging', 'workspace-lifecycle'],
    sentinel: ['abhiyan', 'code-review', 'tdd'],
    aegis:    ['abhiyan', 'cloudflare-browser'],
    scribe:   ['abhiyan', 'executing-tasks'],
};

if (config.agents && config.agents.list) {
    for (const agent of config.agents.list) {
        if (!agent.id || !allAgentIds.includes(agent.id)) continue;

        agent.subagents = agent.subagents || {};
        agent.subagents.allowAgents = allowMap[agent.id] || [];

        const enabledSkills = (agentSkillMap[agent.id] || ['abhiyan']).filter(function(s) {
            if (s === 'cloudflare-browser' && !(process.env.CDP_SECRET && process.env.WORKER_URL)) return false;
            return true;
        });
        agent.skills = enabledSkills;

        console.log('Agent ' + agent.id + ': skills=' + JSON.stringify(agent.skills));
    }
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Configuration patched successfully');
EOFPATCH

# ============================================================
# BACKGROUND SYNC LOOP
# ============================================================
if r2_configured; then
    echo "Starting background R2 sync loop..."
    (
        MARKER=/tmp/.last-sync-marker
        LOGFILE=/tmp/r2-sync.log
        touch "$MARKER"

        while true; do
            sleep 30

            CHANGED=/tmp/.changed-files
            {
                find "$CONFIG_DIR" -newer "$MARKER" -type f -printf '%P\n' 2>/dev/null
                find "$WORKSPACE_DIR" -newer "$MARKER" \
                    -not -path '*/node_modules/*' \
                    -not -path '*/.git/*' \
                    -type f -printf '%P\n' 2>/dev/null
            } > "$CHANGED"

            COUNT=$(wc -l < "$CHANGED" 2>/dev/null || echo 0)

            if [ "$COUNT" -gt 0 ]; then
                echo "[sync] Uploading changes ($COUNT files) at $(date)" >> "$LOGFILE"
                rclone sync "$CONFIG_DIR/" "r2:${R2_BUCKET}/openclaw/" \
                    $RCLONE_FLAGS --exclude='*.lock' --exclude='*.log' --exclude='*.tmp' --exclude='.git/**' 2>> "$LOGFILE"
                if [ -d "$WORKSPACE_DIR" ]; then
                    rclone sync "$WORKSPACE_DIR/" "r2:${R2_BUCKET}/workspace/" \
                        $RCLONE_FLAGS --exclude='skills/**' --exclude='abhiyan/**' --exclude='.git/**' --exclude='node_modules/**' 2>> "$LOGFILE"
                fi
                if [ -d "$SKILLS_DIR" ]; then
                    rclone sync "$SKILLS_DIR/" "r2:${R2_BUCKET}/skills/" \
                        $RCLONE_FLAGS 2>> "$LOGFILE"
                fi
                if [ -d "$ABHIYAN_DIR" ]; then
                    rclone sync "$ABHIYAN_DIR/" "r2:${R2_BUCKET}/abhiyan/" \
                        $RCLONE_FLAGS 2>> "$LOGFILE"
                fi
                date -Iseconds > "$LAST_SYNC_FILE"
                touch "$MARKER"
                echo "[sync] Complete at $(date)" >> "$LOGFILE"
            fi
        done
    ) &
    echo "Background sync loop started (PID: $!)"
fi

# ============================================================
# START GATEWAY
# ============================================================
echo "Starting OpenClaw Gateway..."
echo "Gateway will be available on port 18789"

# If a gateway is already running (e.g. second start in same sandbox), stop it first
if openclaw gateway stop 2>/dev/null; then
    echo "Stopped existing gateway before start"
    sleep 2
fi

rm -f /tmp/openclaw-gateway.lock 2>/dev/null || true
rm -f "$CONFIG_DIR/gateway.lock" 2>/dev/null || true

echo "Dev mode: ${OPENCLAW_DEV_MODE:-false}"

if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
    echo "Starting gateway with token auth..."
    exec openclaw gateway --port 18789 --verbose --allow-unconfigured --bind lan --token "$OPENCLAW_GATEWAY_TOKEN"
else
    echo "Starting gateway with device pairing (no token)..."
    exec openclaw gateway --port 18789 --verbose --allow-unconfigured --bind lan
fi
