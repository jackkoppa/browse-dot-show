// Site configuration loaded at build time
// This file reads from environment variables that are injected by Vite during build

export interface SiteRuntimeConfig {
  id: string;
  domain: string;
  shortTitle: string;
  fullTitle: string;
  description: string;
  podcastLinks: {
    [podcastId: string]: {
      title: string;
      url: string;
      status: 'active' | 'inactive';
    };
  };
}

// Read site config from environment variables injected at build time
const siteConfig: SiteRuntimeConfig = {
  id: import.meta.env.VITE_SITE_ID || 'unknown',
  domain: import.meta.env.VITE_SITE_DOMAIN || 'unknown',
  shortTitle: import.meta.env.VITE_SITE_SHORT_TITLE || 'Browse Dot Show',
  fullTitle: import.meta.env.VITE_SITE_FULL_TITLE || 'Browse Dot Show',
  description: import.meta.env.VITE_SITE_DESCRIPTION || 'Search podcast episodes',
  podcastLinks: JSON.parse(import.meta.env.VITE_SITE_PODCAST_LINKS || '{}'),
};

export default siteConfig; 