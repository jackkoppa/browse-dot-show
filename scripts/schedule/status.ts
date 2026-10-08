import type { RunLockInfo } from '../lib/run-lock.js';
import { describeRunLockHolder } from '../lib/run-lock.js';
import type { ScheduleConfig } from './config.js';
import type { GuardResult } from './guards.js';
import { formatTimeOfDay, nextRunAfter, type LaunchdJobState } from './launchd.js';
import type { Advice } from './mac-settings.js';
import { formatDuration } from './notify.js';
import type { ScheduledRunRecord } from './records.js';

/** Everything `bds schedule status` shows, gathered first so rendering is a pure function. */
export interface StatusFacts {
  now: Date;
  host: string;
  config: ScheduleConfig | null;
  plistInstalled: boolean;
  job: LaunchdJobState;
  repeatingWakes: string[];
  records: ScheduledRunRecord[];
  isAlive: (pid: number) => boolean;
  runLockHolder: RunLockInfo | null;
  runner: { exists: boolean; commit?: string; originMain?: string; dirty?: number } | null;
  localFiles: GuardResult;
  notify: { slack: boolean; healthcheck: boolean };
  macAdvice: Advice[];
}

export interface StatusReport {
  lines: string[];
  warnings: string[];
}

/** A `running` record whose process is gone (crashed or killed) shows as `crashed`. */
export function effectiveOutcome(record: ScheduledRunRecord, host: string, isAlive: (pid: number) => boolean): string {
  if (record.outcome !== 'running') return record.outcome;
  if (record.host === host && !isAlive(record.pid)) return 'crashed';
  return 'running';
}

/** The most recent scheduled start time at or before `now`. */
export function previousRunAtOrBefore(now: Date, hour: number, minute: number): Date {
  const next = nextRunAfter(now, hour, minute);
  const previous = new Date(next);
  previous.setDate(previous.getDate() - 1);
  return previous;
}

/** A scheduled run that should have started (with 15 min grace) but has no record. */
export function missedRun(facts: Pick<StatusFacts, 'now' | 'config' | 'records'>): Date | null {
  const { config, now, records } = facts;
  if (!config) return null;
  const expected = previousRunAtOrBefore(now, config.hour, config.minute);
  if (Date.parse(config.installedAt) > expected.getTime()) return null;
  if (now.getTime() - expected.getTime() < 15 * 60_000) return null;
  const started = records.some(record => record.trigger === 'scheduled' && Date.parse(record.startedAt) >= expected.getTime() - 60_000);
  return started ? null : expected;
}

const OUTCOME_ICONS: Record<string, string> = { success: '✅', failed: '❌', skipped: '⏭️ ', interrupted: '⚠️ ', running: '⏳', crashed: '💥' };

