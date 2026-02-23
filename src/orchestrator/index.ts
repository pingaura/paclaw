/**
 * Task Orchestrator — Automated agent task dispatch
 *
 * Runs on a cron schedule (every 60s) or via manual API trigger.
 * Reads todo tasks from all active projects, assigns them to idle agents, and dispatches.
 *
 * State is stored in R2 at `orchestrator/state.json` (outside the abhiyan/ prefix
 * to avoid rclone sync overwrites from the container).
 */

import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import type { Task } from '../lib/abhiyan';
import { getIndex, getProject, listTasks, getTask, saveTask } from '../lib/abhiyan';
import { ensureMoltbotGateway } from '../gateway';
import { AGENT_IDS, resolveAgent } from './agent-router';
import { dispatchTask } from './dispatcher';
import type { AgentState, OrchestratorState } from './types';

export type { AgentState, OrchestratorState } from './types';

interface TaskWithProject {
  task: Task;
  projectId: string;
  projectName: string;
}

// ---- Constants ----

const STATE_KEY = 'orchestrator/state.json';
const TASK_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---- State management ----

export async function getOrchestratorState(bucket: R2Bucket): Promise<OrchestratorState> {
  const obj = await bucket.get(STATE_KEY);
  if (!obj) return createDefaultState();
  try {
    return obj.json<OrchestratorState>();
  } catch {
    return createDefaultState();
  }
}

export async function saveOrchestratorState(bucket: R2Bucket, state: OrchestratorState): Promise<void> {
  await bucket.put(STATE_KEY, JSON.stringify(state), {
    httpMetadata: { contentType: 'application/json' },
  });
}

function createDefaultState(): OrchestratorState {
  const agents: Record<string, AgentState> = {};
  for (const id of AGENT_IDS) {
    agents[id] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
  }
  return {
    enabled: true,
    agents,
    lastRunAt: 0,
    lastDispatchAt: null,
  };
}

// ---- Orchestration cycle ----

/**
 * Run one orchestration cycle.
 * Called by cron (every 60s) or manually via API trigger.
 */
export async function runOrchestrationCycle(sandbox: Sandbox, env: MoltbotEnv): Promise<void> {
  const bucket = env.MOLTBOT_BUCKET;
  const state = await getOrchestratorState(bucket);

  if (!state.enabled) {
    console.log('[Orchestrator] Disabled, skipping cycle');
    return;
  }

  console.log('[Orchestrator] Starting orchestration cycle');

  // Ensure all agents exist in state
  for (const id of AGENT_IDS) {
    if (!state.agents[id]) {
      state.agents[id] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
    }
  }

  // Phase 1: Check busy agents — release those whose tasks are done/review or timed out
  await reconcileBusyAgents(bucket, state);

  // Phase 2: Collect all todo tasks across active projects
  const todoTasks = await collectTodoTasks(bucket);

  if (todoTasks.length === 0) {
    console.log('[Orchestrator] No todo tasks found');
    state.lastRunAt = Date.now();
    await saveOrchestratorState(bucket, state);
    return;
  }

  console.log(`[Orchestrator] Found ${todoTasks.length} todo tasks`);

  // Sort: priority DESC, pipelineStage ASC, createdAt ASC
  todoTasks.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.task.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.task.priority] ?? 2;
    if (pa !== pb) return pa - pb;

    const sa = a.task.pipelineStage ?? Infinity;
    const sb = b.task.pipelineStage ?? Infinity;
    if (sa !== sb) return sa - sb;

    return a.task.createdAt - b.task.createdAt;
  });

  // Phase 3: Ensure gateway is running before dispatching
  let gatewayReady = false;
  try {
    await ensureMoltbotGateway(sandbox, env);
    gatewayReady = true;
  } catch (err) {
    console.error('[Orchestrator] Gateway not available, skipping dispatch:', err);
  }

  // Phase 4: Dispatch tasks to idle agents
  if (gatewayReady) {
    for (const { task, projectId, projectName } of todoTasks) {
      const agentId = resolveAgent(task, state);
      if (!agentId) continue;

      const project = await getProject(bucket, projectId);
      if (!project) continue;

      console.log(`[Orchestrator] Dispatching "${task.title}" to ${agentId}`);
      const ok = await dispatchTask(sandbox, env, task, agentId, project);

      if (ok) {
        state.agents[agentId] = {
          status: 'busy',
          currentTaskId: task.id,
          currentProjectId: projectId,
          taskStartedAt: Date.now(),
        };
        state.lastDispatchAt = Date.now();
        console.log(`[Orchestrator] ${agentId} is now busy with task ${task.id} (${projectName})`);
      }
    }
  }

  state.lastRunAt = Date.now();
  await saveOrchestratorState(bucket, state);
  console.log('[Orchestrator] Cycle complete');
}

/**
 * Check each busy agent's task status. Release agents whose tasks moved to done/review
 * or have been running longer than the timeout.
 */
async function reconcileBusyAgents(bucket: R2Bucket, state: OrchestratorState): Promise<void> {
  for (const agentId of AGENT_IDS) {
    const agentState = state.agents[agentId];
    if (!agentState || agentState.status !== 'busy') continue;
    if (!agentState.currentTaskId || !agentState.currentProjectId) {
      // Invalid busy state — reset
      state.agents[agentId] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
      continue;
    }

    const task = await getTask(bucket, agentState.currentProjectId, agentState.currentTaskId);

    if (!task) {
      // Task deleted — mark idle
      console.log(`[Orchestrator] Task ${agentState.currentTaskId} no longer exists, marking ${agentId} idle`);
      state.agents[agentId] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
      continue;
    }

    if (task.status === 'done' || task.status === 'review') {
      console.log(`[Orchestrator] Task ${task.id} is ${task.status}, marking ${agentId} idle`);
      state.agents[agentId] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
      continue;
    }

    // Check for timeout
    if (agentState.taskStartedAt && Date.now() - agentState.taskStartedAt > TASK_TIMEOUT_MS) {
      console.log(`[Orchestrator] Task ${task.id} timed out for ${agentId}, moving back to todo`);
      task.status = 'todo';
      task.updatedAt = Date.now();
      await saveTask(bucket, agentState.currentProjectId, task);
      state.agents[agentId] = { status: 'idle', currentTaskId: null, currentProjectId: null, taskStartedAt: null };
    }
  }
}

/**
 * Collect all tasks with status 'todo' across all active projects.
 */
async function collectTodoTasks(bucket: R2Bucket): Promise<TaskWithProject[]> {
  const index = await getIndex(bucket);
  const activeProjects = index.filter((p) => p.status === 'active');
  const result: TaskWithProject[] = [];

  for (const entry of activeProjects) {
    const tasks = await listTasks(bucket, entry.id);
    for (const task of tasks) {
      if (task.status === 'todo') {
        result.push({ task, projectId: entry.id, projectName: entry.name });
      }
    }
  }

  return result;
}
