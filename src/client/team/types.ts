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

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'needs_approval' | 'done';
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
  branch: string | null;
  approvalRequired: boolean;
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
  repoPath: string;
  defaultBranch: string;
  techStack: string[];
  instructions: string;
  contextFiles: string[];
  tags: string[];
  links: { label: string; url: string }[];
  lastBundledAt: number | null;
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
  techStack?: string[];
  instructions?: string;
  contextFiles?: string[];
  tags?: string[];
}

export interface CreateTaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgents: string[];
  pipelineStage: number | null;
  approvalRequired?: boolean;
}

export interface SendMessageInput {
  to: string;
  message: string;
}

// ---- Git-aware types ----

export interface ApprovalItem {
  taskId: string;
  projectId: string;
  title: string;
  branch: string;
  agentId: string;
  diff: DiffSummary;
  requestedAt: number;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: { path: string; insertions: number; deletions: number }[];
  patch: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}
