import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { repoPath } from '../lib/paths.js';
import { getSiteAccountMapping } from '../lib/site-accounts.js';
import { SITES_TERRAFORM_DIR, siteInitArgs, sitePlanArgs, siteTerraformEnv } from '../lib/site-terraform.js';
import { ensureSiteLayerZips } from './lambda-layers.js';
import { renderPlanComment, riskyChanges, summarizePlan, unapprovedChanges, type PlanSummary } from './plan-summary.js';

/**
 * `bds ci terraform`: plan or apply one Terraform target (`site:<id>` or `homepage`) for
 * GitHub Actions, with the same backend config and variables as a local deploy.
 *
 * - plan:  init + plan (read-only, no state lock) → `<out>/summary.json`
 * - apply: init + plan → refuse if the plan creates, replaces or destroys anything that isn't
 *          in the approved summary (or, with requireApproval, if there's no approved summary
 *          at all) → apply → `<out>/summary.json`
 *
 * Credentials come from the environment (OIDC in CI), or AWS_PROFILE locally. Only the
 * summary (addresses and actions) is written: the JSON plan and tfplan contain secrets.
 */

export type CiTerraformMode = 'plan' | 'apply';

export interface CiTerraformOptions {
  target: string;
  mode: CiTerraformMode;
  outDir: string;
  /** Apply mode: the summary approved on the PR (missing file = nothing risky was approved). */
  approvedSummaryPath?: string;
  /** Apply mode: refuse any change unless an approved summary exists (merged PRs). */
  requireApproval?: boolean;
  /** Site targets: run in this copy of terraform/sites instead (parallel runs; see terraform-group.ts) */
  workDir?: string;
  /** Where output goes (default: this process's stdout/stderr) */
  output?: NodeJS.WritableStream;
}

interface TargetConfig {
  cwd: string;
  env: NodeJS.ProcessEnv;
  initArgs: string[];
  planArgs: (lock: boolean) => string[];
  /** Runs before init (e.g. fetching files Terraform reads that aren't in git) */
  prepare?: () => Promise<void>;
}

/** `site:haveaword` → `site-haveaword`: directory and artifact names */
export function targetSlug(target: string): string {
  return target.replace(':', '-');
}

function targetConfig(target: string, workDir?: string): TargetConfig {
  const env = { ...process.env, AWS_REGION: process.env.AWS_REGION || 'us-east-1', TF_IN_AUTOMATION: '1' };
  if (target === 'homepage') {
    // Same as scripts/deploy/deploy-homepage.ts; the provider falls back to environment credentials
    return {
      cwd: repoPath('terraform/homepage'),
      env,
      initArgs: ['init', '-backend-config=terraform.tfbackend'],
      planArgs: lock => ['plan', '-var-file=homepage-prod.tfvars', ...(lock ? [] : ['-lock=false']), '-out=tfplan'],
    };
  }
  const siteId = target.match(/^site:(.+)$/)?.[1];
  if (!siteId) throw new Error(`Unknown target "${target}": use site:<id> or homepage`);
  getSiteAccountMapping(siteId); // only deployed sites
  const cwd = workDir ?? SITES_TERRAFORM_DIR;
  return {
    cwd,
    env: { ...siteTerraformEnv(process.env.OPENAI_API_KEY), ...env },
    initArgs: siteInitArgs(siteId),
    planArgs: lock => sitePlanArgs(siteId, { awsProfile: process.env.AWS_PROFILE, lock }),
    prepare: () => ensureSiteLayerZips(siteId, path.join(cwd, 'lambda-layers')),
  };
}

/** Run with output streamed to `out`; resolves with the exit code. */
function runLive(args: string[], config: TargetConfig, out: NodeJS.WritableStream): Promise<number> {
  out.write(`\n$ terraform ${args.join(' ')}\n`);
  return new Promise(resolve => {
    const child = spawn('terraform', args, { cwd: config.cwd, env: config.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on('error', error => {
      out.write(`Failed to start terraform: ${error.message}\n`);
      resolve(1);
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

/** `terraform show -json tfplan`, captured and never printed (it contains sensitive values). */
function showPlanJson(config: TargetConfig, out: NodeJS.WritableStream): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('terraform', ['show', '-json', 'tfplan'], { cwd: config.cwd, env: config.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.pipe(out, { end: false });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`terraform show -json exited with ${code}`));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function readSummary(filePath: string | undefined): PlanSummary | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export async function runCiTerraform(options: CiTerraformOptions): Promise<number> {
  const config = targetConfig(options.target, options.workDir);
  const out = options.output ?? process.stdout;
  const log = (message: string) => out.write(message + '\n');
  fs.mkdirSync(options.outDir, { recursive: true });
  const summaryPath = path.join(options.outDir, 'summary.json');

  try {
    await config.prepare?.();
    if ((await runLive(config.initArgs, config, out)) !== 0) return 1;
    // PR plans run with a read-only role, so they can't take the state lock
    if ((await runLive(config.planArgs(options.mode === 'apply'), config, out)) !== 0) return 1;

    const summary = summarizePlan(options.target, (await showPlanJson(config, out)) as never);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
    log('\n' + renderPlanComment([summary], { marker: '' }).trim());

    if (options.mode === 'plan') return 0;

    const approved = readSummary(options.approvedSummaryPath);
    if (options.requireApproval && !approved && summary.changes.length > 0) {
      log(`\n❌ Not applying ${options.target}: no plan for it was approved on the PR.`);
      log('   Approve it on a PR, or deploy locally (`bds site deploy` / `bds infra homepage deploy`).');
      return 1;
    }
    const unapproved = unapprovedChanges(summary, approved);
    if (unapproved.length > 0) {
      log(`\n❌ Not applying ${options.target}: this plan has changes that weren't approved on the PR:`);
      unapproved.forEach(change => log(`   ${change.action} ${change.address}`));
      log('   Review the plan above, then deploy locally (`bds site deploy` / `bds infra homepage deploy`) or re-run after approval.');
      return 1;
    }
    if (summary.changes.length === 0) {
      log(`\n✅ ${options.target}: no changes`);
      return 0;
    }
    if (riskyChanges(summary).length > 0) log(`\nApplying approved changes for ${options.target}`);
    return await runLive(['apply', '-auto-approve', 'tfplan'], config, out);
  } catch (error) {
    log(`\n❌ ${options.target}: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    fs.rmSync(path.join(config.cwd, 'tfplan'), { force: true });
  }
}
