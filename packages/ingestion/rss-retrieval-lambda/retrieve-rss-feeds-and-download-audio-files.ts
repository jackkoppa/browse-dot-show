import * as xml2js from 'xml2js';
import * as path from 'path';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { log } from '@browse-dot-show/logging';
import { fileExists, getFile, saveFile, listFiles, createDirectory } from '@browse-dot-show/s3';
import { getCurrentSiteRSSConfig, getCurrentSiteId } from '@browse-dot-show/config';
import { EpisodeManifest, EpisodeInManifest } from '@browse-dot-show/types';
import { getEpisodeManifestKey } from '@browse-dot-show/constants';

import { parsePubDate } from './utils/parse-pub-date.js';
import { getEpisodeFileKey } from './utils/get-episode-file-key.js';

log.info(`▶️ Starting retrieve-rss-feeds-and-download-audio-files, with logging level: ${log.getLevel()}`);

// Types
interface RssEpisode { // Renamed from Episode to avoid conflict with EpisodeInManifest
  title: string;
  pubDate: string;
  enclosure: { // Attributes are merged directly onto this object due to mergeAttrs: true
    url: string;
    type: string;
    length: string | number; // length might be parsed as a number by valueProcessors
  };
  guid: string;
  'itunes:summary'?: string; // For fetching episode summary
  summary?: string; // Fallback if itunes:summary is not present
  description?: string; // Another fallback for summary
  'content:encoded'?: string; // Yet another fallback, often HTML
  'itunes:duration'?: string; // For episode duration
}

// Constants - Define S3 paths
const RSS_DIR_PREFIX = 'rss/';
const AUDIO_DIR_PREFIX = 'audio/';
const EPISODE_MANIFEST_DIR_PREFIX = 'episode-manifest/';
const LAMBDA_CLIENT = new LambdaClient({});
const CLOUDFRONT_CLIENT = new CloudFrontClient({});
const WHISPER_LAMBDA_NAME = 'process-new-audio-files-via-whisper';

// Helper function to detect if we're running in AWS Lambda environment
function isRunningInLambda(): boolean {
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

// Helper to get episode audio filename (e.g., 2020-01-23_The-Transfer-Window.mp3)
function getEpisodeAudioFilename(fileKey: string): string {
  return `${fileKey}.mp3`;
}


// Fetch RSS feed
async function fetchRSSFeed(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    log.error(`Error fetching RSS feed from ${url}:`, error);
    throw error;
  }
}

// Parse RSS XML to JSON
async function parseRSSFeed(xmlContent: string): Promise<any> {
  const parser = new xml2js.Parser({ 
    explicitArray: false,
    // Add explicit charkey and mergeAttrs to handle cases like <itunes:summary>
    // and potentially other tags with attributes or mixed content.
    charkey: '_', 
    mergeAttrs: true,
    // Attempt to parse duration correctly
    valueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
    attrValueProcessors: [xml2js.processors.parseNumbers, xml2js.processors.parseBooleans],
 });
  
  try {
    return await parser.parseStringPromise(xmlContent);
  } catch (error) {
    log.error('Error parsing RSS XML:', error);
    throw error;
  }
}

// Save RSS feed to file
async function saveRSSFeedToS3(
  xmlContent: string, 
  podcastId: string,
  feedFile: string,
): Promise<void> {
  const filePath = path.join(RSS_DIR_PREFIX, feedFile);
  
  try {
    await saveFile(filePath, xmlContent);
    log.debug(`RSS feed for ${podcastId} saved to ${filePath}`);
  } catch (error) {
    log.error(`Error saving RSS feed for ${podcastId}:`, error);
    throw error;
  }
}

// Read or create Episode Manifest
async function getOrCreateEpisodeManifest(): Promise<EpisodeManifest> {
  const episodeManifestKey = getEpisodeManifestKey();
  
  try {
    if (await fileExists(episodeManifestKey)) {
      const manifestBuffer = await getFile(episodeManifestKey);
      return JSON.parse(manifestBuffer.toString('utf-8')) as EpisodeManifest;
    } else {
      log.info(`Episode manifest not found at ${episodeManifestKey}, creating a new one.`);
      await createDirectory(EPISODE_MANIFEST_DIR_PREFIX); // Ensure directory exists
      const newManifest: EpisodeManifest = {
        lastUpdated: new Date().toISOString(),
        episodes: [],
      };
      await saveFile(episodeManifestKey, JSON.stringify(newManifest, null, 2));
      return newManifest;
    }
  } catch (error) {
    log.error('Error reading or creating episode manifest:', error);
    throw error;
  }
}

