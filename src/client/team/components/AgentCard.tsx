import type { AgentMeta, AgentState } from '../types';

interface AgentCardProps {
  meta: AgentMeta;
  state: AgentState;
}

function formatTimeAgo(ts: number): string {
  if (ts === 0) return 'Never';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function AgentCard({ meta, state }: AgentCardProps) {
  return (
    <div className={`agent-card agent-status-${state.status}`}>
      <div className="agent-card-header">
        <span className="agent-emoji">{meta.emoji}</span>
        <div className="agent-identity">
          <span className="agent-name">{meta.name}</span>
          <span className="agent-role">{meta.role}</span>
        </div>
        <span className={`status-dot status-${state.status}`} title={state.status} />
      </div>

      <div className="agent-card-body">
        <div className="agent-model">{meta.model.replace('claude-', '').replace('-20250514', '')}</div>

        {state.currentTask && (
          <div className="agent-task" title={state.currentTask}>
            {state.currentTask.length > 60
              ? state.currentTask.slice(0, 57) + '...'
              : state.currentTask}
          </div>
        )}

        <div className="agent-card-footer">
          <span className="agent-last-seen">{formatTimeAgo(state.lastActivity)}</span>
          {state.messageCount > 0 && (
            <span className="agent-msg-count">{state.messageCount} msgs</span>
          )}
        </div>
      </div>
    </div>
  );
}
