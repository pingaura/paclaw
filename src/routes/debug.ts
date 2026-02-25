import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { findExistingMoltbotProcess, waitForProcess } from '../gateway';

/**
 * Debug routes for inspecting container state
 * Note: These routes should be protected by Cloudflare Access middleware
 * when mounted in the main app
 */
const DEFAULT_TZ = 'Asia/Kolkata';

function formatTime(date: Date | string | undefined, tz: string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', { timeZone: tz, hour12: false });
}

const debug = new Hono<AppEnv>();

// GET /debug/version - Returns version info from inside the container
debug.get('/version', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    // Get OpenClaw version
    const versionProcess = await sandbox.startProcess('openclaw --version');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const versionLogs = await versionProcess.getLogs();
    const moltbotVersion = (versionLogs.stdout || versionLogs.stderr || '').trim();

    // Get node version
    const nodeProcess = await sandbox.startProcess('node --version');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const nodeLogs = await nodeProcess.getLogs();
    const nodeVersion = (nodeLogs.stdout || '').trim();

    return c.text(`openclaw: ${moltbotVersion}\nnode: ${nodeVersion}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: Failed to get version info: ${errorMessage}`, 500);
  }
});

// GET /debug/processes - List all processes with optional logs
debug.get('/processes', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processes = await sandbox.listProcesses();
    const includeLogs = c.req.query('logs') === 'true';
    const tz = c.req.query('tz') || DEFAULT_TZ;

    const processData = await Promise.all(
      processes.map(async (p) => {
        const data: Record<string, unknown> = {
          id: p.id,
          command: p.command,
          status: p.status,
          startTime: formatTime(p.startTime, tz),
          endTime: formatTime(p.endTime, tz),
          exitCode: p.exitCode,
        };

        if (includeLogs) {
          try {
            const logs = await p.getLogs();
            data.stdout = logs.stdout || '';
            data.stderr = logs.stderr || '';
          } catch {
            data.logs_error = 'Failed to retrieve logs';
          }
        }

        return data;
      }),
    );

    // Sort by status (running first, then starting, completed, failed)
    // Within each status, sort by startTime descending (newest first)
    const statusOrder: Record<string, number> = {
      running: 0,
      starting: 1,
      completed: 2,
      failed: 3,
    };

    processData.sort((a, b) => {
      const statusA = statusOrder[a.status as string] ?? 99;
      const statusB = statusOrder[b.status as string] ?? 99;
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // Within same status, sort by startTime descending
      const timeA = (a.startTime as string) || '';
      const timeB = (b.startTime as string) || '';
      return timeB.localeCompare(timeA);
    });

    const lines = [`count: ${processData.length}`, ''];
    for (const p of processData) {
      lines.push(`[${p.id}]`);
      lines.push(`  command: ${p.command}`);
      lines.push(`  status: ${p.status}`);
      if (p.startTime) lines.push(`  startTime: ${p.startTime}`);
      if (p.endTime) lines.push(`  endTime: ${p.endTime}`);
      if (p.exitCode !== undefined && p.exitCode !== null) lines.push(`  exitCode: ${p.exitCode}`);
      if (includeLogs) {
        lines.push(`  stdout: ${(p.stdout as string) || '(empty)'}`);
        lines.push(`  stderr: ${(p.stderr as string) || '(empty)'}`);
      }
      lines.push('');
    }
    return c.text(lines.join('\n'));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: ${errorMessage}`, 500);
  }
});

// GET /debug/gateway-api - Probe the moltbot gateway HTTP API
debug.get('/gateway-api', async (c) => {
  const sandbox = c.get('sandbox');
  const path = c.req.query('path') || '/';
  const MOLTBOT_PORT = 18789;

  try {
    const url = `http://localhost:${MOLTBOT_PORT}${path}`;
    const response = await sandbox.containerFetch(new Request(url), MOLTBOT_PORT);
    const contentType = response.headers.get('content-type') || '';

    let body: string | object;
    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    const text = [
      `path: ${path}`,
      `status: ${response.status}`,
      `contentType: ${contentType}`,
      '',
      '--- body ---',
      bodyStr,
    ].join('\n');
    return c.text(text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: ${errorMessage}\npath: ${path}`, 500);
  }
});

// GET /debug/cli - Test OpenClaw CLI commands
debug.get('/cli', async (c) => {
  const sandbox = c.get('sandbox');
  const cmd = c.req.query('cmd') || 'openclaw --help';

  try {
    const proc = await sandbox.startProcess(cmd);
    await waitForProcess(proc, 120000);

    const logs = await proc.getLogs();
    const status = proc.getStatus ? await proc.getStatus() : proc.status;
    const text = [
      `command: ${cmd}`,
      `status: ${status}`,
      `exitCode: ${proc.exitCode}`,
      '',
      '--- stdout ---',
      logs.stdout || '(empty)',
      '',
      '--- stderr ---',
      logs.stderr || '(empty)',
    ].join('\n');
    return c.text(text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: ${errorMessage}\ncommand: ${cmd}`, 500);
  }
});

