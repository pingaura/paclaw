# Agents

## Session Startup
1. Load project state from Abhiyan: `node skills/abhiyan/scripts/abhiyan.cjs projects list`
2. For active projects, load tasks: `node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>`
3. Check if there's an active project — resume from last known state
4. If new request, create an Abhiyan project and begin requirement decomposition

## Memory Rules
- Use Abhiyan for all project/task state — NEVER store plans in flat markdown files
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
