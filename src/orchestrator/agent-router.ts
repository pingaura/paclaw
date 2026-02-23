/**
 * Agent Router — Auto-assignment logic for task orchestration
 *
 * Determines which agent should handle a task based on:
 * 1. Explicitly assigned agents (task.assignedAgents)
 * 2. Keyword matching on task title/description
 */

import type { Task } from '../lib/abhiyan';
import type { OrchestratorState } from './types';

export const AGENT_IDS = ['sage', 'atlas', 'forge', 'pixel', 'harbor', 'sentinel', 'aegis', 'scribe'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

interface RouteRule {
  agent: AgentId;
  keywords: RegExp;
}

const ROUTE_RULES: RouteRule[] = [
  { agent: 'forge', keywords: /\b(backend|api|database|model|server|endpoint|migration|schema|rest|graphql|crud)\b/i },
  { agent: 'pixel', keywords: /\b(frontend|ui|component|page|css|style|layout|react|vue|html|design|ux)\b/i },
  { agent: 'harbor', keywords: /\b(deploy|docker|ci|cd|infra|pipeline|kubernetes|k8s|nginx|terraform|devops|container)\b/i },
  { agent: 'sentinel', keywords: /\b(review|test|qa|quality|lint|coverage|e2e|unit\s*test|integration\s*test)\b/i },
  { agent: 'aegis', keywords: /\b(security|vulnerability|audit|cve|owasp|pentest|auth|encryption|ssl|tls)\b/i },
  { agent: 'scribe', keywords: /\b(docs|readme|guide|documentation|tutorial|changelog|api\s*docs|wiki)\b/i },
  { agent: 'atlas', keywords: /\b(architecture|design|system|diagram|adr|spec|rfc|blueprint|planning)\b/i },
];

/**
 * Resolve which agent should handle a task.
 *
 * @param task - The task to route
 * @param state - Current orchestrator state (to check which agents are idle)
 * @returns The agent ID to dispatch to, or null if no idle agent is available
 */
export function resolveAgent(task: Task, state: OrchestratorState): AgentId | null {
  // 1. If task has explicitly assigned agents, use the first idle one
  if (task.assignedAgents.length > 0) {
    for (const agentId of task.assignedAgents) {
      if (isValidAgent(agentId) && isAgentIdle(agentId, state)) {
        return agentId;
      }
    }
    // All assigned agents are busy — skip this task for now
    if (task.assignedAgents.some(isValidAgent)) {
      return null;
    }
  }

  // 2. Keyword-match on title + description
  const searchText = `${task.title} ${task.description}`;
  for (const rule of ROUTE_RULES) {
    if (rule.keywords.test(searchText) && isAgentIdle(rule.agent, state)) {
      return rule.agent;
    }
  }

  // 3. Default to sage if idle
  if (isAgentIdle('sage', state)) {
    return 'sage';
  }

  return null;
}

function isValidAgent(id: string): id is AgentId {
  return (AGENT_IDS as readonly string[]).includes(id);
}

function isAgentIdle(agentId: AgentId, state: OrchestratorState): boolean {
  const agentState = state.agents[agentId];
  return !agentState || agentState.status === 'idle';
}
