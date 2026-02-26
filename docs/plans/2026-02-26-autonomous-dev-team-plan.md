# Autonomous Dev Team — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Git Service Layer to Abhiyan so each project gets its own local git repo, tasks run on feature branches, Sentinel reviews diffs, and humans approve key milestones via the dashboard.

**Architecture:** New `GitService` module handles all git operations (init, branch, merge, bundle). The orchestrator calls GitService during dispatch and reconciliation. A new `needs_approval` task status creates a human gate. Dashboard gains an approval queue, branch viewer, and project settings panel.

**Tech Stack:** TypeScript (Hono backend, React frontend), Cloudflare Workers + Sandbox containers, R2 storage, local git inside container.

---

## Task 1: Extend Project and Task Types

**Files:**
- Modify: `src/lib/abhiyan.ts` (lines 13-49 — interfaces and validation sets)
- Modify: `src/client/team/types.ts` (lines 55-117 — frontend types)
- Modify: `src/client/team/constants.ts` (lines 84-90 — TASK_COLUMNS)
- Modify: `src/orchestrator/types.ts` (lines 5-17 — state interfaces)

**Step 1: Update backend Task interface**

In `src/lib/abhiyan.ts`, add `branch` and `approvalRequired` to `Task`, add `'needs_approval'` to status union:

```typescript
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
```

Update `VALID_TASK_STATUSES`:
```typescript
export const VALID_TASK_STATUSES = new Set([
  'backlog', 'todo', 'in_progress', 'review', 'needs_approval', 'done',
]);
```

**Step 2: Update backend Project interface**

In `src/lib/abhiyan.ts`, extend `Project`:

```typescript
export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  color: string;
  createdAt: number;
  updatedAt: number;
  // Code management
  repoPath: string;
  defaultBranch: string;
  // Agent context
  techStack: string[];
  instructions: string;
  contextFiles: string[];
  // Metadata
  tags: string[];
  links: { label: string; url: string }[];
  // Git persistence
  lastBundledAt: number | null;
}
```

**Step 3: Update orchestrator state types**

In `src/orchestrator/types.ts`:

```typescript
export interface AgentState {
  status: 'idle' | 'busy';
  currentTaskId: string | null;
  currentProjectId: string | null;
  taskStartedAt: number | null;
  currentBranch: string | null;
}

export interface OrchestratorState {
  enabled: boolean;
  agents: Record<string, AgentState>;
  lastRunAt: number;
  lastDispatchAt: number | null;
  lastBundleRunAt: number | null;
  cycleCount: number;
}
```

**Step 4: Update frontend types**

In `src/client/team/types.ts`, mirror backend changes:

```typescript
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'needs_approval' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
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
  status: ProjectStatus;
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

export interface CreateProjectInput {
  name: string;
  description?: string;
  color?: string;
  techStack?: string[];
  instructions?: string;
  contextFiles?: string[];
  tags?: string[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgents?: string[];
  pipelineStage?: number | null;
  approvalRequired?: boolean;
}

// New types for approvals
export interface ApprovalItem {
  task: Task;
  project: Project;
  diff: DiffSummary;
  reviewComments: string | null;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: { path: string; insertions: number; deletions: number }[];
  patch: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  taskId: string | null;
  agentId: string | null;
}
```

**Step 5: Add `needs_approval` column to constants**

In `src/client/team/constants.ts`, update `TASK_COLUMNS`:

```typescript
export const TASK_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: '#64748b' },
  { status: 'todo', label: 'To Do', color: '#a78bfa' },
  { status: 'in_progress', label: 'In Progress', color: '#60a5fa' },
  { status: 'review', label: 'Review', color: '#fbbf24' },
  { status: 'needs_approval', label: 'Needs Approval', color: '#fb923c' },
  { status: 'done', label: 'Done', color: '#34d399' },
];
```

**Step 6: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: may have errors in files that consume these types — those are fixed in subsequent tasks.

**Step 7: Commit**

```bash
git add src/lib/abhiyan.ts src/client/team/types.ts src/client/team/constants.ts src/orchestrator/types.ts
git commit -m "feat(types): extend Project/Task with git fields, add needs_approval status"
```

---

## Task 2: Update Projects API for New Fields

**Files:**
- Modify: `src/routes/projects-api.ts` (lines 45-71 — create, lines 82-109 — update)

**Step 1: Update project create handler**

In `src/routes/projects-api.ts`, the POST `/` handler currently takes `name`, `description`, `color`. Add defaults for new fields:

```typescript
// In POST handler, after existing field extraction:
const techStack = Array.isArray(body.techStack) ? body.techStack : [];
const instructions = typeof body.instructions === 'string' ? body.instructions : '';
const contextFiles = Array.isArray(body.contextFiles) ? body.contextFiles : [];
const tags = Array.isArray(body.tags) ? body.tags : [];
const links = Array.isArray(body.links) ? body.links : [];

const project: Project = {
  id,
  name,
  description: body.description || '',
  status: 'active',
  color: body.color || '#60a5fa',
  createdAt: now,
  updatedAt: now,
  repoPath: `/root/clawd/projects/${id}`,
  defaultBranch: 'main',
  techStack,
  instructions,
  contextFiles,
  tags,
  links,
  lastBundledAt: null,
};
```

