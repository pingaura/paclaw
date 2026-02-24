import { useRef, useEffect } from 'react';
import { AGENTS } from '../constants';
import { useChatInput } from '../hooks/useChatInput';
import type { ActivityItem } from '../types';

interface AgentChatInputProps {
  onSend: (item: ActivityItem) => void;
}

export default function AgentChatInput({ onSend }: AgentChatInputProps) {
  const {
    message, setMessage,
    showMentionMenu, sending, error,
    send, closeMentionMenu, insertMention,
  } = useChatInput();
  const inputRef = useRef<HTMLInputElement>(null);

  // Close mention menu on outside click
  useEffect(() => {
    if (!showMentionMenu) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.agent-chat-form')) {
        closeMentionMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMentionMenu, closeMentionMenu]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = await send();
    if (item) {
      onSend(item);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') closeMentionMenu();
  };

  return (
    <div className="agent-chat-input">
      <form className="agent-chat-form" onSubmit={handleSubmit}>
        {showMentionMenu && (
          <div className="agent-mention-menu">
            {AGENTS.map((agent) => (
              <div
                key={agent.id}
                className="agent-mention-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(agent.id);
                  inputRef.current?.focus();
                }}
              >
                <span>{agent.emoji}</span>
                <span>{agent.name}</span>
                <span className="agent-mention-role">{agent.role}</span>
              </div>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          className="agent-chat-field"
          placeholder="Message an agent... (use @name)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button
          type="submit"
          className="agent-chat-send"
          disabled={sending || !message.trim()}
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
      {error && <div className="agent-chat-error">{error}</div>}
    </div>
  );
}
