import { useState, useCallback, useRef } from 'react';
import { sendAgentMessage } from '../api';
import { AGENTS } from '../constants';
import type { ActivityItem } from '../types';

const AGENT_IDS = new Set(AGENTS.map((a) => a.id));

/** Parse @agentName from message text */
function parseTarget(text: string): string | null {
  const match = text.match(/@(\w+)/);
  if (!match) return null;
  const id = match[1].toLowerCase();
  return AGENT_IDS.has(id) ? id : null;
}

/** Filter agents by partial text after @ */
function filterAgents(text: string) {
  const atIndex = text.lastIndexOf('@');
  if (atIndex === -1) return AGENTS;
  const partial = text.slice(atIndex + 1).toLowerCase();
  if (!partial) return AGENTS;
  return AGENTS.filter(
    (a) => a.id.startsWith(partial) || a.name.toLowerCase().startsWith(partial),
  );
}

export interface UseChatInputReturn {
  message: string;
  setMessage: (msg: string) => void;
  targetAgent: string | null;
  showMentionMenu: boolean;
  filteredAgents: typeof AGENTS;
  highlightIndex: number;
  sending: boolean;
  error: string | null;
  send: () => Promise<ActivityItem | null>;
  closeMentionMenu: () => void;
  insertMention: (agentId: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function useChatInput(): UseChatInputReturn {
  const [message, setMessage] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevMsgRef = useRef('');

  const targetAgent = parseTarget(message);
  const filteredAgents = showMentionMenu ? filterAgents(message) : AGENTS;

  const handleSetMessage = useCallback((msg: string) => {
    setError(null);
    // Show mention menu when user just typed '@'
    const prev = prevMsgRef.current;
    if (msg.endsWith('@') && !prev.endsWith('@')) {
      setShowMentionMenu(true);
      setHighlightIndex(0);
    } else if (!msg.includes('@')) {
      setShowMentionMenu(false);
    }
    // Reset highlight when filter text changes
    setHighlightIndex(0);
    prevMsgRef.current = msg;
    setMessage(msg);
  }, []);

  const closeMentionMenu = useCallback(() => {
    setShowMentionMenu(false);
    setHighlightIndex(0);
  }, []);

  const insertMention = useCallback((agentId: string) => {
    setMessage((prev) => {
      // Replace the trailing '@' (or partial '@text') with '@agentId '
      const atIndex = prev.lastIndexOf('@');
      const next = atIndex === -1
        ? `@${agentId} `
        : prev.slice(0, atIndex) + `@${agentId} `;
      prevMsgRef.current = next;
      return next;
    });
    setShowMentionMenu(false);
    setHighlightIndex(0);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showMentionMenu) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % filteredAgents.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + filteredAgents.length) % filteredAgents.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredAgents.length > 0) {
        insertMention(filteredAgents[highlightIndex]?.id ?? filteredAgents[0].id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionMenu();
    }
  }, [showMentionMenu, filteredAgents, highlightIndex, insertMention, closeMentionMenu]);

  const send = useCallback(async (): Promise<ActivityItem | null> => {
    if (sending) return null;

    const agent = parseTarget(message);
    if (!agent) {
      setError('Use @agentName to specify a target agent');
      return null;
    }

    // Strip the @mention to get the actual message content
    const content = message.replace(/@\w+\s*/, '').trim();
    if (!content) {
      setError('Message cannot be empty');
      return null;
    }

    if (content.length > 4000) {
      setError('Message too long (max 4000 characters)');
      return null;
    }

    setSending(true);
    setError(null);

    try {
      await sendAgentMessage(agent, content);

      // Build optimistic activity item
      const meta = AGENTS.find((a) => a.id === agent);
      const item: ActivityItem = {
        id: `chat-${Date.now()}`,
        timestamp: Date.now(),
        agentId: agent,
        agentName: meta?.name ?? agent,
        agentEmoji: meta?.emoji ?? '',
        type: 'coordination',
        summary: `User → ${meta?.name ?? agent}: ${content}`,
      };

      setMessage('');
      prevMsgRef.current = '';
      return item;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return null;
    } finally {
      setSending(false);
    }
  }, [message, sending]);

  return {
    message,
    setMessage: handleSetMessage,
    targetAgent,
    showMentionMenu,
    filteredAgents,
    highlightIndex,
    sending,
    error,
    send,
    closeMentionMenu,
    insertMention,
    onKeyDown,
  };
}
