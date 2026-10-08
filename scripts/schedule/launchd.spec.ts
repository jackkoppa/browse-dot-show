import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { macAdvice, parsePmsetCustom } from './mac-settings.js';
import {
  launchdPath,
  nextRunAfter,
  parseLaunchctlPrint,
  parseRepeatingEvents,
  parseTimeOfDay,
  pmsetRepeatArgs,
  renderLaunchDaemonPlist,
  wakeTime,
} from './launchd.js';
import { installSteps, uninstallSteps } from './install.js';
import type { ScheduleConfig } from './config.js';

const config: ScheduleConfig = {
  version: 1,
  runnerDir: '/Users/dev/browse-dot-show-runner',
  branch: 'main',
  hour: 3,
  minute: 0,
  nodePath: '/opt/homebrew/opt/node@22/bin/node',
  userName: 'dev',
  notifyOnSuccess: 'new-episodes',
  wakeMinutesBefore: 5,
  installedAt: '2026-10-08T00:00:00.000Z',
};

describe('LaunchDaemon plist', () => {
  const plist = renderLaunchDaemonPlist({ ...config, homeDir: '/Users/dev', logPath: '/Users/dev/Library/Logs/browse-dot-show/launchd.log' });

  it('runs `bds schedule run` from the runner checkout with absolute paths', () => {
    expect(plist).toContain('<string>/opt/homebrew/opt/node@22/bin/node</string>');
    expect(plist).toContain('<string>/Users/dev/browse-dot-show-runner/node_modules/tsx/dist/cli.mjs</string>');
    expect(plist).toContain('<string>/Users/dev/browse-dot-show-runner/scripts/cli/index.ts</string>\n    <string>schedule</string>\n    <string>run</string>');
    expect(plist).toContain('<key>UserName</key>\n  <string>dev</string>');
    expect(plist).toContain('<key>Hour</key>\n    <integer>3</integer>');
    expect(plist).toContain('<string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>');
    expect(plist).toContain('<key>ProcessType</key>\n  <string>Interactive</string>');
  });

  it('escapes XML', () => {
    expect(renderLaunchDaemonPlist({ ...config, runnerDir: '/a&b/<c>', homeDir: '/h', logPath: '/l' })).toContain('<string>/a&amp;b/&lt;c&gt;</string>');
  });

  it.runIf(process.platform === 'darwin')('passes plutil -lint', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bds-plist-')), 'test.plist');
    fs.writeFileSync(file, plist);
    expect(execFileSync('/usr/bin/plutil', ['-lint', file], { encoding: 'utf8' })).toContain('OK');
    const json = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
    expect(json.StartCalendarInterval).toEqual({ Hour: 3, Minute: 0 });
    expect(json.EnvironmentVariables.HOME).toBe('/Users/dev');
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it('dedupes PATH entries', () => {
    expect(launchdPath('/opt/homebrew/bin/node')).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });
});

describe('times', () => {
  it('parses HH:MM', () => {
    expect(parseTimeOfDay('03:00')).toEqual({ hour: 3, minute: 0 });
    expect(parseTimeOfDay('3:30')).toEqual({ hour: 3, minute: 30 });
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('3am')).toBeNull();
  });

  it('wakes a few minutes early, wrapping past midnight', () => {
    expect(wakeTime(3, 0, 5)).toEqual({ hour: 2, minute: 55 });
    expect(wakeTime(0, 2, 5)).toEqual({ hour: 23, minute: 57 });
    expect(pmsetRepeatArgs(2, 55)).toEqual(['repeat', 'wakeorpoweron', 'MTWRFSU', '02:55:00']);
  });

  it('finds the next run', () => {
    const now = new Date(2026, 9, 8, 2, 0);
    expect(nextRunAfter(now, 3, 0)).toEqual(new Date(2026, 9, 8, 3, 0));
    expect(nextRunAfter(new Date(2026, 9, 8, 3, 0), 3, 0)).toEqual(new Date(2026, 9, 9, 3, 0));
  });
});

describe('install steps', () => {
  it('installs, reloads and sets the wake schedule', () => {
    const steps = installSteps(config, '/staged.plist');
    expect(steps.map(step => step.args.slice(0, 2).join(' '))).toEqual(['install -m', 'launchctl bootout', 'launchctl bootstrap', 'pmset repeat']);
    expect(steps[1].allowFailure).toBe(true);
    expect(steps[3].args).toEqual(['pmset', 'repeat', 'wakeorpoweron', 'MTWRFSU', '02:55:00']);
    expect(installSteps({ ...config, wakeMinutesBefore: null }, '/staged.plist')).toHaveLength(3);
  });

  it('uninstalls, optionally cancelling the wake', () => {
    expect(uninstallSteps({ cancelWake: true }).map(step => step.args[0])).toEqual(['launchctl', 'rm', 'pmset']);
    expect(uninstallSteps({ cancelWake: false })).toHaveLength(2);
  });
});

describe('macOS output parsing', () => {
  it('parses launchctl print', () => {
    const output = `system/com.browse-dot-show.ingest = {
\tactive count = 0
\tpath = /Library/LaunchDaemons/com.browse-dot-show.ingest.plist
\ttype = LaunchDaemon
\tstate = not running
\truns = 2
\tlast exit code = 0
}`;
    expect(parseLaunchctlPrint(output)).toEqual({ loaded: true, state: 'not running', runs: 2, lastExitCode: '0', pid: undefined });
    expect(parseLaunchctlPrint('Bad request.\nCould not find service')).toEqual({ loaded: false });
  });

  it('parses repeating events from pmset -g sched', () => {
    const output = 'Repeating power events:\n  wakepoweron at 2:55AM every day\nScheduled power events:\n [0]  wake at 10/09/2026 02:55:00 by pmset';
    expect(parseRepeatingEvents(output)).toEqual(['wakepoweron at 2:55AM every day']);
    expect(parseRepeatingEvents('')).toEqual([]);
  });

  it('parses pmset -g custom (AC section)', () => {
    const laptop = 'Battery Power:\n sleep                1\n autorestart          0\nAC Power:\n sleep                0\n autorestart          1\n';
    expect(parsePmsetCustom(laptop)).toEqual({ sleepMinutes: 0, autorestart: true });
    expect(parsePmsetCustom('AC Power:\n Sleep On Power Button 1\n sleep                10\n autorestart          0\n')).toEqual({ sleepMinutes: 10, autorestart: false });
  });

  it('advises on FileVault, sleep and autorestart', () => {
    expect(macAdvice({ fileVaultOn: false, power: { sleepMinutes: 0, autorestart: true } })).toEqual([]);
    const advice = macAdvice({ fileVaultOn: true, power: { sleepMinutes: 10, autorestart: false } });
    expect(advice.map(a => [a.level, a.fix])).toEqual([['warn', undefined], ['info', 'sudo pmset -c sleep 0'], ['warn', 'sudo pmset autorestart 1']]);
  });
});
