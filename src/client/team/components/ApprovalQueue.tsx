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
        <div className="ab-approval-error">
          {error}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="ab-approval-empty">
          No pending approvals
        </div>
      ) : (
        <div className="ab-approval-list">
          {approvals.map(({ task, project }) => (
            <div
              key={task.id}
              className="ab-approval-card"
            >
              {/* Header: priority badge + title */}
              <div className="ab-approval-header">
                <span
                  className="ab-priority-badge"
                  style={{
                    backgroundColor: PRIORITY_COLORS[task.priority] + '22',
                    color: PRIORITY_COLORS[task.priority],
                  }}
                >
                  {task.priority}
                </span>
                <span className="ab-approval-title">
                  {task.title}
                </span>
              </div>

              {/* Meta: project + branch */}
              <div className="ab-approval-meta">
                <span className="ab-approval-meta-project">
                  <span
                    className="ab-project-dot"
                    style={{ backgroundColor: project.color }}
                  />
                  {project.name}
                </span>
                {task.branch && (
                  <span className="ab-approval-branch">
                    {task.branch}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="ab-approval-actions">
                <button
                  className="ab-btn ab-btn-approve"
                  disabled={card.actionLoading === task.id}
                  onClick={() => handleApprove(task.id, project.id)}
                >
                  {card.actionLoading === task.id ? 'Approving...' : 'Approve'}
                </button>
                <button
                  className="ab-btn ab-btn-reject"
                  disabled={card.actionLoading === task.id}
                  onClick={() => toggleReject(task.id)}
                >
                  Reject
                </button>
                {task.branch && (
                  <button
                    className="ab-btn ab-btn-diff"
                    onClick={() => toggleDiff(task.id, project.id, task.branch)}
                  >
                    {card.diffId === task.id ? 'Hide Diff' : 'View Diff'}
                  </button>
                )}
              </div>

              {/* Reject feedback textarea */}
              {card.rejectingId === task.id && (
                <div className="ab-reject-form">
                  <textarea
                    className="ab-reject-textarea"
                    placeholder="Reason for rejection..."
                    value={card.rejectFeedback}
                    onChange={(e) => setCard((prev) => ({ ...prev, rejectFeedback: e.target.value }))}
                  />
                  <div className="ab-reject-form-actions">
                    <button
                      className="ab-btn ab-btn-reject-submit"
                      disabled={!card.rejectFeedback.trim() || card.actionLoading === task.id}
                      onClick={() => handleRejectSubmit(task.id, project.id)}
                    >
                      {card.actionLoading === task.id ? 'Rejecting...' : 'Submit Rejection'}
                    </button>
                    <button
                      className="ab-btn ab-btn-cancel"
                      onClick={() => toggleReject(task.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Diff viewer */}
              {card.diffId === task.id && (
                <div className="ab-approval-diff-viewer">
                  {card.diffLoading ? (
                    <div className="ab-approval-diff-loading">Loading diff...</div>
                  ) : card.diffData ? (
                    <>
                      <div className="ab-approval-diff-stats">
                        <span>{card.diffData.filesChanged} file{card.diffData.filesChanged !== 1 ? 's' : ''} changed</span>
                        <span className="ab-approval-diff-add">+{card.diffData.insertions}</span>
                        <span className="ab-approval-diff-del">-{card.diffData.deletions}</span>
                      </div>
                      <pre className="ab-approval-diff-patch">
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
