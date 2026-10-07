import prompts from 'prompts';
import { oneOf, parseFlags, UsageError } from '../../lib/args.js';
import { runTsxScript, type Command } from '../command.js';

/**
 * Shared infrastructure outside the per-site stacks. Runs the existing scripts in
 * scripts/deploy/ unchanged.
 *
 * - homepage: the browse.show site (terraform/homepage)
 * - automation: the automation IAM user and its permission to assume each site's
 *   browse-dot-show-automation-role (terraform/automation). Scheduled ingestion depends on it.
 */
const TARGETS = {
  homepage: {
    deploy: 'scripts/deploy/deploy-homepage.ts',
    'bootstrap-state': 'scripts/deploy/bootstrap-homepage-state.ts',
  },
  automation: {
    deploy: 'scripts/deploy/deploy-automation.ts',
    'bootstrap-state': 'scripts/deploy/bootstrap-automation-state.ts',
  },
} as const;

type Target = keyof typeof TARGETS;
type Action = 'deploy' | 'bootstrap-state';
const ACTIONS: Action[] = ['deploy', 'bootstrap-state'];

function infraCommand(target: Target, description: string): Command {
  return {
    path: ['infra', target],
    summary: description,
    usage: `
USAGE
  pnpm bds infra ${target} <deploy|bootstrap-state>

ACTIONS
  deploy            Deploy with Terraform
  bootstrap-state   One-time: create the Terraform state bucket
`,
    async run(argv, ctx) {
      const [first, ...rest] = argv;
      const positional = first && !first.startsWith('-') ? first : undefined;
      parseFlags(positional ? rest : argv, { help: { type: 'boolean', short: 'h' } });

      let action = oneOf('action', positional, ACTIONS);
      if (!action) {
        if (!ctx.interactive) throw new UsageError(`Which action? One of: ${ACTIONS.join(', ')}`);
        ({ action } = await prompts({
          type: 'select',
          name: 'action',
          message: `${target}: what do you want to do?`,
          choices: [
            { title: 'Deploy', value: 'deploy' },
            { title: 'Bootstrap Terraform state (one-time)', value: 'bootstrap-state' },
          ],
        }));
        if (!action) return 130;
      }
      return runTsxScript(TARGETS[target][action]);
    },
  };
}

export const infraHomepageCommand = infraCommand('homepage', 'Deploy the browse.show homepage, or bootstrap its Terraform state');
export const infraAutomationCommand = infraCommand(
  'automation',
  'Deploy the automation IAM user + cross-account access, or bootstrap its Terraform state'
);
