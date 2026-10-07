import { spawn } from 'child_process';
import { loadSiteEnv } from '../lib/env.js';
import { tsxCommand } from '../lib/lambda.js';
import { REPO_ROOT, repoPath } from '../lib/paths.js';

/**
 * A `bds` subcommand. Every command runs non-interactively when given its flags, and
 * prompts for anything missing only when `ctx.interactive` is true (a TTY).
 */
export interface Command {
  /** Words after `bds`, e.g. `['site', 'deploy']`. */
  path: string[];
  /** One line, shown in the menu and in `bds help`. */
  summary: string;
  /** Flags and examples, shown by `bds <command> --help`. */
  usage: string;
  /** Returns the process exit code. Throw a `UsageError` for bad invocations (exit code 2). */
  run(argv: string[], ctx: CommandContext): Promise<number>;
}

export interface CommandContext {
  /** True when it's OK to prompt (stdin and stdout are a TTY). */
  interactive: boolean;
}

export const commandName = (command: Command) => command.path.join(' ');

/** Run a process with inherited stdio from the repo root; resolves with its exit code. */
export function runProcess(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
    child.on('error', error => {
      console.error(`❌ Failed to start ${command}: ${error.message}`);
      resolve(1);
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

/** Run a TypeScript script (path relative to the repo root) with tsx. */
export function runTsxScript(scriptPath: string, args: string[] = [], env?: NodeJS.ProcessEnv): Promise<number> {
  const { command, prefixArgs } = tsxCommand();
  return runProcess(command, [...prefixArgs, repoPath(scriptPath), ...args], { env });
}

/** `process.env` plus a site's env (`.env.aws-sso` over `.env.local`) and `SITE_ID`. */
export function siteProcessEnv(siteId: string): NodeJS.ProcessEnv {
  return { ...process.env, ...loadSiteEnv(siteId), SITE_ID: siteId };
}

/** Print the non-interactive equivalent of what the user chose in prompts. */
export function printEquivalentCommand(args: string[]): void {
  console.log(`\n💡 Non-interactive equivalent: pnpm bds ${args.join(' ')}\n`);
}
