import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { findExistingMoltbotProcess, waitForProcess } from '../gateway';
import { MOLTBOT_PORT } from '../config';

/**
 * Team Dashboard API routes
 * Provides aggregate team status and activity data.
 *
 * Agent metadata (names, emojis) lives in the client constants (src/client/team/constants.ts).
 * The backend only returns agent IDs; the client maps them to display info.
 */
const teamApi = new Hono<AppEnv>();

// Known agent identifiers for log parsing.
// Word-boundary regex avoids false positives like "message" matching "sage".
const AGENT_IDS = ['sage', 'atlas', 'forge', 'pixel', 'harbor', 'sentinel', 'aegis', 'scribe'];
const AGENT_PATTERNS = AGENT_IDS.map((id) => ({
  id,
  regex: new RegExp(`\\b${id}\\b`, 'i'),
}));

interface ParsedActivity {
  id: string;
  timestamp: number;
  agentId: string;
  type: 'message' | 'coordination' | 'task_start' | 'task_complete' | 'error' | 'system';
  summary: string;
}

/**
 * Try to extract a readable summary from a JSON log entry.
 * OpenClaw gateway logs are JSON frames with varying shapes:
 *   - { type, method, params: { from, to, message, ... } }
 *   - { level, msg, agent, ... }
 *   - Numeric-key wrappers: { "0": { ... } }
 */
function extractFromJson(raw: unknown): {
  agent: string | null;
  type: ParsedActivity['type'];
  summary: string;
  timestamp: number | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;

  let obj = raw as Record<string, unknown>;

  // Unwrap numeric-key wrappers like {"0": {...}}
  if (typeof obj['0'] === 'object' && obj['0'] !== null && Object.keys(obj).every((k) => /^\d+$/.test(k))) {
    obj = obj['0'] as Record<string, unknown>;
  }

  const params = (typeof obj.params === 'object' && obj.params !== null ? obj.params : {}) as Record<string, unknown>;
  const method = String(obj.method || obj.type || obj.action || '');
  const level = String(obj.level || '');
  const from = String(params.from || obj.from || obj.agent || obj.agentId || '');
  const to = String(params.to || obj.to || obj.target || '');
  const content = params.message || params.content || params.text || obj.msg || obj.message || '';
  const toolName = String(params.tool || params.toolName || obj.tool || '');
  const sessionId = String(params.sessionId || params.session || '');

  // Find agent
  let agent: string | null = null;
  const searchStr = `${from} ${to} ${method} ${sessionId}`;
  for (const { id, regex } of AGENT_PATTERNS) {
    if (regex.test(searchStr)) {
      agent = id;
      break;
    }
  }
  // Deep search if not found in primary fields
  if (!agent) {
    const fullStr = JSON.stringify(obj);
    for (const { id, regex } of AGENT_PATTERNS) {
      if (regex.test(fullStr)) {
        agent = id;
        break;
      }
    }
  }

  if (!agent) return null;

  // Classify type
  let type: ParsedActivity['type'] = 'message';
  const lower = `${method} ${String(content)} ${level}`.toLowerCase();
  if (level === 'error' || lower.includes('error') || lower.includes('fail')) {
    type = 'error';
  } else if (method === 'connect' || method === 'disconnect' || method === 'system') {
    type = 'system';
  } else if (lower.includes('assign') || lower.includes('delegate') || lower.includes('coordinate') || method === 'sessions.send' || method === 'sessions.spawn') {
    type = 'coordination';
  } else if (lower.includes('task') && lower.includes('start')) {
    type = 'task_start';
  } else if (lower.includes('task') && (lower.includes('complete') || lower.includes('done'))) {
    type = 'task_complete';
  }

  // Build readable summary
  let summary = '';
  if (typeof content === 'string' && content.length > 0) {
    summary = content.length > 150 ? content.slice(0, 147) + '...' : content;
  } else if (method) {
    const parts: string[] = [];
    // Readable method name
    const readableMethod = method.replace(/\./g, ' ').replace(/_/g, ' ');
    parts.push(readableMethod);
    if (toolName) parts.push(`[${toolName}]`);
    if (from && from !== 'undefined') parts.push(`from ${from}`);
    if (to && to !== 'undefined') parts.push(`\u2192 ${to}`);
    summary = parts.join(' ');
  }

  if (!summary) return null;

  // Extract timestamp
  let timestamp: number | null = null;
  const ts = obj.timestamp || obj.ts || obj.time;
  if (typeof ts === 'number') {
    timestamp = ts;
  } else if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    if (!isNaN(parsed)) timestamp = parsed;
  }

  return { agent, type, summary, timestamp };
}

/**
 * Deterministic hash of a string for stable activity IDs across requests.
 * Same log line always produces the same hash, preventing dedup failures.
 */
function stableHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function parseLogLine(line: string, index: number): ParsedActivity | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const lineHash = stableHash(trimmed);

  // Default timestamp: use index as an offset from a fixed epoch so it's
  // deterministic for the same tail output (same line = same index = same ts).
  // Lines without real timestamps will cluster near epoch 0, which is fine for
  // ordering since they sort before any real timestamp.
  let timestamp = index;

  // Extract ISO timestamp from anywhere in the line
  const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]).getTime();
    if (!isNaN(parsed)) timestamp = parsed;
  }

  // Try JSON parsing first for structured logs
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      const result = extractFromJson(json);
      if (result) {
        const ts = result.timestamp || timestamp;
        return {
          id: `log-${lineHash}`,
          timestamp: ts,
          agentId: result.agent!,
          type: result.type,
          summary: result.summary,
        };
      }
    } catch {
      // Not valid JSON, fall through to text parsing
    }
  }

  // Fallback: plain text log parsing
  let matchedAgent: string | null = null;
  for (const { id, regex } of AGENT_PATTERNS) {
    if (regex.test(trimmed)) {
      matchedAgent = id;
      break;
    }
  }

  if (!matchedAgent) return null;

  // Classify the activity type
  const lowerLine = trimmed.toLowerCase();
  let type: ParsedActivity['type'] = 'message';
  if (lowerLine.includes('error') || lowerLine.includes('fail')) {
    type = 'error';
  } else if (lowerLine.includes('task') && lowerLine.includes('start')) {
    type = 'task_start';
  } else if (lowerLine.includes('task') && (lowerLine.includes('complete') || lowerLine.includes('done'))) {
    type = 'task_complete';
  } else if (lowerLine.includes('assign') || lowerLine.includes('delegate') || lowerLine.includes('coordinate')) {
    type = 'coordination';
  }

  // Clean up summary: strip timestamps and common log prefixes for readability
  let summary = trimmed;
  // Remove ISO timestamp prefix
  summary = summary.replace(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*\s*/, '');
  // Remove common log level prefixes
  summary = summary.replace(/^\[(INFO|DEBUG|WARN|ERROR)\]\s*/i, '');
  summary = summary.length > 200 ? summary.slice(0, 197) + '...' : summary;

  return {
    id: `log-${lineHash}`,
    timestamp,
    agentId: matchedAgent,
    type,
    summary,
  };
}

// GET /api/team/status - Aggregate team status
teamApi.get('/status', async (c) => {
  const sandbox = c.get('sandbox');

  // Check gateway status
  let gatewayStatus = { ok: false, status: 'unknown' as string, processId: undefined as string | undefined };
  try {
    const process = await findExistingMoltbotProcess(sandbox);
    if (process) {
      gatewayStatus = { ok: true, status: process.status || 'running', processId: process.id };
    } else {
      gatewayStatus = { ok: false, status: 'not_running', processId: undefined };
    }
  } catch {
    gatewayStatus = {
      ok: false,
      status: 'error',
      processId: undefined,
    };
  }

  // Parse recent gateway logs for agent activity
  const recentActivity: ParsedActivity[] = [];
  try {
    const proc = await sandbox.startProcess(
      `sh -c 'tail -n 200 /tmp/openclaw/openclaw-*.log 2>/dev/null || echo ""'`,
    );
    await waitForProcess(proc, 5000);
    const logs = await proc.getLogs();
    const logContent = (logs.stdout || '').trim();

    if (logContent && logContent !== '(no log file)') {
      const lines = logContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const parsed = parseLogLine(lines[i], i);
        if (parsed) {
          recentActivity.push(parsed);
        }
      }
    }
  } catch {
    // Log parsing is best-effort
  }

  return c.json({
    gateway: gatewayStatus,
    recentActivity: recentActivity.slice(-50),
  });
});

// GET /api/team/activity - Returns parsed gateway log lines as activity items
// Supports cursor-based pagination:
//   ?limit=20         — max items to return (default 30, max 100)
//   ?before=<ts>      — cursor: only items with timestamp < this value
//   ?before_id=<id>   — tie-breaker: exclude this ID when timestamps match
teamApi.get('/activity', async (c) => {
  const sandbox = c.get('sandbox');
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '30', 10), 1), 100);
  const beforeCursor = c.req.query('before') ? parseInt(c.req.query('before')!, 10) : null;
  const beforeId = c.req.query('before_id') || null;
  // Heuristic: read limit*20 lines because roughly 5-10% of raw log lines
  // parse into valid activity items. Cap at 2000 to avoid slow reads.
  const lineCount = Math.min(limit * 20, 2000);

  const allParsed: ParsedActivity[] = [];
  try {
    const proc = await sandbox.startProcess(
      `sh -c 'tail -n ${lineCount} /tmp/openclaw/openclaw-*.log 2>/dev/null || echo ""'`,
    );
    await waitForProcess(proc, 5000);
    const logs = await proc.getLogs();
    const logContent = (logs.stdout || '').trim();

    if (logContent && logContent !== '' && logContent !== '(no log file)') {
      const lines = logContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const parsed = parseLogLine(lines[i], i);
        if (parsed) {
          allParsed.push(parsed);
        }
      }
    }
  } catch {
    // Best-effort
  }

  // Sort chronologically (oldest first)
  allParsed.sort((a, b) => a.timestamp - b.timestamp);

  // Apply cursor filter — use compound cursor (timestamp + id) to avoid
  // skipping items that share the same timestamp at page boundaries.
  let filtered = allParsed;
  if (beforeCursor !== null) {
    filtered = allParsed.filter((item) =>
      item.timestamp < beforeCursor ||
      (item.timestamp === beforeCursor && beforeId !== null && item.id !== beforeId),
    );
  }

  // Take the most recent `limit` items (tail of the sorted array)
  const hasMore = filtered.length > limit;
  const items = filtered.slice(-limit);
  const nextCursor = hasMore ? items[0].timestamp : null;
  const nextCursorId = hasMore ? items[0].id : null;

  return c.json({ items, nextCursor, nextCursorId });
});

