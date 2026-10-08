import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkLocalFiles, evaluateFreeDisk, evaluatePower, parsePowerState } from './guards.js';
import { formatDuration, formatRunMessage, healthcheckKind, shouldPostToSlack } from './notify.js';
import { listRecords, newRunId, pruneOldest, rotateRunFiles, writeRecord, type ScheduledRunRecord } from './records.js';
import type { PipelineRunSummary } from '../ingestion/run-summary.js';

const pipeline = (sites: PipelineRunSummary['sites']): PipelineRunSummary => ({
  version: 1,
  startedAt: '',
  endedAt: '',
  durationMs: 0,
  dryRun: false,
  exitCode: sites.some(site => site.errors.length) ? 1 : 0,
  totals: {
    sites: sites.length,
    newAudioFiles: sites.reduce((n, s) => n + s.newAudioFiles, 0),
    transcribed: sites.reduce((n, s) => n + s.transcribed, 0),
    filesUploaded: sites.reduce((n, s) => n + s.filesUploaded, 0),
    errors: sites.reduce((n, s) => n + s.errors.length, 0),
  },
  sites,
});

const record = (overrides: Partial<ScheduledRunRecord> = {}): ScheduledRunRecord => ({
  version: 1,
  id: '2026-10-08T03-00-00-000Z',
  trigger: 'scheduled',
  host: 'runner',
  pid: 1,
  startedAt: '2026-10-08T03:00:00.000Z',
  durationMs: 34 * 60_000,
  outcome: 'success',
  dryRun: false,
  logPath: '/logs/run.log',
  ...overrides,
});

