import { useState, useEffect } from 'react';
import type { Task, DiffSummary } from '../types';
import { PRIORITY_COLORS } from '../constants';
import { fetchApprovals, approveTask, rejectTask, fetchBranchDiff } from '../api';

interface ApprovalEntry {
  task: Task;
  project: { id: string; name: string; color: string };
}

interface CardState {
  rejectingId: string | null;
  rejectFeedback: string;
  diffId: string | null;
  diffLoading: boolean;
  diffData: DiffSummary | null;
  actionLoading: string | null;
}

export default function ApprovalQueue() {
  const [approvals, setApprovals] = useState<ApprovalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<CardState>({
    rejectingId: null,
    rejectFeedback: '',
    diffId: null,
    diffLoading: false,
    diffData: null,
    actionLoading: null,
  });

  const loadApprovals = async () => {
    try {
      setError(null);
      const data = await fetchApprovals();
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleApprove = async (taskId: string, projectId: string) => {
    setCard((prev) => ({ ...prev, actionLoading: taskId }));
    try {
      await approveTask(taskId, projectId);
      await loadApprovals();
      // Clear any open reject/diff state for this task
      setCard((prev) => ({
        ...prev,
        actionLoading: null,
        rejectingId: prev.rejectingId === taskId ? null : prev.rejectingId,
        diffId: prev.diffId === taskId ? null : prev.diffId,
        diffData: prev.diffId === taskId ? null : prev.diffData,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
      setCard((prev) => ({ ...prev, actionLoading: null }));
    }
  };

  const handleRejectSubmit = async (taskId: string, projectId: string) => {
    if (!card.rejectFeedback.trim()) return;
    setCard((prev) => ({ ...prev, actionLoading: taskId }));
    try {
      await rejectTask(taskId, projectId, card.rejectFeedback.trim());
      await loadApprovals();
      setCard((prev) => ({
        ...prev,
        actionLoading: null,
        rejectingId: null,
        rejectFeedback: '',
        diffId: prev.diffId === taskId ? null : prev.diffId,
        diffData: prev.diffId === taskId ? null : prev.diffData,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
      setCard((prev) => ({ ...prev, actionLoading: null }));
    }
  };

  const toggleReject = (taskId: string) => {
    setCard((prev) => ({
      ...prev,
      rejectingId: prev.rejectingId === taskId ? null : taskId,
      rejectFeedback: prev.rejectingId === taskId ? '' : prev.rejectFeedback,
    }));
  };

  const toggleDiff = async (taskId: string, projectId: string, branch: string | null) => {
    if (card.diffId === taskId) {
      setCard((prev) => ({ ...prev, diffId: null, diffData: null }));
      return;
    }
    if (!branch) return;

    setCard((prev) => ({ ...prev, diffId: taskId, diffLoading: true, diffData: null }));
    try {
      const data = await fetchBranchDiff(projectId, branch);
      setCard((prev) => ({ ...prev, diffLoading: false, diffData: data }));
    } catch (err) {
      setCard((prev) => ({
        ...prev,
        diffLoading: false,
        diffData: { filesChanged: 0, insertions: 0, deletions: 0, files: [], patch: `Error loading diff: ${err instanceof Error ? err.message : 'Unknown error'}` },
      }));
    }
  };

  if (loading) {
    return (
      <section className="ab-approval-queue">
        <h2 className="ab-section-title">Pending Approvals</h2>
        <div className="ab-approval-loading">Loading...</div>
      </section>
    );
  }

  return (
    <section className="ab-approval-queue">
      <h2 className="ab-section-title">Pending Approvals</h2>

      {error && (
        <div className="ab-approval-error" style={{ color: '#ef4444', marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="ab-approval-empty" style={{ color: '#94a3b8', padding: '24px 0', textAlign: 'center', fontSize: 14 }}>
          No pending approvals
        </div>
      ) : (
        <div className="ab-approval-list">
          {approvals.map(({ task, project }) => (
            <div
              key={task.id}
              className="ab-approval-card"
              style={{
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                backgroundColor: '#1e293b',
              }}
            >
              {/* Header: priority badge + title */}
              <div className="ab-approval-header" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span
                  className="ab-priority-badge"
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    backgroundColor: PRIORITY_COLORS[task.priority] + '22',
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  {task.priority}
                </span>
                <span className="ab-approval-title" style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>
                  {task.title}
                </span>
              </div>

              {/* Meta: project + branch */}
              <div className="ab-approval-meta" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    className="ab-project-dot"
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: project.color,
                    }}
                  />
                  {project.name}
                </span>
                {task.branch && (
                  <span style={{ fontFamily: 'monospace', fontSize: 11, backgroundColor: '#0f172a', padding: '1px 6px', borderRadius: 3 }}>
                    {task.branch}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="ab-approval-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="ab-btn ab-btn-approve"
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: '#166534',
                    color: '#bbf7d0',
                  }}
                  disabled={card.actionLoading === task.id}
                  onClick={() => handleApprove(task.id, project.id)}
                >
                  {card.actionLoading === task.id ? 'Approving...' : 'Approve'}
                </button>
                <button
                  className="ab-btn ab-btn-reject"
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: '#7f1d1d',
                    color: '#fecaca',
                  }}
                  disabled={card.actionLoading === task.id}
                  onClick={() => toggleReject(task.id)}
                >
                  Reject
                </button>
                {task.branch && (
                  <button
                    className="ab-btn ab-btn-diff"
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: '1px solid #475569',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: 'transparent',
                      color: '#94a3b8',
                    }}
                    onClick={() => toggleDiff(task.id, project.id, task.branch)}
                  >
                    {card.diffId === task.id ? 'Hide Diff' : 'View Diff'}
                  </button>
                )}
              </div>

              {/* Reject feedback textarea */}
              {card.rejectingId === task.id && (
                <div className="ab-reject-form" style={{ marginTop: 12 }}>
                  <textarea
                    className="ab-reject-textarea"
                    style={{
                      width: '100%',
                      minHeight: 80,
                      padding: 8,
                      borderRadius: 6,
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#f1f5f9',
                      fontSize: 13,
                      resize: 'vertical',
                      fontFamily: 'inherit',
                    }}
                    placeholder="Reason for rejection..."
                    value={card.rejectFeedback}
                    onChange={(e) => setCard((prev) => ({ ...prev, rejectFeedback: e.target.value }))}
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      className="ab-btn ab-btn-reject-submit"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                        backgroundColor: '#991b1b',
                        color: '#fecaca',
                      }}
                      disabled={!card.rejectFeedback.trim() || card.actionLoading === task.id}
                      onClick={() => handleRejectSubmit(task.id, project.id)}
                    >
                      {card.actionLoading === task.id ? 'Rejecting...' : 'Submit Rejection'}
                    </button>
                    <button
                      className="ab-btn"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: '1px solid #475569',
                        cursor: 'pointer',
                        fontSize: 12,
                        backgroundColor: 'transparent',
                        color: '#94a3b8',
                      }}
                      onClick={() => toggleReject(task.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Diff viewer */}
              {card.diffId === task.id && (
                <div className="ab-diff-viewer" style={{ marginTop: 12 }}>
                  {card.diffLoading ? (
                    <div style={{ color: '#94a3b8', fontSize: 12, padding: 8 }}>Loading diff...</div>
                  ) : card.diffData ? (
                    <>
                      <div className="ab-diff-stats" style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                        <span>{card.diffData.filesChanged} file{card.diffData.filesChanged !== 1 ? 's' : ''} changed</span>
                        <span style={{ color: '#4ade80', marginLeft: 8 }}>+{card.diffData.insertions}</span>
                        <span style={{ color: '#f87171', marginLeft: 4 }}>-{card.diffData.deletions}</span>
                      </div>
                      <pre
                        className="ab-diff-patch"
                        style={{
                          backgroundColor: '#0f172a',
                          color: '#e2e8f0',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.5,
                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          overflow: 'auto',
                          maxHeight: 400,
                          whiteSpace: 'pre',
                          border: '1px solid #334155',
                          margin: 0,
                        }}
                      >
                        {card.diffData.patch || 'No patch data available'}
                      </pre>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
