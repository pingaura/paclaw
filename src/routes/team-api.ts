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

function parseLogLine(line: string, index: number): ParsedActivity | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Match agent using word-boundary regex to avoid false positives
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

  // Extract timestamp from log line if present (ISO format)
  let timestamp = Date.now() - (index * 1000);
  const isoMatch = trimmed.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]).getTime();
    if (!isNaN(parsed)) timestamp = parsed;
  }

  // Truncate summary
  const summary = trimmed.length > 200 ? trimmed.slice(0, 197) + '...' : trimmed;

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

export { teamApi };
