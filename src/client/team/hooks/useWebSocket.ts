import { useState, useEffect, useCallback, useRef } from 'react';
import type { ActivityItem, AgentState } from '../types';
import { AGENTS } from '../constants';
import { TeamWebSocket } from '../ws';

const MAX_ACTIVITIES = 200;
const ACTIVE_THRESHOLD = 30_000;     // 30 seconds
const IDLE_THRESHOLD = 300_000;      // 5 minutes

function buildWsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/`;
}

function computeStatus(lastActivity: number): AgentState['status'] {
  const elapsed = Date.now() - lastActivity;
  if (elapsed < ACTIVE_THRESHOLD) return 'active';
  if (elapsed < IDLE_THRESHOLD) return 'idle';
  return 'offline';
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [agentStates, setAgentStates] = useState<Map<string, AgentState>>(() => {
    const map = new Map<string, AgentState>();
    for (const agent of AGENTS) {
      map.set(agent.id, {
        id: agent.id,
        status: 'offline',
        currentTask: null,
        lastActivity: 0,
        messageCount: 0,
      });
    }
    return map;
  });

  const wsRef = useRef<TeamWebSocket | null>(null);

  const handleMessage = useCallback((activity: ActivityItem) => {
    setActivities((prev) => {
      const next = [...prev, activity];
      return next.length > MAX_ACTIVITIES ? next.slice(-MAX_ACTIVITIES) : next;
    });

    setAgentStates((prev) => {
      const next = new Map(prev);
      const existing = next.get(activity.agentId);
      if (existing) {
        let currentTask = existing.currentTask;
        if (activity.type === 'task_start') {
          currentTask = activity.summary;
        } else if (activity.type === 'task_complete') {
          currentTask = null;
        }
        next.set(activity.agentId, {
          ...existing,
          status: 'active',
          lastActivity: activity.timestamp,
          messageCount: existing.messageCount + 1,
          currentTask,
        });
      }
      return next;
    });
  }, []);

  const handleConnection = useCallback((isConnected: boolean) => {
    setConnected(isConnected);
  }, []);

  useEffect(() => {
    const ws = new TeamWebSocket(buildWsUrl(), handleMessage, handleConnection);
    wsRef.current = ws;
    ws.connect();

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [handleMessage, handleConnection]);

  // Periodically update agent statuses based on time elapsed
  useEffect(() => {
    const timer = setInterval(() => {
      setAgentStates((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [id, state] of next) {
          const newStatus = computeStatus(state.lastActivity);
          if (newStatus !== state.status) {
            next.set(id, { ...state, status: newStatus });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);

    return () => clearInterval(timer);
  }, []);

  return { connected, activities, agentStates };
}
