import type { SiteRuntimeConfig } from '@/config/site-config';

/**
 * The podcast's title, for showing which podcast a result is from: only on sites with more than
 * one podcast feed (on a single-feed site, it would repeat the site's own name on every result).
 */
export function multiFeedPodcastTitle(podcastId: string, podcastLinks: SiteRuntimeConfig['podcastLinks']): string | undefined {
  if (Object.keys(podcastLinks).length < 2) return undefined;
  return podcastLinks[podcastId]?.title;
}
