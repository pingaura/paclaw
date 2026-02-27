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
