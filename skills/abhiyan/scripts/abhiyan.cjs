#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- Config ----

const ABHIYAN_DIR = process.env.ABHIYAN_DIR || '/root/clawd/abhiyan';

const VALID_TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const VALID_PROJECT_STATUSES = ['active', 'paused', 'completed', 'archived'];

// ---- Helpers ----

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(8);
  let id = '';
  for (const b of bytes) {
    id += chars[b % chars.length];
  }
  return id;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function indexPath() {
  return path.join(ABHIYAN_DIR, 'index.json');
}

function projectDir(id) {
  return path.join(ABHIYAN_DIR, 'projects', id);
}

function projectPath(id) {
  return path.join(projectDir(id), 'project.json');
}

function tasksDir(projectId) {
  return path.join(projectDir(projectId), 'tasks');
}

function taskPath(projectId, taskId) {
  return path.join(tasksDir(projectId), `${taskId}.json`);
}

// ---- Index ----

function getIndex() {
  return readJson(indexPath()) || [];
}

function saveIndex(index) {
  writeJson(indexPath(), index);
}

function toIndexEntry(project, taskCount) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    color: project.color,
    taskCount,
    updatedAt: project.updatedAt,
  };
}

// ---- Project CRUD ----

function getProject(id) {
  return readJson(projectPath(id));
}

function saveProject(project) {
  writeJson(projectPath(project.id), project);
}

