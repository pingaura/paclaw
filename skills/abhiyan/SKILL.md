---
name: abhiyan
description: Manage projects and tasks via local filesystem. Data syncs to R2 automatically for the Abhiyan dashboard. Use this instead of flat markdown files for all project/task tracking.
---

# Abhiyan — Project & Task Management

Local filesystem-based project and task management that syncs to the Abhiyan dashboard via R2.

## IMPORTANT — How to Use This Skill

Just run the commands below. Do NOT look for an `abhiyan/` directory in your workspace — the data directory is separate from your workspace and is created automatically on first use. You only need `node` available in your PATH.

## Data Directory

Default: `/root/clawd/abhiyan/` (override with `ABHIYAN_DIR` env var). This directory is created automatically when you run any command — no manual setup needed.

```text
/root/clawd/abhiyan/
├── index.json
└── projects/{id}/
    ├── project.json
    └── tasks/{taskId}.json
```

## Commands

All commands use absolute paths. Run them from any working directory.

### Projects

```bash
# List all projects
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs projects list

# Create a project
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs projects create --name "My Project" --description "Details" --color "#60a5fa"

# Get project details
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs projects get <projectId>

# Update a project
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs projects update <projectId> --name "New Name" --status paused

# Archive a project
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs projects archive <projectId>
```

### Tasks

```bash
# List tasks for a project
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>

# Create a task
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs tasks create <projectId> --title "Implement auth" --priority high --status todo --assignedAgents forge,sentinel

# Update a task
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs tasks update <projectId> <taskId> --status in_progress --assignedAgents forge

# Move task to new status
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status done

# Delete a task
node /root/clawd/skills/abhiyan/scripts/abhiyan.cjs tasks delete <projectId> <taskId>
```

## Task Statuses

`backlog` → `todo` → `in_progress` → `review` → `needs_approval` → `done`

## Task Priorities

`low` | `medium` | `high` | `critical`

## Project Statuses

`active` | `paused` | `completed` | `archived`

## Sync

Data written locally is automatically synced to R2 by the background sync loop in `start-openclaw.sh` (every ~30 seconds). The Abhiyan dashboard reads from R2.
