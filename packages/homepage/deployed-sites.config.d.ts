interface DeployedSite {
  isOriginSite: boolean;
  siteName: string;
  displayedPodcastName: string;
  podcastTagline: string;
  domain: string;
  imageUrl: string;
}

interface DeployedSitesConfig {
  sites: {
    [siteId: string]: DeployedSite;
  };
}

declare module '*/deployed-sites.config.jsonc' {
  const config: DeployedSitesConfig;
  export default config;
} 
