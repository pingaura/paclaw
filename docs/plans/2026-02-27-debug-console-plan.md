# Debug Console Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone React SPA at `/_debug/` with a terminal/hacker aesthetic that wraps all 9 debug endpoints in an interactive UI.

**Architecture:** Third Vite entry point (`debug.html`) alongside admin (`index.html`) and team (`team.html`). React 19 + TypeScript. No new backend logic — only a new route handler to serve the SPA and public asset routes. All panels call existing `/debug/*` endpoints via `fetch()`.

**Tech Stack:** React 19, TypeScript, Vite 6, Hono (route handler), CSS (no preprocessor)

**Design doc:** `docs/plans/2026-02-27-debug-console-design.md`

---

### Task 1: Scaffold — Vite entry point, React root, route handler

**Files:**
- Create: `debug.html`
- Create: `src/client/debug-main.tsx`
- Create: `src/client/debug/DebugApp.tsx`
- Create: `src/client/debug/DebugApp.css`
- Create: `src/routes/debug-ui.ts`
- Modify: `vite.config.ts:11-15` (add debug entry)
- Modify: `src/routes/index.ts:1-7` (export debugUi)
- Modify: `src/routes/public.ts:72-77` (add `/_debug/assets/*`)
- Modify: `src/index.ts:30,219-231` (import + mount `/_debug`)

**Step 1: Create `debug.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Debug Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/debug-main.tsx"></script>
  </body>
</html>
```

**Step 2: Create `src/client/debug-main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DebugApp from './debug/DebugApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DebugApp />
  </StrictMode>,
);
```

**Step 3: Create `src/client/debug/DebugApp.tsx` (minimal shell)**

```tsx
import { useState } from 'react';
import './DebugApp.css';

type Panel = 'cli' | 'proc' | 'logs' | 'conf' | 'env' | 'gw' | 'ws' | 'ver';

const NAV_ITEMS: { id: Panel; label: string; icon: string }[] = [
  { id: 'cli', label: 'CLI', icon: '>' },
  { id: 'proc', label: 'PROC', icon: '⚙' },
  { id: 'logs', label: 'LOGS', icon: '📋' },
  { id: 'conf', label: 'CONF', icon: '{}' },
  { id: 'env', label: 'ENV', icon: '$' },
  { id: 'gw', label: 'GW', icon: '⇄' },
  { id: 'ws', label: 'WS', icon: '⚡' },
  { id: 'ver', label: 'VER', icon: 'v' },
];

export default function DebugApp() {
  const [activePanel, setActivePanel] = useState<Panel>('cli');

  return (
    <div className="dc-root">
      <header className="dc-header">
        <span className="dc-title">PACLAW DEBUG CONSOLE</span>
        <span className="dc-clock">{new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })}</span>
      </header>
      <div className="dc-body">
        <nav className="dc-sidebar">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`dc-nav-btn ${activePanel === item.id ? 'dc-nav-active' : ''}`}
              onClick={() => setActivePanel(item.id)}
            >
              <span className="dc-nav-icon">{item.icon}</span>
              <span className="dc-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <main className="dc-main">
          <div className="dc-panel-placeholder">
            {activePanel.toUpperCase()} panel — coming soon
          </div>
        </main>
      </div>
    </div>
  );
}
```

**Step 4: Create `src/client/debug/DebugApp.css` (terminal theme foundation)**

