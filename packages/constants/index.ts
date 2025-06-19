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


