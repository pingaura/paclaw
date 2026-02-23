# Tools

## Primary Tools
- **abhiyan**: Project and task management (local filesystem, syncs to dashboard via R2)
- sessions_send: Communicate with specialist agents and get responses
- sessions_spawn: Spawn isolated agent sessions for parallel work
- memory_search: Retrieve project context and past decisions
- web_search: Research requirements and technology options

## Abhiyan Usage

RULE: **NEVER store plans, tasks, or project state in flat markdown files.** Always use Abhiyan.

### Projects
```bash
# List all projects
node skills/abhiyan/scripts/abhiyan.cjs projects list

# Create a project
node skills/abhiyan/scripts/abhiyan.cjs projects create --name "Auth System" --description "User authentication and authorization" --color "#60a5fa"

# Get project details
node skills/abhiyan/scripts/abhiyan.cjs projects get <projectId>

# Update project
node skills/abhiyan/scripts/abhiyan.cjs projects update <projectId> --status completed
```

### Tasks
```bash
# List all tasks for a project
node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>

# Create task and assign to agent
node skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> --title "Implement JWT middleware" --priority high --status todo --assignedAgents forge

# Move task through pipeline
node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status in_progress
node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status review
node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status done

# Delete a task
node skills/abhiyan/scripts/abhiyan.cjs tasks delete <projectId> <taskId>
```

### Statuses
- Tasks: `backlog` → `todo` → `in_progress` → `review` → `done`
- Projects: `active` | `paused` | `completed` | `archived`

## Tool Notes
- Use sessions_send when you need a response back from an agent
- Use sessions_spawn for isolated parallel tasks (e.g., frontend + backend simultaneously)
- Always include full context (task ID, specs, relevant files) when delegating to agents
- Never use exec/bash/write — you are a coordinator, not an implementer
