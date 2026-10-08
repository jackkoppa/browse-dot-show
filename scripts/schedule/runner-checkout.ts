import { execFile, spawn } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * The runner checkout: a git worktree, detached at origin/main, that scheduled runs use.
 * Before each run it's fast-forwarded to origin/main, and when that changed anything,
 * dependencies are installed and packages rebuilt.
 */

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

export async function currentCommit(cwd: string): Promise<string> {
  return git(cwd, ['rev-parse', 'HEAD']);
}

/** Tracked or untracked (not ignored) changes; gitignored config files don't count. */
export async function uncommittedChanges(cwd: string): Promise<string[]> {
  const status = await git(cwd, ['status', '--porcelain']);
  return status.split('\n').filter(Boolean);
}

export interface UpdateResult {
  from: string;
  to: string;
  changed: boolean;
}

type Log = (message: string) => void;

/** Run a command, streaming its output to `log`; throws on a non-zero exit. */
export function runLogged(command: string, args: string[], cwd: string, log: Log, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    log(`$ ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const forward = (data: Buffer) => data.toString().split('\n').filter(Boolean).forEach(line => log(`  ${line}`));
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${path.basename(command)} ${args.join(' ')} exited with ${code}`))));
  });
}

/**
 * Fast-forward `runnerDir` to origin/main (detached), then `pnpm install` and build if
 * anything changed. Refuses if the checkout has uncommitted changes.
 */
export async function updateRunnerCheckout(
  runnerDir: string,
  log: Log,
  { branch = 'main', install = installAndBuild }: { branch?: string; install?: (cwd: string, log: Log) => Promise<void> } = {},
): Promise<UpdateResult> {
  const dirty = await uncommittedChanges(runnerDir);
  if (dirty.length > 0) {
    throw new Error(`the runner checkout has uncommitted changes (${dirty.slice(0, 3).join('; ')}${dirty.length > 3 ? '; …' : ''}); clean it up or recreate it with \`bds schedule install\``);
  }

  const from = await currentCommit(runnerDir);
  await git(runnerDir, ['fetch', '--quiet', 'origin', branch]);
  const to = await git(runnerDir, ['rev-parse', `origin/${branch}`]);
  if (from === to) {
    log(`✅ Runner checkout is up to date (${to.slice(0, 7)})`);
    return { from, to, changed: false };
  }

  log(`🔄 Updating the runner checkout: ${from.slice(0, 7)} → ${to.slice(0, 7)}`);
  await git(runnerDir, ['checkout', '--quiet', '--detach', to]);
  try {
    await install(runnerDir, log);
  } catch (error) {
    // Go back to the commit that worked, so tonight's failure doesn't break tomorrow's run
    log(`❌ Update failed; going back to ${from.slice(0, 7)}`);
    await git(runnerDir, ['checkout', '--quiet', '--detach', from]);
    await install(runnerDir, log).catch(rollbackError => log(`❌ Restoring ${from.slice(0, 7)} failed too: ${rollbackError.message}`));
    throw error;
  }
  return { from, to, changed: true };
}

export async function installAndBuild(cwd: string, log: Log): Promise<void> {
  await runLogged('pnpm', ['install', '--frozen-lockfile'], cwd, log);
  await runLogged('pnpm', ['all:build'], cwd, log);
}
