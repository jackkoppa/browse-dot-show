import { describe, expect, it } from 'vitest';
import type { ScheduleConfig } from './config.js';
import type { ScheduledRunRecord } from './records.js';
import { effectiveOutcome, missedRun, previousRunAtOrBefore, renderStatus, type StatusFacts } from './status.js';

const config: ScheduleConfig = {
  version: 1,
  runnerDir: '/runner',
  branch: 'main',
  hour: 3,
  minute: 0,
  nodePath: '/opt/homebrew/opt/node@22/bin/node',
  userName: 'dev',
  notifyOnSuccess: 'new-episodes',
  wakeMinutesBefore: 5,
  installedAt: new Date(2026, 9, 1).toISOString(),
};
const record = (startedAt: Date, overrides: Partial<ScheduledRunRecord> = {}): ScheduledRunRecord => ({
  version: 1,
  id: startedAt.toISOString(),
  trigger: 'scheduled',
  host: 'runner',
  pid: 42,
  startedAt: startedAt.toISOString(),
  durationMs: 60_000,
  outcome: 'success',
  dryRun: false,
  logPath: '/logs/run.log',
  ...overrides,
});
const facts = (overrides: Partial<StatusFacts> = {}): StatusFacts => ({
  now: new Date(2026, 9, 8, 9, 0),
  host: 'runner',
  config,
  plistInstalled: true,
  job: { loaded: true, state: 'not running', runs: 1, lastExitCode: '0' },
  repeatingWakes: ['wakepoweron at 2:55AM every day'],
  records: [record(new Date(2026, 9, 8, 3, 0))],
  isAlive: () => false,
  runLockHolder: null,
  runner: { exists: true, commit: 'abc1234', originMain: 'abc1234', dirty: 0 },
  localFiles: { ok: true, label: 'local files', detail: '/Volumes/ssd/files' },
  notify: { slack: true, healthcheck: true },
  macAdvice: [],
  ...overrides,
});

describe('schedule status', () => {
  it('has no warnings when everything is in order', () => {
    const { lines, warnings } = renderStatus(facts());
    expect(warnings).toEqual([]);
    expect(lines.join('\n')).toContain('Daily at 03:00 as dev');
    expect(lines.join('\n')).toContain('success (scheduled, 1 min)');
  });

  it('says how to install when nothing is installed', () => {
    const { lines } = renderStatus(facts({ config: null, plistInstalled: false, job: { loaded: false }, runner: null, records: [] }));
    expect(lines[1]).toContain('Not installed');
  });

  it('flags a crashed run (record still running, process gone)', () => {
    const crashed = record(new Date(2026, 9, 8, 3, 0), { outcome: 'running', durationMs: undefined });
    expect(effectiveOutcome(crashed, 'runner', () => false)).toBe('crashed');
    expect(effectiveOutcome(crashed, 'runner', () => true)).toBe('running');
    expect(effectiveOutcome(crashed, 'other-mac', () => false)).toBe('running');
    expect(renderStatus(facts({ records: [crashed] })).warnings[0]).toContain('The last scheduled run crashed');
  });

  it('detects a missed run', () => {
    expect(previousRunAtOrBefore(new Date(2026, 9, 8, 9, 0), 3, 0)).toEqual(new Date(2026, 9, 8, 3, 0));
    expect(missedRun(facts())).toBeNull();
    expect(missedRun(facts({ records: [record(new Date(2026, 9, 7, 3, 0))] }))).toEqual(new Date(2026, 9, 8, 3, 0));
    // within the grace period, or installed after the expected time: not missed
    expect(missedRun(facts({ now: new Date(2026, 9, 8, 3, 10), records: [] }))).toBeNull();
    expect(missedRun(facts({ records: [], config: { ...config, installedAt: new Date(2026, 9, 8, 4, 0).toISOString() } }))).toBeNull();
  });

  it('warns about a missing wake, an unloaded job, a non-main branch, nvm node and a dirty runner', () => {
    const { warnings } = renderStatus(facts({
      repeatingWakes: [],
      job: { loaded: false },
      config: { ...config, branch: 'jackkoppa/test', nodePath: '/Users/dev/.nvm/versions/node/v22.14.0/bin/node' },
      runner: { exists: true, commit: 'abc', originMain: 'def', dirty: 2 },
    }));
    expect(warnings.join('\n')).toMatch(/No repeating wake/);
    expect(warnings.join('\n')).toMatch(/isn't loaded/);
    expect(warnings.join('\n')).toMatch(/follows origin\/jackkoppa\/test/);
    expect(warnings.join('\n')).toMatch(/nvm's node/);
    expect(warnings.join('\n')).toMatch(/2 uncommitted change/);
  });
});
