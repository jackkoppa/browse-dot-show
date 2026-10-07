import * as fs from 'fs';
import * as path from 'path';

/**
 * Per-file transcription locks for local runs: one lock file per audio file, created
 * atomically (`wx` fails if it exists), so concurrent processes (parallel workers, or a
 * manual run next to a scheduled one) can't both claim a file. The locks live outside the
 * folders that are synced to S3.
 *
 * A lock is stale, and gets taken over, once its process has exited or it's older than
 * `staleAfterMs`.
 */
export interface LockContents {
  fileKey: string;
  processId: string;
  pid: number;
  timestamp: number;
}

export class LocalFileLocks {
  private readonly held = new Set<string>();

  constructor(
    private readonly lockDir: string,
    private readonly processId: string,
    private readonly staleAfterMs = 2 * 60 * 60 * 1000,
  ) {}

  /** Claim `fileKey`; false if another live process holds it. */
  acquire(fileKey: string): boolean {
    fs.mkdirSync(this.lockDir, { recursive: true });
    const lockPath = this.lockPathFor(fileKey);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const contents: LockContents = { fileKey, processId: this.processId, pid: process.pid, timestamp: Date.now() };
        fs.writeFileSync(lockPath, JSON.stringify(contents), { flag: 'wx' });
        this.held.add(fileKey);
        return true;
      } catch (error: any) {
        if (error.code !== 'EEXIST') throw error;
        // Held by someone: take it over only if it's stale, then retry the atomic create once
        if (!this.isStale(lockPath)) return false;
        fs.rmSync(lockPath, { force: true });
      }
    }
    return false;
  }

  release(fileKey: string): void {
    const lockPath = this.lockPathFor(fileKey);
    const contents = readLock(lockPath);
    if (contents?.processId === this.processId) fs.rmSync(lockPath, { force: true });
    this.held.delete(fileKey);
  }

  /** Release every lock this process holds (on exit or interrupt). */
  releaseAll(): void {
    for (const fileKey of this.held) this.release(fileKey); // deleting the current Set entry is safe
  }

  /** Whether another live process holds `fileKey`. */
  isLockedByOther(fileKey: string): boolean {
    const lockPath = this.lockPathFor(fileKey);
    const contents = readLock(lockPath);
    if (!contents || contents.processId === this.processId) return false;
    return !this.isStale(lockPath);
  }

  /** Remove stale locks; returns how many. */
  cleanupStale(): number {
    if (!fs.existsSync(this.lockDir)) return 0;
    let removed = 0;
    for (const name of fs.readdirSync(this.lockDir)) {
      const lockPath = path.join(this.lockDir, name);
      if (name.endsWith('.lock') && this.isStale(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        removed++;
      }
    }
    return removed;
  }

  lockPathFor(fileKey: string): string {
    return path.join(this.lockDir, `${encodeURIComponent(fileKey)}.lock`);
  }

  private isStale(lockPath: string): boolean {
    const contents = readLock(lockPath);
    // Unreadable or half-written: judge by the file's age
    const timestamp = contents?.timestamp ?? safeMtime(lockPath);
    if (timestamp === undefined) return true;
    if (Date.now() - timestamp > this.staleAfterMs) return true;
    return contents ? !isProcessAlive(contents.pid) : false;
  }
}

function readLock(lockPath: string): LockContents | undefined {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function safeMtime(filePath: string): number | undefined {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // EPERM: the process exists but belongs to another user
    return error.code === 'EPERM';
  }
}
