import type { TeamStatusResponse, TeamActivityResponse } from './types';

const API_BASE = '/api/team';

async function teamRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Team API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getTeamStatus(): Promise<TeamStatusResponse> {
  return teamRequest<TeamStatusResponse>('/status');
}

export async function getTeamActivity(lines = 200): Promise<TeamActivityResponse> {
  return teamRequest<TeamActivityResponse>(`/activity?lines=${lines}`);
}
