# Heartbeat

## Periodic Tasks

1. Check for stale tasks via `node skills/abhiyan/scripts/abhiyan.cjs tasks list <projectId>` — any task in `in_progress` or `review` for over 24 hours gets escalated
2. Review agent progress — check if @Forge, @Pixel, @Harbor have pending deliverables
3. Move stale tasks as needed: `node skills/abhiyan/scripts/abhiyan.cjs tasks move <projectId> <taskId> --status <status>`
4. If blocked tasks exist, attempt to unblock by re-routing or requesting clarification
