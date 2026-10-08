import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import prompts from 'prompts';
import { getLocalFilesBasePath } from '@browse-dot-show/config';
import { oneOf, parseFlags, positiveInt, UsageError } from '../../lib/args.js';
import { REPO_ROOT } from '../../lib/paths.js';
import { currentRunLockHolder, defaultLockEnvironment, runLockPath } from '../../lib/run-lock.js';
import {
  LAUNCH_DAEMON_PATH,
  LAUNCHD_LABEL,
  launchdLogPath,
  NOTIFY_ON_SUCCESS,
  readScheduleConfig,
  scheduleConfigPath,
  scheduledLogsDir,
} from '../../schedule/config.js';
import { checkLocalFiles } from '../../schedule/guards.js';
import { installSteps, planInstall, prepareInstall, printSteps, runSudoSteps, stagedPlistPath, uninstallSteps } from '../../schedule/install.js';
import { formatTimeOfDay, launchdJobState, nextRunAfter, parseRepeatingEvents, parseTimeOfDay, pmsetSchedule } from '../../schedule/launchd.js';
import { isFileVaultOn, macAdvice, readPowerSettings } from '../../schedule/mac-settings.js';
import { formatRunMessage, loadNotifyTargets, pingHealthcheck, postToSlack } from '../../schedule/notify.js';
import { listRecords, type ScheduledRunRecord } from '../../schedule/records.js';
import { git, uncommittedChanges } from '../../schedule/runner-checkout.js';
import { runScheduled } from '../../schedule/scheduled-run.js';
import { renderStatus, type StatusFacts } from '../../schedule/status.js';
import { runProcess, type Command } from '../command.js';

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
printing to the terminal too. Once the schedule is installed, it runs in the runner
checkout with the runner's node, like launchd does; otherwise in this checkout, without
updating it.

