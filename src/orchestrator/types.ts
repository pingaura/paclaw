/**
 * Orchestrator state types — shared between modules to avoid circular imports
 */

export interface AgentState {
  status: 'idle' | 'busy';
  currentTaskId: string | null;
  currentProjectId: string | null;
  taskStartedAt: number | null;
  currentBranch: string | null;
}

export interface OrchestratorState {
  enabled: boolean;
  agents: Record<string, AgentState>;
  lastRunAt: number;
  lastDispatchAt: number | null;
  lastBundleRunAt: number | null;
  cycleCount: number;
}
