// CURSOR-TODO: We need to update the name of this package, since they're no longer strictly constants.

function getSiteId(): string {
  const siteId = process.env.CURRENT_SITE_ID;
  if (!siteId) {
    throw new Error('CURRENT_SITE_ID environment variable is required');
  }
  return siteId;
}

/** 
 * Get site-aware S3 key for the Orama search index file
 */
export function getSearchIndexKey(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/search-index/orama_index.msp`;
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
 * Get site-aware episode manifest key
 */
export function getEpisodeManifestKey(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/episode-manifest/full-episode-manifest.json`;
}

/** 
 * Get site-aware audio directory prefix
 */
export function getAudioDirPrefix(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/audio/`;
}

/** 
 * Get site-aware transcripts directory prefix
 */
export function getTranscriptsDirPrefix(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/transcripts/`;
}

/** 
 * Get site-aware RSS directory prefix
 */
export function getRSSDirectoryPrefix(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/rss/`;
}

/** 
 * Get site-aware search entries directory prefix
 */
export function getSearchEntriesDirPrefix(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/search-entries/`;
}

/** 
 * Get site-aware episode manifest directory prefix
 */
export function getEpisodeManifestDirPrefix(): string {
  const siteId = getSiteId();
  return `sites/${siteId}/episode-manifest/`;
}


