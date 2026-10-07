import * as fs from 'fs';
import * as path from 'path';
import { getLocalS3SitePath } from '@browse-dot-show/config';

/**
 * Whether a site's local search index is older than its newest transcript, e.g. after
 * transcribing outside `bds ingest` (a manual `bds lambda run`). A site with transcripts
 * but no index counts as stale; a site with no transcripts never does.
 *
 * Compares mtimes. `aws s3 sync` sets downloaded files' mtimes to their S3 LastModified,
 * so files from the pre-sync phase compare correctly too.
 */
export function isSearchIndexStale(siteRoot: string): boolean {
  const newestTranscript = newestMtime(path.join(siteRoot, 'transcripts'), '.srt');
  if (newestTranscript === undefined) return false;

  const indexPath = path.join(siteRoot, 'search-index', 'orama_index.msp');
  if (!fs.existsSync(indexPath)) return true;
  return newestTranscript > fs.statSync(indexPath).mtimeMs;
}

/** Site IDs (in the given order) whose local search index is stale. */
export function sitesWithStaleSearchIndex(siteIds: string[]): string[] {
  return siteIds.filter(siteId => isSearchIndexStale(getLocalS3SitePath(siteId)));
}

/** Newest mtime (ms) of files ending in `extension` under `dir`, recursively; undefined if none. */
function newestMtime(dir: string, extension: string): number | undefined {
  if (!fs.existsSync(dir)) return undefined;
  let newest: number | undefined;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const mtime = entry.isDirectory()
      ? newestMtime(fullPath, extension)
      : entry.isFile() && entry.name.endsWith(extension) ? fs.statSync(fullPath).mtimeMs : undefined;
    if (mtime !== undefined && (newest === undefined || mtime > newest)) newest = mtime;
  }
  return newest;
}
