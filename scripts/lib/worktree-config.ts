import fs from 'fs';
import path from 'path';
import { execCommandOrThrow } from './shell-exec.js';

/**
 * Gitignored config a new worktree needs to run `bds` like the main checkout: env files
 * (`.env.*`, sites' `.env.aws-sso`), local files config, Terraform tfvars
 * and custom spelling corrections. Matched by file name, at any depth.
 */
const CONFIG_FILE_NAMES = new Set([
  '.local-files-config.json',
  '_custom-spelling-corrections.json',
]);

export function isWorktreeConfigFile(relativePath: string): boolean {
  if (relativePath.endsWith('/')) return false; // an ignored directory
  if (relativePath.split('/').some(segment => segment === 'node_modules' || segment === '.terraform')) return false;
  const name = path.basename(relativePath);
  return CONFIG_FILE_NAMES.has(name) || name.startsWith('.env') || name.endsWith('.tfvars');
}

/** The main checkout's path (the first entry of `git worktree list`). */
export async function mainWorktreePath(cwd: string): Promise<string> {
  const { stdout } = await execCommandOrThrow('git', ['worktree', 'list', '--porcelain'], { cwd });
  const firstLine = stdout.split('\n').find(line => line.startsWith('worktree '));
  if (!firstLine) throw new Error('Could not find the main worktree');
  return firstLine.slice('worktree '.length);
}

/** Gitignored config files in `sourceRoot`, as repo-relative paths. */
export async function listWorktreeConfigFiles(sourceRoot: string): Promise<string[]> {
  // --directory collapses ignored directories (node_modules, dist, ...) into one entry each
  const { stdout } = await execCommandOrThrow(
    'git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
    { cwd: sourceRoot },
  );
  return stdout.split('\n').filter(line => line && isWorktreeConfigFile(line));
}

export interface LinkResult {
  linked: string[];
  /** Already present in the target (a file or a symlink); left untouched. */
  skipped: string[];
}

/** Symlink each of the source checkout's gitignored config files into `targetRoot`. */
export async function linkWorktreeConfig(sourceRoot: string, targetRoot: string): Promise<LinkResult> {
  const result: LinkResult = { linked: [], skipped: [] };
  for (const relativePath of await listWorktreeConfigFiles(sourceRoot)) {
    const target = path.join(targetRoot, relativePath);
    if (fs.existsSync(target) || isSymlink(target)) {
      result.skipped.push(relativePath);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.join(sourceRoot, relativePath), target);
    result.linked.push(relativePath);
  }
  return result;
}

function isSymlink(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}
