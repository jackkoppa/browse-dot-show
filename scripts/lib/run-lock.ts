import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * A run-level lock for `bds ingest`, so a manual run and a scheduled one can't overlap.
 *
 * It lives next to the per-file transcription locks, in `<localFilesPath>/locks/`, so every
 * checkout using the same local files (the main checkout, worktrees, the scheduled runner)
 * shares it. The lock file is created atomically (`wx`).
 *
 * A lock is stale, and gets taken over, when:
 * - it was taken on another machine (the local files drive moved; only one machine can use
 *   it at a time), or
 * - its process has exited, or
 * - it's older than `MAX_RUN_LOCK_AGE_MS` (a guard against a reused pid).
 */

/** `bds ingest` exits with this code when another run holds the lock (EX_TEMPFAIL). */
export const EXIT_RUN_LOCKED = 75;

export const MAX_RUN_LOCK_AGE_MS = 48 * 60 * 60 * 1000;

export interface RunLockInfo {
  pid: number;
  hostname: string;
  /** ISO timestamp. */
  startedAt: string;
  /** `manual` or `scheduled`. */
  trigger: string;
  /** The checkout the run is using. */
  repoRoot: string;
}

export type RunLockResult =
  | { acquired: true; release: () => void }
  | { acquired: false; holder: RunLockInfo };

export function runLockPath(localFilesBase: string): string {
  return path.join(localFilesBase, 'locks', 'ingestion-run.lock');
}

export interface LockEnvironment {
  hostname: string;
  now: number;
  isAlive: (pid: number) => boolean;
}

export const defaultLockEnvironment = (): LockEnvironment => ({
  hostname: os.hostname(),
  now: Date.now(),
  isAlive: isProcessAlive,
});

export function isRunLockStale(holder: RunLockInfo, env: LockEnvironment): boolean {
  if (holder.hostname !== env.hostname) return true;
  if (!env.isAlive(holder.pid)) return true;
  const startedAt = Date.parse(holder.startedAt);
  return !Number.isFinite(startedAt) || env.now - startedAt > MAX_RUN_LOCK_AGE_MS;
}

/** Read the lock file; null if there's none (or it's unreadable). */
export function readRunLock(lockPath: string): RunLockInfo | null {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

/** The live holder of the lock, if any (stale locks don't count). */
export function currentRunLockHolder(lockPath: string, env = defaultLockEnvironment()): RunLockInfo | null {
  const holder = readRunLock(lockPath);
  return holder && !isRunLockStale(holder, env) ? holder : null;
}

export function acquireRunLock(
  lockPath: string,
  info: Omit<RunLockInfo, 'pid' | 'hostname' | 'startedAt'>,
  env = defaultLockEnvironment(),
  pid = process.pid,
): RunLockResult {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const contents: RunLockInfo = { pid, hostname: env.hostname, startedAt: new Date(env.now).toISOString(), ...info };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, JSON.stringify(contents, null, 2), { flag: 'wx' });
      return {
        acquired: true,
        release: () => {
          // Only remove it if it's still ours
          const current = readRunLock(lockPath);
          if (current?.pid === pid && current.hostname === contents.hostname && current.startedAt === contents.startedAt) {
            fs.rmSync(lockPath, { force: true });
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const holder = readRunLock(lockPath);
      if (holder && !isRunLockStale(holder, env)) return { acquired: false, holder };
      // An unreadable lock that was just created is another run mid-write; older ones are garbage
      if (!holder && fileAgeMs(lockPath, env.now) < 5_000) return { acquired: false, holder: UNKNOWN_HOLDER };
      fs.rmSync(lockPath, { force: true });
    }
  }
  return { acquired: false, holder: readRunLock(lockPath) ?? UNKNOWN_HOLDER };
}

const UNKNOWN_HOLDER: RunLockInfo = { pid: 0, hostname: '?', startedAt: '?', trigger: '?', repoRoot: '?' };

export function describeRunLockHolder(holder: RunLockInfo): string {
  return `${holder.trigger} run, pid ${holder.pid} on ${holder.hostname}, started ${holder.startedAt} (${holder.repoRoot})`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to another user
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function fileAgeMs(filePath: string, now: number): number {
  try {
    return now - fs.statSync(filePath).mtimeMs;
  } catch {
    return Infinity;
  }
}
