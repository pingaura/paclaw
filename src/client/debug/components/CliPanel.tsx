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

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

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
