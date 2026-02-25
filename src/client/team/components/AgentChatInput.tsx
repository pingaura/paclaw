import { useRef, useEffect } from 'react';
import { useChatInput } from '../hooks/useChatInput';
import type { ActivityItem } from '../types';

interface AgentChatInputProps {
  onSend: (item: ActivityItem) => void;
}

export default function AgentChatInput({ onSend }: AgentChatInputProps) {
  const {
    message, setMessage,
    showMentionMenu, filteredAgents, highlightIndex,
    sending, error,
    send, closeMentionMenu, insertMention, onKeyDown,
  } = useChatInput();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Scroll highlighted item into view
  useEffect(() => {
    if (!showMentionMenu || !menuRef.current) return;
    const active = menuRef.current.children[highlightIndex] as HTMLElement;
    active?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, showMentionMenu]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = await send();
    if (item) {
      onSend(item);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    onKeyDown(e);
  };

  return (
    <div className="agent-chat-input">
      <form className="agent-chat-form" onSubmit={handleSubmit}>
        {showMentionMenu && filteredAgents.length > 0 && (
          <div className="agent-mention-menu" ref={menuRef}>
            {filteredAgents.map((agent, i) => (
              <div
                key={agent.id}
                className={`agent-mention-option${i === highlightIndex ? ' agent-mention-active' : ''}`}
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