// POST /api/team/send-message — Send a message to an agent via the gateway
teamApi.post('/send-message', async (c) => {
  const sandbox = c.get('sandbox');
  const body = await c.req.json<{ to?: string; message?: string }>();

  const { to, message } = body;
  if (!to || !AGENT_IDS.includes(to)) {
    return c.json({ error: `Invalid agent: ${to}` }, 400);
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return c.json({ error: 'Message is required' }, 400);
  }
  if (message.length > 4000) {
    return c.json({ error: 'Message too long (max 4000 chars)' }, 400);
  }

  const env = c.env;

  // Connect to gateway via WebSocket (protocol v3 challenge flow)
  const wsUrl = new URL('http://localhost/');
  if (env.MOLTBOT_GATEWAY_TOKEN) {
    wsUrl.searchParams.set('token', env.MOLTBOT_GATEWAY_TOKEN);
  }
  const wsRequest = new Request(wsUrl.toString(), {
    headers: { 'Upgrade': 'websocket', 'X-Forwarded-For': '127.0.0.1' },
  });

  let response: { webSocket?: WebSocket | null };
  try {
    response = await sandbox.wsConnect(wsRequest, MOLTBOT_PORT);
  } catch (err) {
    return c.json({ error: 'Failed to connect to gateway' }, 502);
  }

  if (!response.webSocket) {
    return c.json({ error: 'No WebSocket in gateway response' }, 502);
  }

  const ws = response.webSocket;
  ws.accept();

  const WS_TIMEOUT = 15_000;

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close(1000, 'timeout');
        reject(new Error('Gateway timeout'));
      }, WS_TIMEOUT);

      let connected = false;
      let connectSent = false;

      function sendConnect() {
        if (connectSent) return;
        connectSent = true;
        ws.send(JSON.stringify({
          type: 'req',
          id: 'chat-connect',
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              displayName: 'Team Dashboard',
              version: '1.0.0',
              mode: 'backend',
              platform: 'server',
            },
            role: 'operator',
            scopes: [],
            caps: [],
            auth: { token: env.MOLTBOT_GATEWAY_TOKEN || '' },
          },
        }));
      }

      // Fallback if challenge is delayed
      const challengeTimer = setTimeout(() => sendConnect(), 750);

      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');

          // Handle connect.challenge event
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            clearTimeout(challengeTimer);
            sendConnect();
            return;
          }

          // Wait for connect response
          if (!connected && msg.type === 'res' && msg.id === 'chat-connect') {
            if (msg.error) {
              clearTimeout(timeout);
              ws.close(1000, 'connect error');
              reject(new Error(`Gateway connect error: ${msg.error.message}`));
              return;
            }
            connected = true;

            // Send the user message
            ws.send(JSON.stringify({
              type: 'req',
              id: `msg-${Date.now()}`,
              method: 'sessions.send',
              params: { to, message: message.trim() },
            }));
            return;
          }

          // Wait for sessions.send response
          if (connected && msg.type === 'res' && msg.id?.startsWith('msg-')) {
            clearTimeout(timeout);
            ws.close(1000, 'done');
            if (msg.error) {
              reject(new Error(`Send error: ${msg.error.message}`));
            } else {
              resolve();
            }
          }
        } catch {
          // Ignore parse errors
        }
      });

      ws.addEventListener('close', (event: CloseEvent) => {
        clearTimeout(timeout);
        clearTimeout(challengeTimer);
        // Reject whether we connected or not — if the promise had already
        // resolved/rejected, this extra reject is harmless (promises settle once).
        reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`));
      });

      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        clearTimeout(challengeTimer);
        reject(new Error('WebSocket error'));
      });
    });

    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: msg }, 502);
  }
});

// Mount project management sub-routes
import { projectsApi } from './projects-api';
teamApi.route('/projects', projectsApi);

// Mount orchestrator sub-routes
import { orchestratorApi } from './orchestrator-api';
teamApi.route('/orchestrator', orchestratorApi);

export { teamApi };
