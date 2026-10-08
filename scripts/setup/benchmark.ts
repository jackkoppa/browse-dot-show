import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { onShutdown } from '../lib/shutdown.js';

const execFileAsync = promisify(execFile);

/**
 * Transcription throughput for 1..N parallel whisper workers on this Mac, to choose
 * `transcriptionWorkers`. Each worker is a whisper-cli process, as in real runs; the same
 * set of episodes is transcribed for every N, split across workers by duration.
 * Reads episodes in place (read-only); transcripts go to a temp folder that's removed.
 */

export interface AudioFile {
  path: string;
  minutes: number;
}

export interface BenchmarkResult {
  workers: number;
  audioMinutes: number;
  wallMinutes: number;
  /** Audio minutes transcribed per wall-clock minute. */
  throughput: number;
  failures: number;
}

/** Up to `limit` .mp3 files under `dir` (recursive), sorted by path for a stable choice. */
export function findMp3s(dir: string, limit = 500): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    if (found.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= limit) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith('.mp3')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

export async function audioMinutes(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(stdout.trim()) / 60;
}

/**
 * Pick files, in order, until their total reaches `targetMinutes` and there are at least
 * `minFiles` (so every worker has work), skipping very short or long ones.
 */
export function pickFiles(files: AudioFile[], targetMinutes: number, minFiles = 1): AudioFile[] {
  const picked: AudioFile[] = [];
  let total = 0;
  for (const file of files) {
    if (total >= targetMinutes && picked.length >= minFiles) break;
    if (file.minutes < 5 || file.minutes > 180) continue;
    picked.push(file);
    total += file.minutes;
  }
  return picked;
}

/** Split files across `workers` queues, longest first onto the least-loaded queue. */
export function splitAcrossWorkers(files: AudioFile[], workers: number): AudioFile[][] {
  const queues = Array.from({ length: workers }, () => ({ minutes: 0, files: [] as AudioFile[] }));
  for (const file of [...files].sort((a, b) => b.minutes - a.minutes)) {
    const queue = queues.reduce((least, q) => (q.minutes < least.minutes ? q : least));
    queue.files.push(file);
    queue.minutes += file.minutes;
  }
  return queues.map(queue => queue.files).filter(queue => queue.length > 0);
}

function transcribe(cli: string, model: string, file: string, outBase: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(cli, ['-m', model, '-f', file, '--output-srt', '-of', outBase], { stdio: 'ignore' });
    const unregister = onShutdown(() => {
      child.kill('SIGTERM');
    });
    child.on('error', () => resolve(false));
    child.on('close', code => {
      unregister();
      resolve(code === 0);
    });
  });
}

export async function runBenchmark(
  { cli, model, files, workers }: { cli: string; model: string; files: AudioFile[]; workers: number },
  log: (line: string) => void,
): Promise<BenchmarkResult> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-benchmark-'));
  const queues = splitAcrossWorkers(files, workers);
  const audio = files.reduce((sum, file) => sum + file.minutes, 0);
  let failures = 0;
  let done = 0;
  const start = Date.now();
  try {
    await Promise.all(queues.map(async (queue, q) => {
      for (const [i, file] of queue.entries()) {
        const ok = await transcribe(cli, model, file.path, path.join(outDir, `w${q}-${i}`));
        if (!ok) failures++;
        done += file.minutes;
        log(`   ${workers} worker(s): ${Math.round((done / audio) * 100)}% (${path.basename(file.path)}${ok ? '' : ', FAILED'})`);
      }
    }));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  const wall = (Date.now() - start) / 60_000;
  return { workers, audioMinutes: audio, wallMinutes: wall, throughput: audio / wall, failures };
}

/**
 * The smallest worker count within `tolerance` of the best throughput: extra workers that
 * barely help just use memory (about 2 GB each with large-v3-turbo).
 */
export function recommendWorkers(results: BenchmarkResult[], tolerance = 0.07): number {
  const valid = results.filter(result => result.failures === 0);
  if (valid.length === 0) return 1;
  const best = Math.max(...valid.map(result => result.throughput));
  return valid.filter(result => result.throughput >= best * (1 - tolerance)).sort((a, b) => a.workers - b.workers)[0].workers;
}