```css
/* Terminal theme */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');

:root {
  --dc-bg: #0a0a0a;
  --dc-surface: #111111;
  --dc-border: #1a1a1a;
  --dc-green: #00ff41;
  --dc-green-dim: #00aa2a;
  --dc-text: #e0e0e0;
  --dc-text-dim: #666666;
  --dc-orange: #ff6600;
  --dc-red: #ff0000;
  --dc-blue: #00bfff;
  --dc-yellow: #ffd700;
  --dc-font: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

/* Override global styles from index.css */
body {
  background: var(--dc-bg) !important;
  font-family: var(--dc-font) !important;
  color: var(--dc-text) !important;
}

.dc-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* Header */
.dc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: var(--dc-surface);
  border-bottom: 1px solid var(--dc-green-dim);
  flex-shrink: 0;
}

.dc-title {
  color: var(--dc-green);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 2px;
}

.dc-clock {
  color: var(--dc-text-dim);
  font-size: 12px;
}

/* Body layout */
.dc-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.dc-sidebar {
  display: flex;
  flex-direction: column;
  width: 72px;
  background: var(--dc-surface);
  border-right: 1px solid var(--dc-border);
  padding: 8px 0;
  flex-shrink: 0;
}

.dc-nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  background: none;
  border: none;
  color: var(--dc-text-dim);
  font-family: var(--dc-font);
  font-size: 10px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  border-left: 2px solid transparent;
}

.dc-nav-btn:hover {
  color: var(--dc-text);
  background: rgba(255, 255, 255, 0.03);
}

.dc-nav-active {
  color: var(--dc-green) !important;
  border-left-color: var(--dc-green);
  background: rgba(0, 255, 65, 0.05);
}

.dc-nav-icon {
  font-size: 16px;
}

.dc-nav-label {
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* Main panel area */
.dc-main {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.dc-panel-placeholder {
  color: var(--dc-text-dim);
  padding: 40px;
  text-align: center;
  font-size: 14px;
}

/* Shared panel styles */
.dc-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.dc-panel-title {
  color: var(--dc-green);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--dc-border);
}

.dc-output {
  flex: 1;
  overflow-y: auto;
  background: var(--dc-bg);
  border: 1px solid var(--dc-border);
  border-radius: 4px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--dc-text);
}

.dc-output::-webkit-scrollbar {
  width: 6px;
}

.dc-output::-webkit-scrollbar-track {
  background: var(--dc-bg);
}

.dc-output::-webkit-scrollbar-thumb {
  background: var(--dc-border);
  border-radius: 3px;
}

/* Input bar */
.dc-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-radius: 4px;
}

.dc-input-bar .dc-prompt {
  color: var(--dc-green);
  font-weight: 700;
  flex-shrink: 0;
}

.dc-input-bar input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--dc-text);
  font-family: var(--dc-font);
  font-size: 13px;
  caret-color: var(--dc-green);
}

.dc-btn {
  padding: 4px 12px;
  background: var(--dc-surface);
  border: 1px solid var(--dc-border);
  border-radius: 4px;
  color: var(--dc-text);
  font-family: var(--dc-font);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.dc-btn:hover {
  border-color: var(--dc-green);
  color: var(--dc-green);
}

.dc-btn-active {
  border-color: var(--dc-green);
  color: var(--dc-green);
}

/* Loading spinner */
.dc-loading {
  color: var(--dc-text-dim);
  animation: dc-blink 1s step-end infinite;
}

@keyframes dc-blink {
  50% { opacity: 0; }
}

/* Status dots */
.dc-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.dc-status-running { background: var(--dc-green); box-shadow: 0 0 6px var(--dc-green); }
.dc-status-starting { background: var(--dc-yellow); }
.dc-status-completed { background: var(--dc-text-dim); }
.dc-status-failed { background: var(--dc-red); box-shadow: 0 0 6px var(--dc-red); }

/* Error/success text */
.dc-text-error { color: var(--dc-red); }
.dc-text-success { color: var(--dc-green); }
.dc-text-warn { color: var(--dc-orange); }
.dc-text-info { color: var(--dc-blue); }
.dc-text-dim { color: var(--dc-text-dim); }
```

**Step 5: Create `src/routes/debug-ui.ts`**

```typescript
import { Hono } from 'hono';
import type { AppEnv } from '../types';

const debugUi = new Hono<AppEnv>();

debugUi.get('*', async (c) => {
  const url = new URL(c.req.url);
  return c.env.ASSETS.fetch(new Request(new URL('/debug.html', url.origin).toString()));
});

export { debugUi };
```

**Step 6: Add debug entry to `vite.config.ts`**

In `vite.config.ts`, add the `debug` entry to `rollupOptions.input`:

```typescript
input: {
  admin: resolve(__dirname, "index.html"),
  team: resolve(__dirname, "team.html"),
  debug: resolve(__dirname, "debug.html"),
},
```

**Step 7: Export `debugUi` from `src/routes/index.ts`**

Add this line:

```typescript
export { debugUi } from './debug-ui';
```

**Step 8: Add `/_debug/assets/*` to `src/routes/public.ts`**

After the `/_team/assets/*` handler (line 77), add:

