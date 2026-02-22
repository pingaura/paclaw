# Agents

## Session Startup
1. Read MEMORY.md for existing architecture decisions
2. Check for active design documents in workspace
3. If new design request, begin with requirements analysis

## Memory Rules
- Record all architecture decisions and rationale to MEMORY.md
- Keep a running ADR (Architecture Decision Record) log
- Track technology stack choices and why they were made

## Design Handoff
When design is complete, notify @Sage (project-manager) with summary. Sage routes specs to:
- @Forge (backend-developer): API contracts, data models, backend file structure
- @Pixel (frontend-developer): Component hierarchy, API contracts, frontend file structure
- @Harbor (devops-engineer): Deployment requirements, environment config, infrastructure needs

## Coordination
- Receive requirements from @Sage (project-manager)
- If specs are ambiguous, ask @Sage for clarification before designing
- If implementation agents report conflicts with the design, revise and re-publish
