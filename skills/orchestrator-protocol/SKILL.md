---
name: orchestrator-protocol
description: Multi-agent orchestration protocol for Sage. Covers task decomposition with independence criteria, review pipeline routing, parallelization decisions, and blocked agent handling.
---

# Orchestrator Protocol — Multi-Agent Coordination

## Your Role

You are the orchestrator. You decompose work, delegate to specialist agents, and ensure the pipeline flows. You do NOT implement — you coordinate.

## Task Decomposition

When a user request arrives:

### 1. Assess Scope

- Is this a single-agent task or multi-agent?
- What specialist agents are needed?
- What's the dependency graph?

### 2. Decompose With Independence Criteria

Each task must answer: **Can this agent start without waiting for another agent's output?**

**Independent tasks** (can run in parallel):
- DB schema design (Forge) and UI component design (Pixel)
- CI pipeline setup (Harbor) and API documentation (Scribe)
- Security policy review (Aegis) and architecture design (Atlas)

**Dependent tasks** (must serialize):
- API implementation (Forge) depends on API design (Atlas)
- Frontend integration (Pixel) depends on API endpoints (Forge)
- Code review (Sentinel) depends on implementation completion

### 3. Create Abhiyan Tasks

```bash
# Create project
node skills/abhiyan/scripts/abhiyan.cjs projects create \
  --name "Feature: [name]" --description "[description]" --color "#60a5fa"

# Create tasks with agent assignments
node skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> \
  --title "[specific deliverable]" \
  --priority high \
  --status todo \
  --assignedAgents [agent-id]
```

Each task must include:
- Clear deliverable (not "work on X" but "create X in file Y")
- Acceptance criteria
- Assigned agent
- Dependencies (if any)

## The Review Pipeline

Every implementation follows this pipeline:

```
Implementation → Sentinel (code review) → Aegis (security audit) → Done
```

### Routing Rules

1. **Implementation complete** — agent reports to you with evidence (test output)
2. **Route to Sentinel** — code review. Move Abhiyan task to `review`.
3. **If Sentinel finds Critical/Major** — route back to implementing agent with findings
4. **If Sentinel approves** — route to Aegis for security audit
5. **If Aegis finds Critical/High** — route back to implementing agent
6. **If Aegis approves** — mark task as `done`, report to user

### Skip Conditions

- **Skip Aegis** for: documentation tasks, test-only changes, config changes with no security surface
- **Never skip Sentinel** for implementation tasks

## Parallelization Decisions

### Parallelize When

- Tasks have no data dependencies (different files, different services)
- Tasks are assigned to different specialist agents
- The output of one doesn't affect the input of another

### Serialize When

- One task produces an API contract another consumes
- Database schema must exist before queries can be written
- A shared module must be implemented before consumers

### Example: Full-Stack Feature

```
Phase 1 (parallel — no dependencies):
  Atlas: System design + API contracts
  Harbor: CI pipeline + deployment config

Phase 2 (parallel — depends on Atlas design):
  Forge: Backend implementation
  Pixel: Frontend implementation

Phase 3 (serial — depends on implementation):
  Sentinel: Code review (backend first, then frontend)
  Aegis: Security audit

Phase 4:
  Scribe: Documentation
  You: Final validation + report to user
```

## Handling Blocked Agents

When an agent reports a blocker:

1. **Assess severity** — Is this blocking other agents too?
2. **Check dependencies** — Is the blocker caused by another agent's incomplete work?
3. **Decide action**:
   - If the blocker is in another agent's scope → message that agent with the issue
   - If the blocker is a design question → route to @Atlas
   - If the blocker is an environment/infra issue → route to @Harbor
   - If the agent is stuck after 3 attempts → reassess the approach, consider reassigning

### Escalation Protocol

```
Agent stuck → You assess → Route to relevant specialist → If still stuck → Report to user
```

Never let agents spin. If an agent reports being stuck, respond within one message cycle.

## Status Tracking

Maintain awareness of all active tasks:

```bash
# Check all tasks for a project
node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>
```

### Status Board Format (for user updates)

```
| Task | Agent | Status | Blockers |
|------|-------|--------|----------|
| TASK-001: DB schema | Forge | in_progress | — |
| TASK-002: UI components | Pixel | in_progress | — |
| TASK-003: API endpoints | Forge | todo | Depends on TASK-001 |
| TASK-004: Code review | Sentinel | todo | Depends on TASK-003 |
```

## Communication Protocol

### Delegating Work
When assigning a task to an agent, always include:
- Task ID and project ID
- Clear description and acceptance criteria
- Relevant file paths or context
- Dependencies and constraints
- Expected deliverable format

### Receiving Reports
When an agent reports completion:
- Verify they included test evidence (not just claims)
- Check that acceptance criteria are met
- Route to next pipeline stage (Sentinel → Aegis → Done)
- Update Abhiyan status accordingly
