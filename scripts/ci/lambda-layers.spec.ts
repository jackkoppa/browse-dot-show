import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSiteLayerZips, sha256Base64, siteLayerZips, type LayerDeps } from './lambda-layers.js';

describe('ensureSiteLayerZips', () => {
  let dir: string;
  const zip = Buffer.from('layer zip bytes');

  function deps(overrides: Partial<LayerDeps> = {}): LayerDeps {
    return {
      latestLayerVersion: vi.fn(async (layerName: string) => ({ arn: `arn:aws:lambda:us-east-1:1:layer:${layerName}:3`, codeSha256: sha256Base64(zip), url: `https://example.com/${layerName}` })),
      download: vi.fn(async () => zip),
      log: () => {},
      ...overrides,
    };
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('names the layers the way terraform/sites/main.tf does', () => {
    expect(siteLayerZips('haveaword')).toEqual([
      { file: 'ffmpeg-layer.zip', layerName: 'ffmpeg-haveaword' },
      { file: 'mongodb-js-zstd__msgpackr.zip', layerName: 'compress-encode-haveaword' },
    ]);
  });

  it('downloads each missing zip from the latest deployed layer version', async () => {
    const d = deps();
    await ensureSiteLayerZips('haveaword', dir, d);
    expect(d.latestLayerVersion).toHaveBeenCalledWith('ffmpeg-haveaword');
    expect(d.latestLayerVersion).toHaveBeenCalledWith('compress-encode-haveaword');
    expect(fs.readFileSync(path.join(dir, 'ffmpeg-layer.zip'))).toEqual(zip);
    expect(fs.readFileSync(path.join(dir, 'mongodb-js-zstd__msgpackr.zip'))).toEqual(zip);
  });

  it('keeps zips that already exist (local deploys use your own files)', async () => {
    fs.writeFileSync(path.join(dir, 'ffmpeg-layer.zip'), 'local');
    const d = deps();
    await ensureSiteLayerZips('haveaword', dir, d);
    expect(fs.readFileSync(path.join(dir, 'ffmpeg-layer.zip'), 'utf8')).toBe('local');
    expect(d.latestLayerVersion).toHaveBeenCalledTimes(1);
  });

  it('refuses a download that does not match CodeSha256', async () => {
    await expect(ensureSiteLayerZips('haveaword', dir, deps({ download: async () => Buffer.from('tampered') }))).rejects.toThrow(/doesn't match its CodeSha256/);
    expect(fs.existsSync(path.join(dir, 'ffmpeg-layer.zip'))).toBe(false);
  });

  it('explains what to do when a layer has never been deployed', async () => {
    await expect(ensureSiteLayerZips('newsite', dir, deps({ latestLayerVersion: async () => undefined }))).rejects.toThrow(/Deploy newsite locally first/);
  });
});
