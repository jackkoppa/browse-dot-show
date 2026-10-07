import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Absolute path to the repository root.
 *
 * Resolved from this file's location rather than `process.cwd()`, so config files load
 * correctly no matter where a script is launched from (e.g. from a Terraform directory, or
 * by launchd, which starts jobs in `/`).
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Resolve a path relative to the repository root. */
export function repoPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}
