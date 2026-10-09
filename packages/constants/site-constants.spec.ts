import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getAudioDirPrefix,
  getContentScope,
  getEpisodeManifestKey,
  getLocalDbPath,
  getSearchEntriesDirPrefix,
  getSearchIndexKey,
  getTranscriptsDirPrefix,
} from './site-constants.js';

const ENV_KEYS = ['SITE_ID', 'FILE_STORAGE_ENV', 'CONTENT_SCOPE'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  process.env.SITE_ID = 'listenfairplay';
  delete process.env.CONTENT_SCOPE;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('public keys (unchanged)', () => {
  it('in AWS', () => {
    process.env.FILE_STORAGE_ENV = 'prod-s3';
    expect(getSearchIndexKey()).toBe('search-index/orama_index.msp');
    expect(getEpisodeManifestKey()).toBe('episode-manifest/full-episode-manifest.json');
    expect(getAudioDirPrefix()).toBe('audio/');
    expect(getLocalDbPath()).toBe('/tmp/orama_index_listenfairplay.msp');
  });

  it('locally', () => {
    process.env.FILE_STORAGE_ENV = 'local';
    expect(getSearchIndexKey()).toBe('sites/listenfairplay/search-index/orama_index.msp');
    expect(getTranscriptsDirPrefix()).toBe('sites/listenfairplay/transcripts/');
  });
});

describe('subscriber scope', () => {
  it('from CONTENT_SCOPE, under subscriber/', () => {
    process.env.FILE_STORAGE_ENV = 'prod-s3';
    process.env.CONTENT_SCOPE = 'subscriber';
    expect(getContentScope()).toBe('subscriber');
    expect(getSearchIndexKey()).toBe('subscriber/search-index/orama_index.msp');
    expect(getEpisodeManifestKey()).toBe('subscriber/episode-manifest/full-episode-manifest.json');
    expect(getLocalDbPath()).toBe('/tmp/orama_index_listenfairplay_subscriber.msp');
  });

  it('locally', () => {
    process.env.FILE_STORAGE_ENV = 'local';
    process.env.CONTENT_SCOPE = 'subscriber';
    expect(getAudioDirPrefix()).toBe('sites/listenfairplay/subscriber/audio/');
  });

  it('an explicit scope overrides CONTENT_SCOPE', () => {
    process.env.FILE_STORAGE_ENV = 'prod-s3';
    process.env.CONTENT_SCOPE = 'subscriber';
    expect(getSearchEntriesDirPrefix('public')).toBe('search-entries/');
    delete process.env.CONTENT_SCOPE;
    expect(getSearchEntriesDirPrefix('subscriber')).toBe('subscriber/search-entries/');
  });

  it('rejects unknown scopes', () => {
    process.env.CONTENT_SCOPE = 'private';
    expect(() => getContentScope()).toThrow('Invalid CONTENT_SCOPE');
  });
});