**Step 2: Update project update handler**

In the PUT `/:id` handler, allow updating new fields:

```typescript
// After existing field updates:
if (Array.isArray(body.techStack)) project.techStack = body.techStack;
if (typeof body.instructions === 'string') project.instructions = body.instructions;
if (Array.isArray(body.contextFiles)) project.contextFiles = body.contextFiles;
if (Array.isArray(body.tags)) project.tags = body.tags;
if (Array.isArray(body.links)) project.links = body.links;
```

**Step 3: Update task create handler**

In the POST `/:id/tasks` handler, add `branch` and `approvalRequired`:

```typescript
const task: Task = {
  // ... existing fields ...
  branch: null,
  approvalRequired: body.approvalRequired === true ||
    (body.priority === 'critical'),
};
```

**Step 4: Update task update handler**

In the PUT `/:id/tasks/:taskId` handler, allow updating `approvalRequired`:

```typescript
if (typeof body.approvalRequired === 'boolean') task.approvalRequired = body.approvalRequired;
```

**Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS (or errors only in orchestrator files fixed in Task 3-4)

**Step 6: Commit**

```bash
git add src/routes/projects-api.ts
git commit -m "feat(api): support new Project/Task fields in create and update handlers"
```

---

## Task 3: Create Git Service

**Files:**
- Create: `src/lib/git-service.ts`

This is the core new module. It runs git commands inside the container via `sandbox.exec()` / `sandbox.startProcess()`.

**Step 1: Create `src/lib/git-service.ts`**

```typescript
import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import type { Project, Task } from './abhiyan';

const REPOS_R2_PREFIX = 'repos';

/** Slugify a task title for branch naming. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Run a shell command inside the container and return stdout. Throws on non-zero exit. */
async function execInContainer(
  sandbox: Sandbox,
  command: string,
  timeout = 30_000,
): Promise<string> {
  const result = await sandbox.exec(`sh -c '${command.replace(/'/g, "'\\''")}'`, {
    timeout,
  });
  if (!result.success) {
    const stderr = result.stderr?.trim() || 'unknown error';
    throw new Error(`Container command failed: ${stderr}`);
  }
  return (result.stdout || '').trim();
}

/** Initialize a new git repo for a project. */
export async function initRepo(sandbox: Sandbox, project: Project): Promise<void> {
  const dir = project.repoPath;
  await execInContainer(sandbox, `mkdir -p ${dir}`);
  await execInContainer(sandbox, `cd ${dir} && git init -b ${project.defaultBranch}`);
  await execInContainer(sandbox, `cd ${dir} && git config user.email "abhiyan@local"`);
  await execInContainer(sandbox, `cd ${dir} && git config user.name "Abhiyan"`);
  await execInContainer(
    sandbox,
    `cd ${dir} && echo "# ${project.name}" > README.md && git add -A && git commit -m "Initial commit"`,
  );
}

/** Create a feature branch for a task from the default branch. */
export async function createBranch(
  sandbox: Sandbox,
  project: Project,
  task: Task,
): Promise<string> {
  const branchName = `task/${task.id}-${slugify(task.title)}`;
  const dir = project.repoPath;
  await execInContainer(
    sandbox,
    `cd ${dir} && git checkout ${project.defaultBranch} && git checkout -b ${branchName}`,
  );
  return branchName;
}

/** Get a diff summary of a feature branch against the default branch. */
export async function getBranchDiff(
  sandbox: Sandbox,
  project: Project,
  branch: string,
): Promise<{ filesChanged: number; insertions: number; deletions: number; patch: string; files: { path: string; insertions: number; deletions: number }[] }> {
  const dir = project.repoPath;

  // Stat summary
  const stat = await execInContainer(
    sandbox,
    `cd ${dir} && git diff --stat ${project.defaultBranch}...${branch}`,
  );

  // Numstat for per-file counts
  const numstat = await execInContainer(
    sandbox,
    `cd ${dir} && git diff --numstat ${project.defaultBranch}...${branch}`,
  );

  const files: { path: string; insertions: number; deletions: number }[] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue;
    const [ins, del, path] = line.split('\t');
    const insertions = parseInt(ins) || 0;
    const deletions = parseInt(del) || 0;
    files.push({ path, insertions, deletions });
    totalInsertions += insertions;
    totalDeletions += deletions;
  }

  // Full patch (capped at 50KB to avoid huge diffs)
  const patch = await execInContainer(
    sandbox,
    `cd ${dir} && git diff ${project.defaultBranch}...${branch} | head -c 51200`,
  );

  return {
    filesChanged: files.length,
    insertions: totalInsertions,
    deletions: totalDeletions,
    files,
    patch,
  };
}

