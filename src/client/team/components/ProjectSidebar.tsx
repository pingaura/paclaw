import { useState } from 'react';
import type { ProjectIndex, CreateProjectInput } from '../types';
import { PROJECT_COLORS } from '../constants';

interface ProjectSidebarProps {
  projects: ProjectIndex[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

export default function ProjectSidebar({ projects, activeId, onSelect, onCreate }: ProjectSidebarProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const activeProjects = projects.filter((p) => p.status !== 'archived');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim(), color });
      setName('');
      setDescription('');
      setColor(PROJECT_COLORS[0]);
      setShowForm(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="project-sidebar">
      <div className="ps-header">
        <h2 className="ps-title">Projects</h2>
      </div>
      <div className="ps-list">
        {activeProjects.map((p) => (
          <button
            key={p.id}
            className={`ps-item ${p.id === activeId ? 'ps-item-active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <span className="ps-color" style={{ backgroundColor: p.color }} />
            <span className="ps-name">{p.name}</span>
            <span className="ps-count">{p.taskCount}</span>
          </button>
        ))}
        {activeProjects.length === 0 && (
          <div className="ps-empty">No projects yet</div>
        )}
      </div>

      {showForm ? (
        <form className="ps-form" onSubmit={handleSubmit}>
          <input
            className="ps-input"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="ps-input"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="ps-colors">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`ps-color-dot ${c === color ? 'ps-color-selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="ps-form-actions">
            <button type="submit" className="ps-btn ps-btn-primary" disabled={!name.trim() || creating}>
              {creating ? '...' : 'Create'}
            </button>
            <button type="button" className="ps-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="ps-add-btn" onClick={() => setShowForm(true)}>
          + New Project
        </button>
      )}
    </aside>
  );
}
