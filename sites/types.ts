export interface Podcast {
    id: string;
    rssFeedFile: string;
    title: string;
    status: 'active' | 'inactive';

    // TODO: Rename to `rssFeedUrl`
    url: string;
}

export interface SocialAndMetadata {
    /**
     * title that appears in the browser tab
     * @example `Listen, Fair Play | Search Football Clichés`
     * @example `[browse.show] | Hard Fork`
     * @example `[browse.show] | NaddPod`
     */
    pageTitle: string;
    /** 
     * full URL of the site
     * @example `https://mypodcast.browse.show` or `https://listenfairplay.com`
     */
    canonicalUrl: string;
    /** 
     * image that appears in social media cards
     * @example `./assets/open-graph-card-1200x630.jpg`
     */
    openGraphImagePath: string;
    /**
     * description that appears in social media cards
     * @example `Search all episodes of the Football Clichés podcast`
     */
    metaDescription: string;
    /**
     * title that appears in social media cards
     * @example `Football Clichés`
     */
    metaTitle: string;
}

export interface AppHeader {
    /**
     * title that appears in the app header
     * @example `Listen, Fair Play`
     */
    primaryTitle: string;
    
    /**
     * whether to include the optinoal `[browse.show]` prefix in the app header
     */
    includeTitlePrefix: boolean;

    /**
     * podcast name, as part of tagline that appears in the app header - e.g. `Search the {taglinePodcastName} {taglineSuffix}`
     * @example `Football Clichés`
     * @example `Hard Fork`
     * @example `Not Another D&D Podcast`
     */
    taglinePrimaryPodcastName: string;

    /**
     * external URL of the primary podcast - where users will be linked to in order to continue listening
     * @example `https://podfollow.com/new-football-cliches`
     */
    taglinePrimaryPodcastExternalURL: string;

    /**
     * suffix that appears in the app header tagline
     * @example `podcast archives`
     * @example `record books`
     */
    taglineSuffix: string;

    /**
     * whether to add extra height to the app header to accommodate a long title
     */
    extraHeightForLongTitle: boolean;

    /**
     * whether to include the AI use disclosure in the app header
     */
    includeAIUseDisclosure: boolean;
}

/** A podcast's private subscriber feed, ingested into the site's `subscriber/` files */
export interface SubscriberFeed {
    /** The podcast (in `includedPodcasts`) this is the subscriber feed of: its subscriber-only episodes are searched alongside it */
    podcastId: string;
    /**
     * Env var holding the feed URL, in `.env.local` on the machine that ingests. Never commit
     * the URL itself: it carries the developer's personal subscriber token.
     * @example `SUBSCRIBER_FEED_URL_LISTENFAIRPLAY_FOOTBALL_CLICHES`
     */
    feedUrlEnvVar: string;
    /** @example `football-cliches-subscriber.xml` */
    rssFeedFile: string;
}

export type SubscriberLoginProvider = 'supporting-cast' | 'dev-code';

/**
 * Lets listeners log in with their podcast subscription to also search, open and listen to
 * subscriber-only episodes (with no play-time limit). See scratchpad/subscriber-access/PLAN.md.
 */
export interface SubscriberAccess {
    /**
     * - `preview`: only visible with the `?subscriberPreview=1` query param (for testing on prod)
     * - `live`: visible to everyone
     */
    launchStatus: 'preview' | 'live';
    /** How listeners log in. `dev-code` is for testing, and only offered in preview */
    providers: SubscriberLoginProvider[];
    /**
     * Name of the subscription, as in "Log in with your {subscriptionName} subscription"
     * @example `Football Clichés`
     */
    subscriptionName: string;
    /** Where listeners can subscribe */
    subscribeUrl: string;
    subscriberFeeds: SubscriberFeed[];
}

export interface SiteConfig {
    /** site ID - needs to match the name of the directory */
    id: string;
    /** e.g. `mypodcast.browse.show` or `listenfairplay.com` (the latter being the first such site created by browse-dot-show) */
    domain: string;

    appHeader: AppHeader;

    socialAndMetadata: SocialAndMetadata;

    /** 
     * Most sites will index a single podcast, and will only have a single podcast in this array.
     * However, some sites will index multiple podcasts - e.g. if very similar content exists across multiple podcasts/RSS feeds.
     * This use case is supported, and allows indexing & searching multiple feeds at the same deployed site URL
    */
    includedPodcasts: Podcast[];

    /** 
     * Prompt passed to Whisper (locally or API), 
     * that introduces the podcast, to improve transcription accuracy.
     * 
     * @example `Hi, I'm HostA, here with HostB, and this is the Example Podcast! Welcome, let's get started.`
     */
    whisperTranscriptionPrompt: string;

    /** e.g. `#fdf100` */
    themeColor: string;

    /** e.g. `#136cba` */
    themeColorDark: string;

    /** 
     * a list of phrases that will be rotated between as the search input text,
     * to give users an idea of what they can search for. Pick fun/key phrases from the podcast history, that users might recognize.
     * 
     * @example `["gets the shot away", "no disrespect to egg"]` 
     */
    searchPlaceholderOptions: string[];

    /**
     * GoatCounter tracking script, to be inserted into the <head> of the HTML file.
     * @example `<script data-goatcounter="https://listenfairplay.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>`
     */
    trackingScript?: string;

    /** Subscriber login and subscriber-only episodes; most sites don't have this */
    subscriberAccess?: SubscriberAccess;

    // TODO: We will likely add additional customization options, including - perhaps - certain React component files
}