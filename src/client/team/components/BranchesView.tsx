import { useState, useEffect } from 'react';
import { fetchBranches, fetchBranchDiff } from '../api';
import type { DiffSummary } from '../types';

interface BranchesViewProps {
  projectId: string;
}

interface BranchItem {
  name: string;
  current: boolean;
}

export default function BranchesView({ projectId }: BranchesViewProps) {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffSummary | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setBranches([]);
    setExpandedBranch(null);
    setDiff(null);

    fetchBranches(projectId)
      .then((data) => {
        if (!cancelled) setBranches(data);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleToggleDiff = async (branchName: string) => {
    // Collapse if already expanded
    if (expandedBranch === branchName) {
      setExpandedBranch(null);
      setDiff(null);
      return;
    }

    setExpandedBranch(branchName);
    setDiff(null);
    setDiffLoading(true);

    try {
      const result = await fetchBranchDiff(projectId, branchName);
      setDiff(result);
    } catch {
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="ab-branches">
        <div className="ab-branches-loading">Loading branches...</div>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className="ab-branches">
        <div className="ab-branches-empty">No branches found</div>
      </div>
    );
  }

  return (
    <div className="ab-branches">
      <div className="ab-branches-list">
        {branches.map((branch) => (
          <div key={branch.name} className="ab-branch-row-wrapper">
            <div
              className={`ab-branch-row ${branch.current ? 'ab-branch-row-current' : ''}`}
            >
              <div className="ab-branch-info">
                {branch.current && <span className="ab-branch-indicator" />}
                <span className="ab-branch-name">{branch.name}</span>
              </div>
              <button
                className={`ab-branch-diff-btn ${expandedBranch === branch.name ? 'ab-branch-diff-btn-active' : ''}`}
                onClick={() => handleToggleDiff(branch.name)}
              >
                {expandedBranch === branch.name ? 'Hide Diff' : 'View Diff'}
              </button>
            </div>

            {expandedBranch === branch.name && (
              <div className="ab-diff-panel">
                {diffLoading ? (
                  <div className="ab-diff-loading">Loading diff...</div>
                ) : diff ? (
                  <>
                    <div className="ab-diff-stats">
                      <span className="ab-diff-stat-add">+{diff.insertions}</span>
                      {' '}
                      <span className="ab-diff-stat-del">-{diff.deletions}</span>
                      {' across '}
                      <span className="ab-diff-stat-files">{diff.filesChanged} files</span>
                    </div>
                    {diff.patch ? (
                      <pre className="ab-diff-patch">{diff.patch}</pre>
                    ) : (
                      <div className="ab-diff-empty">No changes</div>
                    )}
                  </>
                ) : (
                  <div className="ab-diff-empty">Could not load diff</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
