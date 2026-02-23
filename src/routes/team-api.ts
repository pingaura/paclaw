import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { findExistingMoltbotProcess, waitForProcess } from '../gateway';

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

function parseLogLine(line: string, index: number): ParsedActivity | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Default timestamp based on line index (older lines first)
  let timestamp = Date.now() - (index * 1000);

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
        return {
          id: `log-${result.timestamp || timestamp}-${result.agent}`,
          timestamp: result.timestamp || timestamp,
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
    id: `log-${timestamp}-${matchedAgent}`,
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
teamApi.get('/activity', async (c) => {
  const sandbox = c.get('sandbox');
  // lineCount is safe: parseInt guarantees a number, clamped to [1, 1000]
  const lineCount = Math.min(Math.max(parseInt(c.req.query('lines') || '200', 10), 1), 1000);

  const items: ParsedActivity[] = [];
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
          items.push(parsed);
        }
      }
    }
  } catch {
    // Best-effort
  }

  return c.json({ items });
});

// Mount project management sub-routes
import { projectsApi } from './projects-api';
teamApi.route('/projects', projectsApi);

// Mount orchestrator sub-routes
import { orchestratorApi } from './orchestrator-api';
teamApi.route('/orchestrator', orchestratorApi);

export { teamApi };
