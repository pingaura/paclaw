import type { AgentState } from '../types';
import { AGENTS, PIPELINE_STAGES } from '../constants';

interface PipelineViewProps {
  agentStates: Map<string, AgentState>;
}

export default function PipelineView({ agentStates }: PipelineViewProps) {
  return (
    <section className="team-section">
      <h2 className="section-title">Pipeline</h2>
      <div className="pipeline">
        {PIPELINE_STAGES.map((stage, idx) => {
          const stageAgents = AGENTS.filter((a) => a.pipelineStage === stage.index);
          const hasActive = stageAgents.some(
            (a) => agentStates.get(a.id)?.status === 'active'
          );

          return (
            <div key={stage.index} className="pipeline-stage-wrapper">
              <div
                className={`pipeline-stage ${hasActive ? 'pipeline-stage-active' : ''}`}
                style={{ '--stage-color': stage.color } as React.CSSProperties}
              >
                <div className="pipeline-stage-label">{stage.label}</div>
                <div className="pipeline-stage-agents">
                  {stageAgents.map((agent) => {
                    const state = agentStates.get(agent.id);
                    return (
                      <div
                        key={agent.id}
                        className={`pipeline-agent pipeline-agent-${state?.status || 'offline'}`}
                        title={`${agent.name} - ${agent.role}`}
                      >
                        <span className="pipeline-agent-emoji">{agent.emoji}</span>
                        <span className="pipeline-agent-name">{agent.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {idx < PIPELINE_STAGES.length - 1 && (
                <div className="pipeline-connector" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
