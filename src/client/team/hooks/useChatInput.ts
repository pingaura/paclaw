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

export interface UseChatInputReturn {
  message: string;
  setMessage: (msg: string) => void;
  targetAgent: string | null;
  showMentionMenu: boolean;
  sending: boolean;
  error: string | null;
  send: () => Promise<ActivityItem | null>;
  closeMentionMenu: () => void;
  insertMention: (agentId: string) => void;
}

export function useChatInput(): UseChatInputReturn {
  const [message, setMessage] = useState('');
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevMsgRef = useRef('');

  const targetAgent = parseTarget(message);

  const handleSetMessage = useCallback((msg: string) => {
    setError(null);
    // Show mention menu when user just typed '@'
    const prev = prevMsgRef.current;
    if (msg.endsWith('@') && !prev.endsWith('@')) {
      setShowMentionMenu(true);
    } else if (!msg.includes('@')) {
      setShowMentionMenu(false);
    }
    prevMsgRef.current = msg;
    setMessage(msg);
  }, []);

  const closeMentionMenu = useCallback(() => setShowMentionMenu(false), []);

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
  }, []);

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
    sending,
    error,
    send,
    closeMentionMenu,
    insertMention,
  };
}
