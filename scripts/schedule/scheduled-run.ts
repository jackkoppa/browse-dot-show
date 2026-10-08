import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getLocalFilesBasePath } from '@browse-dot-show/config';
import { readRunSummary } from '../ingestion/run-summary.js';
import { tsxCommand, LAMBDA_NODE_OPTIONS } from '../lib/lambda.js';
import { REPO_ROOT, repoPath } from '../lib/paths.js';
import { currentRunLockHolder, describeRunLockHolder, EXIT_RUN_LOCKED, runLockPath } from '../lib/run-lock.js';
import { onShutdown } from '../lib/shutdown.js';
import { logsDir } from '../lib/user-dirs.js';
import { DEFAULT_NOTIFY_ON_SUCCESS, readScheduleConfig, scheduledLogsDir, type NotifyOnSuccess } from './config.js';
import { checkFreeDisk, checkLocalFiles, checkPower, waitForNetwork, type GuardResult } from './guards.js';
import { formatRunMessage, healthcheckKind, loadNotifyTargets, pingHealthcheck, postToSlack, shouldPostToSlack } from './notify.js';
import {
  newRunId,
  pipelineSummaryPath,
  pruneOldest,
  rotateRunFiles,
  runLogPath,
  writeRecord,
  type ScheduledRunRecord,
} from './records.js';
import { currentCommit, updateRunnerCheckout } from './runner-checkout.js';

/**
 * One scheduled run (`bds schedule run`, what launchd starts):
 *
 * 1. Keep the Mac awake (`caffeinate`) and ping the healthcheck's /start
 * 2. Guard rails: local files mounted and readable, free disk, power, network. A failed
 *    check skips the run.
 * 3. Skip if another ingestion run holds the run lock
 * 4. In the runner checkout: fast-forward to origin/main (+ install and build if changed)
 * 5. `bds ingest --all-sites` as a child process (so it runs the updated code)
 * 6. Write the run record, notify (Slack, healthcheck), rotate old logs
 *
 * Everything is written to a per-run log in ~/Library/Logs/browse-dot-show/scheduled/.
 */

/** Runs (and transcription log folders) to keep. */
export const RUNS_TO_KEEP = 60;

export interface ScheduledRunOptions {
  /** `scheduled` (launchd) or `run-now`. */
  trigger: string;
  /** Update the checkout first. Only ever happens in the configured runner checkout. */
  update: boolean;
  dryRun: boolean;
  parallel?: number;
  /** Also print to stdout (a terminal), not only to the run log. */
  echo: boolean;
  /** Override schedule.json's notifyOnSuccess (e.g. to test notifications). */
  notifyOnSuccess?: NotifyOnSuccess;
}

