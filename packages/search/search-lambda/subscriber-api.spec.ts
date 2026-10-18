import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSigningKeyPair, signSessionToken } from '@browse-dot-show/auth';

const manifest = {
  lastUpdated: '2026-10-09T00:00:00Z',
  episodes: [
    {
      sequentialId: 1,
      podcastId: 'football-cliches',
      title: 'Bonus: Ask Us Anything',
      fileKey: '2025-10-06_Bonus_Ask_Us_Anything--1791554251081',
      originalAudioURL: 'https://subscriber.example/audio.mp3?token=PRIVATE',
      summary: 'bonus',
      publishedAt: '2025-10-06T06:00:00.000Z',
      hasCompletedLLMAnnotations: false,
      llmAnnotations: {},
    },
  ],
};

vi.mock('@browse-dot-show/s3', () => ({
  getFile: vi.fn(async (key: string) => {
    if (key === 'subscriber/episode-manifest/full-episode-manifest.json') return Buffer.from(JSON.stringify(manifest));
    throw new Error(`unexpected getFile(${key})`);
  }),
  getFileStorageEnv: () => 'prod-s3',
  getSignedUrl: vi.fn(async (key: string, seconds: number) => `https://bucket.s3.amazonaws.com/${key}?expires=${seconds}`),
  fileExists: vi.fn(),
}));

const { authorize, clearSubscriberManifestCache, getSubscriberEpisode, getSubscriberManifest, isApiError } = await import('./subscriber-api.js');
const { handler } = await import('./search-indexed-transcripts.js');

const keys = generateSigningKeyPair();
const env = { SITE_ID: 'listenfairplay', SUBSCRIBER_TOKEN_PUBLIC_KEY: keys.publicKeyPem };
const tokenFor = (siteId = 'listenfairplay') => signSessionToken({ siteId, subject: 'dev-code:test', ttlSeconds: 3600 }, keys.privateKeyPem).token;

const savedEnv = { ...process.env };
beforeAll(() => {
  Object.assign(process.env, env, { FILE_STORAGE_ENV: 'prod-s3', CONTENT_SCOPE: 'subscriber' });
});
afterAll(() => {
  process.env = savedEnv;
});
beforeEach(() => clearSubscriberManifestCache());

describe('authorize', () => {
  it("accepts the site's tokens", () => {
    const claims = authorize({ authorization: `Bearer ${tokenFor()}` }, env);
    expect(isApiError(claims)).toBe(false);
  });

  it('rejects missing tokens and tokens for other sites', () => {
    expect(authorize({}, env)).toMatchObject({ statusCode: 401, body: JSON.stringify({ error: 'missing-token' }) });
    expect(authorize({ authorization: `Bearer ${tokenFor('libero')}` }, env)).toMatchObject({ statusCode: 401, body: JSON.stringify({ error: 'invalid-token:wrong-audience' }) });
  });

  it('accepts a public key with escaped newlines (as env vars sometimes have)', () => {
    const escaped = { ...env, SUBSCRIBER_TOKEN_PUBLIC_KEY: keys.publicKeyPem.replace(/\n/g, '\\n') };
    expect(isApiError(authorize({ authorization: `Bearer ${tokenFor()}` }, escaped))).toBe(false);
  });
});

describe('manifest and episodes', () => {
  it('lists subscriber episodes with `s` IDs and without the private feed URL', async () => {
    const { episodes } = await getSubscriberManifest();
    expect(episodes).toHaveLength(1);
    expect(episodes[0].id).toBe('s1');
    expect(JSON.stringify(episodes)).not.toContain('PRIVATE');
  });

  it('presigns the audio and transcript of a subscriber episode', async () => {
    const result = await getSubscriberEpisode('s1');
    expect(result).toMatchObject({
      episode: { id: 's1', title: 'Bonus: Ask Us Anything' },
      audioUrl: 'https://bucket.s3.amazonaws.com/subscriber/audio/football-cliches/2025-10-06_Bonus_Ask_Us_Anything--1791554251081.mp3?expires=10800',
      searchEntriesUrl: 'https://bucket.s3.amazonaws.com/subscriber/search-entries/football-cliches/2025-10-06_Bonus_Ask_Us_Anything--1791554251081.json?expires=10800',
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it('rejects public, malformed and unknown IDs', async () => {
    expect(await getSubscriberEpisode('1')).toMatchObject({ statusCode: 400 });
    expect(await getSubscriberEpisode('../etc')).toMatchObject({ statusCode: 400 });
    expect(await getSubscriberEpisode('s99')).toMatchObject({ statusCode: 404 });
  });
});

describe('handler in subscriber mode', () => {
  const apiEvent = (body: unknown, headers: Record<string, string> = {}) => ({
    requestContext: { http: { method: 'POST' } },
    headers,
    body: JSON.stringify(body),
  });

  it('requires a token for API requests, including searches', async () => {
    expect(await handler(apiEvent({ query: 'corridor' }))).toMatchObject({ statusCode: 401 });
    expect(await handler(apiEvent({ action: 'manifest' }, { authorization: `Bearer ${tokenFor('libero')}` }))).toMatchObject({ statusCode: 401 });
  });

  it('serves the manifest and episodes to subscribers', async () => {
    const headers = { authorization: `Bearer ${tokenFor()}` };
    expect(await handler(apiEvent({ action: 'manifest' }, headers))).toMatchObject({ episodes: [{ id: 's1' }] });
    expect(await handler(apiEvent({ action: 'episode', id: 's1' }, headers))).toMatchObject({ episode: { id: 's1' } });
  });
});
