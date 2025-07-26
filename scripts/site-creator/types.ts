export interface PodcastSearchResult {
  id: number;
  title: string;
  url: string;
  link?: string;
  description?: string;
  author?: string;
  image?: string;
}

export interface PodcastIndexResponse {
  status: string;
  feeds: PodcastSearchResult[];
  count: number;
  query: string;
  description: string;
}

export type StepStatus = 'NOT_STARTED' | 'COMPLETED' | 'CONFIRMED_SKIPPED' | 'DEFERRED';

export interface SetupStep {
  id: string;
  displayName: string;
  description: string;
  status: StepStatus;
  optional: boolean;
  completedAt?: string;
}

export interface Initial2EpisodesResults {
  episodesSizeInMB: number;
  episodesDurationInSeconds: number;
  episodesTranscriptionTimeInSeconds: number;
  episodesAudioFileDownloadTimeInSeconds: number;
}

export interface SetupProgress {
  siteId: string;
  podcastName: string;
  createdAt: string;
  lastUpdated: string;
  steps: Record<string, SetupStep>;
  initial2EpisodesResults?: Initial2EpisodesResults;
}

export interface SiteConfig {
  id: string;
  domain: string;
  appHeader: {
    primaryTitle: string;
    includeTitlePrefix: boolean;
    taglinePrimaryPodcastName: string;
    taglinePrimaryPodcastExternalURL: string;
    taglineSuffix: string;
  };
  socialAndMetadata: {
    pageTitle: string;
    canonicalUrl: string;
    openGraphImagePath: string;
    metaDescription: string;
    metaTitle: string;
  };
  includedPodcasts: Array<{
    id: string;
    rssFeedFile: string;
    title: string;
    status: string;
    url: string;
  }>;
  whisperTranscriptionPrompt: string;
  themeColor: string;
  themeColorDark: string;
  searchPlaceholderOptions: string[];
  trackingScript: string;
}

export type SupportLevel = 'FULL_SUPPORT' | 'LIMITED_TESTING' | 'UNTESTED' | 'KNOWN_TO_BE_UNOPERATIONAL';

export interface PlatformSupportConfig {
  platforms: Record<string, {
    name: string;
    features: Record<string, SupportLevel>;
  }>;
  features: Record<string, {
    name: string;
    description: string;
  }>;
  supportLevels: Record<SupportLevel, {
    emoji: string;
    description: string;
  }>;
} 