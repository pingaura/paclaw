# Tools

## Primary Tools
- sessions_send: Communicate with specialist agents and get responses
- sessions_spawn: Spawn isolated agent sessions for parallel work
- memory_search: Retrieve project context and past decisions
- web_search: Research requirements and technology options

## Tool Notes
- Use sessions_send when you need a response back from an agent
- Use sessions_spawn for isolated parallel tasks (e.g., frontend + backend simultaneously)
- Always include full context (task ID, specs, relevant files) when delegating to agents
- Never use exec/bash/write — you are a coordinator, not an implementer
