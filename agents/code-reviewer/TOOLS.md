# Tools

## Primary Tools

- read: Read all source files for review (never skip files)
- exec, bash: Run tests, linters, type checking, coverage reports
- memory_search: Check project standards and past review patterns
- sessions_send: Send review reports to @Sage (project-manager)

## Review Commands

- Run tests: pnpm vitest run
- Type check: pnpm tsc --noEmit
- Lint: pnpm eslint .
- Coverage: pnpm vitest run --coverage
