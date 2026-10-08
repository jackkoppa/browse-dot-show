import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { repoPath } from '../lib/paths.js';
import { SITES_TERRAFORM_DIR } from '../lib/site-terraform.js';
import { runCiTerraform, targetSlug, type CiTerraformMode } from './terraform.js';

/**
 * `bds ci terraform-group`: plan or apply several Terraform targets in one job (the workflows
 * run one job per AWS account, so a PR shows a few checks instead of one per site).
 *
 * Site targets run in parallel, each in its own copy of terraform/sites
 * (`terraform/.ci-<slug>/`, the same depth, so `../../packages/...` and the backend paths still
 * resolve), with its own `.terraform/`, `tfplan` and lambda layer zips. The first target runs
 * alone to fill the shared provider cache. Each target's output is printed as one block when it
 * finishes. Every target runs even if another fails; the exit code is 1 if any failed.
 *
 * Summaries go to `<out>/plan-summary-<slug>/summary.json`; in apply mode the approved summary
 * for a target is read from `<approvedDir>/plan-summary-<slug>/summary.json`.
 */

export interface TerraformGroupOptions {
  targets: string[];
  mode: CiTerraformMode;
  outDir: string;
  approvedDir?: string;
  requireApproval?: boolean;
  concurrency?: number;
}

export interface TargetResult {
  target: string;
  exitCode: number;
  seconds: number;
}

/** Files and folders not copied into a target's working copy */
const COPY_EXCLUDES = new Set(['.terraform', '.terraform.lock.hcl', 'tfplan', '.DS_Store']);

export function workDirFor(target: string): string {
  return repoPath('terraform', `.ci-${targetSlug(target)}`);
}

function copySiteStack(workDir: string): void {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.cpSync(SITES_TERRAFORM_DIR, workDir, {
    recursive: true,
    filter: source => !COPY_EXCLUDES.has(path.basename(source)) && !/^lambda_function_.*\.zip$/.test(path.basename(source)),
  });
}

/** Run `items` through `worker`, at most `limit` at a time, keeping their order in the result. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runTarget(target: string, options: TerraformGroupOptions): Promise<TargetResult> {
  const started = Date.now();
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', chunk => chunks.push(chunk));
  const isSite = target.startsWith('site:');
  const workDir = isSite ? workDirFor(target) : undefined;
  const slug = targetSlug(target);
  console.log(`▶ ${target}: started`);
  let exitCode: number;
  try {
    if (workDir) copySiteStack(workDir);
    exitCode = await runCiTerraform({
      target,
      mode: options.mode,
      outDir: path.join(options.outDir, `plan-summary-${slug}`),
      approvedSummaryPath: options.approvedDir && path.join(options.approvedDir, `plan-summary-${slug}`, 'summary.json'),
      requireApproval: options.requireApproval,
      workDir,
      output,
    });
  } catch (error) {
    output.write(`\n❌ ${target}: ${error instanceof Error ? error.message : String(error)}\n`);
    exitCode = 1;
  } finally {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  // One block per target, collapsible in the Actions log
  console.log(`::group::${exitCode === 0 ? '✅' : '❌'} ${target} (${seconds}s)`);
  console.log(Buffer.concat(chunks).toString('utf8'));
  console.log('::endgroup::');
  return { target, exitCode, seconds };
}

export function renderGroupSummary(results: TargetResult[], mode: CiTerraformMode): string {
  const failed = results.filter(result => result.exitCode !== 0);
  return [
    `### Terraform ${mode}: ${results.length - failed.length}/${results.length} succeeded`,
    '',
    '| Target | Result | Time |',
    '| --- | --- | --- |',
    ...results.map(result => `| \`${result.target}\` | ${result.exitCode === 0 ? '✅' : '❌ failed'} | ${result.seconds}s |`),
  ].join('\n');
}

export async function runTerraformGroup(options: TerraformGroupOptions): Promise<{ exitCode: number; results: TargetResult[] }> {
  if (options.targets.length === 0) throw new Error('No targets');
  // A provider cache shared by the targets' `terraform init`s (the repo has no lock files)
  process.env.TF_PLUGIN_CACHE_DIR ||= path.join(os.tmpdir(), 'bds-terraform-plugin-cache');
  process.env.TF_PLUGIN_CACHE_MAY_BREAK_DEPENDENCY_LOCK_FILE = 'true';
  fs.mkdirSync(process.env.TF_PLUGIN_CACHE_DIR, { recursive: true });

  const [first, ...rest] = options.targets;
  const results = [await runTarget(first, options), ...(await mapWithConcurrency(rest, options.concurrency ?? 4, target => runTarget(target, options)))];
  return { exitCode: results.some(result => result.exitCode !== 0) ? 1 : 0, results };
}
