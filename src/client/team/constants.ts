import type { AgentMeta } from './types';

export const AGENTS: AgentMeta[] = [
  {
    id: 'sage',
    name: 'Sage',
    emoji: '\u{1F9D9}',
    role: 'Strategic Planner',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 0,
  },
  {
    id: 'atlas',
    name: 'Atlas',
    emoji: '\u{1F5FA}\u{FE0F}',
    role: 'System Architect',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 1,
  },
  {
    id: 'forge',
    name: 'Forge',
    emoji: '\u{1F525}',
    role: 'Backend Engineer',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 2,
    pipelineGroup: 'implementation',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    emoji: '\u{1F3A8}',
    role: 'Frontend Engineer',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 2,
    pipelineGroup: 'implementation',
  },
  {
    id: 'harbor',
    name: 'Harbor',
    emoji: '\u{1F6A2}',
    role: 'DevOps Engineer',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 2,
    pipelineGroup: 'implementation',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    emoji: '\u{1F6E1}\u{FE0F}',
    role: 'Code Reviewer',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 3,
  },
  {
    id: 'aegis',
    name: 'Aegis',
    emoji: '\u{1F512}',
    role: 'Security Analyst',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 4,
  },
  {
    id: 'scribe',
    name: 'Scribe',
    emoji: '\u{1F4DD}',
    role: 'Documentation Writer',
    model: 'claude-sonnet-4-20250514',
    pipelineStage: 5,
  },
];

export const PIPELINE_STAGES = [
  { index: 0, label: 'Planning', color: '#a78bfa' },
  { index: 1, label: 'Architecture', color: '#60a5fa' },
  { index: 2, label: 'Implementation', color: '#34d399' },
  { index: 3, label: 'Review', color: '#fbbf24' },
  { index: 4, label: 'Security', color: '#f87171' },
  { index: 5, label: 'Documentation', color: '#94a3b8' },
];

export const AGENT_MAP = new Map(AGENTS.map((a) => [a.id, a]));
