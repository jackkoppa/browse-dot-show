import * as fs from 'fs';
import * as path from 'path';
import { getLocalFilesBasePath } from '@browse-dot-show/config';
import { repoPath } from './paths.js';

/**
 * Per-machine settings for scripts, stored as optional keys in the gitignored
 * `.local-files-config.json` (which also holds `localFilesPath`, used by packages/config).
 *
 *   { "localFilesPath": "...", "transcriptionWorkers": 3 }
 */

/** Used when neither `--parallel` nor `transcriptionWorkers` is set. 3 was fastest per worker added on an M4 Pro (benchmark: scratchpad/scripts-overhaul/M5-mac-automation.md). */
export const DEFAULT_TRANSCRIPTION_WORKERS = 3;

interface MachineConfig {
  localFilesPath?: string;
  transcriptionWorkers?: number;
}

function readMachineConfig(): MachineConfig {
  try {
    return JSON.parse(fs.readFileSync(repoPath('.local-files-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The local files folder for scripts: `localFilesPath` as configured, even when it doesn't
 * exist. packages/config falls back to the repo's `aws-local-dev` when the configured
 * folder is missing (e.g. the SSD isn't mounted); a run there would download every site
 * from S3 into the repo, so scripts check this path instead and stop.
 */
export function localFilesBase(config: MachineConfig = readMachineConfig()): string {
  return config.localFilesPath ? path.resolve(repoPath(), config.localFilesPath) : getLocalFilesBasePath();
}

/** Default number of parallel transcription workers on this machine. */
export function getDefaultTranscriptionWorkers(): number {
  const configured = readMachineConfig().transcriptionWorkers;
  return Number.isInteger(configured) && configured! > 0 ? configured! : DEFAULT_TRANSCRIPTION_WORKERS;
}

/** Merge keys into `.local-files-config.json`, keeping the others. */
export function updateMachineConfig(patch: Record<string, unknown>): void {
  const filePath = repoPath('.local-files-config.json');
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    // missing or unreadable: start fresh
  }
  fs.writeFileSync(filePath, JSON.stringify({ ...current, ...patch }, null, 2) + '\n');
}