export async function runScheduled(options: ScheduledRunOptions): Promise<number> {
  const dir = scheduledLogsDir();
  fs.mkdirSync(dir, { recursive: true });
  const id = newRunId();
  const logFile = runLogPath(dir, id);
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const write = (text: string) => {
    if (!logStream.writableEnded) logStream.write(text);
    if (options.echo) process.stdout.write(text);
  };
  const log = (message: string) => write(`${message}\n`);

  const config = readScheduleConfig();
  const targets = loadNotifyTargets();
  const record: ScheduledRunRecord = {
    version: 1,
    id,
    trigger: options.trigger,
    host: os.hostname(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    outcome: 'running',
    dryRun: options.dryRun,
    logPath: logFile,
  };
  writeRecord(dir, record);

  log(`🤖 Scheduled ingestion run ${id} (${options.trigger}${options.dryRun ? ', dry run' : ''})`);
  log(`   Checkout: ${REPO_ROOT}`);
  log(`   Node: ${process.execPath} (${process.version})`);
  log(`   Log: ${logFile}`);

  const caffeinate = keepAwake(log);
  await pingHealthcheck(targets, 'start', `${options.trigger} run ${id} on ${record.host}`, log);

  let child: ChildProcess | null = null;
  let interrupted = false;
  const interruption = { outcome: 'interrupted', reason: 'Stopped by a signal (launchctl bootout/kill, or Ctrl+C)' } as const;
  const unregister = onShutdown(async () => {
    interrupted = true;
    log('⚠️  Stopping (received a signal)…');
    // Record it right away: the shutdown has a time limit, and stopping whisper takes a while
    if (!finishing) writeRecord(dir, { ...record, ...interruption });
    if (child && child.exitCode === null) {
      await new Promise<void>(resolve => {
        child!.once('close', () => resolve());
        child!.kill('SIGTERM');
      });
    }
    await finish(interruption);
  });

  // The first call wins; later calls (e.g. the signal handler and the main flow) wait for it
  let finishing: Promise<void> | null = null;
  const finish = (result: Partial<ScheduledRunRecord> & Pick<ScheduledRunRecord, 'outcome'>): Promise<void> => {
    finishing ??= finishRun(result);
    return finishing;
  };
  const finishRun = async (result: Partial<ScheduledRunRecord> & Pick<ScheduledRunRecord, 'outcome'>): Promise<void> => {
    const endedAt = new Date();
    Object.assign(record, result, { endedAt: endedAt.toISOString(), durationMs: endedAt.getTime() - Date.parse(record.startedAt) });
    const summary = readRunSummary(pipelineSummaryPath(dir, id));
    if (summary) record.pipeline = summary;
    writeRecord(dir, record);

    const message = formatRunMessage(record);
    log(`\n${message}`);
    const notifyOnSuccess = options.notifyOnSuccess ?? config?.notifyOnSuccess ?? DEFAULT_NOTIFY_ON_SUCCESS;
    if (shouldPostToSlack(record, notifyOnSuccess)) await postToSlack(targets, message, log);
    await pingHealthcheck(targets, healthcheckKind(record), message, log);

    rotateRunFiles(dir, RUNS_TO_KEEP);
    pruneOldest(path.join(logsDir(), 'transcription'), RUNS_TO_KEEP);
    caffeinate?.kill();
    await new Promise<void>(resolve => logStream.end(resolve));
  };

  try {
    // Guard rails
    log('\n🔎 Checks');
    const base = getLocalFilesBasePath();
    const guards: GuardResult[] = [checkLocalFiles(base)];
    if (guards[0].ok) guards.push(checkFreeDisk(base));
    guards.push(await checkPower());
    guards.push(await waitForNetwork({}, (attempt, error) => log(`   … network not reachable yet (attempt ${attempt}: ${error}); retrying`)));
    for (const guard of guards) log(`   ${guard.ok ? '✅' : '❌'} ${guard.label}: ${guard.detail}`);
    const failed = guards.filter(guard => !guard.ok);
    if (failed.length > 0) {
      await finish({ outcome: 'skipped', reason: `Skipped: ${failed.map(guard => `${guard.label}: ${guard.detail}`).join('; ')}` });
      return 0;
    }

    // Another run (e.g. a manual one) in progress
    const holder = options.dryRun ? null : currentRunLockHolder(runLockPath(base));
    if (holder) {
      await finish({ outcome: 'skipped', alreadyRunning: true, reason: `Skipped: another run is in progress (${describeRunLockHolder(holder)})` });
      return 0;
    }

    // Update the runner checkout
    const isRunner = config !== null && path.resolve(config.runnerDir) === REPO_ROOT;
    record.commit = await currentCommit(REPO_ROOT).catch(() => undefined);
    if (options.update && isRunner) {
      log('\n🔄 Updating the runner checkout');
      try {
        const update = await updateRunnerCheckout(REPO_ROOT, log);
        record.commit = update.to;
        if (update.changed) record.updatedFrom = update.from;
      } catch (error) {
        await finish({ outcome: 'failed', reason: `Updating the runner checkout failed: ${(error as Error).message}` });
        return 1;
      }
    } else if (options.update) {
      log(`\nℹ️  Not updating: ${REPO_ROOT} isn't the runner checkout${config ? ` (${config.runnerDir})` : ' (no schedule installed)'}`);
    }
    writeRecord(dir, record);

    // Ingest
    const args = ['ingest', '--all-sites', `--summary-json=${pipelineSummaryPath(dir, id)}`];
    if (options.parallel) args.push(`--parallel=${options.parallel}`);
    if (options.dryRun) args.push('--dry-run');
    log(`\n▶️  bds ${args.join(' ')}\n`);
    const { command, prefixArgs } = tsxCommand();
    const exitCode = await new Promise<number>(resolve => {
      child = spawn(command, [...prefixArgs, repoPath('scripts/cli/index.ts'), ...args], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          BDS_RUN_TRIGGER: options.trigger,
          NODE_OPTIONS: [process.env.NODE_OPTIONS, LAMBDA_NODE_OPTIONS].filter(Boolean).join(' '),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout!.on('data', (data: Buffer) => write(data.toString()));
      child.stderr!.on('data', (data: Buffer) => write(data.toString()));
      child.on('error', error => {
        log(`❌ Couldn't start bds ingest: ${error.message}`);
        resolve(1);
      });
      child.on('close', code => resolve(code ?? 1));
    });
    if (interrupted) {
      await finish(interruption);
      return 130;
    }

    record.ingestExitCode = exitCode;
    if (exitCode === 0) {
      await finish({ outcome: 'success' });
    } else if (exitCode === EXIT_RUN_LOCKED) {
      await finish({ outcome: 'skipped', alreadyRunning: true, reason: 'Skipped: another run started first' });
    } else {
      await finish({ outcome: 'failed', reason: `bds ingest exited with code ${exitCode}` });
    }
    return exitCode === EXIT_RUN_LOCKED ? 0 : exitCode;
  } catch (error) {
    await finish({ outcome: 'failed', reason: `Scheduled run crashed: ${error instanceof Error ? error.message : String(error)}` });
    return 1;
  } finally {
    unregister();
  }
}

/** Hold a power assertion (no idle/system sleep) until this process exits. */
function keepAwake(log: (message: string) => void): ChildProcess | null {
  if (process.platform !== 'darwin') return null;
  const caffeinate = spawn('/usr/bin/caffeinate', ['-i', '-s', '-m', '-w', String(process.pid)], { stdio: 'ignore' });
  caffeinate.on('error', error => log(`⚠️  caffeinate failed: ${error.message}`));
  return caffeinate;
}
