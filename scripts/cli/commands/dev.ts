import { spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import { getSiteById } from '@browse-dot-show/sites';
import { parseFlags } from '../../lib/args.js';
import { REPO_ROOT } from '../../lib/paths.js';
import { resolveSite } from '../../lib/sites.js';
import { hasSubscriberDemoData, indexSubscriberDemoData, SUBSCRIBER_DEMO_ROOT, writeSubscriberDemoData } from '../../lib/subscriber-demo.js';
import { printEquivalentCommand, runProcess, runTsxScript, siteProcessEnv, type Command } from '../command.js';

const SITE_FLAGS = { site: { type: 'string' }, help: { type: 'boolean', short: 'h' } } as const;

export const devClientCommand: Command = {
  path: ['dev', 'client'],
  summary: 'Start the client dev server (+ local assets and search lambda) for a site',
  usage: `
USAGE
  pnpm bds dev client --site=<id> [--subscriber-demo [--reseed]]

Runs the Vite dev server, the local S3 asset server and the local search lambda together,
then opens the site in your browser.

  --subscriber-demo  Subscriber access, all local: dummy episodes (in .subscriber-demo/, not your
                     local files), the subscriber search lambda, and the auth server with fake
                     Supporting Cast and Patreon. Works for any site. See docs/local-development.md
  --reseed           Rewrite the demo's dummy data first
`,
  async run(argv, ctx) {
    const flags = parseFlags(argv, { ...SITE_FLAGS, 'subscriber-demo': { type: 'boolean' }, reseed: { type: 'boolean' } });
    const site = await resolveSite({ site: flags.site, interactive: ctx.interactive, operation: 'client development' });
    if (!site) return 130;
    if (!flags.site) printEquivalentCommand(['dev client', `--site=${site.id}`]);

    const commands = [
      '"pnpm --filter @browse-dot-show/client _vite-dev"',
      '"pnpm --filter @browse-dot-show/client _serve-s3-assets"',
      '"pnpm --filter @browse-dot-show/search-lambda dev:local"',
    ];
    let env = siteProcessEnv(site.id);
    let openPath = '';
    if (flags['subscriber-demo']) {
      const demo = prepareSubscriberDemo(site.id, env, Boolean(flags.reseed));
      if (!demo) return 1;
      env = demo.env;
      openPath = '?subscriberPreview=1';
      commands.push(
        '"CONTENT_SCOPE=subscriber SEARCH_DEV_SERVER_PORT=3003 pnpm --filter @browse-dot-show/search-lambda dev:local"',
        '"pnpm --filter @browse-dot-show/auth-lambda dev:local"',
      );
    }

    const child = spawn('concurrently', commands, { cwd: REPO_ROOT, env, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });

    // Open the browser once Vite prints its local URL
    let opened = false;
    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      const match = text.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
      if (match && !opened) {
        opened = true;
        setTimeout(() => spawn('open', [`${match[1]}${openPath}`], { stdio: 'ignore' }), 2000);
      }
    });
    child.stderr.pipe(process.stderr);

    return new Promise(resolve => child.on('close', code => resolve(code ?? 0)));
  },
};

/** The demo's dummy data (written and indexed if needed) and its env: local fakes, keys and URLs */
function prepareSubscriberDemo(siteId: string, baseEnv: NodeJS.ProcessEnv, reseed: boolean): { env: NodeJS.ProcessEnv } | null {
  if (reseed || !hasSubscriberDemoData(siteId)) {
    console.log(`🧪 Writing dummy episodes for ${siteId} to ${SUBSCRIBER_DEMO_ROOT}`);
    const { audio } = writeSubscriberDemoData(siteId);
    if (!audio) console.log('   (No ffmpeg, so no audio: the player will show an error)');
    if (!indexSubscriberDemoData(siteId, baseEnv)) {
      console.error('❌ Indexing the dummy episodes failed');
      return null;
    }
  }

  // A throwaway signing key: the auth server signs with it, the subscriber search lambda verifies
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const providers = getSiteById(siteId)?.subscriberAccess?.providers ?? ['supporting-cast', 'patreon', 'dev-code'];
  const origins = ['http://localhost:5137', 'http://127.0.0.1:5137'];

  console.log(`
🧪 Subscriber demo for ${siteId} (all local; dummy data in .subscriber-demo/)
   Open http://localhost:5137/?subscriberPreview=1, then the lock icon in the header:
   - Supporting Cast: subscriber@example.com gets a login link (printed below, and at
     http://localhost:3002/fake-inbox); lapsed@example.com and other emails get nothing
   - Patreon: the fake Patreon page lets you pick who you are
   - Preview code: local-dev-code-0123456789
   Search for "pressing" or "goalkeeper": logged in, subscriber-only episodes show up too.
`);
  return {
    env: {
      ...baseEnv,
      FILE_STORAGE_ENV: 'local',
      BDS_LOCAL_FILES_PATH: SUBSCRIBER_DEMO_ROOT,
      BDS_SUBSCRIBER_DEMO: '1',
      VITE_SUBSCRIBER_AUTH_API_URL: 'http://localhost:3002',
      VITE_SUBSCRIBER_API_URL: 'http://localhost:3003/subscriber',
      AUTH_DEV_FAKES: '1',
      AUTH_SITES: JSON.stringify({ [siteId]: { origins, providers } }),
      AUTH_DEV_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      SUBSCRIBER_TOKEN_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      LOCAL_ASSETS_BASE_URL: 'http://127.0.0.1:8080/',
    },
  };
}

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
