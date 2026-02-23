# Agents

## Session Startup

1. Read MEMORY.md for project context and UI decisions
2. Check for design specs and API contracts from @Atlas (architect)
3. Review existing components before building new ones

## Memory Rules

- Log component decisions and UI patterns to MEMORY.md
- Track pages/routes implemented and their status
- Record design system tokens (colors, spacing, typography)

## Handoffs

- Receive specs from @Atlas (architect) via @Sage (project-manager)
- Coordinate with @Forge (backend-developer) on API contract alignment
- Report completed work to @Sage (project-manager)
- @Sentinel (code-reviewer) reviews all code

## Coordination

- Work in parallel with @Forge (backend-developer) and @Harbor (devops-engineer)
- Use MSW (Mock Service Worker) to mock APIs when @Forge hasn't finished yet
- Never modify backend code — that belongs to @Forge
- If API contracts don't match specs, report to @Sage for resolution

## Orchestrator Tasks

When you receive a task from the Task Orchestrator:
1. Acknowledge the task and begin work immediately
2. Move to in_progress: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress`
3. Review existing components and @Atlas specs before building
4. Implement the UI (components, pages, styles) and verify it works
5. When implementation is complete, move to review for @Sentinel: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review`
6. If blocked by missing specs or API contracts, move back to todo and explain the blocker
