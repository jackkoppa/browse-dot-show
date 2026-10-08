import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anonymousFetchUrl, currentCommit, updateRunnerCheckout } from './runner-checkout.js';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

describe('updateRunnerCheckout', () => {
  let tmp: string;
  let origin: string;
  let dev: string;
  let runner: string;
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);

  const commitOnOrigin = (file: string) => {
    fs.writeFileSync(path.join(dev, file), file);
    git(dev, 'add', file);
    git(dev, 'commit', '-q', '-m', file);
    git(dev, 'push', '-q', 'origin', 'HEAD:main');
    return git(dev, 'rev-parse', 'HEAD');
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-runner-'));
    origin = path.join(tmp, 'origin.git');
    dev = path.join(tmp, 'dev');
    runner = path.join(tmp, 'runner');
    git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
    git(tmp, 'clone', '-q', origin, dev);
    commitOnOrigin('a');
    git(dev, 'worktree', 'add', '-q', '--detach', runner, 'origin/main');
    logs.length = 0;
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('does nothing when already at origin/main', async () => {
    let installs = 0;
    const result = await updateRunnerCheckout(runner, log, { install: async () => void installs++ });
    expect(result.changed).toBe(false);
    expect(installs).toBe(0);
  });

  it('fast-forwards to origin/main and installs', async () => {
    const before = await currentCommit(runner);
    const head = commitOnOrigin('b');
    const installedAt: string[] = [];
    const result = await updateRunnerCheckout(runner, log, { install: async cwd => void installedAt.push(await currentCommit(cwd)) });
    expect(result).toEqual({ from: before, to: head, changed: true });
    expect(installedAt).toEqual([head]);
    expect(fs.existsSync(path.join(runner, 'b'))).toBe(true);
  });

  it('goes back to the previous commit when install fails', async () => {
    const before = await currentCommit(runner);
    commitOnOrigin('b');
    const failOnNew = async (cwd: string) => {
      if ((await currentCommit(cwd)) !== before) throw new Error('pnpm install failed');
    };
    await expect(updateRunnerCheckout(runner, log, { install: failOnNew })).rejects.toThrow('pnpm install failed');
    expect(await currentCommit(runner)).toBe(before);
  });

  it('finishes an interrupted update on the next run', async () => {
    const head = commitOnOrigin('b');
    await expect(updateRunnerCheckout(runner, log, { install: async () => { throw new Error('killed mid-install'); } })).rejects.toThrow();
    // Simulate a run stopped before the rollback: at the new commit, marker still there
    git(runner, 'checkout', '-q', '--detach', head);
    const gitDir = git(runner, 'rev-parse', '--absolute-git-dir');
    fs.writeFileSync(path.join(gitDir, 'bds-update-in-progress'), '');
    let installs = 0;
    const result = await updateRunnerCheckout(runner, log, { install: async () => void installs++ });
    expect(result).toMatchObject({ from: head, to: head, changed: true });
    expect(installs).toBe(1);
    expect(fs.existsSync(path.join(gitDir, 'bds-update-in-progress'))).toBe(false);
    expect((await updateRunnerCheckout(runner, log, { install: async () => void installs++ })).changed).toBe(false);
  });

  it('refuses when the checkout has uncommitted changes', async () => {
    fs.writeFileSync(path.join(runner, 'a'), 'edited');
    await expect(updateRunnerCheckout(runner, log, { install: async () => {} })).rejects.toThrow('uncommitted changes');
  });
});

describe('anonymousFetchUrl', () => {
  it('fetches SSH remotes over HTTPS, and leaves others alone', () => {
    expect(anonymousFetchUrl('git@github.com:jackkoppa/browse-dot-show.git')).toBe('https://github.com/jackkoppa/browse-dot-show.git');
    expect(anonymousFetchUrl('ssh://git@github.com/jackkoppa/browse-dot-show')).toBe('https://github.com/jackkoppa/browse-dot-show.git');
    expect(anonymousFetchUrl('https://github.com/jackkoppa/browse-dot-show.git')).toBe('https://github.com/jackkoppa/browse-dot-show.git');
    expect(anonymousFetchUrl('/tmp/origin.git')).toBe('/tmp/origin.git');
  });
});
