import { getSiteById } from '@browse-dot-show/sites';

// Legacy export for backwards compatibility during transition
export const RSS_CONFIG = {
    'football-cliches': {
        id: 'football-cliches',
        rssFeedFile: 'football-cliches.xml',
        title: 'Football Cliches',
        status: 'active',
        url: 'https://feeds.megaphone.fm/GLT7974369854',
    },
    'for-our-sins-the-cliches-pod-archive': {
        id: 'for-our-sins-the-cliches-pod-archive',
        rssFeedFile: 'for-our-sins-the-cliches-pod-archive.xml',
        title: 'For Our Sins: The Clichés Pod Archive',
        status: 'active',
        url: 'https://feeds.megaphone.fm/tamc1411507018',
    }
} as const;

/**
 * Get RSS configuration for a specific site from its site.config.json
 * This replaces the hardcoded RSS_CONFIG for site-aware operations
 */
export function getRSSConfigForSite(siteId: string) {
    const siteConfig = getSiteById(siteId);
    if (!siteConfig) {
        throw new Error(`Site "${siteId}" not found`);
    }

    // Convert site config podcasts to RSS_CONFIG format
    const rssConfig: Record<string, any> = {};
    
    for (const podcast of siteConfig.includedPodcasts) {
        rssConfig[podcast.id] = {
            id: podcast.id,
            rssFeedFile: podcast.rssFeedFile,
            title: podcast.title,
            status: podcast.status,
            url: podcast.url,
        };
    }

    return rssConfig;
}

/**
 * Get the current site ID from environment variable
 * This should be set by site-aware scripts
 */
export function getCurrentSiteId(): string {
    const siteId = process.env.SITE_ID;
    if (!siteId) {
        throw new Error('SITE_ID environment variable not set. Site-aware operations require this to be set.');
    }
    return siteId;
}

/**
 * Get RSS configuration for the current site
 * Uses SITE_ID environment variable
 */
export function getCurrentSiteRSSConfig() {
    return getRSSConfigForSite(getCurrentSiteId());
}

/**
 * RSS configuration for a site's subscriber feeds (`subscriberAccess.subscriberFeeds`), keyed by
 * the public podcast ID they belong to. Feed URLs come from env vars (`.env.local` on the machine
 * that ingests); feeds whose env var isn't set are listed in `missingEnvVars` and left out.
 */
export function getSubscriberRSSConfigForSite(siteId: string, env: Record<string, string | undefined> = process.env) {
    const siteConfig = getSiteById(siteId);
    if (!siteConfig) {
        throw new Error(`Site "${siteId}" not found`);
    }

    const rssConfig: Record<string, any> = {};
    const missingEnvVars: string[] = [];
    for (const feed of siteConfig.subscriberAccess?.subscriberFeeds ?? []) {
        const url = env[feed.feedUrlEnvVar]?.trim();
        if (!url) {
            missingEnvVars.push(feed.feedUrlEnvVar);
            continue;
        }
        const podcast = siteConfig.includedPodcasts.find(p => p.id === feed.podcastId);
        rssConfig[feed.podcastId] = {
            id: feed.podcastId,
            rssFeedFile: feed.rssFeedFile,
            title: `${podcast?.title ?? feed.podcastId} (subscriber feed)`,
            status: 'active',
            url,
        };
    }

    return { rssConfig, missingEnvVars };
}
