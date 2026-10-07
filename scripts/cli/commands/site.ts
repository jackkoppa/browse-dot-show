import { csv, parseFlags, UsageError } from '../../lib/args.js';
import { resolveSite, resolveSites } from '../../lib/sites.js';
import { main as runSiteCreator } from '../../site-creator/main.js';
import { printEquivalentCommand, runTsxScript, siteProcessEnv, type Command } from '../command.js';

/**
 * Deploy, destroy and upload run the existing scripts in scripts/deploy/ as child processes,
 * with the site's env, so the Terraform invocation (backend config, tfvars, state buckets)
 * behaves exactly as before.
 */

export const siteCreateCommand: Command = {
  path: ['site', 'create'],
  summary: 'Create a new site (interactive wizard)',
  usage: `
USAGE
  pnpm bds site create [--review]

OPTIONS
  --review      Show setup progress for every site, without continuing setup

Walks through creating a site in sites/my-sites/: podcast lookup, config, theme, first
episodes, and (optionally) deployment. Progress is saved, so it can be resumed.
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, { review: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } });
    if (!ctx.interactive) throw new UsageError('site create is interactive; run it in a terminal.');
    await runSiteCreator({ review: flags.review });
    return 0;
  },
};

export const siteDeployCommand: Command = {
  path: ['site', 'deploy'],
  summary: "Deploy a site's infrastructure (Terraform) and client",
  usage: `
USAGE
  pnpm bds site deploy --site=<id> [--interactive]

OPTIONS
  --site=<id>       Site to deploy (prompted for in a terminal if omitted)
  --interactive     Ask about optional steps (tests, lint, client upload) and confirm the
                    Terraform plan before applying

Uses the site's AWS SSO profile from sites/<group>/<id>/.env.aws-sso.
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, {
      site: { type: 'string' },
      interactive: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    });
    const site = await resolveSite({ site: flags.site, interactive: ctx.interactive, operation: 'deployment' });
    if (!site) return 130;
    if (!flags.site) printEquivalentCommand(['site deploy', `--site=${site.id}`, ...(flags.interactive ? ['--interactive'] : [])]);
    return runTsxScript('scripts/deploy/site-deploy.ts', flags.interactive ? ['--interactive'] : [], siteProcessEnv(site.id));
  },
};

export const siteUploadClientCommand: Command = {
  path: ['site', 'upload-client'],
  summary: "Build and upload sites' client (web app) to S3, and invalidate CloudFront",
  usage: `
USAGE
  pnpm bds site upload-client --site=<id>
  pnpm bds site upload-client (--sites=a,b | --all-sites) [--dry-run]

OPTIONS
  --site=<id>       One site, using its AWS SSO profile (.env.aws-sso)
  --sites=a,b       Several sites, using the automation credentials (.env.automation)
  --all-sites       Every deployed site, using the automation credentials
  --dry-run         With --sites/--all-sites: list what would be uploaded
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, {
      site: { type: 'string' },
      sites: { type: 'string' },
      'all-sites': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    });

    if (flags.site) {
      if (flags.sites || flags['all-sites']) throw new UsageError('Use either --site or --sites/--all-sites, not both.');
      const site = await resolveSite({ site: flags.site, interactive: false });
      return runTsxScript('scripts/deploy/upload-client.ts', ['prod', site!.id], siteProcessEnv(site!.id));
    }

    const sites = await resolveSites({
      sites: csv(flags.sites),
      allSites: flags['all-sites'],
      interactive: ctx.interactive,
      operation: 'client upload',
    });
    if (sites.length === 0) return 130;

    const args = [`--sites=${sites.map(s => s.id).join(',')}`, ...(flags['dry-run'] ? ['--dry-run'] : [])];
    if (!flags.sites && !flags['all-sites']) printEquivalentCommand(['site upload-client', ...args]);
    return runTsxScript('scripts/deploy/upload-all-client-sites.ts', args);
  },
};

export const siteDestroyCommand: Command = {
  path: ['site', 'destroy'],
  summary: "Destroy a site's AWS infrastructure (asks for typed confirmation)",
  usage: `
USAGE
  pnpm bds site destroy --site=<id>

Runs terraform destroy for the site, after a typed confirmation. Must be run in a terminal.
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, { site: { type: 'string' }, help: { type: 'boolean', short: 'h' } });
    if (!ctx.interactive) throw new UsageError('site destroy needs a terminal for its confirmation prompt.');
    const site = await resolveSite({ site: flags.site, interactive: true, operation: 'infrastructure destruction' });
    if (!site) return 130;
    return runTsxScript('scripts/deploy/site-destroy.ts', [], siteProcessEnv(site.id));
  },
};
