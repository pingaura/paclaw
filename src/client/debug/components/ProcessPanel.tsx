import { useState, useEffect, useCallback, useRef } from 'react';

interface ProcessInfo {
  id: string;
  command: string;
  status: string;
  startTime: string;
  endTime: string;
  exitCode: number | null;
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
