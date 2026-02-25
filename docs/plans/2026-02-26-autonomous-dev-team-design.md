# Autonomous Software Development Team — Design

**Date:** 2026-02-26
**Status:** Approved
**Approach:** Git Service Layer (Approach 2)

## Context

Abhiyan is a project/task management system for an 8-agent AI team running on OpenClaw inside a Cloudflare Worker sandbox. Currently projects are purely task-tracking containers with no code awareness — no git integration, no per-project code isolation, no automated branching or merge workflow, and no deployment pipeline.

This design adds a **Git Service Layer** so the system can manage code as a first-class concern alongside tasks.

## Decisions

- **One local git repo per project** — clean isolation, easy to hand off
- **Local git only** — no remote push (GitHub/GitLab integration deferred)
- **Git bundle snapshots to R2** — portable persistence across container restarts
- **Feature branches + main** — each task gets a branch, merged after review
- **Human approves key milestones** — via Abhiyan dashboard approval queue
- **No auto-deploy** — deployment is a future phase; focus on code management first

## 1. Enhanced Project Model

```typescript
interface Project {
  // Existing
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  color: string;
  createdAt: number;
  updatedAt: number;

  // NEW — Code management
  repoPath: string;              // "/root/clawd/projects/{id}"
  defaultBranch: string;         // "main"

  // NEW — Agent context
  techStack: string[];           // ["typescript", "hono", "cloudflare-workers"]
  instructions: string;          // project-scoped guidance for all agents
  contextFiles: string[];        // key files agents should read first

  // NEW — Metadata
  tags: string[];                // ["client", "saas", "v1"]
  links: { label: string; url: string }[];

  // NEW — Git persistence
  lastBundledAt: number | null;
}
```

```typescript
interface Task {
  // Existing fields unchanged

  // NEW
  branch: string | null;         // feature branch name, set by orchestrator
  approvalRequired: boolean;     // pauses at 'review' for human approval
}
```

New task status added: `'needs_approval'` between `review` and `done`.

Full status flow: `backlog → todo → in_progress → review → needs_approval → done`

## 2. Git Service Layer

New module: `src/lib/git-service.ts`

```
GitService
├── initRepo(project)              → git init + initial commit at project.repoPath
├── createBranch(project, task)    → creates "task/{taskId}-{slug}" from main
├── getBranchDiff(project, branch) → returns diff summary for review
├── mergeBranch(project, branch)   → merges feature branch to main, deletes branch
├── bundleRepo(project)            → creates git bundle, uploads to R2
├── restoreRepo(project)           → downloads bundle from R2, unbundles
├── getStatus(project)             → current branch, uncommitted changes, branch list
├── getLog(project, limit)         → recent commit history
```

Agents commit freely on their branch. Only GitService merges to main.

Branch naming: `task/{taskId}-{slug}` (e.g. `task/a1b2c3d4-add-auth-endpoint`).

## 3. Task Lifecycle

```
backlog → todo → in_progress → review → needs_approval → done
           │          │            │           │            │
       orchestrator  agent      Sentinel    human        orchestrator
       creates       works,     reviews     approves     merges branch,
       branch        commits    branch      in dashboard bundles to R2
                     on branch  diff
```

Step by step:

