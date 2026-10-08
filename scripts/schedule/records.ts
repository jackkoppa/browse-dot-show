import * as fs from 'fs';
import * as path from 'path';
import type { PipelineRunSummary } from '../ingestion/run-summary.js';

/**
 * One JSON record per scheduled run, next to its log, in `scheduledLogsDir()`:
 *
 *   2026-10-08T03-00-00-000Z.json   this record
 *   2026-10-08T03-00-00-000Z.log    everything the run printed
 *   2026-10-08T03-00-00-000Z.summary.json   the pipeline's summary (`bds ingest --summary-json`)
 *
 * The record is written when the run starts (`running`) and rewritten when it ends, so a
 * run that crashed or was killed shows up as `running` with a dead pid.
 */

export type RunOutcome = 'running' | 'success' | 'failed' | 'skipped' | 'interrupted';

export interface ScheduledRunRecord {
  version: 1;
  id: string;
  /** `scheduled` (launchd) or `run-now`. */
  trigger: string;
  host: string;
  pid: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome: RunOutcome;
  /** Why it was skipped or failed. */
  reason?: string;
  /** `bds ingest`'s exit code. */
  ingestExitCode?: number;
  /** Skipped because another ingestion run (e.g. a manual one) held the run lock. */
  alreadyRunning?: boolean;
  dryRun: boolean;
  /** The runner checkout's commit for this run, and the one before an update. */
  commit?: string;
  updatedFrom?: string;
  logPath: string;
  pipeline?: PipelineRunSummary;
}

export function newRunId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export const recordPath = (dir: string, id: string) => path.join(dir, `${id}.json`);
export const runLogPath = (dir: string, id: string) => path.join(dir, `${id}.log`);
export const pipelineSummaryPath = (dir: string, id: string) => path.join(dir, `${id}.summary.json`);

export function writeRecord(dir: string, record: ScheduledRunRecord): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = recordPath(dir, record.id);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(record, null, 2) + '\n');
  fs.renameSync(`${target}.tmp`, target);
}

/** Records, newest first. */
export function listRecords(dir: string, limit = Infinity): ScheduledRunRecord[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const records: ScheduledRunRecord[] = [];
  for (const name of names.filter(isRecordFile).sort().reverse()) {
    if (records.length >= limit) break;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (record?.version === 1) records.push(record);
    } catch {
      // skip unreadable records
    }
  }
  return records;
}

const isRecordFile = (name: string) => name.endsWith('.json') && !name.endsWith('.summary.json');

/** Keep the newest `keep` runs' files in `dir` (record, log, summary). Returns how many runs were removed. */
export function rotateRunFiles(dir: string, keep: number): number {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const ids = [...new Set(names.map(runIdOf).filter((id): id is string => id !== null))].sort().reverse();
  const removed = ids.slice(keep);
  for (const name of names) {
    const id = runIdOf(name);
    if (id && removed.includes(id)) fs.rmSync(path.join(dir, name), { force: true });
  }
  return removed.length;
}

/** Keep the newest `keep` entries (by name, which starts with a timestamp) of `dir`. */
export function pruneOldest(dir: string, keep: number): number {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort().reverse();
  } catch {
    return 0;
  }
  const removed = names.slice(keep);
  for (const name of removed) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  return removed.length;
}

function runIdOf(name: string): string | null {
  const match = name.match(/^(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.(json|log|summary\.json|json\.tmp)$/);
  return match ? match[1] : null;
}
