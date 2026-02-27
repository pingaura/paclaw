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
