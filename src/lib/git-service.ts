/**
 * Git Service — Encapsulates all git operations inside the Cloudflare sandbox container.
 *
 * Agents never run raw git commands. They go through this service.
 * Only the orchestrator calls these functions.
 *
 * Storage layout in R2 for repo bundles:
 *   repos/{projectId}/repo.bundle   - git bundle (binary)
 *   repos/{projectId}/meta.json     - { lastBundledAt, projectId, projectName }
 */

import type { Sandbox } from '@cloudflare/sandbox';
import type { MoltbotEnv } from '../types';
import type { Project, Task } from './abhiyan';

// ---- Types ----

export interface DiffResult {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: { path: string; insertions: number; deletions: number }[];
  patch: string;
}

export interface RepoStatus {
  currentBranch: string;
  branches: string[];
  uncommittedChanges: boolean;
}

export interface BranchInfo {
  name: string;
  current: boolean;
}

// ---- Private helpers ----

/**
 * Convert text to a URL/branch-safe slug.
 * Lowercase, replace non-alphanumeric runs with a single hyphen, trim hyphens, cap at 40 chars.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Run a shell command inside the sandbox container.
 * Throws on non-zero exit. Returns trimmed stdout.
 */
async function execInContainer(
  sandbox: Sandbox,
  command: string,
  timeout = 30_000,
): Promise<string> {
  const result = await sandbox.exec(`sh -c '${command.replace(/'/g, "'\\''")}'`, { timeout });

  // Primary guard: check exitCode if the sandbox exposes it
  if ('exitCode' in result && (result as { exitCode: number }).exitCode !== 0) {
    throw new Error(
      `Command failed (exit ${(result as { exitCode: number }).exitCode}): ${result.stderr || 'unknown error'}`,
    );
  }

  // Secondary guard: check success flag
  if ('success' in result && result.success === false) {
    throw new Error(`Command failed: ${result.stderr || 'unknown error'}`);
  }

  return (result.stdout || '').trim();
}

// ---- Exported functions ----

/**
 * Initialize a fresh git repository for a project.
 * Creates the directory, initialises git, configures user, creates initial commit.
 */
export async function initRepo(sandbox: Sandbox, project: Project): Promise<void> {
  const { repoPath, defaultBranch } = project;

  await execInContainer(sandbox, `mkdir -p "${repoPath}"`);
  await execInContainer(sandbox, `cd "${repoPath}" && git init -b "${defaultBranch}"`);
  await execInContainer(sandbox, `cd "${repoPath}" && git config user.email "abhiyan@local"`);
  await execInContainer(sandbox, `cd "${repoPath}" && git config user.name "Abhiyan"`);

  // Write README via sandbox.writeFile to avoid shell injection through project.name
  await sandbox.writeFile(repoPath + '/README.md', `# ${project.name}\n`);

  await execInContainer(sandbox, `cd "${repoPath}" && git add -A && git commit -m "Initial commit"`);
}

/**
 * Create a task branch from the default branch.
 * Returns the new branch name: `task/{taskId}-{slug}`.
 */
export async function createBranch(
  sandbox: Sandbox,
  project: Project,
  task: Task,
): Promise<string> {
  const slug = slugify(task.title);
  const branchName = `task/${task.id}-${slug}`;
  const { repoPath, defaultBranch } = project;

  await execInContainer(sandbox, `cd "${repoPath}" && git checkout "${defaultBranch}"`);
  await execInContainer(sandbox, `cd "${repoPath}" && git checkout -b "${branchName}"`);

  return branchName;
}

/**
 * Get the diff between default branch and a task branch.
 * Uses three-dot diff syntax so only changes introduced on the branch are shown.
 * Patch output is capped at ~50 KB to avoid oversized payloads.
 */
export async function getBranchDiff(
  sandbox: Sandbox,
  project: Project,
  branch: string,
): Promise<DiffResult> {
  const { repoPath, defaultBranch } = project;

  // numstat gives per-file insertions/deletions
  const numstat = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git diff --numstat "${defaultBranch}...${branch}"`,
  );

  const files: DiffResult['files'] = [];
  let totalInsertions = 0;
  let totalDeletions = 0;

  if (numstat) {
    for (const line of numstat.split('\n')) {
      if (!line.trim()) continue;
      const [ins, del, path] = line.split('\t');
      // Binary files show '-' for ins/del
      const insertions = ins === '-' ? 0 : parseInt(ins, 10);
      const deletions = del === '-' ? 0 : parseInt(del, 10);
      files.push({ path, insertions, deletions });
      totalInsertions += insertions;
      totalDeletions += deletions;
    }
  }

  // Full patch, capped at ~50 KB
  const patch = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git diff "${defaultBranch}...${branch}" | head -c 51200`,
  );

  return {
    filesChanged: files.length,
    insertions: totalInsertions,
    deletions: totalDeletions,
    files,
    patch,
  };
}

/**
 * Merge a task branch into the default branch using --no-ff.
 * On success, deletes the merged branch. On failure, aborts the merge.
 */
