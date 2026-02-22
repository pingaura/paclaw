import { useState, useEffect, useCallback, useMemo } from 'react';
import type { TeamStatusResponse, ActivityItem } from '../types';
import { AGENT_MAP } from '../constants';
import { getTeamStatus } from '../api';

const POLL_INTERVAL = 15_000; // 15 seconds

export function useTeamStatus() {
  const [status, setStatus] = useState<TeamStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getTeamStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  // Enrich REST activity items with agent metadata from client constants.
  // The backend only returns agentId; the client maps to name/emoji.
  const restActivities = useMemo<ActivityItem[]>(() => {
    const raw = status?.recentActivity || [];
    return raw.map((item) => {
      const agent = AGENT_MAP.get(item.agentId);
      return {
        ...item,
        agentName: agent?.name ?? item.agentId,
        agentEmoji: agent?.emoji ?? '',
      };
    });
  }, [status?.recentActivity]);

  return { status, restActivities, error, loading, refetch: fetchStatus };
}
