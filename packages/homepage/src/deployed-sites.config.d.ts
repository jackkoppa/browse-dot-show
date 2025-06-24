interface DeployedSite {
  isOriginSite: boolean;
  name: string;
  podcastFullDescription: string;
  url: string;
  imageUrl: string;
}

interface DeployedSitesConfig {
  sites: {
    [siteId: string]: DeployedSite;
  };
}

declare module '../deployed-sites.config.jsonc' {
  const config: DeployedSitesConfig;
  export default config;
} 