// CURSOR-TODO: We need to update the name of this package, since they're no longer strictly constants.

/**
 * Get the current site ID from environment variables
 * Handles both SITE_ID (used in Lambda) and CURRENT_SITE_ID (used in local dev)
 */
function getSiteId(): string {
  const siteId = process.env.SITE_ID || process.env.CURRENT_SITE_ID;
  if (!siteId) {
    throw new Error('SITE_ID or CURRENT_SITE_ID environment variable is required');
  }
  return siteId;
}

/**
 * Check if we're running in local development environment
 */
function isLocalEnvironment(): boolean {
  return (process.env.FILE_STORAGE_ENV ?? '') === 'local';
}

/** 
 * Get environment-aware S3 key for the Orama search index file
 * - Local: sites/{siteId}/search-index/orama_index.msp (needs site disambiguation)
 * - AWS: search-index/orama_index.msp (bucket is already site-specific)
 */
export function getSearchIndexKey(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/search-index/orama_index.msp`;
  } else {
    // In AWS, bucket is already site-specific
    return `search-index/orama_index.msp`;
  }
}

/** 
 * Get site-aware local path for Orama search index in Lambda environment
 * Each site gets its own temp file to avoid conflicts
 */
export function getLocalDbPath(): string {
  const siteId = getSiteId();
  return `/tmp/orama_index_${siteId}.msp`;
}

/** 
 * Get environment-aware episode manifest key
 * - Local: sites/{siteId}/episode-manifest/full-episode-manifest.json
 * - AWS: episode-manifest/full-episode-manifest.json
 */
export function getEpisodeManifestKey(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/episode-manifest/full-episode-manifest.json`;
  } else {
    return `episode-manifest/full-episode-manifest.json`;
  }
}

/** 
 * Get environment-aware audio directory prefix
 * - Local: sites/{siteId}/audio/
 * - AWS: audio/
 */
export function getAudioDirPrefix(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/audio/`;
  } else {
    return `audio/`;
  }
}

/** 
 * Get environment-aware transcripts directory prefix
 * - Local: sites/{siteId}/transcripts/
 * - AWS: transcripts/
 */
export function getTranscriptsDirPrefix(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/transcripts/`;
  } else {
    return `transcripts/`;
  }
}

/** 
 * Get environment-aware RSS directory prefix
 * - Local: sites/{siteId}/rss/
 * - AWS: rss/
 */
export function getRSSDirectoryPrefix(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/rss/`;
  } else {
    return `rss/`;
  }
}

/** 
 * Get environment-aware search entries directory prefix
 * - Local: sites/{siteId}/search-entries/
 * - AWS: search-entries/
 */
export function getSearchEntriesDirPrefix(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/search-entries/`;
  } else {
    return `search-entries/`;
  }
}

/** 
 * Get environment-aware episode manifest directory prefix
 * - Local: sites/{siteId}/episode-manifest/
 * - AWS: episode-manifest/
 */
export function getEpisodeManifestDirPrefix(): string {
  if (isLocalEnvironment()) {
    const siteId = getSiteId();
    return `sites/${siteId}/episode-manifest/`;
  } else {
    return `episode-manifest/`;
  }
}

/**
 * File Key Utility Functions
 */

// Utility to check if file key has downloadedAt timestamp
export function hasDownloadedAtTimestamp(fileKey: string): boolean {
  return fileKey.includes('--') && /--\d{13}$/.test(fileKey);
}

// Extract downloadedAt from file key
export function extractDownloadedAtFromFileKey(fileKey: string): Date | null {
  const match = fileKey.match(/--(\d{13})$/);
  if (match) {
    return new Date(parseInt(match[1]));
  }
  return null;
}

// Parse file key components
export function parseFileKey(fileKey: string): {
  date: string;
  title: string;
  downloadedAt?: Date;
} {
  if (hasDownloadedAtTimestamp(fileKey)) {
    // New format: YYYY-MM-DD_title--timestamp
    const match = fileKey.match(/^(\d{4}-\d{2}-\d{2})_(.+)--(\d{13})$/);
    if (match) {
      return {
        date: match[1],
        title: match[2],
        downloadedAt: new Date(parseInt(match[3]))
      };
    }
  }
  
  // Legacy format: YYYY-MM-DD_title
  const match = fileKey.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
  if (match) {
    return {
      date: match[1],
      title: match[2]
    };
  }
  
  throw new Error(`Invalid file key format: ${fileKey}`);
}

// Get all possible file paths for an episode (audio, transcript, search entry)
export function getEpisodeFilePaths(podcastId: string, fileKey: string): {
  audio: string;
  transcript: string;
  searchEntry: string;
} {
  return {
    audio: `${getAudioDirPrefix()}${podcastId}/${fileKey}.mp3`,
    transcript: `${getTranscriptsDirPrefix()}${podcastId}/${fileKey}.srt`,
    searchEntry: `${getSearchEntriesDirPrefix()}${podcastId}/${fileKey}.json`
  };
}

// Check if a file key is newer than another based on downloadedAt timestamp
export function isFileKeyNewer(fileKey1: string, fileKey2: string): boolean {
  const downloadedAt1 = extractDownloadedAtFromFileKey(fileKey1);
  const downloadedAt2 = extractDownloadedAtFromFileKey(fileKey2);
  
  // If either doesn't have downloadedAt, fall back to string comparison
  if (!downloadedAt1 || !downloadedAt2) {
    return fileKey1 > fileKey2;
  }
  
  return downloadedAt1.getTime() > downloadedAt2.getTime();
}