// GET /debug/logs - Returns container logs for debugging
debug.get('/logs', async (c) => {
  const sandbox = c.get('sandbox');
  try {
    const processId = c.req.query('id');
    let process = null;

    if (processId) {
      const processes = await sandbox.listProcesses();
      process = processes.find((p) => p.id === processId);
      if (!process) {
        return c.text(`status: not_found\nmessage: Process ${processId} not found`, 404);
      }
    } else {
      process = await findExistingMoltbotProcess(sandbox);
      if (!process) {
        return c.text('status: no_process\nmessage: No Moltbot process is currently running');
      }
    }

    const logs = await process.getLogs();
    const text = [
      `status: ok`,
      `process_id: ${process.id}`,
      `process_status: ${process.status}`,
      '',
      '--- stdout ---',
      logs.stdout || '(empty)',
      '',
      '--- stderr ---',
      logs.stderr || '(empty)',
    ].join('\n');
    return c.text(text);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`status: error\nmessage: Failed to get logs: ${errorMessage}`, 500);
  }
});

// GET /debug/gateway-log - Tail of OpenClaw gateway log (for AI/API errors when assistant reply is empty)
debug.get('/gateway-log', async (c) => {
  const sandbox = c.get('sandbox');
  const lines = Math.min(Math.max(parseInt(c.req.query('lines') || '300', 10), 1), 2000);
  try {
    const proc = await sandbox.startProcess(
      `sh -c 'tail -n ${lines} /tmp/openclaw/openclaw-*.log 2>/dev/null || echo "(no log file)"'`,
    );
    await waitForProcess(proc, 5000);
    const logs = await proc.getLogs();
    const content = (logs.stdout || '').trim() || (logs.stderr || '').trim() || '(empty)';
    return c.text(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: ${errorMessage}`, 500);
  }
});

// GET /debug/ws-test - Interactive WebSocket debug page
debug.get('/ws-test', async (c) => {
  const host = c.req.header('host') || 'localhost';
  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const wsProtocol = protocol === 'https' ? 'wss' : 'ws';

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Debug</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #0f0; }
    #log { white-space: pre-wrap; background: #000; padding: 10px; height: 400px; overflow-y: auto; border: 1px solid #333; }
    button { margin: 5px; padding: 10px; }
    input { padding: 10px; width: 300px; }
    .error { color: #f00; }
    .sent { color: #0ff; }
    .received { color: #0f0; }
    .info { color: #ff0; }
  </style>
</head>
<body>
  <h1>WebSocket Debug Tool</h1>
  <div>
    <button id="connect">Connect</button>
    <button id="disconnect" disabled>Disconnect</button>
    <button id="clear">Clear Log</button>
  </div>
  <div style="margin: 10px 0;">
    <input id="message" placeholder="JSON message to send..." />
    <button id="send" disabled>Send</button>
  </div>
  <div style="margin: 10px 0;">
    <button id="sendConnect" disabled>Send Connect Frame</button>
  </div>
  <div id="log"></div>
  
  <script>
    const wsUrl = '${wsProtocol}://${host}/';
    let ws = null;
    
    const log = (msg, className = '') => {
      const logEl = document.getElementById('log');
      const time = new Date().toISOString().substr(11, 12);
      logEl.innerHTML += '<span class="' + className + '">[' + time + '] ' + msg + '</span>\\n';
      logEl.scrollTop = logEl.scrollHeight;
    };
    
    document.getElementById('connect').onclick = () => {
      log('Connecting to ' + wsUrl + '...', 'info');
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        log('Connected!', 'info');
        document.getElementById('connect').disabled = true;
        document.getElementById('disconnect').disabled = false;
        document.getElementById('send').disabled = false;
        document.getElementById('sendConnect').disabled = false;
      };
      
      ws.onmessage = (e) => {
        log('RECV: ' + e.data, 'received');
        try {
          const parsed = JSON.parse(e.data);
          log('  Parsed: ' + JSON.stringify(parsed, null, 2), 'received');
        } catch {}
      };
      
      ws.onerror = (e) => {
        log('ERROR: ' + JSON.stringify(e), 'error');
      };
      
      ws.onclose = (e) => {
        log('Closed: code=' + e.code + ' reason=' + e.reason, 'info');
        document.getElementById('connect').disabled = false;
        document.getElementById('disconnect').disabled = true;
        document.getElementById('send').disabled = true;
        document.getElementById('sendConnect').disabled = true;
        ws = null;
      };
    };
    
    document.getElementById('disconnect').onclick = () => {
      if (ws) ws.close();
    };
    
    document.getElementById('clear').onclick = () => {
      document.getElementById('log').innerHTML = '';
    };
    
    document.getElementById('send').onclick = () => {
      const msg = document.getElementById('message').value;
      if (ws && msg) {
        log('SEND: ' + msg, 'sent');
        ws.send(msg);
      }
    };
    
    document.getElementById('sendConnect').onclick = () => {
      if (!ws) return;
      const connectFrame = {
        type: 'req',
        id: 'debug-' + Date.now(),
        method: 'connect',
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: 'debug-tool',
            displayName: 'Debug Tool',
            version: '1.0.0',
            mode: 'webchat',
            platform: 'web'
          },
          role: 'operator',
          scopes: []
        }
      };
      const msg = JSON.stringify(connectFrame);
      log('SEND Connect Frame: ' + msg, 'sent');
      ws.send(msg);
    };
    
    document.getElementById('message').onkeypress = (e) => {
      if (e.key === 'Enter') document.getElementById('send').click();
    };
  </script>
</body>
</html>`;

  return c.html(html);
});

// GET /debug/env - Show environment configuration (sanitized)
debug.get('/env', async (c) => {
    const lines = [
      `anthropic_key: ${c.env.ANTHROPIC_API_KEY ? 'yes' : 'no'}`,
      `openai_key: ${c.env.OPENAI_API_KEY ? 'yes' : 'no'}`,
      `gateway_token: ${c.env.MOLTBOT_GATEWAY_TOKEN ? 'yes' : 'no'}`,
      `r2_access_key: ${c.env.R2_ACCESS_KEY_ID ? 'yes' : 'no'}`,
      `r2_secret_key: ${c.env.R2_SECRET_ACCESS_KEY ? 'yes' : 'no'}`,
      `cf_account_id: ${c.env.CF_ACCOUNT_ID ? 'yes' : 'no'}`,
      `dev_mode: ${c.env.DEV_MODE || 'not set'}`,
      `debug_routes: ${c.env.DEBUG_ROUTES || 'not set'}`,
      `bind_mode: lan`,
      `cf_access_team_domain: ${c.env.CF_ACCESS_TEAM_DOMAIN || 'not set'}`,
      `cf_access_aud: ${c.env.CF_ACCESS_AUD ? 'yes' : 'no'}`,
    ];
    return c.text(lines.join('\n'));
});

// GET /debug/container-config - Read the moltbot config from inside the container
debug.get('/container-config', async (c) => {
  const sandbox = c.get('sandbox');

  try {
    const proc = await sandbox.startProcess('cat /root/.openclaw/openclaw.json');
    await waitForProcess(proc, 5000);

    const logs = await proc.getLogs();
    const stdout = logs.stdout || '';
    const stderr = logs.stderr || '';

    let pretty = stdout;
    try {
      pretty = JSON.stringify(JSON.parse(stdout), null, 2);
    } catch {
      // Not valid JSON, use raw
    }

    const header = `status: ${proc.status}\n`;
    if (stderr) {
      return c.text(`${header}stderr: ${stderr}\n\n${pretty}`);
    }
    return c.text(`${header}\n${pretty}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.text(`error: ${errorMessage}`, 500);
  }
});

export { debug };
