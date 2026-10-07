import { execFile, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { getLocalS3SitePath } from '@browse-dot-show/config';
import { runLambdaLocally } from '../lib/lambda.js';
import { repoPath } from '../lib/paths.js';
import { onShutdown } from '../lib/shutdown.js';
import type { Site } from '../lib/sites.js';

/**
 * Transcribe untranscribed audio for many sites at once, with N parallel workers.
 *
 * 1. Plan: find .mp3 files without a matching .srt in each site's local mirror, measure their
 *    durations with ffprobe, and split them across N workers, balanced by duration.
 * 2. Run: each worker transcribes its files one site at a time, by running the process-audio
 *    lambda locally (a child process per site, so a whisper crash only affects that run).
 * 3. Progress: the lambda prints JSON progress events on stdout; they're combined into one
 *    live view on a terminal, or periodic log lines otherwise (e.g. scheduled runs).
 */

const execFileAsync = promisify(execFile);

export interface AudioFile {
  siteId: string;
  /** Key relative to the site root, e.g. `audio/<podcastId>/<file>.mp3`. */
  key: string;
  fullPath: string;
  durationMinutes: number;
}

export interface WorkerPlan {
  workerId: string;
  files: AudioFile[];
  totalMinutes: number;
}

export interface SiteTranscriptionResult {
  siteId: string;
  success: boolean;
  /** Transcripts created (from the lambda's summary). */
  transcribed: number;
  /** Wall-clock time spent on this site's files, summed across workers. */
  duration: number;
  errors: string[];
}

// ---------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------

/** The transcript path the lambda writes for an audio file. */
export function transcriptPathFor(audioPath: string): string {
  const podcastDir = path.basename(path.dirname(audioPath));
  const siteRoot = path.dirname(path.dirname(path.dirname(audioPath)));
  return path.join(siteRoot, 'transcripts', podcastDir, `${path.basename(audioPath, '.mp3')}.srt`);
}

function listMp3Files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMp3Files(fullPath);
    return entry.isFile() && entry.name.endsWith('.mp3') ? [fullPath] : [];
  });
}

