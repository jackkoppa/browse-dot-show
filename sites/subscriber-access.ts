import type { SiteConfig } from './types.js';

const PROVIDERS = ['supporting-cast', 'dev-code'];
const LAUNCH_STATUSES = ['preview', 'live'];

/** Problems with a site's `subscriberAccess` config (none if it doesn't have one) */
export function validateSubscriberAccess(site: SiteConfig): string[] {
    const access = site.subscriberAccess;
    if (access === undefined) return [];
    const errors: string[] = [];
    const prefix = 'subscriberAccess';

    if (!LAUNCH_STATUSES.includes(access.launchStatus)) {
        errors.push(`${prefix}.launchStatus must be one of: ${LAUNCH_STATUSES.join(', ')}`);
    }
    if (!Array.isArray(access.providers) || access.providers.length === 0) {
        errors.push(`${prefix}.providers must list at least one of: ${PROVIDERS.join(', ')}`);
    } else {
        for (const provider of access.providers) {
            if (!PROVIDERS.includes(provider)) errors.push(`${prefix}.providers: unknown provider "${provider}"`);
        }
        if (access.launchStatus === 'live' && access.providers.length === 1 && access.providers[0] === 'dev-code') {
            errors.push(`${prefix}: a live site needs a real provider (dev-code is only for preview)`);
        }
    }
    if (!access.subscriptionName) errors.push(`${prefix}.subscriptionName is required`);
    if (!/^https:\/\/\S+$/.test(access.subscribeUrl ?? '')) errors.push(`${prefix}.subscribeUrl must be an https:// URL`);

    if (!Array.isArray(access.subscriberFeeds)) {
        errors.push(`${prefix}.subscriberFeeds must be a list (it can be empty)`);
        return errors;
    }
    const podcastIds = new Set((site.includedPodcasts ?? []).map(podcast => podcast.id));
    const feedFiles = new Set((site.includedPodcasts ?? []).map(podcast => podcast.rssFeedFile));
    access.subscriberFeeds.forEach((feed, index) => {
        const feedPrefix = `${prefix}.subscriberFeeds[${index}]`;
        if (!podcastIds.has(feed.podcastId)) errors.push(`${feedPrefix}.podcastId "${feed.podcastId}" isn't in includedPodcasts`);
        if (!/^[A-Z][A-Z0-9_]*$/.test(feed.feedUrlEnvVar ?? '')) {
            errors.push(`${feedPrefix}.feedUrlEnvVar must be an env var name like SUBSCRIBER_FEED_URL_${site.id.toUpperCase()}`);
        }
        if (!/^[a-z0-9-]+\.xml$/.test(feed.rssFeedFile ?? '')) {
            errors.push(`${feedPrefix}.rssFeedFile must be a file name like ${feed.podcastId}-subscriber.xml`);
        } else if (feedFiles.has(feed.rssFeedFile)) {
            errors.push(`${feedPrefix}.rssFeedFile "${feed.rssFeedFile}" is already used by another feed`);
        }
        feedFiles.add(feed.rssFeedFile);
    });
    if (/https?:\/\//.test(JSON.stringify(access.subscriberFeeds))) {
        errors.push(`${prefix}.subscriberFeeds must not contain URLs: put the feed URL in .env.local, under feedUrlEnvVar`);
    }
    return errors;
}
