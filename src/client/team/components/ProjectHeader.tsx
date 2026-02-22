import type { ProjectWithTasks } from '../types';

interface ProjectHeaderProps {
  project: ProjectWithTasks;
}

export default function ProjectHeader({ project }: ProjectHeaderProps) {
  const totalTasks = project.tasks.length;
  const doneTasks = project.tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = project.tasks.filter((t) => t.status === 'in_progress').length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="project-header">
      <div className="ph-info">
        <div className="ph-title-row">
          <span className="ph-color" style={{ backgroundColor: project.color }} />
          <h2 className="ph-name">{project.name}</h2>
          <span className={`ph-status ph-status-${project.status}`}>{project.status}</span>
        </div>
        {project.description && (
          <p className="ph-desc">{project.description}</p>
        )}
      </div>
      <div className="ph-stats">
        <div className="ph-stat">
          <span className="ph-stat-value">{totalTasks}</span>
          <span className="ph-stat-label">Total</span>
        </div>
        <div className="ph-stat">
          <span className="ph-stat-value">{inProgressTasks}</span>
          <span className="ph-stat-label">Active</span>
        </div>
        <div className="ph-stat">
          <span className="ph-stat-value">{doneTasks}</span>
          <span className="ph-stat-label">Done</span>
        </div>
        <div className="ph-progress">
          <div className="ph-progress-bar">
            <div className="ph-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="ph-progress-label">{progress}%</span>
        </div>
      </div>
    </div>
  );
}
