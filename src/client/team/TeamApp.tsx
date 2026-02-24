import { useCallback, useMemo, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTeamStatus } from './hooks/useTeamStatus';
import { useProjects } from './hooks/useProjects';
import AgentStatusBar from './components/AgentStatusBar';
import ProjectSidebar from './components/ProjectSidebar';
import ProjectHeader from './components/ProjectHeader';
import TaskBoard from './components/TaskBoard';
import PipelineView from './components/PipelineView';
import ActivityFeed from './components/ActivityFeed';
import AgentChatInput from './components/AgentChatInput';
import ConnectionStatus from './components/ConnectionStatus';
import type { ActivityItem } from './types';
import './TeamApp.css';

export default function TeamApp() {
  const { connected, wsError, activities: wsActivities, agentStates } = useWebSocket();
  const { status, restActivities, error, loading } = useTeamStatus();
  const {
    projects, activeProject,
    selectProject, createProject, createTask, updateTask, moveTask, deleteTask,
  } = useProjects();

  const [activityOpen, setActivityOpen] = useState(true);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [chatActivities, setChatActivities] = useState<ActivityItem[]>([]);

  const handleChatSend = useCallback((item: ActivityItem) => {
    setChatActivities((prev) => [...prev, item]);
  }, []);

  // Merge REST + WS + chat activities (dedup by id)
  const allActivities = useMemo<ActivityItem[]>(() => {
    const seen = new Set<string>();
    const merged: ActivityItem[] = [];

    for (const items of [restActivities, wsActivities, chatActivities]) {
      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
    }

    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }, [restActivities, wsActivities, chatActivities]);

  const gatewayOk = status?.gateway?.ok ?? false;

  return (
    <div className="abhiyan">
      {/* Top bar: branding + agent status + connection */}
      <header className="ab-header">
        <div className="ab-header-left">
          <img src="/logo-small.png" alt="Nakhayantram" className="header-logo" />
          <h1 className="ab-brand">Abhiyan</h1>
          <div className={`gateway-badge ${gatewayOk ? 'gateway-ok' : 'gateway-down'}`}>
            Gateway: {loading ? '...' : gatewayOk ? 'Running' : 'Down'}
          </div>
          <ConnectionStatus connected={connected} error={wsError} />
        </div>
        <AgentStatusBar agentStates={agentStates} />
      </header>

      {/* Alerts */}
      {error && <div className="team-error ab-alert">{error}</div>}
      {!loading && !error && !gatewayOk && (
        <div className="team-warning ab-alert">Gateway is not running. Agent activity will be unavailable.</div>
      )}
      {wsError && <div className="team-warning ab-alert">Live connection failed: {wsError}</div>}

      {/* Main body: sidebar + content + activity */}
      <div className="ab-body">
        <ProjectSidebar
          projects={projects}
          activeId={activeProject?.id}
          onSelect={selectProject}
          onCreate={createProject}
        />

        <main className="ab-main">
          {activeProject ? (
            <>
              <ProjectHeader project={activeProject} />
              <TaskBoard
                tasks={activeProject.tasks}
                onCreateTask={createTask}
                onUpdateTask={updateTask}
                onMoveTask={moveTask}
                onDeleteTask={deleteTask}
              />
            </>
          ) : (
            <div className="ab-empty">
              <div className="ab-empty-icon">&#x1F3AF;</div>
              <h2>Welcome to Abhiyan</h2>
              <p>Select or create a project to get started</p>
            </div>
          )}
        </main>

        {/* Collapsible activity panel */}
        <div className={`ab-activity-panel ${activityOpen ? 'ab-activity-open' : 'ab-activity-closed'}`}>
          <button className="ab-activity-toggle" onClick={() => setActivityOpen(!activityOpen)}>
            {activityOpen ? '\u276F' : '\u276E'}
          </button>
          {activityOpen && (
            <>
              <ActivityFeed activities={allActivities} />
              <AgentChatInput onSend={handleChatSend} />
            </>
          )}
        </div>
      </div>

      {/* Collapsible pipeline at the bottom */}
      <div className={`ab-pipeline ${pipelineOpen ? 'ab-pipeline-open' : 'ab-pipeline-closed'}`}>
        <button className="ab-pipeline-toggle" onClick={() => setPipelineOpen(!pipelineOpen)}>
          <span className="ab-pipeline-toggle-label">Pipeline</span>
          <span className={`ab-pipeline-toggle-icon ${pipelineOpen ? 'ab-pipeline-toggle-up' : ''}`}>&#x25B2;</span>
        </button>
        {pipelineOpen && <PipelineView agentStates={agentStates} />}
      </div>
    </div>
  );
}
