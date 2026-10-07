import prompts from 'prompts';
import { oneOf, parseFlags, UsageError } from '../../lib/args.js';
import { resolveSite } from '../../lib/sites.js';
import { printEquivalentCommand, runProcess, siteProcessEnv, type Command } from '../command.js';

const CHECKS = {
  local: { title: "Local files: validate a site's local S3 mirror metadata", script: 'validate:all:local', needsSite: true },
  prod: { title: "S3: validate a site's files in its bucket", script: 'validate:all:prod', needsSite: true },
  consistency: { title: "Consistency: compare a site's audio, transcripts and index entries", script: 'validate:consistency', needsSite: true },
  sites: { title: 'Site configs: check every site.config.json, theme colors and assets', script: 'validate', needsSite: false },
} as const;

type CheckId = keyof typeof CHECKS;
const CHECK_IDS = Object.keys(CHECKS) as CheckId[];

export const validateCommand: Command = {
  path: ['validate'],
  summary: 'Validate site configs, local files or S3 contents',
  usage: `
USAGE
  pnpm bds validate <check> [--site=<id>]

CHECKS
${CHECK_IDS.map(id => `  ${id.padEnd(12)} ${CHECKS[id].title}`).join('\n')}

EXAMPLES
  pnpm bds validate sites
  pnpm bds validate consistency --site=haveaword
`,
  async run(argv, ctx) {
    // The check is a positional argument; everything else is flags
    const [first, ...rest] = argv;
    const positional = first && !first.startsWith('-') ? first : undefined;
    const flags = parseFlags(positional ? rest : argv, { site: { type: 'string' }, help: { type: 'boolean', short: 'h' } });

    let checkId = oneOf('check', positional, CHECK_IDS);
    if (!checkId) {
      if (!ctx.interactive) throw new UsageError(`Which check? One of: ${CHECK_IDS.join(', ')}`);
      ({ checkId } = await prompts({
        type: 'select',
        name: 'checkId',
        message: 'What do you want to validate?',
        choices: CHECK_IDS.map(id => ({ title: CHECKS[id].title, value: id })),
      }));
      if (!checkId) return 130;
    }

    const check = CHECKS[checkId];
    if (!check.needsSite) {
      return runProcess('pnpm', ['--filter', '@browse-dot-show/sites', check.script]);
    }

    const site = await resolveSite({ site: flags.site, interactive: ctx.interactive, operation: `${checkId} validation` });
    if (!site) return 130;
    if (!positional || !flags.site) printEquivalentCommand(['validate', checkId, `--site=${site.id}`]);
    return runProcess('pnpm', ['--filter', '@browse-dot-show/validation', check.script], { env: siteProcessEnv(site.id) });
  },
};
