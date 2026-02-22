import type { AgentState } from '../types';
import { AGENTS } from '../constants';
import AgentCard from './AgentCard';

interface AgentGridProps {
  agentStates: Map<string, AgentState>;
}

export default function AgentGrid({ agentStates }: AgentGridProps) {
  return (
    <section className="team-section">
      <h2 className="section-title">Agents</h2>
      <div className="agent-grid">
        {AGENTS.map((agent) => {
          const state = agentStates.get(agent.id) || {
            id: agent.id,
            status: 'offline' as const,
            currentTask: null,
            lastActivity: 0,
            messageCount: 0,
          };
          return <AgentCard key={agent.id} meta={agent} state={state} />;
        })}
      </div>
    </section>
  );
}
