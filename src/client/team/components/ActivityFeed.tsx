import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ActivityItem } from '../types';

interface ActivityFeedProps {
  activities: ActivityItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
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

export default function ActivityFeed({ activities, hasMore, loadingMore, onLoadMore }: ActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const prevCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const didPrependRef = useRef(false);

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

  // Capture scroll height before React commits DOM changes from prepend
  if (containerRef.current && activities.length > prevCountRef.current) {
    const oldFirst = prevCountRef.current > 0 ? activities[0] : null;
    // If the first item changed, items were prepended (not appended)
    if (oldFirst && prevCountRef.current > 0) {
      prevScrollHeightRef.current = containerRef.current.scrollHeight;
      didPrependRef.current = true;
    }
  }

  // Preserve scroll position when older items are prepended at the top
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (didPrependRef.current && prevScrollHeightRef.current > 0) {
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        el.scrollTop += delta;
      }
      didPrependRef.current = false;
      prevScrollHeightRef.current = 0;
    } else if (autoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }

    prevCountRef.current = activities.length;
  }, [activities]);

  // Items added since last render get the slide-in animation
  const newStartIndex = prevCountRef.current;

  return (
    <section className="team-section">
      <h2 className="section-title">Activity</h2>
      <div className="activity-feed" ref={containerRef}>
        {hasMore && (
          <button
            className="activity-load-more"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load older'}
          </button>
        )}
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
