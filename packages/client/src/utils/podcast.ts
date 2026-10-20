import type { SiteRuntimeConfig } from '@/config/site-config';

export interface MultiFeedPodcast {
  title: string;
  coverImageUrl?: string;
}

/**
 * The podcast's title and cover, for showing which podcast an episode is from: only on sites with more
 * than one podcast feed (on a single-feed site, it would repeat the site's own name on every result).
 */
export function multiFeedPodcast(podcastId: string, podcastLinks: SiteRuntimeConfig['podcastLinks']): MultiFeedPodcast | undefined {
  if (Object.keys(podcastLinks).length < 2) return undefined;
  const podcast = podcastLinks[podcastId];
  if (!podcast) return undefined;
  return { title: podcast.title, coverImageUrl: podcast.coverImageUrl };
}