// Save Episode Manifest
async function saveEpisodeManifest(manifest: EpisodeManifest): Promise<void> {
  const episodeManifestKey = getEpisodeManifestKey();
  
  try {
    manifest.lastUpdated = new Date().toISOString();
    await saveFile(episodeManifestKey, JSON.stringify(manifest, null, 2));
    log.debug(`Episode manifest saved to ${episodeManifestKey}`);
  } catch (error) {
    log.error('Error saving episode manifest:', error);
    throw error;
  }
}

// Helper to parse itunes:duration (e.g., "HH:MM:SS", "MM:SS", or total seconds)
function parseDuration(durationStr?: string): number | undefined {
  if (!durationStr) return undefined;
  if (/^\d+$/.test(durationStr)) { // Check if it's just seconds
    return parseInt(durationStr, 10);
  }
  const parts = durationStr.split(':').map(Number);
  let duration = 0;
  if (parts.length === 3) { // HH:MM:SS
    duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) { // MM:SS
    duration = parts[0] * 60 + parts[1];
  } else if (parts.length === 1 && !isNaN(parts[0])) { // Seconds (if not caught by regex above)
     duration = parts[0];
  } else {
    log.warn(`Could not parse duration: ${durationStr}`);
    return undefined;
  }
  return isNaN(duration) ? undefined : duration;
}

// Extract summary from various possible fields in RSS item
function getEpisodeSummary(rssItem: RssEpisode): string {
    // Order of preference for summary
    if (rssItem['itunes:summary'] && typeof rssItem['itunes:summary'] === 'string') {
        return rssItem['itunes:summary'].trim();
    }
    if (rssItem.summary && typeof rssItem.summary === 'string') {
        return rssItem.summary.trim();
    }
    // xml2js parser with charkey: '_" might put text content in item.description._
    if (rssItem.description) {
      if (typeof rssItem.description === 'string') return rssItem.description.trim();
      // @ts-ignore TODO: Type this better if description can be an object
      if (typeof rssItem.description._ === 'string') return rssItem.description._.trim();
    }
    if (rssItem['content:encoded'] && typeof rssItem['content:encoded'] === 'string') {
        // This might contain HTML, for now, just return it.
        // Consider a simple HTML to text stripping if needed.
        return rssItem['content:encoded'].trim();
    }
    return ''; // Default to empty string if no summary found
}