describe('guards', () => {
  it('parses pmset power output', () => {
    expect(parsePowerState("Now drawing from 'AC Power'\n")).toEqual({ onAc: true, batteryPercent: null });
    expect(parsePowerState("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t42%; discharging")).toEqual({ onAc: false, batteryPercent: 42 });
  });

  it('allows AC power, or enough battery', () => {
    expect(evaluatePower({ onAc: true, batteryPercent: 10 }).ok).toBe(true);
    expect(evaluatePower({ onAc: false, batteryPercent: 80 }).ok).toBe(true);
    expect(evaluatePower({ onAc: false, batteryPercent: 20 })).toMatchObject({ ok: false, detail: expect.stringContaining('20%') });
  });

  it('needs free disk space', () => {
    expect(evaluateFreeDisk(100 * 1024 ** 3, 20)).toMatchObject({ ok: true, detail: '100 GB free' });
    expect(evaluateFreeDisk(5 * 1024 ** 3, 20)).toMatchObject({ ok: false, detail: '5 GB free (need 20 GB)' });
  });

  it('checks the local files folder exists and is writable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-guard-'));
    expect(checkLocalFiles(tmp).ok).toBe(true);
    expect(fs.readdirSync(path.join(tmp, 'locks'))).toEqual([]); // the probe file is cleaned up
    expect(checkLocalFiles('/Volumes/NotMounted/files')).toMatchObject({ ok: false, detail: expect.stringContaining('is /Volumes/NotMounted mounted?') });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('notifications', () => {
  const twoNew = pipeline([
    { siteId: 'a', newAudioFiles: 2, transcribed: 2, filesUploaded: 10, errors: [] },
    { siteId: 'b', newAudioFiles: 0, transcribed: 0, filesUploaded: 1, errors: [] },
  ]);

  it('posts failures and skips always, successes per setting', () => {
    expect(shouldPostToSlack(record({ outcome: 'failed' }), 'never')).toBe(true);
    expect(shouldPostToSlack(record({ outcome: 'skipped' }), 'never')).toBe(true);
    expect(shouldPostToSlack(record(), 'never')).toBe(false);
    expect(shouldPostToSlack(record(), 'always')).toBe(true);
    expect(shouldPostToSlack(record(), 'new-episodes')).toBe(false);
    expect(shouldPostToSlack(record({ pipeline: twoNew }), 'new-episodes')).toBe(true);
  });

  it('pings the healthcheck as failed unless the run succeeded or another run was ingesting', () => {
    expect(healthcheckKind(record())).toBe('success');
    expect(healthcheckKind(record({ outcome: 'skipped', alreadyRunning: true }))).toBe('success');
    expect(healthcheckKind(record({ outcome: 'skipped' }))).toBe('fail');
    expect(healthcheckKind(record({ outcome: 'failed' }))).toBe('fail');
    expect(healthcheckKind(record({ outcome: 'interrupted' }))).toBe('fail');
  });

  it('formats a success', () => {
    expect(formatRunMessage(record({ pipeline: twoNew }))).toBe(
      '✅ browse.show ingestion succeeded on runner (34 min, scheduled)\n' +
      '2 episode(s) transcribed (a 2), 2 downloaded, 11 file(s) uploaded across 2 site(s)',
    );
  });

  it('formats a failure with a capped error list and the log path', () => {
    const errors = Array.from({ length: 7 }, (_, i) => `error ${i}\n  with detail`);
    const message = formatRunMessage(
      record({ outcome: 'failed', reason: 'bds ingest exited with code 1', pipeline: pipeline([{ siteId: 'a', newAudioFiles: 0, transcribed: 0, filesUploaded: 0, errors }]) }),
      { maxErrors: 2 },
    );
    expect(message).toContain('❌ browse.show ingestion failed on runner');
    expect(message).toContain('bds ingest exited with code 1');
    expect(message).toContain('• a: error 0 with detail');
    expect(message).toContain('• …and 5 more');
    expect(message).not.toContain('error 2');
    expect(message.endsWith('Log: /logs/run.log')).toBe(true);
  });

  it('formats durations', () => {
    expect(formatDuration(undefined)).toBe('?');
    expect(formatDuration(12_000)).toBe('12 s');
    expect(formatDuration(5 * 60_000)).toBe('5 min');
    expect(formatDuration(125 * 60_000)).toBe('2 h 5 min');
  });
});

describe('run records', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-records-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const ids = ['2026-10-05T03-00-00-000Z', '2026-10-06T03-00-00-000Z', '2026-10-07T03-00-00-000Z'];

  it('lists records newest first, skipping summaries and garbage', () => {
    for (const id of ids) writeRecord(dir, record({ id }));
    fs.writeFileSync(path.join(dir, `${ids[2]}.summary.json`), '{}');
    fs.writeFileSync(path.join(dir, 'garbage.json'), 'nope');
    expect(listRecords(dir).map(r => r.id)).toEqual([...ids].reverse());
    expect(listRecords(dir, 1).map(r => r.id)).toEqual([ids[2]]);
    expect(listRecords(path.join(dir, 'missing'))).toEqual([]);
  });

  it("rotates whole runs (record, log, summary), keeping the newest", () => {
    for (const id of ids) {
      writeRecord(dir, record({ id }));
      fs.writeFileSync(path.join(dir, `${id}.log`), '');
      fs.writeFileSync(path.join(dir, `${id}.summary.json`), '{}');
    }
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    expect(rotateRunFiles(dir, 2)).toBe(1);
    expect(fs.readdirSync(dir).sort()).toEqual([
      ...ids.slice(1).flatMap(id => [`${id}.json`, `${id}.log`, `${id}.summary.json`]),
      'notes.txt',
    ].sort());
  });

  it('prunes the oldest folders', () => {
    for (const id of ids) fs.mkdirSync(path.join(dir, id));
    expect(pruneOldest(dir, 1)).toBe(2);
    expect(fs.readdirSync(dir)).toEqual([ids[2]]);
  });

  it('makes sortable, file-name-safe ids', () => {
    expect(newRunId(new Date('2026-10-08T03:00:00.000Z'))).toBe('2026-10-08T03-00-00-000Z');
  });
});
