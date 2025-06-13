/** 
 * Get site-aware S3 key for the Orama search index file
 * For site-aware operations, uses site-specific path
 * For legacy operations, uses original path
 */
export function getSearchIndexKey(): string {
  const siteId = process.env.CURRENT_SITE_ID;
  if (siteId) {
    return `sites/${siteId}/search-index/orama_index.msp`;
  }
  return 'search-index/orama_index.msp';
}



/** 
 * Get site-aware local path for Orama search index in Lambda environment
 * Each site gets its own temp file to avoid conflicts
 */
export function getLocalDbPath(): string {
  const siteId = process.env.CURRENT_SITE_ID;
  if (siteId) {
    return `/tmp/orama_index_${siteId}.msp`;
  }
  return '/tmp/orama_index.msp';
}



/** 
 * Get site-aware episode manifest key
 * For site-aware operations, uses site-specific path
 * For legacy operations, uses original path
 */
export function getEpisodeManifestKey(): string {
  const siteId = process.env.CURRENT_SITE_ID;
  if (siteId) {
    return `sites/${siteId}/episode-manifest/full-episode-manifest.json`;
  }
  return 'episode-manifest/full-episode-manifest.json';
}


