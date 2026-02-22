import { useState, useEffect, useCallback } from 'react';
import type { ProjectIndex, ProjectWithTasks, CreateProjectInput, CreateTaskInput, Task, TaskStatus, Project } from '../types';
import * as api from '../api';

const ACTIVE_PROJECT_KEY = 'abhiyan-active-project';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectIndex[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load project list
  const loadProjects = useCallback(async () => {
    try {
      const list = await api.fetchProjects();
      setProjects(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load a specific project + its tasks
  const loadProject = useCallback(async (id: string) => {
    try {
      const [project, tasks] = await Promise.all([
        api.fetchProject(id),
        api.fetchTasks(id),
      ]);
      setActiveProject({ ...project, tasks });
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadProjects().then(() => {
      const savedId = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (savedId) {
        loadProject(savedId);
      }
    });
  }, [loadProjects, loadProject]);

  const selectProject = useCallback(
    (id: string) => {
      loadProject(id);
    },
    [loadProject],
  );

  const handleCreateProject = useCallback(
    async (input: CreateProjectInput) => {
      try {
        const project = await api.createProject(input);
        await loadProjects();
        setActiveProject({ ...project, tasks: [] });
        localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create project');
        throw err;
      }
    },
    [loadProjects],
  );

  const handleCreateTask = useCallback(
    async (input: CreateTaskInput) => {
      if (!activeProject) return;
      const task = await api.createTask(activeProject.id, input);
      setActiveProject((prev) => {
        if (!prev) return prev;
        return { ...prev, tasks: [...prev.tasks, task], updatedAt: Date.now() };
      });
      loadProjects().catch(() => {});
    },
    [activeProject, loadProjects],
  );

  const handleUpdateTask = useCallback(
    async (taskId: string, changes: Partial<Task>) => {
      if (!activeProject) return;
      const updated = await api.updateTask(activeProject.id, taskId, changes);
      setActiveProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === taskId ? updated : t)),
          updatedAt: Date.now(),
        };
      });
    },
    [activeProject],
  );

  const handleMoveTask = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      if (!activeProject) return;
      // Optimistic update
      setActiveProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? { ...t, status: newStatus, updatedAt: Date.now(), completedAt: newStatus === 'done' ? Date.now() : null }
              : t,
          ),
        };
      });
      try {
        await api.moveTask(activeProject.id, taskId, newStatus);
      } catch {
        // Revert on failure
        loadProject(activeProject.id);
      }
    },
    [activeProject, loadProject],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (!activeProject) return;
      await api.deleteTask(activeProject.id, taskId);
      setActiveProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== taskId),
          updatedAt: Date.now(),
        };
      });
      loadProjects().catch(() => {});
    },
    [activeProject, loadProjects],
  );

  const handleUpdateProject = useCallback(
    async (changes: Partial<Project>) => {
      if (!activeProject) return;
      const updated = await api.updateProject(activeProject.id, changes);
      setActiveProject((prev) => prev ? { ...updated, tasks: prev.tasks } : prev);
      loadProjects();
    },
    [activeProject, loadProjects],
  );

  return {
    projects,
    activeProject,
    loading,
    error,
    selectProject,
    createProject: handleCreateProject,
    createTask: handleCreateTask,
    updateTask: handleUpdateTask,
    moveTask: handleMoveTask,
    deleteTask: handleDeleteTask,
    updateProject: handleUpdateProject,
  };
}
