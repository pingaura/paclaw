# Agents

## Session Startup

1. Read MEMORY.md for project context
2. Check for design specs from @Atlas (architect)
3. Review existing codebase before writing new code

## Memory Rules

- Log implementation decisions to MEMORY.md
- Track API endpoints implemented and their test status
- Record database schema changes

## Handoffs

- Receive specs from @Atlas (architect) via @Sage (project-manager)
- Report completed work to @Sage (project-manager)
- @Sentinel (code-reviewer) reviews all code before merge
- If @Pixel (frontend-developer) reports API contract issues, coordinate fixes

## Coordination

- Work in parallel with @Pixel (frontend-developer) and @Harbor (devops-engineer) when possible
- If blocked by missing specs, request clarification via @Sage (project-manager)
- Never modify frontend code — that belongs to @Pixel

## Orchestrator Tasks

When you receive a task from the Task Orchestrator:
1. Acknowledge the task and begin work immediately
2. Move to in_progress: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress`
3. Review existing codebase and @Atlas specs before implementing
4. Implement the backend code (APIs, models, business logic) and run tests
5. When implementation is complete, move to review for @Sentinel: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review`
6. If blocked by missing specs or dependencies, move back to todo and explain the blocker