/** Merge a feature branch into the default branch and delete it. */
export async function mergeBranch(
  sandbox: Sandbox,
  project: Project,
  branch: string,
): Promise<{ success: boolean; error?: string }> {
  const dir = project.repoPath;
  try {
    await execInContainer(
      sandbox,
      `cd ${dir} && git checkout ${project.defaultBranch} && git merge --no-ff ${branch} -m "Merge ${branch}"`,
    );
    await execInContainer(sandbox, `cd ${dir} && git branch -d ${branch}`);
    return { success: true };
  } catch (err) {
    // Abort the failed merge
    try {
      await execInContainer(sandbox, `cd ${dir} && git merge --abort`);
    } catch {
      // Already clean
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Merge failed',
    };
  }
}

/** Create a git bundle and upload it to R2. */
export async function bundleRepo(
  sandbox: Sandbox,
  env: MoltbotEnv,
  project: Project,
): Promise<void> {
  const dir = project.repoPath;
  const bundlePath = `/tmp/${project.id}.bundle`;
  await execInContainer(sandbox, `cd ${dir} && git bundle create ${bundlePath} --all`);

  // Read the bundle file and upload to R2
  const bundleData = await sandbox.readFile(bundlePath);
  if (!bundleData) throw new Error('Failed to read bundle file');

  const bucket = env.R2_BUCKET;
  const r2Key = `${REPOS_R2_PREFIX}/${project.id}/repo.bundle`;
  await bucket.put(r2Key, bundleData);

  const meta = {
    lastBundledAt: Date.now(),
    projectId: project.id,
    projectName: project.name,
  };
  await bucket.put(
    `${REPOS_R2_PREFIX}/${project.id}/meta.json`,
    JSON.stringify(meta),
    { httpMetadata: { contentType: 'application/json' } },
  );

  // Cleanup temp file
  try {
    await execInContainer(sandbox, `rm -f ${bundlePath}`);
  } catch {
    // Non-fatal
  }
}

/** Restore a project repo from its R2 bundle. */
export async function restoreRepo(
  sandbox: Sandbox,
  env: MoltbotEnv,
  project: Project,
): Promise<boolean> {
  const bucket = env.R2_BUCKET;
  const r2Key = `${REPOS_R2_PREFIX}/${project.id}/repo.bundle`;
  const obj = await bucket.get(r2Key);
  if (!obj) return false;

  const bundlePath = `/tmp/${project.id}.bundle`;
  const data = await obj.arrayBuffer();
  await sandbox.writeFile(bundlePath, new Uint8Array(data));

  const dir = project.repoPath;
  await execInContainer(sandbox, `rm -rf ${dir}`);
  await execInContainer(sandbox, `git clone ${bundlePath} ${dir}`);
  await execInContainer(sandbox, `cd ${dir} && git config user.email "abhiyan@local"`);
  await execInContainer(sandbox, `cd ${dir} && git config user.name "Abhiyan"`);
  await execInContainer(sandbox, `rm -f ${bundlePath}`);
  return true;
}

/** Get git status for a project repo. */
export async function getRepoStatus(
  sandbox: Sandbox,
  project: Project,
): Promise<{ currentBranch: string; branches: string[]; uncommittedChanges: number }> {
  const dir = project.repoPath;
  const branch = await execInContainer(sandbox, `cd ${dir} && git branch --show-current`);
  const branchList = await execInContainer(sandbox, `cd ${dir} && git branch --format='%(refname:short)'`);
  const status = await execInContainer(sandbox, `cd ${dir} && git status --porcelain`);

  return {
    currentBranch: branch,
    branches: branchList.split('\n').filter(Boolean),
    uncommittedChanges: status ? status.split('\n').filter(Boolean).length : 0,
  };
}

/** Get recent commit log. */
export async function getLog(
  sandbox: Sandbox,
  project: Project,
  limit = 10,
): Promise<string> {
  const dir = project.repoPath;
  return execInContainer(
    sandbox,
    `cd ${dir} && git log --oneline -${limit}`,
  );
}

/** List branches with metadata. */
export async function listBranches(
  sandbox: Sandbox,
  project: Project,
): Promise<{ name: string; current: boolean }[]> {
  const dir = project.repoPath;
  const output = await execInContainer(
    sandbox,
    `cd ${dir} && git branch --format='%(HEAD) %(refname:short)'`,
  );
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      name: line.slice(2),
      current: line.startsWith('*'),
    }));
}

/** Check if a repo exists at the project path. */
export async function repoExists(
  sandbox: Sandbox,
  project: Project,
): Promise<boolean> {
  try {
    await execInContainer(sandbox, `test -d ${project.repoPath}/.git`);
    return true;
  } catch {
    return false;
  }
}
```

**Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/git-service.ts
git commit -m "feat: add GitService module for container git operations"
```

---

## Task 4: Update Orchestrator — Git-Aware Dispatch and Reconciliation

