import { getBearerToken, verifySessionToken, type SessionClaims } from '@browse-dot-show/auth';
import { getAudioDirPrefix, getEpisodeManifestKey, getSearchEntriesDirPrefix } from '@browse-dot-show/constants';
import { log } from '@browse-dot-show/logging';
import { getFile, getFileStorageEnv, getSignedUrl } from '@browse-dot-show/s3';
import { formatEpisodeId, parseEpisodeId, type EpisodeInManifest, type EpisodeManifest } from '@browse-dot-show/types';

/**
 * The subscriber API: this lambda with CONTENT_SCOPE=subscriber, at the site API's `/subscriber`
 * route (`subscriber-api-<site>`). Every API request needs a session token from the auth lambda.
 * It searches the subscriber index (public + subscriber-only episodes) and serves the
 * subscriber-only episodes, whose files CloudFront can't read.
 *
 * Env: SUBSCRIBER_TOKEN_PUBLIC_KEY (PEM), SITE_ID.
 */

/** How long presigned audio/transcript URLs last: long enough to listen to an episode */
const PRESIGNED_URL_SECONDS = 3 * 60 * 60;

/** What clients get for a subscriber-only episode: the manifest entry minus the private feed URL */
export type SubscriberEpisode = Omit<EpisodeInManifest, 'originalAudioURL'> & { id: string };

export interface ApiError {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function apiError(statusCode: number, error: string): ApiError {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error }) };
}

/** The token's claims, or a 401 response */
export function authorize(headers: Record<string, string | undefined> | undefined, env: Record<string, string | undefined> = process.env): SessionClaims | ApiError {
  const publicKey = env.SUBSCRIBER_TOKEN_PUBLIC_KEY;
  const siteId = env.SITE_ID;
  if (!publicKey || !siteId) {
    log.error('SUBSCRIBER_TOKEN_PUBLIC_KEY and SITE_ID are required for the subscriber API');
    return apiError(500, 'not-configured');
  }
  const token = getBearerToken(headers);
  if (!token) return apiError(401, 'missing-token');
  const result = verifySessionToken(token, publicKey.replace(/\\n/g, '\n'), { siteId });
  if (!result.valid) return apiError(401, `invalid-token:${result.reason}`);
  return result.claims;
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'statusCode' in value;
}

let manifestCache: SubscriberEpisode[] | null = null;
let manifestEntriesById = new Map<string, EpisodeInManifest>();

export function clearSubscriberManifestCache(): void {
  manifestCache = null;
  manifestEntriesById = new Map();
}

async function loadManifest(): Promise<SubscriberEpisode[]> {
  if (manifestCache) return manifestCache;
  const manifest = JSON.parse((await getFile(getEpisodeManifestKey('subscriber'))).toString('utf-8')) as EpisodeManifest;
  manifestEntriesById = new Map(manifest.episodes.map(episode => [formatEpisodeId(episode.sequentialId, 'subscriber'), episode]));
  manifestCache = manifest.episodes.map(({ originalAudioURL: _privateFeedUrl, ...episode }) => ({
    ...episode,
    id: formatEpisodeId(episode.sequentialId, 'subscriber'),
  }));
  return manifestCache;
}

/** `{ episodes }`: the subscriber-only episodes */
export async function getSubscriberManifest(): Promise<{ episodes: SubscriberEpisode[] }> {
  return { episodes: await loadManifest() };
}

/** A URL the browser can fetch the file at: presigned S3, or the local asset server in development */
async function fileUrl(key: string): Promise<string> {
  if (getFileStorageEnv() === 'local') {
    const base = process.env.LOCAL_ASSETS_BASE_URL ?? 'http://127.0.0.1:8080/';
    return `${base}${key.replace(/^sites\/[^/]+\//, '').split('/').map(encodeURIComponent).join('/')}`;
  }
  return getSignedUrl(key, PRESIGNED_URL_SECONDS);
}

/** `{ episode, audioUrl, searchEntriesUrl, expiresAt }` for a subscriber-only episode (`s<n>`), or 404 */
export async function getSubscriberEpisode(id: unknown) {
  const parsed = typeof id === 'string' ? parseEpisodeId(id) : null;
  if (!parsed || parsed.scope !== 'subscriber') return apiError(400, 'invalid-episode-id');
  const episodes = await loadManifest();
  const entry = manifestEntriesById.get(id as string);
  if (!entry) return apiError(404, 'episode-not-found');

  const [audioUrl, searchEntriesUrl] = await Promise.all([
    fileUrl(`${getAudioDirPrefix('subscriber')}${entry.podcastId}/${entry.fileKey}.mp3`),
    fileUrl(`${getSearchEntriesDirPrefix('subscriber')}${entry.podcastId}/${entry.fileKey}.json`),
  ]);
  return {
    episode: episodes.find(episode => episode.id === id)!,
    audioUrl,
    searchEntriesUrl,
    expiresAt: Math.floor(Date.now() / 1000) + PRESIGNED_URL_SECONDS,
  };
}
