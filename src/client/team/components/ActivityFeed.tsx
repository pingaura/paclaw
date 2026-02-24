import { useEffect, useRef } from 'react';
import type { ActivityItem } from '../types';

interface ActivityFeedProps {
  activities: ActivityItem[];
}

const TYPE_LABELS: Record<ActivityItem['type'], string> = {
  message: 'MSG',
  coordination: 'COORD',
  task_start: 'START',
  task_complete: 'DONE',
  error: 'ERR',
  system: 'SYS',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevCountRef.current = activities.length;
  }, [activities]);

  // Items added since last render get the slide-in animation
  const newStartIndex = prevCountRef.current;

  return (
    <section className="team-section">
      <h2 className="section-title">Activity</h2>
      <div className="activity-feed" ref={containerRef}>
        {activities.length === 0 ? (
          <div className="activity-empty">No activity yet. Waiting for agent messages...</div>
        ) : (
          activities.map((item, idx) => (
              <div
                key={item.id}
                className={`activity-item activity-type-${item.type}`}
                {...(idx >= newStartIndex ? { 'data-new': '' } : {})}
              >
                <div className="activity-item-header">
                  <span className="activity-agent">
                    <span className="activity-emoji">{item.agentEmoji}</span>
                    {item.agentName}
                  </span>
                  <span className={`activity-badge badge-${item.type}`}>
                    {TYPE_LABELS[item.type]}
                  </span>
                  <span className="activity-time">{formatTime(item.timestamp)}</span>
                </div>
                <span className="activity-summary">{item.summary}</span>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
