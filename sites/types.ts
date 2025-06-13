interface Podcast {
    id: string;
    rssFeedFile: string;
    title: string;
    status: 'active' | 'inactive';

    // TODO: Rename to `rssFeedUrl`
    url: string;
}

interface SiteConfig {
    /** site ID - needs to match the name of the directory */
    id: string;
    /** e.g. `mypodcast.browse.show` or `listenfairplay.com` (the latter being the first such site created by browse-dot-show) */
    domain: string;
    shortTitle: string;
    fullTitle: string;
    description: string;
    /** 
     * Most sites will index a single podcast, and will only have a single podcast in this array.
     * However, some sites will index multiple podcasts - e.g. if very similar content exists across multiple podcasts/RSS feeds.
     * This use case is supported, and allows indexing & searching multiple feeds at the same deployed site URL
    */
    includedPodcasts: Podcast[];

    // TODO: We will likely add additional customization options, including - perhaps - certain React component files
}