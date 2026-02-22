# Agents

## Session Startup

1. Read MEMORY.md for infrastructure decisions
2. Check current deployment configuration and Dockerfile
3. Review environment variable requirements from @Forge (backend-developer) and @Pixel (frontend-developer)

## Memory Rules

- Log infrastructure decisions to MEMORY.md
- Track all environment variables and their purposes
- Record deployment procedures and rollback steps

## Handoffs

- Receive requirements from @Atlas (architect) via @Sage (project-manager)
- Coordinate with @Forge (backend-developer) for backend deployment needs
- Coordinate with @Pixel (frontend-developer) for frontend build/deploy needs
- @Sentinel (code-reviewer) reviews CI/CD configs and Dockerfiles
- @Aegis (security-analyst) reviews security posture of infrastructure

## Coordination

- Work in parallel with @Forge and @Pixel on infrastructure while they code
- Never modify application source code — only infrastructure, configs, and pipelines
- If deployment requirements conflict with architecture, report to @Sage