export function renderStatus(facts: StatusFacts): StatusReport {
  const lines: string[] = [];
  const warnings: string[] = [];
  const { config } = facts;

  lines.push('Schedule');
  if (!config && !facts.plistInstalled) {
    lines.push('  Not installed. Run: pnpm bds schedule install --at=03:00');
  } else {
    if (config) {
      const next = nextRunAfter(facts.now, config.hour, config.minute);
      lines.push(`  Daily at ${formatTimeOfDay(config.hour, config.minute)} as ${config.userName}; next run ${next.toLocaleString()}`);
      lines.push(`  Runner checkout: ${config.runnerDir}, following origin/${config.branch ?? 'main'}`);
      if ((config.branch ?? 'main') !== 'main') warnings.push(`The runner follows origin/${config.branch}, not main; re-run \`bds schedule install --track=main\` once testing is done.`);
      lines.push(`  Node: ${config.nodePath}`);
      lines.push(`  Success notifications: ${config.notifyOnSuccess}`);
    } else {
      warnings.push('The LaunchDaemon is installed but schedule.json is missing; re-run `bds schedule install`.');
    }
    if (!facts.plistInstalled) warnings.push('schedule.json exists but the LaunchDaemon isn\'t installed; re-run `bds schedule install`.');
    if (facts.plistInstalled && !facts.job.loaded) warnings.push('The LaunchDaemon file exists but isn\'t loaded; re-run `bds schedule install`.');
    if (facts.job.loaded) {
      lines.push(`  launchd: ${facts.job.state ?? 'loaded'}${facts.job.runs !== undefined ? `, ${facts.job.runs} run(s) since loaded` : ''}${facts.job.lastExitCode ? `, last exit: ${facts.job.lastExitCode}` : ''}`);
    }
    if (config?.nodePath.includes('/.nvm/')) {
      warnings.push(`Scheduled runs use nvm's node (${config.nodePath}); it breaks when that version is removed. Homebrew's node@22 is steadier: re-run install with --node=$(brew --prefix node@22)/bin/node.`);
    }
  }

  lines.push('', 'Wake schedule (pmset)');
  lines.push(...(facts.repeatingWakes.length ? facts.repeatingWakes.map(event => `  ${event}`) : ['  none']));
  if (config?.wakeMinutesBefore != null && facts.repeatingWakes.length === 0) {
    warnings.push('No repeating wake is scheduled; a sleeping Mac starts the run only when something else wakes it. Re-run `bds schedule install`.');
  }

  if (facts.runner) {
    lines.push('', 'Runner checkout');
    if (!facts.runner.exists) {
      warnings.push(`The runner checkout is missing (${config?.runnerDir}); re-run \`bds schedule install\`.`);
      lines.push('  missing');
    } else {
      const behind = facts.runner.originMain && facts.runner.commit !== facts.runner.originMain;
      lines.push(`  at ${facts.runner.commit?.slice(0, 7) ?? '?'}${behind ? ` (origin/${config?.branch ?? 'main'} was ${facts.runner.originMain!.slice(0, 7)} at the last fetch; the next run updates it)` : ''}`);
      if (facts.runner.dirty) warnings.push(`The runner checkout has ${facts.runner.dirty} uncommitted change(s); scheduled runs won't update it until it's clean.`);
    }
  }

  lines.push('', 'Recent runs (newest first)');
  if (facts.records.length === 0) lines.push('  none yet');
  for (const record of facts.records) {
    const outcome = effectiveOutcome(record, facts.host, facts.isAlive);
    const totals = record.pipeline?.totals;
    const counts = totals ? `, ${totals.transcribed} transcribed, ${totals.filesUploaded} uploaded${totals.errors ? `, ${totals.errors} error(s)` : ''}` : '';
    lines.push(`  ${OUTCOME_ICONS[outcome] ?? '•'} ${new Date(record.startedAt).toLocaleString()}  ${outcome} (${record.trigger}${record.dryRun ? ', dry run' : ''}, ${formatDuration(record.durationMs)}${counts})`);
    if (record.reason && outcome !== 'success') lines.push(`      ${record.reason}`);
    if (outcome === 'crashed') lines.push(`      The process (pid ${record.pid}) is gone without finishing; see ${record.logPath} and the launchd log`);
  }
  const lastScheduled = facts.records.find(record => record.trigger === 'scheduled');
  if (lastScheduled && ['failed', 'crashed', 'interrupted'].includes(effectiveOutcome(lastScheduled, facts.host, facts.isAlive))) {
    warnings.push(`The last scheduled run ${effectiveOutcome(lastScheduled, facts.host, facts.isAlive)}: ${lastScheduled.logPath}`);
  }
  const missed = missedRun(facts);
  if (missed) warnings.push(`No scheduled run started at ${missed.toLocaleString()} (was the Mac off, asleep without a wake, or stuck at the FileVault login?)`);

  if (facts.runLockHolder) lines.push('', `Ingestion running now: ${describeRunLockHolder(facts.runLockHolder)}`);

  lines.push('', 'Checks');
  lines.push(`  ${facts.localFiles.ok ? '✅' : '❌'} ${facts.localFiles.label}: ${facts.localFiles.detail}`);
  if (!facts.localFiles.ok) warnings.push(`Local files: ${facts.localFiles.detail}`);
  lines.push(`  ${facts.notify.slack ? '✅' : '⚠️ '} Slack: ${facts.notify.slack ? 'SLACK_WEBHOOK_URL set' : 'SLACK_WEBHOOK_URL not set in .env.automation'}`);
  lines.push(`  ${facts.notify.healthcheck ? '✅' : '⚠️ '} Healthcheck: ${facts.notify.healthcheck ? 'HEALTHCHECK_PING_URL set' : 'HEALTHCHECK_PING_URL not set in .env.automation (nothing alerts on a missed run)'}`);
  for (const advice of facts.macAdvice) {
    const text = `${advice.message}${advice.fix ? ` Fix: ${advice.fix}` : ''}`;
    if (advice.level === 'warn') warnings.push(text);
    else lines.push(`  ℹ️  ${text}`);
  }

  return { lines, warnings };
}
