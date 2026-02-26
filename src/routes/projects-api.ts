import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types';
import {
  type Task,
  type Project,
  generateId,
  getIndex,
  saveIndex,
  getProject,
  saveProject,
  getTask,
  saveTask,
  deleteTaskFile,
  listTasks,
  countTasks,
  toIndexEntry,
  VALID_TASK_STATUSES,
  VALID_PRIORITIES,
  VALID_PROJECT_STATUSES,
} from '../lib/abhiyan';
import { runOrchestrationCycle } from '../orchestrator';
import { listBranches, getBranchDiff, repoExists } from '../lib/git-service';

/** Trigger orchestration in the background (non-blocking, best-effort) */
function triggerOrchestration(c: Context<AppEnv>) {
  const sandbox = c.get('sandbox');
  c.executionCtx.waitUntil(
    runOrchestrationCycle(sandbox, c.env).catch((err) => {
      console.error('[Orchestrator] Event-triggered cycle failed:', err);
    }),
  );
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
  const body = await c.req.json<{
    name: string;
    description: string;
    color: string;
    techStack?: string[];
    instructions?: string;
    contextFiles?: string[];
    tags?: string[];
    links?: { label: string; url: string }[];
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: 'Project name is required' }, 400);
  }

  const now = Date.now();
  const id = generateId();
  const project: Project = {
    id,
    name: body.name.trim(),
    description: body.description?.trim() || '',
    status: 'active',
    color: body.color || '#60a5fa',
    repoPath: `/root/clawd/projects/${id}`,
    defaultBranch: 'main',
    techStack: Array.isArray(body.techStack) ? body.techStack : [],
    instructions: typeof body.instructions === 'string' ? body.instructions : '',
    contextFiles: Array.isArray(body.contextFiles) ? body.contextFiles : [],
    tags: Array.isArray(body.tags) ? body.tags : [],
    links: Array.isArray(body.links) ? body.links : [],
    lastBundledAt: null,
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
  if (Array.isArray(body.techStack)) project.techStack = body.techStack;
  if (typeof body.instructions === 'string') project.instructions = body.instructions;
  if (Array.isArray(body.contextFiles)) project.contextFiles = body.contextFiles;
  if (Array.isArray(body.tags)) project.tags = body.tags;
  if (Array.isArray(body.links)) project.links = body.links;
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
    approvalRequired?: boolean;
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
    branch: null,
    approvalRequired: body.approvalRequired === true || body.priority === 'critical',
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

  // Trigger orchestration if task is created as todo
  if (task.status === 'todo') {
    triggerOrchestration(c);
  }

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
  if (typeof body.approvalRequired === 'boolean') task.approvalRequired = body.approvalRequired;
  task.updatedAt = Date.now();

  await saveTask(bucket, projectId, task);

  // Trigger orchestration if task moved to todo
  if (body.status === 'todo') {
    triggerOrchestration(c);
  }

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

  // Trigger orchestration if task moved to todo
  if (body.status === 'todo') {
    triggerOrchestration(c);
  }

  return c.json(task);
});

// GET /:id/branches - List branches for a project
projectsApi.get('/:id/branches', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const sandbox = c.get('sandbox');
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const exists = await repoExists(sandbox, project);
  if (!exists) return c.json([]);

  const branches = await listBranches(sandbox, project);
  return c.json(branches);
});

// GET /:id/diff/:branch - Get diff for a branch
projectsApi.get('/:id/diff/:branch', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const sandbox = c.get('sandbox');
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const branch = decodeURIComponent(c.req.param('branch'));
  const diff = await getBranchDiff(sandbox, project, branch);
  return c.json(diff);
});

export { projectsApi };