// Identify new episodes from RSS and add them to the manifest
async function updateManifestWithNewEpisodes(
  parsedFeed: any, 
  podcastConfig: any,
  episodeManifest: EpisodeManifest
): Promise<{ newEpisodesInManifest: EpisodeInManifest[], existingEpisodesInManifest: EpisodeInManifest[] }> {
  const rssEpisodes: RssEpisode[] = parsedFeed.rss.channel.item || [];
  const podcastId = podcastConfig.id;
  let newEpisodesInManifest: EpisodeInManifest[] = [];
  let existingEpisodesInManifest: EpisodeInManifest[] = episodeManifest.episodes.filter((ep: EpisodeInManifest) => ep.podcastId === podcastId);

  const existingEpisodeIdentifiers = new Set(
    episodeManifest.episodes.map((ep: EpisodeInManifest) => ep.originalAudioURL)
  );
  episodeManifest.episodes.forEach((ep: EpisodeInManifest) => ep.fileKey && existingEpisodeIdentifiers.add(ep.fileKey));

  // sequentialId will be assigned globally later. No longer calculate maxSequentialId here.

  for (const rssEpisode of rssEpisodes) {
    if (!rssEpisode.enclosure || typeof rssEpisode.enclosure.url !== 'string' || !rssEpisode.enclosure.url) {
      log.warn(`Skipping episode "${rssEpisode.title || 'N/A'}" due to missing or invalid enclosure/URL. Enclosure data: ${JSON.stringify(rssEpisode.enclosure)}`);
      continue;
    }
    
    const originalAudioURL = rssEpisode.enclosure.url;
    const episodeTitle = rssEpisode.title || 'Untitled Episode';
    const pubDateString = rssEpisode.pubDate;

    if (!pubDateString) {
      log.warn(`Skipping episode "${episodeTitle}" (URL: ${originalAudioURL}) due to missing publication date (pubDate).`);
      continue;
    }
    
    let parsedPublishedDate: Date;
    try {
        parsedPublishedDate = parsePubDate(pubDateString);
        if (isNaN(parsedPublishedDate.getTime())) {
            throw new Error('Parsed date is invalid');
        }
    } catch (e: any) {
        log.warn(`Skipping episode "${episodeTitle}" (URL: ${originalAudioURL}) due to invalid publication date: "${pubDateString}". Error: ${e.message}`);
        continue;
    }

    if (existingEpisodeIdentifiers.has(originalAudioURL)) {
      continue; 
    }
    
    const potentialFileKey = getEpisodeFileKey(episodeTitle, pubDateString);
    if (existingEpisodeIdentifiers.has(potentialFileKey)) {
        continue;
    }

    // sequentialId is set to 0 as a placeholder. It will be correctly assigned after global sort.
    const fileKey = potentialFileKey; // Use the already generated potentialFileKey
    const summary = getEpisodeSummary(rssEpisode);
    const durationInSeconds = parseDuration(rssEpisode['itunes:duration']);

    const newEpisodeToAdd: EpisodeInManifest = {
      sequentialId: 0, // Placeholder - will be set globally later
      podcastId,
      title: episodeTitle,
      fileKey,
      originalAudioURL,
      summary,
      durationInSeconds,
      publishedAt: parsedPublishedDate.toISOString(),
      hasCompletedLLMAnnotations: false,
      llmAnnotations: {},
    };

    episodeManifest.episodes.push(newEpisodeToAdd);
    newEpisodesInManifest.push(newEpisodeToAdd);
    existingEpisodeIdentifiers.add(originalAudioURL);
    existingEpisodeIdentifiers.add(fileKey);

    log.info(`🆕 Identified for manifest: ${podcastId} - ${episodeTitle}`);
  }
  
  // No longer sorting by sequentialId here, as it's a placeholder.
  // Global sort by publishedAt will happen in the main handler.
  
  return { newEpisodesInManifest, existingEpisodesInManifest };
}


// Determine which episodes need their audio downloaded
async function identifyEpisodesToDownload(
  episodesFromManifest: EpisodeInManifest[],
  podcastId: string
): Promise<EpisodeInManifest[]> {
  log.info(`Identifying episodes to download for ${podcastId}`);
  const podcastAudioDirS3 = path.join(AUDIO_DIR_PREFIX, podcastId);
  await createDirectory(podcastAudioDirS3); // Ensure podcast-specific audio directory exists in S3

  let filesToDownload: EpisodeInManifest[] = [];
  
  try {
    const existingAudioFilesS3 = (await listFiles(podcastAudioDirS3)).map(filePath => path.basename(filePath));
    // Normalize filenames from S3 to NFC before adding to the set
    const existingAudioFilenamesSet = new Set(existingAudioFilesS3);

    for (const episode of episodesFromManifest) {
      if (episode.podcastId !== podcastId) continue; 

      const expectedAudioFilename = getEpisodeAudioFilename(episode.fileKey);

      if (!existingAudioFilenamesSet.has(expectedAudioFilename)) {
        filesToDownload.push(episode);
        log.info(`Queueing for download: "${episode.title}" (File: ${expectedAudioFilename}) as it's not in S3 set.`);
      } else {
        // log.debug(`Audio for "${episode.title}" (${normalizedExpectedAudioFilename}) already exists in S3. Skipping download.`);
      }
    }
  } catch (error) {
      log.error(`Error listing existing audio files for ${podcastId} in S3 bucket:`, error);
      // Decide if we should throw or return empty / try to proceed
      // For now, if we can't list, assume no files exist and try to download all relevant.
      // This could be risky if listFiles fails intermittently.
      // A safer approach might be to skip downloads for this podcast if listing fails.
      log.warn(`Could not list existing S3 audio files for ${podcastId}. Assuming all relevant manifest episodes need downloading.`);
      return episodesFromManifest.filter((ep: EpisodeInManifest) => ep.podcastId === podcastId);
  }
  
  return filesToDownload;
}


