import { describe, expect, it } from 'vitest';
import { parseEnv } from '../lib/env.js';
import { setEnvValues } from './env-file.js';

describe('setEnvValues', () => {
  it('replaces existing keys in place, keeping comments', () => {
    const content = '# whisper\nWHISPER_API_PROVIDER=\nWHISPER_CPP_PATH=""\n# end\n';
    expect(setEnvValues(content, { WHISPER_API_PROVIDER: 'local-whisper.cpp', WHISPER_CPP_PATH: '/a b/whisper.cpp' })).toBe(
      '# whisper\nWHISPER_API_PROVIDER=local-whisper.cpp\nWHISPER_CPP_PATH="/a b/whisper.cpp"\n# end\n',
    );
  });

  it('appends missing keys', () => {
    expect(setEnvValues('A=1\n', { B: '2' })).toBe('A=1\nB=2\n');
    expect(setEnvValues('A=1', { B: '2' })).toBe('A=1\nB=2\n');
    expect(setEnvValues('', { B: '2' })).toBe('B=2\n');
  });

  it('round-trips through parseEnv', () => {
    const value = '/Users/dev/Library/Application Support/browse-dot-show/whisper.cpp';
    expect(parseEnv(setEnvValues('', { WHISPER_CPP_PATH: value })).WHISPER_CPP_PATH).toBe(value);
  });
});
