# Complete Transcriptions Step - Implementation Plan

## Overview
Implement the `executeCompleteTranscriptionsStep` function with 4 phases: download estimation, full download, transcription planning, and final indexing.

## Phase A: Download All Episodes
1. **Parse RSS file** to get total episode count
2. **Calculate download estimate**: `(totalEpisodes / 2) * episodesAudioFileDownloadTimeInSeconds`
3. **Prompt user** with rounded estimate (nearest 10 seconds)
4. **Execute**: `NODE_OPTIONS=--max-old-space-size=9728 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=<SITE_ID> --lambda=rss-retrieval --env=local`

## Phase B: Transcription Planning
1. **Scan downloaded audio files** to get total duration
2. **Calculate transcription estimate**: `(totalAudioDuration / episodesDurationInSeconds) * episodesTranscriptionTimeInSeconds`
3. **Present user options**:
   - Option 1: Single terminal (sequential)
   - Option 2: Multiple terminals (parallel, 2-3 for 16GB+ RAM)
4. **Highlight total time estimate** prominently

## Phase C: Execute Transcriptions
- **Option 1**: Run `NODE_OPTIONS=--max-old-space-size=9728 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=<SITE_ID> --lambda=process-audio --env=local`
- **Option 2**: Provide command for user to run in multiple terminals, wait for completion

## Phase D: Final Indexing
1. **Validate transcription completion**: Check audio files count == transcript files count == RSS episodes count
2. **Prompt user** for final indexing step ("a few minutes")
3. **Execute**: `NODE_OPTIONS=--max-old-space-size=9728 pnpm tsx scripts/trigger-individual-ingestion-lambda.ts --sites=<SITE_ID> --lambda=srt-indexing --env=local`
4. **Validate final results**: Check search index and search entries exist and match counts

## Helper Functions Needed
- `parseRSSFileForEpisodeCount(siteId: string): Promise<number>`
- `calculateTotalAudioDuration(siteId: string): Promise<number>`
- `validateTranscriptionCompletion(siteId: string): Promise<boolean>`
- `validateFinalIndexing(siteId: string): Promise<boolean>`
- `formatTimeEstimate(seconds: number): string`

## Key Messages
- Emphasize this is the longest phase (~20 hours for ~150 hours of audio)
- Machine can run in background or be left alone
- Multiple terminals significantly speed up transcription on capable hardware