// Site configuration loaded at build time
// This file reads from environment variables that are injected by Vite during build

import type { AppHeader, SocialAndMetadata } from '@browse-dot-show/sites';

export interface SiteRuntimeConfig {
  id: string;
  domain: string;
  appHeader: AppHeader;
  socialAndMetadata: SocialAndMetadata;
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
  trackingScript?: string;
}

// Read site config from environment variables injected at build time
const siteConfig: SiteRuntimeConfig = {
  id: import.meta.env.VITE_SITE_ID || 'unknown',
  domain: import.meta.env.VITE_SITE_DOMAIN || 'unknown',
  appHeader: JSON.parse(import.meta.env.VITE_APP_HEADER || '{"primaryTitle":"Browse Dot Show","includeTitlePrefix":false,"taglinePrimaryPodcastName":"Unknown","taglinePrimaryPodcastExternalURL":"#","taglineSuffix":"podcast archives"}'),
  socialAndMetadata: JSON.parse(import.meta.env.VITE_SOCIAL_AND_METADATA || '{"pageTitle":"Browse Dot Show","canonicalUrl":"https://browse.show","openGraphImagePath":"./assets/social-cards/open-graph-card-1200x630.jpg","metaDescription":"Search podcast episodes","metaTitle":"Browse Dot Show"}'),
  podcastLinks: JSON.parse(import.meta.env.VITE_SITE_PODCAST_LINKS || '{}'),
  themeColor: import.meta.env.VITE_SITE_THEME_COLOR || '#000000',
  themeColorDark: import.meta.env.VITE_SITE_THEME_COLOR_DARK || '#000000',
  searchPlaceholderOptions: JSON.parse(import.meta.env.VITE_SITE_SEARCH_PLACEHOLDER_OPTIONS || '["example search"]'),
  trackingScript: import.meta.env.VITE_SITE_TRACKING_SCRIPT || ''
};

export default siteConfig; 