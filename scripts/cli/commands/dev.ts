import { spawn } from 'child_process';
import { parseFlags } from '../../lib/args.js';
import { REPO_ROOT } from '../../lib/paths.js';
import { resolveSite } from '../../lib/sites.js';
import { printEquivalentCommand, runProcess, runTsxScript, siteProcessEnv, type Command } from '../command.js';

const SITE_FLAGS = { site: { type: 'string' }, help: { type: 'boolean', short: 'h' } } as const;

export const devClientCommand: Command = {
  path: ['dev', 'client'],
  summary: 'Start the client dev server (+ local assets and search lambda) for a site',
  usage: `
USAGE
  pnpm bds dev client --site=<id>

Runs the Vite dev server, the local S3 asset server and the local search lambda together,
then opens the site in your browser.
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, SITE_FLAGS);
    const site = await resolveSite({ site: flags.site, interactive: ctx.interactive, operation: 'client development' });
    if (!site) return 130;
    if (!flags.site) printEquivalentCommand(['dev client', `--site=${site.id}`]);

    const child = spawn(
      'concurrently',
      [
        '"pnpm --filter @browse-dot-show/client _vite-dev"',
        '"pnpm --filter @browse-dot-show/client _serve-s3-assets"',
        '"pnpm --filter @browse-dot-show/search-lambda dev:local"',
      ],
      { cwd: REPO_ROOT, env: siteProcessEnv(site.id), shell: true, stdio: ['inherit', 'pipe', 'pipe'] }
    );

    // Open the browser once Vite prints its local URL
    let opened = false;
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      const match = text.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
      if (match && !opened) {
        opened = true;
        setTimeout(() => spawn('open', [match[1]], { stdio: 'ignore' }), 2000);
      }
    });
    child.stderr.pipe(process.stderr);

    return new Promise(resolve => child.on('close', code => resolve(code ?? 0)));
  },
};

export const devSearchHealthCommand: Command = {
  path: ['dev', 'search-health'],
  summary: "Run the search lambda's health check locally for a site",
  usage: `
USAGE
  pnpm bds dev search-health --site=<id>
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, SITE_FLAGS);
    const site = await resolveSite({ site: flags.site, interactive: ctx.interactive, operation: 'search lambda health check' });
    if (!site) return 130;
    return runProcess('pnpm', ['--filter', '@browse-dot-show/search-lambda', 'dev:health-check'], { env: siteProcessEnv(site.id) });
  },
};

export const devHomepageCommand: Command = {
  path: ['dev', 'homepage'],
  summary: 'Start the browse.show homepage dev server',
  usage: `
USAGE
  pnpm bds dev homepage
`,
  async run(argv) {
    parseFlags(argv, { help: { type: 'boolean', short: 'h' } });
    return runProcess('pnpm', ['--filter', 'homepage', 'dev']);
  },
};

export const worktreeCommand: Command = {
  path: ['worktree'],
  summary: 'Manage git worktrees (create / list / remove / prune / link-config)',
  usage: `
USAGE
  pnpm bds worktree <create|list|remove|prune|link-config|help> [branch|path]
`,
  async run(argv) {
    // worktree.ts has its own positional argument handling
    return runTsxScript('scripts/worktree.ts', argv);
  },
};