OPTIONS
${RUN_OPTIONS_USAGE}
  --here                     Run in this checkout even when a runner checkout is installed
  --via-launchd              Start the installed LaunchDaemon instead (sudo launchctl kickstart):
                             the real environment (no logged-in shell, launchd's PATH); follow it
                             with \`bds schedule status\` or the log in ~/Library/Logs/browse-dot-show/scheduled/

EXAMPLES
  pnpm bds schedule run-now --dry-run --no-update   # safe end-to-end check: no AWS calls
  pnpm bds schedule run-now --via-launchd           # the real thing, as launchd runs it
`,
  async run(argv) {
    const { here, 'via-launchd': viaLaunchd } = parseFlags(argv, {
      ...RUN_FLAGS,
      here: { type: 'boolean' },
      'via-launchd': { type: 'boolean' },
    });
    const runArgv = argv.filter(arg => arg !== '--here' && arg !== '--via-launchd');
    const config = readScheduleConfig();

    if (viaLaunchd) {
      if (!fs.existsSync(LAUNCH_DAEMON_PATH)) throw new UsageError('The schedule isn\'t installed; run `bds schedule install` first.');
      console.log('Starting the LaunchDaemon (sudo launchctl kickstart)…');
      const code = await runProcess('sudo', ['launchctl', 'kickstart', `system/${LAUNCHD_LABEL}`]);
      if (code === 0) console.log(`✅ Started. Follow it: pnpm bds schedule status, or tail -f the newest log in ${scheduledLogsDir()}`);
      return code;
    }

    const inRunner = config !== null && path.resolve(config.runnerDir) === REPO_ROOT;
    if (config && !inRunner && !here && fs.existsSync(config.runnerDir)) {
      console.log(`Running in the runner checkout (${config.runnerDir}) with ${config.nodePath}; --here runs in this checkout\n`);
      const tsx = path.join(config.runnerDir, 'node_modules/tsx/dist/cli.mjs');
      return runProcess(config.nodePath, [tsx, path.join(config.runnerDir, 'scripts/cli/index.ts'), 'schedule', 'run-now', '--here', ...runArgv], {
        cwd: config.runnerDir,
        env: { ...process.env, PATH: `${path.dirname(config.nodePath)}:${process.env.PATH ?? ''}`, NODE_OPTIONS: process.env.NODE_OPTIONS },
      });
    }

    return runScheduled({ ...parseRunFlags(runArgv), trigger: 'run-now', echo: true });
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

const INSTALL_FLAGS = {
  at: { type: 'string' },
  'runner-dir': { type: 'string' },
  track: { type: 'string' },
  node: { type: 'string' },
  user: { type: 'string' },
  'notify-on-success': { type: 'string' },
  'wake-minutes-before': { type: 'string' },
  'no-wake': { type: 'boolean' },
  'print-only': { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
} as const;

export const scheduleInstallCommand: Command = {
  path: ['schedule', 'install'],
  summary: 'Install the nightly LaunchDaemon and wake schedule on this Mac (asks for sudo)',
  usage: `
USAGE
  pnpm bds schedule install [--at=HH:MM] [options]

Sets this Mac up to run \`bds schedule run\` daily, with nobody logged in:

  1. Runner checkout: a git worktree of this repo, detached at origin/main (--track), with this
     checkout's gitignored config symlinked in; pnpm install + build (skipped if it exists)
  2. ~/Library/Application Support/browse-dot-show/schedule.json (these settings)
  3. With sudo (shown first; you're asked to confirm):
     - /Library/LaunchDaemons/${LAUNCHD_LABEL}.plist, loaded into launchd
     - pmset repeat wakeorpoweron: wake (or power on) the Mac a few minutes before the run.
       A Mac has one repeating wake schedule; this replaces any existing one.

Re-run it to change any setting. Undo with \`bds schedule uninstall\`.

OPTIONS
  --at=HH:MM                  Daily start time, 24-hour local time (default: 03:00, or the current setting)
  --runner-dir=<path>         Runner checkout (default: browse-dot-show-runner next to the main checkout)
  --track=<branch>            Branch the runner follows (default: main). For testing changes to scheduling
                              itself before they merge; the branch must be pushed
  --node=<path>               node binary for launchd (default: Homebrew's node@22 if installed, else this node)
  --user=<name>               macOS user the job runs as (default: you)
  --notify-on-success=<when>  ${NOTIFY_ON_SUCCESS.join(' | ')} (default: always, or the current setting)
  --wake-minutes-before=N     Wake the Mac N minutes before the run (default: 5)
  --no-wake                   Don't set a wake schedule (e.g. the Mac never sleeps and you manage pmset yourself)
  --print-only                Do the non-sudo steps, then print the sudo commands to run yourself
  --yes, -y                   Don't ask for confirmation (sudo may still ask for your password)
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, INSTALL_FLAGS);
    if (process.platform !== 'darwin') throw new UsageError('`bds schedule install` is for macOS (launchd).');

    const previous = readScheduleConfig();
    const time = flags.at ? parseTimeOfDay(flags.at) : previous ? { hour: previous.hour, minute: previous.minute } : { hour: 3, minute: 0 };
    if (!time) throw new UsageError(`--at must be HH:MM, 24-hour (got "${flags.at}")`);
    const wakeBefore = flags['no-wake'] ? null : (positiveInt('wake-minutes-before', flags['wake-minutes-before']) ?? 5);
    if (flags.node && !fs.existsSync(flags.node)) throw new UsageError(`--node: ${flags.node} doesn't exist`);
    if (!ctx.interactive && !flags.yes && !flags['print-only']) {
      throw new UsageError('Without a terminal, pass --yes (sudo must not need a password) or --print-only.');
    }

    const plan = await planInstall({
      ...time,
      runnerDir: flags['runner-dir'],
      branch: flags.track,
      nodePath: flags.node,
      userName: flags.user,
      notifyOnSuccess: oneOf('notify-on-success', flags['notify-on-success'], NOTIFY_ON_SUCCESS),
      wakeMinutesBefore: wakeBefore,
    });
    const { config } = plan;
    const steps = installSteps(config, stagedPlistPath());

    console.log('\n🗓️  Scheduled ingestion');
    console.log(`   Daily at ${formatTimeOfDay(config.hour, config.minute)} as ${config.userName}`);
    console.log(`   Runner checkout: ${config.runnerDir}${plan.createRunner ? ' (will be created)' : ''}, following origin/${config.branch}`);
    console.log(`   Node: ${config.nodePath}`);
    if (config.nodePath.includes('/.nvm/')) console.log("   ⚠️  That's nvm's node: scheduled runs break if that version is removed. Homebrew's node@22 is steadier (--node).");
    console.log(`   Success notifications: ${config.notifyOnSuccess}`);
    if (plan.existingWakes.length) console.log(`   Current repeating wake (will be replaced): ${plan.existingWakes.join('; ')}`);
    console.log('\nThen, with sudo:');
    printSteps(steps);

    if (ctx.interactive && !flags.yes && !flags['print-only']) {
      const { proceed } = await prompts({ type: 'confirm', name: 'proceed', message: 'Go ahead?', initial: true });
      if (!proceed) return 130;
    }

    await prepareInstall(plan, line => console.log(line));

    if (flags['print-only']) {
      console.log('\nRun these yourself to finish installing:');
      printSteps(steps);
      return 0;
    }
    if (!(await runSudoSteps(steps, { nonInteractive: !ctx.interactive }))) return 1;

    console.log(`\n✅ Installed. Next run: ${nextRunAfter(new Date(), config.hour, config.minute).toLocaleString()}`);
    console.log('   Check it:      pnpm bds schedule status');
    console.log('   Try it (safe): pnpm bds schedule run-now --dry-run');
    return 0;
  },
};

export const scheduleUninstallCommand: Command = {
  path: ['schedule', 'uninstall'],
  summary: 'Remove the LaunchDaemon and wake schedule (asks for sudo)',
  usage: `
USAGE
  pnpm bds schedule uninstall [--keep-wake] [--remove-runner] [--print-only] [--yes]

Unloads and removes the LaunchDaemon (stopping a run in progress), cancels the repeating
wake schedule and removes schedule.json. Logs stay in ~/Library/Logs/browse-dot-show.

OPTIONS
  --keep-wake       Leave the pmset repeating wake schedule alone
  --remove-runner   Also remove the runner checkout (git worktree remove)
  --print-only      Print the sudo commands instead of running them
  --yes, -y         Don't ask for confirmation
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, {
      'keep-wake': { type: 'boolean' },
      'remove-runner': { type: 'boolean' },
      'print-only': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
    });
    if (!ctx.interactive && !flags.yes && !flags['print-only']) {
      throw new UsageError('Without a terminal, pass --yes (sudo must not need a password) or --print-only.');
    }
    const config = readScheduleConfig();
    const wakes = parseRepeatingEvents(await pmsetSchedule());
    const steps = uninstallSteps({ cancelWake: !flags['keep-wake'] && wakes.length > 0 });

    console.log('\nWith sudo:');
    printSteps(steps);
    if (wakes.length && !flags['keep-wake']) console.log(`  (cancels: ${wakes.join('; ')})`);
    if (flags['remove-runner'] && config) console.log(`Then: git worktree remove ${config.runnerDir}`);
    if (flags['print-only']) return 0;

    if (ctx.interactive && !flags.yes) {
      const { proceed } = await prompts({ type: 'confirm', name: 'proceed', message: 'Go ahead?', initial: true });
      if (!proceed) return 130;
    }
    if (!(await runSudoSteps(steps, { nonInteractive: !ctx.interactive }))) return 1;

    if (flags['remove-runner'] && config && fs.existsSync(config.runnerDir)) {
      const code = await runProcess('git', ['worktree', 'remove', config.runnerDir]);
      if (code !== 0) console.error(`⚠️  Couldn't remove ${config.runnerDir}; remove it with: git worktree remove --force ${config.runnerDir}`);
    }
    fs.rmSync(scheduleConfigPath(), { force: true });
    fs.rmSync(stagedPlistPath(), { force: true });
    console.log('\n✅ Uninstalled.');
    return 0;
  },
};

