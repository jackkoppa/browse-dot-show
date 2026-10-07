import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadSiteEnv } from './env.js';
import { repoPath } from './paths.js';

/**
 * The ingestion lambdas, and running one locally for a site.
 *
 * Locally, a lambda's entry file runs directly with tsx, with the site's env loaded and
 * `FILE_STORAGE_ENV=local`, so it reads and writes the local S3 mirror
 * (`<local-files>/s3/sites/<siteId>/…`).
 */

export type IngestionLambdaId = 'rss-retrieval' | 'process-audio' | 'srt-indexing';

export interface IngestionLambda {
  id: IngestionLambdaId;
  title: string;
  description: string;
  packageName: string;
  /** Package directory, relative to the repo root. */
  packageDir: string;
  /** Entry file, relative to the package directory. */
  entry: string;
  /** The deployed function's name (see terraform/sites/main.tf). */
  awsFunctionName: (siteId: string) => string;
}

export const INGESTION_LAMBDAS: Record<IngestionLambdaId, IngestionLambda> = {
  'rss-retrieval': {
    id: 'rss-retrieval',
    title: 'RSS retrieval',
    description: 'Retrieve RSS feeds and download new audio files',
    packageName: '@browse-dot-show/rss-retrieval-lambda',
    packageDir: 'packages/ingestion/rss-retrieval-lambda',
    entry: 'retrieve-rss-feeds-and-download-audio-files.ts',
    awsFunctionName: siteId => `rss-retrieval-${siteId}`,
  },
  'process-audio': {
    id: 'process-audio',
    title: 'Transcription',
    description: 'Transcribe new audio files with whisper',
    packageName: '@browse-dot-show/process-audio-lambda',
    packageDir: 'packages/ingestion/process-audio-lambda',
    entry: 'process-new-audio-files-via-whisper.ts',
    awsFunctionName: siteId => `whisper-transcription-${siteId}`,
  },
  'srt-indexing': {
    id: 'srt-indexing',
    title: 'Search indexing',
    description: 'Convert SRT files into search index entries',
    packageName: '@browse-dot-show/srt-indexing-lambda',
    packageDir: 'packages/ingestion/srt-indexing-lambda',
    entry: 'convert-srts-indexed-search.ts',
    awsFunctionName: siteId => `srt-indexing-${siteId}`,
  },
};

/** Heap limit for lambda child processes; indexing large sites needs well over Node's default. */
export const LAMBDA_NODE_OPTIONS = '--max-old-space-size=9728';

function withHeapLimit(nodeOptions: string | undefined): string {
  if (nodeOptions?.includes('--max-old-space-size')) return nodeOptions;
  return [nodeOptions, LAMBDA_NODE_OPTIONS].filter(Boolean).join(' ');
}

export const INGESTION_LAMBDA_IDS = Object.keys(INGESTION_LAMBDAS) as IngestionLambdaId[];

export function isIngestionLambdaId(value: string): value is IngestionLambdaId {
  return value in INGESTION_LAMBDAS;
}

/**
 * How to start tsx. Prefer running tsx's CLI with the current node binary, so this works
 * without `tsx` (or even `node`) on PATH, e.g. under launchd.
 */
function tsxCommand(): { command: string; prefixArgs: string[] } {
  const tsxCli = repoPath('node_modules/tsx/dist/cli.mjs');
  if (fs.existsSync(tsxCli)) {
    return { command: process.execPath, prefixArgs: [tsxCli] };
  }
  return { command: 'tsx', prefixArgs: [] };
}

export interface RunLambdaLocallyOptions {
  lambda: IngestionLambdaId;
  siteId: string;
  /** Extra CLI args for the entry file. */
  args?: string[];
  /** Extra env vars, applied last. */
  env?: Record<string, string>;
  /**
   * - `inherit` (default): stream the child's output to this process's stdout/stderr
   * - `quiet`: capture output without printing it
   */
  output?: 'inherit' | 'quiet';
  /** Called with each chunk of the child's stdout. */
  onStdout?: (chunk: string) => void;
  /** Called with the child process once it has started (e.g. to kill it on Ctrl+C). */
  onSpawn?: (child: import('child_process').ChildProcess) => void;
}

export interface RunLambdaLocallyResult {
  success: boolean;
  exitCode: number | null;
  duration: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/** Run an ingestion lambda locally for one site. Never throws; check `success`. */
export function runLambdaLocally(options: RunLambdaLocallyOptions): Promise<RunLambdaLocallyResult> {
  const { lambda: lambdaId, siteId, args = [], env = {}, output = 'inherit', onStdout, onSpawn } = options;
  const lambda = INGESTION_LAMBDAS[lambdaId];
  const startTime = Date.now();

  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    const finish = (exitCode: number | null, error?: string) =>
      resolve({
        success: exitCode === 0 && !error,
        exitCode,
        duration: Date.now() - startTime,
        stdout,
        stderr,
        error: error ?? (exitCode === 0 ? undefined : `Exit code: ${exitCode}`),
      });

    let childEnv: NodeJS.ProcessEnv;
    try {
      childEnv = {
        ...process.env,
        ...loadSiteEnv(siteId),
        SITE_ID: siteId,
        FILE_STORAGE_ENV: 'local',
        NODE_OPTIONS: withHeapLimit(process.env.NODE_OPTIONS),
        ...env,
      };
    } catch (error) {
      finish(null, error instanceof Error ? error.message : String(error));
      return;
    }

    const packageDir = repoPath(lambda.packageDir);
    const { command, prefixArgs } = tsxCommand();
    const child = spawn(command, [...prefixArgs, path.join(packageDir, lambda.entry), ...args], {
      cwd: packageDir,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    onSpawn?.(child);

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      if (output === 'inherit') process.stdout.write(text);
      onStdout?.(text);
    });
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (output === 'inherit') process.stderr.write(text);
    });
    child.on('error', error => finish(null, error.message));
    child.on('close', code => finish(code));
  });
}
