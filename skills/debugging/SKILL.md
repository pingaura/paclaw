---
name: debugging
description: Systematic debugging methodology. 4-phase approach enforcing root cause analysis before fixes. Scientific method — single-variable changes, no shotgun debugging.
---

# Debugging — Find the Root Cause First

## The Rule

**No fixes before root cause investigation.** If you don't understand WHY something is broken, your fix is a guess. Guesses create new bugs.

## The 4-Phase Approach

### Phase 1: Reproduce and Observe

Before changing anything:

1. **Reproduce the failure** — run the failing test or trigger the error
2. **Read the FULL error** — stack trace, error message, context
3. **Identify the actual vs expected behavior** — what happened, what should have happened
4. **Note the exact conditions** — input data, environment, timing

```bash
# Run the specific failing test
npx vitest run src/path/to/failing.test.ts

# Or reproduce the error manually
curl -X POST http://localhost:3000/api/endpoint -d '{"input": "data"}'
```

### Phase 2: Analyze the Pattern

Ask yourself:

- **When did this last work?** Check recent changes to affected files.
- **What changed?** Read git log for the relevant files.
- **Is it consistent?** Does it fail every time, or intermittently?
- **What's the scope?** One test? One endpoint? Everything?
- **Are there related failures?** Multiple tests failing often points to a shared root cause.

Read the source code around the failure point. Trace the data flow:
- What goes IN to the failing function?
- What comes OUT?
- Where does the transformation break?

### Phase 3: Hypothesize and Test

Form a specific hypothesis: "The bug is caused by [X] because [Y]."

Then test it with a **single-variable change**:

- Add a targeted `console.log` or assertion to confirm your theory
- Run the test again to verify your hypothesis
- If confirmed, proceed to fix
- If not, revise hypothesis and test again

**Scientific method rules:**
- Change ONE thing at a time
- Predict what will happen before running
- Compare actual result to prediction
- If prediction was wrong, your model is wrong — update it

### Phase 4: Fix and Verify

Once you understand the root cause:

1. Write a test that reproduces the exact bug (if one doesn't exist)
2. Implement the minimal fix
3. Run the reproducing test — confirm it passes
4. Run the FULL test suite — confirm no regressions
5. Remove any debugging statements (`console.log`, temporary assertions)

## The 3-Attempt Rule

If you've tried 3 different fixes and the bug persists:

**STOP.** You likely don't understand the root cause yet.

Instead of attempt #4:
1. Summarize what you've tried and what happened
2. Send a message to @Sage explaining the situation
3. Include: the error, your 3 attempts, and what you think is going on
4. Wait for guidance before continuing

## Anti-Patterns

- **Shotgun debugging** — changing multiple things hoping something works. You won't know what fixed it, and you may introduce new bugs.
- **Fixing the symptom** — adding a null check instead of understanding why the value is null. The null check hides the real bug.
- **Reverting to "make it work"** — commenting out code, disabling features, or adding `try/catch` that swallows errors. These aren't fixes.
- **Debugging by rewriting** — rewriting the whole function instead of understanding the bug. The new code will have new bugs.

## Debugging Tools

```bash
# Run a single test with verbose output
npx vitest run src/path/to/test.ts --reporter=verbose

# Type check for type-level errors
npx tsc --noEmit

# Check for unhandled promise rejections
node --unhandled-rejections=throw src/script.ts
```

When adding temporary debugging code:
- Prefix with `// DEBUG:` so it's easy to find and remove
- Remove ALL debugging code before marking the task as done
- Never commit `console.log` debugging statements
