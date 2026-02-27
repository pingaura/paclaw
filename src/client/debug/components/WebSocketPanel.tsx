import { useState, useRef, useCallback, useEffect } from 'react';

interface WsMessage {
  direction: 'sent' | 'received' | 'info' | 'error';
  text: string;
  timestamp: number;
}

export default function WebSocketPanel() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((direction: WsMessage['direction'], text: string) => {
    setMessages((prev) => [...prev, { direction, text, timestamp: Date.now() }]);
  }, []);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/`;
    addMessage('info', `Connecting to ${url}...`);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      addMessage('info', 'Connected!');
    };
    ws.onmessage = (e) => {
      addMessage('received', e.data);
    };
    ws.onerror = () => {
      addMessage('error', 'WebSocket error');
    };
    ws.onclose = (e) => {
      setConnected(false);
      addMessage('info', `Closed: code=${e.code} reason=${e.reason || '(none)'}`);
      wsRef.current = null;
    };
  }, [addMessage]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
  }, []);

  const send = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current) return;
    wsRef.current.send(text);
    addMessage('sent', text);
    setInput('');
  }, [addMessage]);

  const sendConnectFrame = useCallback(() => {
    const frame = {
      type: 'req',
      id: `debug-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 1,
        maxProtocol: 1,
        client: { id: 'debug-console', displayName: 'Debug Console', version: '1.0.0', mode: 'webchat', platform: 'web' },
        role: 'operator',
        scopes: [],
      },
    };
    const text = JSON.stringify(frame);
    wsRef.current?.send(text);
    addMessage('sent', text);
  }, [addMessage]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const colorFor = (dir: WsMessage['direction']) => {
    if (dir === 'sent') return 'var(--dc-blue)';
    if (dir === 'received') return 'var(--dc-green)';
    if (dir === 'error') return 'var(--dc-red)';
    return 'var(--dc-yellow)';
  };

  return (
    <div className="dc-panel">
      <div className="dc-panel-title">
        WEBSOCKET
        <span style={{ float: 'right', display: 'flex', gap: 8 }}>
          {!connected ? (
            <button className="dc-btn" onClick={connect}>Connect</button>
          ) : (
            <>
              <button className="dc-btn" onClick={sendConnectFrame}>Send Connect Frame</button>
              <button className="dc-btn" onClick={disconnect}>Disconnect</button>
            </>
          )}
          <button className="dc-btn" onClick={() => setMessages([])}>Clear</button>
        </span>
      </div>
      <div className="dc-output" ref={outputRef}>
        {messages.length === 0 && (
          <span className="dc-text-dim">Click Connect to open a WebSocket connection</span>
        )}
        {messages.map((msg, i) => {
          const time = new Date(msg.timestamp).toISOString().slice(11, 23);
          return (
            <div key={i} style={{ color: colorFor(msg.direction), marginBottom: 2 }}>
              <span className="dc-text-dim">[{time}]</span>{' '}
              {msg.direction === 'sent' ? 'SEND: ' : msg.direction === 'received' ? 'RECV: ' : ''}
              {msg.text}
            </div>
          );
        })}
      </div>
      <div className="dc-input-bar">
        <span className="dc-prompt">{'>'}</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
          placeholder="JSON message to send..."
          spellCheck={false}
          autoComplete="off"
          disabled={!connected}
        />
        <button className="dc-btn" onClick={() => send(input)} disabled={!connected}>Send</button>
      </div>
    </div>
  );
}