**Files:**
- Modify: `src/orchestrator/index.ts` (lines 77-220)
- Modify: `src/orchestrator/dispatcher.ts` (lines 73-93 — buildTaskMessage)

**Step 1: Update orchestrator cycle with git operations**

In `src/orchestrator/index.ts`, add imports:

```typescript
import { createBranch, bundleRepo, mergeBranch, getBranchDiff, repoExists, initRepo } from '../lib/git-service';
```

Update `createDefaultState()` to include new fields:

```typescript
function createDefaultState(): OrchestratorState {
  const agents: Record<string, AgentState> = {};
  for (const id of AGENT_IDS) {
    agents[id] = {
      status: 'idle',
      currentTaskId: null,
      currentProjectId: null,
      taskStartedAt: null,
      currentBranch: null,
    };
  }
  return {
    enabled: true,
    agents,
    lastRunAt: 0,
    lastDispatchAt: null,
    lastBundleRunAt: null,
    cycleCount: 0,
  };
}
```

Update `reconcileBusyAgents` to handle the new `review` → Sentinel dispatch and `needs_approval` status:

- When a task moves to `review`: if the working agent is not Sentinel, mark agent idle, then queue Sentinel dispatch with the branch diff
- When a task moves to `needs_approval`: mark agent idle, no further action (wait for human)
- When a task moves to `done` (auto-approved via Sentinel): call `mergeBranch`, then `bundleRepo`, mark agent idle
- Reset `currentBranch` on agent when going idle

Update the dispatch phase:

- Before dispatching, check `repoExists(sandbox, project)`. If not, call `initRepo(sandbox, project)`.
- Call `createBranch(sandbox, project, task)` and set `task.branch` to the result.
- Pass branch and project context to the enhanced `buildTaskMessage`.
- Set `agentState.currentBranch = task.branch`.

Add Phase 2 — process approvals:

```typescript
async function processApprovals(
  sandbox: Sandbox,
  env: MoltbotEnv,
  bucket: R2Bucket,
  state: OrchestratorState,
): Promise<void> {
  // Read approved tasks from R2 approval queue
  // For each approved task: mergeBranch + bundleRepo + mark done
  // For each rejected task: prepend feedback, move to todo, preserve branch
}
```

Add Phase 4 — bundle sync (every 5th cycle):

```typescript
if (state.cycleCount % 5 === 0) {
  const index = await getIndex(bucket);
  for (const entry of index.filter((e) => e.status === 'active')) {
    const project = await getProject(bucket, entry.id);
    if (!project || !project.lastBundledAt) continue;
    // Bundle if there have been changes (check via git status or time-based)
    try {
      await bundleRepo(sandbox, env, project);
      project.lastBundledAt = Date.now();
      await saveProject(bucket, project);
    } catch (err) {
      console.log(`Bundle failed for ${project.name}: ${err}`);
    }
  }
  state.lastBundleRunAt = Date.now();
}
state.cycleCount++;
```

**Step 2: Update dispatcher — enhanced task message**

In `src/orchestrator/dispatcher.ts`, update `buildTaskMessage`:

```typescript
function buildTaskMessage(task: Task, _agentId: AgentId, project: Project): string {
  const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  const moveCmd = `node skills/abhiyan/scripts/abhiyan.cjs tasks move ${project.id} ${task.id}`;

  const sections = [
    `## Orchestrator Task Assignment`,
    ``,
    `**Project**: ${project.name} (ID: ${project.id})`,
    `**Task**: ${task.title} (ID: ${task.id})`,
    `**Priority**: ${priorityLabel}`,
    `**Branch**: ${task.branch || 'none'}`,
  ];

  // Setup section with git checkout
  if (task.branch && project.repoPath) {
    sections.push(
      ``,
      `### Setup`,
      `\`\`\`bash`,
      `cd ${project.repoPath} && git checkout ${task.branch}`,
      `\`\`\``,
    );
  }

  // Project context
  if (project.techStack?.length || project.contextFiles?.length || project.instructions) {
    sections.push(``, `### Project Context`);
    if (project.techStack?.length) {
      sections.push(`**Tech Stack**: ${project.techStack.join(', ')}`);
    }
    if (project.contextFiles?.length) {
      sections.push(`**Key Files to Read First**:`);
      for (const f of project.contextFiles) {
        sections.push(`- ${f}`);
      }
    }
    if (project.instructions) {
      sections.push(``, `### Project Instructions`, project.instructions);
    }
  }

  sections.push(
    ``,
    `### Description`,
    task.description || '_No description provided_',
    ``,
    `### Git Workflow`,
    `- Work on your assigned branch only`,
    `- Commit frequently with descriptive messages`,
    `- When done: \`${moveCmd} --status review\``,
    `- Do NOT merge to main — the orchestrator handles merges`,
    ``,
    `### Status Commands`,
    `- Move to review: \`${moveCmd} --status review\``,
    `- Move back to todo: \`${moveCmd} --status todo\``,
    ``,
    `Follow your Orchestrator Tasks instructions in AGENTS.md for this task.`,
  );

  return sections.join('\n');
}
```

Also create a `buildReviewMessage` function for Sentinel:

```typescript
export function buildReviewMessage(
  task: Task,
  project: Project,
  diff: { filesChanged: number; insertions: number; deletions: number; patch: string },
): string {
  const moveCmd = `node skills/abhiyan/scripts/abhiyan.cjs tasks move ${project.id} ${task.id}`;
  return [
    `## Code Review Assignment`,
    ``,
    `**Project**: ${project.name} (ID: ${project.id})`,
    `**Task**: ${task.title} (ID: ${task.id})`,
    `**Branch**: ${task.branch}`,
    `**Changes**: +${diff.insertions} -${diff.deletions} across ${diff.filesChanged} files`,
    ``,
    `### Diff`,
    '```diff',
    diff.patch,
    '```',
    ``,
    `### Review Checklist`,
    `- Code correctness and edge cases`,
    `- Follows project conventions`,
    `- No security vulnerabilities`,
    `- Adequate error handling`,
    ``,
    `### Actions`,
    task.approvalRequired
      ? `- Approve: \`${moveCmd} --status needs_approval\``
      : `- Approve: \`${moveCmd} --status done\``,
    `- Request changes: \`${moveCmd} --status todo\``,
    `  (Add feedback as a comment before moving back)`,
    ``,
    `Follow your Code Review instructions in AGENTS.md.`,
  ].join('\n');
}
```

**Step 3: Update dispatchTask to set branch on task**

In `dispatchTask`, after step 1 (mutate task in R2), also persist `task.branch`:

```typescript
// The branch is already set on the task object before dispatch is called
// (set by orchestrator cycle in Phase 3)
```

**Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator/index.ts src/orchestrator/dispatcher.ts
git commit -m "feat(orchestrator): git-aware dispatch with branch creation and enhanced task messages"
```

