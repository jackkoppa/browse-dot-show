import { parseArgs, type ParseArgsConfig } from 'node:util';

/** A problem with how a command was invoked. Commands print the message and exit with code 2. */
export class UsageError extends Error {}

type FlagOptions = NonNullable<ParseArgsConfig['options']>;

/**
 * Parse `--flag` / `--flag=value` arguments with `node:util` `parseArgs`. Unknown flags and
 * positional arguments are rejected with a `UsageError`.
 */
export function parseFlags<O extends FlagOptions>(argv: string[], options: O) {
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

/** Split a comma-separated flag value: `"a, b,,c"` → `["a", "b", "c"]`. */
export function csv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

/** Parse a positive integer flag value, or throw a `UsageError` naming the flag. */
export function positiveInt(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`--${flag} must be a positive integer (got "${value}")`);
  }
  return parsed;
}

/** Validate a flag value against a fixed set of choices. */
export function oneOf<T extends string>(flag: string, value: string | undefined, choices: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (!(choices as readonly string[]).includes(value)) {
    throw new UsageError(`--${flag} must be one of: ${choices.join(', ')} (got "${value}")`);
  }
  return value as T;
}
