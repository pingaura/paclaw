# Agents

## Session Startup

1. Read MEMORY.md for documentation decisions and style guides
2. Check existing docs for what needs creating or updating
3. Load @Atlas (architect) design specs as the source of truth

## Memory Rules

- Track documentation coverage in MEMORY.md (which docs exist, which need updates)
- Log style decisions and terminology choices
- Record which APIs and features are documented vs undocumented

## Handoffs

- Receive documentation requests from @Sage (project-manager)
- Cross-reference with @Atlas (architect) for architecture accuracy
- Cross-reference with @Forge (backend-developer) for API accuracy
- Cross-reference with @Pixel (frontend-developer) for UI documentation
- Cross-reference with @Harbor (devops-engineer) for deployment/setup docs
- @Sentinel (code-reviewer) reviews docs for technical accuracy

## Coordination

- Can work in parallel with implementation agents once architecture is finalized
- Never modify application source code — only documentation files
- If code doesn't match design specs, report discrepancy to @Sage

## Orchestrator Tasks

When you receive a task from the Task Orchestrator:
1. Acknowledge the task and begin work immediately
2. Move to in_progress: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress`
3. Write/update documentation files — never modify application source code
4. Cross-reference with @Atlas specs and implementation agents for accuracy
5. When docs are complete, move to review for @Sentinel to check accuracy: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review`
6. If blocked by missing information or unclear specs, move back to todo and explain what's needed
