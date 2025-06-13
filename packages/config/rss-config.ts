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
    const siteId = process.env.CURRENT_SITE_ID;
    if (!siteId) {
        throw new Error('CURRENT_SITE_ID environment variable not set. Site-aware operations require this to be set.');
    }
    return siteId;
}

/**
 * Get RSS configuration for the current site
 * Uses CURRENT_SITE_ID environment variable
 */
export function getCurrentSiteRSSConfig() {
    return getRSSConfigForSite(getCurrentSiteId());
}