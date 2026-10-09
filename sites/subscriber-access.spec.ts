import { describe, expect, it } from 'vitest';
import { validateSubscriberAccess } from './subscriber-access.js';
import type { SiteConfig, SubscriberAccess } from './types.js';

function site(subscriberAccess?: Partial<SubscriberAccess>): SiteConfig {
    return {
        id: 'listenfairplay',
        includedPodcasts: [{ id: 'football-cliches', rssFeedFile: 'football-cliches.xml', title: 'Football Cliches', status: 'active', url: 'https://example.com/feed' }],
        subscriberAccess: subscriberAccess && {
            launchStatus: 'preview',
            providers: ['supporting-cast', 'dev-code'],
            subscriptionName: 'Football Clichés',
            subscribeUrl: 'https://example.supportingcast.fm',
            subscriberFeeds: [{ podcastId: 'football-cliches', feedUrlEnvVar: 'SUBSCRIBER_FEED_URL_LISTENFAIRPLAY_FOOTBALL_CLICHES', rssFeedFile: 'football-cliches-subscriber.xml' }],
            ...subscriberAccess,
        },
    } as SiteConfig;
}

describe('validateSubscriberAccess', () => {
    it('accepts a site without subscriber access, and a valid config', () => {
        expect(validateSubscriberAccess(site())).toEqual([]);
        expect(validateSubscriberAccess(site({}))).toEqual([]);
    });

    it('requires a real provider to go live', () => {
        expect(validateSubscriberAccess(site({ launchStatus: 'live', providers: ['dev-code'] }))).toEqual([
            'subscriberAccess: a live site needs a real provider (dev-code is only for preview)',
        ]);
    });

    it('checks feeds against the site', () => {
        const errors = validateSubscriberAccess(site({
            subscriberFeeds: [
                { podcastId: 'nope', feedUrlEnvVar: 'lowercase', rssFeedFile: 'football-cliches.xml' },
            ],
        }));
        expect(errors).toEqual([
            `subscriberAccess.subscriberFeeds[0].podcastId "nope" isn't in includedPodcasts`,
            'subscriberAccess.subscriberFeeds[0].feedUrlEnvVar must be an env var name like SUBSCRIBER_FEED_URL_LISTENFAIRPLAY',
            'subscriberAccess.subscriberFeeds[0].rssFeedFile "football-cliches.xml" is already used by another feed',
        ]);
    });

    it('rejects feed URLs in the (public) config', () => {
        const errors = validateSubscriberAccess(site({
            subscriberFeeds: [{ podcastId: 'football-cliches', feedUrlEnvVar: 'X', rssFeedFile: 'x.xml', url: 'https://secret.example/feed?token=abc' } as never],
        }));
        expect(errors).toContain('subscriberAccess.subscriberFeeds must not contain URLs: put the feed URL in .env.local, under feedUrlEnvVar');
    });

    it('checks the basics', () => {
        const errors = validateSubscriberAccess(site({ launchStatus: 'soon' as never, providers: ['patreon' as never], subscriptionName: '', subscribeUrl: 'http://x' }));
        expect(errors).toEqual([
            'subscriberAccess.launchStatus must be one of: preview, live',
            'subscriberAccess.providers: unknown provider "patreon"',
            'subscriberAccess.subscriptionName is required',
            'subscriberAccess.subscribeUrl must be an https:// URL',
        ]);
    });
});