function countTasks(projectId) {
  const dir = tasksDir(projectId);
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function updateIndex(project) {
  const tc = countTasks(project.id);
  const index = getIndex();
  const idx = index.findIndex(e => e.id === project.id);
  if (idx >= 0) index[idx] = toIndexEntry(project, tc);
  else index.push(toIndexEntry(project, tc));
  saveIndex(index);
}

// ---- Task CRUD ----

function getTask(projectId, taskId) {
  return readJson(taskPath(projectId, taskId));
}

function saveTask(projectId, task) {
  writeJson(taskPath(projectId, task.id), task);
}

function listTasks(projectId) {
  const dir = tasksDir(projectId);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJson(path.join(dir, f)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function deleteTask(projectId, taskId) {
  const fp = taskPath(projectId, taskId);
  try { fs.unlinkSync(fp); } catch { /* noop */ }
}

// ---- CLI Arg Parsing ----

function parseArgs(argv) {
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      flags[key] = val;
    }
    i++;
  }
  return flags;
}

// ---- Commands ----

function projectsList() {
  const index = getIndex();
  if (!index.length) {
    console.log(JSON.stringify([]));
    return;
  }
  console.log(JSON.stringify(index, null, 2));
}

function projectsCreate(flags) {
  if (!flags.name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  const now = Date.now();
  const project = {
    id: generateId(),
    name: flags.name,
    description: flags.description || '',
    status: 'active',
    color: flags.color || '#60a5fa',
    createdAt: now,
    updatedAt: now,
  };
  saveProject(project);
  updateIndex(project);
  console.log(JSON.stringify(project, null, 2));
}

function projectsGet(id) {
  if (!id) { console.error('Error: project ID required'); process.exit(1); }
  const project = getProject(id);
  if (!project) { console.error(`Error: project ${id} not found`); process.exit(1); }
  console.log(JSON.stringify(project, null, 2));
}

function projectsUpdate(id, flags) {
  if (!id) { console.error('Error: project ID required'); process.exit(1); }
  const project = getProject(id);
  if (!project) { console.error(`Error: project ${id} not found`); process.exit(1); }

  if (flags.name !== undefined) project.name = flags.name;
  if (flags.description !== undefined) project.description = flags.description;
  if (flags.status !== undefined) {
    if (!VALID_PROJECT_STATUSES.includes(flags.status)) {
      console.error(`Error: invalid status "${flags.status}". Valid: ${VALID_PROJECT_STATUSES.join(', ')}`);
      process.exit(1);
    }
    project.status = flags.status;
  }
  if (flags.color !== undefined) project.color = flags.color;
  project.updatedAt = Date.now();

  saveProject(project);
  updateIndex(project);
  console.log(JSON.stringify(project, null, 2));
}

function projectsArchive(id) {
  if (!id) { console.error('Error: project ID required'); process.exit(1); }
  const project = getProject(id);
  if (!project) { console.error(`Error: project ${id} not found`); process.exit(1); }

  project.status = 'archived';
  project.updatedAt = Date.now();
  saveProject(project);
  updateIndex(project);
  console.log(JSON.stringify({ ok: true, id: project.id }));
}

function tasksList(projectId) {
  if (!projectId) { console.error('Error: project ID required'); process.exit(1); }
  const project = getProject(projectId);
  if (!project) { console.error(`Error: project ${projectId} not found`); process.exit(1); }

  const tasks = listTasks(projectId);
  console.log(JSON.stringify(tasks, null, 2));
}

function tasksCreate(projectId, flags) {
  if (!projectId) { console.error('Error: project ID required'); process.exit(1); }
  const project = getProject(projectId);
  if (!project) { console.error(`Error: project ${projectId} not found`); process.exit(1); }
  if (!flags.title) { console.error('Error: --title is required'); process.exit(1); }

  if (flags.status && !VALID_TASK_STATUSES.includes(flags.status)) {
    console.error(`Error: invalid status "${flags.status}". Valid: ${VALID_TASK_STATUSES.join(', ')}`);
    process.exit(1);
  }
  if (flags.priority && !VALID_PRIORITIES.includes(flags.priority)) {
    console.error(`Error: invalid priority "${flags.priority}". Valid: ${VALID_PRIORITIES.join(', ')}`);
    process.exit(1);
  }

  const now = Date.now();
  const task = {
    id: generateId(),
    title: flags.title,
    description: flags.description || '',
    status: flags.status || 'backlog',
    priority: flags.priority || 'medium',
    assignedAgents: flags.assignedAgents ? flags.assignedAgents.split(',') : [],
    pipelineStage: flags.pipelineStage ? parseInt(flags.pipelineStage, 10) : null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  saveTask(projectId, task);

  project.updatedAt = now;
  saveProject(project);
  updateIndex(project);

  console.log(JSON.stringify(task, null, 2));
}

function tasksUpdate(projectId, taskId, flags) {
  if (!projectId || !taskId) { console.error('Error: project ID and task ID required'); process.exit(1); }
  const task = getTask(projectId, taskId);
  if (!task) { console.error(`Error: task ${taskId} not found in project ${projectId}`); process.exit(1); }

  if (flags.title !== undefined) task.title = flags.title;
  if (flags.description !== undefined) task.description = flags.description;
  if (flags.status !== undefined) {
    if (!VALID_TASK_STATUSES.includes(flags.status)) {
      console.error(`Error: invalid status "${flags.status}". Valid: ${VALID_TASK_STATUSES.join(', ')}`);
      process.exit(1);
    }
    task.status = flags.status;
    if (flags.status === 'done' && !task.completedAt) {
      task.completedAt = Date.now();
    } else if (flags.status !== 'done') {
      task.completedAt = null;
    }
  }
  if (flags.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(flags.priority)) {
      console.error(`Error: invalid priority "${flags.priority}". Valid: ${VALID_PRIORITIES.join(', ')}`);
      process.exit(1);
    }
    task.priority = flags.priority;
  }
  if (flags.assignedAgents !== undefined) {
    task.assignedAgents = flags.assignedAgents ? flags.assignedAgents.split(',') : [];
  }
  if (flags.pipelineStage !== undefined) {
    task.pipelineStage = flags.pipelineStage === 'null' ? null : parseInt(flags.pipelineStage, 10);
  }
  task.updatedAt = Date.now();

  saveTask(projectId, task);
  console.log(JSON.stringify(task, null, 2));
}

function tasksMove(projectId, taskId, flags) {
  if (!projectId || !taskId) { console.error('Error: project ID and task ID required'); process.exit(1); }
  if (!flags.status) { console.error('Error: --status is required'); process.exit(1); }
  if (!VALID_TASK_STATUSES.includes(flags.status)) {
    console.error(`Error: invalid status "${flags.status}". Valid: ${VALID_TASK_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const task = getTask(projectId, taskId);
  if (!task) { console.error(`Error: task ${taskId} not found in project ${projectId}`); process.exit(1); }

  task.status = flags.status;
  if (flags.status === 'done' && !task.completedAt) {
    task.completedAt = Date.now();
  } else if (flags.status !== 'done') {
    task.completedAt = null;
  }
  task.updatedAt = Date.now();

  saveTask(projectId, task);
  console.log(JSON.stringify(task, null, 2));
}

function tasksDelete(projectId, taskId) {
  if (!projectId || !taskId) { console.error('Error: project ID and task ID required'); process.exit(1); }
  const task = getTask(projectId, taskId);
  if (!task) { console.error(`Error: task ${taskId} not found in project ${projectId}`); process.exit(1); }

  deleteTask(projectId, taskId);

  const project = getProject(projectId);
  if (project) {
    project.updatedAt = Date.now();
    saveProject(project);
    updateIndex(project);
  }

  console.log(JSON.stringify({ ok: true }));
}

// ---- Main ----

function main() {
  const args = process.argv.slice(2);
  const resource = args[0]; // projects | tasks
  const action = args[1];   // list | create | get | update | archive | move | delete

  if (!resource || !action) {
    console.error('Usage: abhiyan.cjs <projects|tasks> <action> [args] [--flags]');
    console.error('');
    console.error('Projects:');
    console.error('  projects list');
    console.error('  projects create --name "Name" [--description "..."] [--color "#hex"]');
    console.error('  projects get <id>');
    console.error('  projects update <id> [--name "..."] [--status active|paused|completed|archived]');
    console.error('  projects archive <id>');
    console.error('');
    console.error('Tasks:');
    console.error('  tasks list <projectId>');
    console.error('  tasks create <projectId> --title "Title" [--status ...] [--priority ...] [--assignedAgents a,b]');
    console.error('  tasks update <projectId> <taskId> [--title "..."] [--status ...] [--priority ...]');
    console.error('  tasks move <projectId> <taskId> --status <newStatus>');
    console.error('  tasks delete <projectId> <taskId>');
    process.exit(1);
  }

  if (resource === 'projects') {
    switch (action) {
      case 'list': return projectsList();
      case 'create': return projectsCreate(parseArgs(args.slice(2)));
      case 'get': return projectsGet(args[2]);
      case 'update': return projectsUpdate(args[2], parseArgs(args.slice(3)));
      case 'archive': return projectsArchive(args[2]);
      default:
        console.error(`Unknown projects action: ${action}`);
        process.exit(1);
    }
  } else if (resource === 'tasks') {
    switch (action) {
      case 'list': return tasksList(args[2]);
      case 'create': return tasksCreate(args[2], parseArgs(args.slice(3)));
      case 'update': return tasksUpdate(args[2], args[3], parseArgs(args.slice(4)));
      case 'move': return tasksMove(args[2], args[3], parseArgs(args.slice(4)));
      case 'delete': return tasksDelete(args[2], args[3]);
      default:
        console.error(`Unknown tasks action: ${action}`);
        process.exit(1);
    }
  } else {
    console.error(`Unknown resource: ${resource}. Use "projects" or "tasks".`);
    process.exit(1);
  }
}

main();