---

## Task 5: Create Approvals API

**Files:**
- Create: `src/routes/approvals-api.ts`
- Modify: `src/routes/team-api.ts` (line 484 — mount new route)

**Step 1: Create `src/routes/approvals-api.ts`**

```typescript
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getIndex, getProject, listTasks, getTask, saveTask, saveProject } from '../lib/abhiyan';
import { getBranchDiff, mergeBranch, bundleRepo } from '../lib/git-service';

const approvalsApi = new Hono<AppEnv>();

// GET / — list all tasks with status 'needs_approval' across projects
approvalsApi.get('/', async (c) => {
  const bucket = c.env.R2_BUCKET;
  const index = await getIndex(bucket);
  const approvals: {
    task: any;
    project: { id: string; name: string; color: string };
  }[] = [];

  for (const entry of index) {
    if (entry.status !== 'active') continue;
    const tasks = await listTasks(bucket, entry.id);
    for (const task of tasks) {
      if (task.status === 'needs_approval') {
        approvals.push({
          task,
          project: { id: entry.id, name: entry.name, color: entry.color },
        });
      }
    }
  }

  // Sort by priority (critical first), then createdAt
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  approvals.sort((a, b) => {
    const pa = priorityOrder[a.task.priority] ?? 3;
    const pb = priorityOrder[b.task.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return a.task.createdAt - b.task.createdAt;
  });

  return c.json(approvals);
});

// POST /:taskId/approve — approve a task and trigger merge
approvalsApi.post('/:taskId/approve', async (c) => {
  const { taskId } = c.req.param();
  const body = await c.req.json<{ projectId: string }>().catch(() => ({ projectId: '' }));
  if (!body.projectId) return c.json({ error: 'projectId is required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const sandbox = c.get('sandbox');

  const project = await getProject(bucket, body.projectId);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const task = await getTask(bucket, body.projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (task.status !== 'needs_approval') {
    return c.json({ error: `Task is not awaiting approval (status: ${task.status})` }, 400);
  }

  // Merge the branch
  if (task.branch) {
    const mergeResult = await mergeBranch(sandbox, project, task.branch);
    if (!mergeResult.success) {
      return c.json({
        error: `Merge failed: ${mergeResult.error}. Task moved back to todo.`,
      }, 409);
    }

    // Bundle to R2
    try {
      await bundleRepo(sandbox, c.env, project);
      project.lastBundledAt = Date.now();
      project.updatedAt = Date.now();
      await saveProject(bucket, project);
    } catch (err) {
      console.log(`Bundle after merge failed: ${err}`);
    }
  }

  // Mark task done
  task.status = 'done';
  task.completedAt = Date.now();
  task.updatedAt = Date.now();
  await saveTask(bucket, body.projectId, task);

  return c.json({ ok: true, task });
});

// POST /:taskId/reject — reject and send back with feedback
approvalsApi.post('/:taskId/reject', async (c) => {
  const { taskId } = c.req.param();
  const body = await c.req.json<{ projectId: string; feedback: string }>().catch(() => ({
    projectId: '',
    feedback: '',
  }));
  if (!body.projectId) return c.json({ error: 'projectId is required' }, 400);

  const bucket = c.env.R2_BUCKET;

  const task = await getTask(bucket, body.projectId, taskId);
  if (!task) return c.json({ error: 'Task not found' }, 404);
  if (task.status !== 'needs_approval') {
    return c.json({ error: `Task is not awaiting approval (status: ${task.status})` }, 400);
  }

  // Prepend feedback and move to todo
  if (body.feedback) {
    task.description = `**Review Feedback:** ${body.feedback}\n\n---\n\n${task.description}`;
  }
  task.status = 'todo';
  task.completedAt = null;
  task.updatedAt = Date.now();
  // Keep task.branch — agent will continue on same branch
  await saveTask(bucket, body.projectId, task);

  return c.json({ ok: true, task });
});

export { approvalsApi };
```

