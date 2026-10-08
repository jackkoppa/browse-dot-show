import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildRunSummary, readRunSummary, writeRunSummary } from './run-summary.js';
import type { SiteProcessingResult } from './types.js';

const result = (siteId: string, overrides: Partial<SiteProcessingResult> = {}): SiteProcessingResult => ({
  siteId,
  siteTitle: siteId,
  rssRetrievalSuccess: true,
  rssRetrievalDuration: 0,
  audioProcessingSuccess: true,
  audioProcessingDuration: 0,
  newAudioFilesDownloaded: 0,
  newEpisodesTranscribed: 0,
  hasNewFiles: false,
  hasNewSrtFiles: false,
  errors: [],
  ...overrides,
});

describe('run summary', () => {
  it('totals per-site counts and errors', () => {
    const summary = buildRunSummary(
      [
        result('a', { newAudioFilesDownloaded: 2, newEpisodesTranscribed: 2, s3SyncTotalFilesUploaded: 9 }),
        result('b', { errors: ['RSS 403'] }),
      ],
      { startedAt: new Date('2026-10-08T03:00:00Z'), endedAt: new Date('2026-10-08T03:30:00Z'), dryRun: false, exitCode: 1 },
    );
    expect(summary.durationMs).toBe(30 * 60 * 1000);
    expect(summary.totals).toEqual({ sites: 2, newAudioFiles: 2, transcribed: 2, filesUploaded: 9, errors: 1 });
    expect(summary.sites[1]).toEqual({ siteId: 'b', newAudioFiles: 0, transcribed: 0, filesUploaded: 0, errors: ['RSS 403'] });
  });

  it('round-trips through a file, and ignores unreadable ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-summary-'));
    const file = path.join(dir, 'nested', 'run.json');
    const summary = buildRunSummary([], { startedAt: new Date(0), endedAt: new Date(1000), dryRun: true, exitCode: 0 });
    writeRunSummary(file, summary);
    expect(readRunSummary(file)).toEqual(summary);
    expect(readRunSummary(path.join(dir, 'missing.json'))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
