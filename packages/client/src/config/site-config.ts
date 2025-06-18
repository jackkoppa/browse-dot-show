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
  themeColor: string;
  themeColorDark: string;
  searchPlaceholderOptions: string[];
}

// Read site config from environment variables injected at build time
const siteConfig: SiteRuntimeConfig = {
  id: import.meta.env.VITE_SITE_ID || 'unknown',
  domain: import.meta.env.VITE_SITE_DOMAIN || 'unknown',
  shortTitle: import.meta.env.VITE_SITE_SHORT_TITLE || 'Browse Dot Show',
  fullTitle: import.meta.env.VITE_SITE_FULL_TITLE || 'Browse Dot Show',
  description: import.meta.env.VITE_SITE_DESCRIPTION || 'Search podcast episodes',
  podcastLinks: JSON.parse(import.meta.env.VITE_SITE_PODCAST_LINKS || '{}'),
  themeColor: import.meta.env.VITE_SITE_THEME_COLOR || '#000000',
  themeColorDark: import.meta.env.VITE_SITE_THEME_COLOR_DARK || '#000000',
  searchPlaceholderOptions: import.meta.env.VITE_SITE_SEARCH_PLACEHOLDER_OPTIONS || ['example search']
};

export default siteConfig; 