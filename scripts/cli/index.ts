#!/usr/bin/env tsx

/**
 * bds: the browse.show developer CLI.
 *
 *   pnpm bds                    interactive menu
 *   pnpm bds <command> [flags]  run a command non-interactively
 *
 * Commands live in ./commands and are registered (with the menu tree) in ./registry.ts.
 */

import prompts from 'prompts';
import { UsageError } from '../lib/args.js';
import { REPO_ROOT } from '../lib/paths.js';
import { isInteractive } from '../lib/sites.js';
import { commandName, type Command, type CommandContext } from './command.js';
import { commandsInGroup, findCommand, helpText, MENU, type MenuNode } from './registry.js';

const BACK = Symbol('back');

async function pickFromMenu(nodes: MenuNode[], message: string, allowBack: boolean): Promise<Command | null> {
  for (;;) {
    const { choice } = await prompts({
      type: 'select',
      name: 'choice',
      message,
      choices: [
        ...nodes.map(node => ({
          title: 'children' in node ? `${node.label} ›` : node.label,
          description: 'command' in node ? `bds ${commandName(node.command)}` : undefined,
          value: node,
        })),
        ...(allowBack ? [{ title: '‹ Back', value: BACK }] : []),
      ],
    });
    if (choice === undefined) return null; // Ctrl+C / Esc
    if (choice === BACK) return null;
    if ('command' in choice) return choice.command;

    const picked = await pickFromMenu(choice.children, choice.label, true);
    if (picked) return picked;
  }
}

async function runCommand(command: Command, argv: string[], ctx: CommandContext): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`bds ${commandName(command)}: ${command.summary}\n${command.usage}`);
    return 0;
  }
  return command.run(argv, ctx);
}

async function main(argv: string[]): Promise<number> {
  // Commands resolve paths from the repo root; make relative paths in child processes do the same
  process.chdir(REPO_ROOT);
  const ctx: CommandContext = { interactive: isInteractive() };

  if (argv.length === 0) {
    if (!ctx.interactive) {
      console.log(helpText());
      return 2;
    }
    const command = await pickFromMenu(MENU, 'What do you want to do?', false);
    return command ? runCommand(command, [], ctx) : 130;
  }

  if (argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
    const target = argv[1] ? findCommand(argv.slice(1)) : null;
    console.log(target ? `bds ${commandName(target.command)}: ${target.command.summary}\n${target.command.usage}` : helpText());
    return 0;
  }

  const found = findCommand(argv);
  if (found) return runCommand(found.command, found.rest, ctx);

  // A group word on its own (e.g. `bds site`): prompt for which command, or list them
  const group = commandsInGroup(argv[0]);
  if (group.length > 0 && argv.length === 1) {
    if (!ctx.interactive) {
      console.log(`bds ${argv[0]} commands:\n${group.map(c => `  bds ${commandName(c).padEnd(24)}${c.summary}`).join('\n')}`);
      return 2;
    }
    const command = await pickFromMenu(group.map(c => ({ label: c.summary, command: c })), `bds ${argv[0]}`, false);
    return command ? runCommand(command, [], ctx) : 130;
  }

  throw new UsageError(`Unknown command: ${argv.join(' ')}. Run \`pnpm bds help\` for the list.`);
}

process.on('SIGINT', () => {
  console.log('\n⚠️  Cancelled');
  process.exit(130);
});

main(process.argv.slice(2))
  .then(code => process.exit(code))
  .catch(error => {
    if (error instanceof UsageError) {
      console.error(`❌ ${error.message}`);
      process.exit(2);
    }
    console.error(`❌ ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exit(1);
  });
