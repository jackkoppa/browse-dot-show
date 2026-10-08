import * as fs from 'fs';
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
  transcriptionWorkers?: number;
}

function readMachineConfig(): MachineConfig {
  try {
    return JSON.parse(fs.readFileSync(repoPath('.local-files-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Default number of parallel transcription workers on this machine. */
export function getDefaultTranscriptionWorkers(): number {
  const configured = readMachineConfig().transcriptionWorkers;
  return Number.isInteger(configured) && configured! > 0 ? configured! : DEFAULT_TRANSCRIPTION_WORKERS;
}
