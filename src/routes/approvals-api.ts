import { Hono } from 'hono';
import type { AppEnv } from '../types';
import {
  type Task,
  getIndex,
  getProject,
  getTask,
  saveTask,
  saveProject,
  listTasks,
} from '../lib/abhiyan';
import { mergeBranch, bundleRepo } from '../lib/git-service';

/** Priority ordering: critical first, then high, medium, low. */
const PRIORITY_ORDER: Record<Task['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const approvalsApi = new Hono<AppEnv>();

// GET / - List all tasks with status 'needs_approval' across all active projects
approvalsApi.get('/', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const index = await getIndex(bucket);

  // Filter to active projects only
  const activeProjects = index.filter((entry) => entry.status === 'active');

  const results: { task: Task; project: { id: string; name: string; color: string } }[] = [];

  // Fetch tasks for each active project in parallel
  await Promise.all(
    activeProjects.map(async (entry) => {
      const tasks = await listTasks(bucket, entry.id);
      for (const task of tasks) {
        if (task.status === 'needs_approval') {
          results.push({
            task,
            project: { id: entry.id, name: entry.name, color: entry.color },
          });
        }
      }
    }),
  );

  // Sort by priority (critical first), then by createdAt (oldest first)
  results.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.task.createdAt - b.task.createdAt;
  });

  return c.json(results);
});

// POST /:taskId/approve - Approve a task and trigger merge
approvalsApi.post('/:taskId/approve', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const sandbox = c.get('sandbox');
  const taskId = c.req.param('taskId');

  const body = await c.req.json<{ projectId: string }>();
  if (!body.projectId) {
    return c.json({ error: 'projectId is required' }, 400);
  }

  const project = await getProject(bucket, body.projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const task = await getTask(bucket, body.projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  if (task.status !== 'needs_approval') {
    return c.json({ error: `Task status is '${task.status}', expected 'needs_approval'` }, 400);
  }

  // If the task has a branch, merge it and re-bundle the repo
  if (task.branch) {
    const mergeResult = await mergeBranch(sandbox, project, task.branch);
    if (!mergeResult.success) {
      return c.json({ error: `Merge conflict: ${mergeResult.error}` }, 409);
    }

    await bundleRepo(sandbox, c.env, project);
    project.lastBundledAt = Date.now();
  }

  // Mark task as done
  const now = Date.now();
  task.status = 'done';
  task.completedAt = now;
  task.updatedAt = now;
  await saveTask(bucket, body.projectId, task);

  // Update project timestamp
  project.updatedAt = now;
  await saveProject(bucket, project);

  return c.json(task);
});

// POST /:taskId/reject - Reject a task and send it back with feedback
approvalsApi.post('/:taskId/reject', async (c) => {
  const bucket = c.env.MOLTBOT_BUCKET;
  const taskId = c.req.param('taskId');

  const body = await c.req.json<{ projectId: string; feedback: string }>();
  if (!body.projectId) {
    return c.json({ error: 'projectId is required' }, 400);
  }
  if (!body.feedback || typeof body.feedback !== 'string' || !body.feedback.trim()) {
    return c.json({ error: 'feedback is required' }, 400);
  }

  const project = await getProject(bucket, body.projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const task = await getTask(bucket, body.projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  if (task.status !== 'needs_approval') {
    return c.json({ error: `Task status is '${task.status}', expected 'needs_approval'` }, 400);
  }

  // Prepend review feedback to the description
  task.description = `**Review Feedback:** ${body.feedback.trim()}\n\n---\n\n${task.description}`;

  // Send task back to todo; keep branch intact so agent can continue
  task.status = 'todo';
  task.completedAt = null;
  task.updatedAt = Date.now();

  await saveTask(bucket, body.projectId, task);

  return c.json(task);
});

export { approvalsApi };
