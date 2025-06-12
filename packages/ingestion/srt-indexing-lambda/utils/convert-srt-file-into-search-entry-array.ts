import SrtParser2 from "srt-parser-2";
import { log } from '@browse-dot-show/logging';
import { SearchEntry } from '@browse-dot-show/types';

interface ConvertSrtFileIntoSearchEntryArrayProps {
    srtFileContent: string | null | undefined; // Allow null/undefined
    sequentialEpisodeId: number;
    episodePublishedUnixTimestamp: number; // Unix timestamp for sorting by episode date
}

// Structure for parsed SRT line
interface ParsedSrtLine {
    index: number;
    startTimeMs: number;
    endTimeMs: number;
    text: string;
}

// Regex to check for sentence ending punctuation
const sentenceEndRegex = /[.!?]$/;

// Minimum chunk duration in milliseconds
const MIN_CHUNK_DURATION_MS = 7000;

// Maximum chunk duration in milliseconds
const MAX_CHUNK_DURATION_MS = 15000;

export const convertSrtFileIntoSearchEntryArray = ({
    srtFileContent,
    sequentialEpisodeId,
    episodePublishedUnixTimestamp,
}: ConvertSrtFileIntoSearchEntryArrayProps): SearchEntry[] => {

    if (!srtFileContent || typeof srtFileContent !== 'string') {
        return [];
    }

    const trimmedContent = srtFileContent.trim();
    if (trimmedContent === '') {
        return [];
    }

    const parser = new SrtParser2();
    const srtEntriesFromLib = parser.fromSrt(trimmedContent);

    const parsedLines: ParsedSrtLine[] = srtEntriesFromLib.map(entry => {
        // The library provides startSeconds and endSeconds. Convert them to milliseconds.
        // It also might return id as a string or number, ensure it's a number for our interface.
        // The text from the library might contain newlines if the original SRT did;
        // ensure it's a single line space-separated string, similar to the old logic.
        const cleanedText = entry.text.replace(/\r?\n/g, ' ').trim();
        return {
            index: typeof entry.id === 'string' ? parseInt(entry.id, 10) : entry.id,
            startTimeMs: Math.round(entry.startSeconds * 1000),
            endTimeMs: Math.round(entry.endSeconds * 1000),
            text: cleanedText
        };
    }).filter(line => line.text); // Filter out lines with no text after cleaning

    if (parsedLines.length === 0) {
        return []; // No valid SRT blocks found
    }

    log.debug(`--- Starting Chunking ---`); // LOG: Start
    log.debug(`Total parsed lines: ${parsedLines.length}`);

    const searchEntries: SearchEntry[] = [];
    let currentChunkLines: ParsedSrtLine[] = [];
    let chunkStartTimeMs = 0;
    let chunkEndTimeMs = 0;
    let chunkCombinedText = '';

    for (let i = 0; i < parsedLines.length; i++) {
        const line = parsedLines[i];
        const isLastLineOverall = i === parsedLines.length - 1;

        log.trace(`\n[Loop Iteration i=${i}, Line Index=${line.index}]`); // LOG: Loop start

        if (currentChunkLines.length === 0) {
            chunkStartTimeMs = line.startTimeMs;
            log.trace(`  New Chunk Start: startTimeMs=${chunkStartTimeMs}`); // LOG: New chunk
        }

        currentChunkLines.push(line);
        chunkEndTimeMs = line.endTimeMs; // Update chunk end time
        chunkCombinedText = (chunkCombinedText ? chunkCombinedText + ' ' : '') + line.text; // Append text

        const actualChunkStartTimeForDuration = currentChunkLines.length > 0 ? currentChunkLines[0].startTimeMs : line.startTimeMs; // Fallback to current line if it's the first
        const currentDuration = chunkEndTimeMs - actualChunkStartTimeForDuration;
        log.trace(`  Added Line ${line.index}: text="${line.text}"`); // LOG: Line added
        log.trace(`  Current Chunk End Time: ${chunkEndTimeMs}`);
        log.trace(`  Current Chunk Duration: ${currentDuration}ms (Start: ${actualChunkStartTimeForDuration}, End: ${chunkEndTimeMs})`); // LOG: Duration

        let finalizeChunk = false;
        const durationMet = currentDuration >= MIN_CHUNK_DURATION_MS;
        const hasPunctuation = sentenceEndRegex.test(line.text);
        const maxDurationHit = currentDuration >= MAX_CHUNK_DURATION_MS;

        log.debug(`  Checking Conditions: durationMet=${durationMet}, hasPunctuation=${hasPunctuation}, maxDurationHit=${maxDurationHit}, isLastLineOverall=${isLastLineOverall}`); // LOG: Conditions

        if (isLastLineOverall) {
            log.debug(`    Is Last Line Overall - Forcing Finalize`); // LOG: Last line
            finalizeChunk = true;
        } else if (maxDurationHit) {
            log.debug(`    Max Duration MET (${currentDuration} >= ${MAX_CHUNK_DURATION_MS}) - Forcing Finalize`); // LOG: Max duration met
            finalizeChunk = true;
        } else if (durationMet) {
             log.debug(`    Min Duration MET (${currentDuration} >= ${MIN_CHUNK_DURATION_MS})`); // LOG: Duration met
            if (hasPunctuation) {
                log.debug(`    Punctuation FOUND in line ${line.index}`); // LOG: Punctuation found
                finalizeChunk = true;
            } else {
                log.debug(`    Punctuation NOT found in line ${line.index}, and Max Duration NOT met.`); // LOG: No punctuation
            }
        } else {
             log.debug(`    Min Duration NOT met (${currentDuration} < ${MIN_CHUNK_DURATION_MS})`); // LOG: Duration not met
        }

        if (finalizeChunk && currentChunkLines.length > 0) {
            log.debug(`  >>> FINALIZING CHUNK <<<`); // LOG: Finalizing
            log.debug(`    Final Chunk Start Time: ${chunkStartTimeMs}`);
            log.debug(`    Final Chunk End Time: ${chunkEndTimeMs}`);
            const actualChunkStartTime = currentChunkLines[0].startTimeMs;

            const uniqueId = `${sequentialEpisodeId}_${actualChunkStartTime}`;
            
            searchEntries.push({
                id: uniqueId,
                startTimeMs: actualChunkStartTime,
                endTimeMs: chunkEndTimeMs,
                text: chunkCombinedText.trim(),
                sequentialEpisodeIdAsString: sequentialEpisodeId.toString(),
                episodePublishedUnixTimestamp,
            });

            // Reset for next chunk
            currentChunkLines = [];
            chunkCombinedText = '';
            log.debug(`  >>> Chunk Finalized & State Reset (ID: ${uniqueId}) <<<`); // LOG: Reset
        } else {
            log.debug(`  --- Not Finalizing Chunk ---`); // LOG: Not finalizing
        }
    } // End for loop

    log.debug(`\n--- Chunking Complete ---`); // LOG: End
    log.debug(`Total search entries created: ${searchEntries.length}`);

    return searchEntries;
};
