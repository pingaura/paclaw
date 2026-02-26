# Agents

## CRITICAL — Intake Protocol (All New Requests)

**NEVER work on a request without first creating an Abhiyan project and tasks.** This applies to ALL incoming messages — Slack, chat, or orchestrator. No exceptions.

When you receive a new request from a user:

1. **Create or find the Abhiyan project:**
   ```bash
   # Check if a matching project exists
   node skills/abhiyan/scripts/abhiyan.cjs projects list
   # If no match, create one
   node skills/abhiyan/scripts/abhiyan.cjs projects create --name "Project Name" --description "What this is about" --color "#60a5fa"
   ```

2. **Decompose the request into tasks** — break it into concrete, actionable tasks:
   ```bash
   node skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> --title "Task title" --priority high --status todo --assignedAgents forge,sentinel
   ```

3. **Set tasks to `todo` status** so the orchestrator can pick them up and dispatch to the right agents automatically.

4. **Acknowledge to the user** — confirm what project and tasks you created, and that work is being dispatched.

**Do NOT:**
- Start working on the request yourself without creating tasks first
- Coordinate agents via free-form chat instead of Abhiyan tasks
- Skip task creation because the request seems "simple"
- Use your own internal task numbering (e.g. TASK-006) — use Abhiyan task IDs

## Session Startup

1. Load project state: `node skills/abhiyan/scripts/abhiyan.cjs projects list`
2. For active projects, load tasks: `node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>`
3. Check if there's an active project — resume from last known state
4. If new request — follow the Intake Protocol above

## Memory Rules

- Use Abhiyan for ALL project/task state — NEVER store plans in flat markdown files
- Write architectural decisions and cross-project notes to MEMORY.md
- Track task status and agent assignments via Abhiyan tasks

## Safety

- Confirm destructive actions with user before delegating
- Validate all inter-agent handoffs have required context
- Never approve deployment without @Sentinel (code-reviewer) sign-off

## Agent Routing

- Architecture & system design → @Atlas (architect)
- Backend implementation (APIs, models, business logic) → @Forge (backend-developer)
- Frontend implementation (UI, components, client logic) → @Pixel (frontend-developer)
- DevOps, CI/CD, Docker, deployment → @Harbor (devops-engineer)
- Code review & QA testing → @Sentinel (code-reviewer)
- Security audit & vulnerability scanning → @Aegis (security-analyst)
- Documentation (README, API docs, guides) → @Scribe (technical-writer)

## Coordination Rules

- @Forge, @Pixel, and @Harbor can work in PARALLEL when tasks are independent
- @Sentinel reviews AFTER implementation is complete
- @Aegis reviews AFTER @Sentinel approves
- @Scribe works AFTER architecture is finalized (can parallel with implementation)
- If @Sentinel or @Aegis finds critical issues, route back to the owning agent for fixes
- Assign the right agent in `--assignedAgents` when creating tasks — the orchestrator uses this for dispatch

## Orchestrator Tasks

When you receive a task from the Task Orchestrator:
1. Acknowledge the task and begin work immediately
2. Move to in_progress: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress`
3. Decompose the task into sub-tasks if needed and assign to appropriate agents via Abhiyan
4. Coordinate agent handoffs and track progress across delegated work
5. When all coordination/management is complete, move to done: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status done`
6. If blocked, move back to todo and explain the blocker in the task description
