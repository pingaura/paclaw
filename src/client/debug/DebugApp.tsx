import { useState } from 'react';
import './DebugApp.css';

type Panel = 'cli' | 'proc' | 'logs' | 'conf' | 'env' | 'gw' | 'ws' | 'ver';

const NAV_ITEMS: { id: Panel; label: string; icon: string }[] = [
  { id: 'cli', label: 'CLI', icon: '>' },
  { id: 'proc', label: 'PROC', icon: '⚙' },
  { id: 'logs', label: 'LOGS', icon: '☰' },
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
        <span className="dc-title">⚡ PACLAW DEBUG CONSOLE</span>
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
