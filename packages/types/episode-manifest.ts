export type PodcastId = 
'football-cliches' | 
'for-our-sins-the-cliches-pod-archive' | 
'hard-fork' |
'not-another-d-and-d-podcast' |
'claret-and-blue';

export interface LlmAnnotations {
    episodeType?: string;
    panelists?: string[];
    // Add other potential LLM annotation fields here as they become known
}

export interface EpisodeInManifest {
    sequentialId: number;
    podcastId: PodcastId; // e.g., "football-cliches"
    title: string;
    fileKey: string; // e.g., "2020-01-23_The-Transfer-Window" or "2024-07-25_Simple-Episode-Title--1721909640000" (used to construct audio file path)
    originalAudioURL: string;
    summary: string;
    durationInSeconds?: number; // Optional, as it might not always be available or consistently formatted in RSS
    publishedAt: string; // ISO 8601 date string
    downloadedAt?: string; // ISO 8601 timestamp when audio was downloaded (NEW)
    hasCompletedLLMAnnotations: boolean;
    llmAnnotations: LlmAnnotations;
}

export interface EpisodeManifest {
    lastUpdated: string; // ISO 8601 date string
    episodes: EpisodeInManifest[];
} 