// Download episode audio file
async function downloadEpisodeAudio(episode: EpisodeInManifest): Promise<string> {
  const url = episode.originalAudioURL;
  const audioFilename = getEpisodeAudioFilename(episode.fileKey);
  const podcastAudioKey = path.join(AUDIO_DIR_PREFIX, episode.podcastId, audioFilename);
  
  try {
    log.debug(`Downloading audio for episode: ${episode.title} (key: ${episode.fileKey}) from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    await saveFile(podcastAudioKey, Buffer.from(arrayBuffer));
    log.info(`✅ Successfully downloaded: ${audioFilename} to ${podcastAudioKey}`);
    
    return podcastAudioKey;
  } catch (error) {
    log.error(`❌ Error downloading episode ${episode.title} (key: ${episode.fileKey}):`, error);
    throw error; // Re-throw to be caught by the caller
  }
}

// Trigger process-new-audio-files-via-whisper
async function triggerTranscriptionLambda(): Promise<void> {
  try {
    const command = new InvokeCommand({
      FunctionName: WHISPER_LAMBDA_NAME,
      InvocationType: 'Event', // Asynchronous invocation
    });
    await LAMBDA_CLIENT.send(command);
    log.info(`Successfully invoked ${WHISPER_LAMBDA_NAME}`);
  } catch (error) {
    log.error(`Error invoking ${WHISPER_LAMBDA_NAME}:`, error);
    // Decide if this error should be re-thrown or handled (e.g., retry logic)
  }
}

// Function to invalidate CloudFront cache for the episode manifest
async function invalidateCloudFrontCacheForManifest(): Promise<void> {
  const cloudfrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!cloudfrontDistributionId) {
    log.warn('CLOUDFRONT_DISTRIBUTION_ID environment variable not set. Skipping CloudFront cache invalidation.');
    return;
  }

  // The path to invalidate must start with a leading '/'
  const episodeManifestKey = getEpisodeManifestKey();
  const pathKey = episodeManifestKey.startsWith('/') ? episodeManifestKey : `/${episodeManifestKey}`;

  log.info(`Invalidating CloudFront cache for: ${pathKey} in distribution: ${cloudfrontDistributionId}`);

  try {
    const command = new CreateInvalidationCommand({
      DistributionId: cloudfrontDistributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: 1,
          Items: [pathKey],
        },
        CallerReference: `manifest-update-${Date.now()}`,
      },
    });
    await CLOUDFRONT_CLIENT.send(command);
    log.info(`CloudFront invalidation request sent for ${pathKey}.`);
  } catch (error) {
    log.error(`Error creating CloudFront invalidation for ${pathKey}:`, error);
    // Depending on the severity, you might want to re-throw or just log
  }
}

// Main handler function
export async function handler(): Promise<void> {
  log.info(`🟢 Starting retrieve-rss-feeds-and-download-audio-files > handler, with logging level: ${log.getLevel()}`);
  const lambdaStartTime = Date.now();
  log.info('⏱️  Starting at', new Date().toISOString());

  try {
    // Ensure base directories exist (S3 operations are generally idempotent for dir creation)
    await createDirectory(RSS_DIR_PREFIX);
    await createDirectory(AUDIO_DIR_PREFIX);
    await createDirectory(EPISODE_MANIFEST_DIR_PREFIX); // For the manifest file
    
    const episodeManifest = await getOrCreateEpisodeManifest();
    
    // Get site-aware RSS configuration
    log.info(`🌐 Loading RSS configuration for site: ${getCurrentSiteId()}`);
    const siteRSSConfig = getCurrentSiteRSSConfig();
    const activeFeeds = Object.values(siteRSSConfig).filter(feed => feed.status === 'active');
    
    log.debug(`Found ${activeFeeds.length} active feeds to process based on version-controlled config.`);
    
    let allNewlyDownloadedS3AudioKeys: string[] = [];
    const podcastStats = new Map<string, { newManifestEntries: number, newDownloads: number }>();
    let totalNewEntriesIdentifiedThisRun = 0;

    for (const podcastConfig of activeFeeds) {
      const podcastId = podcastConfig.id;
      log.info(`
▶️ Processing feed: ${podcastConfig.title} (ID: ${podcastId})`);
      podcastStats.set(podcastId, { newManifestEntries: 0, newDownloads: 0 });
      
      try {
        // 1. Fetch RSS feed
        const xmlContent = await fetchRSSFeed(podcastConfig.url);
        
        // 2. Save RSS feed to S3 (for archival/debugging)
        await saveRSSFeedToS3(xmlContent, podcastId, podcastConfig.rssFeedFile);
        
        // 3. Parse RSS feed
        const parsedFeed = await parseRSSFeed(xmlContent);
        if (!parsedFeed || !parsedFeed.rss || !parsedFeed.rss.channel) {
            log.error(`❌ Failed to parse RSS feed for ${podcastConfig.title} or structure is invalid. Skipping.`);
            continue;
        }
        
        // 4. Update Episode Manifest with new episodes from this feed
        // This function now modifies episodeManifest directly
        const { newEpisodesInManifest } = await updateManifestWithNewEpisodes(parsedFeed, podcastConfig, episodeManifest);
        
        if (newEpisodesInManifest.length > 0) {
          log.info(`Identified ${newEpisodesInManifest.length} new episodes from ${podcastConfig.title} to add to manifest.`);
          podcastStats.get(podcastId)!.newManifestEntries = newEpisodesInManifest.length;
          totalNewEntriesIdentifiedThisRun += newEpisodesInManifest.length;
          // Save manifest after each podcast feed is processed and new episodes are added (with placeholder sequentialId)
          await saveEpisodeManifest(episodeManifest); 
        } else {
          log.info(`No new episodes found from ${podcastConfig.title} to add to manifest.`);
        }

        // 5. Identify which episodes (from the manifest for this podcast) need audio download
        // We consider all episodes for this podcast in the manifest, not just newly added ones,
        // in case a previous download failed or files were manually removed.
        const episodesForThisPodcastInManifest = episodeManifest.episodes.filter((ep: EpisodeInManifest) => ep.podcastId === podcastId);
        const episodesToDownloadAudioFor = await identifyEpisodesToDownload(episodesForThisPodcastInManifest, podcastId);

        if (episodesToDownloadAudioFor.length === 0) {
          log.info(`No audio files to download for ${podcastConfig.title} based on current manifest and S3 audio files.`);
        } else {
          log.info(`Identified ${episodesToDownloadAudioFor.length} episodes for ${podcastConfig.title} requiring audio download.`);
        }
        
        // 6. Download audio for each identified episode
        let successfullyDownloadedForThisPodcast = 0;
        for (const episodeToDownload of episodesToDownloadAudioFor) {
          try {
            // Ensure episodeToDownload has a valid fileKey, which it should if it came from manifest
            if (!episodeToDownload.fileKey) {
                log.warn(`Skipping download for episode titled "${episodeToDownload.title}" as it's missing a fileKey in the manifest.`);
                continue;
            }
            const downloadedAudioS3Key = await downloadEpisodeAudio(episodeToDownload);
            allNewlyDownloadedS3AudioKeys.push(downloadedAudioS3Key);
            successfullyDownloadedForThisPodcast++;
          } catch (downloadError) {
            log.error(`❌ Failed to download episode "${episodeToDownload.title}" for ${podcastConfig.title}:`, downloadError);
          }
        }
        podcastStats.get(podcastId)!.newDownloads = successfullyDownloadedForThisPodcast;

      } catch (feedProcessingError) {
        log.error(`❌ Error processing feed ${podcastConfig.title}:`, feedProcessingError);
        // Continue to next feed rather than stopping the whole Lambda
      }
    }
    
    log.info('🏁 Finished processing all feeds. Now finalizing episode manifest...');

    // Globally sort all episodes in the manifest by publication date (oldest first)
    // and re-assign sequential IDs.
    log.info('Finalizing episode manifest: Sorting all episodes by publication date and re-assigning sequential IDs...');
    episodeManifest.episodes.sort((a, b) => {
      // publishedAt should be a valid ISO string from prior checks.
      // If not, parsePubDate might return an invalid Date, getTime() would be NaN.
      const dateA = a.publishedAt ? parsePubDate(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? parsePubDate(b.publishedAt).getTime() : 0;

      // Handle potential NaN or zero dates (e.g. put them at the end or beginning based on preference)
      // Here, episodes with invalid/missing dates are pushed towards the end.
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1; // a is invalid, b is valid or invalid; if b is valid, a comes after
      if (isNaN(dateB)) return -1; // b is invalid, a is valid; a comes before

      if (dateA === 0 && dateB === 0) return 0;
      if (dateA === 0) return 1; 
      if (dateB === 0) return -1;
      
      return dateA - dateB;
    });

    let changedIds = 0;
    episodeManifest.episodes.forEach((episode, index) => {
      const newSequentialId = index + 1;
      if (episode.sequentialId !== newSequentialId) {
        changedIds++;
      }
      episode.sequentialId = newSequentialId;
    });

    if (changedIds > 0 || totalNewEntriesIdentifiedThisRun > 0) {
        log.info(`Sequential IDs re-assigned for ${changedIds} episodes. Total episodes: ${episodeManifest.episodes.length}. New entries this run: ${totalNewEntriesIdentifiedThisRun}.`);
        await saveEpisodeManifest(episodeManifest); // Perform the final save
        log.info('✅ Episode manifest has been finalized with chronological sequential IDs.');
    } else {
        log.info('No new entries and no sequential ID changes required. Updating lastUpdated timestamp.');
        await saveEpisodeManifest(episodeManifest); // Always save to update lastUpdated
        log.info('✅ Episode manifest lastUpdated timestamp has been refreshed.');
    }
    
    
    if (allNewlyDownloadedS3AudioKeys.length > 0) {
      if (isRunningInLambda()) {
        log.info(`New audio files were downloaded. Triggering transcription Lambda so that ${allNewlyDownloadedS3AudioKeys.join(', ')} audio file(s) are transcribed.`);
        await triggerTranscriptionLambda();

        // Invalidate CloudFront cache for the manifest if new audio files were downloaded
        log.info('New audio files were downloaded. Triggering CloudFront cache invalidation for episode manifest.');
        await invalidateCloudFrontCacheForManifest();
      } else {
        log.info(`New audio files were downloaded, but skipping transcription Lambda and CloudFront invalidation (running locally).`);
      }
    } else {
      log.info('No new audio files downloaded. Skipping CloudFront cache invalidation for episode manifest.');
    }
    
    const totalLambdaTime = (Date.now() - lambdaStartTime) / 1000;
    
    log.info('\n📊 RSS Feed Processing Summary:');  
    log.info(`⏱️   Total Duration: ${totalLambdaTime.toFixed(2)} seconds`);
    log.info(`📡 Active Feeds Processed: ${activeFeeds.length}`);
    
    let totalNewManifestEntries = 0;
    let totalNewDownloads = 0;
    podcastStats.forEach(stats => {
        totalNewManifestEntries += stats.newManifestEntries;
        totalNewDownloads += stats.newDownloads;
    });

    log.info(`✉️   New Entries Added to Manifest: ${totalNewManifestEntries}`);
    log.info(`🎧 New Audio Files Downloaded: ${totalNewDownloads}`);
    
    if (totalNewManifestEntries > 0 || totalNewDownloads > 0) {
      log.info('\n📂 Breakdown by Podcast:');
      for (const [podcastName, counts] of podcastStats) {
        // Find the title from site RSS config using podcastName (which is the ID)
        const podcastTitle = siteRSSConfig[podcastName]?.title || podcastName;
        log.info(`\n  Podcast: ${podcastTitle}`);
        log.info(`    ✉️  New Manifest Entries: ${counts.newManifestEntries}`);
        log.info(`    📥 New Audio Downloads: ${counts.newDownloads}`);
      }
    }
    
    log.info('\n✨ RSS feed processing and manifest update completed successfully');
  } catch (error) {
    log.error('❌ Fatal error in RSS feed processing handler:', error);
    // Depending on the environment, might want to re-throw or handle differently
    // For a Lambda, re-throwing will mark the invocation as failed.
    throw error;
  }
}

// For local development, call the handler directly
// ESM check:
const scriptPath = path.resolve(process.argv[1]);
const scriptUrl = import.meta.url;

if (scriptUrl.startsWith('file://') && scriptUrl.endsWith(scriptPath)) {
  log.info('🚀 Starting podcast RSS feed retrieval & manifest update (running via pnpm / direct script execution)... ');
  handler()
    .then(() => log.info('✅ Processing completed successfully.'))
    .catch(error => {
      log.error('❌ Processing failed with an error:', error);
      process.exit(1);
    });
}