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
