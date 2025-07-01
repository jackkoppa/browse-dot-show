import { parsePubDate } from './parse-pub-date.js';

/** Helper to format date as YYYY-MM-DD */
function formatDateYYYYMMDD(date: Date): string {
    return date.toISOString().split('T')[0];
}

/** Strict title sanitization - only alphanumeric and underscores */
function sanitizeTitleStrict(title: string): string {
    return title
        .normalize('NFC') // Normalize Unicode to ensure consistent encoding
        .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric with underscore
        .replace(/_+/g, '_') // Replace multiple underscores with single
        .replace(/^_|_$/g, '') // Remove leading/trailing underscores
        .substring(0, 50); // Limit title length
}

// Get episode fileKey with downloadedAt timestamp (NEW FORMAT)
export function getEpisodeFileKeyWithDownloadedAt(
    episodeTitle: string, 
    pubDateStr: string, 
    downloadedAt: Date
): string {
    const date = parsePubDate(pubDateStr);
    const formattedDate = formatDateYYYYMMDD(date);
    const downloadedAtUnix = downloadedAt.getTime();
    const sanitizedTitle = sanitizeTitleStrict(episodeTitle);
    
    return `${formattedDate}_${sanitizedTitle}--${downloadedAtUnix}`;
}

export function stripDownloadedAtFromFileKey(fileKey: string): string {
    return fileKey.split('--')[0];
}

// Get episode fileKey based on pubDate and title (LEGACY FORMAT - for backwards compatibility during migration)
export function getEpisodeFileKey(episodeTitle: string, pubDateStr: string): string {
    const date = parsePubDate(pubDateStr);
    const formattedDate = formatDateYYYYMMDD(date);
    // Replace invalid characters for filenames
    const sanitizedTitle = episodeTitle
        .normalize('NFC') // Normalize Unicode to ensure consistent encoding
        .replace(/[/\\?%*:|"<>.]/g, '-')
        .replace(/\s+/g, '-')
        .substring(0, 50); // Limit title length

    return `${formattedDate}_${sanitizedTitle}`;
}

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