import * as fs from 'fs';
import * as path from 'path';
import { appSupportDir, logsDir } from '../lib/user-dirs.js';

/**
 * Scheduled ingestion on a Mac: a LaunchDaemon runs `bds schedule run` from a dedicated
 * runner checkout (a git worktree that tracks origin/main), so branch work in the main
 * checkout never changes what the scheduled job runs.
 *
 * `bds schedule install` writes these settings to
 * `~/Library/Application Support/browse-dot-show/schedule.json`.
 */

export const LAUNCHD_LABEL = 'com.browse-dot-show.ingest';
export const LAUNCH_DAEMON_PATH = `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`;

/** When to post a Slack message after a successful run. */
export const NOTIFY_ON_SUCCESS = ['always', 'new-episodes', 'never'] as const;
export type NotifyOnSuccess = (typeof NOTIFY_ON_SUCCESS)[number];

export interface ScheduleConfig {
  version: 1;
  /** The runner checkout: a worktree that `bds schedule run` fast-forwards to origin/main. */
  runnerDir: string;
  /** Daily start time, local time. */
  hour: number;
  minute: number;
  /** The node binary launchd runs (absolute; Homebrew's node@22 on a runner). */
  nodePath: string;
  /** macOS user the job runs as. */
  userName: string;
  notifyOnSuccess: NotifyOnSuccess;
  /** Minutes before the run to wake the Mac (`pmset repeat wakeorpoweron`). */
  wakeMinutesBefore: number;
}

export const DEFAULT_NOTIFY_ON_SUCCESS: NotifyOnSuccess = 'always';

export function scheduleConfigPath(): string {
  return path.join(appSupportDir(), 'schedule.json');
}

export function readScheduleConfig(filePath = scheduleConfigPath()): ScheduleConfig | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeScheduleConfig(config: ScheduleConfig, filePath = scheduleConfigPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
}

/** Where each scheduled run's log, record and pipeline summary go. */
export function scheduledLogsDir(): string {
  return path.join(logsDir(), 'scheduled');
}

/** launchd's own stdout/stderr for the job (crashes before the run log opens). */
export function launchdLogPath(): string {
  return path.join(logsDir(), 'launchd.log');
}
