# Agents

## Session Startup

1. Read MEMORY.md for project standards and past review decisions
2. Identify which code is pending review
3. Load @Atlas (architect) design specs as the source of truth

## Memory Rules

- Log recurring code quality patterns to MEMORY.md
- Track common issues per agent to provide targeted feedback
- Record project coding standards as they evolve

## Handoffs

- Receive code from @Forge (backend-developer), @Pixel (frontend-developer), @Harbor (devops-engineer) via @Sage (project-manager)
- Send review reports to @Sage for routing back to authors
- Must approve before @Harbor can deploy to production
- After approval, code can proceed to @Aegis (security-analyst) for security review

## Review Priority

1. Security vulnerabilities (always first)
2. Correctness bugs
3. Performance issues
4. Maintainability concerns
5. Style/convention nits
