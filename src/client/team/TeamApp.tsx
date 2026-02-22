import { useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useTeamStatus } from './hooks/useTeamStatus';
import AgentGrid from './components/AgentGrid';
import PipelineView from './components/PipelineView';
import ActivityFeed from './components/ActivityFeed';
import ConnectionStatus from './components/ConnectionStatus';
import type { ActivityItem } from './types';
import './TeamApp.css';

export default function TeamApp() {
  const { connected, wsError, activities: wsActivities, agentStates } = useWebSocket();
  const { status, restActivities, error, loading } = useTeamStatus();

  // Merge REST activities with WS activities (dedup by id)
  const allActivities = useMemo<ActivityItem[]>(() => {
    const seen = new Set<string>();
    const merged: ActivityItem[] = [];

    // REST activities first (older)
    for (const item of restActivities) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    // WS activities on top (newer, real-time)
    for (const item of wsActivities) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }, [restActivities, wsActivities]);

  const gatewayOk = status?.gateway?.ok ?? false;

  return (
    <div className="team-app">
      <header className="team-header">
        <div className="team-header-left">
          <img src="/logo-small.png" alt="Moltworker" className="header-logo" />
          <h1>Team Dashboard</h1>
        </div>
        <div className="team-header-right">
          <div className={`gateway-badge ${gatewayOk ? 'gateway-ok' : 'gateway-down'}`}>
            Gateway: {loading ? '...' : gatewayOk ? 'Running' : 'Down'}
          </div>
          <ConnectionStatus connected={connected} error={wsError} />
        </div>
      </header>

      <main className="team-main">
        {error && <div className="team-error">{error}</div>}
        {!loading && !error && !gatewayOk && (
          <div className="team-warning">Gateway is not running. Agent activity will be unavailable.</div>
        )}
        {wsError && (
          <div className="team-warning">Live connection failed: {wsError}</div>
        )}
        <AgentGrid agentStates={agentStates} />
        <PipelineView agentStates={agentStates} />
        <ActivityFeed activities={allActivities} />
      </main>
    </div>
  );
}
