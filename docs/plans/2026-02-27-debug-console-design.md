# Interactive Debug Console — Design

## Goal

A standalone React SPA at `/_debug/` with a terminal/hacker aesthetic that provides interactive access to all 9 debug endpoints in one polished UI. Behind Cloudflare Access.

## Architecture

Third Vite entry point (alongside admin and team). React 19 + TypeScript. Calls existing `/debug/*` API endpoints — no new backend logic needed, only new route handler + asset serving.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ PACLAW DEBUG CONSOLE          [connected] 18:32 IST  │
├────────┬─────────────────────────────────────────────────┤
│        │                                                 │
│  CLI   │  > rclone copy r2:moltbot-data/workspace ...    │
│  PROC  │  command: rclone copy ...                       │
│  LOGS  │  status: completed                              │
│  CONF  │  exitCode: 0                                    │
│  ENV   │                                                 │
│  GW    │  --- stdout ---                                 │
│  WS    │  Transferred: 2.4 KiB                           │
│  VER   │                                                 │
│        │  --- stderr ---                                  │
│        │  (empty)                                         │
│        │                                                 │
│        │  ─────────────────────────────────────────────── │
│        │  $ █                                            │
└────────┴─────────────────────────────────────────────────┘
```

Left sidebar: 8 nav items. Clicking switches the main panel.

## Panels

| Panel | Endpoint(s) | Interactivity |
|-------|------------|---------------|
| **CLI** | `/debug/cli` | Terminal input, command history (up arrow), streamed output |
| **PROC** | `/debug/processes` | Auto-refresh toggle, click process to expand logs |
| **LOGS** | `/debug/logs`, `/debug/gateway-log` | Tab between process logs and gateway log, line count control, search |
| **CONF** | `/debug/container-config` | Syntax-highlighted JSON, copy button |
| **ENV** | `/debug/env` | Key/value table with green checkmark / red X |
| **GW** | `/debug/gateway-api` | Path input, send, view response |
| **WS** | `/debug/ws-test` (ported) | Connect/disconnect, send frames, message log |
| **VER** | `/debug/version` | Static display of openclaw + node versions |

## File Structure

```
debug.html                              # Vite entry point
src/client/
  debug-main.tsx                        # React root mount
  debug/
    DebugApp.tsx                        # Shell: sidebar + panel switching
    DebugApp.css                        # Terminal theme
    components/
      Sidebar.tsx
      CliPanel.tsx
      ProcessPanel.tsx
      LogsPanel.tsx
      ConfigPanel.tsx
      EnvPanel.tsx
      GatewayApiPanel.tsx
      WebSocketPanel.tsx
      VersionPanel.tsx
    hooks/
      useDebugApi.ts                    # Shared fetch wrapper
```

## Routing

- `src/routes/debug-ui.ts` — serves `debug.html` for `/_debug/*`
- Mount at `/_debug` in `src/index.ts` (after CF Access middleware)
- `/_debug/assets/*` in public routes for static assets
- Add `debug` to Vite `rollupOptions.input`

## Design Language

- Background: `#0a0a0a`
- Text: `#00ff41` (matrix green) for output, `#e0e0e0` for chrome
- Font: `JetBrains Mono` with monospace fallback
- Accents: `#ff6600` warnings, `#ff0000` errors, `#00bfff` info
- Status badges: colored dots (green=running, yellow=starting, red=failed, gray=completed)
- Subtle CRT glow on terminal output
- Blinking cursor on CLI input

## Auth

Behind Cloudflare Access (same as admin/team). Additionally requires `DEBUG_ROUTES=true` env var.

## No New Backend

All panels call existing `/debug/*` endpoints via `fetch()`. No API changes needed.