**Step 2: Mount in team-api**

In `src/routes/team-api.ts`, after line 484 (orchestrator mount):

```typescript
import { approvalsApi } from './approvals-api';
teamApi.route('/approvals', approvalsApi);
```

**Step 3: Add branch and diff endpoints to projects-api**

In `src/routes/projects-api.ts`, add two new routes before the export:

```typescript
import { listBranches, getBranchDiff, repoExists } from '../lib/git-service';

// GET /:id/branches — list branches for a project
projectsApi.get('/:id/branches', async (c) => {
  const bucket = c.env.R2_BUCKET;
  const sandbox = c.get('sandbox');
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const exists = await repoExists(sandbox, project);
  if (!exists) return c.json([]);

  const branches = await listBranches(sandbox, project);
  return c.json(branches);
});

// GET /:id/diff/:branch — get diff for a branch
projectsApi.get('/:id/diff/:branch', async (c) => {
  const bucket = c.env.R2_BUCKET;
  const sandbox = c.get('sandbox');
  const project = await getProject(bucket, c.req.param('id'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const branch = decodeURIComponent(c.req.param('branch'));
  const diff = await getBranchDiff(sandbox, project, branch);
  return c.json(diff);
});
```

**Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/approvals-api.ts src/routes/team-api.ts src/routes/projects-api.ts
git commit -m "feat(api): add approvals API and branch/diff endpoints"
```

---

## Task 6: Update Abhiyan CLI

**Files:**
- Modify: `skills/abhiyan/scripts/abhiyan.cjs`

**Step 1: Update VALID_TASK_STATUSES**

```javascript
const VALID_TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'needs_approval', 'done'];
```

**Step 2: Update `tasksCreate` to support new fields**

In the `tasksCreate` function, add:

```javascript
const task = {
  // ... existing fields ...
  branch: null,
  approvalRequired: flags['approval-required'] === true || flags.priority === 'critical',
};
```

**Step 3: Add `projects info` command**

New function that outputs project context for agents:

```javascript
function projectsInfo(projectId) {
  const project = getProject(projectId);
  if (!project) { console.error(`Project not found: ${projectId}`); process.exit(1); }
  console.log(`Name: ${project.name}`);
  console.log(`Repo: ${project.repoPath || 'not configured'}`);
  console.log(`Default Branch: ${project.defaultBranch || 'main'}`);
  console.log(`Tech Stack: ${(project.techStack || []).join(', ') || 'none'}`);
  console.log(`Instructions: ${project.instructions || 'none'}`);
  console.log(`Context Files: ${(project.contextFiles || []).join(', ') || 'none'}`);
  console.log(`Tags: ${(project.tags || []).join(', ') || 'none'}`);
  console.log(`Status: ${project.status}`);
}
```

**Step 4: Add `git status` and `git branches` commands**

These are thin wrappers that run git in the project directory:

```javascript
function gitStatus(projectId) {
  const project = getProject(projectId);
  if (!project) { console.error(`Project not found: ${projectId}`); process.exit(1); }
  if (!project.repoPath) { console.error('No repo configured for this project'); process.exit(1); }
  const { execSync } = require('child_process');
  try {
    const branch = execSync(`cd ${project.repoPath} && git branch --show-current`, { encoding: 'utf8' }).trim();
    const status = execSync(`cd ${project.repoPath} && git status --short`, { encoding: 'utf8' }).trim();
    const log = execSync(`cd ${project.repoPath} && git log --oneline -5`, { encoding: 'utf8' }).trim();
    console.log(`Branch: ${branch}`);
    console.log(`Changes:\n${status || '(clean)'}`);
    console.log(`Recent commits:\n${log}`);
  } catch (err) {
    console.error(`Git error: ${err.message}`);
    process.exit(1);
  }
}