export const scheduleStatusCommand: Command = {
  path: ['schedule', 'status'],
  summary: 'Show the schedule, wake schedule, recent runs and warnings',
  usage: `
USAGE
  pnpm bds schedule status [--runs=N]

Read-only: no sudo, no network.

OPTIONS
  --runs=N   How many recent runs to show (default: 10)
`,
  async run(argv) {
    const flags = parseFlags(argv, { runs: { type: 'string' }, help: { type: 'boolean', short: 'h' } });
    const facts = await gatherStatusFacts(positiveInt('runs', flags.runs) ?? 10);
    const { lines, warnings } = renderStatus(facts);
    console.log(`\n${lines.join('\n')}`);
    if (warnings.length) {
      console.log('\nWarnings');
      for (const warning of warnings) console.log(`  ⚠️  ${warning}`);
    }
    console.log(`\nLogs: ${scheduledLogsDir()} (launchd: ${launchdLogPath()})`);
    return 0;
  },
};

async function gatherStatusFacts(runs: number): Promise<StatusFacts> {
  const config = readScheduleConfig();
  let base: string | null = null;
  try {
    base = getLocalFilesBasePath();
  } catch {
    // reported by the local files check
  }
  const targets = loadNotifyTargets();

  let runner: StatusFacts['runner'] = null;
  if (config) {
    const exists = fs.existsSync(config.runnerDir);
    runner = { exists };
    if (exists) {
      runner.commit = await git(config.runnerDir, ['rev-parse', 'HEAD']).catch(() => undefined);
      runner.originMain = await git(config.runnerDir, ['rev-parse', `origin/${config.branch ?? 'main'}`]).catch(() => undefined);
      runner.dirty = (await uncommittedChanges(config.runnerDir).catch(() => [])).length;
    }
  }

  return {
    now: new Date(),
    host: os.hostname(),
    config,
    plistInstalled: fs.existsSync(LAUNCH_DAEMON_PATH),
    job: await launchdJobState(),
    repeatingWakes: parseRepeatingEvents(await pmsetSchedule()),
    records: listRecords(scheduledLogsDir(), runs),
    isAlive: defaultLockEnvironment().isAlive,
    runLockHolder: base ? currentRunLockHolder(runLockPath(base)) : null,
    runner,
    localFiles: base ? checkLocalFiles(base) : { ok: false, label: 'local files', detail: 'localFilesPath not configured (.local-files-config.json)' },
    notify: { slack: Boolean(targets.slackWebhookUrl), healthcheck: Boolean(targets.healthcheckPingUrl) },
    macAdvice: macAdvice({
      fileVaultOn: await isFileVaultOn(),
      power: await readPowerSettings(),
    }),
  };
}
