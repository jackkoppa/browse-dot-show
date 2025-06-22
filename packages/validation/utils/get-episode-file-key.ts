import { parsePubDate } from './parse-pub-date.js';

/** Helper to format date as YYYY-MM-DD */
function formatDateYYYYMMDD(date: Date): string {
    return date.toISOString().split('T')[0];
}

// Get episode fileKey based on pubDate and title (this will be part of the S3 key)
export function getEpisodeFileKey(episodeTitle: string, pubDateStr: string): string {
    const date = parsePubDate(pubDateStr);
    const formattedDate = formatDateYYYYMMDD(date);
    // Replace invalid characters for filenames
    const sanitizedTitle = episodeTitle
        .normalize('NFC') // Normalize Unicode to ensure consistent encoding
        .replace(/[/\\?%*:|"<>\.]/g, '-') // Added . to the list of replaced characters
        .replace(/\s+/g, '-')
        .substring(0, 50); // Limit title length

    return `${formattedDate}_${sanitizedTitle}`;
} 