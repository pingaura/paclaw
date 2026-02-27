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
