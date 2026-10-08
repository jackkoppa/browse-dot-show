import { loadEnvFile } from '../lib/env.js';
import { repoPath } from '../lib/paths.js';
import type { NotifyOnSuccess } from './config.js';
import type { ScheduledRunRecord } from './records.js';

/**
 * Notifications for scheduled runs. Both are optional, configured in `.env.automation`:
 *
 * - `SLACK_WEBHOOK_URL`: a Slack incoming webhook. Failures and skips always post; successes
 *   per `notifyOnSuccess` in schedule.json.
 * - `HEALTHCHECK_PING_URL`: a healthchecks.io check (or anything compatible). Pinged at the
 *   start (`/start`), on success, and on failure or skip (`/fail`), so the check alerts when
 *   a run fails, and when no run happens at all (the Mac is off, asleep, or stuck at boot).
 *
 * Notifications never throw: a failed POST is logged and the run carries on.
 */

export interface NotifyTargets {
  slackWebhookUrl?: string;
  healthcheckPingUrl?: string;
}

export function loadNotifyTargets(): NotifyTargets {
  const vars = loadEnvFile(repoPath('.env.automation'));
  return {
    slackWebhookUrl: vars.SLACK_WEBHOOK_URL || undefined,
    healthcheckPingUrl: vars.HEALTHCHECK_PING_URL?.replace(/\/+$/, '') || undefined,
  };
}

type Log = (message: string) => void;

async function post(url: string, body: string, contentType: string, log: Log, what: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      log(`⚠️  ${what} returned HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    log(`⚠️  ${what} failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export function pingHealthcheck(targets: NotifyTargets, kind: 'start' | 'success' | 'fail', body: string, log: Log): Promise<boolean> {
  if (!targets.healthcheckPingUrl) return Promise.resolve(false);
  const url = kind === 'success' ? targets.healthcheckPingUrl : `${targets.healthcheckPingUrl}/${kind}`;
  // healthchecks.io keeps up to 100 kB of the body; keep it short anyway
  return post(url, body.slice(0, 10_000), 'text/plain; charset=utf-8', log, `Healthcheck ping (${kind})`);
}

export function postToSlack(targets: NotifyTargets, text: string, log: Log): Promise<boolean> {
  if (!targets.slackWebhookUrl) return Promise.resolve(false);
  return post(targets.slackWebhookUrl, JSON.stringify({ text }), 'application/json', log, 'Slack webhook');
}

/** Whether a finished run should post to Slack. */
export function shouldPostToSlack(record: ScheduledRunRecord, notifyOnSuccess: NotifyOnSuccess): boolean {
  if (record.outcome !== 'success') return true;
  if (notifyOnSuccess === 'always') return true;
  if (notifyOnSuccess === 'never') return false;
  return (record.pipeline?.totals.transcribed ?? 0) > 0;
}

/** Which healthcheck ping a finished run sends. */
export function healthcheckKind(record: ScheduledRunRecord): 'success' | 'fail' {
  // Another run already ingesting counts as success: ingestion is happening
  if (record.outcome === 'success') return 'success';
  if (record.outcome === 'skipped' && record.alreadyRunning) return 'success';
  return 'fail';
}

const OUTCOME_ICONS: Record<ScheduledRunRecord['outcome'], string> = {
  running: '⏳',
  success: '✅',
  failed: '❌',
  skipped: '⏭️',
  interrupted: '⚠️',
};

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '?';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)} s`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** A short message for Slack and the healthcheck body. */
export function formatRunMessage(record: ScheduledRunRecord, { maxErrors = 5 } = {}): string {
  const lines: string[] = [];
  const what = record.dryRun ? 'browse.show ingestion (dry run)' : 'browse.show ingestion';
  const headline = {
    running: 'is running',
    success: 'succeeded',
    failed: 'failed',
    skipped: 'was skipped',
    interrupted: 'was interrupted',
  }[record.outcome];
  lines.push(`${OUTCOME_ICONS[record.outcome]} ${what} ${headline} on ${record.host} (${formatDuration(record.durationMs)}, ${record.trigger})`);
  if (record.reason) lines.push(record.reason);

  const totals = record.pipeline?.totals;
  if (totals) {
    const updated = record.pipeline!.sites.filter(site => site.transcribed > 0).map(site => `${site.siteId} ${site.transcribed}`);
    lines.push(
      `${totals.transcribed} episode(s) transcribed${updated.length ? ` (${updated.join(', ')})` : ''}, ` +
      `${totals.newAudioFiles} downloaded, ${totals.filesUploaded} file(s) uploaded across ${totals.sites} site(s)`,
    );
    const errors = record.pipeline!.sites.flatMap(site => site.errors.map(error => `${site.siteId}: ${truncate(error, 200)}`));
    if (errors.length > 0) {
      lines.push(`${errors.length} error(s):`);
      lines.push(...errors.slice(0, maxErrors).map(error => `• ${error}`));
      if (errors.length > maxErrors) lines.push(`• …and ${errors.length - maxErrors} more`);
    }
  }
  if (record.outcome !== 'success') lines.push(`Log: ${record.logPath}`);
  return lines.join('\n');
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
