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
  nextCursor: number | null;
  nextCursorId: string | null;
}

// ---- Abhiyan: Project & Task Management ----

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgents: string[];
  pipelineStage: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color: string;
  createdAt: number;
  updatedAt: number;
}

/** Project with its tasks loaded (frontend-only, assembled from separate API calls) */
export interface ProjectWithTasks extends Project {
  tasks: Task[];
}

export interface ProjectIndex {
  id: string;
  name: string;
  status: ProjectStatus;
  color: string;
  taskCount: number;
  updatedAt: number;
}

export interface CreateProjectInput {
  name: string;
  description: string;
  color: string;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgents: string[];
  pipelineStage: number | null;
}

export interface SendMessageInput {
  to: string;
  message: string;
}
