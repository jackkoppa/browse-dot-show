import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runProcess } from '../cli/command.js';
import { REPO_ROOT } from '../lib/paths.js';
import { appSupportDir } from '../lib/user-dirs.js';
import { mainWorktreePath } from '../lib/worktree-config.js';
import {
  DEFAULT_NOTIFY_ON_SUCCESS,
  LAUNCH_DAEMON_PATH,
  LAUNCHD_LABEL,
  launchdLogPath,
  readScheduleConfig,
  scheduleConfigPath,
  writeScheduleConfig,
  type ScheduleConfig,
} from './config.js';
import { formatTimeOfDay, parseRepeatingEvents, pmsetRepeatArgs, pmsetSchedule, renderLaunchDaemonPlist, wakeTime } from './launchd.js';
import { createRunnerCheckout, isWorktreeOf } from './runner-checkout.js';

/** Where Homebrew's keg-only node@22 lives (Apple silicon, then Intel). */
export const HOMEBREW_NODE_CANDIDATES = ['/opt/homebrew/opt/node@22/bin/node', '/usr/local/opt/node@22/bin/node'];

/** Homebrew's node@22 if installed, else the node running this. */
export function defaultNodePath(candidates = HOMEBREW_NODE_CANDIDATES): string {
  return candidates.find(candidate => fs.existsSync(candidate)) ?? process.execPath;
}

/** `browse-dot-show-runner` next to the main checkout. */
export async function defaultRunnerDir(): Promise<string> {
  const main = await mainWorktreePath(REPO_ROOT).catch(() => REPO_ROOT);
  return path.join(path.dirname(main), 'browse-dot-show-runner');
}

/** A privileged step: shown to the developer, then run with sudo (or only printed). */
export interface SudoStep {
  description: string;
  args: string[];
  /** Keep going if it fails (e.g. booting out a job that isn't loaded). */
  allowFailure?: boolean;
}

export const stagedPlistPath = () => path.join(appSupportDir(), `${LAUNCHD_LABEL}.plist`);

export function installSteps(config: ScheduleConfig, stagedPlist: string): SudoStep[] {
  const steps: SudoStep[] = [
    {
      description: `Install the LaunchDaemon (${LAUNCH_DAEMON_PATH}, owned by root)`,
      args: ['install', '-m', '644', '-o', 'root', '-g', 'wheel', stagedPlist, LAUNCH_DAEMON_PATH],
    },
    { description: 'Unload the previous version, if any', args: ['launchctl', 'bootout', `system/${LAUNCHD_LABEL}`], allowFailure: true },
    { description: 'Load it', args: ['launchctl', 'bootstrap', 'system', LAUNCH_DAEMON_PATH] },
  ];
  if (config.wakeMinutesBefore !== null) {
    const wake = wakeTime(config.hour, config.minute, config.wakeMinutesBefore);
    steps.push({
      description: `Wake (or power on) the Mac daily at ${formatTimeOfDay(wake.hour, wake.minute)} (replaces any existing repeating wake)`,
      args: ['pmset', ...pmsetRepeatArgs(wake.hour, wake.minute)],
    });
  }
  return steps;
}

export function uninstallSteps({ cancelWake }: { cancelWake: boolean }): SudoStep[] {
  const steps: SudoStep[] = [
    { description: 'Unload the LaunchDaemon (stops a running job)', args: ['launchctl', 'bootout', `system/${LAUNCHD_LABEL}`], allowFailure: true },
    { description: `Remove ${LAUNCH_DAEMON_PATH}`, args: ['rm', '-f', LAUNCH_DAEMON_PATH] },
  ];
  if (cancelWake) steps.push({ description: 'Cancel the repeating wake schedule', args: ['pmset', 'repeat', 'cancel'] });
  return steps;
}

export function printSteps(steps: SudoStep[]): void {
  for (const step of steps) {
    console.log(`  # ${step.description}`);
    console.log(`  sudo ${step.args.map(shellQuote).join(' ')}`);
  }
}

/** Run steps with sudo, stopping at the first failure that isn't allowed. */
export async function runSudoSteps(steps: SudoStep[], { nonInteractive }: { nonInteractive: boolean }): Promise<boolean> {
  for (const step of steps) {
    console.log(`\n▶️  ${step.description}`);
    const code = await runProcess('sudo', [...(nonInteractive ? ['-n'] : []), ...step.args]);
    if (code !== 0 && !step.allowFailure) {
      console.error(`❌ Failed (exit ${code}): sudo ${step.args.join(' ')}`);
      return false;
    }
  }
  return true;
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface InstallPlan {
  config: ScheduleConfig;
  createRunner: boolean;
  existingWakes: string[];
}

export async function planInstall(options: {
  hour: number;
  minute: number;
  runnerDir?: string;
  branch?: string;
  nodePath?: string;
  userName?: string;
  notifyOnSuccess?: ScheduleConfig['notifyOnSuccess'];
  wakeMinutesBefore: number | null;
}): Promise<InstallPlan> {
  const previous = readScheduleConfig();
  const runnerDir = path.resolve(options.runnerDir ?? previous?.runnerDir ?? (await defaultRunnerDir()));
  const config: ScheduleConfig = {
    version: 1,
    runnerDir,
    branch: options.branch ?? previous?.branch ?? 'main',
    hour: options.hour,
    minute: options.minute,
    nodePath: options.nodePath ?? defaultNodePath(),
    userName: options.userName ?? os.userInfo().username,
    notifyOnSuccess: options.notifyOnSuccess ?? previous?.notifyOnSuccess ?? DEFAULT_NOTIFY_ON_SUCCESS,
    wakeMinutesBefore: options.wakeMinutesBefore,
    installedAt: new Date().toISOString(),
  };
  return {
    config,
    createRunner: !fs.existsSync(runnerDir),
    existingWakes: parseRepeatingEvents(await pmsetSchedule()),
  };
}

/** Everything that doesn't need sudo: the runner checkout, schedule.json, the staged plist. */
export async function prepareInstall(plan: InstallPlan, log: (line: string) => void): Promise<string> {
  const { config } = plan;
  if (plan.createRunner) {
    log(`\n📁 Creating the runner checkout at ${config.runnerDir}`);
    const main = await mainWorktreePath(REPO_ROOT);
    await createRunnerCheckout(main, config.runnerDir, config.nodePath, log, { branch: config.branch });
  } else if (!(await isWorktreeOf(REPO_ROOT, config.runnerDir))) {
    throw new Error(`${config.runnerDir} exists but isn't a worktree of this repo; pass --runner-dir=<new path>, or remove it`);
  } else {
    log(`\n📁 Using the existing runner checkout at ${config.runnerDir} (scheduled runs keep it at origin/${config.branch})`);
  }

  // launchd opens the log as root before switching users; create it first so it stays ours
  fs.mkdirSync(path.dirname(launchdLogPath()), { recursive: true });
  fs.closeSync(fs.openSync(launchdLogPath(), 'a'));

  writeScheduleConfig(config);
  log(`📝 Wrote ${scheduleConfigPath()}`);

  const staged = stagedPlistPath();
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, renderLaunchDaemonPlist({ ...config, homeDir: os.homedir(), logPath: launchdLogPath() }));
  const lint = await runProcess('/usr/bin/plutil', ['-lint', staged]);
  if (lint !== 0) throw new Error(`plutil rejected the generated plist (${staged})`);
  return staged;
}
