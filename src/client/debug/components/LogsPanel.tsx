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
