---
name: planning
description: Structured planning and brainstorming discipline. Enforces design-before-code through Socratic questioning and systematic task decomposition into Abhiyan tasks.
---

# Planning — Brainstorm First, Then Decompose

## Hard Gate

**No code before design approval.** When you receive a task that requires implementation:

1. Brainstorm the approach
2. Decompose into tasks
3. Get approval from the user or @Sage
4. THEN delegate or begin implementation

Jumping straight to code is a failure mode. Planning is not optional.

## Brainstorming Phase

When presented with a problem or feature request:

### Ask, Don't Assume

Use Socratic questioning — one question per message. Don't dump a list of questions. Each question should build on the previous answer.

Good questions:
- "What should happen when [edge case]?"
- "Is there an existing pattern in the codebase for [similar feature]?"
- "Should this be accessible to all agents or only [specific agent]?"
- "What's the acceptance criteria for 'done'?"

Bad questions:
- "What do you want?" (too vague)
- Listing 10 questions at once (overwhelming, produces shallow answers)

### Explore Before Proposing

Before proposing a design:
1. Read relevant existing code — understand current patterns
2. Check for similar implementations in the codebase
3. Identify constraints (dependencies, existing APIs, data models)
4. Only THEN propose an approach

### Design Output

Every plan must include:
- **Goal**: One sentence describing the outcome
- **Approach**: High-level strategy (2-3 sentences max)
- **Tasks**: Numbered list of concrete implementation steps
- **Risks**: Known unknowns or things that could go wrong
- **Open questions**: Anything that still needs clarification

## Task Decomposition

Break work into tasks that are:

- **Small**: 2-5 minutes of focused agent work each
- **Independent**: Can be completed without waiting for other tasks (where possible)
- **Concrete**: Include exact file paths, function names, or endpoint signatures
- **Testable**: Each task has a clear "done" condition

### Creating Abhiyan Tasks

```bash
# Create a project for the feature
node skills/abhiyan/scripts/abhiyan.cjs projects create \
  --name "Feature: User Authentication" \
  --description "JWT-based auth with refresh tokens" \
  --color "#60a5fa"

# Create individual tasks with specific acceptance criteria
node skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> \
  --title "Create user schema in src/db/schema/users.ts" \
  --priority high \
  --status todo \
  --assignedAgents forge

node skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> \
  --title "Implement POST /api/auth/login endpoint" \
  --priority high \
  --status todo \
  --assignedAgents forge
```

### Task Sizing Guide

**Too big** (split it):
- "Implement authentication" — needs decomposition
- "Build the dashboard" — multiple components, multiple agents

**Right size**:
- "Create users table migration in src/db/migrations/"
- "Add Zod validation schema for POST /api/auth/login body"
- "Write integration test for login endpoint — happy path + invalid credentials"

**Too small** (merge it):
- "Add import statement" — combine with the function that needs it
- "Fix typo in variable name" — combine with related work

## Parallelization

When decomposing, explicitly mark which tasks can run in parallel:

```
Phase 1 (parallel):
  - TASK-001: Create DB schema (Forge)
  - TASK-002: Design React components (Pixel)
  - TASK-003: Set up CI pipeline (Harbor)

Phase 2 (after Phase 1):
  - TASK-004: Implement API endpoints (Forge, depends on TASK-001)
  - TASK-005: Implement UI components (Pixel, depends on TASK-002)

Phase 3 (after Phase 2):
  - TASK-006: Integration testing (Forge + Pixel, depends on TASK-004 + TASK-005)
```

## Anti-Patterns

- **Planning paralysis**: More than 10 minutes planning a task that takes 5 minutes to implement. Bias toward action for small tasks.
- **Premature detail**: Specifying implementation details for tasks 3 phases out. Plan near-term in detail, far-term in outline.
- **Ignoring existing code**: Designing from scratch when the codebase already has patterns. Read first, design second.
