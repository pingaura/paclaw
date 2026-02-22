export type AgentStatus = 'active' | 'idle' | 'offline';

export interface AgentMeta {
  id: string;
  name: string;
  emoji: string;
  role: string;
  model: string;
  pipelineStage: number;
  pipelineGroup?: string;
}

export interface AgentState {
  id: string;
  status: AgentStatus;
  currentTask: string | null;
  lastActivity: number;
  messageCount: number;
}

export interface ActivityItem {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  type: 'message' | 'coordination' | 'task_start' | 'task_complete' | 'error' | 'system';
  summary: string;
}

/** Shape returned by GET /api/team/status (agentId-only, no name/emoji) */
export interface RestActivityItem {
  id: string;
  timestamp: number;
  agentId: string;
  type: ActivityItem['type'];
  summary: string;
}

export interface TeamStatusResponse {
  gateway: {
    ok: boolean;
    status: string;
    processId?: string;
  };
  recentActivity: RestActivityItem[];
}

export interface TeamActivityResponse {
  items: RestActivityItem[];
}
