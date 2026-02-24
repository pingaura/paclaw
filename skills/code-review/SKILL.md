---
name: code-review
description: Structured code review discipline. Section A covers performing reviews (Sentinel). Section B covers receiving and acting on reviews (implementers). Severity-classified, actionable feedback.
---

# Code Review

## Section A — Performing Reviews (Sentinel)

### Review Process

1. **Read ALL files in the changeset** — never review partially
2. **Run the full test suite** — verify tests pass before reading code
3. **Check test coverage** — are critical paths and edge cases covered?
4. **Review through three lenses**:
   - Correctness & Security: bugs, vulnerabilities, unhandled errors, race conditions
   - Performance & Scalability: N+1 queries, unnecessary re-renders, memory leaks
   - Maintainability & Standards: readability, conventions, typing, test quality
5. **Produce structured report** using the format below

### Severity Classification

| Severity | Definition | Must Fix |
|----------|-----------|----------|
| **Critical** | Security vulnerability, data loss, crash in production path | YES — blocks merge |
| **Major** | Incorrect behavior, missing error handling, logic error | YES — blocks merge |
| **Minor** | Code smell, suboptimal pattern, missing edge case test | No — recommended |
| **Nit** | Style preference, naming suggestion, cosmetic | No — optional |

### Review Output Format

For each file:
```
### src/path/to/file.ts

- CRITICAL: SQL injection in user input concatenation (line 45)
  → Use parameterized query: db.query('SELECT * FROM users WHERE id = $1', [userId])

- MAJOR: Missing error handling for database connection failure (line 72)
  → Wrap in try/catch and return 503 with retry-after header

- MINOR: Function `processData` is 80 lines — consider extracting validation logic
  → Extract `validateInput()` helper for readability

- NIT: Inconsistent naming — `userData` vs `userInfo` in same scope
  → Pick one term and use consistently
```

Summary:
```
| Severity | Count | Blocks Merge |
|----------|-------|--------------|
| Critical | 0     | —            |
| Major    | 1     | YES          |
| Minor    | 2     | No           |
| Nit      | 1     | No           |
```

### Review Principles

- **Be specific** — "This is bad" is not a review. Point to the exact line, explain the problem, provide the fix.
- **Be proportional** — Don't block a merge over a nit. Reserve "must fix" for real issues.
- **Verify, don't assume** — If you think there's a bug, write a test case or trace the logic to confirm.
- **Review the tests too** — Weak tests that pass are worse than no tests (false confidence).

### Non-Negotiable Checks

Always verify:
- No hardcoded secrets, API keys, or tokens
- No SQL injection, XSS, or command injection vectors
- Error handling exists for all external calls (APIs, DB, filesystem)
- Input validation at API boundaries (Zod schemas present)
- Tests cover both success and error paths

## Section B — Receiving Reviews (Implementers)

### When You Get Review Feedback

1. **Read the full review** before making any changes
2. **Verify each finding** — does the reviewer's concern actually apply?
   - Read the code they're referencing
   - Check if the issue is real or a misunderstanding
3. **Address by severity**:
   - Critical/Major: Fix immediately, re-run tests, report back
   - Minor: Fix if quick, or acknowledge for follow-up
   - Nit: Apply if you agree, skip if you don't

### Pushing Back

If a review finding is wrong or you disagree:

- **Don't silently ignore it** — respond with your reasoning
- **Provide evidence**: "This case is handled by the middleware at line 23 — see `src/middleware/auth.ts`"
- **Propose alternatives** if you disagree with the suggested fix

### After Implementing Review Fixes

- Run full test suite — paste output as evidence
- Run type checker — confirm no new errors
- Report to @Sage which findings were addressed and which were contested
- Update Abhiyan task status as needed
