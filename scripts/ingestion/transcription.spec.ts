import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import type { RunLambdaLocallyOptions, RunLambdaLocallyResult } from '../lib/lambda.js';
import {
  assignToWorkers,
  groupBySite,
  parseProgressEvents,
  runParallelTranscription,
  transcriptPathFor,
  type AudioFile,
} from './transcription.js';

const file = (siteId: string, name: string, durationMinutes: number): AudioFile => ({
  siteId,
  key: `audio/pod/${name}.mp3`,
  fullPath: `/files/s3/sites/${siteId}/audio/pod/${name}.mp3`,
  durationMinutes,
});

describe('assignToWorkers', () => {
  it('balances total duration across workers, longest first', () => {
    const files = [file('a', '1', 60), file('a', '2', 50), file('b', '3', 40), file('b', '4', 30), file('a', '5', 20), file('b', '6', 10)];
    const plans = assignToWorkers(files, 3);
    expect(plans.map(p => p.totalMinutes).sort((x, y) => x - y)).toEqual([70, 70, 70]);
    expect(plans.flatMap(p => p.files)).toHaveLength(files.length);
  });

  it('never creates more workers than files, and drops empty ones', () => {
    expect(assignToWorkers([file('a', '1', 5)], 4)).toHaveLength(1);
    expect(assignToWorkers([], 4)).toEqual([]);
  });

  it('treats unknown durations (0) as 1 minute so they still spread out', () => {
    const plans = assignToWorkers([file('a', '1', 0), file('a', '2', 0), file('a', '3', 0)], 3);
    expect(plans.map(p => p.files.length)).toEqual([1, 1, 1]);
  });

  it('orders each worker’s files by the given site order', () => {
    const files = [file('b', '1', 10), file('a', '2', 9), file('b', '3', 8), file('a', '4', 7)];
    const [plan] = assignToWorkers(files, 1, ['a', 'b']);
    expect(plan.files.map(f => f.siteId)).toEqual(['a', 'a', 'b', 'b']);
  });

  it('with one worker, behaves like a serial run over every file', () => {
    const files = [file('a', '1', 1), file('b', '2', 2)];
    const plans = assignToWorkers(files, 1, ['a', 'b']);
    expect(plans).toHaveLength(1);
    expect(plans[0].workerId).toBe('worker-1');
    expect(plans[0].files.map(f => f.key)).toEqual(['audio/pod/1.mp3', 'audio/pod/2.mp3']);
  });
});

describe('groupBySite', () => {
  it('groups consecutive files by site', () => {
    const groups = groupBySite([file('a', '1', 1), file('a', '2', 1), file('b', '3', 1)]);
    expect(groups.map(g => [g.siteId, g.files.length])).toEqual([['a', 2], ['b', 1]]);
  });
});

describe('parseProgressEvents', () => {
  it('extracts JSON progress events and ignores other output', () => {
    const chunk = [
      'some log line',
      JSON.stringify({ type: 'START', message: 'go', data: { totalMinutes: 10 } }),
      '{ not json',
      JSON.stringify({ type: 'PROGRESS', message: 'x', data: { completedMinutes: 4, currentFile: 'a.mp3' } }),
      JSON.stringify({ type: 'OTHER', message: 'ignored' }),
      JSON.stringify({ unrelated: true }),
    ].join('\n');
    expect(parseProgressEvents(chunk).map(e => e.type)).toEqual(['START', 'PROGRESS']);
  });
});

describe('transcriptPathFor', () => {
  it('maps audio/<podcast>/<file>.mp3 to transcripts/<podcast>/<file>.srt', () => {
    expect(transcriptPathFor('/files/s3/sites/x/audio/pod/ep 1.mp3')).toBe('/files/s3/sites/x/transcripts/pod/ep 1.srt');
  });
});

describe('runParallelTranscription', () => {
  const site = (id: string) => ({ id, domain: `${id}.browse.show`, title: id, description: '' });

  /** A fake lambda that reports progress per file, and fails for site "broken". */
  function fakeLambda(calls: RunLambdaLocallyOptions[]) {
    return async (options: RunLambdaLocallyOptions): Promise<RunLambdaLocallyResult> => {
      calls.push(options);
      for (const key of options.files ?? []) {
        options.onStdout?.(JSON.stringify({ type: 'PROGRESS', message: 'done', data: { completedMinutes: 1, currentFile: key } }) + '\n');
      }
      if (options.siteId !== 'broken') {
        options.onStdout?.(JSON.stringify({ type: 'COMPLETE', message: 'done', data: { completedFiles: options.files?.length ?? 0 } }) + '\n');
      }
      const broken = options.siteId === 'broken';
      return {
        success: !broken,
        exitCode: broken ? 1 : 0,
        duration: 5,
        // No summary line: the count must come from the COMPLETE event
        stdout: '',
        stderr: '',
        error: broken ? 'Exit code: 1' : undefined,
      };
    };
  }

  it('runs each site batch with its files, aggregates results per site, and isolates failures', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-test-'));
    const calls: RunLambdaLocallyOptions[] = [];
    const files = [file('a', '1', 30), file('a', '2', 20), file('broken', '3', 25), file('b', '4', 10)];

    const results = await runParallelTranscription({
      sites: [site('a'), site('broken'), site('b'), site('idle')],
      parallel: 2,
      files,
      logDir,
      live: false,
      runLambda: fakeLambda(calls),
    });

    // Every file was sent to exactly one lambda run, for the right site
    expect(calls.flatMap(c => c.files ?? []).sort()).toEqual(files.map(f => f.key).sort());
    for (const call of calls) {
      expect(call.lambda).toBe('process-audio');
      expect(files.filter(f => call.files!.includes(f.key)).every(f => f.siteId === call.siteId)).toBe(true);
    }

    const bySite = Object.fromEntries(results.map(r => [r.siteId, r]));
    expect(bySite.a).toMatchObject({ success: true, transcribed: 2 });
    expect(bySite.b).toMatchObject({ success: true, transcribed: 1 });
    expect(bySite.broken.success).toBe(false);
    expect(bySite.broken.errors[0]).toContain('failed');
    expect(bySite.idle).toMatchObject({ success: true, transcribed: 0, duration: 0 });
    expect(fs.readdirSync(logDir).sort()).toEqual(['worker-1.log', 'worker-2.log']);

    vi.restoreAllMocks();
  });
});