function gitBranches(projectId) {
  const project = getProject(projectId);
  if (!project) { console.error(`Project not found: ${projectId}`); process.exit(1); }
  if (!project.repoPath) { console.error('No repo configured for this project'); process.exit(1); }
  const { execSync } = require('child_process');
  try {
    const output = execSync(`cd ${project.repoPath} && git branch -v`, { encoding: 'utf8' }).trim();
    console.log(output);
  } catch (err) {
    console.error(`Git error: ${err.message}`);
    process.exit(1);
  }
}
```

**Step 5: Update CLI dispatch table**

Add the new commands to the main switch/if block:

```javascript
// In the command dispatch section:
if (resource === 'projects' && action === 'info') return projectsInfo(args[0]);
if (resource === 'git' && action === 'status') return gitStatus(args[0]);
if (resource === 'git' && action === 'branches') return gitBranches(args[0]);
```

**Step 6: Verify CLI works**

Run: `node skills/abhiyan/scripts/abhiyan.cjs --help` (or test manually)

**Step 7: Commit**

```bash
git add skills/abhiyan/scripts/abhiyan.cjs
git commit -m "feat(cli): add project info, git status/branches commands, needs_approval status"
```

---

## Task 7: Update Container Startup — Bundle Restore

**Files:**
- Modify: `start-openclaw.sh` (lines 61-101 — R2 restore section)

**Step 1: Add bundle restore after abhiyan restore**

Insert after the abhiyan restore block (around line 101):

```bash
# ── Restore project git repos from R2 bundles ──
if r2_configured; then
  echo "Checking for project repo bundles..."
  BUNDLE_LIST=$(rclone lsf "r2:${R2_BUCKET}/repos/" $RCLONE_FLAGS 2>/dev/null || echo "")
  if [ -n "$BUNDLE_LIST" ]; then
    echo "$BUNDLE_LIST" | while IFS= read -r project_dir; do
      project_id="${project_dir%/}"
      [ -z "$project_id" ] && continue
      REPO_DIR="/root/clawd/projects/$project_id"
      BUNDLE_TMP="/tmp/${project_id}.bundle"
      echo "Restoring repo: $project_id"
      rclone copy "r2:${R2_BUCKET}/repos/${project_id}/repo.bundle" /tmp/ $RCLONE_FLAGS \
        --include="repo.bundle" 2>/dev/null || {
          echo "WARNING: Failed to download bundle for $project_id"
          continue
        }
      if [ -f "$BUNDLE_TMP" ]; then
        rm -rf "$REPO_DIR"
        mkdir -p "$REPO_DIR"
        git clone "$BUNDLE_TMP" "$REPO_DIR" 2>/dev/null || {
          echo "WARNING: Failed to clone bundle for $project_id"
          rm -f "$BUNDLE_TMP"
          continue
        }
        cd "$REPO_DIR" && git config user.email "abhiyan@local" && git config user.name "Abhiyan"
        rm -f "$BUNDLE_TMP"
        echo "Restored: $project_id"
      fi
    done
    echo "Repo restore complete"
  else
    echo "No repo bundles found in R2"
  fi
fi
```

**Step 2: Ensure projects directory exists**

Add early in the script (around line 25):

```bash
mkdir -p /root/clawd/projects
```

**Step 3: Commit**

```bash
git add start-openclaw.sh
git commit -m "feat(startup): restore project git repos from R2 bundles on container start"
```

---

## Task 8: Frontend — Client API Functions

**Files:**
- Modify: `src/client/team/api.ts`

**Step 1: Add approval and branch API functions**

Append to `src/client/team/api.ts`:

```typescript
// Approvals
export const fetchApprovals = () =>
  teamRequest<{ task: Task; project: { id: string; name: string; color: string } }[]>('/approvals');
export const approveTask = (taskId: string, projectId: string) =>
  teamMutate<{ ok: boolean; task: Task }>(`/approvals/${taskId}/approve`, 'POST', { projectId });
export const rejectTask = (taskId: string, projectId: string, feedback: string) =>
  teamMutate<{ ok: boolean; task: Task }>(`/approvals/${taskId}/reject`, 'POST', { projectId, feedback });

// Branches
export const fetchBranches = (projectId: string) =>
  teamRequest<{ name: string; current: boolean }[]>(`/projects/${projectId}/branches`);
export const fetchBranchDiff = (projectId: string, branch: string) =>
  teamRequest<DiffSummary>(`/projects/${projectId}/diff/${encodeURIComponent(branch)}`);