async function audioDurationMinutes(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath]);
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds / 60 : 0;
  } catch {
    return 0;
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Untranscribed audio files for the given sites, with durations. */
export async function findUntranscribedFiles(sites: Site[]): Promise<AudioFile[]> {
  const pending = sites.flatMap(site => {
    const siteRoot = getLocalS3SitePath(site.id);
    return listMp3Files(path.join(siteRoot, 'audio'))
      .filter(fullPath => !fs.existsSync(transcriptPathFor(fullPath)))
      .map(fullPath => ({ siteId: site.id, key: path.relative(siteRoot, fullPath), fullPath }));
  });

  return mapWithLimit(pending, 8, async file => ({ ...file, durationMinutes: await audioDurationMinutes(file.fullPath) }));
}

/**
 * Split files across `workerCount` workers, balanced by duration: longest files first, each
 * to the worker with the least total so far. Workers with no files are omitted. Within a
 * worker, files are grouped by site (in `siteOrder`), since each lambda run handles one site.
 */
export function assignToWorkers(files: AudioFile[], workerCount: number, siteOrder: string[] = []): WorkerPlan[] {
  const count = Math.max(1, Math.min(workerCount, files.length));
  const workers: WorkerPlan[] = Array.from({ length: count }, (_, i) => ({ workerId: `worker-${i + 1}`, files: [], totalMinutes: 0 }));
  // Files with an unknown duration (ffprobe failed) count as 1 minute so they still spread out
  const weight = (file: AudioFile) => file.durationMinutes || 1;
  const balance = workers.map(() => 0);

  for (const file of [...files].sort((a, b) => weight(b) - weight(a))) {
    const index = balance.indexOf(Math.min(...balance));
    workers[index].files.push(file);
    workers[index].totalMinutes += file.durationMinutes;
    balance[index] += weight(file);
  }

  const order = (siteId: string) => {
    const index = siteOrder.indexOf(siteId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  for (const worker of workers) {
    worker.files.sort((a, b) => order(a.siteId) - order(b.siteId) || a.siteId.localeCompare(b.siteId));
  }
  return workers.filter(worker => worker.files.length > 0);
}

/** Group a worker's files into consecutive per-site batches. */
export function groupBySite(files: AudioFile[]): { siteId: string; files: AudioFile[] }[] {
  const groups: { siteId: string; files: AudioFile[] }[] = [];
  for (const file of files) {
    const last = groups[groups.length - 1];
    if (last && last.siteId === file.siteId) last.files.push(file);
    else groups.push({ siteId: file.siteId, files: [file] });
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------

interface ProgressEvent {
  type: 'START' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
  message: string;
  data?: { completedMinutes?: number; currentFile?: string };
}

/** Parse the lambda's JSON progress events out of a chunk of stdout. */
export function parseProgressEvents(chunk: string): ProgressEvent[] {
  return chunk.split('\n').flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"type"')) return [];
    try {
      const event = JSON.parse(trimmed);
      return ['START', 'PROGRESS', 'COMPLETE', 'ERROR'].includes(event.type) ? [event as ProgressEvent] : [];
    } catch {
      return [];
    }
  });
}

interface WorkerState {
  plan: WorkerPlan;
  /** Minutes finished in earlier site batches. */
  doneMinutes: number;
  /** Minutes finished in the current site batch. */
  currentMinutes: number;
  status: string;
  finished: boolean;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;
}

function progressBar(fraction: number, width = 30): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

class ProgressDisplay {
  private lastRenderedLines = 0;
  private timer?: NodeJS.Timeout;
  private readonly startTime = Date.now();
  private lastLogLine = 0;

  constructor(
    private readonly workers: WorkerState[],
    private readonly totalMinutes: number,
    private readonly live: boolean,
    private readonly logIntervalMs = 5 * 60 * 1000
  ) {}

  start(): void {
    if (this.live) this.timer = setInterval(() => this.render(), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.live) this.render();
    else this.logSummaryLine();
  }

  /** In log mode: called on each event; prints one line per finished file, plus a periodic summary. */
  event(worker: WorkerState, text: string): void {
    if (this.live) return;
    console.log(`[${new Date().toISOString()}] ${worker.plan.workerId}: ${text}`);
    if (Date.now() - this.lastLogLine >= this.logIntervalMs) this.logSummaryLine();
  }

  private completedMinutes(): number {
    return this.workers.reduce((sum, w) => sum + w.doneMinutes + w.currentMinutes, 0);
  }

  private eta(completed: number): string {
    const elapsedMinutes = (Date.now() - this.startTime) / 60000;
    if (completed <= 0 || elapsedMinutes <= 0) return 'calculating…';
    const remaining = ((this.totalMinutes - completed) / completed) * elapsedMinutes;
    return `${formatMinutes(remaining)} remaining (~${new Date(Date.now() + remaining * 60000).toLocaleTimeString()})`;
  }

  private logSummaryLine(): void {
    this.lastLogLine = Date.now();
    const completed = this.completedMinutes();
    const pct = this.totalMinutes > 0 ? (completed / this.totalMinutes) * 100 : 100;
    console.log(`[${new Date().toISOString()}] transcription ${pct.toFixed(1)}% (${formatMinutes(completed)} / ${formatMinutes(this.totalMinutes)} of audio), ${this.eta(completed)}`);
  }

  private render(): void {
    const completed = this.completedMinutes();
    const fraction = this.totalMinutes > 0 ? completed / this.totalMinutes : 1;
    const elapsed = formatMinutes((Date.now() - this.startTime) / 60000);
    const lines = [
      `🎙️  Transcription — ${progressBar(fraction)} ${(fraction * 100).toFixed(1)}%  (${formatMinutes(completed)} / ${formatMinutes(this.totalMinutes)} of audio, ${elapsed} elapsed, ${this.eta(completed)})`,
      ...this.workers.map(w => {
        const done = w.doneMinutes + w.currentMinutes;
        const pct = w.plan.totalMinutes > 0 ? (done / w.plan.totalMinutes) * 100 : 100;
        return `   ${w.finished ? '✅' : '⏳'} ${w.plan.workerId}: ${pct.toFixed(0).padStart(3)}%  ${w.status}`.slice(0, (process.stdout.columns || 120) - 1);
      }),
    ];
    if (this.lastRenderedLines > 0) process.stdout.write(`\x1b[${this.lastRenderedLines}A`);
    process.stdout.write(lines.map(line => `\x1b[2K${line}`).join('\n') + '\n');
    this.lastRenderedLines = lines.length;
  }
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

export interface ParallelTranscriptionOptions {
  sites: Site[];
  parallel: number;
  /** Where each worker's full lambda output is written. */
  logDir?: string;
  /** Live single-terminal view. Defaults to true when stdout is a TTY. */
  live?: boolean;
  /** Files to transcribe, instead of scanning (used in tests). */
  files?: AudioFile[];
  /** Runs one lambda batch (overridable in tests). */
  runLambda?: typeof runLambdaLocally;
}

/** Transcribe every untranscribed file for `sites` with `parallel` workers. */
export async function runParallelTranscription(options: ParallelTranscriptionOptions): Promise<SiteTranscriptionResult[]> {
  const { sites, parallel, live = Boolean(process.stdout.isTTY), runLambda = runLambdaLocally } = options;
  const results = new Map<string, SiteTranscriptionResult>(
    sites.map(site => [site.id, { siteId: site.id, success: true, transcribed: 0, duration: 0, errors: [] }])
  );

  console.log(`🔍 Finding untranscribed audio for ${sites.length} site(s)…`);
  const files = options.files ?? (await findUntranscribedFiles(sites));
  if (files.length === 0) {
    console.log('✅ Nothing to transcribe.');
    return [...results.values()];
  }

  const plans = assignToWorkers(files, parallel, sites.map(s => s.id));
  const totalMinutes = files.reduce((sum, f) => sum + f.durationMinutes, 0);
  const perSite = new Map<string, { count: number; minutes: number }>();
  for (const file of files) {
    const entry = perSite.get(file.siteId) ?? { count: 0, minutes: 0 };
    perSite.set(file.siteId, { count: entry.count + 1, minutes: entry.minutes + file.durationMinutes });
  }
  console.log(`📋 ${files.length} file(s), ${formatMinutes(totalMinutes)} of audio, across ${plans.length} worker(s):`);
  for (const [siteId, { count, minutes }] of perSite) console.log(`   ${siteId}: ${count} file(s), ${formatMinutes(minutes)}`);

  const logDir = options.logDir ?? repoPath('scripts/automation-logs/transcription', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(logDir, { recursive: true });
  console.log(`📝 Worker logs: ${logDir}\n`);

  const states: WorkerState[] = plans.map(plan => ({ plan, doneMinutes: 0, currentMinutes: 0, status: 'starting…', finished: false }));
  const display = new ProgressDisplay(states, totalMinutes, live);
  const running = new Set<ChildProcess>();
  let stopping = false;
  const unregister = onShutdown(async () => {
    stopping = true;
    // Ask each lambda to stop; it releases its lockfile entries before exiting
    await Promise.all(
      [...running].map(child => new Promise<void>(resolve => {
        child.once('close', () => resolve());
        child.kill('SIGINT');
      }))
    );
  });

  display.start();
  try {
    await Promise.all(states.map(async state => {
      const logStream = fs.createWriteStream(path.join(logDir, `${state.plan.workerId}.log`), { flags: 'a' });
      try {
        for (const batch of groupBySite(state.plan.files)) {
          if (stopping) break;
          const batchMinutes = batch.files.reduce((sum, f) => sum + f.durationMinutes, 0);
          state.currentMinutes = 0;
          state.status = `[${batch.siteId}] ${batch.files.length} file(s), ${formatMinutes(batchMinutes)}`;
          display.event(state, `starting ${batch.siteId}: ${batch.files.length} file(s), ${formatMinutes(batchMinutes)}`);
          logStream.write(`\n===== ${new Date().toISOString()} ${batch.siteId}: ${batch.files.map(f => f.key).join(', ')}\n`);

          const result = await runLambda({
            lambda: 'process-audio',
            siteId: batch.siteId,
            files: batch.files.map(f => f.key),
            env: { WORKER_ID: state.plan.workerId },
            output: 'quiet',
            onSpawn: child => {
              running.add(child);
              child.once('close', () => running.delete(child));
            },
            onStdout: chunk => {
              logStream.write(chunk);
              for (const event of parseProgressEvents(chunk)) {
                if (event.type === 'PROGRESS') {
                  state.currentMinutes = Math.min(event.data?.completedMinutes ?? state.currentMinutes, batchMinutes);
                  state.status = `[${batch.siteId}] done: ${event.data?.currentFile ?? ''}`;
                  display.event(state, `${batch.siteId}: transcribed ${event.data?.currentFile ?? ''}`);
                }
              }
            },
          });
          logStream.write(result.stderr ? `\n----- stderr\n${result.stderr}\n` : '');

          const siteResult = results.get(batch.siteId)!;
          siteResult.duration += result.duration;
          const transcribedMatch = result.stdout.match(/✅ Successfully Processed: (\d+)/);
          siteResult.transcribed += transcribedMatch ? parseInt(transcribedMatch[1], 10) : 0;
          if (!result.success) {
            siteResult.success = false;
            siteResult.errors.push(`Transcription (${state.plan.workerId}) failed: ${result.error}. See ${path.join(logDir, `${state.plan.workerId}.log`)}`);
            display.event(state, `❌ ${batch.siteId} failed (${result.error})`);
          }
          // Count the whole batch as done, even if some files failed, so progress reaches 100%
          state.doneMinutes += batchMinutes;
          state.currentMinutes = 0;
        }
      } finally {
        state.finished = true;
        state.status = stopping ? 'stopped' : 'done';
        display.event(state, 'finished');
        // Wait for the log to be flushed, so it's complete when the run returns
        await new Promise<void>(resolve => logStream.end(() => resolve()));
      }
    }));
  } finally {
    display.stop();
    unregister();
  }

  return [...results.values()];
}
