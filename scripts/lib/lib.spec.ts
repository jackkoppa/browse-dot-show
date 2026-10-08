import { describe, it, expect } from 'vitest';
import { csv, oneOf, parseFlags, positiveInt, UsageError } from './args.js';
import { parseEnv } from './env.js';
import { localFilesBase } from './machine-config.js';
import { repoPath } from './paths.js';
import { resolveSites, type Site } from './sites.js';

describe('parseEnv', () => {
  it('parses keys, quotes, comments, blank lines and export prefixes', () => {
    const content = [
      '# comment',
      '',
      'PLAIN=value',
      'DOUBLE="quoted value"',
      "SINGLE='single'",
      'export EXPORTED=yes',
      'WITH_EQUALS=a=b=c',
      '  SPACED = padded  ',
      'EMPTY=',
      'not a valid line',
    ].join('\n');

    expect(parseEnv(content)).toEqual({
      PLAIN: 'value',
      DOUBLE: 'quoted value',
      SINGLE: 'single',
      EXPORTED: 'yes',
      WITH_EQUALS: 'a=b=c',
      SPACED: 'padded',
      EMPTY: '',
    });
  });

  it('keeps a lone quote character as-is', () => {
    expect(parseEnv('QUOTE="')).toEqual({ QUOTE: '"' });
  });
});

describe('args', () => {
  it('parses known flags and rejects unknown ones', () => {
    const options = { sites: { type: 'string' }, 'dry-run': { type: 'boolean' } } as const;
    expect(parseFlags(['--sites=a,b', '--dry-run'], options)).toEqual({ sites: 'a,b', 'dry-run': true });
    expect(() => parseFlags(['--nope'], options)).toThrow(UsageError);
    expect(() => parseFlags(['positional'], options)).toThrow(UsageError);
  });

  it('splits comma-separated values', () => {
    expect(csv(undefined)).toBeUndefined();
    expect(csv('a, b,,c ')).toEqual(['a', 'b', 'c']);
  });

  it('validates positive integers', () => {
    expect(positiveInt('n', undefined)).toBeUndefined();
    expect(positiveInt('n', '3')).toBe(3);
    expect(() => positiveInt('n', '0')).toThrow(UsageError);
    expect(() => positiveInt('n', '2.5')).toThrow(UsageError);
    expect(() => positiveInt('n', 'x')).toThrow(UsageError);
  });

  it('validates choices', () => {
    expect(oneOf('env', 'local', ['local', 'prod'])).toBe('local');
    expect(oneOf('env', undefined, ['local', 'prod'])).toBeUndefined();
    expect(() => oneOf('env', 'staging', ['local', 'prod'])).toThrow(UsageError);
  });
});

describe('resolveSites', () => {
  const site = (id: string): Site => ({ id, domain: `${id}.browse.show`, title: id, description: '' });
  const available = [site('alpha'), site('beta'), site('gamma')];

  it('returns every site for allSites', async () => {
    expect(await resolveSites({ allSites: true, available, interactive: false })).toEqual(available);
  });

  it('returns explicit sites in the given order', async () => {
    const result = await resolveSites({ sites: ['gamma', 'alpha'], available, interactive: false });
    expect(result.map(s => s.id)).toEqual(['gamma', 'alpha']);
  });

  it('rejects unknown sites', async () => {
    await expect(resolveSites({ sites: ['nope'], available, interactive: false })).rejects.toThrow(/Unknown site/);
  });

  it('fails fast instead of prompting when not interactive', async () => {
    await expect(resolveSites({ available, interactive: false })).rejects.toThrow(UsageError);
  });

  it('uses the only site without prompting', async () => {
    expect(await resolveSites({ available: [site('solo')], interactive: false })).toEqual([site('solo')]);
  });

  it('enforces a single site when multiple is false', async () => {
    await expect(resolveSites({ sites: ['alpha', 'beta'], multiple: false, available, interactive: false })).rejects.toThrow(UsageError);
    await expect(resolveSites({ allSites: true, multiple: false, available, interactive: false })).rejects.toThrow(UsageError);
  });
});

describe('localFilesBase', () => {
  it('returns the configured folder even when it does not exist (no fallback to aws-local-dev)', () => {
    expect(localFilesBase({ localFilesPath: '/Volumes/not-mounted/local-files' })).toBe('/Volumes/not-mounted/local-files');
  });

  it('resolves a relative folder against the repo root', () => {
    expect(localFilesBase({ localFilesPath: 'some-folder' })).toBe(repoPath('some-folder'));
  });
});
