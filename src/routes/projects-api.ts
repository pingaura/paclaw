import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * Storage layout in R2 (MOLTBOT_BUCKET):
 *
 * abhiyan/index.json                          - list of {id, name, status, color, taskCount, updatedAt}
 * abhiyan/projects/{projectId}/project.json   - project metadata (no tasks)
 * abhiyan/projects/{projectId}/tasks/{taskId}.json - individual task files
 */

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedAgents: string[];
  pipelineStage: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  color: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectIndexEntry {
  id: string;
  name: string;
  status: string;
  color: string;
  taskCount: number;
  updatedAt: number;
}

function generateId(): string {
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

async function getIndex(bucket: R2Bucket): Promise<ProjectIndexEntry[]> {
  const obj = await bucket.get('abhiyan/index.json');
  if (!obj) return [];
  return obj.json<ProjectIndexEntry[]>();
}

async function saveIndex(bucket: R2Bucket, index: ProjectIndexEntry[]): Promise<void> {
  await bucket.put('abhiyan/index.json', JSON.stringify(index), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function projectPath(id: string): string {
  return `abhiyan/projects/${id}/project.json`;
}

function taskPath(projectId: string, taskId: string): string {
  return `abhiyan/projects/${projectId}/tasks/${taskId}.json`;
}

function taskPrefix(projectId: string): string {
  return `abhiyan/projects/${projectId}/tasks/`;
}

async function getProject(bucket: R2Bucket, id: string): Promise<Project | null> {
  const obj = await bucket.get(projectPath(id));
  if (!obj) return null;
  return obj.json<Project>();
}

async function saveProject(bucket: R2Bucket, project: Project): Promise<void> {
  await bucket.put(projectPath(project.id), JSON.stringify(project), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function getTask(bucket: R2Bucket, projectId: string, taskId: string): Promise<Task | null> {
  const obj = await bucket.get(taskPath(projectId, taskId));
  if (!obj) return null;
  return obj.json<Task>();
}

async function saveTask(bucket: R2Bucket, projectId: string, task: Task): Promise<void> {
  await bucket.put(taskPath(projectId, task.id), JSON.stringify(task), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function deleteTaskFile(bucket: R2Bucket, projectId: string, taskId: string): Promise<void> {
  await bucket.delete(taskPath(projectId, taskId));
}

async function listTasks(bucket: R2Bucket, projectId: string): Promise<Task[]> {
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

async function countTasks(bucket: R2Bucket, projectId: string): Promise<number> {
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

const VALID_TASK_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'review', 'done']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const VALID_PROJECT_STATUSES = new Set(['active', 'paused', 'completed', 'archived']);

function toIndexEntry(project: Project, taskCount: number): ProjectIndexEntry {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    color: project.color,
    taskCount,
    updatedAt: project.updatedAt,
  };
}

// ---- Routes ----

const projectsApi = new Hono<AppEnv>();

// GET / - List all projects
projectsApi.get('/', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const index = await getIndex(bucket);
  return c.json(index);
});

// POST / - Create project
projectsApi.post('/', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const body = await c.req.json<{ name: string; description: string; color: string }>();

  if (!body.name?.trim()) {
    return c.json({ error: 'Project name is required' }, 400);
  }

  const now = Date.now();
  const project: Project = {
    id: generateId(),
    name: body.name.trim(),
    description: body.description?.trim() || '',
    status: 'active',
    color: body.color || '#60a5fa',
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(bucket, project);

  const index = await getIndex(bucket);
  index.push(toIndexEntry(project, 0));
  await saveIndex(bucket, index);

  return c.json(project, 201);
});

// GET /:id - Get project detail
projectsApi.get('/:id', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

// PUT /:id - Update project
projectsApi.put('/:id', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<Partial<Project>>();
  if (body.name !== undefined) project.name = body.name.trim();
  if (body.description !== undefined) project.description = body.description.trim();
  if (body.status !== undefined) {
    if (!VALID_PROJECT_STATUSES.has(body.status)) {
      return c.json({ error: `Invalid status: ${body.status}` }, 400);
    }
    project.status = body.status;
  }
  if (body.color !== undefined) project.color = body.color;
  project.updatedAt = Date.now();

  await saveProject(bucket, project);

  const tc = await countTasks(bucket, project.id);
  const index = await getIndex(bucket);
  const idx = index.findIndex((e) => e.id === project.id);
  if (idx >= 0) index[idx] = toIndexEntry(project, tc);
  else index.push(toIndexEntry(project, tc));
  await saveIndex(bucket, index);

  return c.json(project);
});

// DELETE /:id - Archive project
projectsApi.delete('/:id', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  project.status = 'archived';
  project.updatedAt = Date.now();
  await saveProject(bucket, project);

  const tc = await countTasks(bucket, project.id);
  const index = await getIndex(bucket);
  const idx = index.findIndex((e) => e.id === project.id);
  if (idx >= 0) index[idx] = toIndexEntry(project, tc);
  await saveIndex(bucket, index);

  return c.json({ ok: true });
});

// GET /:id/tasks - List all tasks for a project
projectsApi.get('/:id/tasks', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const tasks = await listTasks(bucket, project.id);
  return c.json(tasks);
});

// POST /:id/tasks - Create task
projectsApi.post('/:id/tasks', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const body = await c.req.json<{
    title: string;
    description?: string;
    status?: Task['status'];
    priority?: Task['priority'];
    assignedAgents?: string[];
    pipelineStage?: number | null;
  }>();

  if (!body.title?.trim()) {
    return c.json({ error: 'Task title is required' }, 400);
  }

  const now = Date.now();
  const task: Task = {
    id: generateId(),
    title: body.title.trim(),
    description: body.description?.trim() || '',
    status: body.status || 'backlog',
    priority: body.priority || 'medium',
    assignedAgents: body.assignedAgents || [],
    pipelineStage: body.pipelineStage ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  await saveTask(bucket, project.id, task);

  // Update index task count
  project.updatedAt = now;
  await saveProject(bucket, project);
  const tc = await countTasks(bucket, project.id);
  const index = await getIndex(bucket);
  const idx = index.findIndex((e) => e.id === project.id);
  if (idx >= 0) index[idx] = toIndexEntry(project, tc);
  await saveIndex(bucket, index);

  return c.json(task, 201);
});

// PUT /:id/tasks/:taskId - Update task
projectsApi.put('/:id/tasks/:taskId', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const projectId = c.req.param('id');
  const taskId = c.req.param('taskId');

  const task = await getTask(bucket, projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const body = await c.req.json<Partial<Task>>();
  if (body.title !== undefined) task.title = body.title.trim();
  if (body.description !== undefined) task.description = body.description.trim();
  if (body.status !== undefined) {
    if (!VALID_TASK_STATUSES.has(body.status)) {
      return c.json({ error: `Invalid status: ${body.status}` }, 400);
    }
    task.status = body.status;
    if (body.status === 'done' && !task.completedAt) {
      task.completedAt = Date.now();
    } else if (body.status !== 'done') {
      task.completedAt = null;
    }
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.has(body.priority)) {
      return c.json({ error: `Invalid priority: ${body.priority}` }, 400);
    }
    task.priority = body.priority;
  }
  if (body.assignedAgents !== undefined) task.assignedAgents = body.assignedAgents;
  if (body.pipelineStage !== undefined) task.pipelineStage = body.pipelineStage;
  task.updatedAt = Date.now();

  await saveTask(bucket, projectId, task);

  return c.json(task);
});

// DELETE /:id/tasks/:taskId - Remove task
projectsApi.delete('/:id/tasks/:taskId', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const projectId = c.req.param('id');
  const taskId = c.req.param('taskId');

  const task = await getTask(bucket, projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  await deleteTaskFile(bucket, projectId, taskId);

  // Update index task count
  const project = await getProject(bucket, projectId);
  if (project) {
    project.updatedAt = Date.now();
    await saveProject(bucket, project);
    const tc = await countTasks(bucket, projectId);
    const index = await getIndex(bucket);
    const idx = index.findIndex((e) => e.id === projectId);
    if (idx >= 0) index[idx] = toIndexEntry(project, tc);
    await saveIndex(bucket, index);
  }

  return c.json({ ok: true });
});

// PATCH /:id/tasks/:taskId/move - Move task to new status
projectsApi.patch('/:id/tasks/:taskId/move', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const projectId = c.req.param('id');
  const taskId = c.req.param('taskId');

  const task = await getTask(bucket, projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const body = await c.req.json<{ status: Task['status'] }>();
  if (!body.status) return c.json({ error: 'Status is required' }, 400);
  if (!VALID_TASK_STATUSES.has(body.status)) {
    return c.json({ error: `Invalid status: ${body.status}` }, 400);
  }

  task.status = body.status;
  if (body.status === 'done' && !task.completedAt) {
    task.completedAt = Date.now();
  } else if (body.status !== 'done') {
    task.completedAt = null;
  }
  task.updatedAt = Date.now();

  await saveTask(bucket, projectId, task);

  return c.json(task);
});

export { projectsApi };