```

Add `DiffSummary` import from types.

**Step 2: Commit**

```bash
git add src/client/team/api.ts
git commit -m "feat(client): add approval, branch, and diff API functions"
```

---

## Task 9: Frontend — Approval Queue Component

**Files:**
- Create: `src/client/team/components/ApprovalQueue.tsx`

**Step 1: Create the component**

Build a component that:
- Fetches approvals via `fetchApprovals()`
- Renders each approval as a card with task info, diff summary, and approve/reject buttons
- Approve button calls `approveTask()` and refreshes
- Reject button shows a textarea for feedback, then calls `rejectTask()`
- "View Diff" expands to show the patch in a `<pre>` block

This is a standard React component following the patterns in existing components (TaskBoard, TaskCard). Use `useState` + `useEffect` for data fetching, match existing CSS class naming (`ab-` prefix).

**Step 2: Commit**

```bash
git add src/client/team/components/ApprovalQueue.tsx
git commit -m "feat(ui): add ApprovalQueue component with diff viewer"
```

---

## Task 10: Frontend — Project Settings Component

**Files:**
- Create: `src/client/team/components/ProjectSettings.tsx`

**Step 1: Create the component**

A form component for editing project-level fields:
- `techStack` — comma-separated text input
- `instructions` — textarea
- `contextFiles` — comma-separated text input
- `tags` — comma-separated text input
- `links` — dynamic add/remove rows with label + url inputs
- Save button calls `updateProject()`

Follow existing modal patterns (TaskModal.tsx) for styling.

**Step 2: Commit**

```bash
git add src/client/team/components/ProjectSettings.tsx
git commit -m "feat(ui): add ProjectSettings component for project context editing"
```

---

## Task 11: Frontend — Branches View Component

**Files:**
- Create: `src/client/team/components/BranchesView.tsx`

**Step 1: Create the component**

Shows the list of branches for the active project:
- Fetches via `fetchBranches(projectId)`
- Lists each branch with name and current indicator
- Click to expand and view diff via `fetchBranchDiff()`
- Diff rendered in a `<pre>` block with syntax highlighting class

**Step 2: Commit**

```bash
git add src/client/team/components/BranchesView.tsx
git commit -m "feat(ui): add BranchesView component for project branch listing"
```

---

## Task 12: Frontend — Wire Components into TeamApp

**Files:**
- Modify: `src/client/team/TeamApp.tsx`
- Modify: `src/client/team/components/ProjectHeader.tsx`

**Step 1: Add tab navigation to project view**

In `TeamApp.tsx`, add state for active tab:

```typescript
const [projectTab, setProjectTab] = useState<'tasks' | 'branches' | 'settings'>('tasks');
```

In the main area where TaskBoard is rendered, wrap in tab navigation:

```tsx
<div className="ab-project-tabs">
  <button className={projectTab === 'tasks' ? 'active' : ''} onClick={() => setProjectTab('tasks')}>Tasks</button>
  <button className={projectTab === 'branches' ? 'active' : ''} onClick={() => setProjectTab('branches')}>Branches</button>
  <button className={projectTab === 'settings' ? 'active' : ''} onClick={() => setProjectTab('settings')}>Settings</button>
</div>

{projectTab === 'tasks' && <TaskBoard ... />}
{projectTab === 'branches' && <BranchesView projectId={activeProject.id} />}
{projectTab === 'settings' && <ProjectSettings project={activeProject} onUpdate={...} />}
```

**Step 2: Add approval queue to sidebar or header**

Add an "Approvals" button/badge in the header that toggles the ApprovalQueue panel:

```tsx
const [showApprovals, setShowApprovals] = useState(false);

// In header:
<button onClick={() => setShowApprovals(!showApprovals)}>
  Approvals {approvalCount > 0 && <span className="ab-badge">{approvalCount}</span>}
</button>

// Render approval queue panel when active
{showApprovals && <ApprovalQueue />}
```

**Step 3: Commit**

```bash
git add src/client/team/TeamApp.tsx src/client/team/components/ProjectHeader.tsx
git commit -m "feat(ui): wire approval queue, branches, and settings into team dashboard"
```

---

## Task 13: Build and Verify

**Files:** None (verification only)

**Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Build**

Run: `npm run build`
Expected: Vite build succeeds, no errors

**Step 3: Run existing tests**

Run: `npm test`
Expected: All existing tests pass (new code doesn't break existing behavior)

**Step 4: Manual verification**

Run: `npm run start` (wrangler dev)
- Verify dashboard loads at `/_team/`
- Verify new Approvals button appears
- Verify project tabs (Tasks/Branches/Settings) render
- Verify creating a project shows new fields

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from git service integration"
```

---

## Task 14: Final Commit and Summary

**Step 1: Review all changes**

Run: `git log --oneline` to verify clean commit history

**Step 2: Create summary commit if needed**

If any loose ends, commit them.

Expected final commit history for this feature:
1. `feat(types): extend Project/Task with git fields, add needs_approval status`
2. `feat(api): support new Project/Task fields in create and update handlers`
3. `feat: add GitService module for container git operations`
4. `feat(orchestrator): git-aware dispatch with branch creation and enhanced task messages`
5. `feat(api): add approvals API and branch/diff endpoints`
6. `feat(cli): add project info, git status/branches commands, needs_approval status`
7. `feat(startup): restore project git repos from R2 bundles on container start`
8. `feat(client): add approval, branch, and diff API functions`
9. `feat(ui): add ApprovalQueue component with diff viewer`
10. `feat(ui): add ProjectSettings component for project context editing`
11. `feat(ui): add BranchesView component for project branch listing`
12. `feat(ui): wire approval queue, branches, and settings into team dashboard`
13. `fix: resolve build issues from git service integration`