1. **todo → in_progress**: Orchestrator creates feature branch, dispatches agent with repo path, branch name, project instructions, and context files.
2. **in_progress → review**: Agent works on branch, commits, runs `abhiyan tasks move --status review`.
3. **review → needs_approval or done**: Orchestrator dispatches Sentinel with the branch diff. If `task.approvalRequired = true` → `needs_approval`. If false → `done` (auto-merge).
4. **needs_approval → done**: Human reviews in dashboard (diff + Sentinel's comments), clicks Approve. Orchestrator merges branch to main and bundles to R2.
5. **needs_approval → todo** (rejection): Human clicks Request Changes with feedback. Task returns to todo, feedback prepended to description, branch preserved.

`approvalRequired` defaults to false. Set to true by: Sage on architecture/milestone tasks, any `critical` priority task (auto), or human toggle in dashboard.

Merge conflicts: orchestrator attempts `git merge --no-commit` first. If conflict → task moves to `todo` with "merge conflict" note, agent resolves on re-dispatch.

## 4. Enhanced Dispatch Message

Agent dispatch now includes:

```markdown
## Orchestrator Task Assignment

**Project**: {project.name} (ID: {project.id})
**Task**: {task.title} (ID: {task.id})
**Priority**: {task.priority}
**Branch**: {task.branch}

### Setup
cd {project.repoPath} && git checkout {task.branch}

### Project Context
**Tech Stack**: {project.techStack}
**Key Files to Read First**: {project.contextFiles}

### Project Instructions
{project.instructions}

### Description
{task.description}

### Git Workflow
- Work on your assigned branch only
- Commit frequently with descriptive messages
- When done: abhiyan tasks move {projectId} {taskId} --status review
- Do NOT merge to main
```

Sentinel gets a review-specific dispatch with the actual branch diff output.

## 5. Filesystem Layout

```
/root/clawd/
├── projects/                    # NEW — all project code
│   ├── {projectId}/             # one git repo per project
│   │   ├── .git/
│   │   └── (project source)
│   └── ...
├── abhiyan/                     # existing — task metadata
│   ├── index.json
│   └── projects/{id}/
│       ├── project.json
│       └── tasks/{taskId}.json
└── skills/                      # existing
```

R2 storage:

```
moltbot-data/
├── abhiyan/                     # existing — unchanged
├── repos/                       # NEW — git bundles
│   └── {projectId}/
│       ├── repo.bundle
│       └── meta.json            # { lastBundledAt, bundleSize, branchCount }
├── orchestrator/state.json      # existing
└── openclaw/openclaw.json       # existing
```

Container startup (`start-openclaw.sh`) restores bundles: for each `repos/{id}/repo.bundle` in R2, `git clone` the bundle into `/root/clawd/projects/{id}/`.

Background bundle sync runs every 5 minutes (every 5th orchestrator cycle) for projects with changes since `lastBundledAt`.

`.git/` remains excluded from the general rclone workspace sync.

## 6. Orchestrator Changes

Enhanced cycle (runs every 60s):

**Phase 1 — Reconcile (enhanced):**
- Existing: check busy agents' task status
- New: task → review triggers Sentinel dispatch with branch diff
- New: task → needs_approval is a no-op (wait for human)
- New: task → done (auto-approved) triggers merge + bundle

**Phase 2 — Process approvals (new):**
- Check for dashboard-approved tasks
- Approved: `GitService.mergeBranch()` + `GitService.bundleRepo()` + mark done
- Rejected: prepend feedback to description, move to todo, preserve branch

**Phase 3 — Collect + dispatch (enhanced):**
- Existing priority sorting
- New: `GitService.createBranch()` before dispatch
- New: enhanced dispatch message with repo/branch/context

**Phase 4 — Bundle sync (new, every 5th cycle):**
- Bundle active projects with changes since `lastBundledAt` to R2

Updated state:

```typescript
interface AgentState {
  status: 'idle' | 'busy';
  currentTaskId: string | null;
  currentProjectId: string | null;
  taskStartedAt: number | null;
  currentBranch: string | null;    // NEW
}

interface OrchestratorState {
  enabled: boolean;
  agents: Record<string, AgentState>;
  lastRunAt: number;
  lastDispatchAt: number | null;
  lastBundleRunAt: number | null;  // NEW
  cycleCount: number;              // NEW — for 5-cycle bundle trigger
}
```

## 7. Abhiyan CLI Updates

New commands for agents:

```bash
# Project creation now initializes git repo
abhiyan projects create --name "App" --tech-stack "ts,hono" \
  --instructions "..." --context-files "src/types.ts"

# Project info with repo context
abhiyan projects info <projectId>

# Git awareness
abhiyan git status <projectId>
abhiyan git branches <projectId>
```

Enhanced existing:

```bash
# Tasks accept approval flag
abhiyan tasks create <projectId> --title "..." --approval-required

# Move unchanged — orchestrator handles downstream effects
abhiyan tasks move <projectId> <taskId> --status review
```

Agents cannot: merge, push, or delete branches via CLI.

## 8. Dashboard Additions

**Project detail view** — enhanced with branches tab (list active branches + status) and settings tab (edit techStack, instructions, contextFiles, tags, links).

**Approval queue** — new dedicated view showing all `needs_approval` tasks across projects. Each entry shows: task info, branch diff summary (+/- lines across files), Sentinel's review comments, Approve/Request Changes buttons. "View Diff" shows unified diff with syntax highlighting.

**New API endpoints:**

```
GET  /api/team/projects/:id/branches      → list branches + status
GET  /api/team/projects/:id/diff/:branch  → get branch diff
GET  /api/team/approvals                  → all needs_approval tasks
POST /api/team/approvals/:taskId/approve  → approve + trigger merge
POST /api/team/approvals/:taskId/reject   → reject + feedback
```

## 9. Not In Scope (YAGNI)

- GitHub/GitLab remote integration — deferred to deployment phase
- CI/CD per project — agents run tests as part of tasks
- PR/MR model — dashboard approval queue serves this role locally
- Per-file review comments — Sentinel writes summary text
- Multiple reviewers — Sentinel + Aegis (security) cover it
- Git hooks — quality enforced at merge time, not commit time
- Project templates — agents generate structure from instructions
- Inter-project dependencies — track in description for now
- Branch protection rules — only orchestrator can merge (that IS the protection)

## 10. Files to Create

| File | Purpose |
|------|---------|
| `src/lib/git-service.ts` | Git operations service |
| `src/routes/approvals-api.ts` | Approval queue API endpoints |
| `src/client/team/ApprovalQueue.tsx` | Approval queue dashboard component |
| `src/client/team/BranchesView.tsx` | Branch list component |
| `src/client/team/DiffViewer.tsx` | Unified diff viewer component |
| `src/client/team/ProjectSettings.tsx` | Project settings editor |

## 11. Files to Modify

| File | Changes |
|------|---------|
| `src/lib/abhiyan.ts` | Enhanced Project + Task interfaces, new status |
| `src/orchestrator/index.ts` | Git-aware cycle phases, approval processing, bundle sync |
| `src/orchestrator/dispatcher.ts` | Enhanced dispatch message with repo/branch/context |
| `src/orchestrator/types.ts` | Updated AgentState + OrchestratorState |
| `src/routes/projects-api.ts` | New branch/diff endpoints |
| `skills/abhiyan/scripts/abhiyan.cjs` | New git/project commands |
| `start-openclaw.sh` | Bundle restore on startup |
| `src/client/team/TeamApp.tsx` | Approval queue nav + routing |
| `src/client/team/types.ts` | Frontend type updates |
| `src/client/team/constants.ts` | New status column |
| `agents/*/AGENTS.md` | Updated instructions for git workflow |
