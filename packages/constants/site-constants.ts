// CURSOR-TODO: We need to update the name of this package, since they're no longer strictly constants.

/**
 * Get the current site ID from environment variables
 * Uses SITE_ID environment variable (set in both local dev and AWS Lambda)
 */
function getSiteId(): string {
    const siteId = process.env.SITE_ID;
    if (!siteId) {
        throw new Error('SITE_ID environment variable is required');
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
 * Which content a process works with:
 * - `public`: the site's public files (the default)
 * - `subscriber`: subscriber-only files, under `subscriber/` (never served by CloudFront)
 *
 * Set with the CONTENT_SCOPE env var, so the ingestion lambdas run unchanged for either.
 * Functions below take an explicit scope when code needs both.
 */
export type ContentScope = 'public' | 'subscriber';

/** Top-level folder for subscriber-only files, in the site bucket and its local mirror */
export const SUBSCRIBER_CONTENT_DIR = 'subscriber';

export function getContentScope(): ContentScope {
    const scope = process.env.CONTENT_SCOPE || 'public';
    if (scope !== 'public' && scope !== 'subscriber') {
        throw new Error(`Invalid CONTENT_SCOPE "${scope}" (expected "public" or "subscriber")`);
    }
    return scope;
}

/**
 * Environment-aware key prefix for a top-level folder (e.g. `audio`), with a trailing slash:
 * - Local: sites/{siteId}/[subscriber/]{folder}/ (needs site disambiguation)
 * - AWS: [subscriber/]{folder}/ (bucket is already site-specific)
 */
function getScopedPrefix(folder: string, scope: ContentScope): string {
    const scoped = scope === 'subscriber' ? `${SUBSCRIBER_CONTENT_DIR}/${folder}/` : `${folder}/`;
    return isLocalEnvironment() ? `sites/${getSiteId()}/${scoped}` : scoped;
}

/** Environment-aware S3 key for the Orama search index file, e.g. `search-index/orama_index.msp` */
export function getSearchIndexKey(scope: ContentScope = getContentScope()): string {
    return `${getScopedPrefix('search-index', scope)}orama_index.msp`;
}

/**
 * Site-aware local path for the Orama search index in the Lambda environment.
 * Each site (and scope) gets its own temp file to avoid conflicts.
 */
export function getLocalDbPath(scope: ContentScope = getContentScope()): string {
    const suffix = scope === 'subscriber' ? '_subscriber' : '';
    return `/tmp/orama_index_${getSiteId()}${suffix}.msp`;
}

/** Environment-aware episode manifest key, e.g. `episode-manifest/full-episode-manifest.json` */
export function getEpisodeManifestKey(scope: ContentScope = getContentScope()): string {
    return `${getScopedPrefix('episode-manifest', scope)}full-episode-manifest.json`;
}

/** Environment-aware audio directory prefix, e.g. `audio/` */
export function getAudioDirPrefix(scope: ContentScope = getContentScope()): string {
    return getScopedPrefix('audio', scope);
}

/** Environment-aware transcripts directory prefix, e.g. `transcripts/` */
export function getTranscriptsDirPrefix(scope: ContentScope = getContentScope()): string {
    return getScopedPrefix('transcripts', scope);
}

/** Environment-aware RSS directory prefix, e.g. `rss/` */
export function getRSSDirectoryPrefix(scope: ContentScope = getContentScope()): string {
    return getScopedPrefix('rss', scope);
}

/** Environment-aware search entries directory prefix, e.g. `search-entries/` */
export function getSearchEntriesDirPrefix(scope: ContentScope = getContentScope()): string {
    return getScopedPrefix('search-entries', scope);
}

/** Environment-aware episode manifest directory prefix, e.g. `episode-manifest/` */
export function getEpisodeManifestDirPrefix(scope: ContentScope = getContentScope()): string {
    return getScopedPrefix('episode-manifest', scope);
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

