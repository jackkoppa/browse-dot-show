import { useState, useEffect, useRef } from 'react'
import { EpisodeInManifest, SearchEntry } from '@browse-dot-show/types'
import { S3_HOSTED_FILES_BASE_URL } from '../constants'
import { formatMillisecondsToMMSS } from '@/utils/time'
import { Badge } from '@browse-dot-show/ui'
import { encodeFileKey } from '@/utils/encode'

async function getFullEpisodeSearchEntryFile(fileKey: string, podcastId: string): Promise<SearchEntry[]> {
    const response = await fetch(`${S3_HOSTED_FILES_BASE_URL}search-entries/${podcastId}/${encodeFileKey(fileKey)}.json`);
    const data = await response.json();
    return data;
}

/** 
 * Buffer to allow for matching current audio playback time to a search entry
 * required so that when clicking on a search entry, the correct entry is highlighted (rather than previous one)
 */
const ENTRY_MATCHING_THRESHOLD_MS = 500

export default function FullEpisodeTranscript({
    episodeData,
    startTimeMs,
    currentPlayingTimeMs,
    onEntryClick
}: {
    episodeData: EpisodeInManifest;
    startTimeMs: number | null;
    currentPlayingTimeMs: number | null;
    onEntryClick: (entry: SearchEntry) => void;
}) {
    const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [urlBasedTargetEntryId, setUrlBasedTargetEntryId] = useState<string | null>(null);
    const [currentPlayingEntryId, setCurrentPlayingEntryId] = useState<string | null>(null);
    const urlBasedEntryRef = useRef<HTMLDivElement>(null);
    const currentPlayingEntryRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getFullEpisodeSearchEntryFile(episodeData.fileKey, episodeData.podcastId).then(setSearchEntries);
        setIsLoading(false);
    }, [episodeData]);

    // Find the URL-based target entry to highlight and scroll to (only on initial load)
    useEffect(() => {
        if (!isLoading && searchEntries.length > 0 && startTimeMs && !urlBasedTargetEntryId) {
            // Find the first entry with start time >= the requested start time
            const targetEntry = searchEntries.find(entry =>
                entry.startTimeMs >= (startTimeMs - ENTRY_MATCHING_THRESHOLD_MS)
            );

            if (targetEntry) {
                setUrlBasedTargetEntryId(targetEntry.id);
            } else {
                // If no entry found with start time >= requested time, use the last entry
                const lastEntry = searchEntries[searchEntries.length - 1];
                setUrlBasedTargetEntryId(lastEntry?.id || null);
            }
        }
    }, [isLoading, searchEntries, startTimeMs, urlBasedTargetEntryId]);

    // Find the currently playing entry based on audio playback time
    useEffect(() => {
        if (!isLoading && searchEntries.length > 0 && currentPlayingTimeMs !== null) {
            // Find the entry that contains the current playback time
            const playingEntry = searchEntries.find(entry =>
                currentPlayingTimeMs >= (entry.startTimeMs - ENTRY_MATCHING_THRESHOLD_MS) && currentPlayingTimeMs <= (entry.endTimeMs - ENTRY_MATCHING_THRESHOLD_MS)
            );

            if (playingEntry && playingEntry.id !== currentPlayingEntryId) {
                setCurrentPlayingEntryId(playingEntry.id);
            }
        }
    }, [isLoading, searchEntries, currentPlayingTimeMs, currentPlayingEntryId]);

    // Scroll to the URL-based target entry when it's identified (initial load only)
    useEffect(() => {
        if (!isLoading && searchEntries.length > 0 && urlBasedTargetEntryId && urlBasedEntryRef.current) {
            urlBasedEntryRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }, [isLoading, searchEntries, urlBasedTargetEntryId]);

    // Scroll to the currently playing entry when it changes (during playback)
    useEffect(() => {
        if (!isLoading && searchEntries.length > 0 && currentPlayingEntryId && currentPlayingEntryRef.current) {
            // Only scroll if the currently playing entry is different from the URL-based target
            if (currentPlayingEntryId !== urlBasedTargetEntryId) {
                currentPlayingEntryRef.current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [isLoading, searchEntries, currentPlayingEntryId, urlBasedTargetEntryId]);

    function isUrlBasedTarget(entry: SearchEntry) {
        return urlBasedTargetEntryId === entry.id;
    }

    function isCurrentlyPlaying(entry: SearchEntry) {
        return currentPlayingEntryId === entry.id;
    }

    function getEntryClassName(entry: SearchEntry) {
        const baseClass = 'py-2 px-4';

        if (isUrlBasedTarget(entry)) {
            return baseClass + ' bg-yellow-100 border-l-4 border-yellow-500 font-bold';
        } else if (isCurrentlyPlaying(entry)) {
            return baseClass + ' bg-blue-100 border-l-4 border-blue-500 font-semibold';
        } else {
            return baseClass + ' text-muted-foreground hover:bg-muted cursor-pointer';
        }
    }

    function getBadgeClassName(entry: SearchEntry) {
        const baseClass = 'my-1';
        if (isUrlBasedTarget(entry) || isCurrentlyPlaying(entry)) {
            return baseClass + ' dark:text-background';
        }
        return baseClass;
    }


    function getEntryRef(entry: SearchEntry) {
        if (isCurrentlyPlaying(entry)) {
            return currentPlayingEntryRef;
        } else if (isUrlBasedTarget(entry)) {
            return urlBasedEntryRef;
        }
        return null;
    }

    return (
        <div>
            {isLoading && null}
            {!isLoading && searchEntries.length === 0 && <div className="p-4">Episode transcript not available. Please try refreshing the page.</div>}
            {!isLoading && searchEntries.length > 0 && (
                <div>
                    {searchEntries.map((entry) => (
                        <div
                            key={entry.id}
                            ref={getEntryRef(entry)}
                            className={getEntryClassName(entry)}
                            onClick={() => onEntryClick(entry)}
                        >
                            <Badge variant="outline" className={getBadgeClassName(entry)}><em>{formatMillisecondsToMMSS(entry.startTimeMs)} - {formatMillisecondsToMMSS(entry.endTimeMs)}</em></Badge>
                            <p className="text-sm">{entry.text}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}