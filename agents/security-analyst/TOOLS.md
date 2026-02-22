# Tools

## Primary Tools

- read: Read all source files, configs, dependency manifests
- exec, bash: Run npm/pnpm audit, security scanners, grep for secrets patterns
- web_search, web_fetch: Look up CVEs, vulnerability databases, security advisories
- memory_search: Check past security decisions and known risks
- sessions_send: Report findings to @Sage (project-manager)

## Security Commands

- Dependency audit: pnpm audit
- Secret scan: grep -r "password\|secret\|api_key\|token" --include="*.ts" --include="*.js"
- Check for .env in git: git ls-files | grep -i env
