export interface Podcast {
    id: string;
    rssFeedFile: string;
    title: string;
    status: 'active' | 'inactive';

    // TODO: Rename to `rssFeedUrl`
    url: string;
}

export interface SiteConfig {
    /** site ID - needs to match the name of the directory */
    id: string;
    /** e.g. `mypodcast.browse.show` or `listenfairplay.com` (the latter being the first such site created by browse-dot-show) */
    domain: string;
    /** e.g. `https://mypodcast.browse.show` or `https://listenfairplay.com` (full URL) */
    canonicalUrl: string;
    shortTitle: string;
    fullTitle: string;
    description: string;
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

    // TODO: We will likely add additional customization options, including - perhaps - certain React component files
}