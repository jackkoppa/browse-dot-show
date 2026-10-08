import * as os from 'os';
import { oneOf, parseFlags, positiveInt } from '../../lib/args.js';
import { NOTIFY_ON_SUCCESS } from '../../schedule/config.js';
import { formatRunMessage, loadNotifyTargets, pingHealthcheck, postToSlack } from '../../schedule/notify.js';
import type { ScheduledRunRecord } from '../../schedule/records.js';
import { runScheduled } from '../../schedule/scheduled-run.js';
import type { Command } from '../command.js';

const RUN_FLAGS = {
  'no-update': { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  parallel: { type: 'string' },
  'notify-on-success': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

const RUN_OPTIONS_USAGE = `  --dry-run                  Run \`bds ingest --dry-run\` (no downloads, uploads or AWS calls)
  --no-update                Don't update the runner checkout first
  --parallel=N               Transcription workers (default: transcriptionWorkers in .local-files-config.json)
  --notify-on-success=<when> ${NOTIFY_ON_SUCCESS.join(' | ')} (default: from schedule.json, else always)`;

function parseRunFlags(argv: string[]) {
  const flags = parseFlags(argv, RUN_FLAGS);
  return {
    update: !flags['no-update'],
    dryRun: Boolean(flags['dry-run']),
    parallel: positiveInt('parallel', flags.parallel),
    notifyOnSuccess: oneOf('notify-on-success', flags['notify-on-success'], NOTIFY_ON_SUCCESS),
  };
}

export const scheduleRunCommand: Command = {
  path: ['schedule', 'run'],
  summary: 'One scheduled ingestion run, as launchd starts it (checks, update, ingest, notify)',
  usage: `
USAGE
  pnpm bds schedule run [options]

What the LaunchDaemon runs. Output goes to a per-run log in
~/Library/Logs/browse-dot-show/scheduled/ (not the terminal); use \`bds schedule run-now\`
to watch a run.

  1. Keep the Mac awake (caffeinate); ping the healthcheck's /start
  2. Checks: local files mounted and readable, free disk, power, network. A failed check
     skips the run (and notifies)
  3. Skip if another ingestion run is in progress
  4. Runner checkout only: fast-forward to origin/main; pnpm install + build if it changed
  5. bds ingest --all-sites
  6. Record the result, notify (Slack, healthcheck), keep the newest 60 runs' logs

OPTIONS
${RUN_OPTIONS_USAGE}

Notifications come from .env.automation: SLACK_WEBHOOK_URL, HEALTHCHECK_PING_URL (both optional).
`,
  async run(argv) {
    return runScheduled({ ...parseRunFlags(argv), trigger: 'scheduled', echo: false });
  },
};

export const scheduleRunNowCommand: Command = {
  path: ['schedule', 'run-now'],
  summary: 'Run the scheduled job now, in this terminal',
  usage: `
USAGE
  pnpm bds schedule run-now [options]

Runs exactly what \`bds schedule run\` does (checks, update, ingest, notify, run record),
printing to the terminal too. The checkout is only updated when it's the runner checkout.

OPTIONS
${RUN_OPTIONS_USAGE}

EXAMPLES
  pnpm bds schedule run-now --dry-run --no-update   # safe end-to-end check: no AWS calls
`,
  async run(argv) {
    return runScheduled({ ...parseRunFlags(argv), trigger: 'run-now', echo: true });
  },
};

export const scheduleTestNotificationsCommand: Command = {
  path: ['schedule', 'test-notifications'],
  summary: 'Send a test Slack message and healthcheck ping',
  usage: `
USAGE
  pnpm bds schedule test-notifications [--fail]

Posts a test message to SLACK_WEBHOOK_URL and pings HEALTHCHECK_PING_URL (both in
.env.automation). --fail sends a failure (Slack message and a /fail ping) instead.
`,
  async run(argv) {
    const flags = parseFlags(argv, { fail: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } });
    const targets = loadNotifyTargets();
    if (!targets.slackWebhookUrl && !targets.healthcheckPingUrl) {
      console.error('❌ Neither SLACK_WEBHOOK_URL nor HEALTHCHECK_PING_URL is set in .env.automation');
      return 1;
    }

    const now = new Date();
    const record: ScheduledRunRecord = {
      version: 1,
      id: 'test',
      trigger: 'test-notifications',
      host: os.hostname(),
      pid: process.pid,
      startedAt: now.toISOString(),
      endedAt: now.toISOString(),
      durationMs: 0,
      outcome: flags.fail ? 'failed' : 'success',
      reason: flags.fail ? 'This is a test failure from `bds schedule test-notifications --fail`' : 'This is a test from `bds schedule test-notifications`',
      dryRun: true,
      logPath: '(none)',
    };
    const message = formatRunMessage(record);
    const log = (line: string) => console.log(line);

    let failures = 0;
    if (targets.slackWebhookUrl) {
      const ok = await postToSlack(targets, message, log);
      console.log(`${ok ? '✅' : '❌'} Slack`);
      if (!ok) failures++;
    } else {
      console.log('⏭️  Slack: SLACK_WEBHOOK_URL not set');
    }
    if (targets.healthcheckPingUrl) {
      const ok = await pingHealthcheck(targets, flags.fail ? 'fail' : 'success', message, log);
      console.log(`${ok ? '✅' : '❌'} Healthcheck (${flags.fail ? 'fail' : 'success'} ping)`);
      if (!ok) failures++;
    } else {
      console.log('⏭️  Healthcheck: HEALTHCHECK_PING_URL not set');
    }
    return failures === 0 ? 0 : 1;
  },
};
