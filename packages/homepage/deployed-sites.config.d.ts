interface DeployedSite {
  siteName: string;
  displayedPodcastName: string;
  podcastTagline: string;
  domain: string;
  imageUrl: string;
  searchInputPlaceholder: string;
}

interface DeployedSitesConfig {
  sites: {
    /** Sites hosted from other repo forks, following the [self-hosting / federated guide](https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md) */
    externalSites: {
      [siteId: string]: DeployedSite;
    };
    /** Sites hosted from the root repository, https://github.com/jackkoppa/browse-dot-show */
    originSites: {
      [siteId: string]: DeployedSite;
    };
  };
}

declare module '*/deployed-sites.config.jsonc' {
  const config: DeployedSitesConfig;
  export default config;
} 