export async function mergeBranch(
  sandbox: Sandbox,
  project: Project,
  branch: string,
): Promise<{ success: boolean; error?: string }> {
  const { repoPath, defaultBranch } = project;

  try {
    await execInContainer(sandbox, `cd "${repoPath}" && git checkout "${defaultBranch}"`);
    await execInContainer(sandbox, `cd "${repoPath}" && git merge --no-ff "${branch}"`);
    await execInContainer(sandbox, `cd "${repoPath}" && git branch -d "${branch}"`);
    return { success: true };
  } catch (err) {
    // Attempt to abort the failed merge
    try {
      await execInContainer(sandbox, `cd "${repoPath}" && git merge --abort`);
    } catch {
      // merge --abort may fail if merge never started; ignore
    }
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Create a git bundle and upload it to R2 for persistent storage.
 * Also writes a metadata JSON file alongside the bundle.
 */
export async function bundleRepo(
  sandbox: Sandbox,
  env: MoltbotEnv,
  project: Project,
): Promise<void> {
  const bucket = env.MOLTBOT_BUCKET;
  const { repoPath } = project;
  const tmpPath = `/tmp/${project.id}.bundle`;

  // Create git bundle containing all refs
  await execInContainer(sandbox, `cd "${repoPath}" && git bundle create "${tmpPath}" --all`);

  // Read the bundle file from the container as base64
  const bundleResult = await sandbox.readFile(tmpPath, { encoding: 'base64' });
  if (!bundleResult || !bundleResult.content) {
    throw new Error(`Failed to read bundle file at ${tmpPath}`);
  }

  // Decode base64 to binary for R2 upload
  const binaryString = atob(bundleResult.content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Upload bundle binary to R2
  await bucket.put(`repos/${project.id}/repo.bundle`, bytes.buffer);

  // Write metadata
  const meta = {
    lastBundledAt: Date.now(),
    projectId: project.id,
    projectName: project.name,
  };
  await bucket.put(`repos/${project.id}/meta.json`, JSON.stringify(meta), {
    httpMetadata: { contentType: 'application/json' },
  });

  // Clean up temp file
  try {
    await execInContainer(sandbox, `rm -f "${tmpPath}"`);
  } catch {
    // Non-fatal — temp file cleanup is best-effort
  }
}

/**
 * Restore a repository from an R2 bundle into the container.
 * Returns false if no bundle exists in R2.
 */
export async function restoreRepo(
  sandbox: Sandbox,
  env: MoltbotEnv,
  project: Project,
): Promise<boolean> {
  const bucket = env.MOLTBOT_BUCKET;
  const { repoPath } = project;
  const tmpPath = `/tmp/${project.id}.bundle`;

  // Attempt to download the bundle from R2
  const bundleObj = await bucket.get(`repos/${project.id}/repo.bundle`);
  if (!bundleObj) {
    return false;
  }

  // Convert binary R2 data to base64 for sandbox writeFile
  const bundleBuffer = await bundleObj.arrayBuffer();
  const bundleBytes = new Uint8Array(bundleBuffer);
  let binaryStr = '';
  for (let i = 0; i < bundleBytes.length; i++) {
    binaryStr += String.fromCharCode(bundleBytes[i]);
  }
  const base64Content = btoa(binaryStr);

  // Write bundle to container filesystem as base64-encoded binary
  await sandbox.writeFile(tmpPath, base64Content, { encoding: 'base64' });

  // Clone from the bundle into the project's repoPath
  await execInContainer(sandbox, `git clone "${tmpPath}" "${repoPath}"`);

  // Configure git user inside the restored repo
  await execInContainer(sandbox, `cd "${repoPath}" && git config user.email "abhiyan@local"`);
  await execInContainer(sandbox, `cd "${repoPath}" && git config user.name "Abhiyan"`);

  // Clean up temp file
  try {
    await execInContainer(sandbox, `rm -f "${tmpPath}"`);
  } catch {
    // Non-fatal
  }

  return true;
}

/**
 * Get the current status of a repository: branch, all branches, and dirty state.
 */
export async function getRepoStatus(
  sandbox: Sandbox,
  project: Project,
): Promise<RepoStatus> {
  const { repoPath } = project;

  const currentBranch = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git branch --show-current`,
  );

  const branchOutput = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git branch --format="%(refname:short)"`,
  );
  const branches = branchOutput ? branchOutput.split('\n').filter(Boolean) : [];

  const porcelain = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git status --porcelain`,
  );
  const uncommittedChanges = porcelain.length > 0;

  return { currentBranch, branches, uncommittedChanges };
}

/**
 * Get recent commit log as oneline entries.
 */
export async function getLog(
  sandbox: Sandbox,
  project: Project,
  limit = 10,
): Promise<string> {
  const { repoPath } = project;
  return execInContainer(sandbox, `cd "${repoPath}" && git log --oneline -${limit}`);
}

/**
 * List all local branches with an indicator of which is current.
 */
export async function listBranches(
  sandbox: Sandbox,
  project: Project,
): Promise<BranchInfo[]> {
  const { repoPath } = project;

  const output = await execInContainer(
    sandbox,
    `cd "${repoPath}" && git branch --format="%(HEAD) %(refname:short)"`,
  );

  if (!output) return [];

  return output.split('\n').filter(Boolean).map((line) => {
    const current = line.startsWith('*');
    const name = line.replace(/^\*?\s+/, '').trim();
    return { name, current };
  });
}

/**
 * Check whether a git repository already exists at the project's repoPath.
 */
export async function repoExists(sandbox: Sandbox, project: Project): Promise<boolean> {
  try {
    const result = await execInContainer(
      sandbox,
      `test -d "${project.repoPath}/.git" && echo yes || echo no`,
    );
    return result === 'yes';
  } catch {
    return false;
  }
}
