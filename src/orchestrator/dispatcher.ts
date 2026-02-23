/**
 * Task Dispatcher — Sends tasks to agents via the OpenClaw gateway
 *
 * Three-step atomic dispatch:
 * 1. Update task status to in_progress in R2
 * 2. Write task file to container filesystem (keeps rclone sync consistent)
 * 3. Send task to agent via WebSocket (gateway protocol v3)
 */

import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import type { Task, Project } from '../lib/abhiyan';
import { saveTask } from '../lib/abhiyan';
import { MOLTBOT_PORT } from '../config';
import type { AgentId } from './agent-router';

const WS_TIMEOUT_MS = 15_000;

/**
 * Dispatch a task to an agent.
 *
 * @returns true if dispatch succeeded, false if it failed (task reverted to todo)
 */
export async function dispatchTask(
  sandbox: Sandbox,
  env: MoltbotEnv,
  task: Task,
  agentId: AgentId,
  project: Project,
): Promise<boolean> {
  const bucket = env.MOLTBOT_BUCKET;

  // Step 1: Update task in R2 — mark as in_progress, set assignedAgents
  task.status = 'in_progress';
  if (!task.assignedAgents.includes(agentId)) {
    task.assignedAgents = [agentId, ...task.assignedAgents];
  }
  task.updatedAt = Date.now();
  await saveTask(bucket, project.id, task);

  // Step 2: Write task to container filesystem so rclone sync stays consistent
  const containerPath = `/root/clawd/abhiyan/projects/${project.id}/tasks/${task.id}.json`;
  try {
    await sandbox.writeFile(containerPath, JSON.stringify(task));
  } catch (err) {
    console.error(`[Orchestrator] Failed to write task to container filesystem:`, err);
    // Revert R2 state
    task.status = 'todo';
    task.updatedAt = Date.now();
    await saveTask(bucket, project.id, task);
    return false;
  }

  // Step 3: Send task to agent via WebSocket
  try {
    await sendTaskViaWebSocket(sandbox, env, task, agentId, project);
  } catch (err) {
    console.error(`[Orchestrator] Failed to send task via WebSocket:`, err);
    // Don't revert — task is in_progress in both R2 and container.
    // The agent can pick it up on next session or the orchestrator will timeout and retry.
    return false;
  }

  console.log(`[Orchestrator] Dispatched task "${task.title}" (${task.id}) to ${agentId}`);
  return true;
}

/**
 * Build the message that gets sent to the agent.
 * Instructions are kept minimal — each agent's AGENTS.md has role-specific
 * orchestrator handling rules.
 */
function buildTaskMessage(task: Task, _agentId: AgentId, project: Project): string {
  const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  const moveCmd = `node skills/abhiyan/scripts/abhiyan.cjs tasks move ${project.id} ${task.id}`;
  return [
    `## Orchestrator Task Assignment`,
    ``,
    `**Project**: ${project.name} (ID: ${project.id})`,
    `**Task**: ${task.title} (ID: ${task.id})`,
    `**Priority**: ${priorityLabel}`,
    ``,
    `### Description`,
    task.description || '_No description provided_',
    ``,
    `### Status Commands`,
    `- Move to done: \`${moveCmd} --status done\``,
    `- Move to review: \`${moveCmd} --status review\``,
    `- Move back to todo: \`${moveCmd} --status todo\``,
    ``,
    `Follow your Orchestrator Tasks instructions in AGENTS.md for this task.`,
  ].join('\n');
}

/**
 * Send a task to an agent via the OpenClaw gateway WebSocket.
 */
async function sendTaskViaWebSocket(
  sandbox: Sandbox,
  env: MoltbotEnv,
  task: Task,
  agentId: AgentId,
  project: Project,
): Promise<void> {
  // Build the WebSocket URL with token
  const wsUrl = new URL('http://localhost/');
  if (env.MOLTBOT_GATEWAY_TOKEN) {
    wsUrl.searchParams.set('token', env.MOLTBOT_GATEWAY_TOKEN);
  }
  const wsRequest = new Request(wsUrl.toString(), {
    headers: { Upgrade: 'websocket' },
  });

  const response = await sandbox.wsConnect(wsRequest, MOLTBOT_PORT);
  if (!response.webSocket) {
    throw new Error('No WebSocket in response from gateway');
  }
  // Capture in a const so TypeScript knows it's non-null inside closures
  const ws = response.webSocket;

  ws.accept();

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close(1000, 'timeout');
      reject(new Error('WebSocket dispatch timed out'));
    }, WS_TIMEOUT_MS);

    let connected = false;
    let connectSent = false;

    /** Send the connect frame (protocol v3) */
    function sendConnect() {
      if (connectSent) return;
      connectSent = true;
      const connectFrame = {
        type: 'req',
        id: 'orch-connect',
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client' as const,
            displayName: 'Task Orchestrator',
            version: '1.0.0',
            mode: 'backend' as const,
            platform: 'server',
          },
          role: 'operator',
          scopes: [] as string[],
          caps: [] as string[],
        },
      };
      ws.send(JSON.stringify(connectFrame));
    }

    // Protocol v3: wait for connect.challenge event; fallback if challenge is delayed
    const challengeTimer = setTimeout(() => sendConnect(), 750);

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '');

        // Protocol v3: handle connect.challenge event
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          clearTimeout(challengeTimer);
          sendConnect();
          return;
        }

        // Wait for connect response
        if (!connected && msg.type === 'res' && msg.id === 'orch-connect') {
          if (msg.error) {
            clearTimeout(timeout);
            ws.close(1000, 'connect error');
            reject(new Error(`Gateway connect error: ${msg.error.message}`));
            return;
          }
          connected = true;

          // Send the task dispatch message
          const dispatchMsg = {
            type: 'req',
            id: `task-${Date.now()}`,
            method: 'sessions.send',
            params: {
              to: agentId,
              message: buildTaskMessage(task, agentId, project),
            },
          };
          ws.send(JSON.stringify(dispatchMsg));
          return;
        }

        // Wait for sessions.send response
        if (connected && msg.type === 'res' && msg.id?.startsWith('task-')) {
          clearTimeout(timeout);
          ws.close(1000, 'done');
          if (msg.error) {
            reject(new Error(`Dispatch error: ${msg.error.message}`));
          } else {
            resolve();
          }
        }
      } catch {
        // Ignore parse errors on non-JSON messages
      }
    });

    ws.addEventListener('close', (event) => {
      clearTimeout(timeout);
      clearTimeout(challengeTimer);
      if (!connected) {
        reject(new Error(`WebSocket closed before connect: ${event.code} ${event.reason}`));
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      clearTimeout(challengeTimer);
      reject(new Error('WebSocket error'));
    });
  });
}
