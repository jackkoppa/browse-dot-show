import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureHomebrewWhisperLayout, findHomebrewWhisperCli, whisperModelUrl, whisperPaths } from './whisper.js';

describe('Homebrew whisper layout', () => {
  let tmp: string;
  let brewCli: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bds-whisper-'));
    brewCli = path.join(tmp, 'homebrew', 'whisper-cli');
    fs.mkdirSync(path.dirname(brewCli), { recursive: true });
    fs.writeFileSync(brewCli, '#!/bin/sh\n', { mode: 0o755 });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('lays out a folder like a whisper.cpp checkout', () => {
    const dir = path.join(tmp, 'whisper.cpp');
    const paths = ensureHomebrewWhisperLayout(dir, brewCli, 'large-v3-turbo');

    expect(paths.cli).toBe(path.join(dir, 'build/bin/whisper-cli'));
    expect(paths.model).toBe(path.join(dir, 'models/ggml-large-v3-turbo.bin'));
    expect(paths.cliLinkTarget).toBe(brewCli);
    expect(fs.existsSync(paths.cli)).toBe(true);
    expect(fs.statSync(path.join(dir, 'models')).isDirectory()).toBe(true);
  });

  it('is idempotent and repoints a stale link', () => {
    const dir = path.join(tmp, 'whisper.cpp');
    ensureHomebrewWhisperLayout(dir, path.join(tmp, 'old-whisper-cli'), 'base');
    ensureHomebrewWhisperLayout(dir, brewCli, 'base');
    expect(ensureHomebrewWhisperLayout(dir, brewCli, 'base').cliLinkTarget).toBe(brewCli);
  });

  it('leaves a source build alone', () => {
    const dir = path.join(tmp, 'checkout');
    const built = path.join(dir, 'build/bin/whisper-cli');
    fs.mkdirSync(path.dirname(built), { recursive: true });
    fs.writeFileSync(built, 'binary');

    const paths = ensureHomebrewWhisperLayout(dir, brewCli, 'base');
    expect(paths.cliLinkTarget).toBeUndefined();
    expect(fs.readFileSync(built, 'utf8')).toBe('binary');
  });

  it('finds the first existing Homebrew binary', () => {
    expect(findHomebrewWhisperCli([path.join(tmp, 'nope'), brewCli])).toBe(brewCli);
    expect(findHomebrewWhisperCli([path.join(tmp, 'nope')])).toBeNull();
  });

  it('builds model paths and URLs', () => {
    expect(whisperPaths('/w', 'base').model).toBe('/w/models/ggml-base.bin');
    expect(whisperModelUrl('large-v3-turbo')).toBe('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin');
  });
});
