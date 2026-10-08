import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquireRunLock, currentRunLockHolder, isRunLockStale, MAX_RUN_LOCK_AGE_MS, readRunLock, runLockPath, type LockEnvironment } from './run-lock.js';

const NOW = Date.parse('2026-10-08T03:00:00Z');
const env = (overrides: Partial<LockEnvironment> = {}): LockEnvironment => ({
  hostname: 'runner',
  now: NOW,
  isAlive: () => true,
  ...overrides,
});
const info = { trigger: 'manual', repoRoot: '/repo' };

describe('run lock', () => {
  let lockPath: string;
  beforeEach(() => {
    lockPath = runLockPath(fs.mkdtempSync(path.join(os.tmpdir(), 'bds-run-lock-')));
  });
  afterEach(() => fs.rmSync(path.dirname(path.dirname(lockPath)), { recursive: true, force: true }));

  it('lives in <localFiles>/locks/', () => {
    expect(runLockPath('/Volumes/ssd/files')).toBe('/Volumes/ssd/files/locks/ingestion-run.lock');
  });

  it('is exclusive while the holder is alive, and released by its holder', () => {
    const first = acquireRunLock(lockPath, info, env(), 100);
    expect(first.acquired).toBe(true);

    const second = acquireRunLock(lockPath, { ...info, trigger: 'scheduled' }, env(), 200);
    expect(second).toMatchObject({ acquired: false, holder: { pid: 100, trigger: 'manual' } });
    expect(currentRunLockHolder(lockPath, env())?.pid).toBe(100);

    if (first.acquired) first.release();
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(acquireRunLock(lockPath, info, env(), 200).acquired).toBe(true);
  });

  it('takes over a lock whose process has exited', () => {
    acquireRunLock(lockPath, info, env(), 100);
    const result = acquireRunLock(lockPath, info, env({ isAlive: pid => pid !== 100 }), 200);
    expect(result.acquired).toBe(true);
    expect(readRunLock(lockPath)?.pid).toBe(200);
  });

  it("doesn't release a lock that someone else took over", () => {
    const first = acquireRunLock(lockPath, info, env(), 100);
    acquireRunLock(lockPath, info, env({ isAlive: () => false }), 200);
    if (first.acquired) first.release();
    expect(readRunLock(lockPath)?.pid).toBe(200);
  });

  it('treats locks from another machine, or very old ones, as stale', () => {
    const holder = { pid: 1, hostname: 'runner', startedAt: new Date(NOW).toISOString(), ...info };
    expect(isRunLockStale(holder, env())).toBe(false);
    expect(isRunLockStale({ ...holder, hostname: 'laptop' }, env())).toBe(true);
    expect(isRunLockStale(holder, env({ now: NOW + MAX_RUN_LOCK_AGE_MS + 1 }))).toBe(true);
    expect(isRunLockStale({ ...holder, startedAt: 'garbage' }, env())).toBe(true);
  });

  it('waits on a freshly created unreadable lock, but clears an old one', () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, '');
    expect(acquireRunLock(lockPath, info, env({ now: Date.now() }), 200).acquired).toBe(false);
    expect(acquireRunLock(lockPath, info, env({ now: Date.now() + 60_000 }), 200).acquired).toBe(true);
  });
});