```typescript
publicRoutes.get('/_debug/assets/*', async (c) => {
  const url = new URL(c.req.url);
  const assetPath = url.pathname.replace('/_debug/assets/', '/assets/');
  const assetUrl = new URL(assetPath, url.origin);
  return c.env.ASSETS.fetch(new Request(assetUrl.toString(), c.req.raw));
});
```

**Step 9: Mount `/_debug` in `src/index.ts`**

Import `debugUi`:

```typescript
import { publicRoutes, api, adminUi, teamUi, teamApi, debug, cdp, debugUi } from './routes';
```

Mount after the `/_team` route (around line 222), before the debug API routes:

```typescript
// Mount Debug Console UI (protected by Cloudflare Access)
app.route('/_debug', debugUi);
```

**Step 10: Build and verify**

Run: `npm run build`
Expected: Build succeeds, `dist/client/debug.html` exists

**Step 11: Commit**

```bash
git add debug.html src/client/debug-main.tsx src/client/debug/DebugApp.tsx src/client/debug/DebugApp.css src/routes/debug-ui.ts vite.config.ts src/routes/index.ts src/routes/public.ts src/index.ts
git commit -m "feat: scaffold debug console SPA at /_debug/"
```

---

### Task 2: useDebugApi hook + CliPanel

**Files:**
- Create: `src/client/debug/hooks/useDebugApi.ts`
- Create: `src/client/debug/components/CliPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render CliPanel)

**Step 1: Create `src/client/debug/hooks/useDebugApi.ts`**

```typescript
import { useState, useCallback } from 'react';

interface DebugResponse {
  loading: boolean;
  error: string | null;
  data: string | null;
}

export function useDebugFetch() {
  const [state, setState] = useState<DebugResponse>({ loading: false, error: null, data: null });

  const fetchDebug = useCallback(async (endpoint: string, params?: Record<string, string>): Promise<string> => {
    setState({ loading: true, error: null, data: null });
    try {
      const url = new URL(`/debug/${endpoint}`, window.location.origin);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }
      const res = await fetch(url.toString());
      const text = await res.text();
      if (!res.ok) {
        setState({ loading: false, error: text, data: null });
        return text;
      }
      setState({ loading: false, error: null, data: text });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: msg, data: null });
      return msg;
    }
  }, []);

  return { ...state, fetchDebug };
}
```

**Step 2: Create `src/client/debug/components/CliPanel.tsx`**

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';

interface HistoryEntry {
  command: string;
  output: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export default function CliPanel() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;

    setCmdHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);

    const entry: HistoryEntry = { command: cmd, output: '', status: 'running', timestamp: Date.now() };
    setHistory((prev) => [...prev, entry]);
    setInput('');

    try {
      const url = new URL('/debug/cli', window.location.origin);
      url.searchParams.set('cmd', cmd);
      const res = await fetch(url.toString());
      const text = await res.text();

      setHistory((prev) =>
        prev.map((e) =>
          e.timestamp === entry.timestamp
            ? { ...e, output: text, status: res.ok ? 'done' : 'error' }
            : e,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      setHistory((prev) =>
        prev.map((e) =>
          e.timestamp === entry.timestamp
            ? { ...e, output: msg, status: 'error' }
            : e,
        ),
      );
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        runCommand(input);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (cmdHistory.length === 0) return;
        const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(newIdx);
        setInput(cmdHistory[newIdx]);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx === -1) return;
        const newIdx = historyIdx + 1;
        if (newIdx >= cmdHistory.length) {
          setHistoryIdx(-1);
          setInput('');
        } else {
          setHistoryIdx(newIdx);
          setInput(cmdHistory[newIdx]);
        }
      }
    },
    [input, cmdHistory, historyIdx, runCommand],
  );

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">COMMAND LINE</div>
      <div className="dc-output" ref={outputRef} onClick={() => inputRef.current?.focus()}>
        {history.map((entry, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div>
              <span className="dc-text-info">$</span>{' '}
              <span style={{ color: '#fff' }}>{entry.command}</span>
            </div>
            {entry.status === 'running' ? (
              <div className="dc-loading">running...</div>
            ) : (
              <div className={entry.status === 'error' ? 'dc-text-warn' : ''}>
                {entry.output}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="dc-input-bar">
        <span className="dc-prompt">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command..."
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
```

