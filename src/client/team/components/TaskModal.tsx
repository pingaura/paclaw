import { useState, useEffect } from 'react';
import type { Task, CreateTaskInput, TaskStatus, TaskPriority } from '../types';
import { AGENTS, TASK_COLUMNS, PIPELINE_STAGES } from '../constants';

interface TaskModalProps {
  task: Task | null; // null = create mode
  onSave: (data: CreateTaskInput | Partial<Task>) => void;
  onDelete?: (taskId: string) => void;
  onClose: () => void;
  defaultStatus?: TaskStatus;
}

export default function TaskModal({ task, onSave, onDelete, onClose, defaultStatus }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignedAgents, setAssignedAgents] = useState<string[]>([]);
  const [pipelineStage, setPipelineStage] = useState<number | null>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setAssignedAgents([...task.assignedAgents]);
      setPipelineStage(task.pipelineStage);
    } else {
      setStatus(defaultStatus || 'backlog');
    }
  }, [task, defaultStatus]);

  const toggleAgent = (id: string) => {
    setAssignedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (task) {
      onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        assignedAgents,
        pipelineStage,
      });
    } else {
      onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        assignedAgents,
        pipelineStage,
      } as CreateTaskInput);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{task ? 'Edit Task' : 'New Task'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="modal-label">
              Title
              <input
                className="modal-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </label>

            <label className="modal-label">
              Description
              <textarea
                className="modal-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details (optional)"
                rows={3}
              />
            </label>

            <div className="modal-row">
              <label className="modal-label">
                Status
                <select className="modal-select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                  {TASK_COLUMNS.map((col) => (
                    <option key={col.status} value={col.status}>{col.label}</option>
                  ))}
                </select>
              </label>

              <label className="modal-label">
                Priority
                <select className="modal-select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>

            <label className="modal-label">
              Pipeline Stage
              <select
                className="modal-select"
                value={pipelineStage ?? ''}
                onChange={(e) => setPipelineStage(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">None</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.index} value={s.index}>{s.label}</option>
                ))}
              </select>
            </label>

            <div className="modal-label">
              Assign Agents
              <div className="modal-agents">
                {AGENTS.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={`modal-agent-btn ${assignedAgents.includes(agent.id) ? 'modal-agent-selected' : ''}`}
                    onClick={() => toggleAgent(agent.id)}
                    title={agent.role}
                  >
                    <span>{agent.emoji}</span>
                    <span>{agent.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {task && onDelete && (
              <button
                type="button"
                className="modal-btn modal-btn-danger"
                onClick={() => { onDelete(task.id); onClose(); }}
              >
                Delete
              </button>
            )}
            <div className="modal-footer-right">
              <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="modal-btn modal-btn-primary" disabled={!title.trim()}>
                {task ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
