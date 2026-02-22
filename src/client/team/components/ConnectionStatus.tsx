interface ConnectionStatusProps {
  connected: boolean;
  error: string | null;
}

export default function ConnectionStatus({ connected, error }: ConnectionStatusProps) {
  let label: string;
  let className: string;

  if (connected) {
    label = 'Live';
    className = 'connected';
  } else if (error) {
    label = 'Disconnected';
    className = 'rejected';
  } else {
    label = 'Reconnecting...';
    className = 'disconnected';
  }

  return (
    <div className={`connection-status ${className}`} title={error || undefined}>
      <span className="connection-dot" />
      <span className="connection-label">{label}</span>
    </div>
  );
}
