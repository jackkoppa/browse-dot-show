import type { SearchRequest, SearchResponse, EpisodeInManifest } from '@browse-dot-show/types';
import type { SubscriberLoginProvider } from '@browse-dot-show/sites';
import type { SubscriberSession } from './session';

/** Calls to the shared auth API and the site's subscriber API (POST <search API>/subscriber) */

export type StartLoginResult = { kind: 'email-sent' } | { kind: 'redirect'; url: string } | { kind: 'enter-code' };

/** A subscriber-only episode, as the subscriber API lists it (`id` is `s<n>`) */
export type SubscriberEpisode = Omit<EpisodeInManifest, 'originalAudioURL'> & { id: string };

export interface SubscriberEpisodeDetails {
  episode: SubscriberEpisode;
  audioUrl: string;
  searchEntriesUrl: string;
  expiresAt: number;
}

/** The session was rejected (expired, revoked or for another site): log the listener out */
export class SubscriberUnauthorizedError extends Error {
  constructor(message = 'Your subscriber login has expired. Please log in again.') {
    super(message);
    this.name = 'SubscriberUnauthorizedError';
  }
}

async function postJson<T>(url: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (response.status === 401) throw new SubscriberUnauthorizedError();
  if (response.status === 503) throw new Error('The subscription service is busy. Please try again in a minute.');
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export function startLogin(authApiUrl: string, body: { siteId: string; provider: SubscriberLoginProvider; email?: string }) {
  return postJson<{ result: StartLoginResult }>(`${authApiUrl}/login`, { ...body, origin: window.location.origin }).then(r => r.result);
}

/** Exchange what the provider sent back (callback query params, or `{ code }`) for a session; null if not a subscriber */
export async function completeLogin(authApiUrl: string, body: { siteId: string; provider: SubscriberLoginProvider; params: Record<string, string> }): Promise<SubscriberSession | null> {
  try {
    return await postJson<SubscriberSession>(`${authApiUrl}/complete`, body);
  } catch (error) {
    if (error instanceof SubscriberUnauthorizedError) return null;
    throw error;
  }
}

/** A renewed session, or null if the listener no longer has access */
export async function refreshSession(authApiUrl: string, siteId: string, session: SubscriberSession): Promise<SubscriberSession | null> {
  try {
    return await postJson<SubscriberSession>(`${authApiUrl}/refresh`, { siteId }, session.token);
  } catch (error) {
    if (error instanceof SubscriberUnauthorizedError) return null;
    throw error;
  }
}

export function subscriberSearch(searchApiBaseUrl: string, request: SearchRequest, session: SubscriberSession): Promise<SearchResponse> {
  return postJson<SearchResponse>(`${searchApiBaseUrl}/subscriber`, request, session.token);
}

export function getSubscriberEpisodes(searchApiBaseUrl: string, session: SubscriberSession): Promise<{ episodes: SubscriberEpisode[] }> {
  return postJson(`${searchApiBaseUrl}/subscriber`, { action: 'manifest' }, session.token);
}

export function getSubscriberEpisode(searchApiBaseUrl: string, id: string, session: SubscriberSession): Promise<SubscriberEpisodeDetails> {
  return postJson(`${searchApiBaseUrl}/subscriber`, { action: 'episode', id }, session.token);
}
