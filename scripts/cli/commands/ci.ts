import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { oneOf, parseFlags, UsageError } from '../../lib/args.js';
import { loadHomepageEnv, loadSiteEnv } from '../../lib/env.js';
import { uploadHomepageFiles } from '../../lib/homepage-deployment.js';
import { REPO_ROOT, repoPath } from '../../lib/paths.js';
import { loadSiteAccountMappings } from '../../lib/site-accounts.js';
import { computeAffected, loadWorkspacePackages, type Affected } from '../../ci/affected.js';
import { renderPlanComment, riskyChanges, type PlanSummary } from '../../ci/plan-summary.js';
import { runCiTerraform, type CiTerraformMode } from '../../ci/terraform.js';
import type { Command } from '../command.js';

/**
 * Commands used by the GitHub Actions workflows (.github/workflows/). They also run locally,
 * e.g. `bds ci affected --base=origin/main` to see what a branch would deploy.
 */

const PLAN_COMMENT_MARKER = '<!-- bds-terraform-plan -->';

/** Append `key=value` lines to $GITHUB_OUTPUT when running in Actions. */
function setGithubOutputs(outputs: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  fs.appendFileSync(file, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
}

function appendStepSummary(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

function changedFiles(base: string, head: string): string[] {
  const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function describeAffected(affected: Affected): string {
  const list = (items: string[]) => (items.length ? items.join(', ') : 'none');
  return [
    '### What this change deploys',
    '',
    `- **Terraform (infrastructure + lambdas):** ${list(affected.terraformSites)}`,
    `- **Clients:** ${list(affected.clientSites)}`,
    `- **Homepage:** ${affected.homepage ? 'yes' : 'no'}`,
    ...affected.notes.map(note => `- ⚠️ ${note}`),
  ].join('\n');
}

export const ciAffectedCommand: Command = {
  path: ['ci', 'affected'],
  summary: 'CI: what a range of commits deploys (Terraform, clients, homepage)',
  usage: `
USAGE
  pnpm bds ci affected --base=<ref> [--head=<ref>] [--json]
  pnpm bds ci affected --all

OPTIONS
  --base=<ref>   Compare from this commit (the PR base, or the commit before a push)
  --head=<ref>   Compare to this commit (default: HEAD)
  --all          Everything: every deployed site's Terraform and client, and the homepage
  --json         Print JSON only

In GitHub Actions it also writes outputs: terraform_targets ([{target, slug, account_id}])
and client_sites ([{site, account_id}]) for job matrices, and homepage, has_terraform and
has_clients (true/false). The homepage's account comes from HOMEPAGE_AWS_ACCOUNT_ID.
`,
  async run(argv) {
    const flags = parseFlags(argv, {
      base: { type: 'string' },
      head: { type: 'string' },
      all: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    });
    const deployableSites = Object.keys(loadSiteAccountMappings()).sort();
    if (flags.all && flags.base) throw new UsageError('Use either --all or --base, not both.');
    let affected: Affected;
    if (flags.all) {
      affected = { terraformSites: deployableSites, clientSites: deployableSites, homepage: true, notes: [] };
    } else {
      if (!flags.base) throw new UsageError('Pass --base=<ref> (or --all).');
      affected = computeAffected({ changedFiles: changedFiles(flags.base, flags.head ?? 'HEAD'), packages: loadWorkspacePackages(), deployableSites });
    }

    // Matrix entries for the workflows. Role ARNs follow from the account ID
    // (arn:aws:iam::<account>:role/browse-dot-show-gha-<plan|deploy>, terraform/github-actions).
    const mappings = loadSiteAccountMappings();
    const homepageAccountId = process.env.HOMEPAGE_AWS_ACCOUNT_ID ?? '';
    if (affected.homepage && process.env.GITHUB_ACTIONS && !homepageAccountId) {
      throw new Error('HOMEPAGE_AWS_ACCOUNT_ID is not set (a repository variable).');
    }
    const terraformTargets = [
      ...affected.terraformSites.map(site => ({ target: `site:${site}`, slug: `site-${site}`, account_id: mappings[site].accountId })),
      ...(affected.homepage ? [{ target: 'homepage', slug: 'homepage', account_id: homepageAccountId }] : []),
    ];
    const clientSites = affected.clientSites.map(site => ({ site, account_id: mappings[site].accountId }));
    setGithubOutputs({
      terraform_targets: JSON.stringify(terraformTargets),
      client_sites: JSON.stringify(clientSites),
      homepage: String(affected.homepage),
      has_terraform: String(terraformTargets.length > 0),
      has_clients: String(clientSites.length > 0),
    });
    appendStepSummary(describeAffected(affected));
    console.log(flags.json ? JSON.stringify({ ...affected, terraformTargets }, null, 2) : describeAffected(affected));
    return 0;
  },
};

export const ciTerraformCommand: Command = {
  path: ['ci', 'terraform'],
  summary: 'CI: plan or apply one Terraform target, writing a plan summary',
  usage: `
USAGE
  pnpm bds ci terraform --target=<site:<id>|homepage> --mode=<plan|apply> [--out=<dir>] [--approved=<file>] [--require-approval]

OPTIONS
  --target=<t>       site:<id> (terraform/sites, with that site's backend and tfvars) or homepage
  --mode=plan        Read-only plan (no state lock); writes <out>/summary.json
  --mode=apply       Plan, then apply unless it creates, replaces or destroys anything that
                     isn't in --approved (the summary approved on the PR)
  --out=<dir>        Where summary.json goes (default: .terraform-plans/<target>)
  --approved=<file>  Approved summary.json (apply mode). Missing = nothing risky approved.
  --require-approval Apply mode: apply nothing unless --approved exists (deploys of merged PRs).
                     Without it (manual runs), in-place updates apply without an approved plan.

Credentials: the environment in GitHub Actions (OIDC). Locally, the site's .env.aws-sso
(or packages/homepage/.env.aws-sso) and .env.local, like a local deploy. Site targets need
OPENAI_API_KEY. Only resource addresses and actions are written; the raw plan contains
sensitive values and is deleted.
`,
  async run(argv) {
    const flags = parseFlags(argv, {
      target: { type: 'string' },
      mode: { type: 'string' },
      out: { type: 'string' },
      approved: { type: 'string' },
      'require-approval': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    });
    const mode = oneOf('mode', flags.mode, ['plan', 'apply'] as CiTerraformMode[]);
    if (!flags.target || !mode) throw new UsageError('Pass --target=<site:<id>|homepage> and --mode=<plan|apply>.');
    // Locally, use the same credentials as `bds site deploy` / `bds infra homepage deploy`
    if (!process.env.GITHUB_ACTIONS) {
      const siteId = flags.target.match(/^site:(.+)$/)?.[1];
      Object.assign(process.env, siteId ? loadSiteEnv(siteId) : flags.target === 'homepage' ? loadHomepageEnv() : {});
    }
    const outDir = path.resolve(flags.out ?? repoPath('.terraform-plans', flags.target.replace(':', '-')));
    return runCiTerraform({
      target: flags.target,
      mode,
      outDir,
      approvedSummaryPath: flags.approved && path.resolve(flags.approved),
      requireApproval: Boolean(flags['require-approval']),
    });
  },
};

function findSummaries(dir: string): PlanSummary[] {
  if (!fs.existsSync(dir)) return [];
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(file => path.basename(file) === 'summary.json')
    .map(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as PlanSummary)
    .sort((a, b) => a.target.localeCompare(b.target));
}

export const ciPlanCommentCommand: Command = {
  path: ['ci', 'plan-comment'],
  summary: 'CI: render the PR comment for a set of plan summaries',
  usage: `
USAGE
  pnpm bds ci plan-comment --dir=<dir> --out=<file> [--run-url=<url>]

Reads every summary.json under --dir, writes the markdown comment to --out, and sets the
GitHub outputs needs_approval (true whenever there's a plan: every Terraform plan needs
approval) and has_risky_changes (any create, replace or destroy).
`,
  async run(argv) {
    const flags = parseFlags(argv, {
      dir: { type: 'string' },
      out: { type: 'string' },
      'run-url': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    });
    if (!flags.dir || !flags.out) throw new UsageError('Pass --dir=<dir> and --out=<file>.');
    const summaries = findSummaries(path.resolve(flags.dir));
    const comment = renderPlanComment(summaries, { marker: PLAN_COMMENT_MARKER, runUrl: flags['run-url'] });
    fs.writeFileSync(path.resolve(flags.out), comment);
    // Every Terraform plan on a PR needs the developer's approval (08: decisions)
    setGithubOutputs({ needs_approval: String(summaries.length > 0), has_risky_changes: String(summaries.some(summary => riskyChanges(summary).length > 0)) });
    appendStepSummary(comment);
    console.log(comment);
    return 0;
  },
};

export const ciUploadHomepageCommand: Command = {
  path: ['ci', 'upload-homepage'],
  summary: 'CI: upload the built homepage and invalidate CloudFront',
  usage: `
USAGE
  pnpm bds ci upload-homepage

Run after \`bds ci terraform --target=homepage --mode=apply\` (which initializes
terraform/homepage) and \`pnpm --filter homepage build\`. Reads the bucket and distribution
from the homepage's Terraform outputs.
`,
  async run(argv) {
    parseFlags(argv, { help: { type: 'boolean', short: 'h' } });
    const output = (name: string) =>
      execFileSync('terraform', ['output', '-raw', name], { cwd: repoPath('terraform/homepage'), encoding: 'utf8' }).trim();
    await uploadHomepageFiles(output('s3_bucket_name'), output('cloudfront_distribution_id'));
    return 0;
  },
};
