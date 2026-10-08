import { commandName, type Command } from './command.js';
import { ciAffectedCommand, ciPlanCommentCommand, ciTerraformCommand, ciTerraformGroupCommand, ciUploadHomepageCommand } from './commands/ci.js';
import { scheduleCommand, setupMachineCommand } from './commands/coming-soon.js';
import { devClientCommand, devHomepageCommand, devSearchHealthCommand, worktreeCommand } from './commands/dev.js';
import { doctorCommand } from './commands/doctor.js';
import { infraAutomationCommand, infraGithubActionsCommand, infraHomepageCommand } from './commands/infra.js';
import { ingestCommand } from './commands/ingest.js';
import { lambdaRunCommand } from './commands/lambda.js';
import { siteCreateCommand, siteDeployCommand, siteDestroyCommand, siteUploadClientCommand } from './commands/site.js';
import { validateCommand } from './commands/validate.js';

export type MenuNode = { label: string; command: Command } | { label: string; children: MenuNode[] };

/** The interactive menu. Every command appears here exactly once (enforced by a test). */
export const MENU: MenuNode[] = [
  { label: 'Run ingestion pipeline', command: ingestCommand },
  { label: 'Automation (scheduled runs on this Mac) — coming soon', command: scheduleCommand },
  { label: 'Set up this machine — coming soon', command: setupMachineCommand },
  {
    label: 'Sites',
    children: [
      { label: 'Create a new site', command: siteCreateCommand },
      { label: 'Deploy a site', command: siteDeployCommand },
      { label: 'Upload client(s)', command: siteUploadClientCommand },
      { label: 'Destroy a site', command: siteDestroyCommand },
    ],
  },
  { label: 'Run a single lambda', command: lambdaRunCommand },
  {
    label: 'Develop',
    children: [
      { label: 'Client dev server', command: devClientCommand },
      { label: 'Search lambda health check', command: devSearchHealthCommand },
      { label: 'Homepage dev server', command: devHomepageCommand },
      { label: 'Git worktrees', command: worktreeCommand },
    ],
  },
  { label: 'Validate', command: validateCommand },
  {
    label: 'Shared infra (homepage, automation, GitHub Actions)',
    children: [
      { label: 'Homepage', command: infraHomepageCommand },
      { label: 'Automation IAM user + cross-account access', command: infraAutomationCommand },
      { label: 'GitHub Actions OIDC roles', command: infraGithubActionsCommand },
    ],
  },
  { label: 'Doctor (check this machine and config)', command: doctorCommand },
  {
    label: 'CI (used by GitHub Actions)',
    children: [
      { label: 'What a range of commits deploys', command: ciAffectedCommand },
      { label: 'Plan or apply one Terraform target', command: ciTerraformCommand },
      { label: 'Plan or apply several targets (one AWS account)', command: ciTerraformGroupCommand },
      { label: 'Render the Terraform plan PR comment', command: ciPlanCommentCommand },
      { label: 'Upload the built homepage', command: ciUploadHomepageCommand },
    ],
  },
];

function flatten(nodes: MenuNode[]): Command[] {
  return nodes.flatMap(node => ('command' in node ? [node.command] : flatten(node.children)));
}

export const COMMANDS: Command[] = flatten(MENU);

/** Find the command whose path is the longest prefix of `argv`. */
export function findCommand(argv: string[]): { command: Command; rest: string[] } | null {
  let best: Command | null = null;
  for (const command of COMMANDS) {
    const matches = command.path.every((word, i) => argv[i] === word);
    if (matches && (!best || command.path.length > best.path.length)) best = command;
  }
  return best ? { command: best, rest: argv.slice(best.path.length) } : null;
}

/** Commands under a group word, e.g. `site` → site create/deploy/…, for `bds site`. */
export function commandsInGroup(word: string): Command[] {
  return COMMANDS.filter(command => command.path.length > 1 && command.path[0] === word);
}

export function helpText(): string {
  const width = Math.max(...COMMANDS.map(c => commandName(c).length)) + 2;
  return `
bds: browse.show developer CLI

USAGE
  pnpm bds                     Interactive menu
  pnpm bds <command> [flags]   Run a command (no prompts when its flags are given)
  pnpm bds <command> --help    Flags and examples for a command

COMMANDS
${COMMANDS.map(c => `  ${commandName(c).padEnd(width)}${c.summary}`).join('\n')}

Exit codes: 0 success, 1 failure, 2 usage error, 130 cancelled.
`;
}
