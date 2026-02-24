---
name: workspace-lifecycle
description: Container workspace management for implementation agents. Covers workspace isolation, test verification gates, R2 sync awareness, and task completion flow.
---

# Workspace Lifecycle — Container Workspace Management

## Your Workspace

Each agent operates in an isolated container workspace:
```
/root/.openclaw/workspaces/{agent-role}/
```

The shared codebase lives at:
```
/root/clawd/
```

Skills and project data:
```
/root/clawd/skills/       — Skill definitions (SKILL.md + scripts)
/root/clawd/abhiyan/      — Project and task data
```

## Starting Work on a Task

1. **Claim the task** in Abhiyan:
   ```bash
   node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress
   ```

2. **Read the task requirements** — understand acceptance criteria before touching code

3. **Read existing code** — understand what's already there:
   ```bash
   # Read the files you'll be modifying
   # Check for existing tests, types, and related code
   ```

4. **Implement** following the task's acceptance criteria

## R2 Sync Awareness

A background sync loop runs every ~30 seconds, syncing local files to R2 storage:
- Config: `/root/.openclaw/` → `r2:bucket/openclaw/`
- Workspace: `/root/clawd/` → `r2:bucket/workspace/`
- Skills: `/root/clawd/skills/` → `r2:bucket/skills/`
- Abhiyan: `/root/clawd/abhiyan/` → `r2:bucket/abhiyan/`

**Implications:**
- Your file changes are persisted to R2 automatically — no manual sync needed
- Changes from other agents may appear within 30-60 seconds
- If you see unexpected file changes, another agent may have modified shared files
- Large file operations should be atomic where possible (write complete files, not partial)

## Test Verification Gate

**Before marking any task as complete, you MUST pass the verification gate:**

```bash
# 1. Run relevant tests
npx vitest run src/path/to/relevant.test.ts

# 2. Run full test suite (if task touches shared code)
npx vitest run

# 3. Type check
npx tsc --noEmit
```

**All three must pass.** If any fail:
- Fix the issue
- Re-run verification
- Only proceed to completion when green

## Completing a Task

### Completion Flow

1. **Verify** — pass the test verification gate above
2. **Update Abhiyan** — move task to review:
   ```bash
   node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review
   ```
3. **Report to @Sage** — send completion summary:
   - Files created or modified (with paths)
   - Test results (paste actual output)
   - Any decisions made or open questions
4. **Wait for review** — @Sentinel will review your code
5. **Address review feedback** if any critical/major issues

### What "Done" Means

A task is done when:
- All acceptance criteria are met
- Tests pass (with evidence)
- Type checking passes
- Code has been reviewed by @Sentinel
- Review feedback has been addressed
- Abhiyan task status reflects current state

### Status Transitions

```
todo → in_progress    (you start working)
in_progress → review  (implementation complete, tests pass)
review → in_progress  (review found issues, fixing)
review → done         (review passed, @Sage confirms)
```

## Working With Other Agents

- **@Sage** — your coordinator. Report progress, blockers, and completion.
- **@Sentinel** — reviews your code. Address critical/major findings.
- **@Atlas** — provides design specs. Follow them; raise concerns if ambiguous.
- Other implementers (Forge, Pixel, Harbor) — coordinate through @Sage, not directly.

## Workspace Hygiene

- Don't leave debugging artifacts (console.log, temp files)
- Don't modify files outside your task scope
- Don't install new dependencies without discussing with @Sage
- Keep commits focused — one logical change per commit
