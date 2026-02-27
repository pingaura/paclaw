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
