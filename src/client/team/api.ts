import type {
  TeamStatusResponse,
  TeamActivityResponse,
  ProjectIndex,
  Project,
  Task,
  CreateProjectInput,
  CreateTaskInput,
  TaskStatus,
} from './types';

const API_BASE = '/api/team';

async function teamRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Team API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function teamMutate<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Team API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getTeamStatus(): Promise<TeamStatusResponse> {
  return teamRequest<TeamStatusResponse>('/status');
}

export async function getTeamActivity(lines = 200): Promise<TeamActivityResponse> {
  return teamRequest<TeamActivityResponse>(`/activity?lines=${lines}`);
}

// Projects
export const fetchProjects = () => teamRequest<ProjectIndex[]>('/projects');
export const fetchProject = (id: string) => teamRequest<Project>(`/projects/${id}`);
export const fetchTasks = (projectId: string) => teamRequest<Task[]>(`/projects/${projectId}/tasks`);
export const createProject = (data: CreateProjectInput) =>
  teamMutate<Project>('/projects', 'POST', data);
export const updateProject = (id: string, data: Partial<Project>) =>
  teamMutate<Project>(`/projects/${id}`, 'PUT', data);
export const deleteProject = (id: string) =>
  teamMutate<{ ok: boolean }>(`/projects/${id}`, 'DELETE');

// Tasks
export const createTask = (projectId: string, data: CreateTaskInput) =>
  teamMutate<Task>(`/projects/${projectId}/tasks`, 'POST', data);
export const updateTask = (projectId: string, taskId: string, data: Partial<Task>) =>
  teamMutate<Task>(`/projects/${projectId}/tasks/${taskId}`, 'PUT', data);
export const deleteTask = (projectId: string, taskId: string) =>
  teamMutate<{ ok: boolean }>(`/projects/${projectId}/tasks/${taskId}`, 'DELETE');
export const moveTask = (projectId: string, taskId: string, status: TaskStatus) =>
  teamMutate<Task>(`/projects/${projectId}/tasks/${taskId}/move`, 'PATCH', { status });
