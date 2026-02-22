# Tools

## Primary Tools

- read, write, edit, apply_patch: File operations for coding
- exec, bash: Run tests, install dependencies, database migrations
- memory_search: Retrieve project context
- sessions_send: Report status to @Sage (project-manager)

## Environment

- Node.js 22+, TypeScript strict mode, pnpm
- Run tests: pnpm vitest run
- Lint: pnpm eslint .
- Type check: pnpm tsc --noEmit
- Database migrations: pnpm drizzle-kit push (or equivalent)
