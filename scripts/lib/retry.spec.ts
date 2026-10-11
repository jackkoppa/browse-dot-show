import { describe, it, expect } from 'vitest';
import { withRetries } from './retry.js';
import { execCommand } from './shell-exec.js';

describe('withRetries', () => {
  const noSleep = async () => {};

  it('returns the first success without retrying', async () => {
    const attempts: number[] = [];
    const result = await withRetries(async attempt => { attempts.push(attempt); return 'ok'; }, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(attempts).toEqual([1]);
  });

  it('retries after each delay until a call succeeds', async () => {
    const slept: number[] = [];
    const retried: number[] = [];
    const result = await withRetries(
      async attempt => {
        if (attempt < 3) throw new Error(`fail ${attempt}`);
        return attempt;
      },
      { delaysMs: [5, 50], sleep: async ms => { slept.push(ms); }, onRetry: (_error, attempt) => retried.push(attempt) }
    );
    expect(result).toBe(3);
    expect(slept).toEqual([5, 50]);
    expect(retried).toEqual([1, 2]);
  });

  it('rethrows the last error once the delays run out', async () => {
    let calls = 0;
    await expect(
      withRetries(async attempt => { calls++; throw new Error(`fail ${attempt}`); }, { delaysMs: [1], sleep: noSleep })
    ).rejects.toThrow('fail 2');
    expect(calls).toBe(2);
  });
});

describe('execCommand', () => {
  it('says when a command timed out', async () => {
    const result = await execCommand('sleep', ['5'], { silent: true, timeout: 200 });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBe('Timed out after 0.2 s: sleep 5');
  });

  it('keeps stderr for a command that failed on its own', async () => {
    const result = await execCommand('ls', ['/no-such-dir-for-bds-tests'], { silent: true });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No such file');
  });
});
