import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalFileLocks, type LockContents } from './local-file-locks.js';

const FILE = 'audio/pod/2026-01-01_episode.mp3';
let lockDir: string;

beforeEach(() => {
  lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-file-locks-'));
});

function writeForeignLock(locks: LocalFileLocks, overrides: Partial<LockContents>): void {
  const contents: LockContents = { fileKey: FILE, processId: 'other', pid: process.pid, timestamp: Date.now(), ...overrides };
  fs.writeFileSync(locks.lockPathFor(FILE), JSON.stringify(contents));
}

describe('LocalFileLocks', () => {
  it('lets only one process claim a file', () => {
    const a = new LocalFileLocks(lockDir, 'a');
    const b = new LocalFileLocks(lockDir, 'b');
    expect(a.acquire(FILE)).toBe(true);
    expect(b.acquire(FILE)).toBe(false);
    expect(b.isLockedByOther(FILE)).toBe(true);
    expect(a.isLockedByOther(FILE)).toBe(false);

    a.release(FILE);
    expect(b.acquire(FILE)).toBe(true);
  });

  it('never removes a lock held by another process on release', () => {
    const a = new LocalFileLocks(lockDir, 'a');
    const b = new LocalFileLocks(lockDir, 'b');
    a.acquire(FILE);
    b.release(FILE);
    expect(fs.existsSync(a.lockPathFor(FILE))).toBe(true);
  });

  it('takes over a lock whose process has exited', () => {
    const locks = new LocalFileLocks(lockDir, 'me');
    writeForeignLock(locks, { pid: 2 ** 22 + 12345 }); // no such pid
    expect(locks.isLockedByOther(FILE)).toBe(false);
    expect(locks.acquire(FILE)).toBe(true);
  });

  it('takes over a lock older than the stale threshold', () => {
    const locks = new LocalFileLocks(lockDir, 'me', 1000);
    writeForeignLock(locks, { timestamp: Date.now() - 5000 });
    expect(locks.acquire(FILE)).toBe(true);
  });

  it('releaseAll and cleanupStale remove the right locks', () => {
    const locks = new LocalFileLocks(lockDir, 'me');
    locks.acquire('audio/pod/one.mp3');
    locks.acquire('audio/pod/two.mp3');
    writeForeignLock(locks, { pid: 2 ** 22 + 12345 });
    expect(locks.cleanupStale()).toBe(1);

    locks.releaseAll();
    expect(fs.readdirSync(lockDir)).toEqual([]);
  });
});
