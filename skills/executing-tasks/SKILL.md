---
name: executing-tasks
description: Disciplined task execution with evidence-based verification. Enforces a 5-step cycle and prevents premature completion claims. Evidence before claims — run it, read it, THEN report it.
---

# Executing Tasks — Evidence Before Claims

## The 5-Step Execution Cycle

For every task:

### 1. Load Context
- Read the task requirements from Abhiyan (`node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>`)
- Read ALL files you'll modify — understand them before changing them
- Check for related tests, types, and imports
- Mark task as in-progress: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress`

### 2. Implement
- Make the smallest change that satisfies the requirement
- Follow existing code patterns — don't invent new conventions
- Keep changes focused — one task, one concern
- If the task is unclear, STOP and ask @Sage for clarification

### 3. Verify With Evidence
- Run the relevant tests: `npx vitest run <test-file>`
- Run the type checker: `npx tsc --noEmit`
- Read the ACTUAL output — don't assume it passed
- If tests fail, fix the issue. Do not report completion with failing tests.

### 4. Update Abhiyan Status
```bash
# Move to review when implementation + tests pass
node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review
```

### 5. Report
- Send completion report to @Sage with:
  - What was implemented (specific files and functions)
  - Test results (paste the actual output)
  - Any decisions made or assumptions
  - Any follow-up work identified

## Evidence Before Claims

**The cardinal rule: run the command, read the output, THEN claim the result.**

WRONG:
```
I've implemented the login endpoint and it should work correctly.
The tests should pass.
```

RIGHT:
```
I've implemented POST /api/auth/login in src/routes/auth.ts.

Test results (npx vitest run src/routes/auth.test.ts):
 PASS  src/routes/auth.test.ts
   login endpoint
     ✓ returns 200 with valid credentials (12ms)
     ✓ returns 401 with invalid password (8ms)
     ✓ returns 400 with missing email (5ms)

Type check (npx tsc --noEmit): passed, no errors.
```

## Red Flag Language

If you catch yourself writing any of these, STOP — you're guessing instead of verifying:

- "should work" — Run it and confirm it works.
- "seems to" — Read the output and state what it DOES.
- "I believe" — Check the code and state what IS.
- "probably" — Find out for certain.
- "I think the tests pass" — Run them. Paste the output.

## When Blocked

If you encounter something unexpected:

1. **Don't guess** — If you're not sure how a module works, read its source and tests.
2. **Don't silently work around** — If a dependency is broken, report it; don't paper over it.
3. **Stop after 3 failed attempts** — If you've tried 3 different approaches and none work, report the situation to @Sage with what you tried and what happened. Don't keep thrashing.
4. **Ask for help** — Send a message to @Sage describing the blocker. Include:
   - What you're trying to do
   - What you've tried (with evidence)
   - What's happening instead
   - What you think the root cause might be

## Completion Checklist

Before marking any task as done, verify:

- [ ] All acceptance criteria from the task are met
- [ ] Tests pass (with output as evidence)
- [ ] Type checking passes (`npx tsc --noEmit`)
- [ ] No unrelated files were modified
- [ ] No `console.log` debugging statements left behind
- [ ] No `.skip` or `.todo` added to existing tests
- [ ] Abhiyan task status updated
- [ ] Completion report sent to @Sage
