import { describe, it, expect } from 'vitest';
import { commandName } from './command.js';
import { COMMANDS, commandsInGroup, findCommand, helpText } from './registry.js';

describe('command registry', () => {
  it('has unique command paths', () => {
    const names = COMMANDS.map(commandName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lists every command in the help text', () => {
    const help = helpText();
    for (const command of COMMANDS) expect(help).toContain(commandName(command));
  });

  it('gives every command a summary and usage', () => {
    for (const command of COMMANDS) {
      expect(command.summary.length, commandName(command)).toBeGreaterThan(0);
      expect(command.usage, commandName(command)).toContain('USAGE');
    }
  });

  it('routes argv to the longest matching command', () => {
    expect(commandName(findCommand(['site', 'deploy', '--site=x'])!.command)).toBe('site deploy');
    expect(findCommand(['site', 'deploy', '--site=x'])!.rest).toEqual(['--site=x']);
    expect(commandName(findCommand(['ingest'])!.command)).toBe('ingest');
    expect(findCommand(['validate', 'sites'])!.rest).toEqual(['sites']);
    expect(findCommand(['nope'])).toBeNull();
    expect(findCommand(['site'])).toBeNull();
  });

  it('groups commands by their first word', () => {
    expect(commandsInGroup('site').map(commandName)).toEqual(['site create', 'site deploy', 'site upload-client', 'site destroy']);
  });
});
