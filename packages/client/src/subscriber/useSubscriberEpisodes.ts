import { useEffect, useState } from 'react';
import { SEARCH_API_BASE_URL } from '../constants';
import { log } from '../utils/logging';
import { getSubscriberEpisodes, SubscriberUnauthorizedError, type SubscriberEpisode } from './api';
import { useSubscriber } from './SubscriberContext';

// Shared across hook instances, per session token
let cache: { token: string; promise: Promise<SubscriberEpisode[]> } | null = null;

/** The subscriber-only episodes (by `s<n>` ID), once logged in; empty otherwise */
export function useSubscriberEpisodes(): Map<string, SubscriberEpisode> {
  const { session, handleUnauthorized } = useSubscriber();
  const [episodes, setEpisodes] = useState<Map<string, SubscriberEpisode>>(new Map());

  useEffect(() => {
    if (!session) {
      setEpisodes(new Map());
      return;
    }
    if (cache?.token !== session.token) {
      cache = { token: session.token, promise: getSubscriberEpisodes(SEARCH_API_BASE_URL, session).then(r => r.episodes) };
    }
    let cancelled = false;
    cache.promise
      .then(list => { if (!cancelled) setEpisodes(new Map(list.map(episode => [episode.id, episode]))); })
      .catch(error => {
        cache = null;
        if (error instanceof SubscriberUnauthorizedError) handleUnauthorized();
        else log.warn('[subscriber] Failed to load subscriber episodes', error);
      });
    return () => { cancelled = true; };
  }, [session, handleUnauthorized]);

  return episodes;
}
