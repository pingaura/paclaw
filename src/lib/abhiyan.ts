/**
 * Shared Abhiyan R2 helpers
 *
 * Storage layout in R2 (MOLTBOT_BUCKET):
 *
 * abhiyan/index.json                          - list of {id, name, status, color, taskCount, updatedAt}
 * abhiyan/projects/{projectId}/project.json   - project metadata (no tasks)
 * abhiyan/projects/{projectId}/tasks/{taskId}.json - individual task files
 */

// ---- Interfaces ----

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'needs_approval' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAgents: string[];
  pipelineStage: number | null;
  branch: string | null;
  approvalRequired: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  color: string;
  createdAt: number;
  updatedAt: number;
  repoPath: string;
  defaultBranch: string;
  techStack: string[];
  instructions: string;
  contextFiles: string[];
  tags: string[];
  links: { label: string; url: string }[];
  lastBundledAt: number | null;
}

export interface ProjectIndexEntry {
  id: string;
  name: string;
  status: string;
  color: string;
  taskCount: number;
  updatedAt: number;
}

// ---- Constants ----

export const VALID_TASK_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'review', 'needs_approval', 'done']);
export const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
export const VALID_PROJECT_STATUSES = new Set(['active', 'paused', 'completed', 'archived']);

// ---- Path helpers ----

export function projectPath(id: string): string {
  return `abhiyan/projects/${id}/project.json`;
}

export function taskPath(projectId: string, taskId: string): string {
  return `abhiyan/projects/${projectId}/tasks/${taskId}.json`;
}

export function taskPrefix(projectId: string): string {
  return `abhiyan/projects/${projectId}/tasks/`;
}

// ---- ID generation ----

export function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    id += chars[b % chars.length];
  }
  return id;
}

// ---- R2 helpers ----

export async function getIndex(bucket: R2Bucket): Promise<ProjectIndexEntry[]> {
  const obj = await bucket.get('abhiyan/index.json');
  if (!obj) return [];
  return obj.json<ProjectIndexEntry[]>();
}

export async function saveIndex(bucket: R2Bucket, index: ProjectIndexEntry[]): Promise<void> {
  await bucket.put('abhiyan/index.json', JSON.stringify(index), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getProject(bucket: R2Bucket, id: string): Promise<Project | null> {
  const obj = await bucket.get(projectPath(id));
  if (!obj) return null;
  return obj.json<Project>();
}

export async function saveProject(bucket: R2Bucket, project: Project): Promise<void> {
  await bucket.put(projectPath(project.id), JSON.stringify(project), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function getTask(bucket: R2Bucket, projectId: string, taskId: string): Promise<Task | null> {
  const obj = await bucket.get(taskPath(projectId, taskId));
  if (!obj) return null;
  return obj.json<Task>();
}

export async function saveTask(bucket: R2Bucket, projectId: string, task: Task): Promise<void> {
  await bucket.put(taskPath(projectId, task.id), JSON.stringify(task), {
    httpMetadata: { contentType: 'application/json' },
  });
}

export async function deleteTaskFile(bucket: R2Bucket, projectId: string, taskId: string): Promise<void> {
  await bucket.delete(taskPath(projectId, taskId));
}

export async function listTasks(bucket: R2Bucket, projectId: string): Promise<Task[]> {
  const prefix = taskPrefix(projectId);
  const keys: string[] = [];

  // Handle pagination — R2 list returns max 1000 objects per call
  let cursor: string | undefined;
  let truncated = true;
  while (truncated) {
    const listed = await bucket.list({ prefix, cursor });
    for (const obj of listed.objects) {
      keys.push(obj.key);
    }
    truncated = listed.truncated;
    cursor = listed.truncated ? listed.cursor : undefined;
  }

  if (!keys.length) return [];

  // Fetch all task files in parallel
  const results = await Promise.all(
    keys.map(async (key) => {
      const r2obj = await bucket.get(key);
      if (!r2obj) return null;
      return r2obj.json<Task>();
    }),
  );

  return results.filter((t): t is Task => t !== null);
}

export async function countTasks(bucket: R2Bucket, projectId: string): Promise<number> {
  const prefix = taskPrefix(projectId);
  let count = 0;
  let cursor: string | undefined;
  let truncated = true;
  while (truncated) {
    const listed = await bucket.list({ prefix, cursor });
    count += listed.objects.length;
    truncated = listed.truncated;
    cursor = listed.truncated ? listed.cursor : undefined;
  }
  return count;
}

export function toIndexEntry(project: Project, taskCount: number): ProjectIndexEntry {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    color: project.color,
    taskCount,
    updatedAt: project.updatedAt,
  };
}
