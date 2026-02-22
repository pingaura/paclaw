interface ConnectionStatusProps {
  connected: boolean;
}

export default function ConnectionStatus({ connected }: ConnectionStatusProps) {
  return (
    <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
      <span className="connection-dot" />
      <span className="connection-label">
        {connected ? 'Live' : 'Reconnecting...'}
      </span>
    </div>
  );
}
