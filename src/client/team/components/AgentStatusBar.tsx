import type { AgentState } from '../types';
import { AGENTS } from '../constants';

interface AgentStatusBarProps {
  agentStates: Map<string, AgentState>;
}

export default function AgentStatusBar({ agentStates }: AgentStatusBarProps) {
  return (
    <div className="agent-status-bar">
      {AGENTS.map((agent) => {
        const state = agentStates.get(agent.id);
        const status = state?.status || 'offline';
        return (
          <div
            key={agent.id}
            className={`asb-agent asb-${status}`}
            title={`${agent.name} - ${agent.role}${state?.currentTask ? `\n${state.currentTask}` : ''}`}
          >
            <span className={`asb-dot status-${status}`} />
            <span className="asb-emoji">{agent.emoji}</span>
            <span className="asb-name">{agent.name}</span>
          </div>
        );
      })}
    </div>
  );
}
