import type { Task } from '../types';
import { PRIORITY_COLORS, AGENT_MAP } from '../constants';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}

export default function TaskCard({ task, onEdit, onDragStart }: TaskCardProps) {
  return (
    <div
      className="task-card"
      style={{ borderLeftColor: PRIORITY_COLORS[task.priority] }}
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onEdit(task)}
    >
      <div className="tc-title">{task.title}</div>
      <div className="tc-meta">
        <span
          className="tc-priority"
          style={{ color: PRIORITY_COLORS[task.priority] }}
        >
          {task.priority}
        </span>
        {task.assignedAgents.length > 0 && (
          <span className="tc-agents">
            {task.assignedAgents.map((id) => {
              const agent = AGENT_MAP.get(id);
              return agent ? (
                <span key={id} className="tc-agent-emoji" title={agent.name}>
                  {agent.emoji}
                </span>
              ) : null;
            })}
          </span>
        )}
      </div>
    </div>
  );
}
