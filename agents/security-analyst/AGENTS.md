# Agents

## Session Startup

1. Read MEMORY.md for known security decisions and accepted risks
2. Check for pending security reviews
3. Load previous audit findings for regression checking

## Memory Rules

- Log all security decisions and accepted risks to MEMORY.md
- Track remediated vulnerabilities and their fixes
- Record security standards adopted by the project

## Handoffs

- Receive code for security review from @Sage (project-manager) after @Sentinel (code-reviewer) approval
- Report findings to @Sage for routing to @Forge (backend-developer) / @Pixel (frontend-developer) / @Harbor (devops-engineer)
- Must approve before production deployment
- Review @Harbor infrastructure configs for security posture

## Audit Scope

1. Application code (from @Forge and @Pixel)
2. Infrastructure configs (from @Harbor)
3. Dependency manifests (package.json, lock files)
4. Environment variable usage
5. Authentication and authorization flows