**Step 3: Wire CliPanel into DebugApp.tsx**

Replace the placeholder in DebugApp.tsx. Import `CliPanel` and render it when `activePanel === 'cli'`:

```tsx
import CliPanel from './components/CliPanel';

// In the render, replace dc-panel-placeholder:
<main className="dc-main">
  {activePanel === 'cli' && <CliPanel />}
  {activePanel !== 'cli' && (
    <div className="dc-panel-placeholder">
      {activePanel.toUpperCase()} panel — coming soon
    </div>
  )}
</main>
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/client/debug/hooks/useDebugApi.ts src/client/debug/components/CliPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add CLI panel with command history"
```

---

### Task 3: ProcessPanel

**Files:**
- Create: `src/client/debug/components/ProcessPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render)

**Step 1: Create `src/client/debug/components/ProcessPanel.tsx`**

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';

interface ProcessInfo {
  id: string;
  command: string;
  status: string;
  startTime: string;
  endTime: string;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
}

function parseProcesses(text: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  const blocks = text.split(/\n\[/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.startsWith('[') ? block.split('\n') : ('[' + block).split('\n');
    const idMatch = lines[0].match(/\[(.+?)\]/);
    if (!idMatch) continue;

    const proc: ProcessInfo = { id: idMatch[1], command: '', status: '', startTime: '', endTime: '', exitCode: null };
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('command:')) proc.command = trimmed.replace('command:', '').trim();
      else if (trimmed.startsWith('status:')) proc.status = trimmed.replace('status:', '').trim();
      else if (trimmed.startsWith('startTime:')) proc.startTime = trimmed.replace('startTime:', '').trim();
      else if (trimmed.startsWith('endTime:')) proc.endTime = trimmed.replace('endTime:', '').trim();
      else if (trimmed.startsWith('exitCode:')) {
        const val = trimmed.replace('exitCode:', '').trim();
        proc.exitCode = val === 'null' || val === 'undefined' ? null : parseInt(val, 10);
      }
    }
    processes.push(proc);
  }
  return processes;
}

export default function ProcessPanel() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<{ stdout: string; stderr: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProcesses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/debug/processes');
      const text = await res.text();
      setProcesses(parseProcesses(text));
    } catch {
      setProcesses([]);
    }
    setLoading(false);
  }, []);

  const fetchLogs = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedLogs(null);
      return;
    }
    setExpandedId(id);
    setExpandedLogs(null);
    try {
      const res = await fetch(`/debug/logs?id=${id}`);
      const text = await res.text();
      const stdoutMatch = text.match(/--- stdout ---\n([\s\S]*?)(?:\n--- stderr ---|$)/);
      const stderrMatch = text.match(/--- stderr ---\n([\s\S]*?)$/);
      setExpandedLogs({
        stdout: stdoutMatch?.[1]?.trim() || '(empty)',
        stderr: stderrMatch?.[1]?.trim() || '(empty)',
      });
    } catch {
      setExpandedLogs({ stdout: '(failed to load)', stderr: '' });
    }
  }, [expandedId]);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchProcesses, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchProcesses]);

  const statusClass = (s: string) => {
    if (s === 'running') return 'dc-status-running';
    if (s === 'starting') return 'dc-status-starting';
    if (s === 'failed') return 'dc-status-failed';
    return 'dc-status-completed';
  };

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        PROCESSES
        <span style={{ float: 'right', display: 'flex', gap: 8 }}>
          <button className="dc-btn" onClick={fetchProcesses} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            className={`dc-btn ${autoRefresh ? 'dc-btn-active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </span>
      </div>
      <div className="dc-output">
        {processes.length === 0 && !loading && <span className="dc-text-dim">No processes found</span>}
        {processes.map((p) => (
          <div key={p.id} style={{ marginBottom: 8 }}>
            <div
              style={{ cursor: 'pointer', padding: '4px 0' }}
              onClick={() => fetchLogs(p.id)}
            >
              <span className={`dc-status-dot ${statusClass(p.status)}`} />
              <span className="dc-text-info">[{p.id}]</span>{' '}
              <span style={{ color: '#fff' }}>{p.command}</span>
              {p.exitCode !== null && (
                <span className={p.exitCode === 0 ? 'dc-text-success' : 'dc-text-error'}>
                  {' '}exit={p.exitCode}
                </span>
              )}
              {p.startTime && <span className="dc-text-dim"> {p.startTime}</span>}
            </div>
            {expandedId === p.id && (
              <div style={{ marginLeft: 20, marginTop: 4, borderLeft: '1px solid #1a1a1a', paddingLeft: 12 }}>
                {!expandedLogs ? (
                  <span className="dc-loading">loading logs...</span>
                ) : (
                  <>
                    <div className="dc-text-dim">--- stdout ---</div>
                    <div>{expandedLogs.stdout}</div>
                    <div className="dc-text-dim" style={{ marginTop: 4 }}>--- stderr ---</div>
                    <div>{expandedLogs.stderr}</div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Wire into DebugApp.tsx**

```tsx
import ProcessPanel from './components/ProcessPanel';

// Add to render:
{activePanel === 'proc' && <ProcessPanel />}
```

**Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/client/debug/components/ProcessPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add process panel with auto-refresh and log expansion"
```

---

### Task 4: LogsPanel

**Files:**
- Create: `src/client/debug/components/LogsPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render)

**Step 1: Create `src/client/debug/components/LogsPanel.tsx`**

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';

export default function LogsPanel() {
  const [source, setSource] = useState<'gateway' | 'process'>('gateway');
  const [lines, setLines] = useState(300);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = source === 'gateway' ? `/debug/gateway-log?lines=${lines}` : '/debug/logs';
      const res = await fetch(endpoint);
      setContent(await res.text());
    } catch (err) {
      setContent(err instanceof Error ? err.message : 'Failed to fetch logs');
    }
    setLoading(false);
  }, [source, lines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [content]);

  const displayed = filter
    ? content.split('\n').filter((l) => l.toLowerCase().includes(filter.toLowerCase())).join('\n')
    : content;

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        LOGS
        <span style={{ float: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`dc-btn ${source === 'gateway' ? 'dc-btn-active' : ''}`}
            onClick={() => setSource('gateway')}
          >
            Gateway
          </button>
          <button
            className={`dc-btn ${source === 'process' ? 'dc-btn-active' : ''}`}
            onClick={() => setSource('process')}
          >
            Process
          </button>
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            style={{
              background: '#111', border: '1px solid #1a1a1a', color: '#e0e0e0',
              fontFamily: 'var(--dc-font)', fontSize: 12, padding: '4px 8px', borderRadius: 4,
            }}
          >
            <option value={100}>100</option>
            <option value={300}>300</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <button className="dc-btn" onClick={fetchLogs} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            className={`dc-btn ${autoRefresh ? 'dc-btn-active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </span>
      </div>
      <div className="dc-input-bar" style={{ marginBottom: 8, marginTop: 0 }}>
        <span className="dc-prompt">/</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs..."
          spellCheck={false}
        />
      </div>
      <div className="dc-output" ref={outputRef}>
        {displayed || <span className="dc-text-dim">(empty)</span>}
      </div>
    </div>
  );
}
```

**Step 2: Wire into DebugApp.tsx**

```tsx
import LogsPanel from './components/LogsPanel';
{activePanel === 'logs' && <LogsPanel />}
```

**Step 3: Build and verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/client/debug/components/LogsPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add logs panel with gateway/process toggle and filter"
```

---

### Task 5: ConfigPanel + EnvPanel + VersionPanel

**Files:**
- Create: `src/client/debug/components/ConfigPanel.tsx`
- Create: `src/client/debug/components/EnvPanel.tsx`
- Create: `src/client/debug/components/VersionPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render all three)

**Step 1: Create `src/client/debug/components/ConfigPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';

export default function ConfigPanel() {
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/debug/container-config');
      const text = await res.text();
      // Strip the "status: ..." header line
      const jsonStart = text.indexOf('\n{');
      setConfig(jsonStart >= 0 ? text.slice(jsonStart + 1) : text);
    } catch (err) {
      setConfig(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [config]);

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        CONTAINER CONFIG
        <span style={{ float: 'right', display: 'flex', gap: 8 }}>
          <button className="dc-btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button className="dc-btn" onClick={fetchConfig} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
        </span>
      </div>
      <div className="dc-output">
        {loading ? <span className="dc-loading">loading...</span> : config}
      </div>
    </div>
  );
}
```

**Step 2: Create `src/client/debug/components/EnvPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';

interface EnvVar {
  key: string;
  value: string;
  isSet: boolean;
}

function parseEnv(text: string): EnvVar[] {
  return text.split('\n').filter(Boolean).map((line) => {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    return {
      key: key.trim(),
      value,
      isSet: value === 'yes' || (value !== 'no' && value !== 'not set'),
    };
  });
}

export default function EnvPanel() {
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEnv = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/debug/env');
      setEnvVars(parseEnv(await res.text()));
    } catch {
      setEnvVars([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        ENVIRONMENT
        <span style={{ float: 'right' }}>
          <button className="dc-btn" onClick={fetchEnv} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
        </span>
      </div>
      <div className="dc-output">
        {envVars.map((env) => (
          <div key={env.key} style={{ padding: '4px 0', display: 'flex', gap: 12 }}>
            <span style={{ width: 10, textAlign: 'center' }}>
              {env.isSet ? <span className="dc-text-success">✓</span> : <span className="dc-text-error">✗</span>}
            </span>
            <span className="dc-text-info" style={{ minWidth: 200 }}>{env.key}</span>
            <span className="dc-text-dim">{env.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create `src/client/debug/components/VersionPanel.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';

export default function VersionPanel() {
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchVersion = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/debug/version');
      setVersion(await res.text());
    } catch (err) {
      setVersion(err instanceof Error ? err.message : 'Failed to fetch');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">VERSION INFO</div>
      <div className="dc-output">
        {loading ? <span className="dc-loading">loading...</span> : version}
      </div>
    </div>
  );
}
```

**Step 4: Wire all three into DebugApp.tsx**

```tsx
import ConfigPanel from './components/ConfigPanel';
import EnvPanel from './components/EnvPanel';
import VersionPanel from './components/VersionPanel';

{activePanel === 'conf' && <ConfigPanel />}
{activePanel === 'env' && <EnvPanel />}
{activePanel === 'ver' && <VersionPanel />}
```

**Step 5: Build and verify**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/client/debug/components/ConfigPanel.tsx src/client/debug/components/EnvPanel.tsx src/client/debug/components/VersionPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add config, env, and version panels"
```

---

### Task 6: GatewayApiPanel

**Files:**
- Create: `src/client/debug/components/GatewayApiPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render)

**Step 1: Create `src/client/debug/components/GatewayApiPanel.tsx`**

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';

interface RequestEntry {
  path: string;
  response: string;
  status: 'running' | 'done' | 'error';
  timestamp: number;
}

export default function GatewayApiPanel() {
  const [input, setInput] = useState('/');
  const [history, setHistory] = useState<RequestEntry[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  const sendRequest = useCallback(async (path: string) => {
    if (!path.trim()) return;
    const entry: RequestEntry = { path, response: '', status: 'running', timestamp: Date.now() };
    setHistory((prev) => [...prev, entry]);

    try {
      const url = new URL('/debug/gateway-api', window.location.origin);
      url.searchParams.set('path', path);
      const res = await fetch(url.toString());
      const text = await res.text();
      setHistory((prev) =>
        prev.map((e) =>
          e.timestamp === entry.timestamp
            ? { ...e, response: text, status: res.ok ? 'done' : 'error' }
            : e,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fetch failed';
      setHistory((prev) =>
        prev.map((e) =>
          e.timestamp === entry.timestamp ? { ...e, response: msg, status: 'error' } : e,
        ),
      );
    }
  }, []);

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">GATEWAY API PROBE</div>
      <div className="dc-output" ref={outputRef}>
        {history.length === 0 && (
          <span className="dc-text-dim">Enter a gateway path below (e.g. /, /api/v1/status)</span>
        )}
        {history.map((entry, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div>
              <span className="dc-text-info">GET</span>{' '}
              <span style={{ color: '#fff' }}>{entry.path}</span>
            </div>
            {entry.status === 'running' ? (
              <div className="dc-loading">requesting...</div>
            ) : (
              <div className={entry.status === 'error' ? 'dc-text-warn' : ''}>
                {entry.response}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="dc-input-bar">
        <span className="dc-prompt">GET</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendRequest(input)}
          placeholder="/path"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="dc-btn" onClick={() => sendRequest(input)}>Send</button>
      </div>
    </div>
  );
}
```

**Step 2: Wire into DebugApp.tsx**

```tsx
import GatewayApiPanel from './components/GatewayApiPanel';
{activePanel === 'gw' && <GatewayApiPanel />}
```

**Step 3: Build and verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/client/debug/components/GatewayApiPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add gateway API probe panel"
```

---

### Task 7: WebSocketPanel

Port the existing inline HTML WebSocket tester from `src/routes/debug.ts:239-369` into a proper React component.

**Files:**
- Create: `src/client/debug/components/WebSocketPanel.tsx`
- Modify: `src/client/debug/DebugApp.tsx` (import + render)

**Step 1: Create `src/client/debug/components/WebSocketPanel.tsx`**

```tsx
import { useState, useRef, useCallback, useEffect } from 'react';

interface WsMessage {
  direction: 'sent' | 'received' | 'info' | 'error';
  text: string;
  timestamp: number;
}

export default function WebSocketPanel() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((direction: WsMessage['direction'], text: string) => {
    setMessages((prev) => [...prev, { direction, text, timestamp: Date.now() }]);
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/`;
    addMessage('info', `Connecting to ${url}...`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addMessage('info', 'Connected!');
    };
    ws.onmessage = (e) => {
      addMessage('received', e.data);
    };
    ws.onerror = () => {
      addMessage('error', 'WebSocket error');
    };
    ws.onclose = (e) => {
      setConnected(false);
      addMessage('info', `Closed: code=${e.code} reason=${e.reason || '(none)'}`);
      wsRef.current = null;
    };
  }, [addMessage]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  const send = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current) return;
    wsRef.current.send(text);
    addMessage('sent', text);
    setInput('');
  }, [addMessage]);

  const sendConnectFrame = useCallback(() => {
    const frame = {
      type: 'req',
      id: `debug-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 1,
        client: { id: 'debug-console', displayName: 'Debug Console', version: '1.0.0', mode: 'webchat', platform: 'web' },
        role: 'operator',
        scopes: [],
      },
    };
    const text = JSON.stringify(frame);
    wsRef.current?.send(text);
    addMessage('sent', text);
  }, [addMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const colorFor = (dir: WsMessage['direction']) => {
    if (dir === 'sent') return 'var(--dc-blue)';
    if (dir === 'received') return 'var(--dc-green)';
    if (dir === 'error') return 'var(--dc-red)';
    return 'var(--dc-yellow)';
  };

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        WEBSOCKET
        <span style={{ float: 'right', display: 'flex', gap: 8 }}>
          {!connected ? (
            <button className="dc-btn" onClick={connect}>Connect</button>
          ) : (
            <>
              <button className="dc-btn" onClick={sendConnectFrame}>Send Connect Frame</button>
              <button className="dc-btn" onClick={disconnect}>Disconnect</button>
            </>
          )}
          <button className="dc-btn" onClick={() => setMessages([])}>Clear</button>
        </span>
      </div>
      <div className="dc-output" ref={outputRef}>
        {messages.length === 0 && (
          <span className="dc-text-dim">Click Connect to open a WebSocket connection</span>
        )}
        {messages.map((msg, i) => {
          const time = new Date(msg.timestamp).toISOString().slice(11, 23);
          return (
            <div key={i} style={{ color: colorFor(msg.direction), marginBottom: 2 }}>
              <span className="dc-text-dim">[{time}]</span>{' '}
              {msg.direction === 'sent' ? 'SEND: ' : msg.direction === 'received' ? 'RECV: ' : ''}
              {msg.text}
            </div>
          );
        })}
      </div>
      <div className="dc-input-bar">
        <span className="dc-prompt">{'>'}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="JSON message to send..."
          spellCheck={false}
          autoComplete="off"
          disabled={!connected}
        />
        <button className="dc-btn" onClick={() => send(input)} disabled={!connected}>Send</button>
      </div>
    </div>
  );
}
```

**Step 2: Wire into DebugApp.tsx**

```tsx
import WebSocketPanel from './components/WebSocketPanel';
{activePanel === 'ws' && <WebSocketPanel />}
```

**Step 3: Build and verify**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/client/debug/components/WebSocketPanel.tsx src/client/debug/DebugApp.tsx
git commit -m "feat: add WebSocket panel (port from inline HTML)"
```

---

### Task 8: Final polish — live clock, keyboard nav, typecheck

**Files:**
- Modify: `src/client/debug/DebugApp.tsx` (live clock, keyboard shortcuts)
- Modify: `src/client/debug/DebugApp.css` (CRT glow effect, cursor blink)

**Step 1: Add live clock and keyboard navigation to DebugApp.tsx**

Update the header clock to tick every second. Add keyboard shortcut: `1-8` keys to switch panels when not focused on an input.

Replace the full `DebugApp.tsx` with:

```tsx
import { useState, useEffect, useCallback } from 'react';
import CliPanel from './components/CliPanel';
import ProcessPanel from './components/ProcessPanel';
import LogsPanel from './components/LogsPanel';
import ConfigPanel from './components/ConfigPanel';
import EnvPanel from './components/EnvPanel';
import GatewayApiPanel from './components/GatewayApiPanel';
import WebSocketPanel from './components/WebSocketPanel';
import VersionPanel from './components/VersionPanel';
import './DebugApp.css';

type Panel = 'cli' | 'proc' | 'logs' | 'conf' | 'env' | 'gw' | 'ws' | 'ver';

const NAV_ITEMS: { id: Panel; label: string; icon: string; key: string }[] = [
  { id: 'cli', label: 'CLI', icon: '>', key: '1' },
  { id: 'proc', label: 'PROC', icon: '⚙', key: '2' },
  { id: 'logs', label: 'LOGS', icon: '☰', key: '3' },
  { id: 'conf', label: 'CONF', icon: '{}', key: '4' },
  { id: 'env', label: 'ENV', icon: '$', key: '5' },
  { id: 'gw', label: 'GW', icon: '⇄', key: '6' },
  { id: 'ws', label: 'WS', icon: '⚡', key: '7' },
  { id: 'ver', label: 'VER', icon: 'v', key: '8' },
];

function useClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function DebugApp() {
  const [activePanel, setActivePanel] = useState<Panel>('cli');
  const clock = useClock();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const idx = parseInt(e.key, 10);
    if (idx >= 1 && idx <= NAV_ITEMS.length) {
      setActivePanel(NAV_ITEMS[idx - 1].id);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="dc-root">
      <header className="dc-header">
        <span className="dc-title">⚡ PACLAW DEBUG CONSOLE</span>
        <span className="dc-clock">{clock} IST</span>
      </header>
      <div className="dc-body">
        <nav className="dc-sidebar">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`dc-nav-btn ${activePanel === item.id ? 'dc-nav-active' : ''}`}
              onClick={() => setActivePanel(item.id)}
              title={`${item.label} (${item.key})`}
            >
              <span className="dc-nav-icon">{item.icon}</span>
              <span className="dc-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <main className="dc-main">
          {activePanel === 'cli' && <CliPanel />}
          {activePanel === 'proc' && <ProcessPanel />}
          {activePanel === 'logs' && <LogsPanel />}
          {activePanel === 'conf' && <ConfigPanel />}
          {activePanel === 'env' && <EnvPanel />}
          {activePanel === 'gw' && <GatewayApiPanel />}
          {activePanel === 'ws' && <WebSocketPanel />}
          {activePanel === 'ver' && <VersionPanel />}
        </main>
      </div>
    </div>
  );
}
```

**Step 2: Add CRT glow and cursor blink to DebugApp.css**

Append to the end of `DebugApp.css`:

```css
/* CRT glow on output areas */
.dc-output {
  text-shadow: 0 0 2px rgba(0, 255, 65, 0.15);
}

/* Blinking cursor for inputs */
.dc-input-bar input {
  animation: dc-cursor-blink 1.2s step-end infinite;
}

@keyframes dc-cursor-blink {
  50% { caret-color: transparent; }
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/client/debug/DebugApp.tsx src/client/debug/DebugApp.css
git commit -m "feat: add live clock, keyboard nav, and CRT glow polish"
```

---

### Task 9: Run existing tests and final build verification

**Step 1: Run existing test suite**

Run: `npm test`
Expected: All existing tests pass (no regressions — we haven't touched backend logic)

**Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds, `dist/client/debug.html` exists

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 4: Final commit if any remaining changes**

Only if there are uncommitted fixes from steps above.
